// Interface outline: implementation bodies removed.
import Foundation
struct ChatService {
    static func sessions(mode: String = "all", limit: Int = 50) async throws -> ChatSessionsResponse
    static func getMessages(matchId: String, cursor: String? = nil, limit: Int = 50) async throws -> ChatMessagesResponse
    static func poll(matchId: String, afterId: String? = nil) async throws -> ChatPollResponse
    static func send(matchId: String, content: String? = nil, imageUrl: String? = nil) async throws -> ChatMessage
    static func markRead(matchId: String) async throws -> GenericResponse
    static func unread(matchId: String) async throws -> UnreadCount
    static func nudge(matchId: String) async throws -> NudgeResult
    static func setBackground(matchId: String, imageUrl: String?) async throws -> GenericResponse
        struct Body: Encodable {
    static func setNudgeSuffix(_ suffix: String) async throws -> GenericResponse
        struct Body: Encodable {
