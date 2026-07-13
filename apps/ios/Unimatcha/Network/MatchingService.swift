import Foundation

struct MatchingService {
    // ─── Status / result (dual-mode) ───────────────────────
    static func status(mode: MatchMode) async throws -> MatchStatus {
        try await APIClient.shared.request("/matching/status", queryParams: ["mode": mode.rawValue])
    }
    static func result(mode: MatchMode) async throws -> MatchStatus {
        try await APIClient.shared.request("/matching/result", queryParams: ["mode": mode.rawValue])
    }

    // ─── Join / leave pool ──────────────────────────────────
    @discardableResult
    static func start(mode: MatchMode, enhanced: Bool = false, cells: Int? = nil) async throws -> MatchActionResult {
        try await APIClient.shared.request("/matching/start", method: .POST,
            body: StartMatchRequest(mode: mode.rawValue, enhanced: enhanced ? true : nil, cells: mode == .friend ? cells : nil))
    }
    @discardableResult
    static func stop(mode: MatchMode) async throws -> MatchActionResult {
        try await APIClient.shared.request("/matching/stop", method: .POST, queryParams: ["mode": mode.rawValue])
    }

    // ─── Connect (QR / search add-friend) ───────────────────
    static func connect(code: String) async throws -> ConnectResult {
        try await APIClient.shared.request("/matching/connect", method: .POST, body: ConnectCodeRequest(code: code))
    }
    static func connectUser(userId: String) async throws -> ConnectResult {
        try await APIClient.shared.request("/matching/connect-user", method: .POST, body: ConnectUserRequest(userId: userId))
    }

    // ─── Confirm / dissolve (matchId-scoped) ────────────────
    @discardableResult
    static func confirm(matchId: String) async throws -> MatchActionResult {
        try await APIClient.shared.request("/matching/\(matchId)/confirm-relationship", method: .POST)
    }
    @discardableResult
    static func dissolve(matchId: String, reason: String? = nil) async throws -> MatchActionResult {
        try await APIClient.shared.request("/matching/\(matchId)/dissolve", method: .POST, body: DissolveRequest(reason: reason))
    }

    // ─── Preferences ────────────────────────────────────────
    static func getPreferences(mode: MatchMode) async throws -> MatchPreferences {
        try await APIClient.shared.request("/matching/preferences", queryParams: ["mode": mode.rawValue])
    }
    @discardableResult
    static func setPreferences(_ prefs: MatchPreferences) async throws -> MatchPreferences {
        try await APIClient.shared.request("/matching/preferences", method: .PUT, body: prefs)
    }

    // ─── Milestones + feedback ──────────────────────────────
    static func milestones() async throws -> Milestones {
        try await APIClient.shared.request("/matching/milestones")
    }
    static func reportFeedback(matchId: String, type: String) async throws {
        struct Ev: Encodable { let matchId: String; let type: String }
        struct Body: Encodable { let events: [Ev] }
        try await APIClient.shared.send("/matching/feedback/events", body: Body(events: [Ev(matchId: matchId, type: type)]))
    }
}
