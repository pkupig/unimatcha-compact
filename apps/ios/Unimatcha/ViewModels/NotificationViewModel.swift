import Foundation
import SwiftUI

@MainActor
final class NotificationViewModel: ObservableObject {
    @Published var items: [AppNotification] = []
    @Published var unread = 0
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load() async {
        isLoading = true; errorMessage = nil
        do {
            let resp = try await NotificationService.list()
            items = resp.items
            unread = resp.unread ?? 0
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func refreshUnread() async {
        if let c = try? await NotificationService.unreadCount() { unread = c.unreadCount }
    }

    func markAllRead() async {
        do {
            _ = try await NotificationService.markAllRead()
            items = items.map {
                AppNotification(id: $0.id, type: $0.type, title: $0.title, body: $0.body,
                                isRead: true, createdAt: $0.createdAt, metadata: $0.metadata)
            }
            unread = 0
        } catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }
}
