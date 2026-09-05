import SwiftUI
import UIKit

// MARK: - AdCardView (`adLargeCard` — h5-addfriend-ads §1.2, h5-design-system §8.19 "Ad") — WP-18
//
// Full-width sponsored card in the Recommend masonry. Same silhouette as the official large
// card: white shell radius 6, 4:5 media on `container` with the neon "Sponsored" badge at
// `top-4 left-4`, body `px-3 pt-2 pb-3 space-y-1` = title 18/700 tight · content 14 italic
// neutral-500 2-line clamp · advertiser 10 neutral-400 tracking-widest (`advertiserName ||
// 'Sponsor'`). No like / author row / school badge / time. Whole card tappable.
//
//   AdCardView(ad: item)                 tap → click queued, then landingUrl (Safari) / ad-detail
//   AdCardView(ad: item) { … }           tap → click queued, then the custom closure (navigation only)
//
// Impression (D15): the card watches its own global frame; when ≥50 % of it lies inside the
// screen it reports `AdTracker.impression(id)` — the tracker dedupes per campaign per session,
// so re-renders / pull-to-refresh / scrolling past again never re-count.

struct AdCardView: View {
    let ad: AdFeedItem
    var onTap: (() -> Void)? = nil

    @State private var imageFailed = false
    /// One report per mounted card; the tracker dedupes per session on top of it (this only
    /// stops the frame preference from re-entering the tracker on every scroll frame).
    @State private var impressionReported = false

    @Environment(\.scenePhase) private var scenePhase

    init(ad: AdFeedItem, onTap: (() -> Void)? = nil) {
        self.ad = ad
        self.onTap = onTap
    }

    // MARK: Geometry (for the masonry's estimated height)

    static let mediaAspect: CGFloat = 4.0 / 5.0
    static let bodyPaddingTop: CGFloat = 8
    static let bodyPaddingBottom: CGFloat = 12
    static let bodyPaddingHorizontal: CGFloat = 12
    static let bodyRowSpacing: CGFloat = 4
    static let badgeInset: CGFloat = 16

    /// Rough height for a `MasonryItem` before measurement: media (w × 5/4) + body rows.
    /// Uses the same "is there a usable image" rule as the view (`SafeURL`), so an ad whose
    /// only image has an unsafe URL is estimated as the badge-only fallback, not as media.
    static func estimatedHeight(for ad: AdFeedItem, width: CGFloat) -> CGFloat {
        let usableImage = ad.images.first.map { SafeURL.isSafe($0) } ?? false
        let media: CGFloat = usableImage ? width / mediaAspect : (12 + 13 + 4)
        var body: CGFloat = bodyPaddingTop + bodyPaddingBottom
        var rows = 0
        if let t = ad.title, !t.isEmpty { body += 18 * 1.25; rows += 1 }
        if !ad.content.isEmpty { body += 2 * 14 * 1.4; rows += 1 }
        body += 10 * 1.4; rows += 1
        body += CGFloat(max(0, rows - 1)) * bodyRowSpacing
        return media + body
    }

    private var advertiserLabel: String {
        if let n = ad.advertiserName?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty { return n }
        return L10n.pick("Sponsor", "赞助方")
    }

    private var hasImage: Bool {
        guard let first = ad.images.first else { return false }
        return SafeURL.isSafe(first)
    }

    // MARK: Body

    var body: some View {
        Button(action: tapped) {
            VStack(alignment: .leading, spacing: 0) {
                if hasImage {
                    media
                } else {
                    // No-image fallback (server requires ≥1 image, so rare): badge alone, px-3 pt-3.
                    HStack(spacing: 0) {
                        Badge.sponsored
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, AdCardView.bodyPaddingHorizontal)
                    .padding(.top, 12)
                }
                cardBody
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.feed, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Theme.R.feed, style: .continuous))
        }
        .buttonStyle(AdCardPressStyle())
        .background(
            GeometryReader { geo in
                Color.clear.preference(key: AdCardFrameKey.self, value: geo.frame(in: .global))
            }
        )
        .onPreferenceChange(AdCardFrameKey.self) { frame in
            reportVisibility(frame)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(L10n.t("Sponsored") + " · " + (ad.title ?? ad.content)))
    }

    /// `relative aspect-[4/5] bg-surface-container` + `object-cover` image (hidden on error) + badge.
    private var media: some View {
        ZStack(alignment: .topLeading) {
            Theme.C.container
            if !imageFailed {
                RemoteImage(
                    url: ad.images.first,
                    contentMode: .fill,
                    placeholderColor: Theme.C.container,
                    onFailure: { imageFailed = true }
                )
            }
            Badge.sponsored
                .padding(AdCardView.badgeInset)
        }
        .aspectRatio(AdCardView.mediaAspect, contentMode: .fit)
        .clipped()
    }

    /// `px-3 pt-2 pb-3 space-y-1`.
    private var cardBody: some View {
        VStack(alignment: .leading, spacing: AdCardView.bodyRowSpacing) {
            if let title = ad.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
                Text(title)
                    .font(Theme.font(18, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                    .foregroundColor(Theme.C.onSurface)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !ad.content.isEmpty {
                Text(ad.content)
                    .font(Theme.font(14).italic())
                    .foregroundColor(Theme.C.neutral500)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(advertiserLabel)
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.neutral400)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, AdCardView.bodyPaddingHorizontal)
        .padding(.top, AdCardView.bodyPaddingTop)
        .padding(.bottom, AdCardView.bodyPaddingBottom)
    }

    // MARK: Interactions

    /// Click is queued before any navigation (h5-addfriend-ads gotcha 16).
    private func tapped() {
        AdTracker.shared.click(ad.id)
        if let onTap = onTap {
            onTap()
        } else {
            AdTracker.shared.navigate(ad)
        }
    }

    /// Fraction of the card's frame inside the screen (`IntersectionObserver` ratio).
    static func visibleFraction(of frame: CGRect, in viewport: CGRect) -> CGFloat {
        guard frame.width > 0, frame.height > 0 else { return 0 }
        let inter = frame.intersection(viewport)
        guard !inter.isNull, inter.width > 0, inter.height > 0 else { return 0 }
        return (inter.width * inter.height) / (frame.width * frame.height)
    }

    /// Runs off the preference callback: ≥50 % of the card inside the screen → one
    /// `AdTracker.impression` (the tracker dedupes per campaign per session on top).
    /// Skipped while the app is not `.active` — a backgrounded app is the iOS equivalent of
    /// H5's hidden document, where `IntersectionObserver` stops reporting.
    private func reportVisibility(_ frame: CGRect) {
        guard !impressionReported, scenePhase == .active else { return }
        let viewport = CGRect(origin: .zero, size: OverlayChrome.screenSize)
        guard AdCardView.visibleFraction(of: frame, in: viewport) >= AdTracker.impressionVisibilityThreshold else { return }
        impressionReported = true
        let id = ad.id
        Task { @MainActor in
            AdTracker.shared.impression(id)
        }
    }
}

// MARK: - Pieces

private struct AdCardFrameKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

/// Card press feedback (`group` hover scale is web-only; touch gets the shared card press scale).
private struct AdCardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? Theme.Motion.pressScaleCard : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}
