import Foundation

struct MatchingService {
    static func getMatchStatus() async throws -> MatchStatus {
        return try await APIClient.shared.request("/users/me/match-status")
    }

    static func getMatchResult() async throws -> MatchResult {
        return try await APIClient.shared.request("/matching/result")
    }

    static func getFullStatus() async throws -> FullMatchStatus {
        return try await APIClient.shared.request("/matching/status")
    }

    static func startMatch() async throws -> MatchStartResponse {
        return try await APIClient.shared.request("/matching/start", method: .POST)
    }

    static func stopMatch() async throws -> GenericResponse {
        return try await APIClient.shared.request("/matching/stop", method: .POST)
    }

    // ─── 旧版 confirm/reject（不含 proposalId） ─────────────
    static func confirmMatch() async throws -> GenericResponse {
        return try await APIClient.shared.request("/matching/confirm", method: .POST)
    }

    static func rejectMatch() async throws -> GenericResponse {
        return try await APIClient.shared.request("/matching/reject", method: .POST)
    }

    // ─── 按 proposalId confirm/reject（第三轮新增） ────────
    static func confirmProposal(proposalId: String) async throws -> GenericResponse {
        return try await APIClient.shared.request("/matching/proposals/\(proposalId)/confirm", method: .POST)
    }

    static func rejectProposal(proposalId: String) async throws -> GenericResponse {
        return try await APIClient.shared.request("/matching/proposals/\(proposalId)/reject", method: .POST)
    }

    // ─── 匹配偏好 ─────────────────────────────────────────
    static func getPreferences() async throws -> UserMatchPreferences {
        return try await APIClient.shared.request("/matching/preferences")
    }

    static func setPreferences(_ prefs: UserMatchPreferences) async throws -> UserMatchPreferences {
        return try await APIClient.shared.request("/matching/preferences", method: .PUT, body: prefs)
    }

    // ─── 分手 ─────────────────────────────────────────────
    static func dissolveRelationship(reason: String? = nil) async throws -> GenericResponse {
        struct Body: Encodable { let reason: String? }
        return try await APIClient.shared.request("/matching/dissolve", method: .POST, body: Body(reason: reason))
    }

    // ─── 认证 ─────────────────────────────────────────────
    static func applyVerification() async throws -> GenericResponse {
        return try await APIClient.shared.request("/users/me/verification/apply", method: .POST)
    }
}

struct GenericResponse: Codable {
    let message: String?
    let status: String?
}
