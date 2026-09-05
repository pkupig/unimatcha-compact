import SwiftUI

// MARK: - MatchPlanView (h5-match.md §1.3, design §9) — idle & searching, romantic & friend — WP-06
//
// Top → bottom inside the plan-layout pane (padding 64+sat / 30 / 96+sab):
//   1. title 26 / 800 / −0.025em on-surface
//   2. subtitle 14 / lh 1.65 / mp-sub, mt 6, min-height 3.3em (always two lines tall)
//   3. bleeding neon countdown card (`RevealCountdownCard`), mt 14, bleeds 22 pt past the gutter
//   4. read-only summary box (`PreferenceSummaryBox`), mt 20, flex 1, min-height 88
//   5. CTA: neon "Join Matching Pool" (r12, 17/20, 14/800/+0.18em, glow) or pink-outlined "Leave Pool"
// Idle and searching are pixel-identical except copy, card corner variant, header control, body
// dimming and CTA.

struct MatchPlanView: View {
    let mode: MatchMode
    let searching: Bool
    let revealDate: Date
    let now: Date

    @ObservedObject private var store = MatchStore.shared
    @State private var ctaBusy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(Theme.font(26, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 26))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)

            Text(subtitle)
                .font(Theme.font(14))
                .lineSpacing(14 * 0.65)
                .foregroundColor(Theme.C.mpSub)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 14 * 3.3, alignment: .topLeading)
                .padding(.top, 6)

            RevealCountdownCard(mode: mode, searching: searching, revealDate: revealDate, now: now)
                .padding(.horizontal, -22)
                .padding(.top, 14)

            PreferenceSummaryBox(mode: mode, searching: searching)
                .frame(maxWidth: .infinity, minHeight: 88, maxHeight: .infinity, alignment: .top)
                .padding(.top, 20)

            cta
                .padding(.top, 14)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: Copy

    private var title: String {
        if searching { return L10n.t("Matching in Progress") }
        return mode == .romantic ? L10n.t("Start Your Journey") : L10n.t("Find New Friends")
    }

    private var subtitle: String {
        switch (mode, searching) {
        case (.romantic, false): return L10n.t("Join this week's pool — the algorithm will watch the crowd for someone on your wavelength.")
        case (.friend, false): return L10n.t("Join this week's pool to meet up to 5 friends on your wavelength.")
        case (.romantic, true): return L10n.t("Names are revealed Friday 17:00 — someone on your wavelength is walking toward you.")
        case (.friend, true): return L10n.t("Names are revealed Friday 17:00 — friends on your wavelength are on the way.")
        }
    }

    // MARK: CTA (`.mp-cta` / `.mp-cta--leave`)

    private var cta: some View {
        Button {
            guard !ctaBusy else { return }
            ctaBusy = true
            let m = mode
            let leaving = searching
            Task {
                if leaving {
                    await MatchStore.shared.stopMatch(mode: m)
                } else {
                    await MatchStore.shared.startMatch(mode: m)
                }
                ctaBusy = false
            }
        } label: {
            Text(searching ? L10n.t("Leave Pool") : L10n.t("Join Matching Pool"))
                .font(Theme.font(14, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.cta, size: 14))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .foregroundColor(searching ? Theme.C.neonPink : .black)
                .padding(.vertical, searching ? 16 : 17)
                .padding(.horizontal, 20)
                .frame(maxWidth: .infinity)
                .background(searching ? Color.clear : Theme.C.neon)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.cta, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.cta, style: .continuous)
                        .stroke(searching ? Theme.C.neonPink : Color.clear, lineWidth: 1.5)
                )
                .shadow(color: searching ? Color.clear : Theme.C.mpCardGlow, radius: 10, x: 0, y: 8)
                .contentShape(RoundedRectangle(cornerRadius: Theme.R.cta, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
        .disabled(ctaBusy)
        .opacity(ctaBusy ? 0.5 : 1)
    }
}
