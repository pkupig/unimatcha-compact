import Foundation

/// `NotificationController` (api-chat-realtime-notifications.md §3, h5-notifications.md §3).
///
/// The H5 never calls `PUT /notifications/read` (mark-all) and has no UI for it, so it is
/// deliberately not exposed here (D9: 1:1 parity, no mark-all-read).
enum NotificationService {
    /// `NOTIF_PAGE_SIZE` — constant 20.
    static let pageSize = 20

    /// `GET /notifications?page=&limit=` → `{ items, total, unread, page, limit }` (bare array tolerated).
    static func list(page: Int, limit: Int = pageSize) async throws -> NotificationsPage {
        let p = max(1, page)
        let l = max(1, limit)
        return try await APIClient.shared.request(.get("/notifications", query: [
            URLQueryItem(name: "page", value: String(p)),
            URLQueryItem(name: "limit", value: String(l)),
        ]))
    }

    /// `GET /notifications/unread-count` → `{ unreadCount }`.
    static func unreadCount() async throws -> Int {
        let r: UnreadCount = try await APIClient.shared.request(.get("/notifications/unread-count"))
        return max(0, r.unreadCount)
    }

    /// `PUT /notifications/:id/read` — no body; the `{ success: true }` payload is unused.
    /// Never 404s (scoped `updateMany`).
    static func markRead(id: String) async throws {
        let safe = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        try await APIClient.shared.send(.put("/notifications/\(safe)/read"))
    }
}
