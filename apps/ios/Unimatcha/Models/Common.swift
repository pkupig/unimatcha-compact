import Foundation

// MARK: - Envelope / transport shapes (PLAN §B.1)

/// Every 2xx body: `{ success, data, message?, timestamp }`. `data` is whatever the handler returned —
/// an object OR a bare array (`/energy/packages`, `/ads/feed`, `/answers/mine`).
struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let message: String?
    let timestamp: String?

    private enum CodingKeys: String, CodingKey { case success, data, message, timestamp }

    init(success: Bool, data: T?, message: String?, timestamp: String?) {
        self.success = success
        self.data = data
        self.message = message
        self.timestamp = timestamp
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = (try? c.decodeIfPresent(Bool.self, forKey: .success)) ?? true
        data = try c.decodeIfPresent(T.self, forKey: .data)
        // `message` is normally a string; tolerate an array (never happens on 2xx, but cheap).
        if let s = try? c.decodeIfPresent(String.self, forKey: .message) {
            message = s
        } else if let m = try? c.decodeIfPresent(StringOrArray.self, forKey: .message) {
            message = m.text
        } else {
            message = nil
        }
        timestamp = try? c.decodeIfPresent(String.self, forKey: .timestamp)
    }
}

/// Every non-2xx body (`HttpExceptionFilter`) and the bare passport 401 `{statusCode, message}`.
struct APIErrorBody: Decodable {
    let statusCode: Int?
    let message: StringOrArray?
    let path: String?

    private enum CodingKeys: String, CodingKey { case statusCode, message, path }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        statusCode = try? c.decodeIfPresent(Int.self, forKey: .statusCode)
        message = try? c.decodeIfPresent(StringOrArray.self, forKey: .message)
        path = try? c.decodeIfPresent(String.self, forKey: .path)
    }
}

struct UploadResult: Decodable {
    let url: String
    let filename: String?
}

/// Ack payloads (`{message}` / `{status}` / `{ok}`); extra keys are ignored.
struct GenericResponse: Decodable {
    let message: String?
    let status: String?
    let ok: Bool?
}

/// Encodes as `{}` — for POSTs whose DTO is empty (e.g. `/events/:id/purchase`).
struct EmptyBody: Encodable {
    init() {}
    func encode(to encoder: Encoder) throws {
        _ = encoder.container(keyedBy: NoKeys.self)
    }
    private enum NoKeys: CodingKey {}
}

/// Encodes `nil` as an explicit JSON `null` (a *clear*), unlike a synthesized optional which is omitted.
/// Used for preferredGender/ageMin/ageMax/universityStage/imageUrl clears.
struct NullableField<T: Encodable>: Encodable {
    var value: T?
    init(_ value: T?) { self.value = value }
    init(value: T?) { self.value = value }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        if let v = value { try c.encode(v) } else { try c.encodeNil() }
    }
}

// MARK: - App-wide enums

enum MatchMode: String, Codable, CaseIterable, Hashable {
    case romantic, friend
}

enum AppTab: Hashable {
    case match, square, profile
}

enum HomeView: String, Hashable, CaseIterable {
    case chat, romantic, friend

    /// The match mode this view shows (nil for the chat list).
    var mode: MatchMode? {
        switch self {
        case .chat: return nil
        case .romantic: return .romantic
        case .friend: return .friend
        }
    }

    init(mode: MatchMode) {
        self = mode == .romantic ? .romantic : .friend
    }
}

enum FriendHubPanel: Hashable {
    case search, qr, graph
}

enum ContentPageKey: String, Hashable, CaseIterable {
    case help, safety, terms, privacy
}

enum SquareBoardKind: String, Hashable, CaseIterable {
    case recommend, campus_wall, pinned, search
}

// MARK: - PublicProfile (`api-matching §1.7`, `api-auth §3.10`) — every field optional, all three projections

struct PublicProfile: Decodable, Identifiable, Equatable {
    var userId: String?
    var verificationStatus: String?
    var nickname: String?
    var realName: String?
    var school: String?
    var grade: String?
    var age: Int?
    var city: String?
    var interests: [String]?
    var bio: String?
    var avatarUrl: String?
    var socialLinks: [String: String]?
    var relationshipScore: Double?
    var signature: String?
    var coverUrl: String?
    var tags: [String]?
    var major: String?
    var mbti: String?
    var nationality: String?
    var realPhotos: [String]?
    var zodiac: String?
    var daysKnown: Int?
    var hidden: Bool?

    /// Deterministic (no UUID fallback — `ios-models §3.1`).
    var id: String { userId ?? nickname ?? "" }

    var isVerified: Bool { verificationStatus == "verified" }
    var isHidden: Bool { hidden == true }

    init() {}

    private enum CodingKeys: String, CodingKey {
        case userId, verificationStatus, nickname, realName, school, grade, age, city, interests, bio,
             avatarUrl, socialLinks, relationshipScore, signature, coverUrl, tags, major, mbti, nationality,
             realPhotos, zodiac, daysKnown, hidden
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = c.lenient(String.self, .userId)
        verificationStatus = c.lenient(String.self, .verificationStatus)
        nickname = c.lenient(String.self, .nickname)
        realName = c.lenient(String.self, .realName)
        school = c.lenient(String.self, .school)
        grade = c.lenient(String.self, .grade)
        age = c.lenientInt(.age)
        city = c.lenient(String.self, .city)
        interests = c.lenient([String].self, .interests)
        bio = c.lenient(String.self, .bio)
        avatarUrl = c.lenient(String.self, .avatarUrl)
        socialLinks = c.lenient([String: String].self, .socialLinks)
        relationshipScore = c.lenientDouble(.relationshipScore)
        signature = c.lenient(String.self, .signature)
        coverUrl = c.lenient(String.self, .coverUrl)
        tags = c.lenient([String].self, .tags)
        major = c.lenient(String.self, .major)
        mbti = c.lenient(String.self, .mbti)
        nationality = c.lenient(String.self, .nationality)
        realPhotos = c.lenient([String].self, .realPhotos)
        zodiac = c.lenient(String.self, .zodiac)
        daysKnown = c.lenientInt(.daysKnown)
        hidden = c.lenient(Bool.self, .hidden)
    }
}

// MARK: - EventSummary (`api-square §1.3`) — embedded in posts as `event`; shared by WP-08 cards and WP-10 purchase

struct EventSummary: Decodable, Identifiable, Equatable {
    var id: String
    var title: String
    var venue: String?
    var school: String?
    var startAt: String
    var endAt: String?
    var priceCents: Int
    var capacity: Int?
    var ticketsSold: Int
    var status: String          // "published" | "closed" | "cancelled"
    var images: [String]?       // present on `/events/:id` and ticket wallet, absent on post cards

    init(id: String, title: String, venue: String? = nil, school: String? = nil, startAt: String, endAt: String? = nil,
         priceCents: Int = 0, capacity: Int? = nil, ticketsSold: Int = 0, status: String = "published", images: [String]? = nil) {
        self.id = id; self.title = title; self.venue = venue; self.school = school; self.startAt = startAt; self.endAt = endAt
        self.priceCents = priceCents; self.capacity = capacity; self.ticketsSold = ticketsSold; self.status = status; self.images = images
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, venue, school, startAt, endAt, priceCents, capacity, ticketsSold, status, images
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = c.lenient(String.self, .title) ?? ""
        venue = c.lenient(String.self, .venue)
        school = c.lenient(String.self, .school)
        startAt = c.lenient(String.self, .startAt) ?? ""
        endAt = c.lenient(String.self, .endAt)
        priceCents = c.lenientInt(.priceCents) ?? 0
        capacity = c.lenientInt(.capacity)
        ticketsSold = c.lenientInt(.ticketsSold) ?? 0
        status = c.lenient(String.self, .status) ?? "published"
        images = c.lenient([String].self, .images)
    }

    /// `capacity == null ? null : max(0, capacity - ticketsSold)`
    var remaining: Int? {
        guard let cap = capacity else { return nil }
        return max(0, cap - ticketsSold)
    }
    var isSoldOut: Bool {
        guard let r = remaining else { return false }
        return r <= 0
    }
    var startDate: Date? { ISODate.parse(startAt) }
    var endDate: Date? { endAt.flatMap { ISODate.parse($0) } }
    /// `(endAt ?? startAt) < now`
    var hasEnded: Bool {
        guard let d = endDate ?? startDate else { return false }
        return d < Date()
    }
    /// `status !== 'published'`
    var isClosed: Bool { status != "published" }
    var isCancelled: Bool { status == "cancelled" }
    /// Energy cells = `ceil(priceCents / 100)`; 0 for free events.
    var cells: Int { priceCents <= 0 ? 0 : Int((Double(priceCents) / 100.0).rounded(.up)) }
    var isFree: Bool { priceCents <= 0 }
}

// MARK: - AdFeedItem (`api-square §4.1`)

struct AdFeedItem: Decodable, Identifiable, Equatable {
    var id: String
    var title: String?
    var content: String
    var images: [String]
    var landingUrl: String?
    var advertiserName: String?

    init(id: String, title: String? = nil, content: String, images: [String] = [], landingUrl: String? = nil, advertiserName: String? = nil) {
        self.id = id; self.title = title; self.content = content; self.images = images; self.landingUrl = landingUrl; self.advertiserName = advertiserName
    }

    private enum CodingKeys: String, CodingKey { case id, title, content, images, landingUrl, advertiserName }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let s = c.lenient(String.self, .id) {
            id = s
        } else if let n = c.lenientInt(.id) {
            id = String(n)
        } else {
            throw DecodingError.keyNotFound(CodingKeys.id, .init(codingPath: c.codingPath, debugDescription: "AdFeedItem.id missing"))
        }
        title = c.lenient(String.self, .title)
        content = c.lenient(String.self, .content) ?? ""
        images = c.lenient([String].self, .images) ?? []
        landingUrl = c.lenient(String.self, .landingUrl)
        advertiserName = c.lenient(String.self, .advertiserName)
    }
}

// MARK: - ISODate

enum ISODate {
    private static let withFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static func localFormatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = format
        return f
    }
    private static let dayLocal = localFormatter("yyyy-MM-dd")
    private static let minuteLocal = localFormatter("yyyy-MM-dd'T'HH:mm")
    private static let secondLocal = localFormatter("yyyy-MM-dd'T'HH:mm:ss")
    private static let fracLocal = localFormatter("yyyy-MM-dd'T'HH:mm:ss.SSS")
    private static let outFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()
    private static let outOffset: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
        return f
    }()

    /// ISO-8601 with/without fractional seconds (any offset); `YYYY-MM-DD` → local midnight;
    /// `YYYY-MM-DDTHH:mm[:ss[.SSS]]` without zone → local time.
    static func parse(_ s: String) -> Date? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        if let d = withFrac.date(from: t) ?? plain.date(from: t) { return d }
        if t.count == 10, let d = dayLocal.date(from: t) { return d }
        if let d = minuteLocal.date(from: t) ?? secondLocal.date(from: t) ?? fracLocal.date(from: t) { return d }
        // Zone-less with a space separator ("2026-06-21 14:00")
        if t.contains(" ") {
            let r = t.replacingOccurrences(of: " ", with: "T")
            if let d = minuteLocal.date(from: r) ?? secondLocal.date(from: r) { return d }
        }
        return nil
    }

    static func parse(_ s: String?) -> Date? {
        guard let s = s else { return nil }
        return parse(s)
    }

    /// `2026-09-03T10:00:00.000Z` (UTC, fractional) — the backend's own wire format.
    static func iso(_ d: Date) -> String { outFrac.string(from: d) }

    /// `2026-09-03T18:00:00+08:00` — ISO-8601 with the device's offset (D4 couple schedule).
    static func isoWithOffset(_ d: Date) -> String { outOffset.string(from: d) }

    /// `YYYY-MM-DD` in local time (birthday / anniversary date fields).
    static func day(_ d: Date) -> String { dayLocal.string(from: d) }
}

// MARK: - AnyCodable

/// Loose JSON value: Bool / Int / Double / String / [Any] / [String: Any] / NSNull.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any?) {
        if let v = value {
            if let a = v as? AnyCodable { self.value = a.value } else { self.value = v }
        } else {
            self.value = NSNull()
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = NSNull() }
        else if let v = try? c.decode(Bool.self) { value = v }
        else if let v = try? c.decode(Int.self) { value = v }
        else if let v = try? c.decode(Double.self) { value = v }
        else if let v = try? c.decode(String.self) { value = v }
        else if let v = try? c.decode([AnyCodable].self) { value = v.map { $0.value } }
        else if let v = try? c.decode([String: AnyCodable].self) { value = v.mapValues { $0.value } }
        else { value = NSNull() }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case is NSNull: try c.encodeNil()
        case let v as Bool: try c.encode(v)
        case let v as Int: try c.encode(v)
        case let v as Int64: try c.encode(v)
        case let v as Double: try c.encode(v)
        case let v as Float: try c.encode(Double(v))
        case let v as String: try c.encode(v)
        case let v as [String]: try c.encode(v)
        case let v as [Int]: try c.encode(v)
        case let v as [Double]: try c.encode(v)
        case let v as [AnyCodable]: try c.encode(v)
        case let v as [Any]: try c.encode(v.map { AnyCodable($0) })
        case let v as [String: AnyCodable]: try c.encode(v)
        case let v as [String: Any]: try c.encode(v.mapValues { AnyCodable($0) })
        case let v as AnyCodable: try v.encode(to: encoder)
        default: try c.encodeNil()
        }
    }

    // Typed accessors
    var isNull: Bool { value is NSNull }
    var stringValue: String? { value as? String }
    var boolValue: Bool? { value as? Bool }
    var intValue: Int? {
        if let i = value as? Int { return i }
        if let d = value as? Double { return Int(d) }
        return nil
    }
    var doubleValue: Double? {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        return nil
    }
    var arrayValue: [Any]? { value as? [Any] }
    var stringArrayValue: [String]? {
        guard let a = value as? [Any] else { return nil }
        return a.compactMap { $0 as? String }
    }
    var dictionaryValue: [String: Any]? { value as? [String: Any] }
}

// MARK: - Lenient decoding helpers (shared by every model file)

extension KeyedDecodingContainer {
    /// `decodeIfPresent` that also swallows type mismatches (returns nil instead of throwing).
    func lenient<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        (try? decodeIfPresent(T.self, forKey: key)) ?? nil
    }

    /// Int that tolerates a JSON double (`21.0`) or numeric string.
    func lenientInt(_ key: Key) -> Int? {
        if let i = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil { return i }
        if let d = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil { return Int(d) }
        if let s = (try? decodeIfPresent(String.self, forKey: key)) ?? nil { return Int(s) }
        return nil
    }

    func lenientDouble(_ key: Key) -> Double? {
        if let d = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil { return d }
        if let i = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil { return Double(i) }
        if let s = (try? decodeIfPresent(String.self, forKey: key)) ?? nil { return Double(s) }
        return nil
    }

    /// Bool that tolerates 0/1 numbers and "true"/"false" strings.
    func lenientBool(_ key: Key) -> Bool? {
        if let b = (try? decodeIfPresent(Bool.self, forKey: key)) ?? nil { return b }
        if let i = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil { return i != 0 }
        if let s = (try? decodeIfPresent(String.self, forKey: key)) ?? nil {
            if s == "true" { return true }
            if s == "false" { return false }
        }
        return nil
    }
}
