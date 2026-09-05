import SwiftUI
import UIKit

// MARK: - Pull-to-refresh (h5-core.md §2.4, §1.11; h5-design-system.md §8.16; h5-profile.md §2)
//
// `.pullToRefresh(enabled:onPull:action:)` on a `ScrollView` (or its content). Custom, not `.refreshable`:
//   • arms only when the touch starts at `scrollTop ≤ 0` (H5: `container.scrollTop <= 0`), `enabled()` is true,
//     nothing is refreshing and the pager has not taken a horizontal lock
//   • `dist = 180·(1 − e^(−dy/180))` (dy 90 → 70, 200 → 122, 400 → 160, cap 180); `onPull(dist)` every frame
//   • indicator: 40 pt disc (white / dark `#23211f` → `Theme.C.card`), no shadow, top of the container, centered,
//     opacity `min(1, dist/40)`, `refresh` 22 pt icon rotating `dist/70·360°`, neon when `dist ≥ 70` (`.ptr-ready`),
//     translates `dist` with the content; drawn beneath the caller's top bar (the bar is composed later in z)
//   • release `< 70` → spring back (0.3 s `cubic-bezier(.22,1,.36,1)`); `≥ 70` → `.ptr-spinning` (0.7 s linear loop,
//     neon), content held at 70 pt, `onPull(70)`, `await action()` (errors swallowed), spinner shown ≥ 600 ms, reset
//   • a pager horizontal lock mid-drag hides the indicator and zeroes the distance (H5 `dataset.horizLock`)
//   • native top bounce is disabled (H5 tab panels use `overscroll-behavior-y: none`)
// The scroll view is resolved through `UIScrollViewResolver`; the drag is read from its pan recognizer,
// so the modifier never fights SwiftUI's own scrolling.

/// PLAN §B.5 name for the modifier type (`.pullToRefresh(enabled:onPull:action:)` is the API).
typealias PullToRefresh = PullToRefreshModifier

struct PullToRefreshModifier: ViewModifier {
    var enabled: () -> Bool
    var onPull: (CGFloat) -> Void
    var action: () async -> Void
    var topInset: CGFloat

    @StateObject private var state = PullToRefreshState()
    @Environment(\.pagerHorizontalLock) private var horizLock

    func body(content: Content) -> some View {
        // Keep the closures current on every evaluation (callers often capture view state in `enabled`).
        state.enabled = enabled
        state.onPull = onPull
        state.action = action
        return content
            .offset(y: state.dist)
            .background(UIScrollViewResolver { state.attach($0) }.frame(width: 0, height: 0))
            .overlay(alignment: .top) {
                PTRIndicator(dist: state.dist, phase: state.phase)
                    .padding(.top, topInset)
                    .allowsHitTesting(false)
            }
            .onAppear {
                state.enabled = enabled
                state.onPull = onPull
                state.action = action
                state.horizLock = horizLock
            }
            .onChange(of: horizLock) { v in
                state.horizLock = v
                if v { state.horizontalLockTaken() }
            }
    }
}

extension View {
    /// H5 `attachPullToRefresh`. `topInset` offsets the indicator when the scroll view extends under the
    /// status bar (pass `safeAreaInsets.top`); leave 0 when the scroll view already respects the safe area.
    func pullToRefresh(enabled: @escaping () -> Bool = { true },
                       topInset: CGFloat = 0,
                       onPull: @escaping (CGFloat) -> Void = { _ in },
                       action: @escaping () async -> Void) -> some View {
        modifier(PullToRefreshModifier(enabled: enabled, onPull: onPull, action: action, topInset: topInset))
    }
}

// MARK: - State machine

@MainActor
final class PullToRefreshState: NSObject, ObservableObject {
    enum Phase { case idle, dragging, ready, spinning }

    @Published private(set) var dist: CGFloat = 0
    @Published private(set) var phase: Phase = .idle

    var enabled: () -> Bool = { true }
    var onPull: (CGFloat) -> Void = { _ in }
    var action: () async -> Void = {}
    var horizLock = false

    static let threshold: CGFloat = 70
    static let cap: CGFloat = 180
    static let minSpin: TimeInterval = 0.6

    private weak var scrollView: UIScrollView?
    private var armed = false
    private var refreshing = false

    nonisolated static func damped(_ dy: CGFloat) -> CGFloat {
        guard dy > 0 else { return 0 }
        return cap * (1 - exp(-dy / cap))
    }

    func attach(_ sv: UIScrollView) {
        guard sv !== scrollView else { return }
        if let old = scrollView { old.panGestureRecognizer.removeTarget(self, action: #selector(handlePan(_:))) }
        scrollView = sv
        sv.bounces = false
        sv.alwaysBounceVertical = false
        sv.panGestureRecognizer.addTarget(self, action: #selector(handlePan(_:)))
    }

    /// The pager decided the drag is horizontal: hide indicator, zero distance, disarm.
    func horizontalLockTaken() {
        guard armed, !refreshing else { return }
        armed = false
        setDist(0, animated: false)
        phase = .idle
        onPull(0)
    }

    @objc private func handlePan(_ pan: UIPanGestureRecognizer) {
        guard let sv = scrollView else { return }
        switch pan.state {
        case .began:
            let top = sv.contentOffset.y + sv.adjustedContentInset.top
            armed = !refreshing && !horizLock && enabled() && top <= 0.5
        case .changed:
            guard armed, !refreshing else { return }
            if horizLock {
                horizontalLockTaken()
                return
            }
            let dy = pan.translation(in: sv).y
            let top = sv.contentOffset.y + sv.adjustedContentInset.top
            if dy <= 0 || top > 0.5 {
                if dist != 0 {
                    setDist(0, animated: false)
                    onPull(0)
                }
                phase = .idle
                return
            }
            let d = Self.damped(dy)
            setDist(d, animated: false)
            phase = d >= Self.threshold ? .ready : .dragging
            onPull(d)
        case .ended:
            guard armed, !refreshing else { return }
            armed = false
            if dist >= Self.threshold {
                startRefresh()
            } else {
                reset()
            }
        case .cancelled, .failed:
            guard armed, !refreshing else { return }
            armed = false
            reset()
        default:
            break
        }
    }

    private func startRefresh() {
        refreshing = true
        phase = .spinning
        setDist(Self.threshold, animated: true)
        onPull(Self.threshold)
        let started = Date()
        Task { [weak self] in
            guard let self = self else { return }
            await self.action()
            let elapsed = Date().timeIntervalSince(started)
            if elapsed < Self.minSpin {
                try? await Task.sleep(nanoseconds: UInt64((Self.minSpin - elapsed) * 1_000_000_000))
            }
            self.refreshing = false
            self.reset()
        }
    }

    private func reset() {
        setDist(0, animated: true)
        phase = .idle
        onPull(0)
    }

    private func setDist(_ v: CGFloat, animated: Bool) {
        if animated {
            withAnimation(Theme.Motion.ptrSnap) { dist = v }
        } else {
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) { dist = v }
        }
    }
}

// MARK: - Indicator

struct PTRIndicator: View {
    var dist: CGFloat
    var phase: PullToRefreshState.Phase

    @State private var spin: Double = 0

    private var ready: Bool { phase == .ready || phase == .spinning }

    var body: some View {
        ZStack {
            Circle().fill(Theme.C.card)
            Image(systemName: Theme.Icon.sf("refresh"))
                .font(.system(size: 22 * 0.82, weight: .regular))
                .foregroundColor(ready ? Theme.C.neon : Theme.C.onSurface)
                .frame(width: 22, height: 22)
                .rotationEffect(.degrees(phase == .spinning ? spin : Double(dist / PullToRefreshState.threshold) * 360))
        }
        .frame(width: 40, height: 40)
        .opacity(min(1, dist / 40))
        .offset(y: dist)     // H5: `top: sat` + translateY(dist) — emerges from under the caller's top bar
        .onChange(of: phase) { p in
            if p == .spinning {
                spin = 0
                withAnimation(.linear(duration: 0.7).repeatForever(autoreverses: false)) { spin = 360 }
            } else {
                var t = Transaction()
                t.disablesAnimations = true
                withTransaction(t) { spin = 0 }
            }
        }
    }
}
