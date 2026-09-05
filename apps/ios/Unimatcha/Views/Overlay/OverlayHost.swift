import SwiftUI
import UIKit

// MARK: - OverlayHost (PLAN §A.2.3 / §B.5 — WP-03a)
//
// Renders `OverlayRouter.shared.stack` as stacked layers above the tab shell. Place it in
// `RootView`'s `ZStack` *inside* the safe area (it draws its own full-screen grounds);
// `DialogHost` and `ToastHost` go above it (z: overlays < dialog < toast).
//
// Per style (h5-core.md §1.9, h5-design-system.md §11):
//   fullPage    opaque `surface` ground, fade 0.25 s, edge swipe-back when eligible
//   bottomSheet `black/40` backdrop (tap closes) + sheet sliding up 0.32 s from the bottom
//   card        `black/40` backdrop (tap closes only when `dismissOnBackdrop`), centred card
//   lightbox    `black/90` ground, tap anywhere closes
//   popover     anchored card, pop 0.18 s from `translateY(-6) scale(.98)`, tap outside closes

/// Window-level chrome facts the kit needs when no host environment is available.
enum OverlayChrome {
    /// Safe-area insets of the key window (0 when no window is attached yet).
    static var windowSafeInsets: EdgeInsets {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
            ?? scenes.first?.windows.first
        guard let ins = window?.safeAreaInsets else { return EdgeInsets() }
        return EdgeInsets(top: ins.top, leading: ins.left, bottom: ins.bottom, trailing: ins.right)
    }

    static var screenSize: CGSize { UIScreen.main.bounds.size }

    /// Effective insets: the host-provided environment value, or the window's when the
    /// caller is not inside `OverlayHost` (tab shell bars, previews).
    static func resolvedInsets(_ env: EdgeInsets) -> EdgeInsets {
        if env.top == 0 && env.bottom == 0 && env.leading == 0 && env.trailing == 0 {
            return windowSafeInsets
        }
        return env
    }

    /// `max-w-sm` (384) / `max-w-md` (448) / `max-w-xs` (320) Tailwind card widths.
    static let cardMaxWidthSm: CGFloat = 384
    static let cardMaxWidthMd: CGFloat = 448
    static let cardMaxWidthXs: CGFloat = 320
}

struct OverlayHost: View {
    @ObservedObject private var router = OverlayRouter.shared

    init() {}

    var body: some View {
        GeometryReader { geo in
            let insets = geo.safeAreaInsets
            ZStack {
                ForEach(Array(router.stack.enumerated()), id: \.element.id) { pair in
                    OverlayLayer(
                        overlay: pair.element,
                        isSwipeTarget: router.activeSwipeBackTarget?.id == pair.element.id
                    )
                    .environment(\.overlayId, pair.element.id)
                    .environment(\.overlaySafeInsets, OverlayChrome.resolvedInsets(insets))
                    .zIndex(Double(pair.offset))
                    .transition(.overlayLayer)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .allowsHitTesting(router.isAnyPresented)
    }
}

// MARK: - One layer

private struct OverlayLayer: View {
    let overlay: AppOverlay
    let isSwipeTarget: Bool

    @Environment(\.overlayPresentProgress) private var progress
    @ObservedObject private var router = OverlayRouter.shared

    var body: some View {
        switch overlay.style {
        case .fullPage:
            fullPage
        case .bottomSheet:
            bottomSheet
        case .card(let dismissOnBackdrop):
            card(dismissOnBackdrop: dismissOnBackdrop)
        case .lightbox:
            lightbox
        case .popover(let anchor, let alignment):
            popover(anchor: anchor, alignment: alignment)
        }
    }

    private func dismissSelf() {
        router.dismiss(id: overlay.id)
    }

    // fullPage: opaque ground + content ignoring the top inset (bars size themselves 64+top).
    private var fullPage: some View {
        let page = ZStack {
            Theme.C.surface.ignoresSafeArea()
            overlay.content()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(.container, edges: .top)
        }
        .opacity(progress)

        // Always the same wrapper: toggling `enabled` (instead of un-wrapping) keeps the
        // page's identity when another layer is pushed on top of it and popped again.
        return SwipeBackContainer(enabled: overlay.swipeBack && isSwipeTarget, onDismiss: dismissSelf) {
            page
        }
    }

    private var bottomSheet: some View {
        ZStack(alignment: .bottom) {
            Theme.C.backdrop
                .ignoresSafeArea()
                .opacity(progress)
                .contentShape(Rectangle())
                .onTapGesture { dismissSelf() }
            SheetSlide(progress: progress) {
                overlay.content()
                    .frame(maxWidth: OverlayChrome.cardMaxWidthMd)
            }
            .frame(maxWidth: .infinity, alignment: .bottom)
            .ignoresSafeArea(.container, edges: .bottom)
        }
    }

    private func card(dismissOnBackdrop: Bool) -> some View {
        ZStack {
            Theme.C.backdrop
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture {
                    if dismissOnBackdrop { dismissSelf() }
                }
            overlay.content()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(true)
        }
        .opacity(progress)
    }

    private var lightbox: some View {
        ZStack {
            Color.black.opacity(0.9).ignoresSafeArea()
            overlay.content()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .contentShape(Rectangle())
        .onTapGesture { dismissSelf() }
        .opacity(progress)
    }

    private func popover(anchor: CGRect, alignment: PopoverAlignment) -> some View {
        ZStack(alignment: .topLeading) {
            (alignment.dimsBackdrop ? Color.black.opacity(0.12) : Color.clear)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { dismissSelf() }
                .opacity(progress)
            // The anchor is in SCREEN coordinates; this reader reports where the layer
            // actually starts, so the conversion holds however the host is mounted.
            GeometryReader { g in
                PopoverPlacement(
                    anchor: anchor,
                    alignment: alignment,
                    originGlobal: g.frame(in: .global).origin,
                    progress: progress
                ) {
                    overlay.content()
                }
            }
        }
    }
}

// MARK: - Bottom-sheet slide (offset by the sheet's own measured height)

private struct SheetSlide<Content: View>: View {
    let progress: Double
    @ViewBuilder let content: () -> Content
    @State private var height: CGFloat = 0

    var body: some View {
        content()
            .background(
                GeometryReader { g in
                    Color.clear.preference(key: SheetHeightKey.self, value: g.size.height)
                }
            )
            .onPreferenceChange(SheetHeightKey.self) { height = $0 }
            .offset(y: (1 - progress) * (height > 0 ? height : OverlayChrome.screenSize.height))
    }
}

private struct SheetHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

// MARK: - Popover placement (anchor is in global/screen coordinates)

private struct PopoverPlacement<Content: View>: View {
    let anchor: CGRect
    let alignment: PopoverAlignment
    let originGlobal: CGPoint
    let progress: Double
    @ViewBuilder let content: () -> Content

    @State private var size: CGSize = .zero

    private static var margin: CGFloat { 8 }

    var body: some View {
        content()
            .fixedSize()
            .background(
                GeometryReader { g in
                    Color.clear.preference(key: PopoverSizeKey.self, value: g.size)
                }
            )
            .onPreferenceChange(PopoverSizeKey.self) { size = $0 }
            .scaleEffect(0.98 + 0.02 * progress, anchor: .topLeading)
            .offset(x: origin.x, y: origin.y - 6 * (1 - progress))
            .opacity(progress)
    }

    /// Position in the layer's local space (which starts at the safe-area origin).
    private var origin: CGPoint {
        let screen = OverlayChrome.screenSize
        let m = Self.margin
        var x: CGFloat = alignment.isTrailing ? (anchor.maxX - size.width) : anchor.minX
        var y: CGFloat = anchor.maxY + alignment.gap
        if size.width > 0 {
            x = min(max(m, x), max(m, screen.width - size.width - m))
        } else {
            x = max(m, x)
        }
        if size.height > 0 {
            y = min(max(m, y), max(m, screen.height - size.height - m))
        } else {
            y = max(m, y)
        }
        // Convert from screen space to this layer's local space.
        return CGPoint(x: x - originGlobal.x, y: y - originGlobal.y)
    }
}

private struct PopoverSizeKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) { value = nextValue() }
}
