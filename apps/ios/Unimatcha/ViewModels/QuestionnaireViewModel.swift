import Foundation
import SwiftUI

@MainActor
final class QuestionnaireViewModel: ObservableObject {
    @Published var mode: MatchMode = .romantic
    @Published var questionnaire: QuestionnaireVersion?
    @Published var isLoading = false
    @Published var isSubmitting = false
    @Published var isSubmitted = false
    @Published var errorMessage: String?
    @Published var currentIndex = 0
    @Published var answers: [String: Any] = [:]

    func load(mode: MatchMode) async {
        self.mode = mode
        isLoading = true; errorMessage = nil
        do { questionnaire = try await QuestionnaireService.active(mode: mode) }
        catch let error as APIError { errorMessage = error.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func setAnswer(questionId: String, value: Any) { answers[questionId] = value }
    func getStringAnswer(_ q: String) -> String { answers[q] as? String ?? "" }
    func getArrayAnswer(_ q: String) -> [String] { answers[q] as? [String] ?? [] }
    func getScaleAnswer(_ q: String) -> Int { answers[q] as? Int ?? 3 }

    func isCurrentQuestionAnswered() -> Bool {
        guard let q = currentQuestion else { return true }
        if !(q.isRequired ?? false) { return true }
        let val = answers[q.id]
        if q.type == .text { return !(val as? String ?? "").isEmpty }
        if q.type == .multipleChoice { return !(val as? [String] ?? []).isEmpty }
        return val != nil
    }

    var currentQuestion: Question? {
        guard let qs = questionnaire?.questions, currentIndex < qs.count else { return nil }
        return qs[currentIndex]
    }
    var progress: Double {
        guard let count = questionnaire?.questions.count, count > 0 else { return 0 }
        return Double(currentIndex + 1) / Double(count)
    }
    var isLastQuestion: Bool {
        guard let count = questionnaire?.questions.count else { return false }
        return currentIndex == count - 1
    }

    func submitAnswers() async {
        guard let q = questionnaire else { return }
        isSubmitting = true; errorMessage = nil
        let items: [AnswerItem] = q.questions.compactMap { question in
            guard let val = answers[question.id] else { return nil }
            return AnswerItem(questionId: question.id, value: AnyCodable(val))
        }
        do {
            _ = try await QuestionnaireService.submit(versionId: q.id, answers: items)
            isSubmitted = true
        } catch let error as APIError { errorMessage = error.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isSubmitting = false
    }
}
