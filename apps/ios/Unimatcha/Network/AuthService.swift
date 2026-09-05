import Foundation

// MARK: - AuthService (`api-auth §2`, `h5-auth §3.1–§3.3`, §3.10)
//
// The three public auth endpoints are marked `isPublic` so a 401 is surfaced as a plain
// `APIError.http(401, "Incorrect email or password")` instead of the session-expiry path
// (h5-auth gotcha 2 — the H5 loses the server text; iOS shows it verbatim).

/// `POST /auth/register/send-code` → 200 `{message, expiresInSec}` (+ `devCode` outside production
/// when SMTP is unconfigured, S23).
struct SendCodeResult: Decodable, Equatable {
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

    var hasDevCode: Bool { !(devCode ?? "").isEmpty }
}

enum AuthService {
    struct LoginRequest: Encodable {
        let email: String
        let password: String
    }

    struct SendCodeRequest: Encodable {
        let email: String
    }

    struct RegisterRequest: Encodable {
        let email: String
        let password: String
        let code: String
    }

    struct ChangePasswordRequest: Encodable {
        let currentPassword: String
        let password: String
    }

    /// `POST /auth/login` (public, 200). 401 = wrong credentials / banned — server text verbatim.
    static func login(email: String, password: String) async throws -> AuthResponse {
        let body = LoginRequest(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
        return try await APIClient.shared.request(.post("/auth/login", body: body, isPublic: true))
    }

    /// `POST /auth/register/send-code` (public, 200, 30/min/IP). 409 registered · 400 cooldown /
    /// invalid email · 503 mail not configured · 429 rate limit.
    static func sendRegisterCode(email: String) async throws -> SendCodeResult {
        let body = SendCodeRequest(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
        return try await APIClient.shared.request(.post("/auth/register/send-code", body: body, isPublic: true))
    }

    /// `POST /auth/register` (public, **201**). Returns the light `{id, email, status, createdAt}` user
    /// (no `hasProfile`) + token; the caller routes straight to profile setup.
    static func register(email: String, password: String, code: String) async throws -> AuthResponse {
        let body = RegisterRequest(email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                                   password: password,
                                   code: code.trimmingCharacters(in: .whitespacesAndNewlines))
        return try await APIClient.shared.request(.post("/auth/register", body: body, isPublic: true))
    }

    /// `POST /auth/change-password` (JWT, 200 `{message: "Password updated"}`). 400
    /// `"Current password is incorrect"`. Existing tokens stay valid (S15).
    @discardableResult
    static func changePassword(current: String, new: String) async throws -> GenericResponse {
        let body = ChangePasswordRequest(currentPassword: current, password: new)
        let env: APIEnvelope<GenericResponse> = try await APIClient.shared.requestEnvelope(.post("/auth/change-password", body: body))
        return env.data ?? GenericResponse(message: env.message, status: nil, ok: env.success)
    }
}
