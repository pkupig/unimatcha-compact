import Foundation

/// READ model of `Profile` (`api-auth §1.2`) as returned inside `/users/me.profile` and by
/// `GET/PUT /profiles/me`. Every column optional; `interests` defaults to `[]`.
/// The WRITE side (`ProfileUpdate` etc.) lives in WP-04's `Models/ProfileWrite.swift`.
struct UserProfile: Decodable, Equatable {
    var nickname: String?
    var realName: String?
    var familyName: String?
    var givenName: String?
    var school: String?
    var grade: String?
    var gender: String?                 // male | female | non_binary | other
    var genderPref: String?             // male | female | any
    var age: Int?
    var birthday: String?               // YYYY-MM-DD
    var city: String?
    var interests: [String] = []
    var bio: String?
    var avatarUrl: String?
    var socialLinks: [String: String]?
    var signature: String?
    var coverUrl: String?
    var tags: [String]?
    var major: String?
    var mbti: String?
    var nationality: String?
    var studentId: String?
    var realPhotos: [String]?
    var zodiac: String?
    var wishGifts: [String]?
    var relationshipScore: Double?
    var profileCompleteness: Int?
    var joinedAt: String?               // only on /profiles/me
    var connectCode: String?            // only on /profiles/me (after first generation)
    var verificationStatus: String?     // only on /profiles/me
    var createdAt: String?
    var updatedAt: String?

    init() {}

    private enum CodingKeys: String, CodingKey {
        case nickname, realName, familyName, givenName, school, grade, gender, genderPref, age, birthday, city, interests,
             bio, avatarUrl, socialLinks, signature, coverUrl, tags, major, mbti, nationality, studentId, realPhotos, zodiac,
             wishGifts, relationshipScore, profileCompleteness, joinedAt, connectCode, verificationStatus, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nickname = c.lenient(String.self, .nickname)
        realName = c.lenient(String.self, .realName)
        familyName = c.lenient(String.self, .familyName)
        givenName = c.lenient(String.self, .givenName)
        school = c.lenient(String.self, .school)
        grade = c.lenient(String.self, .grade)
        gender = c.lenient(String.self, .gender)
        genderPref = c.lenient(String.self, .genderPref)
        age = c.lenientInt(.age)
        birthday = c.lenient(String.self, .birthday)
        city = c.lenient(String.self, .city)
        interests = c.lenient([String].self, .interests) ?? []
        bio = c.lenient(String.self, .bio)
        avatarUrl = c.lenient(String.self, .avatarUrl)
        socialLinks = c.lenient([String: String].self, .socialLinks)
        signature = c.lenient(String.self, .signature)
        coverUrl = c.lenient(String.self, .coverUrl)
        tags = c.lenient([String].self, .tags)
        major = c.lenient(String.self, .major)
        mbti = c.lenient(String.self, .mbti)
        nationality = c.lenient(String.self, .nationality)
        studentId = c.lenient(String.self, .studentId)
        realPhotos = c.lenient([String].self, .realPhotos)
        zodiac = c.lenient(String.self, .zodiac)
        wishGifts = c.lenient([String].self, .wishGifts)
        relationshipScore = c.lenientDouble(.relationshipScore)
        profileCompleteness = c.lenientInt(.profileCompleteness)
        joinedAt = c.lenient(String.self, .joinedAt)
        connectCode = c.lenient(String.self, .connectCode)
        verificationStatus = c.lenient(String.self, .verificationStatus)
        createdAt = c.lenient(String.self, .createdAt)
        updatedAt = c.lenient(String.self, .updatedAt)
    }

    // MARK: Convenience

    var hasNickname: Bool { !(nickname ?? "").isEmpty }
    var hasSchool: Bool { !(school ?? "").trimmingCharacters(in: .whitespaces).isEmpty }

    /// `profile.realName || givenName + ' ' + familyName` (H5 Profile tab facts row).
    var displayRealName: String? {
        if let r = realName, !r.isEmpty { return r }
        let composed = [givenName ?? "", familyName ?? ""].filter { !$0.isEmpty }.joined(separator: " ")
        return composed.isEmpty ? nil : composed
    }

    /// Applies a JSON-shaped patch (the keys a `PUT /profiles/me` sent, or a response row).
    /// String keys accept `String` (empty string clears to `""`, JSON null clears to nil),
    /// array keys accept `[String]`, `age` / `profileCompleteness` accept numbers, `socialLinks` a dictionary.
    mutating func merge(_ patch: [String: AnyCodable]) {
        for (key, any) in patch {
            let str: String? = any.isNull ? nil : any.stringValue
            let arr: [String]? = any.isNull ? nil : any.stringArrayValue
            switch key {
            case "nickname": if any.isNull || str != nil { nickname = str }
            case "realName": if any.isNull || str != nil { realName = str }
            case "familyName": if any.isNull || str != nil { familyName = str }
            case "givenName": if any.isNull || str != nil { givenName = str }
            case "school": if any.isNull || str != nil { school = str }
            case "grade": if any.isNull || str != nil { grade = str }
            case "gender": if any.isNull || str != nil { gender = str }
            case "genderPref": if any.isNull || str != nil { genderPref = str }
            case "age": if any.isNull { age = nil } else if let n = any.intValue { age = n }
            case "birthday": if any.isNull || str != nil { birthday = str }
            case "city": if any.isNull || str != nil { city = str }
            case "interests": interests = arr ?? []
            case "bio": if any.isNull || str != nil { bio = str }
            case "avatarUrl": if any.isNull || str != nil { avatarUrl = str }
            case "socialLinks":
                if any.isNull { socialLinks = nil }
                else if let d = any.dictionaryValue { socialLinks = d.compactMapValues { $0 as? String } }
            case "signature": if any.isNull || str != nil { signature = str }
            case "coverUrl": if any.isNull || str != nil { coverUrl = str }
            case "tags": if any.isNull { tags = nil } else if let a = arr { tags = a }
            case "major": if any.isNull || str != nil { major = str }
            case "mbti": if any.isNull || str != nil { mbti = str }
            case "nationality": if any.isNull || str != nil { nationality = str }
            case "studentId": if any.isNull || str != nil { studentId = str }
            case "realPhotos": if any.isNull { realPhotos = nil } else if let a = arr { realPhotos = a }
            case "zodiac": if any.isNull || str != nil { zodiac = str }
            case "wishGifts": if any.isNull { wishGifts = nil } else if let a = arr { wishGifts = a }
            case "relationshipScore": if any.isNull { relationshipScore = nil } else if let d = any.doubleValue { relationshipScore = d }
            case "profileCompleteness": if any.isNull { profileCompleteness = nil } else if let n = any.intValue { profileCompleteness = n }
            case "joinedAt": if any.isNull || str != nil { joinedAt = str }
            case "connectCode": if any.isNull || str != nil { connectCode = str }
            case "verificationStatus": if any.isNull || str != nil { verificationStatus = str }
            case "createdAt": if any.isNull || str != nil { createdAt = str }
            case "updatedAt": if any.isNull || str != nil { updatedAt = str }
            default: break   // id / userId / extraData / unknown keys are ignored
            }
        }
    }

    /// Overlays every non-nil field of `other` onto `self` (a full row returned by `PUT /profiles/me`).
    mutating func merge(row other: UserProfile) {
        if let v = other.nickname { nickname = v }
        if let v = other.realName { realName = v }
        if let v = other.familyName { familyName = v }
        if let v = other.givenName { givenName = v }
        if let v = other.school { school = v }
        if let v = other.grade { grade = v }
        if let v = other.gender { gender = v }
        if let v = other.genderPref { genderPref = v }
        if let v = other.age { age = v }
        if let v = other.birthday { birthday = v }
        if let v = other.city { city = v }
        interests = other.interests
        if let v = other.bio { bio = v }
        if let v = other.avatarUrl { avatarUrl = v }
        if let v = other.socialLinks { socialLinks = v }
        if let v = other.signature { signature = v }
        if let v = other.coverUrl { coverUrl = v }
        if let v = other.tags { tags = v }
        if let v = other.major { major = v }
        if let v = other.mbti { mbti = v }
        if let v = other.nationality { nationality = v }
        if let v = other.studentId { studentId = v }
        if let v = other.realPhotos { realPhotos = v }
        if let v = other.zodiac { zodiac = v }
        if let v = other.wishGifts { wishGifts = v }
        if let v = other.relationshipScore { relationshipScore = v }
        if let v = other.profileCompleteness { profileCompleteness = v }
        if let v = other.joinedAt { joinedAt = v }
        if let v = other.connectCode { connectCode = v }
        if let v = other.verificationStatus { verificationStatus = v }
        if let v = other.createdAt { createdAt = v }
        if let v = other.updatedAt { updatedAt = v }
    }
}
