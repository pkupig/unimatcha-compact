// Interface outline: implementation bodies removed.
import Foundation
struct ProfileService {
    static func getMe() async throws -> User
    static func getMyProfile() async throws -> UserProfile
    static func updateProfile(_ req: UpdateProfileRequest) async throws -> UserProfile
    static func getPublicProfile(userId: String) async throws -> PublicProfile
    static func getSettings() async throws -> UserSettings
    static func updateSettings(_ s: UserSettings) async throws -> UserSettings
    static func getConnectCode() async throws -> ConnectCode
    static func sendVerificationCode(schoolEmail: String) async throws -> SendCodeResult
        struct Body: Encodable {
    static func changePassword(current: String, new: String) async throws
        struct Body: Encodable {
