import Foundation

// MARK: - Matching domain models (api-matching-questionnaire.md §1, §3; h5-match.md §3) — WP-06
//
// Every wire field is decoded leniently (optional + type-tolerant) because the backend's shapes
// differ between the romantic and friend variants of `/matching/status`, and between the DB-row
// and synthesized-default variants of `/matching/preferences` (api gotcha 2).

// MARK: Derived state (api §1.4)

enum MatchState: String, Codable, Equatable {
    case idle
    case searching
    case noMatch = "no_match"
    case matched
    case confirming
    case relationship

    /// Unknown / missing values collapse to `.idle` (H5 treats them as idle).
    init(tolerant raw: String?) {
        self = MatchState(rawValue: raw ?? "") ?? .idle
    }

    init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "idle"
        self.init(tolerant: raw)
    }
}

/// `Match.status` (api §1.3) — only the values the client branches on.
enum MatchRowStatus {
    static let matchedRomantic = "MATCHED_ROMANTIC"
    static let romanticConfirming = "ROMANTIC_CONFIRMING"
    static let relationshipRomantic = "RELATIONSHIP_ROMANTIC"
    static let matchedFriend = "MATCHED_FRIEND"
    static let friendConfirming = "FRIEND_CONFIRMING"
    static let friendConfirmed = "FRIEND_CONFIRMED"
    static let tempStatuses: Set<String> = [matchedRomantic, romanticConfirming, matchedFriend, friendConfirming]
    static let confirmedStatuses: Set<String> = [relationshipRomantic, friendConfirmed, "RELATIONSHIP_MODE"]
}

struct MatchConfigInfo: Decodable, Equatable {
    var cronExpr: String?
    var description: String?

    init(cronExpr: String? = nil, description: String? = nil) {
        self.cronExpr = cronExpr
        self.description = description
    }

    private enum CodingKeys: String, CodingKey { case cronExpr, description }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cronExpr = c.lenient(String.self, .cronExpr)
        description = c.lenient(String.self, .description)
    }
}

// MARK: `/matching/status` — romantic single match

struct RomanticMatch: Decodable, Equatable {
    var id: String?
    var status: String?
    var myConfirmed: Bool
    var partnerConfirmed: Bool
    /// ms left in the 48 h window (temp statuses); nil once RELATIONSHIP_ROMANTIC.
    var remainingMs: Double?
    var score: Double?
    var matchedAt: String?
    var relationshipStartedAt: String?
    var confirmedAt: String?

    init(id: String? = nil, status: String? = nil, myConfirmed: Bool = false, partnerConfirmed: Bool = false,
         remainingMs: Double? = nil, score: Double? = nil, matchedAt: String? = nil,
         relationshipStartedAt: String? = nil, confirmedAt: String? = nil) {
        self.id = id; self.status = status; self.myConfirmed = myConfirmed; self.partnerConfirmed = partnerConfirmed
        self.remainingMs = remainingMs; self.score = score; self.matchedAt = matchedAt
        self.relationshipStartedAt = relationshipStartedAt; self.confirmedAt = confirmedAt
    }

    private enum CodingKeys: String, CodingKey {
        case id, status, myConfirmed, partnerConfirmed, remainingMs, score, matchedAt, relationshipStartedAt, confirmedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id)
        status = c.lenient(String.self, .status)
        myConfirmed = c.lenientBool(.myConfirmed) ?? false
        partnerConfirmed = c.lenientBool(.partnerConfirmed) ?? false
        remainingMs = c.lenientDouble(.remainingMs)
        score = c.lenientDouble(.score)
        matchedAt = c.lenient(String.self, .matchedAt)
        relationshipStartedAt = c.lenient(String.self, .relationshipStartedAt)
        confirmedAt = c.lenient(String.self, .confirmedAt)
    }

    var isTemp: Bool { status.map { MatchRowStatus.tempStatuses.contains($0) } ?? (remainingMs != nil) }
}

// MARK: `/matching/status` — friend multi match

struct FriendMatch: Decodable, Identifiable, Equatable {
    var matchId: String
    var status: String?
    var score: Double?
    var myConfirmed: Bool
    var partnerConfirmed: Bool
    var remainingMs: Double?
    var matchedAt: String?
    var partner: PublicProfile?

    var id: String { matchId }

    init(matchId: String, status: String? = nil, score: Double? = nil, myConfirmed: Bool = false,
         partnerConfirmed: Bool = false, remainingMs: Double? = nil, matchedAt: String? = nil, partner: PublicProfile? = nil) {
        self.matchId = matchId; self.status = status; self.score = score; self.myConfirmed = myConfirmed
        self.partnerConfirmed = partnerConfirmed; self.remainingMs = remainingMs; self.matchedAt = matchedAt; self.partner = partner
    }

    private enum CodingKeys: String, CodingKey { case matchId, status, score, myConfirmed, partnerConfirmed, remainingMs, matchedAt, partner }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        matchId = c.lenient(String.self, .matchId) ?? ""
        status = c.lenient(String.self, .status)
        score = c.lenientDouble(.score)
        myConfirmed = c.lenientBool(.myConfirmed) ?? false
        partnerConfirmed = c.lenientBool(.partnerConfirmed) ?? false
        remainingMs = c.lenientDouble(.remainingMs)
        matchedAt = c.lenient(String.self, .matchedAt)
        partner = c.lenient(PublicProfile.self, .partner)
    }

    /// `FRIEND_CONFIRMED` — permanent friend (no timer, no footnote).
    var isConfirmed: Bool { status == MatchRowStatus.friendConfirmed }
}

// MARK: `/matching/status` — union of both variants (api §3.3)

struct MatchStatus: Decodable, Equatable {
    var mode: MatchMode
    var state: MatchState
    var matchConfig: MatchConfigInfo?
    /// ISO UTC of the next cron fire (timezone-correct) — preferred countdown source.
    var nextRunAt: String?
    var searchingSince: String?
    /// Not sent by the current backend; tolerated for legacy/no-match copy (h5-match §1.5).
    var message: String?
    // romantic
    var match: RomanticMatch?
    var partner: PublicProfile?
    // friend
    var matches: [FriendMatch]
    /// Top-level id some payloads carry instead of `match.id`; H5 reads `match?.id || matchId`.
    var matchId: String?

    init(mode: MatchMode, state: MatchState, matchConfig: MatchConfigInfo? = nil, nextRunAt: String? = nil,
         searchingSince: String? = nil, message: String? = nil, match: RomanticMatch? = nil,
         partner: PublicProfile? = nil, matches: [FriendMatch] = [], matchId: String? = nil) {
        self.mode = mode; self.state = state; self.matchConfig = matchConfig; self.nextRunAt = nextRunAt
        self.searchingSince = searchingSince; self.message = message; self.match = match; self.partner = partner
        self.matches = matches; self.matchId = matchId
    }

    private enum CodingKeys: String, CodingKey {
        case mode, state, status, matchConfig, nextRunAt, searchingSince, message, match, partner, matches
        case matchId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        mode = MatchMode(rawValue: c.lenient(String.self, .mode) ?? "") ?? .romantic
        // H5 tolerates a legacy `status` field as the state source.
        let rawState = c.lenient(String.self, .state) ?? c.lenient(String.self, .status)?.lowercased()
        state = MatchState(tolerant: rawState)
        matchConfig = c.lenient(MatchConfigInfo.self, .matchConfig)
        matchId = c.lenient(String.self, .matchId)
        nextRunAt = c.lenient(String.self, .nextRunAt)
        searchingSince = c.lenient(String.self, .searchingSince)
        message = c.lenient(String.self, .message)
        match = c.lenient(RomanticMatch.self, .match)
        partner = c.lenient(PublicProfile.self, .partner)
        matches = c.lenient([FriendMatch].self, .matches) ?? []
    }

    /// Optimistic `{ mode, state:'searching' }` render after a join (keeps the countdown source).
    static func optimisticSearching(mode: MatchMode, previous: MatchStatus?) -> MatchStatus {
        MatchStatus(mode: mode, state: .searching, matchConfig: previous?.matchConfig, nextRunAt: previous?.nextRunAt,
                    searchingSince: nil, message: nil, match: nil, partner: nil, matches: previous?.matches ?? [])
    }

    /// `remainingMs` → absolute deadline at render time (api gotcha 7: never cache across rounds).
    static func deadline(remainingMs: Double?, now: Date = Date()) -> Date? {
        guard let ms = remainingMs, ms.isFinite else { return nil }
        return now.addingTimeInterval(max(0, ms) / 1000)
    }
}

// MARK: `/matching/preferences` read model (api §3.8 — two shapes, decode everything optional)

struct MatchPreferencesRead: Decodable, Equatable {
    var id: String?
    var userId: String?
    var mode: MatchMode
    var requireSameCity: Bool
    var requireSameUniversity: Bool
    var requireSameMajor: Bool
    var preferredNationalities: [String]
    var preferredMbti: [String]
    var preferredGender: String?
    var ageMin: Int?
    var ageMax: Int?
    var universityStage: String?
    var preferredInterests: [String]
    var preferredActivities: [String]
    var friendRequirements: String?
    var enhancedModeEnabled: Bool
    var friendEnhancedCells: Int?
    var matchBasis: String?
    var extraMatchInfo: String?
    var createdAt: String?
    var updatedAt: String?

    /// The synthesized default the server returns for never-set users.
    static func defaults(mode: MatchMode) -> MatchPreferencesRead {
        MatchPreferencesRead(mode: mode)
    }

    init(id: String? = nil, userId: String? = nil, mode: MatchMode, requireSameCity: Bool = false,
         requireSameUniversity: Bool = false, requireSameMajor: Bool = false, preferredNationalities: [String] = [],
         preferredMbti: [String] = [], preferredGender: String? = nil, ageMin: Int? = nil, ageMax: Int? = nil,
         universityStage: String? = nil, preferredInterests: [String] = [], preferredActivities: [String] = [],
         friendRequirements: String? = nil, enhancedModeEnabled: Bool = false, friendEnhancedCells: Int? = nil,
         matchBasis: String? = nil, extraMatchInfo: String? = nil, createdAt: String? = nil, updatedAt: String? = nil) {
        self.id = id; self.userId = userId; self.mode = mode; self.requireSameCity = requireSameCity
        self.requireSameUniversity = requireSameUniversity; self.requireSameMajor = requireSameMajor
        self.preferredNationalities = preferredNationalities; self.preferredMbti = preferredMbti
        self.preferredGender = preferredGender; self.ageMin = ageMin; self.ageMax = ageMax
        self.universityStage = universityStage; self.preferredInterests = preferredInterests
        self.preferredActivities = preferredActivities; self.friendRequirements = friendRequirements
        self.enhancedModeEnabled = enhancedModeEnabled; self.friendEnhancedCells = friendEnhancedCells
        self.matchBasis = matchBasis; self.extraMatchInfo = extraMatchInfo; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case id, userId, mode, requireSameCity, requireSameUniversity, requireSameMajor, preferredNationalities, preferredMbti,
             preferredGender, ageMin, ageMax, universityStage, preferredInterests, preferredActivities, friendRequirements,
             enhancedModeEnabled, friendEnhancedCells, matchBasis, extraMatchInfo, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id)
        userId = c.lenient(String.self, .userId)
        mode = MatchMode(rawValue: c.lenient(String.self, .mode) ?? "") ?? .romantic
        requireSameCity = c.lenientBool(.requireSameCity) ?? false
        requireSameUniversity = c.lenientBool(.requireSameUniversity) ?? false
        requireSameMajor = c.lenientBool(.requireSameMajor) ?? false
        preferredNationalities = c.lenient([String].self, .preferredNationalities) ?? []
        preferredMbti = c.lenient([String].self, .preferredMbti) ?? []
        preferredGender = c.lenient(String.self, .preferredGender)
        ageMin = c.lenientInt(.ageMin)
        ageMax = c.lenientInt(.ageMax)
        universityStage = c.lenient(String.self, .universityStage)
        preferredInterests = c.lenient([String].self, .preferredInterests) ?? []
        preferredActivities = c.lenient([String].self, .preferredActivities) ?? []
        friendRequirements = c.lenient(String.self, .friendRequirements)
        enhancedModeEnabled = c.lenientBool(.enhancedModeEnabled) ?? false
        friendEnhancedCells = c.lenientInt(.friendEnhancedCells)
        matchBasis = c.lenient(String.self, .matchBasis)
        extraMatchInfo = c.lenient(String.self, .extraMatchInfo)
        createdAt = c.lenient(String.self, .createdAt)
        updatedAt = c.lenient(String.self, .updatedAt)
    }

    /// Whitelisted stages of the comma-joined `universityStage` (server order preserved).
    var stages: [String] {
        (universityStage ?? "")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { MatchPreferencesWrite.stageWhitelist.contains($0) }
    }

    /// H5 merges its own PUT payload into the cache after a successful save.
    mutating func merge(_ w: MatchPreferencesWrite) {
        mode = w.mode
        requireSameCity = w.requireSameCity
        requireSameUniversity = w.requireSameUniversity
        preferredGender = w.preferredGender.value
        ageMin = w.ageMin.value
        ageMax = w.ageMax.value
        if let s = w.universityStage { universityStage = s.value }
        if let i = w.preferredInterests { preferredInterests = i }
        if let e = w.extraMatchInfo { extraMatchInfo = e }
    }
}

// MARK: `PUT /matching/preferences` (api §3.9 — whitelist only; unknown keys → 400)

struct MatchPreferencesWrite: Encodable, Equatable {
    static let stageWhitelist: [String] = ["undergraduate", "master", "doctor"]
    static let ageRange = 18...30
    static let defaultAgeMin = 18
    static let defaultAgeMax = 24
    static let extraInfoMax = 500
    static let maxPriorityInterests = 3

    var mode: MatchMode
    var requireSameCity: Bool
    var requireSameUniversity: Bool
    /// `null` = any gender (H5 sends null for "all").
    var preferredGender: NullableField<String>
    /// `null,null` = any age; otherwise ordered min/max.
    var ageMin: NullableField<Int>
    var ageMax: NullableField<Int>
    /// Romantic only: comma list or `null` (omitted entirely for friend).
    var universityStage: NullableField<String>?
    /// Friend only: ≤3 (omitted entirely for romantic).
    var preferredInterests: [String]?
    /// Omitted when the preferences failed to load and the field is untouched (gotcha 9).
    var extraMatchInfo: String?

    static func == (l: MatchPreferencesWrite, r: MatchPreferencesWrite) -> Bool {
        l.mode == r.mode && l.requireSameCity == r.requireSameCity && l.requireSameUniversity == r.requireSameUniversity
            && l.preferredGender.value == r.preferredGender.value && l.ageMin.value == r.ageMin.value && l.ageMax.value == r.ageMax.value
            && l.universityStage?.value == r.universityStage?.value && l.preferredInterests == r.preferredInterests
            && l.extraMatchInfo == r.extraMatchInfo
    }

    /// Age pair per H5 `saveFilterPrefs`: any → nulls, else ordered `min(raw)…max(raw)`.
    static func agePair(any: Bool, rawMin: Int?, rawMax: Int?) -> (NullableField<Int>, NullableField<Int>) {
        if any { return (NullableField(nil), NullableField(nil)) }
        let a = rawMin ?? defaultAgeMin
        let b = rawMax ?? defaultAgeMax
        return (NullableField(min(a, b)), NullableField(max(a, b)))
    }

    static func romantic(gender: String?, stages: [String], ageAny: Bool, ageMin: Int?, ageMax: Int?,
                         requireSameUniversity: Bool, requireSameCity: Bool, extraMatchInfo: String?) -> MatchPreferencesWrite {
        let (lo, hi) = agePair(any: ageAny, rawMin: ageMin, rawMax: ageMax)
        let g = (gender == nil || gender == "all" || gender == "") ? nil : gender
        let stageList = stages.filter { stageWhitelist.contains($0) }
        return MatchPreferencesWrite(
            mode: .romantic, requireSameCity: requireSameCity, requireSameUniversity: requireSameUniversity,
            preferredGender: NullableField(g), ageMin: lo, ageMax: hi,
            universityStage: NullableField(stageList.isEmpty ? nil : stageList.joined(separator: ",")),
            preferredInterests: nil, extraMatchInfo: extraMatchInfo)
    }

    static func friend(gender: String?, interests: [String], ageAny: Bool, ageMin: Int?, ageMax: Int?,
                       requireSameUniversity: Bool, requireSameCity: Bool, extraMatchInfo: String?) -> MatchPreferencesWrite {
        let (lo, hi) = agePair(any: ageAny, rawMin: ageMin, rawMax: ageMax)
        let g = (gender == nil || gender == "all" || gender == "") ? nil : gender
        return MatchPreferencesWrite(
            mode: .friend, requireSameCity: requireSameCity, requireSameUniversity: requireSameUniversity,
            preferredGender: NullableField(g), ageMin: lo, ageMax: hi,
            universityStage: nil, preferredInterests: Array(interests.prefix(maxPriorityInterests)), extraMatchInfo: extraMatchInfo)
    }
}

// MARK: `POST /matching/start` (api §3.1)

struct StartMatchRequest: Encodable {
    var mode: MatchMode
    var enhanced: Bool
    /// Friend + enhanced only (1…5); omitted otherwise.
    var cells: Int?

    init(mode: MatchMode, enhanced: Bool, cells: Int? = nil) {
        self.mode = mode
        self.enhanced = enhanced
        self.cells = (mode == .friend && enhanced) ? cells.map { min(max($0, 1), 5) } : nil
    }
}

struct StartMatchResult: Decodable, Equatable {
    var status: String?
    var message: String?

    private enum CodingKeys: String, CodingKey { case status, message }

    init(status: String? = nil, message: String? = nil) {
        self.status = status
        self.message = message
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = c.lenient(String.self, .status)
        message = c.lenient(String.self, .message)
    }
}

/// `POST /matching/:id/confirm-relationship` (api §3.6): `WAITING` vs `RELATIONSHIP_ROMANTIC` / `FRIEND_CONFIRMED`.
struct ConfirmResult: Decodable, Equatable {
    var status: String?
    var message: String?

    private enum CodingKeys: String, CodingKey { case status, message }

    init(status: String? = nil, message: String? = nil) {
        self.status = status
        self.message = message
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = c.lenient(String.self, .status)
        message = c.lenient(String.self, .message)
    }

    /// H5: status ∈ {CONFIRMED, MATCHED, RELATIONSHIP, FINAL, ACTIVE} (case-insensitive substring) → finalized.
    var isFinalized: Bool {
        let s = (status ?? "").uppercased()
        guard !s.isEmpty, s != "WAITING" else { return false }
        return ["CONFIRMED", "MATCHED", "RELATIONSHIP", "FINAL", "ACTIVE"].contains { s.contains($0) }
    }
}

/// `POST /matching/:id/dissolve` body — `reason` omitted → `{}` (match screen), `user_dissolved` from chat.
struct DissolveRequest: Encodable {
    var reason: String?
    init(reason: String? = nil) { self.reason = reason }
}

// MARK: `POST /matching/feedback/events` (api §3.10)

enum FeedbackEventType: String, Encodable, Hashable {
    case viewed
    case openedProfile
}

struct FeedbackEvent: Encodable, Hashable {
    var matchId: String
    var type: FeedbackEventType

    init(matchId: String, type: FeedbackEventType) {
        self.matchId = matchId
        self.type = type
    }

    var key: String { "\(matchId):\(type.rawValue)" }
}

struct FeedbackEventsRequest: Encodable {
    static let maxEvents = 50
    var events: [FeedbackEvent]
    init(events: [FeedbackEvent]) { self.events = Array(events.prefix(FeedbackEventsRequest.maxEvents)) }
}

struct FeedbackAccepted: Decodable, Equatable {
    var accepted: Int?
    private enum CodingKeys: String, CodingKey { case accepted }
    init(accepted: Int? = nil) { self.accepted = accepted }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accepted = c.lenientInt(.accepted)
    }
}

// MARK: `POST /matching/connect` / `connect-user` (api §3.11–3.12)

struct ConnectCodeRequest: Encodable {
    var code: String
    init(code: String) { self.code = code }
}

struct ConnectUserRequest: Encodable {
    var userId: String
    init(userId: String) { self.userId = userId }
}

struct ConnectResult: Decodable, Equatable {
    var matchId: String
    var message: String?
    var partner: PublicProfile?

    private enum CodingKeys: String, CodingKey { case matchId, message, partner }

    init(matchId: String, message: String? = nil, partner: PublicProfile? = nil) {
        self.matchId = matchId
        self.message = message
        self.partner = partner
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        matchId = c.lenient(String.self, .matchId) ?? ""
        message = c.lenient(String.self, .message)
        partner = c.lenient(PublicProfile.self, .partner)
    }
}

// MARK: `GET /matching/milestones` (api §3.5)

struct Milestones: Decodable, Equatable {
    var state: String                // "none" | "relationship"
    var daysTogether: Int?
    var messageCount: Int?
    var postCount: Int?
    var sharedInterests: [String]
    var matchScore: Double?
    var startedAt: String?

    private enum CodingKeys: String, CodingKey { case state, daysTogether, messageCount, postCount, sharedInterests, matchScore, startedAt }

    init(state: String = "none", daysTogether: Int? = nil, messageCount: Int? = nil, postCount: Int? = nil,
         sharedInterests: [String] = [], matchScore: Double? = nil, startedAt: String? = nil) {
        self.state = state; self.daysTogether = daysTogether; self.messageCount = messageCount; self.postCount = postCount
        self.sharedInterests = sharedInterests; self.matchScore = matchScore; self.startedAt = startedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = c.lenient(String.self, .state) ?? "none"
        daysTogether = c.lenientInt(.daysTogether)
        messageCount = c.lenientInt(.messageCount)
        postCount = c.lenientInt(.postCount)
        sharedInterests = c.lenient([String].self, .sharedInterests) ?? []
        matchScore = c.lenientDouble(.matchScore)
        startedAt = c.lenient(String.self, .startedAt)
    }

    var isRelationship: Bool { state == "relationship" }
}

// MARK: - Reveal schedule (h5-match.md §7 gotcha 1–2)
//
// Countdown source order: `nextRunAt` (server, timezone-correct) → local parse of
// `matchConfig.cronExpr` (`m h * * dow`, device time) → next Friday 17:00 local.

enum RevealSchedule {
    static func nextReveal(status: MatchStatus?, now: Date = Date()) -> Date {
        if let s = status?.nextRunAt, let d = ISODate.parse(s) { return d }
        if let expr = status?.matchConfig?.cronExpr, let d = nextCronRun(expr, from: now) { return d }
        return Formatters.nextFriday17Local(from: now)
    }

    /// Minimal 5-field cron: `minute hour * * dow` where `dow` is `*`, a number (0–7, 7 == 0 == Sunday),
    /// a comma list or a range. Day-of-month / month must be `*` (anything else → nil, like H5).
    static func nextCronRun(_ expr: String, from now: Date = Date()) -> Date? {
        let parts = expr.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
        guard parts.count == 5, let minute = Int(parts[0]), let hour = Int(parts[1]),
              (0...59).contains(minute), (0...23).contains(hour), parts[2] == "*", parts[3] == "*" else { return nil }
        guard let dows = parseDow(parts[4]) else { return nil }
        let cal = Calendar.current
        for offset in 0...7 {
            guard let day = cal.date(byAdding: .day, value: offset, to: now) else { continue }
            var comps = cal.dateComponents([.year, .month, .day], from: day)
            comps.hour = hour
            comps.minute = minute
            comps.second = 0
            guard let candidate = cal.date(from: comps) else { continue }
            let jsDow = cal.component(.weekday, from: candidate) - 1   // Sunday = 0
            if candidate > now && dows.contains(jsDow) { return candidate }
        }
        return nil
    }

    private static func parseDow(_ field: String) -> Set<Int>? {
        if field == "*" { return Set(0...6) }
        var out = Set<Int>()
        for piece in field.split(separator: ",") {
            let p = piece.trimmingCharacters(in: .whitespaces)
            if let dash = p.firstIndex(of: "-") {
                guard let a = Int(p[p.startIndex..<dash]), let b = Int(p[p.index(after: dash)...]), a <= b else { return nil }
                for v in a...b { out.insert(v % 7) }
            } else if let v = Int(p), (0...7).contains(v) {
                out.insert(v % 7)
            } else {
                return nil
            }
        }
        return out.isEmpty ? nil : out
    }

    /// Monday 00:00 of the local week containing `now`.
    static func weekStart(for now: Date = Date()) -> Date {
        let cal = Calendar.current
        let weekday = cal.component(.weekday, from: now)          // Sunday = 1 … Saturday = 7
        let daysSinceMonday = (weekday + 5) % 7                     // Monday → 0 … Sunday → 6
        let dayStart = cal.startOfDay(for: now)
        return cal.date(byAdding: .day, value: -daysSinceMonday, to: dayStart) ?? dayStart
    }

    /// Index (0 = Monday … 6 = Sunday) of the reveal inside the current week, or nil when it falls
    /// outside Mon–Sun (date-based, not weekday-based — gotcha 2).
    static func revealIndexInWeek(reveal: Date, now: Date = Date()) -> Int? {
        let cal = Calendar.current
        let start = weekStart(for: now)
        let revealDay = cal.startOfDay(for: reveal)
        let days = cal.dateComponents([.day], from: start, to: revealDay).day ?? Int.min
        return (0...6).contains(days) ? days : nil
    }

    /// Day-of-month numbers for the seven cells of the current week (zero-padded).
    static func weekDayNumbers(now: Date = Date()) -> [String] {
        let cal = Calendar.current
        let start = weekStart(for: now)
        return (0..<7).map { i in
            let d = cal.date(byAdding: .day, value: i, to: start) ?? start
            let n = cal.component(.day, from: d)
            return n < 10 ? "0\(n)" : "\(n)"
        }
    }

    /// Index of today inside the Mon–Sun row.
    static func todayIndex(now: Date = Date()) -> Int {
        let weekday = Calendar.current.component(.weekday, from: now)
        return (weekday + 5) % 7
    }
}
