import Foundation

// MARK: - Square v2 feed card (recommend / campus-wall)
struct SquareCard: Codable, Identifiable {
    let id: String
    let board: String?              // response is UPPERCASE: RECOMMEND | CAMPUS_WALL
    let authorType: String?         // USER | TEAM | STUDENT_UNION | SPONSOR
    let cardType: String?           // large | medium | small
    let title: String?
    let content: String?
    let images: [String]?
    let anonymous: Bool?
    let isSponsored: Bool?
    let school: String?
    let sameSchool: Bool?
    let likeCount: Int?
    let commentCount: Int?
    let createdAt: String?
    let authorUser: SquareAuthor?
    let anonymousAuthor: AnonymousAuthor?
    let tags: [String]?
    let isMine: Bool?
}

struct SquareAuthor: Codable {
    let id: String?
    let profile: SquareAuthorProfile?
}
struct SquareAuthorProfile: Codable {
    let nickname: String?
    let avatarUrl: String?
    let school: String?
}
struct AnonymousAuthor: Codable {
    let nickname: String?
    let avatarUrl: String?
}

struct SquareFeedResponse: Codable {
    let items: [SquareCard]
    let page: Int?
    let limit: Int?
    let total: Int?
    let hasMore: Bool?
    let needProfileSchool: Bool?
}

// MARK: - Post detail (adds comments + myLiked)
struct SquarePostDetail: Codable {
    let id: String
    let board: String?
    let authorType: String?
    let title: String?
    let content: String?
    let images: [String]?
    let anonymous: Bool?
    let isSponsored: Bool?
    let school: String?
    let likeCount: Int?
    let commentCount: Int?
    let createdAt: String?
    let authorUser: SquareAuthor?
    let anonymousAuthor: AnonymousAuthor?
    let isMine: Bool?
    let myLiked: Bool?
    let comments: [SquareComment]?
}

struct SquareComment: Codable, Identifiable {
    let id: String
    let content: String?
    let imageUrl: String?
    let parentCommentId: String?
    let createdAt: String?
    let user: SquareAuthor?
    let replies: [SquareComment]?
}

// MARK: - Requests
struct CreatePostRequest: Codable {
    let board: String               // "recommend" | "campus_wall"
    let title: String?
    let content: String
    let images: [String]?
    let anonymous: Bool?
    let tags: [String]?
}

struct CreateCommentRequest: Codable {
    let content: String
    let imageUrl: String?
    let parentCommentId: String?
}

struct LikeResult: Codable {
    let liked: Bool
    let message: String?
}

struct ReportRequest: Codable { let reason: String? }
struct ReportResult: Codable {
    let reported: Bool?
    let reporterCount: Int?
    let hidden: Bool?
    let message: String?
}
