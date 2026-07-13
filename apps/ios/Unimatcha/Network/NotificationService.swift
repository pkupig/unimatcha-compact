import Foundation

struct NotificationService {
    static func list(page: Int = 1, limit: Int = 20) async throws -> NotificationsResponse {
        try await APIClient.shared.request("/notifications", queryParams: ["page": "\(page)", "limit": "\(limit)"])
    }
    static func unreadCount() async throws -> UnreadCount {
        try await APIClient.shared.request("/notifications/unread-count")
    }
    @discardableResult
    static func markAllRead() async throws -> GenericResponse {
        try await APIClient.shared.send("/notifications/read", method: .PUT)
    }
    @discardableResult
    static func markRead(_ id: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/notifications/\(id)/read", method: .PUT)
    }
}

struct ReportService {
    @discardableResult
    static func create(category: String, content: String, contact: String? = nil) async throws -> GenericResponse {
        struct Body: Encodable { let category: String; let content: String; let contact: String? }
        return try await APIClient.shared.send("/reports", body: Body(category: category, content: content, contact: contact))
    }
}

struct UploadService {
    /// Upload image data → returns hosted URL to store in avatarUrl/coverUrl/realPhotos/post images.
    static func upload(_ data: Data, filename: String = "photo.jpg", mime: String = "image/jpeg") async throws -> String {
        try await APIClient.shared.uploadImage(data, filename: filename, mime: mime).url
    }
}
