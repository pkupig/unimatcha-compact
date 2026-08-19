// Interface outline: implementation bodies removed.
import Foundation
struct SquareService {
    static func recommend(page: Int = 1, limit: Int = 20) async throws -> SquareFeedResponse
    static func campusWall(page: Int = 1, limit: Int = 20) async throws -> SquareFeedResponse
    static func post(id: String) async throws -> SquarePostDetail
    static func createPost(_ req: CreatePostRequest) async throws -> SquareCard
    static func like(id: String) async throws -> LikeResult
    static func comment(postId: String, content: String, parentCommentId: String? = nil, imageUrl: String? = nil) async throws -> SquareComment
    static func report(id: String, reason: String?) async throws -> ReportResult
    static func delete(id: String) async throws -> GenericResponse
