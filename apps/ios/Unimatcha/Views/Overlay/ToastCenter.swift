import SwiftUI

// MARK: - ToastCenter (h5-core.md §1.5, h5-design-system.md §8.10 — WP-03a)
//
// Single toast like H5 `toast(msg, duration=3000)`: black pill, 14 pt white text, top
// `16 + safe-top`, `slideDown` 0.3 s (opacity 0→1, y −20→0), no exit animation. A new
// `show()` while one is visible REPLACES the text and RESTARTS the timer (open decision
// D19 — fixes the H5 overlapping-timer bug). No queue, no variants, no icon, no dark variant.
// Text is passed through `L10n.t` (exact-key lookup, H5 observer parity); callers pass
// already-localised strings anyway.

@MainActor
final class ToastCenter: ObservableObject {
    static let shared = ToastCenter()

    @Published private(set) var text: String?

    private var hideTask: Task<Void, Never>?

    init() {}

    func show(_ text: String, duration: TimeInterval = Theme.Motion.toastSeconds) {
        hideTask?.cancel()
        let shown = L10n.t(text)
        if self.text == nil {
            withAnimation(Theme.Motion.toastIn) { self.text = shown }
        } else {
            self.text = shown   // replace in place, no re-entrance animation
        }
        let ns = UInt64(max(0, duration) * 1_000_000_000)
        hideTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: ns)
            guard !Task.isCancelled else { return }
            self?.hideNow()
        }
    }

    func hide() {
        hideTask?.cancel()
        hideTask = nil
        hideNow()
    }

    private func hideNow() {
        // H5: no exit animation.
        var tx = Transaction()
        tx.disablesAnimations = true
        withTransaction(tx) { text = nil }
    }
}

// MARK: - ToastHost

struct ToastHost: View {
    @ObservedObject private var center = ToastCenter.shared

    init() {}

    var body: some View {
        // The geometry reader ignores the safe area itself, so `top` is the real inset no
        // matter how `RootView` mounts the host — the pill always sits at `16 + safe-top`
        // (h5-core.md §1.10: `#toast` top `16px + sat`).
        GeometryReader { geo in
            VStack(spacing: 0) {
                if let text = center.text {
                    Text(text)
                        .font(Theme.font(14))
                        .foregroundColor(Theme.C.toastFg)
                        .multilineTextAlignment(.center)
                        .padding(.vertical, 12)
                        .padding(.horizontal, 24)
                        .background(Theme.C.toastBg)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                        .shadow(color: Color.black.opacity(0.2), radius: 8, x: 0, y: 2)
                        .padding(.horizontal, Theme.Space.page)
                        .transition(.asymmetric(
                            insertion: .offset(y: -20).combined(with: .opacity),
                            removal: .identity
                        ))
                }
                Spacer(minLength: 0)
            }
            .padding(.top, OverlayChrome.resolvedInsets(geo.safeAreaInsets).top + 16)
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}
