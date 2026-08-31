import Foundation

struct AuthService {
    /// 注册第一步：请求邮箱验证码。返回体在开发态（后端未配置 SMTP）带 devCode。
    struct SendCodeResponse: Decodable { let message: String?; let devCode: String?; let expiresInSec: Int? }
    static func sendRegisterCode(email: String) async throws -> SendCodeResponse {
        struct Body: Encodable { let email: String }
        return try await APIClient.shared.request("/auth/register/send-code", method: .POST, body: Body(email: email))
    }

    static func register(email: String, password: String, code: String) async throws -> AuthResponse {
        struct Body: Encodable { let email: String; let password: String; let code: String }
        return try await APIClient.shared.request("/auth/register", method: .POST, body: Body(email: email, password: password, code: code))
    }

    static func login(email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { let email: String; let password: String }
        return try await APIClient.shared.request("/auth/login", method: .POST, body: Body(email: email, password: password))
    }
}
