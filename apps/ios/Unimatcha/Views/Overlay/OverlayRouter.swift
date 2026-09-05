import SwiftUI

// MARK: - Overlay model (PLAN §A.2.3 / §A.2.6 / §B.5 — WP-03a)
//
// Port of the H5 `.overlay` layer model (h5-core.md §1.9): overlays are *stacked layers*,
// not a navigation stack. `OverlayRouter` keeps them in presentation order and
// `OverlayHost` renders them in a `ZStack` above the tab shell. Confirm/prompt cards and
// toasts are NOT overlays (they have their own hosts, see `DialogCenter` / `ToastCenter`).

/// Where a popover card sits relative to its anchor rectangle (global/screen coordinates).
/// The card's top edge is `anchor.maxY + gap`; `leading` aligns the card's left edge with
/// `anchor.minX`, `trailing` aligns the card's right edge with `anchor.maxX`. The card is
/// clamped 8 pt inside the screen. `dim` draws the H5 plus-menu scrim `rgba(0,0,0,.12)`
/// behind the card (post-detail action menus use no scrim, only "tap outside closes").
///
/// Usage: `.popover(anchor: rect, alignment: .leading())` or
/// `.popover(anchor: barRect, alignment: .leading(gap: 0, dim: true))` (plus menu).
enum PopoverAlignment: Equatable {
    case leading(gap: CGFloat = 6, dim: Bool = false)
    case trailing(gap: CGFloat = 6, dim: Bool = false)

    var gap: CGFloat {
        switch self {
        case .leading(let g, _), .trailing(let g, _): return g
        }
    }

    var dimsBackdrop: Bool {
        switch self {
        case .leading(_, let d), .trailing(_, let d): return d
        }
    }

    var isTrailing: Bool {
        if case .trailing = self { return true }
        return false
    }
}

enum OverlayStyle {
    /// Opaque `Theme.C.surface` ground, fade 0.25 s, optional left-edge swipe-back.
    case fullPage
    /// Dimmed backdrop (`black/40`), sheet slides up 0.32 s; content should wrap itself in
    /// `BottomSheetContainer` (drag header >110 pt closes); backdrop tap closes.
    case bottomSheet
    /// Centred card on a `black/40` backdrop. The content view owns its own max width and
    /// horizontal padding (H5 cards use max-w-xs/sm/md + px-6/px-8 per overlay).
    case card(dismissOnBackdrop: Bool)
    /// Image viewer: `black/90` ground, tap anywhere closes.
    case lightbox
    /// Anchored menu card (plus menu, post/comment action menus); tap outside closes.
    case popover(anchor: CGRect, alignment: PopoverAlignment)

    /// Animation used for both the presentation and the dismissal transition.
    var animation: Animation {
        switch self {
        case .fullPage, .card, .lightbox: return Theme.Motion.fade
        case .bottomSheet: return Theme.Motion.sheet
        case .popover: return Theme.Motion.plusMenu
        }
    }

    var isPopover: Bool {
        if case .popover = self { return true }
        return false
    }
}

struct AppOverlay: Identifiable {
    /// One of the ids in PLAN §A.2.6 (e.g. "chat", "post-detail", "filter-overlay").
    let id: String
    let style: OverlayStyle
    /// Only overlays whose H5 counterpart shows an `arrow_back`/`arrow_forward` icon.
    let swipeBack: Bool
    /// Runs on every dismissal path (button, swipe, backdrop, `dismissAll`).
    let onDismiss: (() -> Void)?
    let content: () -> AnyView

    init(id: String,
         style: OverlayStyle,
         swipeBack: Bool = false,
         onDismiss: (() -> Void)? = nil,
         content: @escaping () -> AnyView) {
        self.id = id
        self.style = style
        self.swipeBack = swipeBack
        self.onDismiss = onDismiss
        self.content = content
    }

    /// Convenience: wraps any view builder in `AnyView`.
    init<V: View>(id: String,
                  style: OverlayStyle,
                  swipeBack: Bool = false,
                  onDismiss: (() -> Void)? = nil,
                  @ViewBuilder content: @escaping () -> V) {
        self.init(id: id, style: style, swipeBack: swipeBack, onDismiss: onDismiss) {
            AnyView(content())
        }
    }
}

// MARK: - Router

@MainActor
final class OverlayRouter: ObservableObject {
    static let shared = OverlayRouter()

    /// Presentation order == z-order (index 0 is the lowest layer).
    @Published private(set) var stack: [AppOverlay] = []

    init() {}

    /// Presents an overlay. Re-presenting an id that is already open replaces it *in
    /// place* (same z position, fresh content) — H5 `openOverlay` on an active overlay.
    func present(_ o: AppOverlay) {
        if let idx = stack.firstIndex(where: { $0.id == o.id }) {
            // No transition: the layer keeps its identity and just re-renders.
            stack[idx] = o
            return
        }
        withAnimation(o.style.animation) {
            stack.append(o)
        }
    }

    /// Removes the overlay with `id` (no-op when absent) and runs its `onDismiss`.
    func dismiss(id: String) {
        guard let idx = stack.firstIndex(where: { $0.id == id }) else { return }
        let o = stack[idx]
        withAnimation(o.style.animation) {
            _ = stack.remove(at: idx)
        }
        o.onDismiss?()
    }

    func dismissTop() {
        guard let top = stack.last else { return }
        dismiss(id: top.id)
    }

    /// H5 `closeAllOverlays` (logout / 401 / language switch): clears every layer, running
    /// `onDismiss` top-down so owners can stop their scanners/pollers.
    func dismissAll() {
        guard !stack.isEmpty else { return }
        let removed = stack
        withAnimation(Theme.Motion.fade) {
            stack.removeAll()
        }
        for o in removed.reversed() {
            o.onDismiss?()
        }
    }

    func isPresented(_ id: String) -> Bool {
        stack.contains { $0.id == id }
    }

    /// Used by the home three-view swipe guard (h5-core.md §2.3) — any open layer blocks it.
    var isAnyPresented: Bool { !stack.isEmpty }

    var top: AppOverlay? { stack.last }

    /// Top-most overlay with `swipeBack == true`. The edge gesture is only attached to this
    /// one (H5 targets the top-most active overlay that contains a back arrow).
    var topSwipeBackTarget: AppOverlay? {
        stack.last { $0.swipeBack }
    }

    /// The overlay a swipe-back gesture should act on right now: the top-most layer, but
    /// only when it is itself swipe-back-able (an image viewer or menu on top disables it).
    var activeSwipeBackTarget: AppOverlay? {
        guard let top = stack.last, top.swipeBack else { return nil }
        return top
    }
}

// MARK: - Environment plumbing shared by the overlay kit

private struct OverlayIDKey: EnvironmentKey {
    static let defaultValue: String? = nil
}

private struct OverlaySafeInsetsKey: EnvironmentKey {
    static let defaultValue = EdgeInsets()
}

private struct OverlayPresentProgressKey: EnvironmentKey {
    static let defaultValue: Double = 1
}

extension EnvironmentValues {
    /// Id of the overlay the current view is rendered in (set by `OverlayHost`), so kit
    /// pieces such as `BottomSheetContainer` / `ActionMenu` can dismiss their own layer.
    var overlayId: String? {
        get { self[OverlayIDKey.self] }
        set { self[OverlayIDKey.self] = newValue }
    }

    /// Safe-area insets of the window as seen by `OverlayHost` (full-page overlay content
    /// ignores the top inset, so bars read this to size themselves `64 + top`).
    var overlaySafeInsets: EdgeInsets {
        get { self[OverlaySafeInsetsKey.self] }
        set { self[OverlaySafeInsetsKey.self] = newValue }
    }

    /// 0 → 1 while a layer is being presented, 1 → 0 while it is dismissed. Drives the
    /// per-style entrance (fade / slide-up / pop) from a single animatable transition.
    var overlayPresentProgress: Double {
        get { self[OverlayPresentProgressKey.self] }
        set { self[OverlayPresentProgressKey.self] = newValue }
    }
}

/// Animatable transition modifier: interpolates `overlayPresentProgress` for its subtree.
struct OverlayPresentProgressModifier: ViewModifier, Animatable {
    var progress: Double

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        content.environment(\.overlayPresentProgress, progress)
    }
}

extension AnyTransition {
    /// Transition every overlay layer uses; the layer reads `overlayPresentProgress`.
    static let overlayLayer = AnyTransition.modifier(
        active: OverlayPresentProgressModifier(progress: 0),
        identity: OverlayPresentProgressModifier(progress: 1)
    )
}
