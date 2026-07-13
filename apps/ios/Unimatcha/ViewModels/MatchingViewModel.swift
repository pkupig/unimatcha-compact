import Foundation
import SwiftUI

@MainActor
final class MatchingViewModel: ObservableObject {
    @Published var mode: MatchMode = .romantic
    @Published var status: MatchStatus?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var actionMessage: String?

    var state: MatchState { status?.state ?? .idle }

    func load() async {
        isLoading = true; errorMessage = nil
        do { status = try await MatchingService.status(mode: mode) }
        catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func switchMode(_ m: MatchMode) async {
        mode = m
        await load()
    }

    func start(enhanced: Bool = false, cells: Int? = nil) async {
        do {
            let r = try await MatchingService.start(mode: mode, enhanced: enhanced, cells: cells)
            actionMessage = r.message
            await load()
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
    }

    func stop() async {
        do { _ = try await MatchingService.stop(mode: mode); await load() }
        catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
    }

    func confirm(matchId: String) async {
        do {
            let r = try await MatchingService.confirm(matchId: matchId)
            actionMessage = r.message
            await load()
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
    }

    func dissolve(matchId: String, reason: String? = nil) async {
        do { _ = try await MatchingService.dissolve(matchId: matchId, reason: reason); await load() }
        catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
    }
}
