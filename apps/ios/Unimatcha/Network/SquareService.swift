import Foundation

struct SquareService {
    static func listPosts(page: Int = 1, limit: Int = 20) async throws -> PostListResponse {
        return try await APIClient.shared.request(
            "/square/posts",
            queryParams: ["page": "\(page)", "limit": "\(limit)"]
        )
    }

    static func getPost(id: String) async throws -> CouplePost {
        return try await APIClient.shared.request("/square/posts/\(id)")
    }

    static func createPost(content: String, imageUrl: String? = nil) async throws -> CouplePost {
        struct Body: Encodable {
            let content: String
            let imageUrl: String?
        }
        return try await APIClient.shared.request(
            "/square/posts",
            method: .POST,
            body: Body(content: content, imageUrl: imageUrl)
        )
    }

    static func createComment(postId: String, content: String) async throws -> PostComment {
        struct Body: Encodable { let content: String }
        return try await APIClient.shared.request(
            "/square/posts/\(postId)/comments",
            method: .POST,
            body: Body(content: content)
        )
    }

    static func likePost(id: String) async throws -> GenericResponse {
        return try await APIClient.shared.request("/square/posts/\(id)/like", method: .POST)
    }
}
