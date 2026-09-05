import SwiftUI

// MARK: - MatchHomeView (h5-match.md §1.1, §2.2–§2.3; h5-core.md §1.4, §2.3; design §7.2) — WP-06
//
// The Match tab shell: a 56 + safe-top glass top bar over a three-pane horizontal track
// (Chat · Romantic · Friend). Each pane is full width, panes are separated by a 12 pt gap, the
// track follows the finger (`HorizontalPager` physics: 12 pt direction lock, ×0.3 rubber band,
// 70 pt commit, ±1 clamp, `Theme.Motion.snap`). Swiping is disabled while any overlay (which
// includes the plus-menu popover) is open. Tapping a segment animates the same track.
//
// Slots injected by the integration package:
//   chatPane      the Chat list pane (WP-07), applies its own `.reportScrollOffset(id: "chat")`
//   coupleSpace   Couple Space content rendered inside the Romantic pane when state == relationship (WP-12)
//   badgeCount    unread notifications for the bell badge (WP-13 store, read by WP-16)

struct MatchHomeView: View {
    let chatPane: () -> AnyView
    let coupleSpace: (_ matchId: String, _ partner: PublicProfile) -> AnyView
    let badgeCount: Int

    @ObservedObject private var store = MatchStore.shared
    @ObservedObject private var overlays = OverlayRouter.shared

    init(chatPane: @escaping () -> AnyView,
         coupleSpace: @escaping (_ matchId: String, _ partner: PublicProfile) -> AnyView,
         badgeCount: Int) {
        self.chatPane = chatPane
        self.coupleSpace = coupleSpace
        self.badgeCount = badgeCount
    }

    /// Track index ↔ `MatchStore.homeView` (chat 0 · romantic 1 · friend 2).
    private var pageIndex: Binding<Int> {
        Binding(
            get: { HomeView.allCases.firstIndex(of: store.homeView) ?? 0 },
            set: { i in
                let v = HomeView.allCases[min(max(i, 0), HomeView.allCases.count - 1)]
                if v != store.homeView { activate(v) }
            })
    }

    var body: some View {
        GeometryReader { geo in
            // The GeometryReader itself ignores the safe area, so its proxy reports zeros.
            let chrome = OverlayChrome.resolvedInsets(geo.safeAreaInsets)
            let safeTop = chrome.top
            let safeBottom = chrome.bottom
            ZStack(alignment: .top) {
                HorizontalPager(index: pageIndex,
                                count: HomeView.allCases.count,
                                gap: Theme.Space.pageGap,
                                enabled: { !OverlayRouter.shared.isAnyPresented && !PlusMenu.isOpen }) { i in
                    pane(at: i, safeTop: safeTop, safeBottom: safeBottom)
                }
                .frame(width: geo.size.width, height: geo.size.height + safeTop + safeBottom)
                .ignoresSafeArea()

                HomeTopBar(store: store,
                           badgeCount: badgeCount,
                           safeTop: safeTop,
                           onPlus: { PlusMenu.toggle(safeTop: safeTop) },
                           onSelectView: { activate($0) })
                    .ignoresSafeArea(edges: .top)
            }
            .background(Theme.C.surface)
            .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private func pane(at index: Int, safeTop: CGFloat, safeBottom: CGFloat) -> some View {
        switch HomeView.allCases[min(max(index, 0), HomeView.allCases.count - 1)] {
        case .chat:
            chatPane()
        case .romantic:
            MatchPaneView(mode: .romantic, safeTop: safeTop, safeBottom: safeBottom, coupleSpace: coupleSpace)
        case .friend:
            MatchPaneView(mode: .friend, safeTop: safeTop, safeBottom: safeBottom, coupleSpace: coupleSpace)
        }
    }

    private func activate(_ view: HomeView) {
        Task { await MatchStore.shared.activate(view: view) }
    }
}
