import SwiftUI

// MARK: - SquareCardGrid (masonry of cards for one page — also used by WP-09's search page) — WP-08
//
// Two-column waterfall (`MasonryGrid`, 6 pt gaps, 6 pt top padding) fed with `SquareFeedItem`s.
// The environment carries the page (`\.squareBoard`) so user posts pick small vs wide, and
// `\.squarePinnedPage` for the pinned scope (no PINNED badge, fonts one step down).

struct SquareCardGrid: View {
    var board: SquareBoardKind
    var items: [SquareFeedItem]

    var body: some View {
        let pinned = board == .pinned
        let byId = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let masonry = items.map { SquareCardEstimator.masonryItem(for: $0, board: board, pinnedPage: pinned) }
        MasonryGrid(items: masonry, columnGap: SquareCardMetrics.gap, rowGap: SquareCardMetrics.gap, topPadding: SquareCardMetrics.gap) { m in
            if let item = byId[m.id] {
                SquareCardView(item: item)
            }
        }
        .environment(\.squareBoard, board)
        .environment(\.squarePinnedPage, pinned)
    }
}

// MARK: - FeedPageView (one pager page — h5-square.md §1.1 "Feed page states", §2 "Square tab") — WP-08
//
// Each page is its own vertical ScrollView (scroll memory lives in the mounted view; reset to top on
// `scrollResetSignal` = tab entry; smooth scroll-to-top on `scrollToTopSignal` when it is the current
// page). Content is padded `pt-[50px]` + top inset (the 44 + inset glass header floats above),
// `px-1.5`, `pb-24`. Pull-to-refresh reloads the **current** page only; the disc starts at the top
// inset so it slides out from under the header. Publishes `ScrollOffsetKey` id "square" while current
// (WP-16 BottomNav auto-hide).

struct FeedPageView: View {
    var board: SquareBoardKind
    var safeTop: CGFloat
    var safeBottom: CGFloat = 0

    @ObservedObject private var store = SquareStore.shared

    static let contentTop: CGFloat = 50
    static let contentBottom: CGFloat = 96

    private var isCurrent: Bool { store.current == board }

    var body: some View {
        GeometryReader { geo in
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        Color.clear
                            .frame(height: 0)
                            .id(FeedPageView.topAnchor)
                        content
                    }
                    .padding(.top, FeedPageView.contentTop + safeTop)
                    .padding(.bottom, FeedPageView.contentBottom + safeBottom)
                    .padding(.horizontal, SquareCardMetrics.outerPadding)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .top)
                }
                .pullToRefresh(enabled: { SquareStore.shared.current == board }, topInset: safeTop) {
                    await SquareStore.shared.reloadCurrent()
                }
                .reportScrollOffset(id: isCurrent ? "square" : "square-\(board.rawValue)")
                .onReceive(store.$scrollToTopSignal.dropFirst()) { _ in
                    guard store.current == board else { return }
                    withAnimation(Theme.Motion.snap) {
                        proxy.scrollTo(FeedPageView.topAnchor, anchor: .top)
                    }
                }
                .onReceive(store.$scrollResetSignal.dropFirst()) { _ in
                    var t = Transaction()
                    t.disablesAnimations = true
                    withTransaction(t) {
                        proxy.scrollTo(FeedPageView.topAnchor, anchor: .top)
                    }
                }
            }
        }
        .background(Theme.C.surface)
    }

    static let topAnchor = "square-page-top"

    @ViewBuilder private var content: some View {
        switch store.state(of: board) {
        case .content:
            SquareCardGrid(board: board, items: store.feedItems(for: board))
        case .error:
            EmptyState(material: "cloud_off",
                       title: L10n.t("Failed to load posts"),
                       subtitle: L10n.t("Check your connection and try again"),
                       action: (L10n.t("Retry"), { Task { await SquareStore.shared.reloadCurrent() } }),
                       bottomPadding: 96)
        case .needSchool:
            EmptyState(material: "school",
                       title: L10n.t("Add your school to view the campus wall"),
                       subtitle: L10n.t("Set your school in your profile to unlock it"),
                       action: (L10n.t("Complete profile"), { AppActions.shared.switchTab(.profile) }),
                       bottomPadding: 96)
        case .empty:
            switch board {
            case .pinned:
                EmptyState(material: "push_pin",
                           title: L10n.t("Nothing pinned yet"),
                           subtitle: L10n.t("Your student union pins important notices here"),
                           bottomPadding: 96)
            case .search:
                EmptyState(material: "grid_view",
                           title: L10n.t("No posts found"),
                           subtitle: L10n.t("Try a different keyword"),
                           bottomPadding: 96)
            case .recommend, .campus_wall:
                EmptyState(material: "grid_view",
                           title: L10n.t("No posts yet"),
                           subtitle: L10n.t("Be the first to share a moment"),
                           bottomPadding: 96)
            }
        case .idle, .loading:
            // Feeds show no spinner and no text while the first request is in flight (H5 parity);
            // a reload keeps the previous content on screen (state stays `.content`).
            Color.clear.frame(height: 1)
        }
    }
}
