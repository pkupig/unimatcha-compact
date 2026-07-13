import Foundation

struct QuestionnaireService {
    /// Active questionnaire for a mode (?type=romantic|friend). 404 if none published.
    static func active(mode: MatchMode) async throws -> QuestionnaireVersion {
        try await APIClient.shared.request("/questionnaire/active", queryParams: ["type": mode.rawValue])
    }

    static func completion() async throws -> QuestionnaireCompletion {
        try await APIClient.shared.request("/questionnaire/completion")
    }

    @discardableResult
    static func submit(versionId: String, answers: [AnswerItem]) async throws -> SubmitAnswersResult {
        try await APIClient.shared.request("/answers", method: .POST,
            body: SubmitAnswersRequest(questionnaireVersionId: versionId, answers: answers))
    }
}
