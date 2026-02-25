import Foundation

struct QuestionnaireService {
    static func getActiveQuestionnaire() async throws -> QuestionnaireVersion {
        return try await APIClient.shared.request("/questionnaire/active")
    }
    
    static func submitAnswers(versionId: String, answers: [AnswerItemRaw]) async throws -> SubmitSuccess {
        let body = SubmitAnswersRequest(questionnaireVersionId: versionId, answers: answers)
        return try await APIClient.shared.request("/answers", method: .POST, body: body)
    }
}

struct SubmitSuccess: Codable {
    let message: String
    let answeredCount: Int
    let questionnaireVersion: Int
}
