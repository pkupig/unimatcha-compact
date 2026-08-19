// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isLoggedIn = false
    @Published var currentUser: User?
    init()
    func register(email: String, password: String) async
    func login(email: String, password: String) async
    private func authenticate(_ op: () async throws -> AuthResponse) async
    func refresh() async
    func logout()
