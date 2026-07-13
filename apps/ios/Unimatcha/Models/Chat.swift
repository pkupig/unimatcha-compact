import Foundation

// MARK: - Chat session (synthesized from Match; key is matchId, no sessionId)
struct ChatSession: Codable, Identifiable {
    let matchId: String
    let mode: String?               // "romantic" | "friend"
    let status: String?             // raw Prisma match status
    let sessionType: String?        // "temp" | "permanent"
    let partner: PublicProfile?
    let lastMessage: String?
    let lastMessageAt: String?
    let unreadCount: Int?
    let remainingMs: Double?        // temp sessions: 48h countdown
    let myConfirmed: Bool?
    let partnerConfirmed: Bool?
    var id: String { matchId }
}

struct ChatSessionsResponse: Codable {
    let sessions: [ChatSession]
    let total: Int?
}

// MARK: - Message
struct ChatMessage: Codable, Identifiable, Equatable {
    let id: String
    let content: String?
    let imageUrl: String?
    let kind: String?               // "text" | "nudge" | ...
    let senderId: String
    let isRead: Bool?
    let createdAt: String

    var createdDate: Date { ISODate.parse(createdAt) ?? Date() }
}

struct ChatMessagesResponse: Codable {
    let messages: [ChatMessage]
    let nextCursor: String?
}

struct ChatPollResponse: Codable {
    let messages: [ChatMessage]
}

struct SendMessageRequest: Codable {
    let content: String?
    let imageUrl: String?
}

struct NudgeResult: Codable {
    let ok: Bool?
    let messageId: String?
    let content: String?
}
