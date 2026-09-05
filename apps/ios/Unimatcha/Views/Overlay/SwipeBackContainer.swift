import SwiftUI
import UIKit

// MARK: - SwipeBackContainer (h5-core.md §2.6, h5-design-system.md §8.17 — WP-03a)
//
// Left-edge swipe-back for full-page overlays whose H5 counterpart has a back arrow.
//   start:  first touch with x ≤ 30 pt from the left edge
//   lock:   direction decided after 10 pt of movement (horizontal → gesture, else ignored)
//   move:   the whole panel (ground + header + content) follows the finger, dx ≥ 0, no fade
//   end:    dx ≥ 80 → slide out to the screen width over 0.2 s ease-out, then `onDismiss`
//           else spring back over 0.25 s (Theme.Motion.swipeCancel)
//   safety: the drag offset *and* the direction lock live in `@GestureState`, so an
//           interrupted / cancelled gesture always resets — the panel can never get stuck
//           offset and a stale "horizontal" decision can never leak into the next gesture
//           (the H5 gotcha: it clears inline transform/touch-action on every re-entry).

struct SwipeBackContainer<Content: View>: View {
    static var edgeWidth: CGFloat { 30 }
    static var lockDistance: CGFloat { 10 }
    static var commitDistance: CGFloat { 80 }

    /// Per-gesture state. Resets to `.init()` the moment the gesture ends or is cancelled,
    /// so `decided` is always false at the start of the next one.
    private struct SwipeState {
        var decided = false
        var horizontal = false
        var dx: CGFloat = 0
    }

    /// When false the gesture is inert (the overlay is not the active swipe target, e.g. an
    /// image viewer or menu sits on top). Kept as a flag rather than un-wrapping the content
    /// so the page keeps its identity (scroll position, `@State`) while layers come and go.
    private let enabled: Bool
    private let onDismiss: () -> Void
    private let content: Content

    @GestureState(resetTransaction: Transaction(animation: Theme.Motion.swipeCancel))
    private var swipe = SwipeState()
    @State private var committedOffset: CGFloat?

    init(enabled: Bool = true, onDismiss: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.enabled = enabled
        self.onDismiss = onDismiss
        self.content = content()
    }

    var body: some View {
        content
            .offset(x: committedOffset ?? swipe.dx)
            .simultaneousGesture(dragGesture)
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: Self.lockDistance, coordinateSpace: .local)
            .updating($swipe) { value, state, _ in
                let dx = value.translation.width
                let dy = value.translation.height
                if !state.decided {
                    // First update past `minimumDistance` (10 pt): decide the axis once.
                    state.decided = true
                    state.horizontal = abs(dx) > abs(dy)
                }
                guard enabled,
                      committedOffset == nil,
                      state.horizontal,
                      value.startLocation.x <= Self.edgeWidth else {
                    state.dx = 0
                    return
                }
                state.dx = max(0, dx)   // only rightward movement translates the panel
            }
            .onEnded { value in
                guard enabled, committedOffset == nil else { return }
                guard value.startLocation.x <= Self.edgeWidth else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                // `swipe` is still readable here (it resets after onEnded); fall back to the
                // final translation when the gesture ended before any update landed.
                let horizontal = swipe.decided ? swipe.horizontal : (abs(dx) > abs(dy))
                guard horizontal, dx >= Self.commitDistance else { return }   // else: GestureState reset springs it back
                let width = UIScreen.main.bounds.width
                withAnimation(Theme.Motion.swipeCommit) {
                    committedOffset = width
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    onDismiss()
                }
            }
    }
}
