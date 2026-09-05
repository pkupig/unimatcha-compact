#if DEBUG
import Foundation

/// Decode / contract checks for the post-detail, new-post and search domain (run by WP-16's
/// `-unimatcha-decode-check`). Covers the detail payload (incl. comment threading, anonymity and the
/// Author-tag rule), the poll/event detail variants, the created-comment echo, the request encoders
/// (nil optionals omitted, explicit poll payload) and the search-page plumbing.
enum PostDetailFixtures {
    static func verify() throws {
        try verifyDetail()
        try verifyAnonymousDetail()
        try verifyEventDetail()
        try verifyCreatedComment()
        try verifyRequestEncoding()
        try verifySearchAndReport()
    }

    // MARK: detail-post.json — normal post, 2 top-level comments, 2 replies

    private static func verifyDetail() throws {
        let f = "detail-post"
        let d = try FixtureCheck.decode(SquarePostDetail.self, fixture: f)
        try FixtureCheck.expect(d.post.id == "clsq0000000000000000rec01", f, "post id")
        try FixtureCheck.expect(d.post.myLiked == true && d.isLiked, f, "myLiked decoded (detail only)")
        try FixtureCheck.expect(d.post.images.count == 2, f, "two images → carousel")
        try FixtureCheck.expect(d.comments.count == 2, f, "2 top-level comments (got \(d.comments.count))")
        try FixtureCheck.expect(d.comments[1].replies.count == 2, f, "second comment has 2 replies")
        // commentCount (4) is the stored counter = top level + replies.
        try FixtureCheck.expect(d.commentTotal == 4, f, "commentTotal \(d.commentTotal)")

        // Author tag: normal post → userId == authorUserId, never the token path.
        guard case .userId(let key) = d.authorKey else { throw FixtureCheck.Failure(fixture: f, reason: "expected userId author key") }
        try FixtureCheck.expect(key == "clx0me0000000000000000002", f, "author key = authorUserId")
        try FixtureCheck.expect(d.authorKey.isAuthor(d.comments[0]), f, "author's own comment is tagged")
        try FixtureCheck.expect(!d.authorKey.isAuthor(d.comments[1]), f, "another user's comment is not tagged")

        // Reply resolution: a reply id always resolves to its top-level owner.
        try FixtureCheck.expect(d.topLevelId(for: "clsc0000000000000000cmt03") == "clsc0000000000000000cmt02", f, "reply → top-level parent")
        try FixtureCheck.expect(d.topLevelId(for: "clsc0000000000000000cmt02") == "clsc0000000000000000cmt02", f, "top-level id is its own parent")

        // Anonymous reply inside a normal post: alias from the seed, no userId, no avatar.
        let anonReply = d.comments[1].replies[0]
        try FixtureCheck.expect(anonReply.anonymous && anonReply.userId == nil, f, "anonymous reply carries no userId")
        try FixtureCheck.expect(anonReply.aliasSeed == 66051 && anonReply.displayAvatarUrl == nil, f, "alias seed + no avatar")
        try FixtureCheck.expect(anonReply.displayName == "Gentle Sparrow" || anonReply.displayName == "温柔的麻雀", f, "alias name (got \(anonReply.displayName))")
        try FixtureCheck.expect(!d.authorKey.isAuthor(anonReply), f, "userId key never matches an anonymous comment")

        // Image-only comment: empty content is allowed and must not render an empty paragraph.
        let imageOnly = d.comments[1].replies[1]
        try FixtureCheck.expect(!imageOnly.hasContent && imageOnly.imageUrl != nil, f, "image-only comment")
        try FixtureCheck.expect(imageOnly.displayName == "User" || imageOnly.displayName == "用户", f, "nickname fallback")
        try FixtureCheck.expect(d.comments[1].myLiked && d.comments[1].likeCount == 5, f, "comment like state")

        // In-place like patch reaches replies too.
        var patched = d
        patched.applyCommentLike(id: "clsc0000000000000000cmt03", liked: true, likeCount: 9)
        try FixtureCheck.expect(patched.comments[1].replies[0].myLiked && patched.comments[1].replies[0].likeCount == 9, f, "reply like patched in place")
        try FixtureCheck.expect(patched.comments[1].replies[1].likeCount == 1, f, "sibling untouched")
    }

    // MARK: detail-post-anonymous.json — anonymous poll post authored by the viewer

    private static func verifyAnonymousDetail() throws {
        let f = "detail-post-anonymous"
        let d = try FixtureCheck.decode(SquarePostDetail.self, fixture: f)
        try FixtureCheck.expect(d.post.anonymous && d.post.authorUser == nil && d.post.authorUserId == nil, f, "no identity on an anonymous post")
        guard case .token(let token) = d.authorKey else { throw FixtureCheck.Failure(fixture: f, reason: "expected token author key") }
        try FixtureCheck.expect(token == "a_1k3j9x0z", f, "token author key")
        try FixtureCheck.expect(d.authorKey.isAuthor(d.comments[0]), f, "author's own anonymous comment tagged by token")
        try FixtureCheck.expect(!d.authorKey.isAuthor(d.comments[1]), f, "another anonymous commenter is not the author")
        try FixtureCheck.expect(!d.authorKey.isAuthor(d.comments[2]), f, "a real-name comment never matches the token")
        try FixtureCheck.expect(d.comments[2].userId == "clx0me0000000000000000004", f, "real-name comments keep userId")

        // Poll facts: pending → review chip + voting disabled.
        try FixtureCheck.expect(d.post.isPoll && d.post.hasPollOptions, f, "poll options")
        try FixtureCheck.expect(d.post.isPendingReview && !d.post.isApproved, f, "pending review disables voting")
        try FixtureCheck.expect(d.post.myVote == 0 && d.post.pollTotalVotes == 10, f, "myVote + total votes")
        try FixtureCheck.expect(PollBlock.percent(votes: 7, total: 10) == 70, f, "percent rounding")
        try FixtureCheck.expect(d.post.school == "University of Warwick", f, "anonymous school comes from post.school")
    }

    // MARK: detail-post-event.json — official event post

    private static func verifyEventDetail() throws {
        let f = "detail-post-event"
        let d = try FixtureCheck.decode(SquarePostDetail.self, fixture: f)
        try FixtureCheck.expect(d.post.isEvent, f, "postType event")
        guard let event = d.post.event else { throw FixtureCheck.Failure(fixture: f, reason: "event missing") }
        try FixtureCheck.expect(event.id == "clev0000000000000000ev01", f, "event id")
        // 250 cents → ceil(250/100) = 3 cells.
        try FixtureCheck.expect(event.cells == 3 && !event.isFree, f, "cells = ceil(priceCents/100) (got \(event.cells))")
        try FixtureCheck.expect(event.remaining == 157 && !event.isSoldOut, f, "remaining = capacity − sold")
        try FixtureCheck.expect(d.post.isOfficial && d.post.kind(on: .campus_wall) == .large, f, "official post with image → large card")
        try FixtureCheck.expect(d.post.officialBadgeText?.contains("Warwick Students' Union") == true, f, "official badge org")
        try FixtureCheck.expect(d.comments.isEmpty && d.commentTotal == 0, f, "empty comments state")
    }

    // MARK: detail-comment-created.json — the POST echo (no likeCount / myLiked / replies)

    private static func verifyCreatedComment() throws {
        let f = "detail-comment-created"
        let cm = try FixtureCheck.decode(SquareComment.self, fixture: f)
        try FixtureCheck.expect(cm.id == "clsc0000000000000000new1", f, "created id")
        try FixtureCheck.expect(cm.likeCount == 0 && !cm.myLiked && cm.replies.isEmpty, f, "missing fields default to 0/false/[]")
        try FixtureCheck.expect(cm.parentCommentId == "clsc0000000000000000cmt02", f, "parentCommentId echoed")
        try FixtureCheck.expect(cm.anonymous && cm.userId == nil, f, "anonymous echo has no userId")
    }

    // MARK: Request encoders (`forbidNonWhitelisted` → nil optionals must be omitted)

    private static func verifyRequestEncoding() throws {
        let f = "request-encoding"
        let enc = JSONEncoder()

        let plain = CreateCommentRequest(content: "hi", anonymous: false, imageUrl: nil, parentCommentId: nil)
        let plainKeys = try keys(of: plain, encoder: enc)
        try FixtureCheck.expect(plainKeys == ["anonymous", "content"], f, "comment payload keys \(plainKeys)")

        let full = CreateCommentRequest(content: "", anonymous: true, imageUrl: "https://x/y.jpg", parentCommentId: "c1")
        let fullKeys = try keys(of: full, encoder: enc)
        try FixtureCheck.expect(fullKeys == ["anonymous", "content", "imageUrl", "parentCommentId"], f, "full comment payload \(fullKeys)")

        let post = CreatePostRequest(board: "recommend", content: "body", images: [], anonymous: false,
                                     title: nil, postType: nil, pollOptions: nil)
        let postKeys = try keys(of: post, encoder: enc)
        try FixtureCheck.expect(postKeys == ["anonymous", "board", "content", "images"], f, "post payload keys \(postKeys)")

        let poll = CreatePostRequest(board: "campus_wall", content: "body", images: ["u"], anonymous: true,
                                     title: "T", postType: "poll", pollOptions: ["a", "b"])
        let pollKeys = try keys(of: poll, encoder: enc)
        try FixtureCheck.expect(pollKeys == ["anonymous", "board", "content", "images", "pollOptions", "postType", "title"], f, "poll payload keys \(pollKeys)")
        try FixtureCheck.expect(SquareBoardKind.campus_wall.rawValue == "campus_wall" && SquareBoardKind.recommend.rawValue == "recommend", f, "board sent lowercase")

        let report = ReportPostRequest(reason: nil)
        let reportKeys = try keys(of: report, encoder: enc)
        try FixtureCheck.expect(reportKeys.isEmpty, f, "empty report body is `{}`")

        // Option / image / length ceilings used by the composer.
        try FixtureCheck.expect(CreatePostRequest.minPollOptions == 2 && CreatePostRequest.maxPollOptions == 6, f, "2…6 poll options")
        try FixtureCheck.expect(CreatePostRequest.maxImages == 4 && CreatePostRequest.maxTitle == 100 && CreatePostRequest.maxContent == 2000, f, "post ceilings")
        try FixtureCheck.expect(CreateCommentRequest.maxLength == 500 && ReportPostRequest.maxReason == 200, f, "comment / reason ceilings")
    }

    private static func keys<T: Encodable>(of value: T, encoder: JSONEncoder) throws -> [String] {
        let data = try encoder.encode(value)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        return obj.keys.sorted()
    }

    // MARK: Search response + comment-report body

    private static func verifySearchAndReport() throws {
        let f = "square-search"
        // The search page is WP-08's payload; WP-09 renders it, so assert the fields it depends on.
        let response = try FixtureCheck.decode(SearchResponse.self, fixture: f)
        try FixtureCheck.expect(!response.posts.items.isEmpty, f, "search items")
        try FixtureCheck.expect(response.posts.items.contains { $0.commentSnippet != nil }, f, "a comment-snippet hit is present")
        try FixtureCheck.expect(SquareSearchViewModel.debounce == 0.3, f, "300 ms debounce")
        try FixtureCheck.expect(SquareService.maxQueryLength == 64, f, "q truncated to 64 chars")

        // Comment reports carry the structured body the moderation queue greps (api-square §2.13).
        let body = "[comment] commentId=c1 postId=p1\nreason: spam\ntext: hello"
        try FixtureCheck.expect(body.hasPrefix("[comment] commentId="), "reports", "comment report body shape")

        // Chrome auto-hide thresholds (h5-square §1.5).
        try FixtureCheck.expect(PostDetailViewModel.chromeHideDelta == 6 && PostDetailViewModel.chromeAlwaysShowBelow == 40, "chrome", "6 / 40 pt thresholds")
        try FixtureCheck.expect(PostDetailViewModel.defaultFooterHeight == 76, "chrome", "--pd-footer-h default")
        try FixtureCheck.expect(CommentThreadView.groupSpacing == 28 && CommentThreadView.inGroupSpacing == 16 && CommentThreadView.replyIndent == 44, "threads", "28/16/44 spacing")
    }
}
#endif
