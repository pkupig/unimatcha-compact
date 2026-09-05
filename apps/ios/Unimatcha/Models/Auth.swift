import Foundation

/// Per-mode match state surfaced in `/users/me.modeStates` (rows are created lazily — a fresh user has none).
struct ModeState: Decodable, Equatable {
    var mode: String                   // "romantic" | "friend"
    var matchState: String             // idle | searching | matched | confirming | relationship | no_match
    var matchSearchingSince: String?

    private enum CodingKeys: String, CodingKey { case mode, matchState, matchSearchingSince }

    init(mode: String, matchState: String, matchSearchingSince: String? = nil) {
        self.mode = mode
        self.matchState = matchState
        self.matchSearchingSince = matchSearchingSince
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        mode = c.lenient(String.self, .mode) ?? ""
        matchState = c.lenient(String.self, .matchState) ?? "idle"
        matchSearchingSince = c.lenient(String.self, .matchSearchingSince)
    }
}

/// `GET /users/me` (`api-auth §3.1`) and the lighter `/auth/login` / `/auth/register` users.
/// Every non-identity field is optional so one struct covers all three sources.
struct User: Decodable, Identifiable, Equatable {
    var id: String
    var email: String
    var status: String                  // "ACTIVE" | "BANNED"
    var verificationStatus: String?     // unverified | pending | verified | rejected
    var createdAt: String?
    var modeStates: [ModeState]
    var profile: UserProfile?
    var hasProfile: Bool?               // /users/me: row exists AND nickname set; login: row exists (S3)
    var completedQuestionnaire: Bool?
    var profileCompleteness: Int?       // login only

    static let statusBanned = "BANNED"
    static let statusActive = "ACTIVE"

    init(id: String, email: String, status: String = User.statusActive, verificationStatus: String? = nil, createdAt: String? = nil,
         modeStates: [ModeState] = [], profile: UserProfile? = nil, hasProfile: Bool? = nil, completedQuestionnaire: Bool? = nil,
         profileCompleteness: Int? = nil) {
        self.id = id; self.email = email; self.status = status; self.verificationStatus = verificationStatus
        self.createdAt = createdAt; self.modeStates = modeStates; self.profile = profile; self.hasProfile = hasProfile
        self.completedQuestionnaire = completedQuestionnaire; self.profileCompleteness = profileCompleteness
    }

    private enum CodingKeys: String, CodingKey {
        case id, email, status, verificationStatus, createdAt, modeStates, profile, hasProfile, completedQuestionnaire, profileCompleteness
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        email = c.lenient(String.self, .email) ?? ""
        status = c.lenient(String.self, .status) ?? User.statusActive
        verificationStatus = c.lenient(String.self, .verificationStatus)
        createdAt = c.lenient(String.self, .createdAt)
        modeStates = c.lenient([ModeState].self, .modeStates) ?? []
        profile = c.lenient(UserProfile.self, .profile)
        hasProfile = c.lenientBool(.hasProfile)
        completedQuestionnaire = c.lenientBool(.completedQuestionnaire)
        profileCompleteness = c.lenientInt(.profileCompleteness)
    }

    var isBanned: Bool { status == User.statusBanned }

    /// H5 routing rule: `u.hasProfile ?? !!(u.profile && u.profile.nickname)`.
    var resolvedHasProfile: Bool {
        if let h = hasProfile { return h }
        if let n = profile?.nickname, !n.isEmpty { return true }
        return false
    }

    /// Match state for a mode; missing row == "idle" (S18).
    func matchState(_ mode: MatchMode) -> String {
        modeStates.first { $0.mode == mode.rawValue }?.matchState ?? "idle"
    }

    /// `joinedAt` source order used by the Profile tab: `profile.joinedAt || createdAt || profile.createdAt`.
    var joinedAtString: String? {
        if let j = profile?.joinedAt, !j.isEmpty { return j }
        if let c = createdAt, !c.isEmpty { return c }
        return profile?.createdAt
    }
}

/// `/users/me` identity (same struct — kept as a named alias for readability at call sites).
typealias MeUser = User

/// `POST /auth/login` (200) / `POST /auth/register` (201): `{ user, token }`.
struct AuthResponse: Decodable {
    let user: User
    let token: String
}
