import Foundation

struct MatchingService {
    static func getMatchStatus() async throws -> MatchStatus {
        return try await APIClient.shared.request("/users/me/match-status")
    }

    static func getMatchResult() async throws -> MatchResult {
        return try await APIClient.shared.request("/matching/result")
    }

    // Full status with state machine
    static func getFullStatus() async throws -> FullMatchStatus {
        return try await APIClient.shared.request("/matching/status")
    }

    // User-triggered match
    static func startMatch() async throws -> MatchStartResponse {
        return try await APIClient.shared.request("/matching/start", method: .POST)
    }

    static func confirmMatch() async throws -> GenericResponse {
        return try await APIClient.shared.request("/matching/confirm", method: .POST)
    }

    static func rejectMatch() async throws -> GenericResponse {
        return try await APIClient.shared.request("/matching/reject", method: .POST)
    }

    static func dissolveRelationship(reason: String? = nil) async throws -> GenericResponse {
        struct Body: Encodable { let reason: String? }
        return try await APIClient.shared.request("/matching/dissolve", method: .POST, body: Body(reason: reason))
    }
}

struct GenericResponse: Codable {
    let message: String?
    let status: String?
}
