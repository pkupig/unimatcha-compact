import Foundation

// MARK: - Questionnaire (GET /questionnaire/active?type=romantic|friend)
struct QuestionnaireVersion: Codable, Identifiable {
    let id: String
    let version: Int?
    let type: String?
    let title: String?
    let description: String?
    let questions: [Question]
}

struct Question: Codable, Identifiable {
    let id: String
    let type: QuestionType
    let title: String
    let description: String?
    let isRequired: Bool?
    let isEnabled: Bool?
    let order: Int?
    let group: String?
    let options: [QuestionOption]?
}

enum QuestionType: String, Codable {
    case singleChoice = "SINGLE_CHOICE"
    case multipleChoice = "MULTIPLE_CHOICE"
    case scale = "SCALE"
    case text = "TEXT"
    init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "TEXT"
        self = QuestionType(rawValue: raw) ?? .text
    }
}

struct QuestionOption: Codable, Identifiable {
    let optionId: String?
    let label: String?
    let value: String?
    let order: Int?
    var id: String { value ?? label ?? optionId ?? UUID().uuidString }
    enum CodingKeys: String, CodingKey {
        case optionId = "id", label, value, order
    }
}

// completion status
struct QuestionnaireCompletion: Codable {
    let romantic: ModeCompletion?
    let friend: ModeCompletion?
}
struct ModeCompletion: Codable {
    let completed: Bool?
    let versionId: String?
}

// MARK: - Submit answers (POST /answers)
struct SubmitAnswersRequest: Codable {
    let questionnaireVersionId: String
    let answers: [AnswerItem]
}
struct AnswerItem: Codable {
    let questionId: String
    let value: AnyCodable
}
struct SubmitAnswersResult: Codable {
    let message: String?
    let answeredCount: Int?
    let questionnaireVersion: Int?
}
