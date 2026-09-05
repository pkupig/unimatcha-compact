import Foundation

/// Transport / contract errors surfaced by `APIClient`. `message` is the server text verbatim
/// (English) so callers can toast `"Failed: \(e.message)"` exactly like the H5.
enum APIError: Error, LocalizedError {
    case invalidURL
    case network(Error)
    case decoding(Error)
    /// Non-2xx. `message` = server `message` (string or joined array) or `"API <status>"`.
    case http(status: Int, message: String)
    /// 401 on a non-public endpoint. The session has already been torn down by `APIClient.onUnauthorized`.
    case unauthorized(message: String)
    /// 2xx envelope whose `data` was null/absent.
    case emptyData

    /// User-facing text (server text verbatim where available).
    var message: String {
        switch self {
        case .invalidURL: return "Invalid request URL"
        case .network(let e):
            let ns = e as NSError
            if ns.domain == NSURLErrorDomain {
                switch ns.code {
                case NSURLErrorTimedOut: return "Request timed out"
                case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost: return "Network unavailable"
                case NSURLErrorCancelled: return "Request cancelled"
                default: break
                }
            }
            return e.localizedDescription
        case .decoding: return "Unexpected server response"
        case .http(_, let m): return m
        case .unauthorized(let m): return m.isEmpty ? "Unauthorized" : m
        case .emptyData: return "No data returned"
        }
    }

    var errorDescription: String? { message }

    /// HTTP status when the failure was a server response (nil for transport/decoding errors).
    var status: Int? {
        switch self {
        case .http(let s, _): return s
        case .unauthorized: return 401
        default: return nil
        }
    }

    /// `message ~ /not enough energy/i` — ticket purchase / enhanced start shortfall.
    var isNotEnoughEnergy: Bool {
        message.range(of: "not enough energy", options: .caseInsensitive) != nil
    }

    /// `message ~ /already matching/i` — also used on a 200 `message` (see `MatchingService.start`).
    var isAlreadyMatching: Bool {
        APIError.isAlreadyMatching(text: message)
    }

    /// Same regex applied to any text (a 200 envelope `message`, for instance).
    static func isAlreadyMatching(text: String?) -> Bool {
        guard let t = text else { return false }
        return t.range(of: "already matching", options: .caseInsensitive) != nil
    }

    /// Whether this error is the session-expiry path (callers usually stay silent for it).
    var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        return false
    }

    /// Convenience for `catch` blocks that receive an untyped `Error`.
    static func message(of error: Error) -> String {
        if let e = error as? APIError { return e.message }
        return error.localizedDescription
    }
}
