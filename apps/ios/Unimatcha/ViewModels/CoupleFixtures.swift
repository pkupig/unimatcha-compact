#if DEBUG
import Foundation

/// Decode + display-rule checks for the Couple Space domain (PLAN §H.4; run by WP-16's
/// `-unimatcha-decode-check`). Pure — never touches the main-actor view model.
enum CoupleFixtures {
    static func verify() throws {
        try verifySpace()
        try verifyDisplayRules()
        try verifyRequestBodies()
    }

    // MARK: GET /couple/:matchId (and every mutation response)

    private static func verifySpace() throws {
        let f = "couple-space"
        let s = try FixtureCheck.decode(CoupleSpace.self, fixture: f)

        try FixtureCheck.expect(s.matchId == "clxmch00000000000000000007", f, "matchId")
        try FixtureCheck.expect(s.daysTogether == 43, f, "daysTogether")
        try FixtureCheck.expect(ISODate.parse(s.since ?? "") != nil, f, "since parses")
        try FixtureCheck.expect(s.me.userId == "clxusr00000000000000000001", f, "me.userId")

        try FixtureCheck.expect(s.partner.userId == "clxusr00000000000000000002", f, "partner.userId")
        try FixtureCheck.expect(s.partner.nickname == "沐晨", f, "partner.nickname")
        try FixtureCheck.expect(s.partner.bio.hasPrefix("Third-year CS."), f, "partner.bio")
        try FixtureCheck.expect(SafeURL.isSafe(s.partner.avatarUrl), f, "partner.avatarUrl loadable")
        try FixtureCheck.expect(SafeURL.isSafe(s.cover), f, "cover loadable")

        try FixtureCheck.expect(s.loveYou.me.count == 41 && !s.loveYou.me.sentToday, f, "loveYou.me")
        try FixtureCheck.expect(s.loveYou.partner.count == 38, f, "loveYou.partner")

        try FixtureCheck.expect(s.status.me == "Happy", f, "status.me")
        try FixtureCheck.expect(s.status.partner == "flat white and a nap", f, "status.partner")

        try FixtureCheck.expect(s.craving.me.current == "Ramen", f, "craving.me.current")
        try FixtureCheck.expect(s.craving.me.history.count == 6, f, "craving history")
        try FixtureCheck.expect(s.craving.partner.current.isEmpty, f, "craving.partner empty")

        try FixtureCheck.expect(s.schedule.me.count == 2 && s.schedule.partner.count == 1, f, "schedule sides")
        try FixtureCheck.expect(s.schedule.me[0].expired == false && s.schedule.me[1].expired, f, "schedule expired flags")
        try FixtureCheck.expect(s.schedule.me[0].startDate != nil && s.schedule.me[0].endDate != nil, f, "schedule dates parse")

        try FixtureCheck.expect(s.gifts.partner.count == 3, f, "gifts.partner")
        try FixtureCheck.expect(s.gifts.me.count == 1, f, "gifts.me decoded (never rendered)")

        try FixtureCheck.expect(s.anniversaries.count == 4, f, "anniversaries")
        try FixtureCheck.expect(s.bucket.count == 3, f, "bucket")
    }

    // MARK: Hub rules (h5-couple §1.1 State C)

    private static func verifyDisplayRules() throws {
        let f = "couple-space"
        let s = try FixtureCheck.decode(CoupleSpace.self, fixture: f)

        // ≤3 anniversary tiles: the 2 nearest upcoming (ascending) + the most recent past.
        let hub = s.anniversariesForHub
        try FixtureCheck.expect(hub.count == 3, f, "hub anniversaries got \(hub.count)")
        try FixtureCheck.expect(hub.map(\.title) == ["Her birthday", "Freshers week", "First date"], f,
                                "hub order got \(hub.map(\.title))")
        try FixtureCheck.expect(hub[0].isFuture && hub[1].isFuture && !hub[2].isFuture, f, "hub future flags")

        // "All anniversaries" is sorted by date ascending.
        try FixtureCheck.expect(s.anniversariesSortedByDate.map(\.title)
                                == ["First date", "Her birthday", "Freshers week", "100 days"], f, "all-anniversaries order")

        // Tear-off tile parses `date.slice(0,10)` as LOCAL midnight.
        guard let tileDate = s.anniversary(id: "clxann00000000000000000001")?.tileDate else {
            throw FixtureCheck.Failure(fixture: f, reason: "tileDate nil")
        }
        let parts = Formatters.anniversaryTile(tileDate)
        try FixtureCheck.expect(parts == ("JUL", "22", "2026"), f, "tile got \(parts)")
        try FixtureCheck.expect(s.anniversary(id: "clxann00000000000000000001")?.dayString == "2026-07-22", f, "dayString")

        // Craving quick picks: history minus current, capped at 5.
        let picks = s.cravingQuickPicks
        try FixtureCheck.expect(picks.count == 5, f, "quick picks got \(picks.count)")
        try FixtureCheck.expect(!picks.contains("Ramen"), f, "quick picks exclude current")
        try FixtureCheck.expect(picks.first == "Katsu curry", f, "quick picks order")

        // Schedule column scrolls only above 4 entries.
        try FixtureCheck.expect(s.schedule.me.count <= CoupleLayout.scheduleScrollThreshold, f, "schedule under scroll cap")

        // Bucket: the `photo` hint only for done items carrying a note or images.
        try FixtureCheck.expect(s.bucketItem(id: "clxbkt00000000000000000001")?.hasRecord == true, f, "[0] hasRecord")
        try FixtureCheck.expect(s.bucketItem(id: "clxbkt00000000000000000002")?.hasRecord == false, f, "[1] hasRecord")
        try FixtureCheck.expect(s.bucketItem(id: "clxbkt00000000000000000003")?.hasRecord == false, f, "[2] done without record")
        try FixtureCheck.expect(s.bucketItem(id: "clxbkt00000000000000000002")?.doneBy == nil, f, "[1] doneBy null")

        // Status presets: icon by case-insensitive label; custom text has none.
        try FixtureCheck.expect(CoupleStatus.icon(for: s.status.me) == "sentiment_very_satisfied", f, "preset icon")
        try FixtureCheck.expect(CoupleStatus.icon(for: "  happy ") == "sentiment_very_satisfied", f, "preset icon trims/lowercases")
        try FixtureCheck.expect(CoupleStatus.icon(for: s.status.partner) == nil, f, "custom status has no icon")
        try FixtureCheck.expect(CoupleStatus.presets.count == 8, f, "8 presets")
        for preset in CoupleStatus.presets {
            try FixtureCheck.expect(Theme.Icon.sf(preset.icon) != Theme.Icon.fallback, f, "icon \(preset.icon) mapped")
        }
        for material in ["edit", "person", "list", "add", "chevron_right", "close", "check", "photo",
                         "redeem", "add_a_photo", "calendar_month", "expand_less"] {
            try FixtureCheck.expect(!Theme.Icon.sf(material).isEmpty, f, "icon \(material) resolves")
        }

        // Countdown labels (language-independent structure).
        try FixtureCheck.expect(CoupleCopy.countdownLabel(daysUntil: 8).contains("8"), f, "countdown 8")
        try FixtureCheck.expect(!CoupleCopy.countdownLabel(daysUntil: 0).isEmpty, f, "countdown today")
        try FixtureCheck.expect(CoupleCopy.countdownLabel(daysUntil: -43).contains("43"), f, "countdown past")
        try FixtureCheck.expect(CoupleCopy.shortCountdownLabel(daysUntil: 8).contains("8"), f, "short countdown")
        try FixtureCheck.expect(CoupleCopy.shortCountdownLabel(daysUntil: -1).contains("1"), f, "short countdown past")
    }

    // MARK: Request bodies (`forbidNonWhitelisted` — an extra key is a 400)

    private static func verifyRequestBodies() throws {
        let f = "couple-space"
        func json<T: Encodable>(_ value: T) throws -> String {
            String(decoding: try Endpoint.encoder.encode(value), as: UTF8.self)
        }

        // Cover: explicit null clears (NullableField), a string sets.
        let coverClear = try json(CoupleCoverRequest(url: nil))
        try FixtureCheck.expect(coverClear == "{\"imageUrl\":null}", f, "cover clear got \(coverClear)")
        let coverSet = try json(CoupleCoverRequest(url: "https://x/y.jpg"))
        try FixtureCheck.expect(coverSet.contains("\"imageUrl\":\"https:"), f, "cover set got \(coverSet)")

        // Love-you posts the H5 `{}`.
        let loveBody = try json(EmptyBody())
        try FixtureCheck.expect(loveBody == "{}", f, "love-you body got \(loveBody)")

        // Status: empty string is a legitimate clear.
        let statusClear = try json(CoupleStatusRequest(status: ""))
        try FixtureCheck.expect(statusClear == "{\"status\":\"\"}", f, "status clear got \(statusClear)")

        // Bucket toggle: done:false must NOT carry note/images (the server wipes them anyway).
        let uncomplete = try json(CoupleBucketToggleRequest.uncomplete)
        try FixtureCheck.expect(uncomplete == "{\"done\":false}", f, "uncomplete got \(uncomplete)")
        let complete = try json(CoupleBucketToggleRequest.complete(note: "n", images: ["u"]))
        try FixtureCheck.expect(complete == "{\"done\":true,\"images\":[\"u\"],\"note\":\"n\"}", f,
                                "complete got \(complete)")

        // Anniversary update sends all four fields (image removals persist only here).
        let update = try json(CoupleAnniversaryUpdateRequest(title: "t", date: "2026-09-03", note: "", images: []))
        try FixtureCheck.expect(update == "{\"date\":\"2026-09-03\",\"images\":[],\"note\":\"\",\"title\":\"t\"}", f,
                                "anniversary update got \(update)")

        // Schedule: full ISO-8601 with offset (PLAN D4), not H5's zone-less string.
        let stamp = ISODate.isoWithOffset(Date(timeIntervalSince1970: 1_780_000_000))
        try FixtureCheck.expect(stamp.count >= 20 && stamp.contains("T"), f, "schedule stamp got \(stamp)")
        let hasZone = stamp.hasSuffix("Z") || stamp.dropFirst(19).contains(":")
        try FixtureCheck.expect(hasZone, f, "schedule stamp carries an offset: \(stamp)")

        // Anniversary create date is `YYYY-MM-DD`.
        let day = ISODate.day(Date(timeIntervalSince1970: 1_780_000_000))
        try FixtureCheck.expect(day.count == 10 && day.filter { $0 == "-" }.count == 2, f, "day got \(day)")
    }
}
#endif
