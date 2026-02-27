import Foundation

struct LeaderboardService {
    static func getDurationLeaderboard(limit: Int = 20) async throws -> [LeaderboardEntry] {
        return try await APIClient.shared.request(
            "/leaderboard/duration",
            queryParams: ["limit": "\(limit)"]
        )
    }

    static func getScoreLeaderboard(limit: Int = 20) async throws -> [LeaderboardEntry] {
        return try await APIClient.shared.request(
            "/leaderboard/score",
            queryParams: ["limit": "\(limit)"]
        )
    }
}
