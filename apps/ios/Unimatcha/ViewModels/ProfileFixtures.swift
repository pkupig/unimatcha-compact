#if DEBUG
import Foundation

/// Decode + display-rule checks for the profile domain (PLAN §H.4; run by WP-16's
/// `-unimatcha-decode-check`). Pure — never touches the main-actor view models.
enum ProfileFixtures {
    static func verify() throws {
        try verifyVerificationSend()
        try verifyVerificationSubmit()
        try verifyRealPhoto()
        try verifyEnergyCells()
        try verifyFacts()
        try verifyBadge()
        try verifyEditPayload()
        try verifyVerifyRules()
    }

    // MARK: POST /users/me/verification/send-code

    private static func verifyVerificationSend() throws {
        let f = "profile-verification-send"
        let r = try FixtureCheck.decode(VerificationSendResult.self, fixture: f)
        try FixtureCheck.expect(r.devCode == "123456", f, "devCode")
        try FixtureCheck.expect(r.expiresInSec == 600, f, "expiresInSec")
        try FixtureCheck.expect(r.message?.hasPrefix("Verification code sent") == true, f, "message")

        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }
        LangRegistry.current = .en
        try FixtureCheck.expect(VerifyRules.hint(for: r) == "Dev mode (no email service yet): your code is 123456", f, "dev hint en")
        let prod = VerificationSendResult(message: "Verification code sent to your school email", devCode: nil, expiresInSec: 600)
        try FixtureCheck.expect(VerifyRules.hint(for: prod) == "Verification code sent to your school email", f, "prod hint = message")
        try FixtureCheck.expect(VerifyRules.hint(for: VerificationSendResult()) == "Code sent", f, "empty → Code sent")
        LangRegistry.current = .zh
        try FixtureCheck.expect(VerifyRules.hint(for: r) == "开发模式（暂无邮件服务）：你的验证码是 123456", f, "dev hint zh")

        let body = String(decoding: try Endpoint.encoder.encode(VerificationSendRequest(schoolEmail: "a@b.ac.uk")), as: UTF8.self)
        try FixtureCheck.expect(body == #"{"schoolEmail":"a@b.ac.uk"}"#, f, "send body got \(body)")
    }

    // MARK: POST /users/me/verification/submit

    private static func verifyVerificationSubmit() throws {
        let f = "profile-verification-submit"
        let r = try FixtureCheck.decode(VerificationSubmitResult.self, fixture: f)
        try FixtureCheck.expect(r.verificationStatus == "pending", f, "verificationStatus")
        try FixtureCheck.expect(r.id == "clxver00000000000000000001", f, "id")
        try FixtureCheck.expect(r.message == "Verification materials submitted, awaiting admin review", f, "message")
        try FixtureCheck.expect(VerifyBadgeState.from(status: r.verificationStatus) == .pending, f, "→ pending badge")

        let req = VerificationSubmitRequest(studentCardUrl: "https://api.unimatcha.ai/uploads/c.jpg", schoolEmail: "a@b.ac.uk", code: "123456")
        let data = try Endpoint.encoder.encode(req)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        try FixtureCheck.expect(Set(obj.keys) == ["studentCardUrl", "schoolEmail", "code"], f, "submit body keys \(obj.keys.sorted())")
    }

    // MARK: POST /uploads/real-photo

    private static func verifyRealPhoto() throws {
        let f = "profile-real-photo"
        let r = try FixtureCheck.decode(RealPhotoResult.self, fixture: f)
        try FixtureCheck.expect(r.message == "Real photo added", f, "message")
        try FixtureCheck.expect(r.realPhotos.count == 2, f, "realPhotos count")
        try FixtureCheck.expect(r.realPhotos.last == "https://api.unimatcha.ai/uploads/p2.jpg", f, "appended last")

        // 201 at the cap: unchanged list + explanatory message (S8) — count comparison is the client's signal.
        let capped = try JSONDecoder().decode(RealPhotoResult.self, from: Data(
            #"{"message":"You can upload at most 6 real photos","realPhotos":["1","2","3","4","5","6"]}"#.utf8))
        try FixtureCheck.expect(capped.realPhotos.count == 6 && capped.message?.hasPrefix("You can upload") == true, f, "cap response")

        let body = String(decoding: try Endpoint.encoder.encode(RealPhotoRequest(url: "https://x/y.jpg")), as: UTF8.self)
        try FixtureCheck.expect(body == #"{"url":"https:\/\/x\/y.jpg"}"# || body == #"{"url":"https://x/y.jpg"}"#, f, "real-photo body got \(body)")
    }

    // MARK: Energy cells (h5-profile §1.2)

    private static func verifyEnergyCells() throws {
        let f = "inline-energy"
        let a = EnergyBalance(totalEnergy: 3, usedEnergy: 1, availableEnergy: 2).cells
        try FixtureCheck.expect(a.filled == 2 && a.empty == 1 && a.extra == 0 && !a.isZero, f, "3/1/2 → 2 filled 1 empty")
        let b = EnergyBalance(totalEnergy: 7, usedEnergy: 2, availableEnergy: 5).cells
        try FixtureCheck.expect(b.filled == 5 && b.empty == 0 && b.extra == 2, f, "7/2/5 → 5 filled +2")
        let c = EnergyBalance(totalEnergy: 12, usedEnergy: 9, availableEnergy: nil).cells
        try FixtureCheck.expect(c.filled == 3 && c.empty == 2 && c.extra == 7, f, "12/9/nil → avail 3, 2 empty, +7")
        let z = EnergyBalance.zero.cells
        try FixtureCheck.expect(z.isZero, f, "zero → muted 0")
        try FixtureCheck.expect(EnergyCells.maxCells == 5, f, "max 5 cells")
    }

    // MARK: Facts rows / day counter

    private static func verifyFacts() throws {
        let f = "inline-facts"
        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }

        var p = UserProfile()
        p.nickname = "晓月"
        p.realName = "Xiaoyue Zhang"
        p.age = 21
        p.grade = "Year 2"
        p.studentId = "u2312345"
        p.signature = "  One thoughtful match, every week.  "
        let now = ISODate.parse("2026-09-03T10:00:00.000Z")!
        let user = User(id: "u", email: "a@b.ac.uk", createdAt: "2026-08-31T09:30:00.000Z", profile: p)

        LangRegistry.current = .en
        let en = ProfileFactsBuilder.facts(user: user, now: now)
        try FixtureCheck.expect(en.primary == ["Xiaoyue Zhang", "21", "Year 2"], f, "primary en got \(en.primary)")
        try FixtureCheck.expect(en.secondary == ["ID u2312345", "Day 4"], f, "secondary en got \(en.secondary)")
        try FixtureCheck.expect(en.signature == "One thoughtful match, every week.", f, "signature trimmed")

        LangRegistry.current = .zh
        let zh = ProfileFactsBuilder.facts(user: user, now: now)
        try FixtureCheck.expect(zh.primary == ["Xiaoyue Zhang", "21 岁", "大二"], f, "primary zh got \(zh.primary)")
        try FixtureCheck.expect(zh.secondary == ["学号 u2312345", "已加入 4 天"], f, "secondary zh got \(zh.secondary)")

        // joinedAt source order: profile.joinedAt → createdAt → profile.createdAt; same instant → Day 1.
        try FixtureCheck.expect(ProfileFactsBuilder.dayNumber(joinedAt: "2026-09-03T10:00:00.000Z", now: now) == 1, f, "same instant → Day 1")
        try FixtureCheck.expect(ProfileFactsBuilder.dayNumber(joinedAt: "2026-09-02T10:00:01.000Z", now: now) == 1, f, "23h59m → Day 1")
        try FixtureCheck.expect(ProfileFactsBuilder.dayNumber(joinedAt: "2026-09-02T09:59:59.000Z", now: now) == 2, f, "24h+ → Day 2")
        try FixtureCheck.expect(ProfileFactsBuilder.dayNumber(joinedAt: nil, now: now) == nil, f, "missing joinedAt → no day")
        try FixtureCheck.expect(ProfileFactsBuilder.dayNumber(joinedAt: "2026-09-04T10:00:00.000Z", now: now) == 1, f, "future clock → Day 1")

        // Empty profile → no rows; composed real name from given + family.
        var q = UserProfile()
        q.givenName = "Xiaoyue"
        q.familyName = "Zhang"
        let u2 = User(id: "u", email: "a@b.ac.uk", profile: q)
        let f2 = ProfileFactsBuilder.facts(user: u2, now: now)
        try FixtureCheck.expect(f2.primary == ["Xiaoyue Zhang"] && f2.secondary.isEmpty && f2.signature == nil, f, "composed name only")
        try FixtureCheck.expect(ProfileFactsBuilder.facts(user: nil).isEmpty, f, "nil user → empty")

        // Version footer never blank.
        try FixtureCheck.expect(ProfileTabCopy.versionLine.hasPrefix("Unimatcha v"), f, "version line")
    }

    // MARK: Verify badge (4 states → 3 visuals)

    private static func verifyBadge() throws {
        let f = "inline-badge"
        try FixtureCheck.expect(VerifyBadgeState.from(status: "verified") == .verified, f, "verified")
        try FixtureCheck.expect(VerifyBadgeState.from(status: "pending") == .pending, f, "pending")
        try FixtureCheck.expect(VerifyBadgeState.from(status: "unverified") == .verify, f, "unverified → verify")
        try FixtureCheck.expect(VerifyBadgeState.from(status: "rejected") == .verify, f, "rejected → verify")
        try FixtureCheck.expect(VerifyBadgeState.from(status: nil) == .verify, f, "missing → verify")
        try FixtureCheck.expect(VerifyBadgeState.verify.isTappable && !VerifyBadgeState.pending.isTappable && !VerifyBadgeState.verified.isTappable, f, "tappable only for verify")
    }

    // MARK: Edit payload (A18 rules)

    private static func verifyEditPayload() throws {
        let f = "inline-edit-payload"
        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }
        LangRegistry.current = .en
        let now = ISODate.parse("2026-09-03T10:00:00.000Z")!
        let cal = Calendar.current
        let birthday = cal.date(byAdding: .year, value: -21, to: cal.startOfDay(for: now))!

        // Full form: every key family present.
        var i = EditProfilePayload.Input()
        i.nickname = " 晓月 "
        i.givenName = "Xiaoyue"
        i.familyName = "Zhang"
        i.bio = "Hello"
        i.signature = "Sig"
        i.gender = "female"
        i.birthday = birthday
        i.school = "University of Warwick"
        i.grade = "year 2"
        i.city = "Coventry"
        i.major = "Computer Science"
        i.mbti = "INFP"
        i.nationality = "Chinese"
        i.studentId = "u2312345"
        i.interests = ["Music", "Philosophy"]
        i.gifts = ["Matcha latte", "", "  ", "Book", ""]
        guard let full = EditProfilePayload.build(i, now: now).payload else {
            throw FixtureCheck.Failure(fixture: f, reason: "full form rejected")
        }
        try FixtureCheck.expect(full.presentKeys == ["age", "bio", "birthday", "city", "familyName", "gender", "givenName", "grade",
                                                     "interests", "major", "mbti", "nationality", "nickname", "realName", "school",
                                                     "signature", "studentId", "wishGifts"], f, "full keys got \(full.presentKeys)")
        try FixtureCheck.expect(full.nickname == "晓月", f, "nickname trimmed")
        try FixtureCheck.expect(full.realName == "Xiaoyue Zhang", f, "realName composed")
        try FixtureCheck.expect(full.grade == "Year 2", f, "grade normalised")
        try FixtureCheck.expect(full.age == 21 && full.birthday == ISODate.day(birthday), f, "age + birthday")
        try FixtureCheck.expect(full.wishGifts == ["Matcha latte", "Book"], f, "gifts filtered")
        try FixtureCheck.expect(full.coverUrl == nil && full.realPhotos == nil && full.avatarUrl == nil, f, "never cover/photos/avatar")

        // Minimal form: names blank → no name keys; gender nil → omitted; birthday nil → no age/birthday;
        // selects empty → "" clears; wishGifts always present ([]).
        var m = EditProfilePayload.Input()
        m.nickname = "N"
        guard let minimal = EditProfilePayload.build(m, now: now).payload else {
            throw FixtureCheck.Failure(fixture: f, reason: "minimal form rejected")
        }
        try FixtureCheck.expect(minimal.presentKeys == ["bio", "city", "grade", "interests", "major", "mbti", "nationality", "nickname",
                                                        "school", "signature", "studentId", "wishGifts"], f, "minimal keys got \(minimal.presentKeys)")
        try FixtureCheck.expect(minimal.school == "" && minimal.grade == "" && minimal.studentId == "", f, "empty selects clear with \"\"")
        try FixtureCheck.expect(minimal.wishGifts == [] && minimal.interests == [], f, "empty arrays sent")
        let json = String(decoding: try Endpoint.encoder.encode(minimal), as: UTF8.self)
        try FixtureCheck.expect(!json.contains("\"gender\"") && !json.contains("\"age\"") && !json.contains("\"realName\""), f, "omitted keys absent from JSON")

        // One name only → all three name keys, realName = that name.
        var g = m
        g.givenName = "Xiaoyue"
        let given = EditProfilePayload.build(g, now: now).payload!
        try FixtureCheck.expect(given.givenName == "Xiaoyue" && given.familyName == "" && given.realName == "Xiaoyue", f, "given only")

        // Failed / unloaded list → its key omitted, the others still sent.
        var l = m
        l.readyLists = [.cities, .majors]
        l.school = "University of Warwick"
        let guarded = EditProfilePayload.build(l, now: now).payload!
        try FixtureCheck.expect(guarded.school == nil && guarded.mbti == nil && guarded.nationality == nil, f, "failed lists omitted")
        try FixtureCheck.expect(guarded.city == "" && guarded.major == "" && guarded.grade == "" && guarded.studentId == "", f, "ready lists + static keys sent")

        // Validation order: nickname first, then age range.
        var bad = EditProfilePayload.Input()
        bad.birthday = cal.date(byAdding: .year, value: -10, to: now)
        try FixtureCheck.expect(EditProfilePayload.build(bad, now: now).errorMessage == "Nickname required", f, "nickname required first")
        bad.nickname = "N"
        try FixtureCheck.expect(EditProfilePayload.build(bad, now: now).errorMessage == "Unimatcha is for students aged 16–40", f, "age range")
        bad.birthday = cal.date(byAdding: .year, value: -41, to: now)
        try FixtureCheck.expect(EditProfilePayload.build(bad, now: now).errorMessage == "Unimatcha is for students aged 16–40", f, "age > 40")

        // Length caps.
        var long = m
        long.bio = String(repeating: "a", count: 300)
        long.signature = String(repeating: "b", count: 120)
        long.studentId = String(repeating: "c", count: 40)
        let capped = EditProfilePayload.build(long, now: now).payload!
        try FixtureCheck.expect(capped.bio?.count == 250 && capped.signature?.count == 100 && capped.studentId?.count == 32, f, "caps 250/100/32")

        try FixtureCheck.expect(ProfileRules.interestCap == 8 && ProfileRules.realPhotosMax == 6 && ProfileRules.wishGiftsMax == 5, f, "rule constants")
        try FixtureCheck.expect(ProfileGenderOptions.values == ["male", "female", "non_binary", "other"], f, "gender values")
        // Dictionary key parity: `Non-binary` (not the H5 button's `Non-Binary`) — PLAN §B.3.
        try FixtureCheck.expect(ProfileGenderOptions.all.map { $0.key } == ["Male", "Female", "Non-binary", "Other"], f, "gender keys")
        try FixtureCheck.expect(ProfileGenderOptions.label("non_binary") == "Non-binary", f, "en gender label")
        try FixtureCheck.expect(ProfileGenderOptions.label("unknown") == "unknown", f, "unknown gender passthrough")
        LangRegistry.current = .zh
        try FixtureCheck.expect(ProfileGenderOptions.label("non_binary") == "非二元", f, "zh gender label")
        try FixtureCheck.expect(ProfileGenderOptions.label("male") == "男", f, "zh male label")
        LangRegistry.current = .en
    }

    // MARK: Verify rules

    private static func verifyVerifyRules() throws {
        let f = "inline-verify-rules"
        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }
        LangRegistry.current = .en
        try FixtureCheck.expect(VerifyRules.emailPrecheckError("") == "Enter your school email", f, "empty email")
        try FixtureCheck.expect(VerifyRules.emailPrecheckError("   ") == "Enter your school email", f, "blank email")
        try FixtureCheck.expect(VerifyRules.emailPrecheckError("nope") == "Invalid email format", f, "format")
        try FixtureCheck.expect(VerifyRules.emailPrecheckError("a@b") == "Invalid email format", f, "format no tld")
        try FixtureCheck.expect(VerifyRules.emailPrecheckError("a@gmail.com") == "Please use a school email (must contain .edu or .ac.)", f, "non-school")
        try FixtureCheck.expect(VerifyRules.emailPrecheckError(" A@Warwick.AC.UK ") == nil, f, ".ac. ok (normalised)")
        try FixtureCheck.expect(VerifyRules.emailPrecheckError("a@mit.edu") == nil, f, ".edu ok")
        try FixtureCheck.expect(VerifyRules.sanitizeCode("12a3-45 6789") == "123456", f, "code digits ≤ 6")
        try FixtureCheck.expect(VerifyRules.sendLabel(sending: false, cooldown: 0) == "Send code", f, "label idle")
        try FixtureCheck.expect(VerifyRules.sendLabel(sending: true, cooldown: 0) == "Sending…", f, "label sending")
        try FixtureCheck.expect(VerifyRules.sendLabel(sending: false, cooldown: 59) == "59s", f, "label countdown")
        try FixtureCheck.expect(VerifyRules.sendLabel(sending: true, cooldown: 1) == "1s", f, "countdown wins")
        try FixtureCheck.expect(VerifyRules.cooldownSeconds == 60, f, "60 s cooldown")
        LangRegistry.current = .zh
        try FixtureCheck.expect(VerifyRules.sendLabel(sending: false, cooldown: 0) == "发验证码", f, "label zh")
        try FixtureCheck.expect(VerifyRules.sendLabel(sending: false, cooldown: 30) == "30s", f, "countdown language-neutral")
    }
}
#endif
