import Foundation

// MARK: - Notification (api-chat-realtime-notifications.md §3.1, h5-notifications.md §3.1)
//
// The server always writes English `title` / `body`; localisation happens at render time in
// `NotificationL10n` (exact title map + body regex patterns). `metadata` is per-type and only
// read for `energy_refunded` (`energy`, `refundReason`); `actorId` may be an HMAC token and is
// never resolved to a profile.

struct AppNotification: Decodable, Identifiable, Equatable {
    var id: String
    var type: String
    var title: String
    var body: String
    var isRead: Bool
    var createdAt: String
    var metadata: [String: AnyCodable]?

    /// Known `type` values (§3.6 inventory). Unknown types still render (icon `info`).
    enum Kind: String {
        case matchResult = "match_result"
        case noMatch = "no_match"
        case relationshipConfirmed = "relationship_confirmed"
        case relationshipDissolved = "relationship_dissolved"
        case matchExpired = "match_expired"
        case friendAdded = "friend_added"
        case energyRefunded = "energy_refunded"
        case comment
        case like
        case milestone
        case system
    }

    static let typeEnergyRefunded = "energy_refunded"

    init(id: String,
         type: String,
         title: String,
         body: String,
         isRead: Bool = false,
         createdAt: String,
         metadata: [String: AnyCodable]? = nil) {
        self.id = id
        self.type = type
        self.title = title
        self.body = body
        self.isRead = isRead
        self.createdAt = createdAt
        self.metadata = metadata
    }

    private enum CodingKeys: String, CodingKey {
        case id, type, title, body, isRead, createdAt, metadata
        case message, content       // H5 body fallbacks (coded, never produced)
        case created_at             // H5 createdAt fallback
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = c.lenient(String.self, .type) ?? "system"
        title = c.lenient(String.self, .title) ?? ""
        body = c.lenient(String.self, .body)
            ?? c.lenient(String.self, .message)
            ?? c.lenient(String.self, .content)
            ?? ""
        isRead = c.lenient(Bool.self, .isRead) ?? false
        createdAt = c.lenient(String.self, .createdAt) ?? c.lenient(String.self, .created_at) ?? ""
        metadata = c.lenient([String: AnyCodable].self, .metadata)
    }

    // MARK: Derived

    var kind: Kind? { Kind(rawValue: type) }
    var isEnergyRefund: Bool { type == AppNotification.typeEnergyRefunded }
    var createdDate: Date? { ISODate.parse(createdAt) }

    /// `metadata.refundReason` (`unconfirmed_48h` | `event_cancelled` | other).
    var refundReason: String? { metadata?["refundReason"]?.stringValue }

    /// H5 `Number(metadata.energy) || 0`.
    var refundEnergy: Int {
        guard let v = metadata?["energy"] else { return 0 }
        if let i = v.intValue { return i }
        if let s = v.stringValue, let i = Int(s.trimmingCharacters(in: .whitespaces)) { return i }
        if let s = v.stringValue, let d = Double(s.trimmingCharacters(in: .whitespaces)) { return Int(d) }
        return 0
    }

    var mode: String? { metadata?["mode"]?.stringValue }
    var matchId: String? { metadata?["matchId"]?.stringValue }
    var postId: String? { metadata?["postId"]?.stringValue }
    var commentId: String? { metadata?["commentId"]?.stringValue }

    // Equatable ignores the loosely-typed metadata bag.
    static func == (lhs: AppNotification, rhs: AppNotification) -> Bool {
        lhs.id == rhs.id
            && lhs.type == rhs.type
            && lhs.title == rhs.title
            && lhs.body == rhs.body
            && lhs.isRead == rhs.isRead
            && lhs.createdAt == rhs.createdAt
    }
}

// MARK: - `GET /notifications?page=&limit=` (§3.2)

struct NotificationsPage: Decodable {
    var items: [AppNotification]
    var total: Int
    var unread: Int?
    var page: Int?
    var limit: Int?
    /// The H5 client tolerates a bare `Notification[]` payload (then `hasMore = false`).
    var isBareArray: Bool

    init(items: [AppNotification], total: Int, unread: Int? = nil, page: Int? = nil, limit: Int? = nil, isBareArray: Bool = false) {
        self.items = items
        self.total = total
        self.unread = unread
        self.page = page
        self.limit = limit
        self.isBareArray = isBareArray
    }

    private enum CodingKeys: String, CodingKey { case items, total, unread, page, limit }

    init(from decoder: Decoder) throws {
        if let single = try? decoder.singleValueContainer(), let arr = try? single.decode([AppNotification].self) {
            items = arr
            total = arr.count
            unread = nil
            page = nil
            limit = nil
            isBareArray = true
            return
        }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = c.lenient([AppNotification].self, .items) ?? []
        total = c.lenientInt(.total) ?? items.count
        unread = c.lenientInt(.unread)
        page = c.lenientInt(.page)
        limit = c.lenientInt(.limit)
        isBareArray = false
    }

    /// H5 `hasMore = page * NOTIF_PAGE_SIZE < total` (false for a bare array).
    func hasMore(page: Int, pageSize: Int) -> Bool {
        guard !isBareArray else { return false }
        return page * pageSize < total
    }
}

// MARK: - `GET /notifications/unread-count` (§3.3)

struct UnreadCount: Decodable {
    var unreadCount: Int

    private enum CodingKeys: String, CodingKey { case unreadCount }

    init(unreadCount: Int) { self.unreadCount = unreadCount }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        unreadCount = c.lenientInt(.unreadCount) ?? 0
    }
}

// MARK: - Day grouping (h5-notifications.md §B3 — rolling 24 h windows, not calendar days)

enum NotificationDay: Int, CaseIterable, Hashable {
    case today, yesterday, earlier

    /// Dictionary keys "Today" / "Yesterday" / "Earlier".
    var label: String {
        switch self {
        case .today: return L10n.t("Today")
        case .yesterday: return L10n.t("Yesterday")
        case .earlier: return L10n.t("Earlier")
        }
    }

    /// `diff = (now − createdAt) / 86 400 000`: `< 1` → Today, `< 2` → Yesterday, else Earlier.
    /// An unparsable date counts as Earlier (H5: `NaN < 1` is false).
    static func of(_ n: AppNotification, now: Date = Date()) -> NotificationDay {
        guard let d = n.createdDate else { return .earlier }
        let days = now.timeIntervalSince(d) / 86_400
        if days < 1 { return .today }
        if days < 2 { return .yesterday }
        return .earlier
    }
}

struct NotificationDayGroup: Identifiable {
    let day: NotificationDay
    let items: [AppNotification]
    var id: Int { day.rawValue }
}

extension Array where Element == AppNotification {
    /// Sections in order Today / Yesterday / Earlier, each only present when non-empty; the
    /// relative order of items inside a section is preserved (server order, newest first).
    func groupedByDay(now: Date = Date()) -> [NotificationDayGroup] {
        var buckets: [NotificationDay: [AppNotification]] = [:]
        for n in self {
            buckets[NotificationDay.of(n, now: now), default: []].append(n)
        }
        return NotificationDay.allCases.compactMap { day in
            guard let list = buckets[day], !list.isEmpty else { return nil }
            return NotificationDayGroup(day: day, items: list)
        }
    }
}
