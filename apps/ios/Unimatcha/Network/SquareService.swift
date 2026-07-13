import Foundation

struct SquareService {
    static func recommend(page: Int = 1, limit: Int = 20) async throws -> SquareFeedResponse {
        try await APIClient.shared.request("/square/v2/recommend", queryParams: ["page": "\(page)", "limit": "\(limit)"])
    }
    static func campusWall(page: Int = 1, limit: Int = 20) async throws -> SquareFeedResponse {
        try await APIClient.shared.request("/square/v2/campus-wall", queryParams: ["page": "\(page)", "limit": "\(limit)"])
    }
    static func post(id: String) async throws -> SquarePostDetail {
        try await APIClient.shared.request("/square/v2/posts/\(id)")
    }
    static func createPost(_ req: CreatePostRequest) async throws -> SquareCard {
        try await APIClient.shared.request("/square/v2/posts", method: .POST, body: req)
    }
    static func like(id: String) async throws -> LikeResult {
        try await APIClient.shared.request("/square/v2/posts/\(id)/like", method: .POST)
    }
    static func comment(postId: String, content: String, parentCommentId: String? = nil, imageUrl: String? = nil) async throws -> SquareComment {
        try await APIClient.shared.request("/square/v2/posts/\(postId)/comments", method: .POST,
            body: CreateCommentRequest(content: content, imageUrl: imageUrl, parentCommentId: parentCommentId))
    }
    static func report(id: String, reason: String?) async throws -> ReportResult {
        try await APIClient.shared.request("/square/v2/posts/\(id)/report", method: .POST, body: ReportRequest(reason: reason))
    }
    @discardableResult
    static func delete(id: String) async throws -> GenericResponse {
        try await APIClient.shared.send("/square/v2/posts/\(id)", method: .DELETE)
    }
}
