import SwiftUI

// MARK: - Content pages: Help Center / Safety Tips / Terms / Privacy (h5-settings.md §1.6, h5-i18n.md §1.7)
//
// Overlay id `content` (full page, fade, swipe-back). Reachable from Settings › Support and from
// the logged-out auth-page footer, so it reads **only** `ContentPages.page(_:lang:)` — never
// `SessionStore`. Whole-page language swap chosen at open time (H5 parity).
// Header: `FullPageBar` (gap 16, title 20/700). Body px 24 / pt 32 (`pt-24` − bar) / pb 80.

struct ContentPageView: View {
    static let overlayId = "content"

    let key: ContentPageKey
    private let page: ContentPage

    init(key: ContentPageKey) {
        self.key = key
        self.page = ContentPages.page(key, lang: L10n.lang)
    }

    /// WP-16 implements `AppActions.openContentPage` with this.
    @MainActor
    static func present(_ key: ContentPageKey) {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .fullPage, swipeBack: true) {
            ContentPageView(key: key)
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(page.title, onBack: { ContentPageView.dismiss() })
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    if let intro = page.intro, !intro.isEmpty {
                        Text(intro)
                            .font(Theme.font(14))
                            .lineSpacing(14 * 0.625)
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.bottom, 24)
                    }
                    if let last = page.lastUpdated, !last.isEmpty {
                        Text(last)
                            .font(Theme.font(10))
                            .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                            .foregroundColor(Theme.C.outline)
                            .padding(.bottom, 32)
                    }
                    ForEach(Array(page.items.enumerated()), id: \.offset) { _, item in
                        switch item {
                        case .faq(let q, let a):
                            ContentFaqItem(question: q, answer: a)
                        case .section(let h, let text):
                            ContentDocSection(heading: h, text: text)
                        }
                    }
                }
                .padding(.horizontal, Theme.Space.page)
                .padding(.top, 32)
                .padding(.bottom, 80)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Theme.C.surface.ignoresSafeArea())
        .id(key)
    }
}

/// `faqItem(q, a)`: py-5 + hairline; question 14/700 tight (mb-2), answer 14 `onSurfaceVariant` relaxed.
struct ContentFaqItem: View {
    let question: String
    let answer: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question)
                .font(Theme.font(14, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 14))
                .foregroundColor(Theme.C.onSurface)
                .fixedSize(horizontal: false, vertical: true)
            Text(answer)
                .font(Theme.font(14))
                .lineSpacing(14 * 0.625)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Hairline() }
    }
}

/// `docSection(h, body)`: `mb-8`; heading 12/black tracking .2em `onSurface` (mb-3), body 14 relaxed.
struct ContentDocSection: View {
    let heading: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(heading)
                .font(Theme.font(12, weight: .black))
                .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
                .foregroundColor(Theme.C.onSurface)
                .fixedSize(horizontal: false, vertical: true)
            Text(text)
                .font(Theme.font(14))
                .lineSpacing(14 * 0.625)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
