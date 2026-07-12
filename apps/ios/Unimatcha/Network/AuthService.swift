import Foundation

struct AuthService {
    static func register(email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { let email: String; let password: String }
        return try await APIClient.shared.request("/auth/register", method: .POST, body: Body(email: email, password: password))
    }
    
    static func login(email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { let email: String; let password: String }
        return try await APIClient.shared.request("/auth/login", method: .POST, body: Body(email: email, password: password))
    }
}
