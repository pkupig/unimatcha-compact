import Foundation

// MARK: - Profile (GET/PUT /profiles/me, PUT /users/me)
struct UserProfile: Codable, Equatable {
    var id: String?
    var userId: String?
    var nickname: String?
    var realName: String?
    var familyName: String?
    var givenName: String?
    var school: String?
    var grade: String?
    var gender: String?           // male | female | non_binary | other
    var genderPref: String?       // male | female | any
    var age: Int?
    var city: String?
    var interests: [String]?
    var bio: String?
    var avatarUrl: String?
    var socialLinks: SocialLinks?
    var signature: String?
    var coverUrl: String?
    var tags: [String]?
    var major: String?
    var mbti: String?
    var nationality: String?
    var realPhotos: [String]?
    var zodiac: String?
    var wishGifts: [String]?
    var relationshipScore: Double?
    var profileCompleteness: Int?
}

/// PUT /users/me — all optional; partial updates preserve unsent fields.
struct UpdateProfileRequest: Codable {
    var nickname: String?
    var school: String?
    var grade: String?
    var gender: String?
    var genderPref: String?
    var age: Int?
    var city: String?
    var interests: [String]?
    var wishGifts: [String]?
    var bio: String?
    var avatarUrl: String?
    var socialLinks: SocialLinks?
    var signature: String?
    var coverUrl: String?
    var tags: [String]?
    var major: String?
    var mbti: String?
    var nationality: String?
    var realPhotos: [String]?
    var zodiac: String?
}

// MARK: - Settings (GET/PUT /users/me/settings)
struct UserSettings: Codable {
    var pushEnabled: Bool
    var privacy: PrivacySettings

    static let defaults = UserSettings(pushEnabled: true,
                                       privacy: PrivacySettings(showProfile: true, showOnline: true, showMoments: true))
}

struct PrivacySettings: Codable {
    var showProfile: Bool
    var showOnline: Bool
    var showMoments: Bool
}

// MARK: - Connect code (GET /users/me/connect-code)
struct ConnectCode: Codable { let connectCode: String }

// MARK: - Verification (POST /users/me/verification/send-code)
struct SendCodeResult: Codable {
    let message: String
    let devCode: String?
    let expiresInSec: Int?
}
