import SwiftUI

// MARK: - HorizontalPager (h5-core.md §2.3, h5-square.md §1.1, h5-design-system.md §14.7)
//
// The Home 3-pane track and the Square 3-page track share these physics:
//   • pages are `100 %` wide, separated by a 12 pt gap; offset for page i = −i × (width + gap)
//   • the track follows the finger 1:1 once the direction is decided after 12 pt of movement (a vertical
//     decision hands the gesture to the page's own ScrollView; the pager ignores the rest of that drag)
//   • ×0.3 rubber band when dragging past either end
//   • release with |dx| ≥ 70 and a neighbour → index ±1 (never skips a page), else spring back
//   • snap animation `Theme.Motion.snap` (0.28 s cubic-bezier(.22,1,.36,1)), same as tapping a segment
//   • `enabled()` is consulted when a drag starts (H5: no swipe while an overlay / plus-menu is open)
// While a horizontal drag owns the gesture the pager pushes `\.pagerHorizontalLock = true` to its pages
// (the pull-to-refresh modifier hides its indicator and zeroes its distance) and publishes
// `PagerHorizontalLockKey` upward for siblings.

struct HorizontalPager<Content: View>: View {
    @Binding var index: Int
    var count: Int
    var gap: CGFloat = 12
    var enabled: () -> Bool = { true }
    var onSettle: ((Int) -> Void)? = nil
    @ViewBuilder var content: (Int) -> Content

    static var directionLock: CGFloat { 12 }
    static var commitThreshold: CGFloat { 70 }
    static var rubberBand: CGFloat { 0.3 }

    private enum Lock { case horizontal, vertical, blocked }

    @State private var drag: CGFloat = 0
    @State private var lock: Lock? = nil
    @State private var horizLock = false
    @State private var measuredWidth: CGFloat = 0
    // Resets automatically when the system cancels the drag (a competing recogniser wins, an
    // incoming call, a second finger) — `onEnded` is NOT called in that case. H5 hit the same
    // hole (settle bound to `document`), so the cleanup below snaps the track back on cancel.
    @GestureState private var gestureActive = false

    init(index: Binding<Int>,
         count: Int,
         gap: CGFloat = 12,
         enabled: @escaping () -> Bool = { true },
         onSettle: ((Int) -> Void)? = nil,
         @ViewBuilder content: @escaping (Int) -> Content) {
        self._index = index
        self.count = count
        self.gap = gap
        self.enabled = enabled
        self.onSettle = onSettle
        self.content = content
    }

    var body: some View {
        GeometryReader { geo in
            let width = pagerWidth(geo.size.width)
            HStack(spacing: gap) {
                ForEach(0..<max(count, 0), id: \.self) { i in
                    content(i)
                        .frame(width: width, height: geo.size.height)
                        .clipped()
                }
            }
            .frame(width: width, height: geo.size.height, alignment: .leading)
            .offset(x: baseOffset(width) + drag)
            .animation(drag == 0 ? Theme.Motion.snap : nil, value: index)
            .environment(\.pagerHorizontalLock, horizLock)
            .simultaneousGesture(dragGesture(width: width))
        }
        .clipped()
        .preference(key: PagerHorizontalLockKey.self, value: horizLock)
        .onChange(of: gestureActive) { active in
            guard !active, lock != nil else { return }
            // Cancelled mid-drag: `onEnded` never ran → spring back, release the lock.
            withAnimation(Theme.Motion.snap) { drag = 0 }
            lock = nil
            horizLock = false
        }
    }

    /// H5 `pagerWidth = clientWidth || window.innerWidth || 375` — never 0 while the tab is hidden.
    private func pagerWidth(_ w: CGFloat) -> CGFloat {
        if w > 0 { return w }
        let screen = UIScreen.main.bounds.width
        return screen > 0 ? screen : 375
    }

    private func baseOffset(_ width: CGFloat) -> CGFloat {
        -CGFloat(clampedIndex) * (width + gap)
    }

    private var clampedIndex: Int {
        min(max(index, 0), max(count - 1, 0))
    }

    private func dragGesture(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: Self.directionLock, coordinateSpace: .local)
            .updating($gestureActive) { _, state, _ in state = true }
            .onChanged { g in
                let tx = g.translation.width
                let ty = g.translation.height
                if lock == nil {
                    if !enabled() || count <= 1 {
                        lock = .blocked
                    } else if abs(tx) > abs(ty) {
                        lock = .horizontal
                        horizLock = true
                    } else {
                        lock = .vertical
                    }
                }
                guard lock == .horizontal else { return }
                let atStart = clampedIndex == 0 && tx > 0
                let atEnd = clampedIndex == count - 1 && tx < 0
                var dx = tx
                if atStart || atEnd { dx = tx * Self.rubberBand }
                var t = Transaction()
                t.disablesAnimations = true
                withTransaction(t) { drag = dx }
            }
            .onEnded { g in
                defer {
                    lock = nil
                    horizLock = false
                }
                guard lock == .horizontal else { return }
                let tx = g.translation.width
                var target = clampedIndex
                if abs(tx) >= Self.commitThreshold {
                    let neighbour = tx < 0 ? clampedIndex + 1 : clampedIndex - 1
                    if neighbour >= 0 && neighbour < count { target = neighbour }
                }
                withAnimation(Theme.Motion.snap) {
                    drag = 0
                    if target != index { index = target }
                }
                onSettle?(target)
            }
    }
}
