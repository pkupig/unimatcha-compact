import SwiftUI

/// Paged questionnaire for a given `MatchMode`. Backed by the shared
/// `QuestionnaireViewModel`. Loads via `vm.load(mode:)`, renders
/// `vm.currentQuestion` by `QuestionType`, and advances with
/// `vm.currentIndex`. The last question submits via `vm.submitAnswers()`.
///
/// Used two ways:
///   • onboarding (optional) — `allowSkip: true`, user may skip entirely
///   • entering a match mode later — `allowSkip: false`, survey is required
struct QuestionnaireView: View {
    @EnvironmentObject var vm: QuestionnaireViewModel

    let mode: MatchMode
    var allowSkip: Bool = false
    let onComplete: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                if vm.isLoading {
                    LoadingView(message: "加载问卷中…")
                } else if vm.questionnaire != nil, vm.currentQuestion != nil {
                    questionContent
                } else if let err = vm.errorMessage {
                    errorState(err)
                } else {
                    // Loaded but empty (no questions configured for this mode).
                    emptyState
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbar {
                if allowSkip {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("跳过") { onComplete() }
                            .foregroundColor(Theme.textSecondary)
                    }
                }
            }
        }
        .tint(Theme.accent)
        .task {
            // Load if we don't already have this mode's questionnaire.
            if vm.questionnaire == nil || vm.mode != mode {
                vm.currentIndex = 0
                await vm.load(mode: mode)
            }
        }
        .onChange(of: vm.isSubmitted) { submitted in
            if submitted { onComplete() }
        }
    }

    // MARK: - Main content

    private var questionContent: some View {
        VStack(spacing: 0) {
            progressBar

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if let q = vm.currentQuestion {
                        questionHeader(q)
                        answerInput(for: q)
                    }
                }
                .padding(20)
            }

            navBar
        }
    }

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.surfaceHi)
                    .frame(height: 5)
                Capsule().fill(Theme.accentGradient)
                    .frame(width: max(6, geo.size.width * vm.progress), height: 5)
                    .animation(.spring(response: 0.4, dampingFraction: 0.85), value: vm.progress)
            }
        }
        .frame(height: 5)
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    private func questionHeader(_ q: Question) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("问题 \(vm.currentIndex + 1) / \(vm.questionnaire?.questions.count ?? 0)")
                .font(.caption.weight(.semibold))
                .foregroundColor(Theme.accent)
            Text(q.title)
                .font(.system(size: 21, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .lineSpacing(4)
            if let desc = q.description, !desc.isEmpty {
                Text(desc)
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }
            if q.isRequired == false {
                Text("（可选）")
                    .font(.caption)
                    .foregroundColor(Theme.textMuted)
            }
        }
        .padding(.top, 12)
    }

    @ViewBuilder
    private func answerInput(for q: Question) -> some View {
        switch q.type {
        case .singleChoice:
            SingleChoiceInput(question: q, answer: vm.getStringAnswer(q.id)) { val in
                vm.setAnswer(questionId: q.id, value: val)
            }
        case .multipleChoice:
            MultipleChoiceInput(question: q, answers: vm.getArrayAnswer(q.id)) { val in
                var current = vm.getArrayAnswer(q.id)
                if current.contains(val) { current.removeAll { $0 == val } }
                else { current.append(val) }
                vm.setAnswer(questionId: q.id, value: current)
            }
        case .scale:
            ScaleInput(answer: vm.getScaleAnswer(q.id)) { val in
                vm.setAnswer(questionId: q.id, value: val)
            }
        case .text:
            QuestionTextInput(answer: vm.getStringAnswer(q.id)) { val in
                vm.setAnswer(questionId: q.id, value: val)
            }
        }
    }

    private var navBar: some View {
        HStack(spacing: 12) {
            if vm.currentIndex > 0 {
                Button {
                    vm.currentIndex -= 1
                } label: {
                    Text("上一题")
                }
                .buttonStyle(GhostButtonStyle())
                .frame(maxWidth: 120)
            }

            Button {
                handleNext()
            } label: {
                HStack(spacing: 8) {
                    if vm.isSubmitting {
                        ProgressView().tint(Theme.onAccent).scaleEffect(0.85)
                    }
                    Text(vm.isLastQuestion ? "提交问卷" : "下一题")
                }
            }
            .buttonStyle(NeonButtonStyle(enabled: vm.isCurrentQuestionAnswered() && !vm.isSubmitting))
            .disabled(!vm.isCurrentQuestionAnswered() || vm.isSubmitting)
        }
        .padding(20)
        .background(Theme.surfaceLo.ignoresSafeArea(edges: .bottom))
    }

    // MARK: - Non-question states

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 44))
                .foregroundColor(Theme.warning)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundColor(Theme.textSecondary)
            Button("重试") {
                Task { await vm.load(mode: mode) }
            }
            .buttonStyle(GhostButtonStyle())
            .frame(maxWidth: 160)
            if allowSkip {
                Button("暂时跳过") { onComplete() }
                    .font(.subheadline)
                    .foregroundColor(Theme.textMuted)
            }
        }
        .padding(32)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "checklist")
                .font(.system(size: 44))
                .foregroundColor(Theme.textMuted)
            Text("本模式暂无问卷")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)
            Text("你可以先进入应用，之后再来完善")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
            Button("继续") { onComplete() }
                .buttonStyle(NeonButtonStyle())
                .frame(maxWidth: 200)
        }
        .padding(32)
    }

    private func handleNext() {
        if vm.isLastQuestion {
            Task { await vm.submitAnswers() }
        } else {
            vm.currentIndex += 1
        }
    }
}

// MARK: - Answer inputs (themed)

struct SingleChoiceInput: View {
    let question: Question
    let answer: String
    let onSelect: (String) -> Void

    var body: some View {
        VStack(spacing: 10) {
            ForEach(question.options ?? []) { opt in
                let value = opt.value ?? opt.id
                let isOn = answer == value
                Button {
                    onSelect(value)
                } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .stroke(isOn ? Theme.accent : Theme.outline, lineWidth: 2)
                                .frame(width: 22, height: 22)
                            if isOn {
                                Circle().fill(Theme.accent).frame(width: 12, height: 12)
                            }
                        }
                        Text(opt.label ?? value)
                            .font(.system(size: 15))
                            .foregroundColor(Theme.textPrimary)
                        Spacer()
                    }
                    .padding(14)
                    .background(isOn ? Theme.accent.opacity(0.10) : Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.radiusSm)
                            .stroke(isOn ? Theme.accent : Theme.outline, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct MultipleChoiceInput: View {
    let question: Question
    let answers: [String]
    let onToggle: (String) -> Void

    var body: some View {
        VStack(spacing: 10) {
            ForEach(question.options ?? []) { opt in
                let value = opt.value ?? opt.id
                let isOn = answers.contains(value)
                Button {
                    onToggle(value)
                } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(isOn ? Theme.accent : Theme.outline, lineWidth: 2)
                                .frame(width: 22, height: 22)
                            if isOn {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(Theme.accent)
                            }
                        }
                        Text(opt.label ?? value)
                            .font(.system(size: 15))
                            .foregroundColor(Theme.textPrimary)
                        Spacer()
                    }
                    .padding(14)
                    .background(isOn ? Theme.accent.opacity(0.10) : Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.radiusSm)
                            .stroke(isOn ? Theme.accent : Theme.outline, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ScaleInput: View {
    let answer: Int
    let onSelect: (Int) -> Void

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("完全不同意").font(.caption).foregroundColor(Theme.textMuted)
                Spacer()
                Text("完全同意").font(.caption).foregroundColor(Theme.textMuted)
            }
            HStack(spacing: 10) {
                ForEach(1...5, id: \.self) { i in
                    let isOn = answer == i
                    Button {
                        onSelect(i)
                    } label: {
                        Text("\(i)")
                            .font(.system(size: 18, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .foregroundColor(isOn ? Theme.onAccent : Theme.textPrimary)
                            .background(
                                Group {
                                    if isOn { AnyView(Theme.accentGradient) }
                                    else { AnyView(Theme.surfaceHi) }
                                }
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.radiusSm)
                                    .stroke(isOn ? Color.clear : Theme.outline, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 8)
    }
}

/// Free-text answer editor (renamed to avoid clashing with any global `TextInput`).
struct QuestionTextInput: View {
    let answer: String
    let onChange: (String) -> Void
    @State private var text: String

    init(answer: String, onChange: @escaping (String) -> Void) {
        self.answer = answer
        self.onChange = onChange
        _text = State(initialValue: answer)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text("在这里输入你的回答…")
                    .font(.system(size: 15))
                    .foregroundColor(Theme.textMuted)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 14)
            }
            TextEditor(text: $text)
                .font(.system(size: 15))
                .foregroundColor(Theme.textPrimary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 110)
                .padding(6)
                .onChange(of: text) { onChange($0) }
        }
        .background(Theme.surfaceHi)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
    }
}
