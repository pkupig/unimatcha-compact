import SwiftUI
import UIKit
import Combine

// MARK: - Scroll offset reporting (h5-core.md §2.2 `bindNavAutoHide`)
//
// `.reportScrollOffset(id:)` publishes the enclosing / decorated `ScrollView`'s vertical offset
// (`contentOffset.y + adjustedContentInset.top`, i.e. H5 `scrollTop`) through `ScrollOffsetKey` so
// ancestors (WP-16 BottomNav auto-hide, post-detail chrome hide, profile hero) can react. It works
// whether applied to the `ScrollView` itself or to its content: the modifier resolves the backing
// `UIScrollView` via a hidden `UIViewRepresentable` and KVO-observes `contentOffset` (no coordinate
// space plumbing needed by callers).
//
// `NavAutoHideObserver` ports the H5 rule verbatim: dy > 6 → hide, dy < −6 → show, offset < 40 → always show.

struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

/// Published upward by `HorizontalPager` while a horizontal drag owns the gesture (siblings such as a
/// pull-to-refresh indicator hosted outside the pager can yield).
struct PagerHorizontalLockKey: PreferenceKey {
    static var defaultValue: Bool = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
}

/// Pushed downward by `HorizontalPager` to its pages (the PTR modifier inside a page reads it: H5
/// `container.dataset.horizLock === '1'` → hide indicator, zero distance).
struct PagerHorizontalLockEnvironmentKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    var pagerHorizontalLock: Bool {
        get { self[PagerHorizontalLockEnvironmentKey.self] }
        set { self[PagerHorizontalLockEnvironmentKey.self] = newValue }
    }
}

// MARK: - UIScrollView resolver

/// Zero-size helper view that finds the `UIScrollView` backing a SwiftUI `ScrollView`, either as an
/// ancestor (when placed inside the scroll content) or as a nearby descendant of an ancestor (when
/// placed as `.background` of the `ScrollView` itself). Calls `onResolve` once per distinct scroll view.
struct UIScrollViewResolver: UIViewRepresentable {
    var onResolve: (UIScrollView) -> Void

    func makeUIView(context: Context) -> ResolverView {
        let v = ResolverView()
        v.onResolve = onResolve
        return v
    }

    func updateUIView(_ uiView: ResolverView, context: Context) {
        uiView.onResolve = onResolve
        uiView.attemptResolve()
    }

    final class ResolverView: UIView {
        var onResolve: ((UIScrollView) -> Void)?
        private weak var resolved: UIScrollView?

        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            backgroundColor = .clear
            isAccessibilityElement = false
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            attemptResolve()
            DispatchQueue.main.async { [weak self] in self?.attemptResolve() }
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            attemptResolve()
        }

        func attemptResolve() {
            guard window != nil else { return }
            guard let sv = Self.findScrollView(from: self) else { return }
            if sv !== resolved {
                resolved = sv
                onResolve?(sv)
            }
        }

        static func findScrollView(from view: UIView) -> UIScrollView? {
            // 1. Ancestor scroll view (modifier applied inside the content).
            var node: UIView? = view.superview
            var depth = 0
            while let n = node, depth < 12 {
                if let sv = n as? UIScrollView, !(sv is UITextView) { return sv }
                node = n.superview
                depth += 1
            }
            // 2. Descendant of a near ancestor (modifier applied on the ScrollView: the resolver is a
            //    sibling of the hosting container that wraps the UIScrollView).
            var ancestor: UIView? = view.superview
            var up = 0
            while let a = ancestor, up < 6 {
                if let sv = firstScrollView(in: a, exclude: view, depth: 0) { return sv }
                ancestor = a.superview
                up += 1
            }
            return nil
        }

        private static func firstScrollView(in root: UIView, exclude: UIView, depth: Int) -> UIScrollView? {
            guard depth < 8 else { return nil }
            for sub in root.subviews where sub !== exclude {
                if let sv = sub as? UIScrollView, !(sv is UITextView) { return sv }
                if let found = firstScrollView(in: sub, exclude: exclude, depth: depth + 1) { return found }
            }
            return nil
        }
    }
}

// MARK: - Offset observer

final class ScrollOffsetObserver: ObservableObject {
    @Published var offset: CGFloat = 0
    private var kvo: NSKeyValueObservation?
    private weak var scrollView: UIScrollView?

    func attach(_ sv: UIScrollView) {
        guard sv !== scrollView else { return }
        scrollView = sv
        kvo = sv.observe(\.contentOffset, options: [.initial, .new]) { [weak self] sv, _ in
            let y = sv.contentOffset.y + sv.adjustedContentInset.top
            let rounded = (y * 2).rounded() / 2
            DispatchQueue.main.async {
                guard let self = self, self.offset != rounded else { return }
                self.offset = rounded
            }
        }
    }

    deinit { kvo?.invalidate() }
}

/// PLAN §B.5 name for the modifier type (`.reportScrollOffset(id:)` is the API).
typealias ScrollOffsetReporter = ScrollOffsetReporterModifier

struct ScrollOffsetReporterModifier: ViewModifier {
    var id: String
    @StateObject private var observer = ScrollOffsetObserver()

    func body(content: Content) -> some View {
        content
            .background(UIScrollViewResolver { observer.attach($0) }.frame(width: 0, height: 0))
            .preference(key: ScrollOffsetKey.self, value: [id: observer.offset])
    }
}

extension View {
    /// Publishes this scroll view's `scrollTop` under `id` via `ScrollOffsetKey`.
    func reportScrollOffset(id: String) -> some View {
        modifier(ScrollOffsetReporterModifier(id: id))
    }
}

// MARK: - NavAutoHideObserver

/// H5 `bindNavAutoHide`: per container `dy = scrollTop − last`; `scrollTop < 40` → always show;
/// `dy > 6` → hide; `dy < −6` → show. Feed it every offset change of the active container.
final class NavAutoHideObserver: ObservableObject {
    @Published private(set) var hidden: Bool = false
    private var last: CGFloat = 0

    static let hideDelta: CGFloat = 6
    static let alwaysShowBelow: CGFloat = 40

    func observe(offset: CGFloat) {
        let dy = offset - last
        last = offset
        if offset < Self.alwaysShowBelow {
            if hidden { hidden = false }
            return
        }
        if dy > Self.hideDelta {
            if !hidden { hidden = true }
        } else if dy < -Self.hideDelta {
            if hidden { hidden = false }
        }
    }

    /// Call when the active container changes (tab switch) so the first delta is not garbage.
    func reset(offset: CGFloat = 0) {
        last = offset
        if hidden { hidden = false }
    }

    func show() {
        if hidden { hidden = false }
    }
}
