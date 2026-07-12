import Foundation
import SwiftUI

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isLoggedIn = false
    @Published var currentUser: User?
    
    init() {
        // Restore session
        if TokenStorage.shared.isLoggedIn, let user = TokenStorage.shared.loadUser() {
            self.currentUser = user
            self.isLoggedIn = true
        }
    }
    
    func register(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await AuthService.register(email: email, password: password)
            TokenStorage.shared.token = response.token
            TokenStorage.shared.saveUser(response.user)
            currentUser = response.user
            isLoggedIn = true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func login(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await AuthService.login(email: email, password: password)
            TokenStorage.shared.token = response.token
            TokenStorage.shared.saveUser(response.user)
            currentUser = response.user
            isLoggedIn = true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func logout() {
        TokenStorage.shared.clearToken()
        currentUser = nil
        isLoggedIn = false
    }
}
