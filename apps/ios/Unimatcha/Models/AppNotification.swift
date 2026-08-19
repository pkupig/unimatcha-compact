import Foundation

// MARK: - Notification (GET /notifications)
struct AppNotification: Codable, Identifiable {
    let id: String
    let type: String?
    let title: String?
    let body: String?
    let isRead: Bool?
    let createdAt: String?
    let metadata: NotificationMeta?
}

struct NotificationMeta: Codable {
    let matchId: String?
    let postId: String?
    let commentId: String?
    let mode: String?
}

struct NotificationsResponse: Codable {
    let items: [AppNotification]
    let total: Int?
    let unread: Int?
    let page: Int?
    let limit: Int?
}

struct UnreadCount: Codable { let unreadCount: Int }
