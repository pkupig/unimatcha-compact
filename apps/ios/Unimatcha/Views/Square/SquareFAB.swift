import SwiftUI
import UIKit

// MARK: - SquareFAB (`#square-fab` — h5-square.md §1.1 #3, §2 "FAB tap / FAB drag") — WP-08
//
// 56 pt neon circle, black `add` 24 pt, no shadow, `active:scale-90`. Default `bottom:208 right:20`.
// Draggable: movement < 6 pt total is still a tap; beyond that the button follows the finger, clamped to
// x ∈ [8, W − 56 − 8], y ∈ [headerBottom + 8, H − 56 − 8] (headerBottom = 44 + top inset). On release it
// snaps to the nearest side (20 pt from the left or right edge, keeping y) with a 0.2 s ease-out and the
// position is persisted (`Prefs.fabPos`, top-left origin); restored on launch through the same clamp,
// re-clamped when the container size changes. Hidden on the Pinned page. While dragging the pager
// swipe is disabled (`isDragging`).

struct SquareFAB: View {
    var hidden: Bool
    var container: CGSize
    var headerBottom: CGFloat
    @Binding var isDragging: Bool
    var action: () -> Void

    @State private var position: CGPoint? = nil
    @State private var dragOrigin: CGPoint? = nil
    @State private var moved = false
    @State private var pressing = false

    static let size: CGFloat = 56
    static let iconSize: CGFloat = 24
    static let edgeInset: CGFloat = 8
    static let sideInset: CGFloat = 20
    static let defaultBottom: CGFloat = 208
    static let defaultRight: CGFloat = 20
    static let tapSlop: CGFloat = 6
    static let snapAnimation = Animation.easeOut(duration: 0.2)

    // MARK: Geometry (pure — checked by SquareFixtures)

    static func defaultPosition(container: CGSize) -> CGPoint {
        CGPoint(x: container.width - defaultRight - size, y: container.height - defaultBottom - size)
    }

    static func clamp(_ p: CGPoint, container: CGSize, headerBottom: CGFloat) -> CGPoint {
        let maxX = max(edgeInset, container.width - size - edgeInset)
        let minY = headerBottom + edgeInset
        let maxY = max(minY, container.height - size - edgeInset)
        return CGPoint(x: min(max(p.x, edgeInset), maxX), y: min(max(p.y, minY), maxY))
    }

    /// Nearest side: 20 pt from the left or right edge, y unchanged (then clamped).
    static func snapped(_ p: CGPoint, container: CGSize, headerBottom: CGFloat) -> CGPoint {
        let centerX = p.x + size / 2
        let x = centerX < container.width / 2 ? sideInset : container.width - size - sideInset
        return clamp(CGPoint(x: x, y: p.y), container: container, headerBottom: headerBottom)
    }

    private var resolved: CGPoint {
        let base = position ?? Prefs.fabPos ?? SquareFAB.defaultPosition(container: container)
        return SquareFAB.clamp(base, container: container, headerBottom: headerBottom)
    }

    var body: some View {
        if !hidden && container.width > 0 && container.height > 0 {
            let pos = resolved
            ZStack {
                Circle().fill(Theme.C.neon)
                Image(systemName: Theme.Icon.sf("add"))
                    .font(.system(size: SquareFAB.iconSize * 0.82, weight: .regular))
                    .foregroundColor(.black)
                    .frame(width: SquareFAB.iconSize, height: SquareFAB.iconSize)
            }
            .frame(width: SquareFAB.size, height: SquareFAB.size)
            .contentShape(Circle())
            .scaleEffect(pressing ? Theme.Motion.pressScaleSmallIcon : 1)
            .animation(Theme.Motion.press, value: pressing)
            .offset(x: pos.x, y: pos.y)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .gesture(dragGesture)
            .onAppear {
                if position == nil { position = resolved }
            }
            .onChange(of: container) { size in
                guard size.width > 0, size.height > 0 else { return }
                let p = SquareFAB.clamp(position ?? resolved, container: size, headerBottom: headerBottom)
                if p != position { position = p }
            }
            .accessibilityLabel(Text(L10n.t("Publish")))
            .accessibilityAddTraits(.isButton)
        }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { g in
                if dragOrigin == nil {
                    dragOrigin = resolved
                    pressing = true
                }
                let dist = hypot(g.translation.width, g.translation.height)
                if !moved && dist >= SquareFAB.tapSlop {
                    moved = true
                    isDragging = true
                }
                guard moved, let origin = dragOrigin else { return }
                let next = CGPoint(x: origin.x + g.translation.width, y: origin.y + g.translation.height)
                var t = Transaction()
                t.disablesAnimations = true
                withTransaction(t) {
                    position = SquareFAB.clamp(next, container: container, headerBottom: headerBottom)
                }
            }
            .onEnded { _ in
                let wasDrag = moved
                dragOrigin = nil
                moved = false
                pressing = false
                if wasDrag {
                    let target = SquareFAB.snapped(resolved, container: container, headerBottom: headerBottom)
                    withAnimation(SquareFAB.snapAnimation) { position = target }
                    Prefs.fabPos = target
                    // Release the pager after the click that follows a drag has been swallowed.
                    DispatchQueue.main.async { isDragging = false }
                } else {
                    isDragging = false
                    action()
                }
            }
    }
}
