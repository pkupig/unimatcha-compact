import Foundation

// MARK: - Mode
enum MatchMode: String, Codable, CaseIterable, Identifiable {
    case romantic
    case friend
    var id: String { rawValue }
    var title: String { self == .romantic ? "恋人" : "朋友" }
    var icon: String { self == .romantic ? "heart.fill" : "person.2.fill" }
}

// MARK: - State machine (lowercase 'state' field)
enum MatchState: String, Codable {
    case idle
    case searching
    case noMatch = "no_match"
    case matched
    case confirming
    case relationship
    // tolerate any future/unknown value
    init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "idle"
        self = MatchState(rawValue: raw) ?? .idle
    }
}

struct MatchConfigInfo: Codable {
    let cronExpr: String?
    let description: String?
}

// MARK: - Unified status decode (romantic {match,partner} | friend {matches[]})
struct MatchStatus: Codable {
    let mode: String?
    let state: MatchState
    let matchConfig: MatchConfigInfo?
    let nextRunAt: String?
    let searchingSince: String?
    let message: String?
    // romantic
    let match: RomanticMatch?
    let partner: PublicProfile?
    // friend
    let matches: [FriendMatch]?
}

struct RomanticMatch: Codable {
    let id: String?
    let status: String?
    let myConfirmed: Bool?
    let partnerConfirmed: Bool?
    let remainingMs: Double?
    let score: Double?
    let matchedAt: String?
    let relationshipStartedAt: String?
    let confirmedAt: String?
}

struct FriendMatch: Codable, Identifiable {
    let matchId: String
    let status: String?
    let score: Double?
    let myConfirmed: Bool?
    let partnerConfirmed: Bool?
    let remainingMs: Double?
    let matchedAt: String?
    let partner: PublicProfile?
    var id: String { matchId }
}

// MARK: - Requests
struct StartMatchRequest: Codable {
    let mode: String
    let enhanced: Bool?
    let cells: Int?
}

struct DissolveRequest: Codable { let reason: String? }

struct ConnectCodeRequest: Codable { let code: String }
struct ConnectUserRequest: Codable { let userId: String }

struct ConnectResult: Codable {
    let matchId: String
    let message: String?
    let partner: PublicProfile?
}

struct MatchActionResult: Codable {
    let status: String?
    let message: String?
}

// MARK: - Preferences
struct MatchPreferences: Codable {
    var mode: String?
    var requireSameCity: Bool?
    var requireSameUniversity: Bool?
    var requireSameMajor: Bool?
    var preferredGender: String?
    var ageMin: Int?
    var ageMax: Int?
    var universityStage: String?
    var matchBasis: String?          // questionnaire | profile | both
    var extraMatchInfo: String?
    var preferredNationalities: [String]?
    var preferredMbti: [String]?
    var preferredInterests: [String]?
    var preferredActivities: [String]?
    var friendRequirements: String?
}

// MARK: - Milestones (GET /matching/milestones)
struct Milestones: Codable {
    let state: String                // "none" | "relationship"
    let daysTogether: Int?
    let messageCount: Int?
    let postCount: Int?
    let sharedInterests: [String]?
    let matchScore: Double?
    let startedAt: String?
}
