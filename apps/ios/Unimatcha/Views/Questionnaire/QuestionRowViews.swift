import SwiftUI

// MARK: - Question rows (h5-questionnaire.md §1.3 "#q-options") — WP-05
//
// `#q-options` is `space-y-4` (16 pt between children). Four renderings:
//   SCALE     five rows, values 1…5 top-to-bottom, labels Strongly Disagree … Strongly Agree
//             (dictionary-translated); indicator = 24 pt circle, 2 pt `outline` border, solid neon
//             disc when selected — no check glyph; nothing preselected.
//   SINGLE    one row per option (server order), label `labelEn`/`label` (server content, never
//             translated); circle indicator with a 16 pt black check on neon when selected.
//   MULTI     "Select all that apply" hint (11 pt `outline`) + rows with a `rounded-[6px]` box.
//   TEXT      optional hint when `isRequired === false` + 4-row soft textarea, "Your answer..."
// Row chrome: `px-4 py-3`, 1 pt bottom border (`outline-variant/30` → neon when selected),
// selected background `neon/10`, `active:scale-[0.99]`, 200 ms transition, label 16/500.

struct QuestionOptionsView: View {
    let question: Question
    @ObservedObject var vm: QuestionnaireViewModel

    var body: some View {
        switch question.type {
        case .scale:
            ScaleRowsView(question: question, vm: vm)
        case .singleChoice, .multipleChoice:
            ChoiceRowsView(question: question, vm: vm)
        case .text:
            TextAnswerView(question: question, vm: vm)
        }
    }
}

// MARK: - SCALE

struct ScaleRowsView: View {
    let question: Question
    @ObservedObject var vm: QuestionnaireViewModel

    var body: some View {
        let selected = vm.scaleAnswer(question.id)
        VStack(spacing: 16) {
            ForEach(Array(QuestionnaireCopy.scaleLabels.enumerated()), id: \.offset) { pair in
                let value = pair.offset + 1          // 1 = Strongly Disagree … 5 = Strongly Agree
                AnswerRow(
                    label: L10n.t(pair.element),
                    selected: selected == value,
                    indicator: .circle,
                    showsCheck: false
                ) {
                    vm.answerScale(question.id, value)
                }
            }
        }
    }
}

// MARK: - SINGLE / MULTIPLE choice

struct ChoiceRowsView: View {
    let question: Question
    @ObservedObject var vm: QuestionnaireViewModel

    private var isMulti: Bool { question.type == .multipleChoice }

    var body: some View {
        let single = vm.singleAnswer(question.id)
        let multi = vm.multiAnswer(question.id)
        VStack(alignment: .leading, spacing: 16) {
            if isMulti {
                OptionHint(text: L10n.t("Select all that apply"))
            }
            ForEach(question.options) { option in
                let isSelected = isMulti ? multi.contains(option.value) : (single == option.value)
                AnswerRow(
                    label: option.displayLabel,
                    selected: isSelected,
                    indicator: isMulti ? .box : .circle,
                    showsCheck: true
                ) {
                    if isMulti {
                        vm.toggleMulti(question.id, value: option.value)
                    } else {
                        vm.answerSingle(question.id, value: option.value)
                    }
                }
            }
        }
    }
}

// MARK: - TEXT

struct TextAnswerView: View {
    let question: Question
    @ObservedObject var vm: QuestionnaireViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if question.isOptionalText {
                OptionHint(text: L10n.t("Optional — leave blank to skip"))
            }
            // `<textarea rows="4" class="w-full bg-surface-container-low rounded-[10px]
            // border-0 px-3 py-2.5 focus:ring-1 focus:ring-neon">` — no text-size class, so it
            // inherits the 16 px body size (unlike the 14 px edit-profile soft fields).
            SoftTextArea(
                text: Binding(
                    get: { vm.textAnswer(question.id) },
                    set: { vm.answerText(question.id, $0) }
                ),
                placeholder: L10n.placeholder("Your answer..."),
                rows: 4,
                size: 16
            )
        }
    }
}

// MARK: - Pieces

/// `<p class="text-[11px] text-outline">` hint line above choice / text inputs.
struct OptionHint: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Theme.font(11))
            .foregroundColor(Theme.C.outline)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// One selectable row: label left, 24 pt indicator right.
struct AnswerRow: View {
    enum Indicator { case circle, box }

    let label: String
    let selected: Bool
    let indicator: Indicator
    /// Choice rows show a black check on the neon plate; SCALE rows use the bare neon disc.
    let showsCheck: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                Text(label)
                    .font(Theme.font(16, weight: .medium))
                    .foregroundColor(Theme.C.onSurface)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                indicatorView
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(selected ? Theme.C.neonTint10 : Color.clear)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(selected ? Theme.C.neon : Theme.C.outlineVariantFill.opacity(0.3))
                    .frame(height: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleCard))
        .animation(.easeInOut(duration: 0.2), value: selected)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    /// `w-6 h-6 [rounded-full | rounded-[6px]] border-2 border-outline` (+ `bg-neon` when
    /// selected). Tailwind is border-box, so the 2 pt border sits **inside** the 24 pt box —
    /// `strokeBorder`, not `stroke`. The choice check is a 16 px Material `check`.
    @ViewBuilder
    private var indicatorView: some View {
        ZStack {
            switch indicator {
            case .circle:
                Circle().fill(selected ? Theme.C.neon : Color.clear)
                Circle().strokeBorder(Theme.C.outline, lineWidth: 2)
            case .box:
                RoundedRectangle(cornerRadius: Theme.R.feed, style: .continuous)
                    .fill(selected ? Theme.C.neon : Color.clear)
                RoundedRectangle(cornerRadius: Theme.R.feed, style: .continuous)
                    .strokeBorder(Theme.C.outline, lineWidth: 2)
            }
            if selected && showsCheck {
                MaterialIcon(name: "check", size: 16, weight: .medium, color: .black)
            }
        }
        .frame(width: 24, height: 24)
    }
}
