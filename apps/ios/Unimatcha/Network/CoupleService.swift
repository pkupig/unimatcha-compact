import Foundation

struct CoupleService {
    static func getSpace(matchId: String) async throws -> CoupleSpace {
        try await APIClient.shared.request("/couple/\(matchId)")
    }
    @discardableResult
    static func setCover(matchId: String, imageUrl: String?) async throws -> CoupleSpace {
        try await APIClient.shared.request("/couple/\(matchId)/cover", method: .PUT, body: CoupleCoverRequest(imageUrl: imageUrl))
    }
    @discardableResult
    static func loveYou(matchId: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/couple/\(matchId)/love-you")
    }
    @discardableResult
    static func setStatus(matchId: String, status: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/couple/\(matchId)/status", method: .PUT, body: CoupleStatusRequest(status: status))
    }
    @discardableResult
    static func setCraving(matchId: String, text: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/couple/\(matchId)/craving", body: CoupleTextRequest(text: text))
    }
    @discardableResult
    static func addBucket(matchId: String, text: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/couple/\(matchId)/bucket", body: CoupleBucketRequest(text: text))
    }
    @discardableResult
    static func toggleBucket(matchId: String, id: String, done: Bool, note: String? = nil) async throws -> GenericResponse {
        try await APIClient.shared.send("/couple/\(matchId)/bucket/\(id)", method: .PATCH, body: CoupleBucketToggleRequest(done: done, note: note))
    }
    @discardableResult
    static func addAnniversary(matchId: String, title: String, date: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/couple/\(matchId)/anniversary", body: CoupleAnniversaryRequest(title: title, date: date))
    }
}
