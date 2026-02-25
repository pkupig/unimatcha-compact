import SwiftUI

struct QuestionnaireView: View {
    @EnvironmentObject var vm: QuestionnaireViewModel
    let onComplete: () -> Void
    
    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemBackground).ignoresSafeArea()
                
                if vm.isLoading {
                    LoadingView(message: "加载问卷中...")
                } else if let _ = vm.questionnaire {
                    questionContent
                } else if let err = vm.errorMessage {
                    VStack(spacing: 12) {
                        Text("⚠️").font(.system(size: 44))
                        Text(err).multilineTextAlignment(.center).foregroundColor(.secondary)
                        Button("重试") { Task { await vm.loadQuestionnaire() } }.foregroundColor(Color(red: 1, green: 0.30, blue: 0.43))
                    }.padding()
                }
            }
        }
        .task { if vm.questionnaire == nil { await vm.loadQuestionnaire() } }
        .onChange(of: vm.isSubmitted) { submitted in
            if submitted { onComplete() }
        }
    }
    
    private var questionContent: some View {
        VStack(spacing: 0) {
            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color(.systemGray5)).frame(height: 4)
                    Rectangle().fill(Color(red: 1, green: 0.30, blue: 0.43))
                        .frame(width: geo.size.width * vm.progress, height: 4)
                        .animation(.spring(), value: vm.progress)
                }
            }.frame(height: 4)
            
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Question header
                    if let q = vm.currentQuestion {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("问题 \(vm.currentIndex + 1) / \(vm.questionnaire?.questions.count ?? 0)")
                                .font(.caption).foregroundColor(.secondary)
                            Text(q.title)
                                .font(.system(size: 20, weight: .semibold))
                                .lineSpacing(4)
                            if let desc = q.description, !desc.isEmpty {
                                Text(desc).font(.subheadline).foregroundColor(.secondary)
                            }
                        }
                        .padding(.top, 24)
                        
                        // Answer input
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
                            TextInput(answer: vm.getStringAnswer(q.id)) { val in
                                vm.setAnswer(questionId: q.id, value: val)
                            }
                        }
                    }
                }
                .padding(20)
            }
            
            // Navigation buttons
            HStack(spacing: 12) {
                if vm.currentIndex > 0 {
                    Button(action: { vm.currentIndex -= 1 }) {
                        Text("上一题")
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(Color(.systemGray6)).foregroundColor(.primary)
                            .cornerRadius(14).font(.system(size: 16, weight: .medium))
                    }
                }
                
                Button(action: handleNext) {
                    HStack {
                        if vm.isSubmitting { ProgressView().tint(.white).scaleEffect(0.8) }
                        Text(vm.isLastQuestion ? "提交问卷" : "下一题")
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(!vm.isCurrentQuestionAnswered() ? Color.gray.opacity(0.3) : Color(red: 1, green: 0.30, blue: 0.43))
                    .foregroundColor(.white).cornerRadius(14)
                    .font(.system(size: 16, weight: .semibold))
                }
                .disabled(!vm.isCurrentQuestionAnswered() || vm.isSubmitting)
            }
            .padding(20)
            .background(Color(.systemBackground))
        }
    }
    
    private func handleNext() {
        if vm.isLastQuestion {
            Task { await vm.submitAnswers() }
        } else {
            vm.currentIndex += 1
        }
    }
}

// MARK: - Answer Input Components

struct SingleChoiceInput: View {
    let question: Question
    let answer: String
    let onSelect: (String) -> Void
    
    var body: some View {
        VStack(spacing: 10) {
            ForEach(question.options ?? []) { opt in
                Button(action: { onSelect(opt.value) }) {
                    HStack {
                        Circle()
                            .stroke(answer == opt.value ? Color(red: 1, green: 0.30, blue: 0.43) : Color.gray.opacity(0.4), lineWidth: 2)
                            .frame(width: 22, height: 22)
                            .overlay(answer == opt.value ? Circle().fill(Color(red: 1, green: 0.30, blue: 0.43)).frame(width: 12, height: 12) : nil)
                        Text(opt.label).font(.system(size: 15))
                        Spacer()
                    }
                    .padding(14).background(answer == opt.value ? Color(red: 1, green: 0.30, blue: 0.43).opacity(0.08) : Color(.systemGray6))
                    .cornerRadius(12).foregroundColor(.primary)
                }
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
                Button(action: { onToggle(opt.value) }) {
                    HStack {
                        RoundedRectangle(cornerRadius: 5)
                            .stroke(answers.contains(opt.value) ? Color(red: 1, green: 0.30, blue: 0.43) : Color.gray.opacity(0.4), lineWidth: 2)
                            .frame(width: 22, height: 22)
                            .overlay(answers.contains(opt.value) ? Image(systemName: "checkmark").foregroundColor(Color(red: 1, green: 0.30, blue: 0.43)).font(.system(size: 12, weight: .bold)) : nil)
                        Text(opt.label).font(.system(size: 15))
                        Spacer()
                    }
                    .padding(14).background(answers.contains(opt.value) ? Color(red: 1, green: 0.30, blue: 0.43).opacity(0.08) : Color(.systemGray6))
                    .cornerRadius(12).foregroundColor(.primary)
                }
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
                Text("完全不同意").font(.caption).foregroundColor(.secondary)
                Spacer()
                Text("完全同意").font(.caption).foregroundColor(.secondary)
            }
            HStack(spacing: 12) {
                ForEach(1...5, id: \.self) { i in
                    Button(action: { onSelect(i) }) {
                        Text("\(i)").frame(width: 52, height: 52)
                            .background(answer == i ? Color(red: 1, green: 0.30, blue: 0.43) : Color(.systemGray6))
                            .foregroundColor(answer == i ? .white : .primary)
                            .cornerRadius(12).font(.system(size: 18, weight: .semibold))
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }
}

struct TextInput: View {
    let answer: String
    let onChange: (String) -> Void
    @State private var text: String
    
    init(answer: String, onChange: @escaping (String) -> Void) {
        self.answer = answer; self.onChange = onChange
        _text = State(initialValue: answer)
    }
    
    var body: some View {
        TextEditor(text: $text)
            .frame(minHeight: 100)
            .padding(12).background(Color(.systemGray6)).cornerRadius(12)
            .font(.system(size: 15))
            .onChange(of: text) { onChange($0) }
    }
}
