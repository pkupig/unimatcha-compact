import Foundation

// MARK: - Couple space aggregate (GET /couple/:matchId)
struct CoupleSpace: Codable {
    let matchId: String?
    let daysTogether: Int?
    let since: String?
    let partner: PublicProfile?
    let me: PublicProfile?
    let cover: String?
    let loveYou: LoveYouState?
    let status: String?
    let craving: String?
    let schedule: [CoupleSchedule]?
    let gifts: [String]?
    let anniversaries: [CoupleAnniversary]?
    let bucket: [CoupleBucketItem]?
}

struct LoveYouState: Codable {
    let mine: Int?
    let partner: Int?
    let total: Int?
    let unlocked: Bool?
}

struct CoupleSchedule: Codable, Identifiable {
    let id: String
    let text: String?
    let startAt: String?
    let endAt: String?
}

struct CoupleAnniversary: Codable, Identifiable {
    let id: String
    let title: String?
    let date: String?
    let note: String?
    let images: [String]?
}

struct CoupleBucketItem: Codable, Identifiable {
    let id: String
    let text: String?
    let done: Bool?
    let note: String?
    let images: [String]?
}

// MARK: - Requests
struct CoupleTextRequest: Codable { let text: String }
struct CoupleStatusRequest: Codable { let status: String }
struct CoupleCoverRequest: Codable { let imageUrl: String? }
struct CoupleScheduleRequest: Codable { let text: String; let startAt: String; let endAt: String }
struct CoupleAnniversaryRequest: Codable { let title: String; let date: String }
struct CoupleBucketRequest: Codable { let text: String }
struct CoupleBucketToggleRequest: Codable { let done: Bool; let note: String? }
