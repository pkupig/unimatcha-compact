import SwiftUI

// MARK: - ConversationView (h5-chat.md §1.3, §2.2–§2.14; PLAN §C.4, overlay id `chat`) — WP-07
//
// Full-page overlay (fade, edge swipe-back). Layers, bottom-up:
//   wallpaper   the viewer's own `chatBackground`, `blur(9px) brightness(.93)`, bleeding 30 pt
//               past every edge; absent when the session has none
//   header      `ChatHeaderView` (64 + safe-top)
//   stream      the render window as time separators / nudge lines / bubbles, `px-4`; scrolling to
//               the top prepends the previous 30 from memory while keeping the anchor message put
//   composer    `ChatComposerView`
// Scroll bookkeeping feeds the view model: the distance from the bottom decides whether an arriving
// batch auto-scrolls (H5's 120 pt slack), and crossing the 10 pt top threshold prepends.

struct ConversationView: View {
    @ObservedObject var vm: ChatViewModel
    @ObservedObject private var session = SessionStore.shared
    @Environment(\.overlaySafeInsets) private var envInsets

    private static let bottomAnchorId = "chat-bottom-anchor"

    /// Edge-trigger for the prepend (so sitting at the top does not prepend every frame).
    @State private var wasBelowTopThreshold = true
    /// Height of the message ScrollView itself. The overlay height handed to `stream` overstates it
    /// by the header (64 + safe-top) plus the composer, and `distanceFromBottom` is derived from it.
    @State private var viewportHeight: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            let insets = OverlayChrome.resolvedInsets(envInsets)
            ZStack(alignment: .top) {
                wallpaper
                VStack(spacing: 0) {
                    ChatHeaderView(vm: vm, safeTop: insets.top) {
                        ChatViewModel.dismiss()
                    }
                    stream(width: geo.size.width, height: geo.size.height)
                    ChatComposerView(vm: vm)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .background(Theme.C.surface.ignoresSafeArea())
        .sheet(isPresented: $vm.wallpaperPickerRequested) {
            PhotoPicker(limit: 1) { picked in
                vm.wallpaperPickerRequested = false
                if let p = picked.first { vm.setWallpaper(p) }
            } onCancel: {
                vm.wallpaperPickerRequested = false
            }
            .ignoresSafeArea()
        }
    }

    // MARK: Wallpaper

    @ViewBuilder
    private var wallpaper: some View {
        if let url = vm.context.chatBackground, SafeURL.isSafe(url) {
            RemoteImage(url: url, contentMode: .fill)
                .blur(radius: 9)
                .brightness(-0.07)          // CSS brightness(.93)
                .padding(-30)               // bleeds 30 pt past every edge
                .ignoresSafeArea()
                .allowsHitTesting(false)
        }
    }

    // MARK: Message stream

    private func stream(width: CGFloat, height: CGFloat) -> some View {
        let rowWidth = max(80, width - 2 * Theme.Space.chat)
        return ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    if vm.stream.isEmpty {
                        emptyOrError
                    } else {
                        ForEach(vm.stream) { item in
                            row(item, rowWidth: rowWidth)
                                .id(item.id)
                        }
                    }
                    Color.clear
                        .frame(height: 1)
                        .id(ConversationView.bottomAnchorId)
                }
                .padding(.horizontal, Theme.Space.chat)
                .padding(.vertical, 16)
                .background(
                    GeometryReader { g in
                        Color.clear.preference(
                            key: ChatScrollMetricsKey.self,
                            value: ChatScrollMetrics(top: -g.frame(in: .named(ConversationView.scrollSpace)).minY,
                                                     contentHeight: g.size.height))
                    }
                )
            }
            .coordinateSpace(name: ConversationView.scrollSpace)
            // Measure the scroll view rather than trusting the overlay height, otherwise the
            // "within 120 pt of the bottom" auto-scroll rule (h5-chat §2.7) behaves like ~295 pt
            // and yanks the stream down while the user is reading back through history.
            .background(
                GeometryReader { g in
                    Color.clear.preference(key: ChatViewportHeightKey.self, value: g.size.height)
                }
            )
            .onPreferenceChange(ChatViewportHeightKey.self) { h in
                if h > 0, abs(h - viewportHeight) > 0.5 { viewportHeight = h }
            }
            .onPreferenceChange(ChatScrollMetricsKey.self) { m in
                handleScroll(m, viewportHeight: viewportHeight > 0 ? viewportHeight : height)
            }
            .onChange(of: vm.scrollToBottomToken) { _ in
                // Once now and once after the next layout pass: rows appended in the same update
                // are not measured yet when the change fires.
                jump(proxy, to: ConversationView.bottomAnchorId, anchor: .bottom)
                DispatchQueue.main.async {
                    jump(proxy, to: ConversationView.bottomAnchorId, anchor: .bottom)
                }
            }
            .onChange(of: vm.prependAnchorId) { anchor in
                guard let anchor = anchor else { return }
                jump(proxy, to: anchor, anchor: .top)
                vm.prependAnchorId = nil
                wasBelowTopThreshold = true
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private static let scrollSpace = "chat-stream"

    /// Non-animated jump (the H5 sets `scrollTop` directly).
    private func jump(_ proxy: ScrollViewProxy, to id: String, anchor: UnitPoint) {
        var tx = Transaction()
        tx.disablesAnimations = true
        withTransaction(tx) {
            proxy.scrollTo(id, anchor: anchor)
        }
    }

    @ViewBuilder
    private func row(_ item: ChatStreamItem, rowWidth: CGFloat) -> some View {
        switch item {
        case .separator(_, let date):
            ChatTimeSeparator(date: date)
        case .message(let m):
            if m.isNudge {
                NudgeLineView(text: m.content)
            } else {
                MessageBubbleView(
                    message: m,
                    mine: m.isMine(session.userId),
                    rowWidth: rowWidth,
                    partnerAvatarUrl: vm.context.partnerAvatarUrl,
                    partnerName: vm.context.partnerName,
                    myAvatarUrl: session.currentUser?.profile?.avatarUrl,
                    myName: session.currentUser?.profile?.nickname,
                    onPartnerAvatarTap: { rect in
                        ChatAvatarMenu.present(vm: vm, anchor: rect)
                    },
                    onImageTap: { url in
                        AppActions.shared.openImageViewer(url)
                    })
            }
        }
    }

    @ViewBuilder
    private var emptyOrError: some View {
        if vm.isLoadingHistory {
            LoadingLine(text: L10n.t("Loading..."), topPadding: 96, bottomPadding: 48)
        } else if vm.historyFailed {
            EmptyState.loadFailed(title: L10n.pick("Failed to load messages", "加载消息失败")) {
                Task { await vm.loadHistory() }
            }
        } else {
            Color.clear.frame(height: 1)
        }
    }

    // MARK: Scroll handling

    private func handleScroll(_ m: ChatScrollMetrics, viewportHeight: CGFloat) {
        let top = max(0, m.top)
        vm.reportDistanceFromBottom(max(0, m.contentHeight - top - viewportHeight))
        if top <= ChatViewModel.prependTriggerOffset {
            if wasBelowTopThreshold && vm.canLoadEarlier {
                wasBelowTopThreshold = false
                vm.loadEarlier()
            }
        } else {
            wasBelowTopThreshold = true
        }
    }
}

// MARK: - Scroll metrics preference

struct ChatScrollMetrics: Equatable {
    var top: CGFloat = 0
    var contentHeight: CGFloat = 0
}

/// Height of the message ScrollView itself (not the whole overlay).
struct ChatViewportHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        let n = nextValue()
        if n > 0 { value = n }
    }
}

struct ChatScrollMetricsKey: PreferenceKey {
    static var defaultValue = ChatScrollMetrics()
    static func reduce(value: inout ChatScrollMetrics, nextValue: () -> ChatScrollMetrics) {
        value = nextValue()
    }
}
