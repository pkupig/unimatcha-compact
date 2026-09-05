import Foundation

// MARK: - Couple Space models (api-chat-realtime-notifications.md §4.2, h5-couple.md §3.1)
//
// `GET /couple/:matchId` AND every one of the 12 mutations return the **same full space**, so the
// client never patches: it replaces the model with the response (h5-couple §2.11, gotcha 6).
//
// Decoding is deliberately tolerant (`decodeIfPresent` + defaults) — a missing sub-object must not
// blank the whole screen, and the server's fallbacks (`''`, `[]`) are already the display values.

struct CoupleSpace: Decodable, Equatable {

    // MARK: Nested shapes

    struct Partner: Decodable, Equatable {
        var userId: String = ""
        var nickname: String = "Partner"
        var avatarUrl: String = ""
        var bio: String = ""

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            userId = (try? c.decodeIfPresent(String.self, forKey: .userId)) ?? nil ?? ""
            let nick = (try? c.decodeIfPresent(String.self, forKey: .nickname)) ?? nil ?? ""
            nickname = nick.isEmpty ? "Partner" : nick
            avatarUrl = (try? c.decodeIfPresent(String.self, forKey: .avatarUrl)) ?? nil ?? ""
            bio = (try? c.decodeIfPresent(String.self, forKey: .bio)) ?? nil ?? ""
        }

        init(userId: String = "", nickname: String = "Partner", avatarUrl: String = "", bio: String = "") {
            self.userId = userId
            self.nickname = nickname
            self.avatarUrl = avatarUrl
            self.bio = bio
        }

        private enum CodingKeys: String, CodingKey { case userId, nickname, avatarUrl, bio }
    }

    struct Me: Decodable, Equatable {
        var userId: String = ""

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            userId = (try? c.decodeIfPresent(String.self, forKey: .userId)) ?? nil ?? ""
        }
        init(userId: String = "") { self.userId = userId }
        private enum CodingKeys: String, CodingKey { case userId }
    }

    /// `{ me: T, partner: T }` — used by `status`, `schedule` and `gifts`.
    struct Sides<T: Decodable & Equatable>: Decodable, Equatable {
        var me: T
        var partner: T

        init(me: T, partner: T) {
            self.me = me
            self.partner = partner
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            me = try c.decode(T.self, forKey: .me)
            partner = try c.decode(T.self, forKey: .partner)
        }

        private enum CodingKeys: String, CodingKey { case me, partner }
    }

    struct LoveYouMe: Decodable, Equatable {
        var count: Int = 0
        /// Server-side UTC calendar day comparison — NEVER derive this locally (gotcha 3).
        var sentToday: Bool = false

        init(count: Int = 0, sentToday: Bool = false) {
            self.count = count
            self.sentToday = sentToday
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? nil ?? 0
            sentToday = (try? c.decodeIfPresent(Bool.self, forKey: .sentToday)) ?? nil ?? false
        }

        private enum CodingKeys: String, CodingKey { case count, sentToday }
    }

    struct LoveYouPartner: Decodable, Equatable {
        var count: Int = 0

        init(count: Int = 0) { self.count = count }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? nil ?? 0
        }
        private enum CodingKeys: String, CodingKey { case count }
    }

    struct LoveYou: Decodable, Equatable {
        var me = LoveYouMe()
        var partner = LoveYouPartner()

        init(me: LoveYouMe = LoveYouMe(), partner: LoveYouPartner = LoveYouPartner()) {
            self.me = me
            self.partner = partner
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            me = (try? c.decodeIfPresent(LoveYouMe.self, forKey: .me)) ?? nil ?? LoveYouMe()
            partner = (try? c.decodeIfPresent(LoveYouPartner.self, forKey: .partner)) ?? nil ?? LoveYouPartner()
        }
        private enum CodingKeys: String, CodingKey { case me, partner }
    }

    struct CravingMe: Decodable, Equatable {
        var current: String = ""
        /// ≤8, case-insensitively de-duped, newest first, includes `current`.
        var history: [String] = []

        init(current: String = "", history: [String] = []) {
            self.current = current
            self.history = history
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            current = (try? c.decodeIfPresent(String.self, forKey: .current)) ?? nil ?? ""
            history = (try? c.decodeIfPresent([String].self, forKey: .history)) ?? nil ?? []
        }
        private enum CodingKeys: String, CodingKey { case current, history }
    }

    struct CravingPartner: Decodable, Equatable {
        var current: String = ""

        init(current: String = "") { self.current = current }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            current = (try? c.decodeIfPresent(String.self, forKey: .current)) ?? nil ?? ""
        }
        private enum CodingKeys: String, CodingKey { case current }
    }

    struct Craving: Decodable, Equatable {
        var me = CravingMe()
        var partner = CravingPartner()

        init(me: CravingMe = CravingMe(), partner: CravingPartner = CravingPartner()) {
            self.me = me
            self.partner = partner
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            me = (try? c.decodeIfPresent(CravingMe.self, forKey: .me)) ?? nil ?? CravingMe()
            partner = (try? c.decodeIfPresent(CravingPartner.self, forKey: .partner)) ?? nil ?? CravingPartner()
        }
        private enum CodingKeys: String, CodingKey { case me, partner }
    }

    /// `CoupleScheduleEntry` — ordered `startAt` DESC by the server; `expired` = `endAt < now` (server clock).
    struct ScheduleEntry: Decodable, Equatable, Identifiable {
        var id: String = ""
        var text: String = ""
        var startAt: String = ""
        var endAt: String = ""
        var expired: Bool = false

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? nil ?? ""
            text = (try? c.decodeIfPresent(String.self, forKey: .text)) ?? nil ?? ""
            startAt = (try? c.decodeIfPresent(String.self, forKey: .startAt)) ?? nil ?? ""
            endAt = (try? c.decodeIfPresent(String.self, forKey: .endAt)) ?? nil ?? ""
            expired = (try? c.decodeIfPresent(Bool.self, forKey: .expired)) ?? nil ?? false
        }

        private enum CodingKeys: String, CodingKey { case id, text, startAt, endAt, expired }

        var startDate: Date? { ISODate.parse(startAt) }
        var endDate: Date? { ISODate.parse(endAt) }

        /// `Sep 3, 02:00 PM – Sep 3, 06:00 PM` (`couple.js fmtTime`, device locale).
        var rangeLabel: String {
            let a = startDate.map { Formatters.coupleSchedule($0) } ?? ""
            let b = endDate.map { Formatters.coupleSchedule($0) } ?? ""
            return "\(a) – \(b)"
        }
    }

    struct Anniversary: Decodable, Equatable, Identifiable {
        var id: String = ""
        var title: String = ""
        /// ISO string; the tile parses `String(date).slice(0,10) + 'T00:00:00'` (local midnight).
        var date: String = ""
        var note: String = ""
        var images: [String] = []
        /// Server `ceil((date - now)/day)` against a UTC-midnight date — never recompute (gotcha 5).
        var daysUntil: Int = 0

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? nil ?? ""
            title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? nil ?? ""
            date = (try? c.decodeIfPresent(String.self, forKey: .date)) ?? nil ?? ""
            note = (try? c.decodeIfPresent(String.self, forKey: .note)) ?? nil ?? ""
            images = (try? c.decodeIfPresent([String].self, forKey: .images)) ?? nil ?? []
            daysUntil = (try? c.decodeIfPresent(Int.self, forKey: .daysUntil)) ?? nil ?? 0
        }

        private enum CodingKeys: String, CodingKey { case id, title, date, note, images, daysUntil }

        /// `YYYY-MM-DD` (the value the date field and the "All anniversaries" row show).
        var dayString: String { String(date.prefix(10)) }
        /// Local midnight of `dayString` — nil renders `--` on the tear-off tile.
        var tileDate: Date? { Formatters.anniversaryDate(date) }
        var isFuture: Bool { daysUntil >= 0 }
    }

    struct BucketItem: Decodable, Equatable, Identifiable {
        var id: String = ""
        var text: String = ""
        var done: Bool = false
        var createdBy: String = ""
        var doneBy: String?
        var doneNote: String = ""
        var doneImages: [String] = []

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? nil ?? ""
            text = (try? c.decodeIfPresent(String.self, forKey: .text)) ?? nil ?? ""
            done = (try? c.decodeIfPresent(Bool.self, forKey: .done)) ?? nil ?? false
            createdBy = (try? c.decodeIfPresent(String.self, forKey: .createdBy)) ?? nil ?? ""
            doneBy = (try? c.decodeIfPresent(String.self, forKey: .doneBy)) ?? nil
            doneNote = (try? c.decodeIfPresent(String.self, forKey: .doneNote)) ?? nil ?? ""
            doneImages = (try? c.decodeIfPresent([String].self, forKey: .doneImages)) ?? nil ?? []
        }

        private enum CodingKeys: String, CodingKey { case id, text, done, createdBy, doneBy, doneNote, doneImages }

        /// `photo` trailing hint on a done row (`couple.js hasRecord`).
        var hasRecord: Bool { done && (!doneNote.isEmpty || !doneImages.isEmpty) }
    }

    // MARK: Top level

    var matchId: String = ""
    /// `floor((now - anchor)/1d)`, 0 on the confirmation day; null only without an anchor.
    var daysTogether: Int?
    /// ISO anchor (`relationshipStartedAt ?? confirmedAt ?? createdAt`) — not rendered by the hub.
    var since: String?
    var partner = Partner()
    var me = Me()
    /// MY cover for this match (`settings.coupleCovers[matchId]`), `''` when unset (gotcha 12).
    var cover: String = ""
    var loveYou = LoveYou()
    var status = Sides<String>(me: "", partner: "")
    var craving = Craving()
    var schedule = Sides<[ScheduleEntry]>(me: [], partner: [])
    /// Only `gifts.partner` is ever rendered (gotcha 13 — own wishes are hidden here).
    var gifts = Sides<[String]>(me: [], partner: [])
    var anniversaries: [Anniversary] = []
    var bucket: [BucketItem] = []

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        matchId = (try? c.decodeIfPresent(String.self, forKey: .matchId)) ?? nil ?? ""
        daysTogether = (try? c.decodeIfPresent(Int.self, forKey: .daysTogether)) ?? nil
        since = (try? c.decodeIfPresent(String.self, forKey: .since)) ?? nil
        partner = (try? c.decodeIfPresent(Partner.self, forKey: .partner)) ?? nil ?? Partner()
        me = (try? c.decodeIfPresent(Me.self, forKey: .me)) ?? nil ?? Me()
        cover = (try? c.decodeIfPresent(String.self, forKey: .cover)) ?? nil ?? ""
        loveYou = (try? c.decodeIfPresent(LoveYou.self, forKey: .loveYou)) ?? nil ?? LoveYou()
        status = (try? c.decodeIfPresent(Sides<String>.self, forKey: .status)) ?? nil
            ?? Sides<String>(me: "", partner: "")
        craving = (try? c.decodeIfPresent(Craving.self, forKey: .craving)) ?? nil ?? Craving()
        schedule = (try? c.decodeIfPresent(Sides<[ScheduleEntry]>.self, forKey: .schedule)) ?? nil
            ?? Sides<[ScheduleEntry]>(me: [], partner: [])
        gifts = (try? c.decodeIfPresent(Sides<[String]>.self, forKey: .gifts)) ?? nil
            ?? Sides<[String]>(me: [], partner: [])
        anniversaries = (try? c.decodeIfPresent([Anniversary].self, forKey: .anniversaries)) ?? nil ?? []
        bucket = (try? c.decodeIfPresent([BucketItem].self, forKey: .bucket)) ?? nil ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case matchId, daysTogether, since, partner, me, cover, loveYou, status, craving, schedule,
             gifts, anniversaries, bucket
    }

    // MARK: Derived (hub rendering rules — h5-couple §1.1 State C)

    var partnerDisplayName: String { partner.nickname.isEmpty ? L10n.t("Partner") : partner.nickname }
    var partnerNameUpper: String { partnerDisplayName.uppercased() }

    /// Home shows at most 3: the 2 nearest upcoming (ascending) + the most recent past.
    var anniversariesForHub: [Anniversary] {
        let upcoming = anniversaries.filter { $0.daysUntil >= 0 }.sorted { $0.daysUntil < $1.daysUntil }
        let past = anniversaries.filter { $0.daysUntil < 0 }.sorted { $0.daysUntil > $1.daysUntil }
        return Array(upcoming.prefix(2)) + Array(past.prefix(1))
    }

    /// "All anniversaries" popup: every entry sorted by date ascending.
    var anniversariesSortedByDate: [Anniversary] {
        anniversaries.sorted { a, b in
            let da = ISODate.parse(a.date) ?? .distantPast
            let db = ISODate.parse(b.date) ?? .distantPast
            return da < db
        }
    }

    /// Quick-pick chips: history minus the current value, max 5 (gotcha 10).
    var cravingQuickPicks: [String] {
        Array(craving.me.history.filter { !$0.isEmpty && $0 != craving.me.current }.prefix(5))
    }

    func anniversary(id: String) -> Anniversary? { anniversaries.first { $0.id == id } }
    func bucketItem(id: String) -> BucketItem? { bucket.first { $0.id == id } }
}

// MARK: - Status presets (couple.js STATUS_PRESETS — English labels are the stored values)

struct CoupleStatusPreset: Hashable {
    let label: String
    /// Material Symbols name; render through `Theme.Icon.sf`.
    let icon: String
}

enum CoupleStatus {
    static let presets: [CoupleStatusPreset] = [
        CoupleStatusPreset(label: "Happy", icon: "sentiment_very_satisfied"),
        CoupleStatusPreset(label: "Loved", icon: "favorite"),
        CoupleStatusPreset(label: "Excited", icon: "celebration"),
        CoupleStatusPreset(label: "Tired", icon: "bedtime"),
        CoupleStatusPreset(label: "Sad", icon: "sentiment_dissatisfied"),
        CoupleStatusPreset(label: "Awkward", icon: "sentiment_stressed"),
        CoupleStatusPreset(label: "Anxious", icon: "sentiment_worried"),
        CoupleStatusPreset(label: "Angry", icon: "mood_bad"),
    ]

    /// Case-insensitive, trimmed label match (`couple.js statusIcon`); nil for custom text.
    static func icon(for label: String?) -> String? {
        let key = (label ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !key.isEmpty else { return nil }
        return presets.first { $0.label.lowercased() == key }?.icon
    }

    static func isPreset(_ label: String?) -> Bool { icon(for: label) != nil }

    /// Bilingual display of a preset label; custom text is user content and stays verbatim.
    static func display(_ label: String) -> String {
        guard isPreset(label) else { return label }
        switch label {
        case "Happy": return L10n.pick("Happy", "开心")
        case "Loved": return L10n.pick("Loved", "被爱着")
        case "Excited": return L10n.pick("Excited", "兴奋")
        case "Tired": return L10n.pick("Tired", "疲惫")
        case "Sad": return L10n.pick("Sad", "难过")
        case "Awkward": return L10n.pick("Awkward", "尴尬")
        case "Anxious": return L10n.pick("Anxious", "焦虑")
        case "Angry": return L10n.pick("Angry", "生气")
        default: return label
        }
    }
}

// MARK: - Request bodies (couple.controller.ts DTOs — `forbidNonWhitelisted`, unknown keys are 400)

/// `PUT /couple/:id/cover` — `imageUrl` must be an explicit JSON `null` to clear (D: `NullableField`).
struct CoupleCoverRequest: Encodable {
    let imageUrl: NullableField<String>
    init(url: String?) { imageUrl = NullableField(url) }
}

/// `PUT /couple/:id/status` — `''` is allowed and clears the status.
struct CoupleStatusRequest: Encodable {
    let status: String
}

/// `POST /couple/:id/craving` — 400 `Content is required` when blank.
struct CoupleCravingRequest: Encodable {
    let text: String
}

/// `POST /couple/:id/schedule` — iOS sends full ISO-8601 with offset (PLAN D4).
struct CoupleScheduleRequest: Encodable {
    let text: String
    let startAt: String
    let endAt: String
}

/// `POST /couple/:id/anniversary` — `date` is `YYYY-MM-DD`.
struct CoupleAnniversaryRequest: Encodable {
    let title: String
    let date: String
}

/// `PATCH /couple/:id/anniversary/:aid` — H5 always sends all four (image removals persist here).
struct CoupleAnniversaryUpdateRequest: Encodable {
    let title: String
    let date: String
    let note: String
    let images: [String]
}

/// `POST /couple/:id/bucket`.
struct CoupleBucketRequest: Encodable {
    let text: String
}

/// `PATCH /couple/:id/bucket/:bid` — `{done:true, note, images}` or `{done:false}`
/// (nil optionals are omitted by the synthesized encoder).
struct CoupleBucketToggleRequest: Encodable {
    let done: Bool
    var note: String?
    var images: [String]?

    static func complete(note: String, images: [String]) -> CoupleBucketToggleRequest {
        CoupleBucketToggleRequest(done: true, note: note, images: images)
    }

    static let uncomplete = CoupleBucketToggleRequest(done: false)
}
