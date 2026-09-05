import SwiftUI

// MARK: - ChatListPane (h5-chat.md §1.1, §2.1; PLAN §C.4) — WP-07
//
// The Chat pane of the home track (index 0, the app's landing view). It is its own vertical scroll
// container padded `62 + safe-top` at the top (56 pt bar + 6 pt gap) and 112 pt at the bottom
// (clears the floating nav pill), with no group headers: temp rows sit on one pale neon block on
// top, confirmed rows follow (romantic first). The refund banner mounts above everything.
//
// Wiring the shell depends on:
//   `.reportScrollOffset(id: "chat")`  → WP-16's bottom-nav auto-hide
//   `.pullToRefresh(enabled:)`         → only while the Chat pane is the visible home view
//                                        (H5 attaches PTR to `#tab-match` and gates it the same way)

struct ChatListPane: View {
    @ObservedObject private var store = ChatSessionsStore.shared
    @ObservedObject private var matchStore = MatchStore.shared
    @Environment(\.overlaySafeInsets) private var envInsets

    static let topPadding: CGFloat = 62      // 56 bar + 6 gap, plus the status-bar inset
    static let bottomPadding: CGFloat = 112  // pb-28, clears the floating nav

    init() {}

    private var insets: EdgeInsets { OverlayChrome.resolvedInsets(envInsets) }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                if let banner = store.refundBanner {
                    // Full-bleed like the H5 mount (`#chat-banner` has no outer padding; the card
                    // brings its own `px-4 py-3`).
                    RefundBanner(info: banner,
                                 onTap: { AppActions.shared.openEnergyPurchase() },
                                 onClose: { store.dismissRefundBanner() })
                }
                content
            }
            .padding(.top, ChatListPane.topPadding + insets.top)
            .padding(.bottom, ChatListPane.bottomPadding)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .reportScrollOffset(id: "chat")
        .pullToRefresh(enabled: { MatchStore.shared.homeView == .chat && !OverlayRouter.shared.isAnyPresented },
                       topInset: insets.top) {
            await store.loadSessions()
        }
        .background(Theme.C.surface)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { if matchStore.homeView == .chat { store.onPaneEnter() } }
        .onDisappear { store.onPaneLeave() }
        .onChange(of: matchStore.homeView) { view in
            // The three panes stay mounted (H5 keeps their DOM alive), so the ticker follows the
            // visible view rather than `onAppear`.
            if view == .chat { store.onPaneEnter() } else { store.onPaneLeave() }
        }
    }

    // MARK: List / empty state

    @ViewBuilder
    private var content: some View {
        let temp = store.tempSessions
        let confirmed = store.confirmedSessions
        if temp.isEmpty && confirmed.isEmpty {
            if store.hasLoaded {
                EmptyState(material: "forum",
                           title: L10n.t("No conversations yet"),
                           subtitle: L10n.t("Match in Romantic or Friend mode — chats appear here once you connect."),
                           topPadding: 96)
            } else {
                Color.clear.frame(height: 1)
            }
        } else {
            LazyVStack(spacing: 0) {
                ForEach(Array(temp.enumerated()), id: \.element.matchId) { pair in
                    row(pair.element,
                        showSeparator: pair.offset < temp.count - 1,
                        corners: bandCorners(index: pair.offset, count: temp.count))
                }
                ForEach(Array(confirmed.enumerated()), id: \.element.matchId) { pair in
                    row(pair.element,
                        showSeparator: pair.offset < confirmed.count - 1,
                        corners: [])
                }
            }
        }
    }

    private func row(_ s: ChatSession, showSeparator: Bool, corners: UIRectCorner) -> some View {
        SessionRow(session: s,
                   remainingMs: store.remainingMs(for: s),
                   showSeparator: showSeparator,
                   bandCorners: corners) {
            store.present(session: s)
        }
    }

    /// The temp group reads as one pale rounded block: first row rounds the top, last the bottom.
    private func bandCorners(index: Int, count: Int) -> UIRectCorner {
        var c: UIRectCorner = []
        if index == 0 { c.insert([.topLeft, .topRight]) }
        if index == count - 1 { c.insert([.bottomLeft, .bottomRight]) }
        return c
    }
}
