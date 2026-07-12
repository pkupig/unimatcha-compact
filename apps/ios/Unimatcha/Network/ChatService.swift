import Foundation

struct ChatService {
    // ─── 获取历史消息 ──────────────────────────────────────
    static func getMessages(matchId: String, cursor: String? = nil, limit: Int = 50) async throws -> ChatMessagesResponse {
        var path = "/chat/\(matchId)/messages?limit=\(limit)"
        if let c = cursor { path += "&cursor=\(c)" }
        return try await APIClient.shared.request(path)
    }

    // ─── 轮询新消息 ───────────────────────────────────────
    static func pollMessages(matchId: String, afterId: String? = nil) async throws -> ChatMessagesResponse {
        var path = "/chat/\(matchId)/messages/poll"
        if let id = afterId { path += "?afterId=\(id)" }
        return try await APIClient.shared.request(path)
    }

    // ─── 发送消息 ─────────────────────────────────────────
    static func sendMessage(matchId: String, content: String) async throws -> ChatMessage {
        struct Body: Encodable { let content: String }
        return try await APIClient.shared.request("/chat/\(matchId)/messages", method: .POST, body: Body(content: content))
    }

    // ─── 标记已读 ─────────────────────────────────────────
    static func markRead(matchId: String) async throws -> GenericResponse {
        return try await APIClient.shared.request("/chat/\(matchId)/messages/read", method: .PUT)
    }
}
