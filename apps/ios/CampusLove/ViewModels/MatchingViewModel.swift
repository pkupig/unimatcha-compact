import Foundation
import SwiftUI

@MainActor
final class MatchingViewModel: ObservableObject {
    @Published var matchStatus: MatchStatus?
    @Published var matchResult: MatchResult?
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    func loadAll() async {
        isLoading = true
        async let status: () = loadStatus()
        async let result: () = loadResult()
        _ = await [status, result]
        isLoading = false
    }
    
    func loadStatus() async {
        do { matchStatus = try await MatchingService.getMatchStatus() } catch {}
    }
    
    func loadResult() async {
        do { matchResult = try await MatchingService.getMatchResult() } catch {}
    }
    
    var isMatched: Bool { matchResult?.matched == true }
    var isInRelationship: Bool { matchStatus?.mode == .relationshipMode }
}
