import Foundation
import SwiftUI

@MainActor
final class QuestionnaireViewModel: ObservableObject {
    @Published var questionnaire: QuestionnaireVersion?
    @Published var isLoading = false
    @Published var isSubmitting = false
    @Published var isSubmitted = false
    @Published var errorMessage: String?
    @Published var currentIndex = 0
    
    // Answers: [questionId: answer value]
    @Published var answers: [String: Any] = [:]
    
    func loadQuestionnaire() async {
        isLoading = true
        do {
            questionnaire = try await QuestionnaireService.getActiveQuestionnaire()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func setAnswer(questionId: String, value: Any) {
        answers[questionId] = value
    }
    
    func getStringAnswer(_ questionId: String) -> String {
        return answers[questionId] as? String ?? ""
    }
    
    func getArrayAnswer(_ questionId: String) -> [String] {
        return answers[questionId] as? [String] ?? []
    }
    
    func getScaleAnswer(_ questionId: String) -> Int {
        return answers[questionId] as? Int ?? 3
    }
    
    func isCurrentQuestionAnswered() -> Bool {
        guard let q = currentQuestion else { return true }
        if !q.isRequired { return true }
        let val = answers[q.id]
        if q.type == .text { return (val as? String ?? "").isEmpty == false }
        if q.type == .multipleChoice { return (val as? [String] ?? []).isEmpty == false }
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
        isSubmitting = true
        errorMessage = nil
        
        let items: [AnswerItemRaw] = q.questions.compactMap { question in
            guard let val = answers[question.id] else { return nil }
            return AnswerItemRaw(questionId: question.id, value: AnyCodable(val))
        }
        
        do {
            _ = try await QuestionnaireService.submitAnswers(versionId: q.id, answers: items)
            isSubmitted = true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
