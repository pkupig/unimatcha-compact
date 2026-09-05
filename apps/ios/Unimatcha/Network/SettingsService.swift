import Foundation

/// Settings-page endpoints (h5-settings.md §3): user settings GET / single-key PUT, nudge
/// suffix, change password. `POST /reports` lives in `ReportService` (WP-01).
enum SettingsService {
    /// `GET /users/me/settings` → `{ pushEnabled, privacy: {…} }` merged with server defaults.
    static func settings() async throws -> UserSettings {
        try await APIClient.shared.request(.get("/users/me/settings"))
    }

    /// `PUT /users/me/settings` with **exactly one key** (`SettingsPatch`). The server echoes
    /// the full merged object; the H5 discards it on purpose (so concurrent optimistic flips
    /// are not clobbered) — hence `send`, no decode.
    static func update(_ patch: SettingsPatch) async throws {
        try await APIClient.shared.send(.put("/users/me/settings", body: patch))
    }

    /// `PUT /chat/nudge-suffix {suffix}` → `{ nudgeSuffix }`. Server slices to 40 chars, no trim.
    @discardableResult
    static func setNudgeSuffix(_ suffix: String) async throws -> NudgeSuffixResponse {
        try await APIClient.shared.request(.put("/chat/nudge-suffix", body: NudgeSuffixRequest(suffix: suffix)))
    }

    /// `POST /auth/change-password {currentPassword, password}` → `{ message: "Password updated" }`.
    /// 400 `Current password is incorrect` / `Password must be at least 8 characters` (server text
    /// is surfaced verbatim by the caller's toast).
    static func changePassword(current: String, new: String) async throws {
        try await APIClient.shared.send(.post("/auth/change-password",
                                              body: ChangePasswordRequest(currentPassword: current, password: new)))
    }

    /// `POST /users/me/delete {password}` — self-service account deletion (App Store 5.1.1(v)
    /// parity: matches the endpoint the H5 "Delete Account" row calls). 401 `Current password is
    /// incorrect` when the password doesn't match; the server anonymizes in place and tears down
    /// the token server-side, so the caller must still locally log out on success.
    static func deleteAccount(password: String) async throws {
        try await APIClient.shared.send(.post("/users/me/delete", body: DeleteAccountRequest(password: password)))
    }
}
