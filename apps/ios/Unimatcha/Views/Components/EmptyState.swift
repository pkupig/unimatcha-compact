import SwiftUI

// MARK: - Empty / error / loading states (h5-design-system.md §8.15)
//
// `flatEmptyIcon`: 64×64 tile, radius 18, `mb-6`; muted = `#efefef` tile + `#8a8a8a` icon, neon = neon tile + black icon;
// icon 28 pt. Block: centered, `pt-24` (96) → tile → title 16/800 tight `onSurface` → sub 14 `onSurfaceVariant`
// `mt-2` `max-w-[16rem]` leading-relaxed → optional action `mt-6` (underlined "Retry" or a `.btn-cta` in `max-w-xs`).
// Loading: plain "Loading…" 14 pt grey line — no spinners anywhere.

struct EmptyState: View {
    enum Tone { case muted, neon }
    enum ActionStyle { case underline, cta }

    var sf: String
    var title: String
    var subtitle: String? = nil
    var tone: Tone = .muted
    var action: (label: String, run: () -> Void)? = nil
    var actionStyle: ActionStyle = .underline
    var topPadding: CGFloat = 96
    var bottomPadding: CGFloat = 0

    /// Material-name convenience: `EmptyState(material: "cloud_off", title: …)`.
    init(material: String,
         title: String,
         subtitle: String? = nil,
         tone: Tone = .muted,
         action: (label: String, run: () -> Void)? = nil,
         actionStyle: ActionStyle = .underline,
         topPadding: CGFloat = 96,
         bottomPadding: CGFloat = 0) {
        self.sf = Theme.Icon.sf(material)
        self.title = title
        self.subtitle = subtitle
        self.tone = tone
        self.action = action
        self.actionStyle = actionStyle
        self.topPadding = topPadding
        self.bottomPadding = bottomPadding
    }

    init(sf: String,
         title: String,
         subtitle: String? = nil,
         tone: Tone = .muted,
         action: (label: String, run: () -> Void)? = nil,
         actionStyle: ActionStyle = .underline,
         topPadding: CGFloat = 96,
         bottomPadding: CGFloat = 0) {
        self.sf = sf
        self.title = title
        self.subtitle = subtitle
        self.tone = tone
        self.action = action
        self.actionStyle = actionStyle
        self.topPadding = topPadding
        self.bottomPadding = bottomPadding
    }

    /// The canonical "Failed to load" block with an underlined Retry.
    static func loadFailed(title: String? = nil, subtitle: String? = nil, retry: @escaping () -> Void) -> EmptyState {
        EmptyState(material: "cloud_off",
                   title: title ?? L10n.t("Failed to load"),
                   subtitle: subtitle ?? L10n.t("Check your connection and try again"),
                   action: (L10n.t("Retry"), retry))
    }

    var body: some View {
        VStack(spacing: 0) {
            FlatEmptyIcon(sf: sf, tone: tone)
                .padding(.bottom, 24)
            Text(title)
                .font(Theme.font(16, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 16))
                .foregroundColor(Theme.C.onSurface)
                .multilineTextAlignment(.center)
            if let s = subtitle, !s.isEmpty {
                Text(s)
                    .font(Theme.font(14))
                    .lineSpacing(14 * 0.625)
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 256)
                    .padding(.top, 8)
            }
            if let a = action {
                Group {
                    switch actionStyle {
                    case .underline:
                        CTAButton(title: a.label, style: .linkUnderline, action: a.run)
                    case .cta:
                        CTAButton(title: a.label, style: .neon, action: a.run)
                            .frame(maxWidth: 320)
                    }
                }
                .padding(.top, 24)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, topPadding)
        .padding(.bottom, bottomPadding)
        .padding(.horizontal, 24)
    }
}

/// The 64×64 radius-18 icon tile on its own (used inline by some blocks).
struct FlatEmptyIcon: View {
    var sf: String
    var tone: EmptyState.Tone = .muted
    var size: CGFloat = 64

    init(sf: String, tone: EmptyState.Tone = .muted, size: CGFloat = 64) {
        self.sf = sf
        self.tone = tone
        self.size = size
    }

    init(material: String, tone: EmptyState.Tone = .muted, size: CGFloat = 64) {
        self.sf = Theme.Icon.sf(material)
        self.tone = tone
        self.size = size
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Theme.R.empty, style: .continuous)
                .fill(tone == .neon ? Theme.C.neon : Theme.C.emptyTile)
            Image(systemName: sf)
                .font(.system(size: 28 * 0.82, weight: .light))
                .foregroundColor(tone == .neon ? .black : Theme.C.emptyIcon)
                .frame(width: 28, height: 28)
        }
        .frame(width: size, height: size)
    }
}

/// Grey "Loading…" line (`text-sm text-on-surface-variant`, centered; `py-24` in feeds, `pt-16` tickets).
struct LoadingLine: View {
    var text: String? = nil
    var topPadding: CGFloat = 96
    var bottomPadding: CGFloat = 96

    var body: some View {
        Text(text ?? L10n.t("Loading…"))
            .font(Theme.font(14))
            .foregroundColor(Theme.C.onSurfaceVariant)
            .frame(maxWidth: .infinity)
            .padding(.top, topPadding)
            .padding(.bottom, bottomPadding)
    }
}
