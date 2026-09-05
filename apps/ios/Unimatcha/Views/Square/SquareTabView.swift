import SwiftUI

// MARK: - SquareTabView (`#tab-square` — h5-square.md §1.1, §2 "Square tab"; PLAN §C.5) — WP-08
//
// Full-screen tab panel: three `FeedPageView`s in a `HorizontalPager` (recommend → campus_wall →
// pinned, 12 pt gap, 0.3 rubber band, 70 pt commit, ±1 clamp), the 44 + inset glass header floating
// above, and the draggable FAB (hidden on the pinned page). Swipe is disabled while an overlay is
// presented or the FAB is being dragged. The shell (WP-16) calls `SquareStore.onTabEnter()` on tab
// entry and bumps `scrollToTopSignal` + `reloadCurrent()` on re-tap; when the shell has not entered
// the store yet (standalone use) the view triggers the first entry itself.

struct SquareTabView: View {
    @ObservedObject private var store = SquareStore.shared
    @State private var pageIndex: Int = 0
    @State private var fabDragging = false

    var body: some View {
        GeometryReader { geo in
            // The GeometryReader itself ignores the safe area, so its proxy reports zeros.
            let chrome = OverlayChrome.resolvedInsets(geo.safeAreaInsets)
            let safeTop = chrome.top
            let safeBottom = chrome.bottom
            ZStack(alignment: .top) {
                Theme.C.surface
                HorizontalPager(index: $pageIndex,
                                count: SquareStore.pagerBoards.count,
                                gap: Theme.Space.pageGap,
                                enabled: { !fabDragging && !OverlayRouter.shared.isAnyPresented },
                                onSettle: { i in
                                    let board = SquareStore.pagerBoards[min(max(i, 0), SquareStore.pagerBoards.count - 1)]
                                    if board != SquareStore.shared.current {
                                        Task { await SquareStore.shared.switchTo(board) }
                                    }
                                }) { i in
                    FeedPageView(board: SquareStore.pagerBoards[i], safeTop: safeTop, safeBottom: safeBottom)
                }
                .frame(width: geo.size.width, height: geo.size.height)

                SquareHeaderView(current: store.current, safeTop: safeTop,
                                 onSelect: { board in
                                     Task { await SquareStore.shared.switchTo(board) }
                                 },
                                 onSearch: {
                                     AppActions.shared.openSquareSearch()
                                 })
                .frame(maxWidth: .infinity, alignment: .top)

                SquareFAB(hidden: store.current == .pinned,
                          container: geo.size,
                          headerBottom: Theme.Bar.square + safeTop,
                          isDragging: $fabDragging) {
                    AppActions.shared.openNewPost(SquareStore.shared.current)
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
        .background(Theme.C.surface.ignoresSafeArea())
        .onAppear {
            pageIndex = SquareStore.pagerIndex(of: store.current)
            if !store.hasEntered {
                Task { await SquareStore.shared.onTabEnter() }
            }
        }
        .onChange(of: store.current) { board in
            let i = SquareStore.pagerIndex(of: board)
            if pageIndex != i { pageIndex = i }
        }
    }
}
