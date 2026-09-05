import SwiftUI

// MARK: - Questionnaire gate views (h5-match.md §1.9 wall, §1.10 refill banner) — WP-06
//
// Wall (only idle/unknown users with an incomplete questionnaire): neon 64 pt icon tile
// (`group` friend / `auto_awesome` romantic), title "Friend|Romantic Questionnaire", body
// "A few quick questions unlock friend|romantic matching." (max-w 15rem, mb 40), `.btn-cta`
// "Fill Out Questionnaire" → `AppActions.openQuestionnaire(mode)`.
// Banner (in pool / matched / relationship + incomplete): max-w-xs, px 16 py 12, r10, neon 15 %,
// 12 pt text + neon pill "Refill" (10/700/widest) → same action.

struct QuestionnaireWallCard: View {
    let mode: MatchMode

    var body: some View {
        VStack(spacing: 0) {
            FlatEmptyIcon(material: mode == .friend ? "group" : "auto_awesome", tone: .neon)
                .padding(.bottom, 24)

            Text(mode == .friend ? L10n.t("Friend Questionnaire") : L10n.t("Romantic Questionnaire"))
                .font(Theme.font(18, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                .foregroundColor(Theme.C.onSurface)
                .multilineTextAlignment(.center)
                .padding(.bottom, 8)

            Text(mode == .friend
                 ? L10n.t("A few quick questions unlock friend matching.")
                 : L10n.t("A few quick questions unlock romantic matching."))
                .font(Theme.font(14))
                .lineSpacing(14 * 0.625)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 240)
                .padding(.bottom, 40)

            CTAButton(title: L10n.t("Fill Out Questionnaire"), style: .neon) {
                AppActions.shared.openQuestionnaire(mode)
            }
            .shadow(color: Color.black.opacity(0.1), radius: 15, x: 0, y: 10)
            .frame(maxWidth: 320)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.vertical, 64)
    }
}

struct QuestionnaireRefillBanner: View {
    let mode: MatchMode

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(L10n.t("Questionnaire updated — refill for better matches"))
                .font(Theme.font(12))
                .foregroundColor(Theme.C.onSurface)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button {
                AppActions.shared.openQuestionnaire(mode)
            } label: {
                Text(L10n.t("Refill"))
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                    .foregroundColor(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Theme.C.neon))
                    .contentShape(Capsule())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous).fill(Theme.C.neonTint15))
        .frame(maxWidth: 320)
    }
}
