import SwiftUI

// MARK: - Match empty states (h5-match.md §1.5, §1.7, §1.8; design §8.15) — WP-06
//
// Centered empty card `text-center px-8 py-16`: 64 pt muted icon tile (`flatEmptyIcon`) mb 24,
// title 18/800/tight on-surface mb 8, body 14 on-surface-variant (max-w-xs, mb 40), then a
// `max-w-xs` column: `.btn-cta` primary + 10 pt underlined text link.

/// Romantic `no_match` (§1.5) and friend `no_match` with no candidates (§1.7).
struct NoMatchCard: View {
    let mode: MatchMode
    let message: String?

    @State private var busy = false

    var body: some View {
        VStack(spacing: 0) {
            FlatEmptyIcon(material: mode == .romantic ? "hourglass_empty" : "group_off", tone: .muted)
                .padding(.bottom, 24)

            Text(mode == .romantic ? L10n.t("No Match This Week") : L10n.t("No Friends This Round"))
                .font(Theme.font(18, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                .foregroundColor(Theme.C.onSurface)
                .multilineTextAlignment(.center)
                .padding(.bottom, 8)

            Text(bodyText)
                .font(Theme.font(14))
                .lineSpacing(14 * 0.625)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .padding(.bottom, 40)

            VStack(spacing: 24) {
                CTAButton(title: L10n.t("Match Again"), style: .neon, busy: busy) {
                    guard !busy else { return }
                    busy = true
                    let m = mode
                    Task {
                        await MatchStore.shared.startMatch(mode: m)
                        busy = false
                    }
                }
                .shadow(color: Color.black.opacity(0.1), radius: 15, x: 0, y: 10)

                Button {
                    AppActions.shared.openPreferencesSheet(mode)
                } label: {
                    Text(L10n.t("Modify Preferences"))
                        .font(Theme.font(10))
                        .tracking(Theme.tracking(0.15, size: 10))
                        .foregroundColor(Theme.C.outline)
                        .underline()
                        .padding(.vertical, 4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: 320)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.vertical, 64)
    }

    private var bodyText: String {
        if let m = message?.trimmingCharacters(in: .whitespacesAndNewlines), !m.isEmpty { return m }
        return mode == .romantic
            ? L10n.t("No suitable match this week. See you next Friday.")
            : L10n.pick("No suitable friend candidates this round. Adjust your preferences or try matching again.",
                        "本轮暂无合适的朋友候选，调整偏好后再试试吧。")
    }
}

/// Romantic matched / confirming / relationship without `partner.nickname` (§1.8).
struct PartnerMissingCard: View {
    let mode: MatchMode

    @State private var busy = false

    var body: some View {
        VStack(spacing: 0) {
            FlatEmptyIcon(material: "person_off", tone: .muted)
                .padding(.bottom, 24)

            Text(L10n.t("Profile Unavailable"))
                .font(Theme.font(18, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                .foregroundColor(Theme.C.onSurface)
                .multilineTextAlignment(.center)
                .padding(.bottom, 8)

            Text(L10n.pick("This profile is unavailable — it may be updating or the account has changed.",
                           "该资料暂时不可用——可能正在更新，或账号已变更。"))
                .font(Theme.font(14))
                .lineSpacing(14 * 0.625)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .padding(.bottom, 40)

            CTAButton(title: L10n.pick("Refresh", "刷新"), style: .neon, busy: busy) {
                guard !busy else { return }
                busy = true
                let m = mode
                Task {
                    await MatchStore.shared.reload(mode: m)
                    busy = false
                }
            }
            .shadow(color: Color.black.opacity(0.1), radius: 15, x: 0, y: 10)
            .frame(maxWidth: 320)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.vertical, 64)
    }
}
