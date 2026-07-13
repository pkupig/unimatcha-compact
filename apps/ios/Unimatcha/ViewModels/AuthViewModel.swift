import Foundation
import SwiftUI

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isLoggedIn = false
    @Published var currentUser: User?

    init() {
        if TokenStorage.shared.isLoggedIn, let user = TokenStorage.shared.loadUser() {
            self.currentUser = user
            self.isLoggedIn = true
            Task { await refresh() }
        }
    }

    func register(email: String, password: String) async {
        await authenticate { try await AuthService.register(email: email, password: password) }
    }

    func login(email: String, password: String) async {
        await authenticate { try await AuthService.login(email: email, password: password) }
    }

    private func authenticate(_ op: () async throws -> AuthResponse) async {
        isLoading = true; errorMessage = nil
        do {
            let response = try await op()
            TokenStorage.shared.token = response.token
            currentUser = response.user
            isLoggedIn = true
            await refresh()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// Pull the full user (modeStates + profile + hasProfile + completedQuestionnaire).
    func refresh() async {
        do {
            let me = try await ProfileService.getMe()
            currentUser = me
            TokenStorage.shared.saveUser(me)
            if me.status == "BANNED" { logout() }
        } catch {
            // keep whatever we had; a 401 already cleared the token in APIClient
        }
    }

    func logout() {
        TokenStorage.shared.clearToken()
        currentUser = nil
        isLoggedIn = false
    }
}
