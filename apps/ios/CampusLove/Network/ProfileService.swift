import Foundation

struct ProfileService {
    static func getMyProfile() async throws -> UserProfile {
        return try await APIClient.shared.request("/profiles/me")
    }
    
    static func upsertProfile(_ profile: CreateProfileRequest) async throws -> UserProfile {
        return try await APIClient.shared.request("/profiles/me", method: .PUT, body: profile)
    }
}
