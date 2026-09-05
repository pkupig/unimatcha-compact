import Foundation

enum HTTPMethod: String {
    case GET, POST, PUT, PATCH, DELETE
}

/// One API call description. `path` is relative to the base (leading slash, NO "/api/v1").
struct Endpoint {
    var path: String
    var method: HTTPMethod = .GET
    var query: [URLQueryItem] = []
    var body: Data? = nil                  // pre-encoded JSON
    var isPublic: Bool = false             // true → a 401 is a normal error (login/register), NOT session expiry
    var timeout: TimeInterval? = nil       // per-call override of the 30 s default (ads events use 10 s)

    init(path: String, method: HTTPMethod = .GET, query: [URLQueryItem] = [], body: Data? = nil, isPublic: Bool = false, timeout: TimeInterval? = nil) {
        self.path = path
        self.method = method
        self.query = query
        self.body = body
        self.isPublic = isPublic
        self.timeout = timeout
    }

    static func get(_ path: String, query: [URLQueryItem] = []) -> Endpoint {
        Endpoint(path: path, method: .GET, query: query)
    }

    static func post<B: Encodable>(_ path: String, body: B?, query: [URLQueryItem] = [], isPublic: Bool = false) -> Endpoint {
        Endpoint(path: path, method: .POST, query: query, body: Endpoint.encode(body), isPublic: isPublic)
    }

    /// POST without a body.
    static func post(_ path: String, query: [URLQueryItem] = []) -> Endpoint {
        Endpoint(path: path, method: .POST, query: query, body: nil)
    }

    static func put<B: Encodable>(_ path: String, body: B?) -> Endpoint {
        Endpoint(path: path, method: .PUT, body: Endpoint.encode(body))
    }

    static func put(_ path: String) -> Endpoint {
        Endpoint(path: path, method: .PUT)
    }

    static func patch<B: Encodable>(_ path: String, body: B) -> Endpoint {
        Endpoint(path: path, method: .PATCH, body: Endpoint.encode(body))
    }

    static func delete(_ path: String) -> Endpoint {
        Endpoint(path: path, method: .DELETE)
    }

    /// Returns a copy with a per-call timeout.
    func timeout(_ seconds: TimeInterval) -> Endpoint {
        var e = self
        e.timeout = seconds
        return e
    }

    /// JSONEncoder with default keys; nil optionals are OMITTED by synthesized Codable
    /// (required by `forbidNonWhitelisted`). Use `NullableField` for explicit JSON null.
    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    static func encode<B: Encodable>(_ body: B?) -> Data? {
        guard let body = body else { return nil }
        do {
            return try encoder.encode(body)
        } catch {
            assertionFailure("Endpoint body encoding failed: \(error)")
            return nil
        }
    }
}

/// Thin async HTTP client around the backend envelope contract (`api-* §0`).
final class APIClient {
    static let shared = APIClient()

    /// Info.plist `API_BASE_URL`; Debug may override via UserDefaults `api_base_url`;
    /// falls back to `https://api.unimatcha.ai/api/v1`.
    let baseURL: URL

    /// Set by `SessionStore` — the current JWT, read on every request.
    var tokenProvider: () -> String? = { nil }

    /// Set by `SessionStore`; invoked on the main actor once per 401 on a non-public endpoint,
    /// before `.unauthorized` is thrown to the caller.
    var onUnauthorized: @MainActor (String) -> Void = { _ in }

    static let defaultTimeout: TimeInterval = 30
    static let uploadResourceTimeout: TimeInterval = 120

    private let session: URLSession
    private let uploadSession: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL? = nil) {
        self.baseURL = baseURL ?? APIClient.resolveBaseURL()

        let cfg = URLSessionConfiguration.ephemeral
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.urlCache = nil
        cfg.timeoutIntervalForRequest = APIClient.defaultTimeout
        cfg.timeoutIntervalForResource = APIClient.defaultTimeout * 2
        cfg.waitsForConnectivity = false
        cfg.httpAdditionalHeaders = ["Accept": "application/json"]
        session = URLSession(configuration: cfg)

        let up = URLSessionConfiguration.ephemeral
        up.requestCachePolicy = .reloadIgnoringLocalCacheData
        up.urlCache = nil
        up.timeoutIntervalForRequest = 60
        up.timeoutIntervalForResource = APIClient.uploadResourceTimeout
        up.httpAdditionalHeaders = ["Accept": "application/json"]
        uploadSession = URLSession(configuration: up)
    }

    // MARK: Base URL resolution

    static let fallbackBaseURL = URL(string: "https://api.unimatcha.ai/api/v1")!

    static func resolveBaseURL() -> URL {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "api_base_url"), let u = sanitize(s) { return u }
        #endif
        if let s = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String, let u = sanitize(s) { return u }
        return fallbackBaseURL
    }

    private static func sanitize(_ raw: String) -> URL? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // Unexpanded build-setting reference or empty → ignore.
        guard !s.isEmpty, !s.contains("$("), s.hasPrefix("http") else { return nil }
        while s.hasSuffix("/") { s.removeLast() }
        return URL(string: s)
    }

    // MARK: Public API

    /// Returns `envelope.data`; throws `.emptyData` when it is null/absent.
    func request<T: Decodable>(_ e: Endpoint) async throws -> T {
        let env: APIEnvelope<T> = try await requestEnvelope(e)
        guard let d = env.data else { throw APIError.emptyData }
        return d
    }

    /// Full envelope, for callers that need the top-level `message` (e.g. `/matching/start`).
    func requestEnvelope<T: Decodable>(_ e: Endpoint) async throws -> APIEnvelope<T> {
        let (data, status) = try await perform(e)
        do {
            return try decoder.decode(APIEnvelope<T>.self, from: data)
        } catch {
            // Empty 2xx body (should not happen) → treat as an envelope without data.
            if data.isEmpty || status == 204 {
                return APIEnvelope<T>(success: true, data: nil, message: nil, timestamp: nil)
            }
            throw APIError.decoding(error)
        }
    }

    /// Performs the call, ignores the payload (status/401 handling still applies).
    func send(_ e: Endpoint) async throws {
        _ = try await perform(e)
    }

    /// `POST /uploads/image` — multipart field `file`, explicit part `Content-Type`, 120 s resource timeout.
    /// A 401 here does NOT tear the session down (H5 `uploadImageFile` parity).
    func uploadImage(_ jpeg: Data, mimeType: String = "image/jpeg", filename: String = "image.jpg") async throws -> UploadResult {
        guard let url = makeURL(path: "/uploads/image", query: []) else { throw APIError.invalidURL }
        let boundary = "----UnimatchaBoundary" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 60
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let t = tokenProvider(), !t.isEmpty {
            req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = APIClient.multipartBody(boundary: boundary, field: "file", filename: filename, mimeType: mimeType, data: jpeg)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await uploadSession.data(for: req)
        } catch {
            throw APIError.network(error)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError.http(status: status, message: errorMessage(from: data, status: status, fallback: "Upload failed"))
        }
        do {
            let env = try decoder.decode(APIEnvelope<UploadResult>.self, from: data)
            if let r = env.data { return r }
            // Tolerate a bare `{url, filename}` (defensive; the interceptor always wraps).
            return try decoder.decode(UploadResult.self, from: data)
        } catch let e as APIError {
            throw e
        } catch {
            throw APIError.decoding(error)
        }
    }

    // MARK: Core

    /// Executes an endpoint. Returns `(body, status)` for 2xx; maps every other outcome to `APIError`.
    private func perform(_ e: Endpoint) async throws -> (Data, Int) {
        guard let url = makeURL(path: e.path, query: e.query) else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = e.method.rawValue
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = e.timeout ?? APIClient.defaultTimeout
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let t = tokenProvider(), !t.isEmpty {
            req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        }
        if let b = e.body, e.method != .GET {
            req.httpBody = b
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.network(error)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) {
            return (data, status)
        }
        let message = errorMessage(from: data, status: status, fallback: "API \(status)")
        if status == 401 && !e.isPublic {
            let handler = onUnauthorized
            await MainActor.run { handler(message) }
            throw APIError.unauthorized(message: message)
        }
        throw APIError.http(status: status, message: message)
    }

    private func errorMessage(from data: Data, status: Int, fallback: String) -> String {
        if let body = try? decoder.decode(APIErrorBody.self, from: data), let m = body.message, !m.isEmpty {
            return m.text
        }
        return fallback
    }

    func makeURL(path: String, query: [URLQueryItem]) -> URL? {
        guard var comps = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return nil }
        var basePath = comps.path
        while basePath.hasSuffix("/") { basePath.removeLast() }
        let rel = path.hasPrefix("/") ? path : "/" + path
        comps.path = basePath + rel
        if !query.isEmpty {
            // Encode values ourselves so "+" and "&" inside values survive (URLComponents leaves "+" bare).
            var allowed = CharacterSet.urlQueryAllowed
            allowed.remove(charactersIn: "+&=?#")
            let pairs: [String] = query.map { item in
                let k = item.name.addingPercentEncoding(withAllowedCharacters: allowed) ?? item.name
                guard let v = item.value else { return k }
                let ev = v.addingPercentEncoding(withAllowedCharacters: allowed) ?? v
                return "\(k)=\(ev)"
            }
            comps.percentEncodedQuery = pairs.joined(separator: "&")
        }
        return comps.url
    }

    static func multipartBody(boundary: String, field: String, filename: String, mimeType: String, data: Data) -> Data {
        var body = Data()
        func append(_ s: String) {
            if let d = s.data(using: .utf8) { body.append(d) }
        }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(field)\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        append("\r\n--\(boundary)--\r\n")
        return body
    }
}
