import Foundation
import SwiftUI

// MARK: - Square models (api-square-events-social.md §1.1, §1.3, §1.5, §2.2–§2.8; h5-square.md §1.3, §3) — WP-08
//
// `SquarePostCard` is the item of recommend / campus-wall / pinned / search (and the base of WP-09's
// detail). Every field is decoded leniently (the backend spreads Prisma columns, so shapes drift
// between feeds, search, create-post and detail) and every enum-ish string is compared
// case-insensitively (`board` arrives UPPERCASE, is sent lowercase — api-square gotcha 3).

/// `{ text, votes }` — one poll option, votes precomputed by the server.
struct PollOption: Decodable, Equatable, Hashable {
    var text: String
    var votes: Int

    init(text: String, votes: Int) {
        self.text = text
        self.votes = votes
    }

    private enum CodingKeys: String, CodingKey { case text, votes }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = c.lenient(String.self, .text) ?? ""
        votes = max(0, c.lenientInt(.votes) ?? 0)
    }
}

/// `{ aliasSeed: uint32, nickname: string, avatarUrl: null }` — only on anonymous user posts/comments.
/// The name/avatar are computed client-side from the seed (language-dependent); `nickname` is the
/// server's English alias, kept as a fallback when the seed is missing.
struct AnonymousAuthor: Decodable, Equatable {
    var aliasSeed: UInt32?
    var nickname: String?
    var avatarUrl: String?

    init(aliasSeed: UInt32?, nickname: String? = nil, avatarUrl: String? = nil) {
        self.aliasSeed = aliasSeed
        self.nickname = nickname
        self.avatarUrl = avatarUrl
    }

    private enum CodingKeys: String, CodingKey { case aliasSeed, nickname, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let d = c.lenientDouble(.aliasSeed) {
            aliasSeed = Alias.seed(from: d)
        } else if let s = c.lenient(String.self, .aliasSeed) {
            aliasSeed = Alias.seed(from: s)
        } else {
            aliasSeed = nil
        }
        nickname = c.lenient(String.self, .nickname)
        avatarUrl = c.lenient(String.self, .avatarUrl)
    }
}

/// `authorUser.profile` / `match.userA.profile` projection: `{ nickname, avatarUrl, school }`.
struct SquareAuthorProfile: Decodable, Equatable {
    var nickname: String?
    var avatarUrl: String?
    var school: String?

    init(nickname: String? = nil, avatarUrl: String? = nil, school: String? = nil) {
        self.nickname = nickname
        self.avatarUrl = avatarUrl
        self.school = school
    }

    private enum CodingKeys: String, CodingKey { case nickname, avatarUrl, school }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nickname = c.lenient(String.self, .nickname)
        avatarUrl = c.lenient(String.self, .avatarUrl)
        school = c.lenient(String.self, .school)
    }
}

/// `authorUser: { id, profile }` — `null` for anonymous user posts and official posts.
struct SquareAuthorUser: Decodable, Equatable {
    var id: String?
    var profile: SquareAuthorProfile?

    init(id: String? = nil, profile: SquareAuthorProfile? = nil) {
        self.id = id
        self.profile = profile
    }

    private enum CodingKeys: String, CodingKey { case id, profile }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id)
        profile = c.lenient(SquareAuthorProfile.self, .profile)
    }
}

/// `admin: { id, name, organizationName, role }` — official posts only.
struct SquareAdmin: Decodable, Equatable {
    var id: String?
    var name: String?
    var organizationName: String?
    var role: String?

    init(id: String? = nil, name: String? = nil, organizationName: String? = nil, role: String? = nil) {
        self.id = id
        self.name = name
        self.organizationName = organizationName
        self.role = role
    }

    private enum CodingKeys: String, CodingKey { case id, name, organizationName, role }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id)
        name = c.lenient(String.self, .name)
        organizationName = c.lenient(String.self, .organizationName)
        role = c.lenient(String.self, .role)
    }
}

/// Legacy couple post `match: { userA: { profile }, userB: { profile } }` → stacked avatars.
struct SquareCoupleMatch: Decodable, Equatable {
    struct Side: Decodable, Equatable {
        var profile: SquareAuthorProfile?

        init(profile: SquareAuthorProfile? = nil) { self.profile = profile }

        private enum CodingKeys: String, CodingKey { case profile }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            profile = c.lenient(SquareAuthorProfile.self, .profile)
        }
    }

    var userA: Side?
    var userB: Side?

    init(userA: Side? = nil, userB: Side? = nil) {
        self.userA = userA
        self.userB = userB
    }

    private enum CodingKeys: String, CodingKey { case userA, userB }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userA = c.lenient(Side.self, .userA)
        userB = c.lenient(Side.self, .userB)
    }
}

/// `_count: { likes, comments }` — live aggregates the UI ignores (kept for completeness).
struct SquareCounts: Decodable, Equatable {
    var likes: Int?
    var comments: Int?

    init(likes: Int? = nil, comments: Int? = nil) {
        self.likes = likes
        self.comments = comments
    }

    private enum CodingKeys: String, CodingKey { case likes, comments }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        likes = c.lenientInt(.likes)
        comments = c.lenientInt(.comments)
    }
}

/// How a post renders in a feed (`kindOf` in square.js).
enum SquareCardKind: Equatable {
    case small      // half width: image or ivory highlighter text tile
    case wide       // full width campus-wall card
    case large      // full width official card with image
    case text       // full width official card without image

    var isFullWidth: Bool { self != .small }
}

// MARK: - SquarePostCard

struct SquarePostCard: Decodable, Identifiable, Equatable {
    var id: String
    var board: String                       // "RECOMMEND" | "CAMPUS_WALL" (uppercase)
    var authorType: String                  // "USER" | "STUDENT_UNION" | "TEAM" | "SPONSOR"
    var authorUserId: String?               // absent on anonymous user posts; null for official
    var authorUser: SquareAuthorUser?       // null when anonymous / official
    var adminId: String?
    var admin: SquareAdmin?
    var school: String?
    var coupleMatchId: String?
    var title: String?
    var content: String
    var images: [String]
    var likeCount: Int
    var commentCount: Int
    var anonymous: Bool
    var isSponsored: Bool
    var postType: String                    // "normal" | "poll" | "event"
    var pollOptions: [PollOption]?
    var myVote: Int?                        // poll posts only (null = not voted)
    var reviewStatus: String                // "approved" | "pending" | "rejected"
    var reviewedByAdminId: String?
    var reviewedAt: String?
    var reviewNote: String?
    var eventId: String?
    var event: EventSummary?
    var isHidden: Bool
    var deletedBy: String?
    var deletedAt: String?
    var deleteReason: String?
    var tags: [String]
    var pinnedOrder: Int?
    var isPinned: Bool
    var createdAt: String
    var updatedAt: String?
    var counts: SquareCounts?
    var isMine: Bool
    var anonymousAuthor: AnonymousAuthor?
    var anonymousAuthorToken: String?
    var cardType: String?                   // "large" | "medium" | "small" (feeds only; H5 re-derives)
    var sameSchool: Bool?
    var commentSnippet: String?             // search results only
    var myLiked: Bool?                      // detail only (nil in feeds → unliked look)
    var match: SquareCoupleMatch?

    init(id: String,
         board: String = "RECOMMEND",
         authorType: String = "USER",
         authorUserId: String? = nil,
         authorUser: SquareAuthorUser? = nil,
         adminId: String? = nil,
         admin: SquareAdmin? = nil,
         school: String? = nil,
         coupleMatchId: String? = nil,
         title: String? = nil,
         content: String = "",
         images: [String] = [],
         likeCount: Int = 0,
         commentCount: Int = 0,
         anonymous: Bool = false,
         isSponsored: Bool = false,
         postType: String = "normal",
         pollOptions: [PollOption]? = nil,
         myVote: Int? = nil,
         reviewStatus: String = "approved",
         reviewedByAdminId: String? = nil,
         reviewedAt: String? = nil,
         reviewNote: String? = nil,
         eventId: String? = nil,
         event: EventSummary? = nil,
         isHidden: Bool = false,
         deletedBy: String? = nil,
         deletedAt: String? = nil,
         deleteReason: String? = nil,
         tags: [String] = [],
         pinnedOrder: Int? = nil,
         isPinned: Bool = false,
         createdAt: String = "",
         updatedAt: String? = nil,
         counts: SquareCounts? = nil,
         isMine: Bool = false,
         anonymousAuthor: AnonymousAuthor? = nil,
         anonymousAuthorToken: String? = nil,
         cardType: String? = nil,
         sameSchool: Bool? = nil,
         commentSnippet: String? = nil,
         myLiked: Bool? = nil,
         match: SquareCoupleMatch? = nil) {
        self.id = id
        self.board = board
        self.authorType = authorType
        self.authorUserId = authorUserId
        self.authorUser = authorUser
        self.adminId = adminId
        self.admin = admin
        self.school = school
        self.coupleMatchId = coupleMatchId
        self.title = title
        self.content = content
        self.images = images
        self.likeCount = likeCount
        self.commentCount = commentCount
        self.anonymous = anonymous
        self.isSponsored = isSponsored
        self.postType = postType
        self.pollOptions = pollOptions
        self.myVote = myVote
        self.reviewStatus = reviewStatus
        self.reviewedByAdminId = reviewedByAdminId
        self.reviewedAt = reviewedAt
        self.reviewNote = reviewNote
        self.eventId = eventId
        self.event = event
        self.isHidden = isHidden
        self.deletedBy = deletedBy
        self.deletedAt = deletedAt
        self.deleteReason = deleteReason
        self.tags = tags
        self.pinnedOrder = pinnedOrder
        self.isPinned = isPinned
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.counts = counts
        self.isMine = isMine
        self.anonymousAuthor = anonymousAuthor
        self.anonymousAuthorToken = anonymousAuthorToken
        self.cardType = cardType
        self.sameSchool = sameSchool
        self.commentSnippet = commentSnippet
        self.myLiked = myLiked
        self.match = match
    }

    private enum CodingKeys: String, CodingKey {
        case id, board, authorType, authorUserId, authorUser, adminId, admin, school, coupleMatchId, title, content,
             images, likeCount, commentCount, anonymous, isSponsored, postType, pollOptions, myVote, reviewStatus,
             reviewedByAdminId, reviewedAt, reviewNote, eventId, event, isHidden, deletedBy, deletedAt, deleteReason,
             tags, pinnedOrder, isPinned, createdAt, updatedAt, isMine, anonymousAuthor, anonymousAuthorToken,
             cardType, sameSchool, commentSnippet, myLiked, match
        case counts = "_count"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        board = c.lenient(String.self, .board) ?? "RECOMMEND"
        authorType = c.lenient(String.self, .authorType) ?? "USER"
        authorUserId = c.lenient(String.self, .authorUserId)
        authorUser = c.lenient(SquareAuthorUser.self, .authorUser)
        adminId = c.lenient(String.self, .adminId)
        admin = c.lenient(SquareAdmin.self, .admin)
        school = c.lenient(String.self, .school)
        coupleMatchId = c.lenient(String.self, .coupleMatchId)
        title = c.lenient(String.self, .title)
        content = c.lenient(String.self, .content) ?? ""
        images = (c.lenient([String?].self, .images) ?? []).compactMap { $0 }
        likeCount = max(0, c.lenientInt(.likeCount) ?? 0)
        commentCount = max(0, c.lenientInt(.commentCount) ?? 0)
        anonymous = c.lenientBool(.anonymous) ?? false
        isSponsored = c.lenientBool(.isSponsored) ?? false
        postType = c.lenient(String.self, .postType) ?? "normal"
        pollOptions = c.lenient([PollOption].self, .pollOptions)
        myVote = c.lenientInt(.myVote)
        reviewStatus = c.lenient(String.self, .reviewStatus) ?? "approved"
        reviewedByAdminId = c.lenient(String.self, .reviewedByAdminId)
        reviewedAt = c.lenient(String.self, .reviewedAt)
        reviewNote = c.lenient(String.self, .reviewNote)
        eventId = c.lenient(String.self, .eventId)
        event = c.lenient(EventSummary.self, .event)
        isHidden = c.lenientBool(.isHidden) ?? false
        deletedBy = c.lenient(String.self, .deletedBy)
        deletedAt = c.lenient(String.self, .deletedAt)
        deleteReason = c.lenient(String.self, .deleteReason)
        tags = (c.lenient([String?].self, .tags) ?? []).compactMap { $0 }
        pinnedOrder = c.lenientInt(.pinnedOrder)
        isPinned = c.lenientBool(.isPinned) ?? false
        createdAt = c.lenient(String.self, .createdAt) ?? ""
        updatedAt = c.lenient(String.self, .updatedAt)
        counts = c.lenient(SquareCounts.self, .counts)
        isMine = c.lenientBool(.isMine) ?? false
        anonymousAuthor = c.lenient(AnonymousAuthor.self, .anonymousAuthor)
        anonymousAuthorToken = c.lenient(String.self, .anonymousAuthorToken)
        cardType = c.lenient(String.self, .cardType)
        sameSchool = c.lenientBool(.sameSchool)
        commentSnippet = c.lenient(String.self, .commentSnippet)
        myLiked = c.lenientBool(.myLiked)
        match = c.lenient(SquareCoupleMatch.self, .match)
    }

    // MARK: Derived facts (case-insensitive — api-square §0.7)

    var isCampusWall: Bool { board.uppercased() == "CAMPUS_WALL" }
    var isRecommendBoard: Bool { !isCampusWall }
    /// `authorType !== 'USER'` → STUDENT_UNION / TEAM / SPONSOR.
    var isOfficial: Bool { authorType.uppercased() != "USER" }
    var isSponsorAuthor: Bool { authorType.uppercased() == "SPONSOR" }
    var isStudentUnion: Bool { authorType.uppercased() == "STUDENT_UNION" }
    var isTeam: Bool { authorType.uppercased() == "TEAM" }
    var isPoll: Bool { postType.lowercased() == "poll" }
    var isEvent: Bool { postType.lowercased() == "event" }
    var isApproved: Bool { reviewStatus.lowercased() == "approved" }
    var isPendingReview: Bool { reviewStatus.lowercased() == "pending" }
    var isRejected: Bool { reviewStatus.lowercased() == "rejected" }
    /// `isSponsored || authorType === 'SPONSOR'` → "Sponsored" badge instead of the official one.
    var showsSponsoredBadge: Bool { isSponsored || isSponsorAuthor }
    var firstImage: String? {
        guard let f = images.first?.trimmingCharacters(in: .whitespacesAndNewlines), !f.isEmpty else { return nil }
        return f
    }
    var hasImage: Bool { firstImage != nil }
    var hasPollOptions: Bool { isPoll && !(pollOptions ?? []).isEmpty }
    /// `match.userA` + `match.userB` present and not anonymous → stacked couple avatars.
    var isCouplePost: Bool { !anonymous && match?.userA != nil && match?.userB != nil }
    var pollTotalVotes: Int { (pollOptions ?? []).reduce(0) { $0 + $1.votes } }

    /// `kindOf(p)` — the card silhouette on a given page (h5-square §1.3).
    func kind(on board: SquareBoardKind) -> SquareCardKind {
        if isOfficial { return hasImage ? .large : .text }
        if isCampusWall { return .wide }
        return board == .campus_wall ? .wide : .small
    }

    /// Official large / text card headline: rendered **only** when the post actually has a title
    /// (`${p.title ? … : ''}` — official cards never fall back to a content excerpt).
    var headline: String? {
        guard let t = title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }

    /// Small-card title line: `title || content.substring(0, 60)`.
    var cardTitle: String {
        if let t = title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { return t }
        return String(content.prefix(60))
    }

    /// Text tile content: `title || content`.
    var textCardText: String {
        if let t = title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { return t }
        return content
    }

    /// Official badge text (nil for user posts and sponsor-badged posts):
    /// "Student Union · {org}" / "Official Team · {org}" / "Official" (org = organizationName || name).
    var officialBadgeText: String? {
        guard isOfficial, !showsSponsoredBadge else { return nil }
        let org = [admin?.organizationName, admin?.name]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        if isStudentUnion {
            let base = L10n.t("Student Union")
            return org.map { "\(base) · \($0)" } ?? base
        }
        if isTeam {
            let base = L10n.t("Official Team")
            return org.map { "\(base) · \($0)" } ?? base
        }
        return L10n.t("Official")
    }

    // MARK: Mutations used by SquareStore

    mutating func applyLike(liked: Bool, count: Int) {
        myLiked = liked
        likeCount = max(0, count)
    }

    mutating func applyVote(options: [PollOption], myVote vote: Int?) {
        pollOptions = options
        myVote = vote
    }

    mutating func applyCounts(likeCount likes: Int, commentCount comments: Int, myLiked liked: Bool) {
        likeCount = max(0, likes)
        commentCount = max(0, comments)
        myLiked = liked
    }
}

// MARK: - AuthorDisplay (`postAuthorDisplay` + `avatarChip` — h5-square §1.3, api-square §1.5)

/// Resolved author identity for a card. Anonymous → alias name from the seed (language-dependent),
/// emoji avatar, school from `post.school` only. Otherwise nickname → admin.name → organizationName → "User".
struct AuthorDisplay: Equatable {
    var name: String
    var avatarUrl: String?
    var seed: UInt32?
    var school: String?
    var isAnonymous: Bool

    static let userFallback = "User"

    init(name: String, avatarUrl: String? = nil, seed: UInt32? = nil, school: String? = nil, isAnonymous: Bool = false) {
        self.name = name
        self.avatarUrl = avatarUrl
        self.seed = seed
        self.school = school
        self.isAnonymous = isAnonymous
    }

    static func of(_ post: SquarePostCard) -> AuthorDisplay {
        if post.anonymous {
            let seed = post.anonymousAuthor?.aliasSeed
            let fallback = post.anonymousAuthor?.nickname?.trimmingCharacters(in: .whitespacesAndNewlines)
            let name = Alias.name(seed: seed, fallback: (fallback?.isEmpty == false) ? fallback : nil)
            return AuthorDisplay(name: name, avatarUrl: nil, seed: seed, school: post.school, isAnonymous: true)
        }
        let profile = post.authorUser?.profile
        let candidates: [String?] = [profile?.nickname, post.admin?.name, post.admin?.organizationName]
        let name = candidates
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? L10n.pick(AuthorDisplay.userFallback, "用户")
        let school = [profile?.school, post.school]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        return AuthorDisplay(name: name, avatarUrl: profile?.avatarUrl, seed: nil, school: school, isAnonymous: false)
    }
}

// MARK: - Text-card highlighter (`highlightMarkHtml` — h5-design-system §10.2)

enum TextCardHighlight {
    /// `[。，！？…、,.!?:;\s]`
    static let breakers: Set<Character> = ["。", "，", "！", "？", "…", "、", ",", ".", "!", "?", ":", ";"]

    static func isBreaker(_ ch: Character) -> Bool {
        if breakers.contains(ch) { return true }
        return ch.unicodeScalars.allSatisfy { CharacterSet.whitespacesAndNewlines.contains($0) }
    }

    /// Splits `text` into the highlighted head and the plain rest:
    /// `n = index of first breaker; cap = first char code < 128 ? 12 : 6; if n <= 0 → n = length; n = min(n, cap)`.
    static func split(_ text: String) -> (head: String, rest: String) {
        let chars = Array(text)
        guard let first = chars.first else { return ("", "") }
        let firstCode = first.unicodeScalars.first?.value ?? 0
        let cap = firstCode < 128 ? 12 : 6
        var n = chars.firstIndex(where: isBreaker) ?? -1
        if n <= 0 { n = chars.count }
        n = min(n, cap)
        return (String(chars[0..<n]), String(chars[n...]))
    }

    /// `clamp(1.05rem, 5.5vw, 1.45rem)` for the given viewport width.
    static func fontSize(viewportWidth: CGFloat) -> CGFloat {
        let vw = viewportWidth > 0 ? viewportWidth : 375
        return min(max(16.8, 0.055 * vw), 23.2)
    }
}

// MARK: - Feed / search payloads (api-square §2.2–§2.5)

/// `{ items, page, limit, total, hasMore, needProfileSchool?, isSearch?, query? }` — also tolerates a bare array.
struct FeedPage: Decodable, Equatable {
    var items: [SquarePostCard]
    var page: Int?
    var limit: Int?
    var total: Int?
    var hasMore: Bool?
    var needProfileSchool: Bool?
    var isSearch: Bool?
    var query: String?

    init(items: [SquarePostCard], page: Int? = nil, limit: Int? = nil, total: Int? = nil, hasMore: Bool? = nil,
         needProfileSchool: Bool? = nil, isSearch: Bool? = nil, query: String? = nil) {
        self.items = items
        self.page = page
        self.limit = limit
        self.total = total
        self.hasMore = hasMore
        self.needProfileSchool = needProfileSchool
        self.isSearch = isSearch
        self.query = query
    }

    private enum CodingKeys: String, CodingKey { case items, page, limit, total, hasMore, needProfileSchool, isSearch, query }

    init(from decoder: Decoder) throws {
        if var unkeyed = try? decoder.unkeyedContainer() {
            items = FeedPage.decodeItems(&unkeyed)
            page = nil; limit = nil; total = items.count; hasMore = false
            needProfileSchool = nil; isSearch = nil; query = nil
            return
        }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if var nested = try? c.nestedUnkeyedContainer(forKey: .items) {
            items = FeedPage.decodeItems(&nested)
        } else {
            items = []
        }
        page = c.lenientInt(.page)
        limit = c.lenientInt(.limit)
        total = c.lenientInt(.total)
        hasMore = c.lenientBool(.hasMore)
        needProfileSchool = c.lenientBool(.needProfileSchool)
        isSearch = c.lenientBool(.isSearch)
        query = c.lenient(String.self, .query)
    }

    /// Decodes every card it can; a malformed element never fails the whole page.
    private static func decodeItems(_ c: inout UnkeyedDecodingContainer) -> [SquarePostCard] {
        var out: [SquarePostCard] = []
        while !c.isAtEnd {
            if let entry = try? c.decode(FeedEntry.self) {
                if let card = entry.card, !card.id.isEmpty { out.append(card) }
                continue
            }
            if (try? c.decodeNil()) == true { continue }
            break
        }
        return out
    }

    var needsSchool: Bool { needProfileSchool == true }
}

private struct FeedEntry: Decodable {
    let card: SquarePostCard?
    init(from decoder: Decoder) throws { card = try? SquarePostCard(from: decoder) }
}

/// `{ query, posts: SearchPage }` — `GET /square/v2/search`.
struct SearchResponse: Decodable, Equatable {
    var query: String
    var posts: FeedPage

    init(query: String, posts: FeedPage) {
        self.query = query
        self.posts = posts
    }

    private enum CodingKeys: String, CodingKey { case query, posts }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        query = c.lenient(String.self, .query) ?? ""
        posts = c.lenient(FeedPage.self, .posts) ?? FeedPage(items: [])
    }
}

/// `{ pollOptions: [{text, votes}], myVote }` — `POST /square/v2/posts/:id/vote`.
struct VoteResult: Decodable, Equatable {
    var pollOptions: [PollOption]
    var myVote: Int?

    init(pollOptions: [PollOption], myVote: Int?) {
        self.pollOptions = pollOptions
        self.myVote = myVote
    }

    private enum CodingKeys: String, CodingKey { case pollOptions, myVote }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pollOptions = c.lenient([PollOption].self, .pollOptions) ?? []
        myVote = c.lenientInt(.myVote)
    }
}

/// `{ liked, likeCount?, message }` — `POST /square/v2/posts/:id/like`. The server currently sends no
/// `likeCount` → the client derives ±1 locally (api-square §2.8).
struct LikeResult: Decodable, Equatable {
    var liked: Bool
    var likeCount: Int?
    var message: String?

    init(liked: Bool, likeCount: Int? = nil, message: String? = nil) {
        self.liked = liked
        self.likeCount = likeCount
        self.message = message
    }

    private enum CodingKeys: String, CodingKey { case liked, likeCount, message }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        liked = c.lenientBool(.liked) ?? false
        likeCount = c.lenientInt(.likeCount)
        message = c.lenient(String.self, .message)
    }
}

/// `{ optionIndex }` — `VotePollDto`.
struct VoteRequest: Encodable, Equatable {
    var optionIndex: Int
}

// MARK: - Feed composition (posts + sponsored cards)

/// One entry of a rendered feed page: a post card or a sponsored ad (recommend only).
enum SquareFeedItem: Identifiable, Equatable {
    case post(SquarePostCard)
    case ad(AdFeedItem)

    var id: String {
        switch self {
        case .post(let p): return "post:" + p.id
        case .ad(let a): return "ad:" + a.id
        }
    }

    var post: SquarePostCard? {
        if case .post(let p) = self { return p }
        return nil
    }

    var ad: AdFeedItem? {
        if case .ad(let a) = self { return a }
        return nil
    }
}

/// Render-time state of one feed page (h5-square §1.1 "Feed page states").
enum SquareFeedState: Equatable {
    case idle               // never loaded (page stays blank — no spinner)
    case loading            // request in flight (previous content, if any, stays)
    case content
    case empty
    case needSchool
    case error(String)
}
