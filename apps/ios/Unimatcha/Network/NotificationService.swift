// Interface outline: implementation bodies removed.
import Foundation
struct NotificationService {
    static func list(page: Int = 1, limit: Int = 20) async throws -> NotificationsResponse
    static func unreadCount() async throws -> UnreadCount
    static func markAllRead() async throws -> GenericResponse
    static func markRead(_ id: String) async throws -> GenericResponse
struct ReportService {
    static func create(category: String, content: String, contact: String? = nil) async throws -> GenericResponse
        struct Body: Encodable {
struct UploadService {
    static func upload(_ data: Data, filename: String = "photo.jpg", mime: String = "image/jpeg") async throws -> String
