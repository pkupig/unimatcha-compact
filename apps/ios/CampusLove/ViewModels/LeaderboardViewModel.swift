import Foundation
import SwiftUI

@MainActor
final class LeaderboardViewModel: ObservableObject {
    @Published var durationEntries: [LeaderboardEntry] = []
    @Published var scoreEntries: [LeaderboardEntry] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var selectedTab: LeaderboardTab = .duration

    enum LeaderboardTab: String, CaseIterable {
        case duration = "恋爱时长"
        case score = "恋爱分"
    }

    func loadDuration() async {
        isLoading = true
        errorMessage = nil
        do {
            durationEntries = try await LeaderboardService.getDurationLeaderboard()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func loadScore() async {
        isLoading = true
        errorMessage = nil
        do {
            scoreEntries = try await LeaderboardService.getScoreLeaderboard()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func loadCurrent() async {
        switch selectedTab {
        case .duration: await loadDuration()
        case .score: await loadScore()
        }
    }
}
