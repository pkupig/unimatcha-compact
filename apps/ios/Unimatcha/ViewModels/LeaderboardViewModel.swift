import Foundation
import SwiftUI

@MainActor
final class LeaderboardViewModel: ObservableObject {
    @Published var entries: [LeaderboardEntry] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var selectedTab: LeaderboardTab = .duration

    // Legacy compat
    var durationEntries: [LeaderboardEntry] { selectedTab == .duration ? entries : [] }
    var scoreEntries: [LeaderboardEntry] { selectedTab == .score ? entries : [] }

    enum LeaderboardTab: String, CaseIterable {
        case duration = "恋爱时长"
        case score = "恋爱分"
        case streak = "连续互动"
        case compatibility = "契合度"
        case sharedInterests = "共同兴趣"
        case popular = "人气"
        case growth = "成长"
        case empathy = "共情力"

        var apiType: String {
            switch self {
            case .duration: return "duration"
            case .score: return "score"
            case .streak: return "streak"
            case .compatibility: return "compatibility"
            case .sharedInterests: return "shared_interests"
            case .popular: return "popular"
            case .growth: return "growth"
            case .empathy: return "empathy"
            }
        }
    }

    func loadCurrent() async {
        isLoading = true
        errorMessage = nil
        do {
            entries = try await LeaderboardService.getLeaderboard(type: selectedTab.apiType)
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
