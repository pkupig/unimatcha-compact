import Foundation

// MARK: - User (GET /users/me, login/register)
struct User: Codable, Identifiable {
    let id: String
    let email: String
    let status: String                 // "ACTIVE" | "BANNED"
    var verificationStatus: String?    // unverified | pending | verified | rejected
    var hasProfile: Bool?
    var profileCompleteness: Int?
    var completedQuestionnaire: Bool?
    var modeStates: [ModeState]?
    var profile: UserProfile?

    /// login/register return a lighter user; /users/me returns the full one.
    func matchState(_ mode: MatchMode) -> String {
        modeStates?.first { $0.mode == mode.rawValue }?.matchState ?? "idle"
    }
}

struct ModeState: Codable {
    let mode: String                   // "romantic" | "friend"
    let matchState: String
    let matchSearchingSince: String?
}

// login returns {user, token}; register returns {user, token}
struct AuthResponse: Codable {
    let user: User
    let token: String
}
