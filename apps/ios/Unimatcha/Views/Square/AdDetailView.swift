import SwiftUI

// MARK: - AdDetailView (`#ad-detail-overlay` — h5-addfriend-ads §1.3, h5-square §2 "Ad detail") — WP-18
//
// Minimal full-screen page for ads without a `landingUrl`. Overlay id `ad-detail`, style
// `.fullPage`, **no swipe-back** (PLAN §A.2.6). Re-presenting replaces the open one in place
// (H5 removes any existing layer first). Logout / 401 closes it with `OverlayRouter.dismissAll()`
// (an improvement over H5, where the layer survives `closeAllOverlays`).
//
// Layout: sticky `h-16 px-6` glass header (`surface/80` + blur, `outline-variant/20` hairline)
// with `arrow_back` + "Sponsored" 10/700 tracking .15em `mt-0.5`; then every image stacked
// full-width at its natural aspect (hidden on error); then `px-6 py-8`: Sponsored badge (mb-4)
// → title 30/700 tracking-tighter leading-none (mb-4, only if any) → content 18 light relaxed
// `on-surface-variant` pre-wrap → advertiser 10 neutral-400 tracking-widest (mt-6). `pb-16`.

struct AdDetailView: View {
    static let overlayId = "ad-detail"
    /// `max-w-screen-md`.
    static let maxContentWidth: CGFloat = 768

    let ad: AdFeedItem

    @Environment(\.overlaySafeInsets) private var envInsets
    /// Natural width/height ratio per image index once loaded (4:5 placeholder until then).
    @State private var aspects: [Int: CGFloat] = [:]
    @State private var failed: Set<Int> = []

    init(ad: AdFeedItem) {
        self.ad = ad
    }

    // MARK: Presentation

    @MainActor
    static func present(_ ad: AdFeedItem) {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .fullPage, swipeBack: false) {
            AdDetailView(ad: ad)
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    private func close() {
        AdDetailView.dismiss()
    }

    private var advertiserLabel: String {
        if let n = ad.advertiserName?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty { return n }
        return L10n.pick("Sponsor", "赞助方")
    }

    // MARK: Body

    var body: some View {
        let insets = OverlayChrome.resolvedInsets(envInsets)
        VStack(spacing: 0) {
            header(topInset: insets.top)
            GeometryReader { geo in
                let width = min(geo.size.width, AdDetailView.maxContentWidth)
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        images(width: width)
                        article
                    }
                    .frame(width: width, alignment: .leading)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 64 + insets.bottom)
                }
            }
        }
        .background(Theme.C.surface.ignoresSafeArea())
    }

    /// `sticky top-0 h-16 px-6` glass bar (+ safe-area top): back arrow + "Sponsored" label.
    private func header(topInset: CGFloat) -> some View {
        HStack(spacing: 0) {
            Button(action: close) {
                // H5: `<button class="flex items-center gap-3">` — arrow and label are ONE
                // tap target (not the shared `BackArrowButton`, which is arrow-only).
                HStack(spacing: 12) {
                    Image(systemName: Theme.Icon.sf("arrow_back"))
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(Theme.C.onSurface)
                        .frame(width: 24, height: 24)
                    Text(L10n.t("Sponsored"))
                        .font(Theme.font(10, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.label, size: 10))
                        .foregroundColor(Theme.C.onSurface)
                        .padding(.top, 2)
                }
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Space.page)
        .frame(height: Theme.Bar.overlay)
        .padding(.top, topInset)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                Theme.C.glassBar
            }
            .ignoresSafeArea(edges: .top)
        )
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.C.hairline20).frame(height: 1)
        }
        .zIndex(1)
    }

    /// Every image, stacked, `w-full object-cover` at its natural aspect; hidden on load error.
    @ViewBuilder
    private func images(width: CGFloat) -> some View {
        ForEach(Array(ad.images.enumerated()), id: \.offset) { pair in
            if !failed.contains(pair.offset), SafeURL.isSafe(pair.element) {
                let ratio = aspects[pair.offset] ?? AdCardView.mediaAspect
                RemoteImage(
                    url: pair.element,
                    contentMode: .fill,
                    placeholderColor: Theme.C.container,
                    onSuccess: { size in
                        if size.width > 0, size.height > 0 {
                            aspects[pair.offset] = size.width / size.height
                        }
                    },
                    onFailure: { failed.insert(pair.offset) }
                )
                .frame(width: width, height: max(1, width / max(ratio, 0.05)))
                .clipped()
            }
        }
    }

    /// `div.px-6.py-8`: badge → title → content → advertiser.
    private var article: some View {
        VStack(alignment: .leading, spacing: 0) {
            Badge.sponsored
                .padding(.bottom, 16)
            if let title = ad.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
                Text(title)
                    .font(Theme.font(30, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.tighter, size: 30))
                    .lineSpacing(0)
                    .foregroundColor(Theme.C.onSurface)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 16)
            }
            if !ad.content.isEmpty {
                Text(ad.content)
                    .font(Theme.font(18, weight: .light))
                    .lineSpacing(AdDetailView.relaxedLineSpacing(size: 18))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(advertiserLabel)
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.neutral400)
                .lineLimit(1)
                .padding(.top, 24)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Space.page)
        .padding(.vertical, 32)
    }

    /// Tailwind `leading-relaxed` (1.625) expressed as extra spacing over the ~1.2 natural line box.
    static func relaxedLineSpacing(size: CGFloat) -> CGFloat {
        max(0, size * (1.625 - 1.2))
    }
}
