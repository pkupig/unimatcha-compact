#if DEBUG
import Foundation

/// Decode / behaviour checks for the matching contract (PLAN §H.4), run by WP-16's
/// `-unimatcha-decode-check`. Fixtures: `match-status-romantic-{idle,searching,matched,relationship}`,
/// `match-status-friend-matched`, `match-preferences-{row,default}`, `match-start-already`.
///
/// Beyond decoding these also pin the rules that are easy to regress: the §1.2 state matrix, the
/// reveal-countdown source order + date-based week badge (gotchas 1–2), the summary-box value
/// formatting (§1.3), the PUT whitelist / explicit-null encoding (api gotcha 1) and the
/// "already matching" 200-message detection (api gotcha 3).
enum MatchFixtures {
    static func verify() throws {
        try verifyRomanticStatuses()
        try verifyFriendStatus()
        try verifyPreferences()
        try verifyStartAlready()
        try verifyStateMatrix()
        try verifyRevealSchedule()
        try verifySummaryFormatting()
        try verifyWritePayloads()
    }

    // MARK: Romantic `/matching/status`

    private static func verifyRomanticStatuses() throws {
        var f = "match-status-romantic-idle"
        let idle = try FixtureCheck.decode(MatchStatus.self, fixture: f)
        try FixtureCheck.expect(idle.mode == .romantic && idle.state == .idle, f, "romantic idle")
        try FixtureCheck.expect(idle.match == nil && idle.partner == nil && idle.matches.isEmpty, f, "no match payload")
        try FixtureCheck.expect(idle.matchConfig?.cronExpr == "0 17 * * 5", f, "cron expression")
        try FixtureCheck.expect(ISODate.parse(idle.nextRunAt ?? "") != nil, f, "nextRunAt parses")

        f = "match-status-romantic-searching"
        let searching = try FixtureCheck.decode(MatchStatus.self, fixture: f)
        try FixtureCheck.expect(searching.state == .searching, f, "searching state")
        try FixtureCheck.expect(searching.searchingSince == "2026-09-01T11:20:31.004Z", f, "searchingSince")
        try FixtureCheck.expect(searching.matchConfig?.description == nil, f, "null description tolerated")

        f = "match-status-romantic-matched"
        let matched = try FixtureCheck.decode(MatchStatus.self, fixture: f)
        try FixtureCheck.expect(matched.state == .confirming, f, "confirming state")
        let m = try require(matched.match, f, "match object")
        try FixtureCheck.expect(m.id == "clmatch000000000000000001", f, "match id")
        try FixtureCheck.expect(m.status == MatchRowStatus.romanticConfirming && m.isTemp, f, "temp status")
        try FixtureCheck.expect(m.myConfirmed && !m.partnerConfirmed, f, "one-sided confirmation")
        try FixtureCheck.expect(m.remainingMs == 93_784_000, f, "remainingMs")
        // 93 784 000 ms = 1 d 02:03:04 → the matched card's mono countdown.
        try FixtureCheck.expect(Formatters.countdown(ms: 93_784_000) == "1d 02:03:04", f, "countdown format")
        let p = try require(matched.partner, f, "partner")
        try FixtureCheck.expect(p.nickname == "沐晨" && p.school == "University of Warwick", f, "partner fields")
        try FixtureCheck.expect(p.isVerified, f, "verificationStatus verified")
        try FixtureCheck.expect((p.interests ?? []).count == 3, f, "interests")

        f = "match-status-romantic-relationship"
        let rel = try FixtureCheck.decode(MatchStatus.self, fixture: f)
        try FixtureCheck.expect(rel.state == .relationship, f, "relationship state")
        try FixtureCheck.expect(rel.match?.remainingMs == nil, f, "no TTL once permanent")
        try FixtureCheck.expect(rel.matchConfig == nil && rel.nextRunAt == nil, f, "null config tolerated")
        try FixtureCheck.expect(!(rel.match?.isTemp ?? true), f, "permanent status not temp")
    }

    // MARK: Friend `/matching/status`

    private static func verifyFriendStatus() throws {
        let f = "match-status-friend-matched"
        let s = try FixtureCheck.decode(MatchStatus.self, fixture: f)
        try FixtureCheck.expect(s.mode == .friend && s.state == .matched, f, "friend matched")
        try FixtureCheck.expect(s.matches.count == 3, f, "three candidates")
        try FixtureCheck.expect(s.matches[0].status == MatchRowStatus.matchedFriend && !s.matches[0].isConfirmed, f, "temp friend")
        try FixtureCheck.expect(s.matches[0].remainingMs == 3_723_000, f, "temp remainingMs")
        try FixtureCheck.expect(Formatters.countdown(ms: 3_723_000) == "01:02:03", f, "candidate timer format")
        try FixtureCheck.expect(s.matches[1].isConfirmed && s.matches[1].score == nil, f, "QR-connected friend: confirmed, no score")
        try FixtureCheck.expect(s.matches[2].partner == nil, f, "null partner tolerated")
    }

    // MARK: `/matching/preferences` (two shapes — api gotcha 2)

    private static func verifyPreferences() throws {
        var f = "match-preferences-row"
        let row = try FixtureCheck.decode(MatchPreferencesRead.self, fixture: f)
        try FixtureCheck.expect(row.id != nil && row.userId != nil && row.updatedAt != nil, f, "DB-row extras present")
        try FixtureCheck.expect(row.mode == .romantic, f, "mode")
        try FixtureCheck.expect(row.preferredGender == "female" && row.ageMin == 19 && row.ageMax == 25, f, "gender + ages")
        try FixtureCheck.expect(row.requireSameUniversity && row.requireSameCity, f, "school switches")
        // `mba` is not on the whitelist and must be dropped by `stages`.
        try FixtureCheck.expect(row.stages == ["undergraduate", "master"], f, "whitelisted stages only")
        try FixtureCheck.expect(row.enhancedModeEnabled && row.friendEnhancedCells == 3, f, "read-only enhanced echo")
        try FixtureCheck.expect((row.extraMatchInfo ?? "").hasPrefix("I row"), f, "extraMatchInfo")

        f = "match-preferences-default"
        let def = try FixtureCheck.decode(MatchPreferencesRead.self, fixture: f)
        try FixtureCheck.expect(def.id == nil && def.userId == nil && def.createdAt == nil, f, "synthesized default has no row keys")
        try FixtureCheck.expect(def.mode == .friend, f, "mode")
        try FixtureCheck.expect(def.preferredGender == nil && def.ageMin == nil && def.ageMax == nil, f, "all-null defaults")
        try FixtureCheck.expect(def.friendEnhancedCells == nil, f, "nullable friendEnhancedCells")
        try FixtureCheck.expect(def.stages.isEmpty && def.preferredInterests.isEmpty, f, "empty lists")
    }

    // MARK: `POST /matching/start` — 200 with "Already matching" (api gotcha 3)

    private static func verifyStartAlready() throws {
        let f = "match-start-already"
        let raw = try FixtureCheck.data(fixture: f)
        let env = try JSONDecoder().decode(APIEnvelope<StartMatchResult>.self, from: raw)
        try FixtureCheck.expect(env.success, f, "success envelope (200, not an error)")
        try FixtureCheck.expect(env.data?.status == "SEARCHING", f, "status SEARCHING in both cases")
        let message = env.data?.message ?? env.message
        try FixtureCheck.expect(APIError.isAlreadyMatching(text: message), f, "already-matching detection")
        try FixtureCheck.expect(!APIError.isAlreadyMatching(text: "Joined this round's matching pool"), f, "normal join is not already-matching")
        try FixtureCheck.expect(!APIError.isAlreadyMatching(text: nil), f, "nil message is not already-matching")
    }

    // MARK: State matrix (h5-match §1.2 / PLAN §C.3)

    private static func verifyStateMatrix() throws {
        let f = "state-matrix"
        func romantic(_ fixture: String) throws -> MatchPaneViewModel.Content {
            MatchPaneViewModel.content(for: .romantic, status: try FixtureCheck.decode(MatchStatus.self, fixture: fixture))
        }
        let idleContent = try romantic("match-status-romantic-idle")
        let searchingContent = try romantic("match-status-romantic-searching")
        try FixtureCheck.expect(idleContent == .plan(searching: false), f, "romantic idle → plan")
        try FixtureCheck.expect(searchingContent == .plan(searching: true), f, "romantic searching → plan(searching)")
        if case .matched = try romantic("match-status-romantic-matched") {} else {
            throw FixtureCheck.Failure(fixture: f, reason: "romantic confirming → matched card")
        }
        if case .couple(let id, _) = try romantic("match-status-romantic-relationship") {
            try FixtureCheck.expect(id == "clmatch000000000000000002", f, "couple slot carries the matchId")
        } else {
            throw FixtureCheck.Failure(fixture: f, reason: "romantic relationship → couple slot")
        }

        // Unknown state → idle plan; partner without a nickname → Profile Unavailable.
        let unknown = try JSONDecoder().decode(MatchStatus.self, from: Data(#"{"mode":"romantic","state":"who-knows"}"#.utf8))
        try FixtureCheck.expect(unknown.state == .idle, f, "unknown state collapses to idle")
        let noPartner = MatchStatus(mode: .romantic, state: .matched, match: RomanticMatch(id: "m1"), partner: nil)
        try FixtureCheck.expect(MatchPaneViewModel.content(for: .romantic, status: noPartner) == .partnerMissing, f, "missing partner → Profile Unavailable")
        try FixtureCheck.expect(MatchPaneViewModel.content(for: .romantic, status: nil) == .plan(searching: false), f, "no status → idle plan")

        let friend = try FixtureCheck.decode(MatchStatus.self, fixture: "match-status-friend-matched")
        if case .candidates(let list) = MatchPaneViewModel.content(for: .friend, status: friend) {
            try FixtureCheck.expect(list.count == 3, f, "friend matched → candidate list")
        } else {
            throw FixtureCheck.Failure(fixture: f, reason: "friend matched → candidates")
        }
        // friend `matched` with an empty array renders as the idle plan page (gotcha 15).
        let emptyMatched = MatchStatus(mode: .friend, state: .matched, matches: [])
        try FixtureCheck.expect(MatchPaneViewModel.content(for: .friend, status: emptyMatched) == .plan(searching: false), f, "friend matched + empty → plan idle")
        // friend `no_match` with existing friends also falls through to the plan page.
        let noMatchWithFriends = MatchStatus(mode: .friend, state: .noMatch, matches: friend.matches)
        try FixtureCheck.expect(MatchPaneViewModel.content(for: .friend, status: noMatchWithFriends) == .plan(searching: false), f, "friend no_match + friends → plan idle")
        let noFriends = MatchStatus(mode: .friend, state: .noMatch, message: "Nothing this round", matches: [])
        try FixtureCheck.expect(MatchPaneViewModel.content(for: .friend, status: noFriends) == .noFriends(message: "Nothing this round"), f, "friend no_match + empty → no-friends card")
        // Only `matched` renders candidates: `relationship` (unreachable with a non-empty array —
        // the server rewrites the state, api §3.3) falls through to the idle plan like H5.
        let relFriend = MatchStatus(mode: .friend, state: .relationship, matches: friend.matches)
        try FixtureCheck.expect(MatchPaneViewModel.content(for: .friend, status: relFriend) == .plan(searching: false), f, "friend relationship → plan idle")
        // friend `searching` still carries confirmed friends but renders the plan page (api gotcha 8).
        let searchingFriend = MatchStatus(mode: .friend, state: .searching, matches: friend.matches)
        try FixtureCheck.expect(MatchPaneViewModel.content(for: .friend, status: searchingFriend) == .plan(searching: true), f, "friend searching → plan")
    }

    // MARK: Reveal countdown source order + week row (h5-match gotchas 1–2)

    private static func verifyRevealSchedule() throws {
        let f = "reveal-schedule"
        let cal = Calendar.current
        let now = try require(cal.date(from: DateComponents(year: 2026, month: 9, day: 3, hour: 12)), f, "fixed now (Thu 2026-09-03 12:00)")

        // 1. `nextRunAt` wins.
        let withRun = MatchStatus(mode: .romantic, state: .searching,
                                  matchConfig: MatchConfigInfo(cronExpr: "0 17 * * 5"),
                                  nextRunAt: "2026-09-04T09:00:00.000Z")
        try FixtureCheck.expect(RevealSchedule.nextReveal(status: withRun, now: now) == ISODate.parse("2026-09-04T09:00:00.000Z"), f, "nextRunAt preferred")

        // 2. cron parsed locally when nextRunAt is missing → Friday 17:00 local (2026-09-04).
        let cronOnly = MatchStatus(mode: .romantic, state: .searching, matchConfig: MatchConfigInfo(cronExpr: "0 17 * * 5"), nextRunAt: nil)
        let fromCron = RevealSchedule.nextReveal(status: cronOnly, now: now)
        let cronParts = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fromCron)
        try FixtureCheck.expect(cronParts.year == 2026 && cronParts.month == 9 && cronParts.day == 4
                                && cronParts.hour == 17 && cronParts.minute == 0, f, "cron → Fri 2026-09-04 17:00 local")

        // 3. no config at all → next Friday 17:00 local.
        try FixtureCheck.expect(RevealSchedule.nextReveal(status: nil, now: now) == Formatters.nextFriday17Local(from: now), f, "fallback next Friday 17:00")
        // Malformed cron falls through to the same fallback.
        let badCron = MatchStatus(mode: .romantic, state: .idle, matchConfig: MatchConfigInfo(cronExpr: "0 17 3 * 5"), nextRunAt: nil)
        try FixtureCheck.expect(RevealSchedule.nextReveal(status: badCron, now: now) == Formatters.nextFriday17Local(from: now), f, "day-of-month cron unsupported → fallback")

        // Week row: Monday-based indices, 7 zero-padded day numbers.
        try FixtureCheck.expect(RevealSchedule.todayIndex(now: now) == 3, f, "Thursday → index 3")
        let numbers = RevealSchedule.weekDayNumbers(now: now)
        try FixtureCheck.expect(numbers == ["31", "01", "02", "03", "04", "05", "06"], f, "Mon–Sun day numbers zero-padded")
        try FixtureCheck.expect(RevealSchedule.revealIndexInWeek(reveal: fromCron, now: now) == 4, f, "reveal Friday → index 4")

        // After Friday 17:00 the reveal is next week → no badge in this row (gotcha 2).
        let fridayEvening = try require(cal.date(from: DateComponents(year: 2026, month: 9, day: 4, hour: 18)), f, "Friday 18:00")
        let nextWeek = Formatters.nextFriday17Local(from: fridayEvening)
        try FixtureCheck.expect(RevealSchedule.revealIndexInWeek(reveal: nextWeek, now: fridayEvening) == nil, f, "no badge after Friday 17:00")

        // Countdown digits are two-digit padded, days included.
        let parts = Formatters.countdownParts(ms: 93_784_000)
        try FixtureCheck.expect(parts.d == "01" && parts.h == "02" && parts.m == "03" && parts.s == "04", f, "padded d/h/m/s")
        let zero = Formatters.countdownParts(ms: -5)
        try FixtureCheck.expect(zero.d == "00" && zero.s == "00", f, "elapsed → all zeros")
    }

    // MARK: Summary box values (h5-match §1.3 `fillPlanBox`)

    private static func verifySummaryFormatting() throws {
        let f = "summary-format"
        let row = try FixtureCheck.decode(MatchPreferencesRead.self, fixture: "match-preferences-row")
        let def = try FixtureCheck.decode(MatchPreferencesRead.self, fixture: "match-preferences-default")

        // Nothing cached yet → every grid cell keeps the em-dash placeholder.
        let empty = PreferenceSummaryFormatter(mode: .romantic, prefs: nil, enhanced: .default, searching: false, lastEnhancedRound: false)
        try FixtureCheck.expect(empty.gender == "—" && empty.age == "—" && empty.stage == "—" && empty.school == "—", f, "placeholders before the GET returns")

        let r = PreferenceSummaryFormatter(mode: .romantic, prefs: row, enhanced: .default, searching: false, lastEnhancedRound: false)
        try FixtureCheck.expect(r.gender == L10n.pick("Female", "女生"), f, "gender female")
        try FixtureCheck.expect(r.age == "19 — 25", f, "age range em dash")
        try FixtureCheck.expect(r.stage == L10n.pick("Undergrad", "本科") + " · " + L10n.pick("Master", "硕士"), f, "stages joined")
        try FixtureCheck.expect(r.school == L10n.pick("Same school · city", "仅同校 · 同城"), f, "school filter both")
        try FixtureCheck.expect(!r.extraIsEmpty, f, "extra info present")
        try FixtureCheck.expect(r.enhancedSub == L10n.pick("3 cells · refunded if no match", "3 能量 · 未匹配自动退回"), f, "romantic enhanced sub-line")
        try FixtureCheck.expect(!r.enhancedOn, f, "toggle follows client intent, not the server echo")

        let d = PreferenceSummaryFormatter(mode: .friend, prefs: def, enhanced: .default, searching: false, lastEnhancedRound: false)
        try FixtureCheck.expect(d.gender == L10n.pick("Any", "不限"), f, "null gender → Any")
        try FixtureCheck.expect(d.age == L10n.pick("Any", "不限"), f, "both null → Any")
        try FixtureCheck.expect(d.interests == L10n.pick("Not set", "未设置"), f, "no interests → Not set")
        try FixtureCheck.expect(d.school == L10n.pick("Any", "不限"), f, "no school filter → Any")
        try FixtureCheck.expect(d.extraIsEmpty && d.extraText == L10n.pick("Anything else to help matching…", "告诉算法更多关于你的事"), f, "extra placeholder")
        try FixtureCheck.expect(d.enhancedSub == L10n.pick("1 cell per guaranteed friend", "每保底 1 位朋友 1 能量"), f, "friend off sub-line")

        // Friend interests are capped at 3 and joined with " · ".
        let manyInterests = PreferenceSummaryFormatter(mode: .friend, prefs: row, enhanced: EnhancedPrefs(friendEnabled: true, friendCells: 3),
                                                       searching: false, lastEnhancedRound: false)
        try FixtureCheck.expect(manyInterests.interests == "Photography · Hiking · Coffee", f, "first three interests")
        try FixtureCheck.expect(manyInterests.cells == 3 && manyInterests.enhancedOn, f, "friend cells + toggle on")
        try FixtureCheck.expect(manyInterests.enhancedSub == (L10n.isZh ? "保底 3 位 · 3 能量" : "Guarantee 3 · 3 cells"), f, "friend on sub-line")

        // While searching after a paid join the sub-line switches to "Active this round".
        let active = PreferenceSummaryFormatter(mode: .romantic, prefs: row, enhanced: .default, searching: true, lastEnhancedRound: true)
        try FixtureCheck.expect(active.enhancedOn, f, "searching + lastEnhancedRound → toggle on")
        try FixtureCheck.expect(active.enhancedSub == (L10n.isZh ? "本轮已生效 · 3 能量" : "Active this round · 3 cells"), f, "active-this-round sub-line")

        // Half-open age ranges fall back to 18 / 30.
        var halfOpen = def
        halfOpen.ageMin = nil
        halfOpen.ageMax = 26
        let h = PreferenceSummaryFormatter(mode: .friend, prefs: halfOpen, enhanced: .default, searching: false, lastEnhancedRound: false)
        try FixtureCheck.expect(h.age == "18 — 26", f, "null min → 18")
    }

    // MARK: `PUT /matching/preferences` payloads (api gotcha 1 — whitelist + explicit nulls)

    private static func verifyWritePayloads() throws {
        let f = "prefs-write"
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]

        let romantic = MatchPreferencesWrite.romantic(gender: "all", stages: ["undergraduate", "phd"], ageAny: true,
                                                     ageMin: 20, ageMax: 25, requireSameUniversity: true,
                                                     requireSameCity: false, extraMatchInfo: "")
        let rObj = try jsonObject(try enc.encode(romantic), f)
        try FixtureCheck.expect(Set(rObj.keys) == ["mode", "requireSameCity", "requireSameUniversity", "preferredGender",
                                                   "ageMin", "ageMax", "universityStage", "extraMatchInfo"], f, "romantic key whitelist")
        try FixtureCheck.expect(rObj["preferredGender"] is NSNull, f, "gender 'all' → explicit null")
        try FixtureCheck.expect(rObj["ageMin"] is NSNull && rObj["ageMax"] is NSNull, f, "ageAny → explicit nulls")
        try FixtureCheck.expect(rObj["universityStage"] as? String == "undergraduate", f, "unknown stage dropped")
        try FixtureCheck.expect(rObj["extraMatchInfo"] as? String == "", f, "empty extra info is sent, not omitted")
        try FixtureCheck.expect(rObj["mode"] as? String == "romantic", f, "mode")

        let ordered = MatchPreferencesWrite.romantic(gender: "male", stages: [], ageAny: false, ageMin: 27, ageMax: 21,
                                                    requireSameUniversity: false, requireSameCity: true, extraMatchInfo: nil)
        let oObj = try jsonObject(try enc.encode(ordered), f)
        try FixtureCheck.expect(oObj["ageMin"] as? Int == 21 && oObj["ageMax"] as? Int == 27, f, "ages reordered min/max")
        try FixtureCheck.expect(oObj["universityStage"] is NSNull, f, "no stages → null")
        try FixtureCheck.expect(oObj["preferredGender"] as? String == "male", f, "gender passthrough")
        try FixtureCheck.expect(oObj["extraMatchInfo"] == nil, f, "untouched extra info omitted entirely")

        let friend = MatchPreferencesWrite.friend(gender: "female", interests: ["A", "B", "C", "D"], ageAny: false,
                                                  ageMin: nil, ageMax: nil, requireSameUniversity: false,
                                                  requireSameCity: false, extraMatchInfo: "hi")
        let fObj = try jsonObject(try enc.encode(friend), f)
        try FixtureCheck.expect(Set(fObj.keys) == ["mode", "requireSameCity", "requireSameUniversity", "preferredGender",
                                                   "ageMin", "ageMax", "preferredInterests", "extraMatchInfo"], f, "friend key whitelist (no universityStage)")
        try FixtureCheck.expect((fObj["preferredInterests"] as? [Any])?.count == 3, f, "interests capped at 3")
        try FixtureCheck.expect(fObj["ageMin"] as? Int == 18 && fObj["ageMax"] as? Int == 24, f, "unparsable ages → 18/24 defaults")

        // Cache merge after a successful save (H5 merges its own payload).
        var cached = try FixtureCheck.decode(MatchPreferencesRead.self, fixture: "match-preferences-row")
        cached.merge(ordered)
        try FixtureCheck.expect(cached.ageMin == 21 && cached.ageMax == 27 && cached.universityStage == nil, f, "merge applies ages + stage clear")
        try FixtureCheck.expect(cached.requireSameCity && !cached.requireSameUniversity, f, "merge applies switches")
        try FixtureCheck.expect((cached.extraMatchInfo ?? "").hasPrefix("I row"), f, "omitted extra info left untouched")

        // `POST /matching/start` body: cells only for friend + enhanced (romantic ignores it).
        let romanticStart = try jsonObject(try enc.encode(StartMatchRequest(mode: .romantic, enhanced: true, cells: 4)), f)
        try FixtureCheck.expect(romanticStart["cells"] == nil && romanticStart["enhanced"] as? Bool == true, f, "romantic start omits cells")
        let friendStart = try jsonObject(try enc.encode(StartMatchRequest(mode: .friend, enhanced: true, cells: 9)), f)
        try FixtureCheck.expect(friendStart["cells"] as? Int == 5, f, "friend cells clamped to 5")
        let plainStart = try jsonObject(try enc.encode(StartMatchRequest(mode: .friend, enhanced: false, cells: 3)), f)
        try FixtureCheck.expect(plainStart["cells"] == nil, f, "plain join omits cells")

        // Dissolve body: `{}` from the match screen, `{reason}` from chat.
        let bare = try jsonObject(try enc.encode(DissolveRequest()), f)
        try FixtureCheck.expect(bare.isEmpty, f, "dissolve without reason → {}")
        let reasoned = try jsonObject(try enc.encode(DissolveRequest(reason: "user_dissolved")), f)
        try FixtureCheck.expect(reasoned["reason"] as? String == "user_dissolved", f, "dissolve with reason")

        // Feedback events: session key + ≤50 cap.
        let ev = FeedbackEvent(matchId: "m1", type: .openedProfile)
        try FixtureCheck.expect(ev.key == "m1:openedProfile", f, "dedupe key")
        let capped = FeedbackEventsRequest(events: (0..<60).map { FeedbackEvent(matchId: "m\($0)", type: .viewed) })
        try FixtureCheck.expect(capped.events.count == 50, f, "events capped at 50")
    }

    // MARK: helpers

    private static func require<T>(_ value: T?, _ fixture: String, _ what: String) throws -> T {
        guard let v = value else { throw FixtureCheck.Failure(fixture: fixture, reason: "missing \(what)") }
        return v
    }

    private static func jsonObject(_ data: Data, _ fixture: String) throws -> [String: Any] {
        guard let o = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw FixtureCheck.Failure(fixture: fixture, reason: "encoded body is not a JSON object")
        }
        return o
    }
}
#endif
