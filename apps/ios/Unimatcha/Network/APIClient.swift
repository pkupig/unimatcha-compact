// Interface outline: implementation bodies removed.
import Foundation
import Combine
enum APIConfig {
enum APIError: LocalizedError {
    var errorDescription: String? {
enum HTTPMethod: String {
    func request<T: Decodable>(
    func send(_ path: String, method: HTTPMethod = .POST, body: Encodable? = nil) async throws -> GenericResponse
    func uploadImage(_ imageData: Data, filename: String = "photo.jpg", mime: String = "image/jpeg") async throws -> UploadResult
    let message: String
    var token: String? {
    func saveUser(_ user: User)
    func loadUser() -> User?
    func clearToken()
    var isLoggedIn: Bool { token != nil }
