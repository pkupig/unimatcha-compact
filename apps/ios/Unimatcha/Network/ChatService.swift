import Foundation

struct ChatService {
    static func sessions(mode: String = "all", limit: Int = 50) async throws -> ChatSessionsResponse {
        try await APIClient.shared.request("/chat/sessions", queryParams: ["mode": mode, "limit": "\(limit)"])
    }

    static func getMessages(matchId: String, cursor: String? = nil, limit: Int = 50) async throws -> ChatMessagesResponse {
        var q = ["limit": "\(limit)"]
        if let c = cursor { q["cursor"] = c }
        return try await APIClient.shared.request("/chat/\(matchId)/messages", queryParams: q)
    }

    static func poll(matchId: String, afterId: String? = nil) async throws -> ChatPollResponse {
        var q: [String: String] = [:]
        if let id = afterId { q["afterId"] = id }
        return try await APIClient.shared.request("/chat/\(matchId)/messages/poll", queryParams: q.isEmpty ? nil : q)
    }

    static func send(matchId: String, content: String? = nil, imageUrl: String? = nil) async throws -> ChatMessage {
        try await APIClient.shared.request("/chat/\(matchId)/messages", method: .POST,
                                           body: SendMessageRequest(content: content, imageUrl: imageUrl))
    }

    @discardableResult
    static func markRead(matchId: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/chat/\(matchId)/messages/read", method: .PUT)
    }

    static func unread(matchId: String) async throws -> UnreadCount {
        try await APIClient.shared.request("/chat/\(matchId)/unread")
    }

    @discardableResult
    static func nudge(matchId: String) async throws -> NudgeResult {
        try await APIClient.shared.request("/chat/\(matchId)/nudge", method: .POST)
    }

    @discardableResult
    static func setBackground(matchId: String, imageUrl: String?) async throws -> GenericResponse {
        struct Body: Encodable { let imageUrl: String? }
        return try await APIClient.shared.send("/chat/\(matchId)/background", method: .PUT, body: Body(imageUrl: imageUrl))
    }

    @discardableResult
    static func setNudgeSuffix(_ suffix: String) async throws -> GenericResponse {
        struct Body: Encodable { let suffix: String }
        return try await APIClient.shared.send("/chat/nudge-suffix", method: .PUT, body: Body(suffix: suffix))
    }
}
