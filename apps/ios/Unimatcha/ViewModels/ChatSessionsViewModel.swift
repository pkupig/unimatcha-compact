import Foundation
import SwiftUI

@MainActor
final class ChatSessionsViewModel: ObservableObject {
    @Published var sessions: [ChatSession] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load() async {
        isLoading = true; errorMessage = nil
        do {
            let resp = try await ChatService.sessions(mode: "all")
            sessions = resp.sessions
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}
