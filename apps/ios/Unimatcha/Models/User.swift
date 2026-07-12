import Foundation

// MARK: - User Models

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let mode: UserMode
    let status: UserStatus
    let hasProfile: Bool?
    let profileCompleteness: Int?
    let matchState: String?
    let matchSearchingSince: String?
    let verificationStatus: String?   // unverified | pending | verified | rejected
}

enum UserMode: String, Codable {
    case matchMode = "MATCH_MODE"
    case relationshipMode = "RELATIONSHIP_MODE"
}

enum UserStatus: String, Codable {
    case active = "ACTIVE"
    case banned = "BANNED"
}

enum VerificationStatus: String, Codable {
    case unverified
    case pending
    case verified
    case rejected
}

// MARK: - Auth

struct AuthResponse: Codable {
    let user: User
    let token: String
}

// MARK: - Social Links

struct SocialLinks: Codable {
    var wechat: String?
    var qq: String?
    var xiaohongshu: String?
    var weibo: String?
    var instagram: String?

    init(wechat: String? = nil, qq: String? = nil, xiaohongshu: String? = nil,
         weibo: String? = nil, instagram: String? = nil) {
        self.wechat = wechat; self.qq = qq; self.xiaohongshu = xiaohongshu
        self.weibo = weibo; self.instagram = instagram
    }
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
    var socialLinks: SocialLinks?
    var relationshipScore: Double?
    let profileCompleteness: Int?
    var signature: String?
    var coverUrl: String?
    var tags: [String]?
    // 第三轮新增
    var major: String?
    var mbti: String?
    var nationality: String?
    var realPhotos: [String]?
    var zodiac: String?
}

struct CreateProfileRequest: Codable {
    var nickname: String
    var school: String
    var grade: String
    var gender: String
    var genderPref: String
    var age: Int
    var city: String
    var interests: [String]?
    var bio: String?
    var avatarUrl: String?
    var socialLinks: SocialLinks?
    var signature: String?
    var coverUrl: String?
    var tags: [String]?
    // 第三轮新增
    var major: String?
    var mbti: String?
    var nationality: String?
    var realPhotos: [String]?
    var zodiac: String?
}

// MARK: - Match Preferences

struct UserMatchPreferences: Codable {
    var requireSameCity: Bool
    var requireSameUniversity: Bool
    var requireSameMajor: Bool           // 预留
    var preferredNationalities: [String] // 预留
    var preferredMbti: [String]          // 预留

    static var defaultPrefs: UserMatchPreferences {
        UserMatchPreferences(
            requireSameCity: false,
            requireSameUniversity: false,
            requireSameMajor: false,
            preferredNationalities: [],
            preferredMbti: []
        )
    }
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

// MARK: - Matching State Machine

enum MatchState: String, Codable {
    case idle
    case searching
    case noMatch = "no_match"   // 本周算法运行完毕，未找到合适对象
    case proposed               // 兼容旧数据保留
    case matched                // 旧状态，兼容保留
    case relationship
}

struct FullMatchStatus: Codable {
    let state: MatchState
    let mode: UserMode
    let matchConfig: MatchConfigInfo?
    let match: MatchInfo?
    let partner: PublicProfile?
    let searchingSince: String?
    let message: String?        // no_match 状态下的提示文案
}

struct MatchInfo: Codable {
    let id: String?
    let status: String?
    let myConfirmed: Bool?
    let partnerConfirmed: Bool?
    let score: Double?
    let matchedAt: String?
    let confirmedAt: String?
    let relationshipStartedAt: String?
    let proposalId: String?  // 新增：即 match.id，用于 confirm/reject 接口
}

struct MatchStartResponse: Codable {
    let message: String
    let jobId: String?
    let status: String?
}

// Legacy — kept for backward compatibility
struct MatchStatus: Codable {
    let mode: UserMode
    let matchConfig: MatchConfigInfo?
    let currentMatch: CurrentMatchInfo?
    let isSearching: Bool?
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
    let myConfirmed: Bool?
    let partnerConfirmed: Bool?
    let confirmedAt: String?
    let relationshipStartedAt: String?
    let score: Double?
}

// MARK: - Chat

struct ChatMessage: Codable, Identifiable {
    let id: String
    let content: String
    let senderId: String
    let isRead: Bool
    let createdAt: String

    var createdDate: Date {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fmt.date(from: createdAt) ?? Date()
    }
}

struct ChatMessagesResponse: Codable {
    let messages: [ChatMessage]
    let nextCursor: String?
}

// MARK: - Public Profile

struct PublicProfile: Codable, Identifiable {
    var id: String { userId ?? UUID().uuidString }
    let userId: String?
    let nickname: String?
    let school: String?
    let grade: String?
    let age: Int?
    let city: String?
    let interests: [String]?
    let bio: String?
    let avatarUrl: String?
    let socialLinks: SocialLinks?
    let relationshipScore: Double?
    let signature: String?
    let coverUrl: String?
    let tags: [String]?
    let major: String?
    let mbti: String?
    let nationality: String?
    let realPhotos: [String]?
    let verificationStatus: String?
    let zodiac: String?
}

// MARK: - Leaderboard

struct LeaderboardEntry: Codable, Identifiable {
    var id: String { "\(rank)-\(matchId ?? "")" }
    let rank: Int
    let matchId: String?
    let metric: Double?
    let label: String?
    let durationDays: Int?
    let avgScore: Double?
    let startedAt: String?
    let coupleA: LeaderboardPerson
    let coupleB: LeaderboardPerson
}

struct LeaderboardPerson: Codable {
    let nickname: String
    let avatarUrl: String?
    let school: String?
    let score: Double?
}

// MARK: - Square (Couple Posts)

struct CouplePost: Codable, Identifiable {
    let id: String
    let matchId: String
    let authorUserId: String
    let content: String
    let imageUrl: String?
    let likeCount: Int
    let commentCount: Int
    let createdAt: String
    let author: PostAuthor?
    let match: PostMatch?
    let comments: [PostComment]?
}

struct PostAuthor: Codable {
    let id: String
    let profile: PostAuthorProfile?
}

struct PostAuthorProfile: Codable {
    let nickname: String?
    let avatarUrl: String?
    let school: String?
}

struct PostMatch: Codable {
    let userA: PostAuthor?
    let userB: PostAuthor?
}

struct PostComment: Codable, Identifiable {
    let id: String
    let postId: String?
    let userId: String?
    let content: String
    let createdAt: String?
    let user: PostAuthor?
}

struct PostListResponse: Codable {
    let posts: [CouplePost]
    let total: Int
    let page: Int
    let limit: Int
}

// MARK: - Metadata

struct MetadataListResponse: Codable {
    let items: [String]
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
