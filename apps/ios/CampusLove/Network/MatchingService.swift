import Foundation

struct MatchingService {
    static func getMatchStatus() async throws -> MatchStatus {
        return try await APIClient.shared.request("/users/me/match-status")
    }
    
    static func getMatchResult() async throws -> MatchResult {
        return try await APIClient.shared.request("/matching/result")
    }
}
