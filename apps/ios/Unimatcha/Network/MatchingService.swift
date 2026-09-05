import Foundation

// MARK: - MatchingService (api-matching-questionnaire.md §3) — WP-06
//
// Thin async wrappers over `APIClient`; every call is JWT-guarded. The store owns sequencing,
// optimistic renders, toasts and the polling loop — this file only shapes requests/responses.

enum MatchingService {
    private static func modeQuery(_ mode: MatchMode) -> [URLQueryItem] {
        [URLQueryItem(name: "mode", value: mode.rawValue)]
    }

    /// `GET /matching/status?mode=` — the main screen model (polled every 30 s). The decoded
    /// `mode` falls back to the requested one when the server omits it.
    static func status(mode: MatchMode) async throws -> MatchStatus {
        var s: MatchStatus = try await APIClient.shared.request(.get("/matching/status", query: modeQuery(mode)))
        s.mode = mode
        return s
    }

    /// `POST /matching/start {mode, enhanced, cells?}` via `requestEnvelope` so the top-level
    /// `message` is readable: the "Already matching, please wait" no-op comes back as a 200 with
    /// the same `status:'SEARCHING'` (api gotcha 3) — callers detect it with
    /// `APIError.isAlreadyMatching(text:)` on `message`.
    static func start(mode: MatchMode, enhanced: Bool, cells: Int? = nil) async throws -> (status: String?, message: String?) {
        let body = StartMatchRequest(mode: mode, enhanced: enhanced, cells: cells)
        let env: APIEnvelope<StartMatchResult> = try await APIClient.shared.requestEnvelope(.post("/matching/start", body: body))
        let status = env.data?.status
        // The handler's `message` lives inside `data`; the interceptor may also echo it at top level.
        let message = env.data?.message ?? env.message
        return (status, message)
    }

    /// `POST /matching/stop?mode=` — no body, no refund (gotcha 4). 400 when not searching.
    static func stop(mode: MatchMode) async throws -> GenericResponse? {
        let env: APIEnvelope<GenericResponse> = try await APIClient.shared.requestEnvelope(.post("/matching/stop", query: modeQuery(mode)))
        return env.data
    }

    /// `GET /matching/preferences?mode=` — DB row or synthesized default (both decode into the same struct).
    static func preferences(mode: MatchMode) async throws -> MatchPreferencesRead {
        var p: MatchPreferencesRead = try await APIClient.shared.request(.get("/matching/preferences", query: modeQuery(mode)))
        p.mode = mode
        return p
    }

    /// `PUT /matching/preferences` — whitelisted body only (api gotcha 1). Returns the stored row.
    @discardableResult
    static func savePreferences(_ write: MatchPreferencesWrite) async throws -> MatchPreferencesRead? {
        let env: APIEnvelope<MatchPreferencesRead> = try await APIClient.shared.requestEnvelope(.put("/matching/preferences", body: write))
        return env.data
    }

    /// `POST /matching/:matchId/dissolve` — chat passes `"user_dissolved"`, the match screen passes
    /// nil (encoded as `{}`).
    static func dissolve(matchId: String, reason: String?) async throws {
        try await APIClient.shared.send(.post("/matching/\(matchId)/dissolve", body: DissolveRequest(reason: reason)))
    }

    /// Legacy `POST /matching/dissolve {}` — newest active romantic match (fallback when no matchId is known).
    static func dissolveLegacy(reason: String? = nil) async throws {
        try await APIClient.shared.send(.post("/matching/dissolve", body: DissolveRequest(reason: reason)))
    }

    /// `POST /matching/:matchId/confirm-relationship` — double-confirm semantics (`WAITING` until both).
    static func confirm(matchId: String) async throws -> ConfirmResult {
        let env: APIEnvelope<ConfirmResult> = try await APIClient.shared.requestEnvelope(.post("/matching/\(matchId)/confirm-relationship"))
        return env.data ?? ConfirmResult(status: nil, message: env.message)
    }

    /// `POST /matching/feedback/events` — fire-and-forget analytics (≤50, server-deduped).
    @discardableResult
    static func reportEvents(_ events: [FeedbackEvent]) async throws -> Int {
        guard !events.isEmpty else { return 0 }
        let env: APIEnvelope<FeedbackAccepted> = try await APIClient.shared.requestEnvelope(
            .post("/matching/feedback/events", body: FeedbackEventsRequest(events: events)))
        return env.data?.accepted ?? 0
    }

    /// `POST /matching/connect {code}` — add friend by connect code (QR); lands directly in `FRIEND_CONFIRMED`.
    static func connect(code: String) async throws -> ConnectResult {
        try await APIClient.shared.request(.post("/matching/connect", body: ConnectCodeRequest(code: code.trimmingCharacters(in: .whitespacesAndNewlines))))
    }

    /// `POST /matching/connect-user {userId}` — same semantics as `connect`, keyed by user id.
    static func connectUser(userId: String) async throws -> ConnectResult {
        try await APIClient.shared.request(.post("/matching/connect-user", body: ConnectUserRequest(userId: userId)))
    }

    /// `GET /matching/milestones` — couple stats (`state:'none'` when not in a relationship).
    static func milestones() async throws -> Milestones {
        try await APIClient.shared.request(.get("/matching/milestones"))
    }
}
