import Foundation

struct ProfileService {
    /// Full current user with modeStates + profile.
    static func getMe() async throws -> User {
        try await APIClient.shared.request("/users/me")
    }

    static func getMyProfile() async throws -> UserProfile {
        try await APIClient.shared.request("/profiles/me")
    }

    /// Partial update via /users/me (preserves unsent fields).
    @discardableResult
    static func updateProfile(_ req: UpdateProfileRequest) async throws -> UserProfile {
        try await APIClient.shared.request("/users/me", method: .PUT, body: req)
    }

    static func getPublicProfile(userId: String) async throws -> PublicProfile {
        try await APIClient.shared.request("/users/\(userId)/public-profile")
    }

    // Settings
    static func getSettings() async throws -> UserSettings {
        try await APIClient.shared.request("/users/me/settings")
    }
    @discardableResult
    static func updateSettings(_ s: UserSettings) async throws -> UserSettings {
        try await APIClient.shared.request("/users/me/settings", method: .PUT, body: s)
    }

    // Connect code (QR)
    static func getConnectCode() async throws -> ConnectCode {
        try await APIClient.shared.request("/users/me/connect-code")
    }

    // Verification
    static func sendVerificationCode(schoolEmail: String) async throws -> SendCodeResult {
        struct Body: Encodable { let schoolEmail: String }
        return try await APIClient.shared.request("/users/me/verification/send-code", method: .POST, body: Body(schoolEmail: schoolEmail))
    }

    static func changePassword(current: String, new: String) async throws {
        struct Body: Encodable { let currentPassword: String; let password: String }
        try await APIClient.shared.send("/auth/change-password", body: Body(currentPassword: current, password: new))
    }
}
