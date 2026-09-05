import Foundation
import UIKit

// MARK: - ProfileService (`api-auth §3.1, §3.6–§3.10, §4, §5.2–§5.4`)
//
// Settings GET/PUT are NOT here (WP-13 `SettingsService`). Metadata lists live in
// `MetadataService`. Uploads of raw bytes go through `UploadService` (WP-01).

enum ProfileService {
    // MARK: Identity

    /// `GET /users/me` — the bootstrap identity (`SessionStore.refreshMe` also wraps this).
    static func me() async throws -> User {
        try await APIClient.shared.request(.get("/users/me"))
    }

    /// `GET /profiles/me` — the full Profile row + `joinedAt`, `connectCode`, `verificationStatus`.
    /// 404 `"Profile not completed"` for a brand-new user (no row yet).
    static func profilesMe() async throws -> UserProfile {
        try await APIClient.shared.request(.get("/profiles/me"))
    }

    // MARK: Write

    /// `PUT /profiles/me` (upsert; only present keys are touched). Returns the full row after the write.
    @discardableResult
    static func update(_ update: ProfileUpdate) async throws -> UserProfile {
        try await APIClient.shared.request(.put("/profiles/me", body: update))
    }

    // MARK: Avatar (api-auth §5.3: upload image → POST /uploads/avatar {url})

    /// `POST /uploads/avatar {url}` → `{message, avatarUrl}`. Upserts `profile.avatarUrl` immediately.
    @discardableResult
    static func uploadAvatar(url: String) async throws -> AvatarResult {
        try await APIClient.shared.request(.post("/uploads/avatar", body: AvatarRequest(url: url)))
    }

    /// Full H5 avatar flow from already-encoded JPEG bytes: `POST /uploads/image` → `POST /uploads/avatar`.
    /// Returns the absolute avatar URL to store locally.
    static func uploadAvatar(jpegData: Data) async throws -> String {
        let url = try await UploadService.upload(jpegData: jpegData)
        let result = try await uploadAvatar(url: url)
        let stored = result.avatarUrl ?? url
        return stored.isEmpty ? url : stored
    }

    /// Full H5 avatar flow from a `UIImage` (HEIC → JPEG via `ImageTranscoder`).
    static func uploadAvatar(image: UIImage) async throws -> String {
        let url = try await UploadService.upload(image: image)
        let result = try await uploadAvatar(url: url)
        let stored = result.avatarUrl ?? url
        return stored.isEmpty ? url : stored
    }

    // MARK: Real photos

    /// `POST /uploads/real-photo {url}` → `{message, realPhotos}` (201 even at the 6-photo cap, S8).
    static func addRealPhoto(url: String) async throws -> RealPhotoResult {
        try await APIClient.shared.request(.post("/uploads/real-photo", body: RealPhotoRequest(url: url)))
    }

    // MARK: Other users

    /// `GET /users/:id/public-profile` — three projections (self/connection, stranger, hidden).
    /// 404 `"User not found or profile not completed"`.
    static func publicProfile(userId: String) async throws -> PublicProfile {
        let encoded = userId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? userId
        return try await APIClient.shared.request(.get("/users/\(encoded)/public-profile"))
    }

    /// `GET /users/me/connect-code` → `"CL" + 8 [0-9A-Z]` (generated on first call, stable afterwards).
    static func connectCode() async throws -> String {
        let r: ConnectCodeResult = try await APIClient.shared.request(.get("/users/me/connect-code"))
        return r.connectCode
    }

    /// `PUT /users/me/notes {targetUserId, note}` — empty note clears. Server trims and caps at 30.
    @discardableResult
    static func setNote(targetUserId: String, note: String) async throws -> SetNoteResult {
        let body = SetNoteRequest(targetUserId: targetUserId, note: note)
        return try await APIClient.shared.request(.put("/users/me/notes", body: body))
    }

    // MARK: Student verification (api-auth §3.6–§3.7)

    /// `POST /users/me/verification/send-code {schoolEmail}` → 201 `{message, devCode?, expiresInSec}`.
    static func verificationSendCode(schoolEmail: String) async throws -> VerificationSendResult {
        let body = VerificationSendRequest(schoolEmail: schoolEmail.trimmingCharacters(in: .whitespacesAndNewlines))
        return try await APIClient.shared.request(.post("/users/me/verification/send-code", body: body))
    }

    /// `POST /users/me/verification/submit {studentCardUrl, schoolEmail, code}` → 201
    /// `{message, id, verificationStatus: "pending"}`.
    static func verificationSubmit(studentCardUrl: String, schoolEmail: String, code: String) async throws -> VerificationSubmitResult {
        let body = VerificationSubmitRequest(studentCardUrl: studentCardUrl,
                                             schoolEmail: schoolEmail.trimmingCharacters(in: .whitespacesAndNewlines),
                                             code: code.trimmingCharacters(in: .whitespacesAndNewlines))
        return try await APIClient.shared.request(.post("/users/me/verification/submit", body: body))
    }
}
