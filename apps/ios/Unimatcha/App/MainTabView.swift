import SwiftUI

// MARK: - MainTabView (WP-16)
//
// H5 `#page-home` (`h5-core.md §1.3`, `h5-design-system.md §7.2/§7.3`): three sibling panels
// (`#tab-match`, `#tab-square`, `#tab-profile`), exactly one `display:block` at a time, with the
// floating pill nav on top. The panels keep their DOM (and therefore their scroll offsets and
// per-page state) while hidden, so this is a ZStack with `.opacity`/`.allowsHitTesting` rather
// than a `TabView`. A panel is mounted on first visit and never unmounted (see `ShellState`).
//
// Nav auto-hide (`bindNavAutoHide`) is bound to the scroll of `#home-chat-view`, `#tab-square`
// and `#tab-profile` — i.e. the `ScrollOffsetKey` ids `chat` / `square` / `profile` published by
// WP-07's `ChatListPane`, WP-08's `FeedPageView` and WP-11's `ProfileTabView`. The romantic and
// friend match panes never drive it (H5 does not bind them).

struct MainTabView: View {
    @ObservedObject private var shell = ShellState.shared
    @ObservedObject private var matchStore = MatchStore.shared
    @ObservedObject private var notifications = NotificationStore.shared

    @StateObject private var nav = NavAutoHideObserver()
    @State private var offsets: [String: CGFloat] = [:]

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.C.surface.ignoresSafeArea()

            panel(.match) {
                MatchHomeView(
                    chatPane: { AnyView(ChatListPane()) },
                    coupleSpace: { matchId, partner in
                        AnyView(CoupleSpaceView(matchId: matchId, partner: partner))
                    },
                    badgeCount: notifications.unreadCount)
            }

            panel(.square) { SquareTabView() }

            panel(.profile) { ProfileTabView() }

            BottomNav(active: shell.tab, hidden: nav.hidden) { tab in
                AppRouter.shared.switchTab(tab)
            }
            .padding(.bottom, Theme.Bar.navBottomGap)
        }
        .onPreferenceChange(ScrollOffsetKey.self) { dict in
            offsets = dict
            guard let id = activeScrollId, let offset = dict[id] else { return }
            nav.observe(offset: offset)
        }
        // A tab / home-view switch re-bases the delta so the first reading of the new container
        // cannot read as a jump, and re-shows the pill (H5 leaves it hidden, which can strand the
        // nav off-screen on a pane that never scrolls — a deliberate, documented divergence).
        .onChange(of: shell.tab) { _ in rebaseNav() }
        .onChange(of: matchStore.homeView) { _ in rebaseNav() }
    }

    // MARK: Panels

    @ViewBuilder
    private func panel<V: View>(_ tab: AppTab, @ViewBuilder content: () -> V) -> some View {
        if shell.isMounted(tab) {
            let isActive = shell.tab == tab
            content()
                .opacity(isActive ? 1 : 0)
                .allowsHitTesting(isActive)
                .accessibilityHidden(!isActive)
        }
    }

    // MARK: Nav auto-hide plumbing

    /// The `ScrollOffsetKey` id that currently drives the nav pill, or `nil` when the visible pane
    /// is a match plan pane (those never hide the nav).
    private var activeScrollId: String? {
        switch shell.tab {
        case .match: return matchStore.homeView == .chat ? "chat" : nil
        case .square: return "square"
        case .profile: return ProfileTabView.scrollId
        }
    }

    private func rebaseNav() {
        nav.reset(offset: activeScrollId.flatMap { offsets[$0] } ?? 0)
    }
}
