import Foundation

// MARK: - SquareService (`/square/v2/*` feed half — api-square-events-social.md §2.2–§2.5, §2.7, §2.8) — WP-08
//
// Feed contract (PLAN §C.5, not negotiable): every feed request is `page=1&limit=20`, there is no
// load-more anywhere, pinned is unpaginated. Detail / comments / create / report live in WP-09's
// `SquareDetailService`.

enum SquareService {
    /// H5 always asks for the first page of 20 (server clamps `limit` to 1…50).
    static let page = 1
    static let limit = 20
    /// Server trims / collapses / truncates `q` to 64 characters; we pre-trim so a blank query never hits the network.
    static let maxQueryLength = 64

    private static var pageQuery: [URLQueryItem] {
        [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "limit", value: String(limit))]
    }

    /// `GET /square/v2/recommend?page=1&limit=20`
    static func recommend() async throws -> FeedPage {
        try await feed(path: "/square/v2/recommend", query: pageQuery)
    }

    /// `GET /square/v2/campus-wall?page=1&limit=20` — `needProfileSchool: true` when the viewer has no school.
    static func campusWall() async throws -> FeedPage {
        try await feed(path: "/square/v2/campus-wall", query: pageQuery)
    }

    /// `GET /square/v2/pinned` — no paging, ≤50, `needProfileSchool` when the viewer has no school.
    static func pinned() async throws -> FeedPage {
        try await feed(path: "/square/v2/pinned", query: [])
    }

    /// `GET /square/v2/search?q=&page=1&limit=20` (no `board` → both boards) → `{ query, posts }`.
    /// A blank query resolves locally to an empty result (the server would do the same).
    static func search(q: String) async throws -> SearchResponse {
        let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return SearchResponse(query: "", posts: FeedPage(items: [], page: page, limit: limit, total: 0, hasMore: false))
        }
        let query = String(trimmed.prefix(maxQueryLength))
        let endpoint = Endpoint.get("/square/v2/search", query: [URLQueryItem(name: "q", value: query)] + pageQuery)
        do {
            return try await APIClient.shared.request(endpoint)
        } catch APIError.emptyData {
            return SearchResponse(query: query, posts: FeedPage(items: []))
        }
    }

    /// `POST /square/v2/posts/:id/like` → `{ liked, likeCount?, message }` (no count today → caller ±1).
    static func like(postId: String) async throws -> LikeResult {
        try await APIClient.shared.request(Endpoint.post("/square/v2/posts/\(encoded(postId))/like"))
    }

    /// `POST /square/v2/posts/:id/vote { optionIndex }` → `{ pollOptions, myVote }`.
    static func vote(postId: String, optionIndex: Int) async throws -> VoteResult {
        try await APIClient.shared.request(Endpoint.post("/square/v2/posts/\(encoded(postId))/vote",
                                                         body: VoteRequest(optionIndex: optionIndex)))
    }

    // MARK: Helpers

    private static func feed(path: String, query: [URLQueryItem]) async throws -> FeedPage {
        do {
            return try await APIClient.shared.request(Endpoint.get(path, query: query))
        } catch APIError.emptyData {
            // `data: null` → treat as an empty page (never as a failure).
            return FeedPage(items: [], page: page, limit: limit, total: 0, hasMore: false)
        }
    }

    /// Ids are cuids (URL-safe) but escape defensively.
    static func encoded(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    }
}
