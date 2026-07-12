import Foundation

struct LeaderboardService {
    static func getLeaderboard(type: String, limit: Int = 20) async throws -> [LeaderboardEntry] {
        return try await APIClient.shared.request(
            "/leaderboard",
            queryParams: ["type": type, "limit": "\(limit)"]
        )
    }

    // Legacy compat
    static func getDurationLeaderboard(limit: Int = 20) async throws -> [LeaderboardEntry] {
        return try await getLeaderboard(type: "duration", limit: limit)
    }

    static func getScoreLeaderboard(limit: Int = 20) async throws -> [LeaderboardEntry] {
        return try await getLeaderboard(type: "score", limit: limit)
    }
}
