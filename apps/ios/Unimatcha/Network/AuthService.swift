// Interface outline: implementation bodies removed.
import Foundation
struct AuthService {
    static func register(email: String, password: String) async throws -> AuthResponse
        struct Body: Encodable {
    static func login(email: String, password: String) async throws -> AuthResponse
        struct Body: Encodable {
