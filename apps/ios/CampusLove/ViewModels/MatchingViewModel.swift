import Foundation
import SwiftUI

@MainActor
final class MatchingViewModel: ObservableObject {
    @Published var fullStatus: FullMatchStatus?
    @Published var matchState: MatchState = .idle
    @Published var partner: PublicProfile?
    @Published var matchInfo: MatchInfo?
    @Published var matchConfig: MatchConfigInfo?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func loadAll() async {
        isLoading = true
        errorMessage = nil
        do {
            let status = try await MatchingService.getFullStatus()
            self.fullStatus = status
            self.matchState = status.state
            self.partner = status.partner
            self.matchInfo = status.match
            self.matchConfig = status.matchConfig
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func startMatch() async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.startMatch()
            self.matchState = .searching
            // Poll after a short delay
            try await Task.sleep(nanoseconds: 2_000_000_000)
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func confirmMatch() async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.confirmMatch()
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func rejectMatch() async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.rejectMatch()
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func dissolve(reason: String? = nil) async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.dissolveRelationship(reason: reason)
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    var isMatched: Bool { matchState == .matched }
    var isInRelationship: Bool { matchState == .relationship }
    var isSearching: Bool { matchState == .searching }
    var isIdle: Bool { matchState == .idle }
}
