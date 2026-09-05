import Foundation

// MARK: - Post detail models (api-square-events-social.md §1.2, §1.4, §2.1, §2.9–§2.11; h5-square.md §1.5) — WP-09
//
// `SquarePostDetail` = `shapePost(post)` (the same shape as a feed card, minus `cardType` /
// `sameSchool` / `commentSnippet`) **plus** `myLiked`, `myVote` and `comments[]`. It therefore wraps
// a `SquarePostCard` (WP-08) so every derived rule — card kind, official badge, author display,
// poll/event helpers — is shared with the feed instead of being re-implemented here.
//
// Privacy rules that must not be softened (api-square §10.1, h5-square gotcha 1):
//   • anonymous posts carry no `authorUserId` / `authorUser`; identity comes from `aliasSeed` only
//   • anonymous comments carry no `userId`; `user.profile.nickname` is the server's English alias
//   • the "Author" tag is decided by `anonymousAuthorToken` equality on anonymous posts and by
//     `userId == authorUserId` on normal posts — the two are never mixed and never fall back

/// `comment.user` — `{ profile: { nickname, avatarUrl } }`; there is never a `user.id`.
/// H5 also reads a flat `user.nickname` as a second fallback, so it is decoded too.
struct SquareCommentUser: Decodable, Equatable {
    var profile: SquareAuthorProfile?
    var nickname: String?

    init(profile: SquareAuthorProfile? = nil, nickname: String? = nil) {
        self.profile = profile
        self.nickname = nickname
    }

    private enum CodingKeys: String, CodingKey { case profile, nickname }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        profile = c.lenient(SquareAuthorProfile.self, .profile)
        nickname = c.lenient(String.self, .nickname)
    }
}

// MARK: - SquareComment

struct SquareComment: Decodable, Identifiable, Equatable {
    var id: String
    var postId: String?
    var userId: String?                 // absent on anonymous comments
    var content: String                 // may be "" (image-only comment)
    var imageUrl: String?
    var anonymous: Bool
    var parentCommentId: String?
    var createdAt: String
    var updatedAt: String?
    var user: SquareCommentUser?
    var anonymousAuthor: AnonymousAuthor?
    var anonymousAuthorToken: String?   // only on the post author's own anonymous comments
    var likeCount: Int
    var myLiked: Bool
    var replies: [SquareComment]        // one level deep only

    init(id: String,
         postId: String? = nil,
         userId: String? = nil,
         content: String = "",
         imageUrl: String? = nil,
         anonymous: Bool = false,
         parentCommentId: String? = nil,
         createdAt: String = "",
         updatedAt: String? = nil,
         user: SquareCommentUser? = nil,
         anonymousAuthor: AnonymousAuthor? = nil,
         anonymousAuthorToken: String? = nil,
         likeCount: Int = 0,
         myLiked: Bool = false,
         replies: [SquareComment] = []) {
        self.id = id
        self.postId = postId
        self.userId = userId
        self.content = content
        self.imageUrl = imageUrl
        self.anonymous = anonymous
        self.parentCommentId = parentCommentId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.user = user
        self.anonymousAuthor = anonymousAuthor
        self.anonymousAuthorToken = anonymousAuthorToken
        self.likeCount = likeCount
        self.myLiked = myLiked
        self.replies = replies
    }

    private enum CodingKeys: String, CodingKey {
        case id, postId, userId, content, imageUrl, anonymous, parentCommentId, createdAt, updatedAt,
             user, anonymousAuthor, anonymousAuthorToken, likeCount, myLiked, replies
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        postId = c.lenient(String.self, .postId)
        userId = c.lenient(String.self, .userId)
        content = c.lenient(String.self, .content) ?? ""
        imageUrl = c.lenient(String.self, .imageUrl)
        anonymous = c.lenientBool(.anonymous) ?? false
        parentCommentId = c.lenient(String.self, .parentCommentId)
        createdAt = c.lenient(String.self, .createdAt) ?? ""
        updatedAt = c.lenient(String.self, .updatedAt)
        user = c.lenient(SquareCommentUser.self, .user)
        anonymousAuthor = c.lenient(AnonymousAuthor.self, .anonymousAuthor)
        anonymousAuthorToken = c.lenient(String.self, .anonymousAuthorToken)
        likeCount = max(0, c.lenientInt(.likeCount) ?? 0)
        myLiked = c.lenientBool(.myLiked) ?? false
        if var nested = try? c.nestedUnkeyedContainer(forKey: .replies) {
            replies = SquareComment.decodeList(&nested)
        } else {
            replies = []
        }
    }

    /// Decodes every comment it can; a malformed element never fails the whole thread.
    static func decodeList(_ c: inout UnkeyedDecodingContainer) -> [SquareComment] {
        var out: [SquareComment] = []
        while !c.isAtEnd {
            if let entry = try? c.decode(CommentEntry.self) {
                if let cm = entry.comment, !cm.id.isEmpty { out.append(cm) }
                continue
            }
            if (try? c.decodeNil()) == true { continue }
            break
        }
        return out
    }

    // MARK: Display

    /// `cm.anonymous ? cm.anonymousAuthor?.aliasSeed : null` — anonymous identity source.
    var aliasSeed: UInt32? { anonymous ? anonymousAuthor?.aliasSeed : nil }

    /// Alias name from the seed (language-dependent) or `nickname || user.nickname || "User"`.
    var displayName: String {
        if let seed = aliasSeed { return Alias.name(seed: seed, fallback: anonymousAuthor?.nickname) }
        let candidates: [String?] = [user?.profile?.nickname, user?.nickname]
        if let n = candidates.compactMap({ $0?.trimmingCharacters(in: .whitespacesAndNewlines) }).first(where: { !$0.isEmpty }) {
            return n
        }
        return L10n.pick(AuthorDisplay.userFallback, "用户")
    }

    /// Anonymous comments never show a real avatar (the server sends `avatarUrl: null` anyway).
    var displayAvatarUrl: String? { anonymous ? nil : user?.profile?.avatarUrl }

    /// The reply label uses the tapped comment's nickname; anonymous targets get the alias (D17).
    var replyLabelName: String { displayName }

    var hasContent: Bool { !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

private struct CommentEntry: Decodable {
    let comment: SquareComment?
    init(from decoder: Decoder) throws { comment = try? SquareComment(from: decoder) }
}

// MARK: - Author tag key (h5-square §1.5 "Author tag rule", api-square §1.5)

/// How the post author's own comments are recognised. Anonymous posts use the per-post opaque
/// token (the real `authorUserId` is stripped server-side); normal posts use `authorUserId`.
/// A missing credential means **nobody** gets the badge — never fall back across the two.
enum CommentAuthorKey: Equatable {
    case token(String?)
    case userId(String?)

    static func of(_ post: SquarePostCard) -> CommentAuthorKey {
        post.anonymous ? .token(post.anonymousAuthorToken) : .userId(post.authorUserId)
    }

    func isAuthor(_ comment: SquareComment) -> Bool {
        switch self {
        case .token(let v):
            guard let v = v, !v.isEmpty else { return false }
            return comment.anonymousAuthorToken == v
        case .userId(let v):
            guard let v = v, !v.isEmpty else { return false }
            return comment.userId == v
        }
    }
}

// MARK: - SquarePostDetail

struct SquarePostDetail: Decodable, Equatable {
    /// Every card field (incl. `myLiked` / `myVote`, which the detail always carries).
    var post: SquarePostCard
    /// Top-level comments ascending by `createdAt`, each with its one-level `replies`.
    var comments: [SquareComment]

    init(post: SquarePostCard, comments: [SquareComment] = []) {
        self.post = post
        self.comments = comments
    }

    private enum CodingKeys: String, CodingKey { case comments }

    init(from decoder: Decoder) throws {
        post = try SquarePostCard(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if var nested = try? c.nestedUnkeyedContainer(forKey: .comments) {
            comments = SquareComment.decodeList(&nested)
        } else {
            comments = []
        }
    }

    var id: String { post.id }

    /// `post.commentCount != null ? post.commentCount : Σ(1 + replies)` — the stored counter wins
    /// (it counts top-level + replies server-side); the walk is the fallback for a bare payload.
    var commentTotal: Int {
        post.commentCount > 0 ? post.commentCount : comments.reduce(0) { $0 + 1 + $1.replies.count }
    }

    var authorKey: CommentAuthorKey { CommentAuthorKey.of(post) }

    var isLiked: Bool { post.myLiked == true }

    /// Resolves a comment (top level or reply) by id.
    func comment(id: String) -> SquareComment? {
        for cm in comments {
            if cm.id == id { return cm }
            if let r = cm.replies.first(where: { $0.id == id }) { return r }
        }
        return nil
    }

    /// The top-level comment id a reply target belongs to (`parentCommentId` is always top level).
    func topLevelId(for commentId: String) -> String {
        if comments.contains(where: { $0.id == commentId }) { return commentId }
        if let owner = comments.first(where: { cm in cm.replies.contains(where: { $0.id == commentId }) }) {
            return owner.id
        }
        return commentId
    }

    /// In-place like patch on the comment tree (parent + replies), keeping scroll position.
    mutating func applyCommentLike(id: String, liked: Bool, likeCount: Int) {
        for i in comments.indices {
            if comments[i].id == id {
                comments[i].myLiked = liked
                comments[i].likeCount = max(0, likeCount)
                return
            }
            for j in comments[i].replies.indices where comments[i].replies[j].id == id {
                comments[i].replies[j].myLiked = liked
                comments[i].replies[j].likeCount = max(0, likeCount)
                return
            }
        }
    }
}

// MARK: - Requests (nil optionals are omitted — `forbidNonWhitelisted`, api-square §10.9)

/// `POST /square/v2/posts/:id/comments` — `{content, anonymous, imageUrl?, parentCommentId?}`.
struct CreateCommentRequest: Encodable, Equatable {
    var content: String                 // ≤500, may be "" when an image is attached
    var anonymous: Bool
    var imageUrl: String?
    var parentCommentId: String?        // always a TOP-LEVEL comment id

    static let maxLength = 500
}

/// `POST /square/v2/posts` — `CreatePostDto`.
struct CreatePostRequest: Encodable, Equatable {
    var board: String                   // "recommend" | "campus_wall" (lowercase on the wire)
    var content: String                 // ≤2000
    var images: [String]                // ≤4 absolute URLs
    var anonymous: Bool
    var title: String?                  // ≤100, omitted when blank
    var postType: String?               // "poll" only (normal posts omit it)
    var pollOptions: [String]?          // 2…6, each ≤50

    static let maxTitle = 100
    static let maxContent = 2000
    static let maxImages = 4
    static let minPollOptions = 2
    static let maxPollOptions = 6
    static let maxPollOptionLength = 50
}

/// `POST /square/v2/posts/:id/report` — `{reason?}` (≤200).
struct ReportPostRequest: Encodable, Equatable {
    var reason: String?
    static let maxReason = 200
}

// MARK: - Responses

/// `{reported, reporterCount, hidden, message}`.
struct ReportPostResult: Decodable, Equatable {
    var reported: Bool
    var reporterCount: Int
    var hidden: Bool
    var message: String?

    init(reported: Bool = false, reporterCount: Int = 0, hidden: Bool = false, message: String? = nil) {
        self.reported = reported
        self.reporterCount = reporterCount
        self.hidden = hidden
        self.message = message
    }

    private enum CodingKeys: String, CodingKey { case reported, reporterCount, hidden, message }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reported = c.lenientBool(.reported) ?? false
        reporterCount = c.lenientInt(.reporterCount) ?? 0
        hidden = c.lenientBool(.hidden) ?? false
        message = c.lenient(String.self, .message)
    }
}

/// `POST /square/v2/comments/:id/like` → `{liked, likeCount}` (authoritative count, unlike posts).
struct CommentLikeResult: Decodable, Equatable {
    var liked: Bool
    var likeCount: Int

    init(liked: Bool, likeCount: Int) {
        self.liked = liked
        self.likeCount = likeCount
    }

    private enum CodingKeys: String, CodingKey { case liked, likeCount }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        liked = c.lenientBool(.liked) ?? false
        likeCount = max(0, c.lenientInt(.likeCount) ?? 0)
    }
}
