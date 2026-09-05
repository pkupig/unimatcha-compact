import Foundation

// MARK: - Chat models (api-chat-realtime-notifications.md §1.1–§1.10; h5-chat.md §3) — WP-07
//
// Wire shapes, verbatim:
//   Message = {id, content, imageUrl, kind, senderId, isRead, createdAt}   (no matchId, no sender profile)
//   Session = {matchId, mode, status, sessionType, remainingMs, myConfirmed, partnerConfirmed,
//              partner{id, note, nickname, avatarUrl, school, gender, age},
//              lastMessage: Message|null, unreadCount, chatBackground, updatedAt}
// The H5 also tolerates a bare array in place of `{sessions}` / `{messages}`, and reads
// `partner.userId` / `partner.name` / `confirmedByMe` / `confirmedByPartner` as fallbacks — every
// tolerance is reproduced here so a shape wobble never blanks the list.

// MARK: Message

struct ChatMessage: Decodable, Identifiable, Equatable {
    var id: String
    /// `""` for image-only messages (never null); the nudge sentence for `kind == "nudge"`.
    var content: String
    var imageUrl: String?
    /// `"text"` | `"nudge"` (DB default `text`).
    var kind: String?
    var senderId: String
    var isRead: Bool
    var createdAt: String

    /// Parsed once at decode — the stream inserts separators on 10-minute gaps and the poll
    /// path compares timestamps on every batch.
    var date: Date?

    init(id: String,
         content: String = "",
         imageUrl: String? = nil,
         kind: String? = "text",
         senderId: String = "",
         isRead: Bool = false,
         createdAt: String = "") {
        self.id = id
        self.content = content
        self.imageUrl = imageUrl
        self.kind = kind
        self.senderId = senderId
        self.isRead = isRead
        self.createdAt = createdAt
        self.date = ISODate.parse(createdAt)
    }

    private enum CodingKeys: String, CodingKey {
        case id, content, imageUrl, kind, senderId, isRead, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id) ?? ""
        content = c.lenient(String.self, .content) ?? ""
        imageUrl = c.lenient(String.self, .imageUrl)
        kind = c.lenient(String.self, .kind)
        senderId = c.lenient(String.self, .senderId) ?? ""
        isRead = c.lenientBool(.isRead) ?? false
        createdAt = c.lenient(String.self, .createdAt) ?? ""
        date = ISODate.parse(createdAt)
    }

    /// h5-chat §1.3: `kind === 'nudge'`, or a legacy message with no `kind` whose text contains
    /// "nudged" — and never when an image is attached.
    var isNudge: Bool {
        guard imageUrl == nil else { return false }
        if let k = kind, !k.isEmpty { return k == "nudge" }
        return content.contains("nudged")
    }

    func isMine(_ myId: String?) -> Bool {
        guard let myId = myId, !myId.isEmpty else { return false }
        return senderId == myId
    }

    /// Milliseconds since epoch (0 when the timestamp is unparseable — H5 skips separators then).
    var timestampMs: Double? {
        guard let d = date else { return nil }
        return d.timeIntervalSince1970 * 1000
    }
}

// MARK: Session partner

struct SessionPartner: Decodable, Equatable {
    /// Partner userId (`id` on the wire; `userId` tolerated).
    var id: String?
    /// MY private note for this user (`settings.notes[partnerId]`), ≤30 chars.
    var note: String?
    var nickname: String?
    var avatarUrl: String?
    var school: String?
    var gender: String?
    var age: Int?

    init(id: String? = nil, note: String? = nil, nickname: String? = nil, avatarUrl: String? = nil,
         school: String? = nil, gender: String? = nil, age: Int? = nil) {
        self.id = id
        self.note = note
        self.nickname = nickname
        self.avatarUrl = avatarUrl
        self.school = school
        self.gender = gender
        self.age = age
    }

    private enum CodingKeys: String, CodingKey {
        case id, userId, note, nickname, name, avatarUrl, avatar, school, gender, age
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id) ?? c.lenient(String.self, .userId)
        note = c.lenient(String.self, .note)
        nickname = c.lenient(String.self, .nickname) ?? c.lenient(String.self, .name)
        avatarUrl = c.lenient(String.self, .avatarUrl) ?? c.lenient(String.self, .avatar)
        school = c.lenient(String.self, .school)
        gender = c.lenient(String.self, .gender)
        age = c.lenientInt(.age)
    }

    /// H5 `partner.nickname || partner.name || 'Partner'` (nickname is always the primary name —
    /// the private note is only ever a secondary chip).
    var displayName: String {
        let n = (nickname ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? L10n.t("Partner") : n
    }

    /// School run through `metaLabel` (zh university names in zh mode; the value stays English).
    var schoolLabel: String? {
        guard let s = school, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return L10n.metaLabel(s)
    }

    var noteChip: String? {
        guard let n = note?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty else { return nil }
        return n
    }
}

// MARK: Session

struct ChatSession: Decodable, Identifiable, Equatable {
    var matchId: String
    var mode: MatchMode?
    /// Prisma `MatchStatus` (e.g. `MATCHED_FRIEND`, `RELATIONSHIP_ROMANTIC`).
    var status: String?
    /// `"temp"` | `"confirmed"`.
    var sessionType: String?
    /// Temp: `max(0, createdAt + 48 h − now)` at fetch time; confirmed: null.
    var remainingMs: Double?
    var myConfirmedRaw: Bool?
    var partnerConfirmedRaw: Bool?
    var partner: SessionPartner
    var lastMessage: ChatMessage?
    var unreadCount: Int
    /// MY wallpaper for this conversation (`settings.chatBackgrounds[matchId]`).
    var chatBackground: String?
    var updatedAt: String?

    var id: String { matchId }

    init(matchId: String,
         mode: MatchMode? = nil,
         status: String? = nil,
         sessionType: String? = nil,
         remainingMs: Double? = nil,
         myConfirmed: Bool? = nil,
         partnerConfirmed: Bool? = nil,
         partner: SessionPartner = SessionPartner(),
         lastMessage: ChatMessage? = nil,
         unreadCount: Int = 0,
         chatBackground: String? = nil,
         updatedAt: String? = nil) {
        self.matchId = matchId
        self.mode = mode
        self.status = status
        self.sessionType = sessionType
        self.remainingMs = remainingMs
        self.myConfirmedRaw = myConfirmed
        self.partnerConfirmedRaw = partnerConfirmed
        self.partner = partner
        self.lastMessage = lastMessage
        self.unreadCount = unreadCount
        self.chatBackground = chatBackground
        self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case matchId, mode, status, sessionType, remainingMs
        case myConfirmed, partnerConfirmed, confirmedByMe, confirmedByPartner
        case partner, lastMessage, unreadCount, chatBackground, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        matchId = c.lenient(String.self, .matchId) ?? ""
        mode = (c.lenient(String.self, .mode)?.lowercased()).flatMap { MatchMode(rawValue: $0) }
        status = c.lenient(String.self, .status)
        sessionType = c.lenient(String.self, .sessionType)
        remainingMs = c.lenientDouble(.remainingMs)
        myConfirmedRaw = c.lenientBool(.myConfirmed) ?? c.lenientBool(.confirmedByMe)
        partnerConfirmedRaw = c.lenientBool(.partnerConfirmed) ?? c.lenientBool(.confirmedByPartner)
        partner = c.lenient(SessionPartner.self, .partner) ?? SessionPartner()
        lastMessage = c.lenient(ChatMessage.self, .lastMessage)
        unreadCount = c.lenientInt(.unreadCount) ?? 0
        chatBackground = c.lenient(String.self, .chatBackground)
        updatedAt = c.lenient(String.self, .updatedAt)
    }

    // MARK: Derived facts (h5-chat §1.1 ordering / row rules)

    static let terminalStatuses: Set<String> = ["EXPIRED", "DISSOLVED", "REJECTED"]

    var isTemp: Bool { sessionType == "temp" }
    var isConfirmed: Bool { sessionType == "confirmed" }

    /// Defensive client-side filter — the backend already excludes these.
    var isTerminal: Bool { ChatSession.terminalStatuses.contains((status ?? "").uppercased()) }

    /// Explicit flag when present, else inferred from a status containing `CONFIRMING`
    /// (so the header does not re-offer Confirm to somebody already waiting).
    var myConfirmed: Bool {
        if let v = myConfirmedRaw { return v }
        return (status ?? "").uppercased().contains("CONFIRMING")
    }

    var partnerConfirmed: Bool { partnerConfirmedRaw ?? false }

    /// Fetch-time remaining window (temp only); `0` when absent.
    var remainingAtFetch: Double { remainingMs ?? 0 }

    /// Rendered in the temp group (h5-chat §1.1: `remainingMs > 0` at fetch time).
    var isLiveTemp: Bool { isTemp && !isTerminal && remainingAtFetch > 0 }

    /// Last-message preview, truncated to 28 chars + `…`; `[Photo]` for image-only,
    /// nil when the conversation has no message yet (the row shows the 50 %-opacity placeholder).
    var previewText: String? {
        guard let lm = lastMessage else { return nil }
        var raw = lm.content
        if raw.isEmpty {
            guard lm.imageUrl != nil else { return nil }
            raw = L10n.t("[Photo]")
        }
        if raw.count > 28 {
            return String(raw.prefix(28)) + "…"
        }
        return raw
    }

    /// Relative time of the last message (`formatPostTime`); nil when there is none.
    var lastMessageTime: String? {
        guard let iso = lastMessage?.createdAt, !iso.isEmpty else { return nil }
        let t = Formatters.relativeTime(iso)
        return t.isEmpty ? nil : t
    }
}

// MARK: Grouping (pure, so it can be verified without the store)

extension ChatSession {
    /// Temp rows in server order (`Match.updatedAt desc`), terminal and elapsed ones dropped.
    static func liveTemp(in list: [ChatSession]) -> [ChatSession] {
        list.filter { $0.isLiveTemp }
    }

    /// Confirmed rows with romantic (couple) sessions first — a **stable** partition, so equal
    /// keys keep the server's order (Swift's `sort` is not stable on its own).
    static func confirmedOrdered(in list: [ChatSession]) -> [ChatSession] {
        list.enumerated()
            .filter { $0.element.isConfirmed && !$0.element.isTerminal }
            .sorted { a, b in
                let ra = a.element.mode == .romantic ? 0 : 1
                let rb = b.element.mode == .romantic ? 0 : 1
                if ra != rb { return ra < rb }
                return a.offset < b.offset
            }
            .map { $0.element }
    }
}

// MARK: Payload wrappers (tolerate `{sessions}` / `{messages}` and bare arrays)

struct ChatSessionsPayload: Decodable {
    var sessions: [ChatSession]
    var total: Int?

    init(sessions: [ChatSession], total: Int? = nil) {
        self.sessions = sessions
        self.total = total
    }

    private enum CodingKeys: String, CodingKey { case sessions, total }

    init(from decoder: Decoder) throws {
        if let c = try? decoder.container(keyedBy: CodingKeys.self),
           let list = c.lenient([ChatSession].self, .sessions) {
            sessions = list.filter { !$0.matchId.isEmpty }
            total = c.lenientInt(.total)
            return
        }
        if let list = try? decoder.singleValueContainer().decode([ChatSession].self) {
            sessions = list.filter { !$0.matchId.isEmpty }
            total = list.count
            return
        }
        sessions = []
        total = nil
    }
}

struct ChatMessagesPage: Decodable {
    var messages: [ChatMessage]
    /// Last id iff the page was full; `nil` ends the walk (an empty page ends it too).
    var nextCursor: String?

    init(messages: [ChatMessage], nextCursor: String? = nil) {
        self.messages = messages
        self.nextCursor = nextCursor
    }

    private enum CodingKeys: String, CodingKey { case messages, nextCursor }

    init(from decoder: Decoder) throws {
        if let c = try? decoder.container(keyedBy: CodingKeys.self),
           let list = c.lenient([ChatMessage].self, .messages) {
            messages = list.filter { !$0.id.isEmpty }
            nextCursor = c.lenient(String.self, .nextCursor)
            return
        }
        if let list = try? decoder.singleValueContainer().decode([ChatMessage].self) {
            messages = list.filter { !$0.id.isEmpty }
            nextCursor = nil
            return
        }
        messages = []
        nextCursor = nil
    }
}

/// `GET /chat/:matchId/messages/poll` → `{messages}` (no cursor field).
struct ChatPollPayload: Decodable {
    var messages: [ChatMessage]

    init(messages: [ChatMessage]) { self.messages = messages }

    private enum CodingKeys: String, CodingKey { case messages }

    init(from decoder: Decoder) throws {
        if let c = try? decoder.container(keyedBy: CodingKeys.self),
           let list = c.lenient([ChatMessage].self, .messages) {
            messages = list.filter { !$0.id.isEmpty }
            return
        }
        if let list = try? decoder.singleValueContainer().decode([ChatMessage].self) {
            messages = list.filter { !$0.id.isEmpty }
            return
        }
        messages = []
    }
}

// MARK: Requests / small results

/// `POST /chat/:matchId/messages` — `{content}` **or** `{imageUrl}` (image and caption are two
/// separate messages, image first). Nil fields are omitted by the synthesized encoder, which the
/// `forbidNonWhitelisted` validator requires.
struct SendMessageRequest: Encodable {
    var content: String?
    var imageUrl: String?

    static let maxContentLength = 2000
}

/// `PUT /chat/:matchId/background` — an explicit `null` clears (no UI path, kept for parity).
struct ChatBackgroundRequest: Encodable {
    var imageUrl: NullableField<String>

    init(imageUrl: String?) { self.imageUrl = NullableField(imageUrl) }
}

struct ChatBackgroundResult: Decodable {
    var chatBackground: String?

    private enum CodingKeys: String, CodingKey { case chatBackground }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        chatBackground = c.lenient(String.self, .chatBackground)
    }
}

struct MarkReadResult: Decodable {
    var markedRead: Int

    init(markedRead: Int) { self.markedRead = markedRead }

    private enum CodingKeys: String, CodingKey { case markedRead }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        markedRead = c.lenientInt(.markedRead) ?? 0
    }
}

/// `POST /chat/:matchId/nudge` → `{ok, messageId, content}` (not a full Message — H5 reloads history).
struct NudgeResult: Decodable {
    var ok: Bool
    var messageId: String?
    var content: String?

    init(ok: Bool = true, messageId: String? = nil, content: String? = nil) {
        self.ok = ok
        self.messageId = messageId
        self.content = content
    }

    private enum CodingKeys: String, CodingKey { case ok, messageId, content }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ok = c.lenientBool(.ok) ?? true
        messageId = c.lenient(String.self, .messageId)
        content = c.lenient(String.self, .content)
    }
}

// MARK: Refund banner (h5-chat §1.1 / §2.11, h5-notifications §D, open decision D7)

/// Built by WP-16 from the newest unseen `energy_refunded` notification
/// (`metadata.refundReason` + `metadata.energy`), handed to `ChatSessionsStore.refundBanner`.
struct RefundBannerInfo: Equatable, Identifiable {
    let id: String
    let reason: String?
    let energy: Int

    init(id: String, reason: String?, energy: Int) {
        self.id = id
        self.reason = reason
        self.energy = energy
    }

    /// Three copy variants. D7 fixes the H5 bug that showed `event_cancelled` refunds as
    /// "No match available this round".
    var text: String {
        switch reason {
        case "unconfirmed_48h":
            return L10n.pick("Boost match unconfirmed after 48h — \(energy) energy refunded",
                             "增强匹配 48 小时内未确认，已退还 \(energy) 格能量")
        case "event_cancelled":
            return L10n.pick("The event was cancelled — \(energy) energy refunded",
                             "活动已取消，已退还 \(energy) 格能量")
        default:
            return L10n.pick("No match available this round — \(energy) energy refunded",
                             "本轮未匹配到对象，已退还 \(energy) 格能量")
        }
    }
}

// MARK: Conversation identity (what `openSession` copies out of a session row)

/// The `S.chat*` bundle: everything the conversation needs that comes from the session list
/// (h5-chat §2.2). A conversation is only ever opened from one of these (gotcha 1).
struct ChatContext: Equatable {
    var matchId: String
    var sessionType: String?
    var mode: MatchMode?
    var status: String?
    var myConfirmed: Bool
    var partnerConfirmed: Bool
    var partnerId: String?
    var partnerName: String
    var partnerAvatarUrl: String?
    var partnerSchool: String?
    var chatBackground: String?

    init(session: ChatSession) {
        matchId = session.matchId
        sessionType = session.sessionType
        mode = session.mode
        status = session.status
        myConfirmed = session.myConfirmed
        partnerConfirmed = session.partnerConfirmed
        partnerId = session.partner.id
        partnerName = session.partner.displayName
        partnerAvatarUrl = session.partner.avatarUrl
        partnerSchool = session.partner.school
        chatBackground = session.chatBackground
    }

    /// `syncOpenSessionFromList` (h5-chat §2.9): re-derive type/mode/status/flags from a fresh
    /// list entry. `myConfirmed` never falls back to false once it is true locally.
    mutating func sync(from s: ChatSession) {
        sessionType = s.sessionType ?? sessionType
        mode = s.mode ?? mode
        status = s.status ?? status
        if let explicit = s.myConfirmedRaw {
            myConfirmed = explicit
        } else {
            myConfirmed = (s.status ?? "").uppercased().contains("CONFIRMING") || myConfirmed
        }
        partnerConfirmed = s.partnerConfirmedRaw ?? false
        partnerId = s.partner.id ?? partnerId
        partnerName = s.partner.displayName
        partnerAvatarUrl = s.partner.avatarUrl ?? partnerAvatarUrl
        partnerSchool = s.partner.school ?? partnerSchool
        chatBackground = s.chatBackground
    }

    var isTemp: Bool { sessionType == "temp" }
    var isConfirmedSession: Bool { sessionType == "confirmed" }
    var hasSessionMetadata: Bool { sessionType != nil }

    /// A10 composer gate: terminal session statuses can no longer send.
    var isDissolved: Bool { ChatSession.terminalStatuses.contains((status ?? "").uppercased()) }

    var partnerSchoolLabel: String? {
        guard let s = partnerSchool, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return L10n.metaLabel(s)
    }
}
