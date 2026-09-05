import Foundation

// MARK: - QuestionnaireService (api-matching-questionnaire.md §5–§6) — WP-05
//
// Every call is JWT-guarded (no public endpoints in this domain). The H5 makes no polling,
// caching or dedup here — each page entry re-fetches; the view model owns sequencing.

enum QuestionnaireService {
    /// `GET /questionnaire/active?type=romantic|friend` — the single active version of that
    /// type with enabled questions (ordered) and their options (ordered).
    /// 404 `No questionnaire available` when the mode has no active version.
    static func active(mode: MatchMode) async throws -> QuestionnaireVersion {
        try await APIClient.shared.request(
            .get("/questionnaire/active", query: [URLQueryItem(name: "type", value: mode.rawValue)])
        )
    }

    /// `GET /questionnaire/completion` — both modes at once (`?type` is ignored by the backend,
    /// gotcha 18). `completed` = every required enabled question of the active version answered.
    static func completion() async throws -> QuestionnaireCompletion {
        try await APIClient.shared.request(.get("/questionnaire/completion"))
    }

    /// `GET /answers/mine?versionId=` — the user's saved answers for that version
    /// (`submittedAt desc`). Always pass the active version id (gotcha 13).
    static func myAnswers(versionId: String) async throws -> [MyAnswer] {
        try await APIClient.shared.request(
            .get("/answers/mine", query: [URLQueryItem(name: "versionId", value: versionId)])
        )
    }

    /// `POST /answers` — per-question upsert; blank entries must already be dropped by the caller.
    @discardableResult
    static func submit(versionId: String, answers: [AnswerItem]) async throws -> SubmitAnswersResult {
        try await APIClient.shared.request(
            .post("/answers", body: SubmitAnswersRequest(questionnaireVersionId: versionId, answers: answers))
        )
    }
}
