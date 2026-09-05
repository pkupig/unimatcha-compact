import SwiftUI

// MARK: - QuestionNavSheet (h5-questionnaire.md §1.4) — overlay `q-nav` (bottom sheet)
//
// Header: grab handle + legend row (11 pt `onSurfaceVariant`, gap 16): [12 pt neon square]
// "Answered" · [12 pt outlined square] "Unanswered". Grid: `px-5 pb-8 pt-2 grid-cols-8 gap-2`,
// max height 46 % of the screen, scrolls; cells 36 pt tall, radius 10, 12/700, 1-based number
// (not zero-padded); answered → neon/black, unanswered → 1 pt `outline-variant` border +
// `onSurfaceVariant`; the current index additionally carries a 2 pt ring (`primary`: black in
// light, near-white in dark). Tap → jump + close; backdrop tap closes (OverlayHost); drag
// the header > 110 pt closes (BottomSheetContainer). "Answered" = the shared blank rule.

struct QuestionNavSheet: View {
    @ObservedObject private var vm = QuestionnaireViewModel.shared

    private static let columns: [GridItem] = Array(
        repeating: GridItem(.flexible(minimum: 28), spacing: 8),
        count: 8
    )

    init() {}

    var body: some View {
        BottomSheetContainer(bodyMaxHeightFraction: 0.46, header: { legend }) {
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: Self.columns, spacing: 8) {
                    ForEach(Array(vm.questions.enumerated()), id: \.element.id) { pair in
                        cell(index: pair.offset, question: pair.element)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
    }

    private var legend: some View {
        // Swatches are `w-3 h-3 rounded`: the Tailwind config remaps every radius key to 10 px,
        // which the browser clamps to half of a 12 px box → they render as circles.
        HStack(spacing: 16) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Theme.C.neon)
                    .frame(width: 12, height: 12)
                Text(L10n.t("Answered"))
            }
            HStack(spacing: 6) {
                Circle()
                    .strokeBorder(Theme.C.outlineVariant, lineWidth: 1)
                    .frame(width: 12, height: 12)
                Text(L10n.t("Unanswered"))
            }
        }
        .font(Theme.font(11))
        .foregroundColor(Theme.C.onSurfaceVariant)
        .frame(maxWidth: .infinity)
    }

    private func cell(index: Int, question: Question) -> some View {
        let answered = vm.isAnswered(question.id)
        let current = index == vm.currentIndex
        return Button {
            vm.jump(to: index)
        } label: {
            Text("\(index + 1)")
                .font(Theme.font(12, weight: .bold))
                .foregroundColor(answered ? .black : Theme.C.onSurfaceVariant)
                .frame(maxWidth: .infinity)
                .frame(height: 36)
                .background(answered ? Theme.C.neon : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .stroke(answered ? Color.clear : Theme.C.outlineVariant, lineWidth: 1)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.base + 1, style: .continuous)
                        .stroke(current ? Theme.C.primary : Color.clear, lineWidth: 2)
                        .padding(-1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleSmallIcon))
        .accessibilityLabel("\(index + 1)")
        .accessibilityValue(answered ? L10n.t("Answered") : L10n.t("Unanswered"))
    }
}
