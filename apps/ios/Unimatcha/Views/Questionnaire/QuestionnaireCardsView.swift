import SwiftUI

// MARK: - QuestionnaireCardsView (h5-questionnaire.md §1.1, §2.1) — overlay `questionnaire-cards`
//
// The post-setup two-card chooser (the "G rule": both questionnaires are optional, each gates
// only its own match mode). Presented by `QuestionnaireViewModel.presentCards()` as
// `.card(dismissOnBackdrop: false)` — tapping the backdrop does nothing. Shown once, right
// after the first profile setup, on top of the home Chat view; never re-shown on login.
//
// Card: `w-full max-w-md bg-white shadow-2xl` radius 10, `px-6` from the screen edges.
//   header  px-6 pt-7 pb-4 centred — 20/800 tight title + 12 variant wide sub (mt-2)
//   body    px-6 pb-6, 12 pt gap — two `border-black` rows, p-4: [icon 22 + 14/700 title] … [check 24 · Start/Retake pill]
//   footer  px-6 pb-7 — full-width "Maybe Later" (`border-outline-variant py-3.5`, 10/700 tracking .2em)

struct QuestionnaireCardsView: View {
    @ObservedObject private var vm = QuestionnaireViewModel.shared

    init() {}

    var body: some View {
        VStack(spacing: 0) {
            header
            VStack(spacing: 12) {
                modeRow(.romantic)
                modeRow(.friend)
            }
            .padding(.horizontal, Theme.Space.page)
            .padding(.bottom, 24)
            CTAButton(
                title: L10n.t("Maybe Later"),
                style: .outlineNeutral,
                paddingV: 14,
                action: { vm.dismissCards() }
            )
            .padding(.horizontal, Theme.Space.page)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: OverlayChrome.cardMaxWidthMd)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 12)
        .padding(.horizontal, Theme.Space.page)
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text(L10n.t("Complete Your Match Profile"))
                .font(Theme.font(20, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 20))
                .foregroundColor(Theme.C.primary)
                .multilineTextAlignment(.center)
            Text(L10n.t("Complete a questionnaire to unlock that mode."))
                .font(Theme.font(12))
                .tracking(Theme.tracking(Theme.Tracking.wide, size: 12))
                .lineSpacing(4)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Space.page)
        .padding(.top, 28)
        .padding(.bottom, 16)
    }

    /// `#q-card-romantic` / `#q-card-friend`: neutral until the completion response lands.
    private func modeRow(_ mode: MatchMode) -> some View {
        let completed = vm.isCardCompleted(mode)
        return HStack(spacing: 16) {
            HStack(spacing: 12) {
                MaterialIcon(name: QuestionnaireCopy.modeIcon(mode), size: 22, color: Theme.C.primary)
                Text(QuestionnaireCopy.cardTitle(mode))
                    .font(Theme.font(14, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 14))
                    .foregroundColor(Theme.C.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                if completed {
                    // Completed tick — neon by intent (h5-questionnaire gotcha 8: the H5 CSS meant
                    // neon but the class was never applied; iOS chooses the intended colour).
                    MaterialIcon(name: "check_circle", size: 24, filled: true, color: Theme.C.neon)
                        .transition(.opacity)
                }
                // `.q-card-fill`: neon/black px-4 py-2 r10, 11/700 tracking-widest, active:scale-95
                Button {
                    vm.startFromCards(mode: mode)
                } label: {
                    Text(completed ? L10n.t("Retake") : L10n.t("Start"))
                        .font(Theme.font(11, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 11))
                        .foregroundColor(.black)
                        .lineLimit(1)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Theme.C.neon)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            }
        }
        .padding(16)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.borderStrong, lineWidth: 1)
        )
        .animation(Theme.Motion.fade, value: completed)
    }
}
