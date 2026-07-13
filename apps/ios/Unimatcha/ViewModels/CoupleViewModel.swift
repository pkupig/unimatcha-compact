import Foundation
import SwiftUI

@MainActor
final class CoupleViewModel: ObservableObject {
    @Published var space: CoupleSpace?
    @Published var isLoading = false
    @Published var errorMessage: String?

    let matchId: String
    init(matchId: String) { self.matchId = matchId }

    func load() async {
        isLoading = true; errorMessage = nil
        do { space = try await CoupleService.getSpace(matchId: matchId) }
        catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func loveYou() async {
        do { _ = try await CoupleService.loveYou(matchId: matchId); await load() }
        catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }

    func setStatus(_ s: String) async {
        do { _ = try await CoupleService.setStatus(matchId: matchId, status: s); await load() }
        catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }

    func setCraving(_ text: String) async {
        do { _ = try await CoupleService.setCraving(matchId: matchId, text: text); await load() }
        catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }

    func addBucket(_ text: String) async {
        do { _ = try await CoupleService.addBucket(matchId: matchId, text: text); await load() }
        catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }

    func toggleBucket(_ item: CoupleBucketItem) async {
        do { _ = try await CoupleService.toggleBucket(matchId: matchId, id: item.id, done: !(item.done ?? false)); await load() }
        catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }

    func addAnniversary(title: String, date: String) async {
        do { _ = try await CoupleService.addAnniversary(matchId: matchId, title: title, date: date); await load() }
        catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }
}
