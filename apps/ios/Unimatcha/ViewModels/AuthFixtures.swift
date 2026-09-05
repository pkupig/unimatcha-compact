#if DEBUG
import Foundation

/// Decode / contract checks for WP-04 (auth + onboarding). Run by WP-16's `-unimatcha-decode-check`.
enum AuthFixtures {
    static func verify() throws {
        // auth-login.json → AuthResponse (200): light user with hasProfile + profileCompleteness
        let login = try FixtureCheck.decode(AuthResponse.self, fixture: "auth-login")
        try FixtureCheck.expect(!login.token.isEmpty, "auth-login", "token")
        try FixtureCheck.expect(login.user.id == "clx0me0000000000000000001", "auth-login", "user.id")
        try FixtureCheck.expect(login.user.hasProfile == true, "auth-login", "hasProfile")
        try FixtureCheck.expect(login.user.profileCompleteness == 62, "auth-login", "profileCompleteness")
        try FixtureCheck.expect(!login.user.isBanned, "auth-login", "status ACTIVE")

        // auth-register.json → AuthResponse (201): {id, email, status, createdAt}, no hasProfile
        let reg = try FixtureCheck.decode(AuthResponse.self, fixture: "auth-register")
        try FixtureCheck.expect(reg.user.hasProfile == nil, "auth-register", "no hasProfile on register user")
        try FixtureCheck.expect(reg.user.createdAt == "2026-09-03T10:00:00.000Z", "auth-register", "createdAt")
        try FixtureCheck.expect(!reg.user.resolvedHasProfile, "auth-register", "resolvedHasProfile false → profile setup")
        try FixtureCheck.expect(reg.user.modeStates.isEmpty && reg.user.matchState(.romantic) == "idle", "auth-register", "modeStates empty → idle")

        // auth-send-code-dev.json → SendCodeResult (register) and VerificationSendResult (same shape)
        let code = try FixtureCheck.decode(SendCodeResult.self, fixture: "auth-send-code-dev")
        try FixtureCheck.expect(code.devCode == "483920", "auth-send-code-dev", "devCode")
        try FixtureCheck.expect(code.hasDevCode, "auth-send-code-dev", "hasDevCode")
        try FixtureCheck.expect(code.expiresInSec == 600, "auth-send-code-dev", "expiresInSec")
        let vcode = try FixtureCheck.decode(VerificationSendResult.self, fixture: "auth-send-code-dev")
        try FixtureCheck.expect(vcode.devCode == "483920" && vcode.expiresInSec == 600, "auth-send-code-dev", "VerificationSendResult")
        let prod = try JSONDecoder().decode(SendCodeResult.self, from: Data(#"{"message":"Verification code sent to your email","expiresInSec":600}"#.utf8))
        try FixtureCheck.expect(!prod.hasDevCode, "inline", "production send-code has no devCode")

        // auth-profiles-me.json → UserProfile (full row + joinedAt / connectCode / verificationStatus)
        let me = try FixtureCheck.decode(UserProfile.self, fixture: "auth-profiles-me")
        try FixtureCheck.expect(me.nickname == "晓月", "auth-profiles-me", "nickname")
        try FixtureCheck.expect(me.joinedAt == "2026-07-01T08:00:00.000Z", "auth-profiles-me", "joinedAt")
        try FixtureCheck.expect(me.connectCode == "CL7Q2M9XKD", "auth-profiles-me", "connectCode")
        try FixtureCheck.expect(me.verificationStatus == "unverified", "auth-profiles-me", "verificationStatus")
        try FixtureCheck.expect(me.interests == ["Music", "Philosophy"], "auth-profiles-me", "interests")
        try FixtureCheck.expect(me.studentId == "u2312345", "auth-profiles-me", "studentId")
        try FixtureCheck.expect(me.socialLinks?["wechat"] == "xiaoyue_z", "auth-profiles-me", "socialLinks")
        try FixtureCheck.expect(me.displayRealName == "Xiaoyue Zhang", "auth-profiles-me", "displayRealName")

        // auth-public-profile-{full,stranger,hidden}.json → PublicProfile projections (api-auth §3.10)
        let full = try FixtureCheck.decode(PublicProfile.self, fixture: "auth-public-profile-full")
        try FixtureCheck.expect(full.daysKnown == 12, "auth-public-profile-full", "daysKnown")
        try FixtureCheck.expect(full.realName == "Morgan Lee", "auth-public-profile-full", "realName")
        try FixtureCheck.expect(full.realPhotos?.count == 2, "auth-public-profile-full", "realPhotos")
        try FixtureCheck.expect(full.isVerified && !full.isHidden, "auth-public-profile-full", "verified / not hidden")
        try FixtureCheck.expect(full.id == "clxpartner000000000000000009", "auth-public-profile-full", "id = userId")

        let stranger = try FixtureCheck.decode(PublicProfile.self, fixture: "auth-public-profile-stranger")
        try FixtureCheck.expect(stranger.coverUrl == nil && stranger.realName == nil && stranger.realPhotos == nil, "auth-public-profile-stranger", "stripped fields")
        try FixtureCheck.expect(stranger.signature == nil && stranger.major == nil && stranger.daysKnown == nil, "auth-public-profile-stranger", "narrow projection")
        try FixtureCheck.expect(stranger.interests?.isEmpty == true && stranger.nickname == "Noble Hare", "auth-public-profile-stranger", "basics")

        let hidden = try FixtureCheck.decode(PublicProfile.self, fixture: "auth-public-profile-hidden")
        try FixtureCheck.expect(hidden.isHidden, "auth-public-profile-hidden", "hidden")
        try FixtureCheck.expect(hidden.userId == nil && hidden.nickname == "Quiet Quokka", "auth-public-profile-hidden", "nickname only")
        try FixtureCheck.expect(hidden.id == "Quiet Quokka", "auth-public-profile-hidden", "id falls back to nickname")

        // auth-metadata-universities.json → MetadataList (78 entries, A→Z)
        let unis = try FixtureCheck.decode(MetadataList.self, fixture: "auth-metadata-universities")
        try FixtureCheck.expect(unis.items.count == 78, "auth-metadata-universities", "78 universities, got \(unis.items.count)")
        try FixtureCheck.expect(unis.items.contains("University of Warwick"), "auth-metadata-universities", "contains Warwick")
        try FixtureCheck.expect(unis.items.contains("City, University of London"), "auth-metadata-universities", "comma-bearing name intact")
        let empty = try JSONDecoder().decode(MetadataList.self, from: Data(#"{"items":[]}"#.utf8))
        try FixtureCheck.expect(empty.items.isEmpty, "inline", "empty metadata list decodes (treated as error by the service)")

        // Other DTOs (inline)
        let sub = try JSONDecoder().decode(VerificationSubmitResult.self, from: Data(#"{"message":"Verification materials submitted, awaiting admin review","id":"clx1","verificationStatus":"pending"}"#.utf8))
        try FixtureCheck.expect(sub.verificationStatus == "pending", "inline", "VerificationSubmitResult")
        let note = try JSONDecoder().decode(SetNoteResult.self, from: Data(#"{"targetUserId":"clx2","note":null}"#.utf8))
        try FixtureCheck.expect(note.targetUserId == "clx2" && note.note == nil, "inline", "SetNoteResult null note")
        let photo = try JSONDecoder().decode(RealPhotoResult.self, from: Data(#"{"message":"Real photo added","realPhotos":["a","b"]}"#.utf8))
        try FixtureCheck.expect(photo.realPhotos.count == 2, "inline", "RealPhotoResult")
        let avatar = try JSONDecoder().decode(AvatarResult.self, from: Data(#"{"message":"Avatar updated","avatarUrl":"https://x/y.jpg"}"#.utf8))
        try FixtureCheck.expect(avatar.avatarUrl == "https://x/y.jpg", "inline", "AvatarResult")
        let cc = try JSONDecoder().decode(ConnectCodeResult.self, from: Data(#"{"connectCode":"CL7Q2M9XKD"}"#.utf8))
        try FixtureCheck.expect(cc.connectCode == "CL7Q2M9XKD", "inline", "ConnectCodeResult")

        // Request bodies encode exactly the DTO keys
        let noteReq = String(decoding: try Endpoint.encoder.encode(SetNoteRequest(targetUserId: "u1", note: "")), as: UTF8.self)
        try FixtureCheck.expect(noteReq == #"{"note":"","targetUserId":"u1"}"#, "inline", "SetNoteRequest got \(noteReq)")
        let loginReq = String(decoding: try Endpoint.encoder.encode(AuthService.LoginRequest(email: "a@b.c", password: "p")), as: UTF8.self)
        try FixtureCheck.expect(loginReq == #"{"email":"a@b.c","password":"p"}"#, "inline", "LoginRequest got \(loginReq)")
        let regReq = String(decoding: try Endpoint.encoder.encode(AuthService.RegisterRequest(email: "a@b.c", password: "password1", code: "123456")), as: UTF8.self)
        try FixtureCheck.expect(regReq == #"{"code":"123456","email":"a@b.c","password":"password1"}"#, "inline", "RegisterRequest got \(regReq)")
        let subReq = String(decoding: try Endpoint.encoder.encode(VerificationSubmitRequest(studentCardUrl: "u", schoolEmail: "e", code: "c")), as: UTF8.self)
        try FixtureCheck.expect(subReq == #"{"code":"c","schoolEmail":"e","studentCardUrl":"u"}"#, "inline", "VerificationSubmitRequest got \(subReq)")

        // ProfileUpdate — setup variant payload (api-auth §4.2): exact key set, given-first realName,
        // school/grade/bio sent even when empty, city/major/mbti/nationality only when non-empty.
        let minimal = ProfileUpdate.setup(nickname: " Scholar ", givenName: "Xiao", familyName: "Zhang", school: nil, grade: nil,
                                          gender: "female", genderPref: nil, age: 21, birthday: "2004-06-01", bio: "",
                                          interests: [], city: "", major: nil, mbti: " ", nationality: nil)
        try FixtureCheck.expect(minimal.presentKeys == ["age", "bio", "birthday", "familyName", "gender", "genderPref", "givenName", "grade", "interests", "nickname", "realName", "school"],
                                "inline", "setup payload minimal keys got \(minimal.presentKeys)")
        try FixtureCheck.expect(minimal.realName == "Xiao Zhang" && minimal.nickname == "Scholar", "inline", "realName given-first / nickname trimmed")
        try FixtureCheck.expect(minimal.genderPref == "any" && minimal.school == "" && minimal.grade == "" && minimal.bio == "", "inline", "defaults: genderPref any, empty strings sent")
        let minimalJSON = String(decoding: try Endpoint.encoder.encode(minimal), as: UTF8.self)
        try FixtureCheck.expect(minimalJSON == #"{"age":21,"bio":"","birthday":"2004-06-01","familyName":"Zhang","gender":"female","genderPref":"any","givenName":"Xiao","grade":"","interests":[],"nickname":"Scholar","realName":"Xiao Zhang","school":""}"#,
                                "inline", "setup payload JSON got \(minimalJSON)")

        let fullSetup = ProfileUpdate.setup(nickname: "S", givenName: "A", familyName: "B", school: "University of Warwick", grade: "year 2",
                                            gender: "male", genderPref: "female", age: 20, birthday: "2006-01-02",
                                            bio: String(repeating: "x", count: 300), interests: ["Music"],
                                            city: "Coventry", major: "Computer Science", mbti: "INFP", nationality: "Chinese")
        try FixtureCheck.expect(fullSetup.presentKeys.count == 16 && fullSetup.presentKeys.contains("city") && fullSetup.presentKeys.contains("nationality"),
                                "inline", "setup payload full keys got \(fullSetup.presentKeys)")
        try FixtureCheck.expect(fullSetup.grade == "Year 2", "inline", "grade normalised")
        try FixtureCheck.expect(fullSetup.bio?.count == 250, "inline", "bio capped at 250")
        try FixtureCheck.expect(fullSetup.patch["interests"]?.stringArrayValue == ["Music"], "inline", "patch interests")

        // Empty update encodes {}
        let none = String(decoding: try Endpoint.encoder.encode(ProfileUpdate()), as: UTF8.self)
        try FixtureCheck.expect(none == "{}" && ProfileUpdate().isEmpty, "inline", "empty ProfileUpdate encodes {} got \(none)")

        // Merge the payload into a profile (what saveProfile does locally)
        var merged = me
        merged.merge(fullSetup.patch)
        try FixtureCheck.expect(merged.nickname == "S" && merged.grade == "Year 2" && merged.city == "Coventry" && merged.interests == ["Music"], "inline", "payload merge")

        // GradeOptions
        try FixtureCheck.expect(GradeOptions.all.count == 10, "inline", "10 grade options")
        try FixtureCheck.expect(GradeOptions.normalize("master's") == "Master's", "inline", "grade case-insensitive snap")
        try FixtureCheck.expect(GradeOptions.normalize("phd year 4+") == "PhD Year 4+", "inline", "grade snap PhD 4+")
        try FixtureCheck.expect(GradeOptions.normalize("Freshman") == "Freshman", "inline", "legacy grade kept")
        try FixtureCheck.expect(GradeOptions.normalize("  ") == nil && GradeOptions.normalize(nil) == nil, "inline", "blank grade → nil")
        try FixtureCheck.expect(GradeOptions.options(including: "Freshman").first == "Freshman" && GradeOptions.options(including: "Freshman").count == 11, "inline", "legacy value prepended")
        try FixtureCheck.expect(GradeOptions.options(including: "Year 1") == GradeOptions.all, "inline", "canonical value not duplicated")

        // Birthday bounds today−40y … today−16y and the age rule 16–40
        let now = Date()
        let range = ProfileRules.birthdayRange(now: now)
        try FixtureCheck.expect(range.lowerBound < range.upperBound, "inline", "birthday range ordered")
        try FixtureCheck.expect(ProfileRules.age(for: range.upperBound, now: now) == 16, "inline", "upper bound age 16")
        try FixtureCheck.expect(ProfileRules.age(for: range.lowerBound, now: now) == 40, "inline", "lower bound age 40")
        let tooYoung = Calendar.current.date(byAdding: .day, value: 1, to: range.upperBound) ?? range.upperBound
        try FixtureCheck.expect(!ProfileRules.isValidAge(ProfileRules.age(for: tooYoung, now: now)), "inline", "one day younger than 16 is invalid")
        try FixtureCheck.expect(!ProfileRules.isValidAge(nil) && ProfileRules.isValidAge(16) && ProfileRules.isValidAge(40) && !ProfileRules.isValidAge(41), "inline", "age bounds")

        // Auth validation order (h5-auth §2.2)
        try FixtureCheck.expect(AuthValidation.loginError(email: "", password: "x") != nil, "inline", "login empty email")
        try FixtureCheck.expect(AuthValidation.loginError(email: "a@b.c", password: "x") == nil, "inline", "login ok")
        try FixtureCheck.expect(AuthValidation.registerError(email: "a@b.c", code: "", password: "p", confirm: "p") == AuthCopy.fillAllFields, "inline", "register empty → fill all")
        try FixtureCheck.expect(AuthValidation.registerError(email: "a@b.c", code: "12345", password: "12345678", confirm: "12345678") == AuthCopy.enterSixDigitCode, "inline", "register 5-digit code")
        try FixtureCheck.expect(AuthValidation.registerError(email: "a@b.c", code: "12a456", password: "12345678", confirm: "12345678") == AuthCopy.enterSixDigitCode, "inline", "register non-digit code")
        try FixtureCheck.expect(AuthValidation.registerError(email: "a@b.c", code: "123456", password: "1234567", confirm: "1234567") == AuthCopy.passwordTooShort, "inline", "register short password")
        try FixtureCheck.expect(AuthValidation.registerError(email: "a@b.c", code: "123456", password: "12345678", confirm: "12345679") == AuthCopy.passwordsMismatch, "inline", "register mismatch")
        try FixtureCheck.expect(AuthValidation.registerError(email: "a@b.c", code: "123456", password: "12345678", confirm: "12345678") == nil, "inline", "register ok")
        try FixtureCheck.expect(AuthValidation.isSixDigitCode("000000") && !AuthValidation.isSixDigitCode("１２３４５６"), "inline", "ASCII digits only")

        // Setup wizard / save validation order (h5-auth §2.4)
        let birthdayOK = range.upperBound
        try FixtureCheck.expect(ProfileSetupViewModel.wizardError(step: 0, nickname: " ", givenName: "", familyName: "", gender: nil, birthday: nil, now: now) == SetupCopy.enterNickname, "inline", "wizard step 0")
        try FixtureCheck.expect(ProfileSetupViewModel.wizardError(step: 1, nickname: "n", givenName: "a", familyName: "", gender: nil, birthday: nil, now: now) == SetupCopy.enterRealName, "inline", "wizard step 1")
        try FixtureCheck.expect(ProfileSetupViewModel.wizardError(step: 2, nickname: "n", givenName: "a", familyName: "b", gender: nil, birthday: nil, now: now) == SetupCopy.selectGender, "inline", "wizard step 2")
        try FixtureCheck.expect(ProfileSetupViewModel.wizardError(step: 3, nickname: "n", givenName: "a", familyName: "b", gender: "male", birthday: nil, now: now) == SetupCopy.selectBirthday, "inline", "wizard step 3 missing")
        try FixtureCheck.expect(ProfileSetupViewModel.wizardError(step: 3, nickname: "n", givenName: "a", familyName: "b", gender: "male", birthday: tooYoung, now: now) == SetupCopy.ageRange, "inline", "wizard step 3 age")
        try FixtureCheck.expect(ProfileSetupViewModel.wizardError(step: 3, nickname: "n", givenName: "a", familyName: "b", gender: "male", birthday: birthdayOK, now: now) == nil, "inline", "wizard step 3 ok")
        try FixtureCheck.expect(ProfileSetupViewModel.saveError(nickname: "n", givenName: "a", familyName: "", gender: "male", birthday: birthdayOK, now: now) == SetupCopy.enterRealNameFull, "inline", "save real name full message")
        try FixtureCheck.expect(ProfileSetupViewModel.saveError(nickname: "n", givenName: "a", familyName: "b", gender: "male", birthday: birthdayOK, now: now) == nil, "inline", "save ok")
    }
}
#endif
