import Foundation
import Combine

// MARK: - API Configuration
enum APIConfig {
    static var baseURL: String {
        // In production, read from Info.plist
        return Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String
            ?? "http://localhost:3001/api/v1"
    }
}

// MARK: - API Error
enum APIError: LocalizedError {
    case invalidURL
    case networkError(Error)
    case decodingError(Error)
    case serverError(Int, String)
    case unauthorized
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "无效的请求地址"
        case .networkError(let e): return "网络错误：\(e.localizedDescription)"
        case .decodingError(let e): return "数据解析失败：\(e.localizedDescription)"
        case .serverError(_, let msg): return msg
        case .unauthorized: return "登录已过期，请重新登录"
        case .unknown: return "未知错误"
        }
    }
}

// MARK: - HTTP Method
enum HTTPMethod: String {
    case GET, POST, PUT, PATCH, DELETE
}

// MARK: - API Client
final class APIClient {
    static let shared = APIClient()
    private let session: URLSession
    
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }
    
    // MARK: - Core Request
    func request<T: Decodable>(
        _ path: String,
        method: HTTPMethod = .GET,
        body: Encodable? = nil,
        queryParams: [String: String]? = nil
    ) async throws -> T {
        // Build URL
        guard var urlComponents = URLComponents(string: "\(APIConfig.baseURL)\(path)") else {
            throw APIError.invalidURL
        }
        
        if let params = queryParams {
            urlComponents.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        
        guard let url = urlComponents.url else { throw APIError.invalidURL }
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Auth token
        if let token = TokenStorage.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Body
        if let body = body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        
        // Execute
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown
        }
        
        // Handle 401
        if httpResponse.statusCode == 401 {
            TokenStorage.shared.clearToken()
            throw APIError.unauthorized
        }
        
        // Parse response
        if httpResponse.statusCode >= 400 {
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverError(httpResponse.statusCode, errorResponse.message)
            }
            throw APIError.serverError(httpResponse.statusCode, "请求失败")
        }
        
        do {
            let apiResponse = try JSONDecoder().decode(APIResponse<T>.self, from: data)
            guard let responseData = apiResponse.data else {
                throw APIError.serverError(200, apiResponse.message ?? "无数据返回")
            }
            return responseData
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// POST with no meaningful response payload (fire-and-forget style endpoints).
    @discardableResult
    func send(_ path: String, method: HTTPMethod = .POST, body: Encodable? = nil) async throws -> GenericResponse {
        try await request(path, method: method, body: body)
    }

    // MARK: - Multipart image upload → POST /uploads/image (field name "file")
    func uploadImage(_ imageData: Data, filename: String = "photo.jpg", mime: String = "image/jpeg") async throws -> UploadResult {
        guard let url = URL(string: "\(APIConfig.baseURL)/uploads/image") else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let token = TokenStorage.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        func append(_ s: String) { body.append(s.data(using: .utf8)!) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mime)\r\n\r\n")
        body.append(imageData)
        append("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.unknown }
        if http.statusCode == 401 { TokenStorage.shared.clearToken(); throw APIError.unauthorized }
        if http.statusCode >= 400 {
            let msg = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.message ?? "上传失败"
            throw APIError.serverError(http.statusCode, msg)
        }
        do {
            let wrapped = try JSONDecoder().decode(APIResponse<UploadResult>.self, from: data)
            guard let result = wrapped.data else { throw APIError.serverError(200, "上传无返回") }
            return result
        } catch { throw APIError.decodingError(error) }
    }
}

private struct ErrorResponse: Decodable {
    let message: String
}

// MARK: - Token Storage
final class TokenStorage {
    static let shared = TokenStorage()
    private let key = "unimatcha_user_token"
    private let userKey = "unimatcha_user_info"
    
    var token: String? {
        get { UserDefaults.standard.string(forKey: key) }
        set {
            if let value = newValue { UserDefaults.standard.set(value, forKey: key) }
            else { UserDefaults.standard.removeObject(forKey: key) }
        }
    }
    
    func saveUser(_ user: User) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: userKey)
        }
    }
    
    func loadUser() -> User? {
        guard let data = UserDefaults.standard.data(forKey: userKey) else { return nil }
        return try? JSONDecoder().decode(User.self, from: data)
    }
    
    func clearToken() {
        UserDefaults.standard.removeObject(forKey: key)
        UserDefaults.standard.removeObject(forKey: userKey)
    }
    
    var isLoggedIn: Bool { token != nil }
}
