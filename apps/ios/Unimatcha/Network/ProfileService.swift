import Foundation

struct ProfileService {
    static func getMyProfile() async throws -> UserProfile {
        return try await APIClient.shared.request("/profiles/me")
    }

    static func upsertProfile(_ profile: CreateProfileRequest) async throws -> UserProfile {
        return try await APIClient.shared.request("/profiles/me", method: .PUT, body: profile)
    }

    // Update via users/me endpoint (includes socialLinks)
    static func updateMyProfile(_ profile: CreateProfileRequest) async throws -> UserProfile {
        return try await APIClient.shared.request("/users/me", method: .PUT, body: profile)
    }

    // Get another user's public profile
    static func getPublicProfile(userId: String) async throws -> PublicProfile {
        return try await APIClient.shared.request("/users/\(userId)/public-profile")
    }
}
