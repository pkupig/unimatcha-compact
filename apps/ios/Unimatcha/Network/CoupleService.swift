// Interface outline: implementation bodies removed.
import Foundation
struct CoupleService {
    static func getSpace(matchId: String) async throws -> CoupleSpace
    static func setCover(matchId: String, imageUrl: String?) async throws -> CoupleSpace
    static func loveYou(matchId: String) async throws -> GenericResponse
    static func setStatus(matchId: String, status: String) async throws -> GenericResponse
    static func setCraving(matchId: String, text: String) async throws -> GenericResponse
    static func addBucket(matchId: String, text: String) async throws -> GenericResponse
    static func toggleBucket(matchId: String, id: String, done: Bool, note: String? = nil) async throws -> GenericResponse
    static func addAnniversary(matchId: String, title: String, date: String) async throws -> GenericResponse
