import Foundation

// MARK: - SquareDetailService (`/square/v2/*` detail half — api-square-events-social.md §2.1, §2.6, §2.9–§2.11) — WP-09
//
// Feeds / like / vote live in WP-08's `SquareService`; this owns the detail payload, comments,
// comment likes, post reports and post creation (the new-post overlay is WP-09's screen).
// `DELETE /square/v2/posts/:id` exists on the server but has **no UI** (H5 parity) and is not wrapped.

enum SquareDetailService {
    /// `GET /square/v2/posts/:id` → `SquarePostDetail`. 404 when the post is unknown, hidden or a
    /// non-approved poll the viewer does not own.
    static func detail(postId: String) async throws -> SquarePostDetail {
        try await APIClient.shared.request(Endpoint.get("/square/v2/posts/\(SquareService.encoded(postId))"))
    }

    /// `POST /square/v2/posts/:id/comments` → the created comment (no `likeCount` / `myLiked` /
    /// `replies`; H5 reloads the whole detail afterwards, so the return value is advisory).
    @discardableResult
    static func createComment(postId: String, request: CreateCommentRequest) async throws -> SquareComment? {
        do {
            let created: SquareComment = try await APIClient.shared.request(
                Endpoint.post("/square/v2/posts/\(SquareService.encoded(postId))/comments", body: request))
            return created
        } catch APIError.emptyData {
            return nil
        } catch APIError.decoding {
            // The comment was created; only the echo failed to decode (the detail reload is the truth).
            return nil
        }
    }

    /// `POST /square/v2/comments/:id/like` → `{liked, likeCount}`.
    static func likeComment(commentId: String) async throws -> CommentLikeResult {
        try await APIClient.shared.request(Endpoint.post("/square/v2/comments/\(SquareService.encoded(commentId))/like"))
    }

    /// `POST /square/v2/posts/:id/report {reason?}` → `{reported, reporterCount, hidden, message}`.
    /// Idempotent per (post, user); ≥3 distinct reporters auto-hide the post.
    @discardableResult
    static func reportPost(postId: String, reason: String?) async throws -> ReportPostResult {
        let trimmed = reason?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = ReportPostRequest(reason: (trimmed?.isEmpty ?? true) ? nil
                                     : String(trimmed!.prefix(ReportPostRequest.maxReason)))
        do {
            return try await APIClient.shared.request(
                Endpoint.post("/square/v2/posts/\(SquareService.encoded(postId))/report", body: body))
        } catch APIError.emptyData {
            return ReportPostResult(reported: true)
        }
    }

    /// `POST /square/v2/posts` → the created `SquarePostCard` (H5 ignores it and reloads the board).
    @discardableResult
    static func createPost(_ request: CreatePostRequest) async throws -> SquarePostCard? {
        do {
            let card: SquarePostCard = try await APIClient.shared.request(Endpoint.post("/square/v2/posts", body: request))
            return card
        } catch APIError.emptyData {
            return nil
        } catch APIError.decoding {
            return nil
        }
    }

    /// Comment reports have no dedicated endpoint (api-square §2.13): they go to `POST /reports`
    /// with `category: content` and a structured body the moderation queue can locate.
    static func reportComment(commentId: String, postId: String, reason: String, text: String) async throws {
        let snippet = String(text.prefix(300))
        let content = "[comment] commentId=\(commentId) postId=\(postId)\nreason: \(String(reason.prefix(500)))\ntext: \(snippet)"
        try await ReportService.submit(category: .content, content: content, contact: nil)
    }
}
