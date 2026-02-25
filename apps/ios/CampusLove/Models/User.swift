import Foundation

// MARK: - User Models

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let mode: UserMode
    let status: UserStatus
    let hasProfile: Bool?
    let profileCompleteness: Int?
}

enum UserMode: String, Codable {
    case matchMode = "MATCH_MODE"
    case relationshipMode = "RELATIONSHIP_MODE"
}

enum UserStatus: String, Codable {
    case active = "ACTIVE"
    case banned = "BANNED"
}

// MARK: - Auth

struct AuthResponse: Codable {
    let user: User
    let token: String
}

// MARK: - Profile

struct UserProfile: Codable {
    let id: String?
    let userId: String?
    var nickname: String?
    var school: String?
    var grade: String?
    var gender: String?
    var genderPref: String?
    var age: Int?
    var city: String?
    var interests: [String]?
    var bio: String?
    var avatarUrl: String?
    let profileCompleteness: Int?
}

struct CreateProfileRequest: Codable {
    let nickname: String
    let school: String
    let grade: String
    let gender: String
    let genderPref: String
    let age: Int
    let city: String
    let interests: [String]
    let bio: String?
    let avatarUrl: String?
}

// MARK: - Questionnaire

struct QuestionnaireVersion: Codable, Identifiable {
    let id: String
    let version: Int
    let title: String
    let description: String?
    let questions: [Question]
}

struct Question: Codable, Identifiable {
    let id: String
    let type: QuestionType
    let title: String
    let description: String?
    let isRequired: Bool
    let order: Int
    let group: String?
    let options: [QuestionOption]?
}

enum QuestionType: String, Codable {
    case singleChoice = "SINGLE_CHOICE"
    case multipleChoice = "MULTIPLE_CHOICE"
    case scale = "SCALE"
    case text = "TEXT"
}

struct QuestionOption: Codable, Identifiable {
    let id: String
    let label: String
    let value: String
    let order: Int
}

// MARK: - Answers

struct AnswerItem: Codable {
    let questionId: String
    let value: AnyCodable
}

struct SubmitAnswersRequest: Codable {
    let questionnaireVersionId: String
    let answers: [AnswerItemRaw]
}

struct AnswerItemRaw: Codable {
    let questionId: String
    let value: AnyCodable
}

// MARK: - Matching

struct MatchStatus: Codable {
    let mode: UserMode
    let matchConfig: MatchConfigInfo?
    let currentMatch: CurrentMatchInfo?
}

struct MatchConfigInfo: Codable {
    let cronExpr: String
    let description: String?
}

struct CurrentMatchInfo: Codable {
    let id: String
    let status: String
}

struct MatchResult: Codable {
    let matched: Bool
    let matchId: String?
    let status: String?
    let matchedAt: String?
    let partner: PublicProfile?
}

struct PublicProfile: Codable {
    let nickname: String?
    let school: String?
    let grade: String?
    let age: Int?
    let city: String?
    let interests: [String]?
    let bio: String?
    let avatarUrl: String?
}

// MARK: - API Response wrapper

struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let message: String?
}

// MARK: - AnyCodable helper

struct AnyCodable: Codable {
    let value: Any
    
    init(_ value: Any) { self.value = value }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let string = try? container.decode(String.self) { value = string }
        else if let bool = try? container.decode(Bool.self) { value = bool }
        else if let array = try? container.decode([AnyCodable].self) { value = array.map { $0.value } }
        else { value = "" }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let int = value as? Int { try container.encode(int) }
        else if let double = value as? Double { try container.encode(double) }
        else if let string = value as? String { try container.encode(string) }
        else if let bool = value as? Bool { try container.encode(bool) }
        else if let array = value as? [String] { try container.encode(array) }
        else { try container.encodeNil() }
    }
}
