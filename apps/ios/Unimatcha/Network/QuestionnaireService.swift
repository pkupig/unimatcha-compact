// Interface outline: implementation bodies removed.
import Foundation
struct QuestionnaireService {
    static func active(mode: MatchMode) async throws -> QuestionnaireVersion
    static func completion() async throws -> QuestionnaireCompletion
    static func submit(versionId: String, answers: [AnswerItem]) async throws -> SubmitAnswersResult
