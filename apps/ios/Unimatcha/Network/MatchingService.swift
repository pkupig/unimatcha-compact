// Interface outline: implementation bodies removed.
import Foundation
struct MatchingService {
    static func status(mode: MatchMode) async throws -> MatchStatus
    static func result(mode: MatchMode) async throws -> MatchStatus
    static func start(mode: MatchMode, enhanced: Bool = false, cells: Int? = nil) async throws -> MatchActionResult
    static func stop(mode: MatchMode) async throws -> MatchActionResult
    static func connect(code: String) async throws -> ConnectResult
    static func connectUser(userId: String) async throws -> ConnectResult
    static func confirm(matchId: String) async throws -> MatchActionResult
    static func dissolve(matchId: String, reason: String? = nil) async throws -> MatchActionResult
    static func getPreferences(mode: MatchMode) async throws -> MatchPreferences
    static func setPreferences(_ prefs: MatchPreferences) async throws -> MatchPreferences
    static func milestones() async throws -> Milestones
    static func reportFeedback(matchId: String, type: String) async throws
        struct Ev: Encodable {
        struct Body: Encodable {
