import Foundation

// MARK: - ProfileUpdate — WRITE side of `PUT /profiles/me` (api-auth §4.2, S9)
//
// Upsert semantics: only the keys present in the body are touched. `nil` = key OMITTED (the
// server keeps the stored value); a non-nil value is sent verbatim — `""` clears a string,
// `[]` clears an array. `gender` / `genderPref` are enums: never send `""` (400), omit instead.
// Unknown keys are 400 (`forbidNonWhitelisted`), so this struct lists exactly the DTO keys.

struct ProfileUpdate: Encodable, Equatable {
    var nickname: String?
    var givenName: String?
    var familyName: String?
    var realName: String?
    var school: String?
    var grade: String?
    var gender: String?
    var genderPref: String?
    var age: Int?
    var birthday: String?              // YYYY-MM-DD
    var bio: String?
    var interests: [String]?
    var city: String?
    var major: String?
    var mbti: String?
    var nationality: String?
    var signature: String?
    var studentId: String?
    var tags: [String]?
    var wishGifts: [String]?
    var zodiac: String?
    var coverUrl: String?
    var realPhotos: [String]?
    var avatarUrl: String?
    var socialLinks: [String: String]?

    init() {}

    enum CodingKeys: String, CodingKey, CaseIterable {
        case nickname, givenName, familyName, realName, school, grade, gender, genderPref, age, birthday, bio,
             interests, city, major, mbti, nationality, signature, studentId, tags, wishGifts, zodiac, coverUrl,
             realPhotos, avatarUrl, socialLinks
    }

    /// Explicit encode-if-present: a `nil` property never produces a key.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(nickname, forKey: .nickname)
        try c.encodeIfPresent(givenName, forKey: .givenName)
        try c.encodeIfPresent(familyName, forKey: .familyName)
        try c.encodeIfPresent(realName, forKey: .realName)
        try c.encodeIfPresent(school, forKey: .school)
        try c.encodeIfPresent(grade, forKey: .grade)
        try c.encodeIfPresent(gender, forKey: .gender)
        try c.encodeIfPresent(genderPref, forKey: .genderPref)
        try c.encodeIfPresent(age, forKey: .age)
        try c.encodeIfPresent(birthday, forKey: .birthday)
        try c.encodeIfPresent(bio, forKey: .bio)
        try c.encodeIfPresent(interests, forKey: .interests)
        try c.encodeIfPresent(city, forKey: .city)
        try c.encodeIfPresent(major, forKey: .major)
        try c.encodeIfPresent(mbti, forKey: .mbti)
        try c.encodeIfPresent(nationality, forKey: .nationality)
        try c.encodeIfPresent(signature, forKey: .signature)
        try c.encodeIfPresent(studentId, forKey: .studentId)
        try c.encodeIfPresent(tags, forKey: .tags)
        try c.encodeIfPresent(wishGifts, forKey: .wishGifts)
        try c.encodeIfPresent(zodiac, forKey: .zodiac)
        try c.encodeIfPresent(coverUrl, forKey: .coverUrl)
        try c.encodeIfPresent(realPhotos, forKey: .realPhotos)
        try c.encodeIfPresent(avatarUrl, forKey: .avatarUrl)
        try c.encodeIfPresent(socialLinks, forKey: .socialLinks)
    }

    /// The payload as a JSON-shaped patch for `UserProfile.merge(_:)` — H5 merges the *sent*
    /// payload into `S.currentUser.profile` after a successful PUT.
    var patch: [String: AnyCodable] {
        var p: [String: AnyCodable] = [:]
        if let v = nickname { p["nickname"] = AnyCodable(v) }
        if let v = givenName { p["givenName"] = AnyCodable(v) }
        if let v = familyName { p["familyName"] = AnyCodable(v) }
        if let v = realName { p["realName"] = AnyCodable(v) }
        if let v = school { p["school"] = AnyCodable(v) }
        if let v = grade { p["grade"] = AnyCodable(v) }
        if let v = gender { p["gender"] = AnyCodable(v) }
        if let v = genderPref { p["genderPref"] = AnyCodable(v) }
        if let v = age { p["age"] = AnyCodable(v) }
        if let v = birthday { p["birthday"] = AnyCodable(v) }
        if let v = bio { p["bio"] = AnyCodable(v) }
        if let v = interests { p["interests"] = AnyCodable(v) }
        if let v = city { p["city"] = AnyCodable(v) }
        if let v = major { p["major"] = AnyCodable(v) }
        if let v = mbti { p["mbti"] = AnyCodable(v) }
        if let v = nationality { p["nationality"] = AnyCodable(v) }
        if let v = signature { p["signature"] = AnyCodable(v) }
        if let v = studentId { p["studentId"] = AnyCodable(v) }
        if let v = tags { p["tags"] = AnyCodable(v) }
        if let v = wishGifts { p["wishGifts"] = AnyCodable(v) }
        if let v = zodiac { p["zodiac"] = AnyCodable(v) }
        if let v = coverUrl { p["coverUrl"] = AnyCodable(v) }
        if let v = realPhotos { p["realPhotos"] = AnyCodable(v) }
        if let v = avatarUrl { p["avatarUrl"] = AnyCodable(v) }
        if let v = socialLinks { p["socialLinks"] = AnyCodable(v) }
        return p
    }

    /// Sorted names of the keys this payload will send (fixture checks / debugging).
    var presentKeys: [String] { patch.keys.sorted() }

    var isEmpty: Bool { patch.isEmpty }

    // MARK: Setup variant (api-auth §4.2 "Profile Setup", h5-auth §3.6)

    /// `saveProfile()` payload: nickname / givenName / familyName / realName ("given family") /
    /// school / grade / gender / genderPref / age / birthday / bio / interests are ALWAYS sent
    /// (school, grade, bio may be `""`); city / major / mbti / nationality only when non-empty.
    static func setup(nickname: String,
                      givenName: String,
                      familyName: String,
                      school: String?,
                      grade: String?,
                      gender: String,
                      genderPref: String?,
                      age: Int,
                      birthday: String,
                      bio: String,
                      interests: [String],
                      city: String?,
                      major: String?,
                      mbti: String?,
                      nationality: String?) -> ProfileUpdate {
        var u = ProfileUpdate()
        let given = givenName.trimmingCharacters(in: .whitespacesAndNewlines)
        let family = familyName.trimmingCharacters(in: .whitespacesAndNewlines)
        u.nickname = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        u.givenName = given
        u.familyName = family
        u.realName = "\(given) \(family)"
        u.school = (school ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        u.grade = GradeOptions.normalize(grade) ?? ""
        u.gender = gender
        let pref = (genderPref ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        u.genderPref = pref.isEmpty ? "any" : pref
        u.age = age
        u.birthday = birthday
        u.bio = String(bio.prefix(ProfileRules.bioMax))
        u.interests = interests
        func nonEmpty(_ s: String?) -> String? {
            let t = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        u.city = nonEmpty(city)
        u.major = nonEmpty(major)
        u.mbti = nonEmpty(mbti)
        u.nationality = nonEmpty(nationality)
        return u
    }
}

// MARK: - ProfileRules (shared numeric rules of the profile DTO)

enum ProfileRules {
    static let minAge = 16
    static let maxAge = 40
    static let bioMax = 250
    static let signatureMax = 100
    static let studentIdMax = 32
    static let interestCap = 8          // H5 setup / edit cap (silently ignored beyond)
    static let realPhotosMax = 6
    static let wishGiftsMax = 5
    static let tagsMax = 10

    static func isValidAge(_ age: Int?) -> Bool {
        guard let a = age else { return false }
        return a >= minAge && a <= maxAge
    }

    /// Birthday picker bounds `[today − 40 y, today − 16 y]` (local calendar, start of day).
    static func birthdayRange(now: Date = Date()) -> ClosedRange<Date> {
        let cal = Calendar.current
        let today = cal.startOfDay(for: now)
        let lower = cal.date(byAdding: .year, value: -maxAge, to: today) ?? today
        let upper = cal.date(byAdding: .year, value: -minAge, to: today) ?? today
        return lower <= upper ? lower...upper : upper...upper
    }

    /// Calendar age for a local `Date` (through `Formatters.ageFrom(birthday:)` on `YYYY-MM-DD`).
    static func age(for birthday: Date, now: Date = Date()) -> Int? {
        Formatters.ageFrom(birthday: ISODate.day(birthday), now: now)
    }
}

// MARK: - GradeOptions (api-auth §6.2, h5-profile gotcha 4)

enum GradeOptions {
    /// Canonical English values (`GRADE_OPTIONS`); zh display through `L10n.grade`.
    static let all: [String] = [
        "Foundation", "Year 1", "Year 2", "Year 3", "Year 4", "Master's",
        "PhD Year 1", "PhD Year 2", "PhD Year 3", "PhD Year 4+",
    ]

    /// H5 `normalizeGrade`: case-insensitive snap to the canonical spelling; unknown legacy
    /// values (`Freshman`, `Undergraduate`, …) are kept as-is; nil / blank → nil.
    static func normalize(_ raw: String?) -> String? {
        let t = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        if let hit = all.first(where: { $0.caseInsensitiveCompare(t) == .orderedSame }) { return hit }
        return t
    }

    /// Options for a select: the canonical list, with a legacy `current` value prepended so it
    /// stays selectable (H5 `fillMetaSelect` rule).
    static func options(including current: String?) -> [String] {
        guard let c = normalize(current), !all.contains(c) else { return all }
        return [c] + all
    }
}

// MARK: - Verification / note / photo / avatar / connect-code DTOs (api-auth §3.6–§3.9, §5.2, §5.4)

/// `POST /users/me/verification/send-code` → 201 `{message, devCode?, expiresInSec}`.
struct VerificationSendResult: Decodable, Equatable {
    var message: String?
    var devCode: String?
    var expiresInSec: Int?

    init(message: String? = nil, devCode: String? = nil, expiresInSec: Int? = nil) {
        self.message = message; self.devCode = devCode; self.expiresInSec = expiresInSec
    }

    private enum CodingKeys: String, CodingKey { case message, devCode, expiresInSec }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        message = c.lenient(String.self, .message)
        devCode = c.lenient(String.self, .devCode) ?? c.lenientInt(.devCode).map { String($0) }
        expiresInSec = c.lenientInt(.expiresInSec)
    }
}

/// `POST /users/me/verification/submit` → 201 `{message, id, verificationStatus: "pending"}`.
struct VerificationSubmitResult: Decodable, Equatable {
    var message: String?
    var id: String?
    var verificationStatus: String?

    private enum CodingKeys: String, CodingKey { case message, id, verificationStatus }

    init(message: String? = nil, id: String? = nil, verificationStatus: String? = nil) {
        self.message = message; self.id = id; self.verificationStatus = verificationStatus
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        message = c.lenient(String.self, .message)
        id = c.lenient(String.self, .id)
        verificationStatus = c.lenient(String.self, .verificationStatus)
    }
}

/// `POST /users/me/verification/send-code` body.
struct VerificationSendRequest: Encodable {
    let schoolEmail: String
}

/// `POST /users/me/verification/submit` body — all three required.
struct VerificationSubmitRequest: Encodable {
    let studentCardUrl: String
    let schoolEmail: String
    let code: String
}

/// `PUT /users/me/notes` body: `note` is always sent — the server trims, slices to 30 and
/// deletes the note when it is empty (H5 sends `""` to clear).
struct SetNoteRequest: Encodable {
    let targetUserId: String
    let note: String
}

/// `PUT /users/me/notes` → 200 `{targetUserId, note | null}`.
struct SetNoteResult: Decodable, Equatable {
    var targetUserId: String?
    var note: String?

    private enum CodingKeys: String, CodingKey { case targetUserId, note }

    init(targetUserId: String? = nil, note: String? = nil) {
        self.targetUserId = targetUserId; self.note = note
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        targetUserId = c.lenient(String.self, .targetUserId)
        note = c.lenient(String.self, .note)
    }
}

/// `POST /uploads/real-photo` → 201 `{message, realPhotos}` — at the 6-photo cap the server still
/// answers 201 with the unchanged list and an explanatory message (S8): compare the count.
struct RealPhotoResult: Decodable, Equatable {
    var message: String?
    var realPhotos: [String]

    private enum CodingKeys: String, CodingKey { case message, realPhotos }

    init(message: String? = nil, realPhotos: [String] = []) {
        self.message = message; self.realPhotos = realPhotos
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        message = c.lenient(String.self, .message)
        realPhotos = c.lenient([String].self, .realPhotos) ?? []
    }
}

/// `POST /uploads/real-photo` body (`caption` accepted but ignored server-side).
struct RealPhotoRequest: Encodable {
    let url: String
}

/// `POST /uploads/avatar` body.
struct AvatarRequest: Encodable {
    let url: String
}

/// `POST /uploads/avatar` → 201 `{message: "Avatar updated", avatarUrl}`.
struct AvatarResult: Decodable, Equatable {
    var message: String?
    var avatarUrl: String?

    private enum CodingKeys: String, CodingKey { case message, avatarUrl }

    init(message: String? = nil, avatarUrl: String? = nil) {
        self.message = message; self.avatarUrl = avatarUrl
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        message = c.lenient(String.self, .message)
        avatarUrl = c.lenient(String.self, .avatarUrl)
    }
}

/// `GET /users/me/connect-code` → 200 `{connectCode: "CL7Q2M9XKD"}`.
struct ConnectCodeResult: Decodable, Equatable {
    let connectCode: String
}
