import Foundation

// MARK: - ChatService (api-chat-realtime-notifications.md §1.2–§1.10; h5-chat.md §3) — WP-07
//
// Every path is relative to the `/api/v1` base. `PUT /chat/nudge-suffix` belongs to the Settings
// package (WP-13, `SettingsService.setNudgeSuffix`); `GET /chat/:id/unread` is not used anywhere
// (the session list already carries `unreadCount`) and is therefore not shipped.

enum ChatService {
    /// H5 always asks for the maximum: contact search is local-only over this list, so the 51st
    /// contact would otherwise be unsearchable (2026-08-19 fix).
    static let sessionsLimit = 100
    /// `loadChatHistory` page size and hard page cap (`CHAT_PAGE_SIZE` / 100 iterations).
    static let historyPageSize = 50
    static let historyMaxPages = 100
    /// Read-receipt refresh window (`refreshReadReceipts`).
    static let receiptsPageSize = 100

    /// `GET /chat/sessions?mode=all&limit=100` → `{sessions, total}` (bare array tolerated).
    static func sessions(mode: String = "all", limit: Int = ChatService.sessionsLimit) async throws -> [ChatSession] {
        let payload: ChatSessionsPayload = try await APIClient.shared.request(
            .get("/chat/sessions", query: [
                URLQueryItem(name: "mode", value: mode),
                URLQueryItem(name: "limit", value: String(max(1, min(100, limit)))),
            ]))
        return payload.sessions
    }

    /// `GET /chat/:matchId/messages?limit=&cursor=` → `{messages, nextCursor}`, oldest → newest.
    /// Side effect (server): the partner's unread messages in the page are flipped to read, with
    /// **no** SSE `read` emitted — the caller still sends `markRead` afterwards.
    static func messages(matchId: String,
                         cursor: String? = nil,
                         limit: Int = ChatService.historyPageSize) async throws -> ChatMessagesPage {
        var q = [URLQueryItem(name: "limit", value: String(limit))]
        if let c = cursor, !c.isEmpty { q.append(URLQueryItem(name: "cursor", value: c)) }
        return try await APIClient.shared.request(.get("/chat/\(matchId)/messages", query: q))
    }

    /// `GET /chat/:matchId/messages/poll?afterId=` → `{messages}` (≤50, strictly after the anchor;
    /// an unknown anchor id yields an empty array — the cursor must stay in sync with what was
    /// actually rendered).
    static func poll(matchId: String, afterId: String?) async throws -> [ChatMessage] {
        var q: [URLQueryItem] = []
        if let a = afterId, !a.isEmpty { q.append(URLQueryItem(name: "afterId", value: a)) }
        let payload: ChatPollPayload = try await APIClient.shared.request(
            .get("/chat/\(matchId)/messages/poll", query: q))
        return payload.messages
    }

    /// `POST /chat/:matchId/messages {content}` — text message (≤2000 chars, server trims).
    static func sendText(matchId: String, content: String) async throws -> ChatMessage {
        let body = SendMessageRequest(content: content, imageUrl: nil)
        return try await APIClient.shared.request(.post("/chat/\(matchId)/messages", body: body))
    }

    /// `POST /chat/:matchId/messages {imageUrl}` — image message (sent before the caption).
    static func sendImage(matchId: String, imageUrl: String) async throws -> ChatMessage {
        let body = SendMessageRequest(content: nil, imageUrl: imageUrl)
        return try await APIClient.shared.request(.post("/chat/\(matchId)/messages", body: body))
    }

    /// `PUT /chat/:matchId/messages/read` → `{markedRead}`. Emits SSE `read` to the partner only
    /// when it actually flipped rows.
    @discardableResult
    static func markRead(matchId: String) async throws -> Int {
        let r: MarkReadResult = try await APIClient.shared.request(.put("/chat/\(matchId)/messages/read"))
        return r.markedRead
    }

    /// `POST /chat/:matchId/nudge` → `{ok, messageId, content}`. Confirmed sessions only
    /// (403 `Only confirmed chats can use Nudge`).
    @discardableResult
    static func nudge(matchId: String) async throws -> NudgeResult {
        try await APIClient.shared.request(.post("/chat/\(matchId)/nudge"))
    }

    /// `PUT /chat/:matchId/background {imageUrl}` → `{chatBackground}`. Confirmed sessions only
    /// (403 `Only confirmed chats can set a background`). Per-viewer wallpaper.
    @discardableResult
    static func setBackground(matchId: String, imageUrl: String?) async throws -> String? {
        let r: ChatBackgroundResult = try await APIClient.shared.request(
            .put("/chat/\(matchId)/background", body: ChatBackgroundRequest(imageUrl: imageUrl)))
        return r.chatBackground
    }

    // MARK: Error classification

    /// h5-chat §2.5: the 403 that means "this conversation is over" — matched on substrings so the
    /// composer locks even when the server rewords it (`This chat has ended, you cannot send new
    /// messages`).
    static func isEndedError(_ error: Error) -> Bool {
        let m = APIError.message(of: error)
        return m.contains("has ended") || m.contains("cannot send") || m.contains("no longer")
    }
}
