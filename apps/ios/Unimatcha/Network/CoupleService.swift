import Foundation

// MARK: - `/couple/*` (`api-chat-realtime-notifications.md §4`, JWT) — WP-12
//
// 13 routes, and **every single one returns the full `CoupleSpace`** (GET and all 12 mutations),
// which is why none of them returns anything narrower: the caller replaces its model with the
// response and re-renders (h5-couple §2.11).
//
// `assertMember` runs first on every route, in this order:
//   404 `Relationship not found`
//   403 `Not a valid partner relationship`   (not RELATIONSHIP_*, dissolved, or a friend match)
//   403 `No access to this Couple Space`     (neither userA nor userB)
//
// All bodies are `forbidNonWhitelisted` DTO classes: an unknown key is a 400, so the request
// structs in `Models/Couple.swift` carry exactly the documented fields.

enum CoupleService {

    private static func path(_ matchId: String, _ suffix: String = "") -> String {
        "/couple/\(matchId)\(suffix)"
    }

    // MARK: 1 — read

    /// `GET /couple/:matchId` — the aggregate read (`loadCoupleSpace`).
    static func space(matchId: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.get(path(matchId)))
    }

    // MARK: 2 — cover (per user per match, `settings.coupleCovers[matchId]`)

    /// `PUT /couple/:matchId/cover {imageUrl}` — `nil` sends an explicit JSON `null` and clears it.
    static func setCover(matchId: String, imageUrl: String?) async throws -> CoupleSpace {
        try await APIClient.shared.request(.put(path(matchId, "/cover"), body: CoupleCoverRequest(url: imageUrl)))
    }

    // MARK: 3 — love you (once per server-UTC day)

    /// `POST /couple/:matchId/love-you {}` — 400 `Already sent today, come back tomorrow` on repeat.
    /// Side effects: a chat message `I love you` from me + SSE `message`; at 100×100 a `milestone`
    /// notification for both users.
    static func sendLoveYou(matchId: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.post(path(matchId, "/love-you"), body: EmptyBody()))
    }

    // MARK: 4 — today's status

    /// `PUT /couple/:matchId/status {status}` — `""` is valid and clears the status.
    static func setStatus(matchId: String, status: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.put(path(matchId, "/status"), body: CoupleStatusRequest(status: status)))
    }

    // MARK: 5 — craving

    /// `POST /couple/:matchId/craving {text}` — 400 `Content is required` when blank after trim.
    /// Every post appends to the history (newest becomes `current`).
    static func addCraving(matchId: String, text: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.post(path(matchId, "/craving"), body: CoupleCravingRequest(text: text)))
    }

    // MARK: 6 / 7 — schedule

    /// `POST /couple/:matchId/schedule {text,startAt,endAt}` — iOS sends ISO-8601 **with offset**
    /// (PLAN D4; H5 sends zone-less `YYYY-MM-DDTHH:mm`, which the server reads in its own zone).
    /// 400: `Content is required` / `Start and end time are required` / `Invalid time` /
    /// `End time cannot be earlier than start time`.
    static func addSchedule(matchId: String, text: String, startAt: Date, endAt: Date) async throws -> CoupleSpace {
        let body = CoupleScheduleRequest(text: text,
                                         startAt: ISODate.isoWithOffset(startAt),
                                         endAt: ISODate.isoWithOffset(endAt))
        return try await APIClient.shared.request(.post(path(matchId, "/schedule"), body: body))
    }

    /// `DELETE /couple/:matchId/schedule/:id` — only my own entry; a foreign id is a silent no-op.
    static func deleteSchedule(matchId: String, id: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.delete(path(matchId, "/schedule/\(id)")))
    }

    // MARK: 8 / 9 / 10 — anniversaries

    /// `POST /couple/:matchId/anniversary {title,date}` — `date` is `YYYY-MM-DD`.
    /// 400 `Title and date are required` / `Invalid date format`.
    static func addAnniversary(matchId: String, title: String, date: String) async throws -> CoupleSpace {
        let body = CoupleAnniversaryRequest(title: title, date: date)
        return try await APIClient.shared.request(.post(path(matchId, "/anniversary"), body: body))
    }

    /// `PATCH /couple/:matchId/anniversary/:id {title,date,note,images}` — either partner may edit.
    /// Image removals only persist through this call (h5-couple gotcha 8).
    static func updateAnniversary(matchId: String, id: String, title: String, date: String,
                                  note: String, images: [String]) async throws -> CoupleSpace {
        let body = CoupleAnniversaryUpdateRequest(title: title, date: date, note: note, images: images)
        return try await APIClient.shared.request(.patch(path(matchId, "/anniversary/\(id)"), body: body))
    }

    /// `DELETE /couple/:matchId/anniversary/:id` — either partner; unknown id is a silent no-op.
    static func deleteAnniversary(matchId: String, id: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.delete(path(matchId, "/anniversary/\(id)")))
    }

    // MARK: 11 / 12 / 13 — bucket (plans & checklist)

    /// `POST /couple/:matchId/bucket {text}` — 400 `Content is required`.
    static func addBucket(matchId: String, text: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.post(path(matchId, "/bucket"), body: CoupleBucketRequest(text: text)))
    }

    /// `PATCH /couple/:matchId/bucket/:id {done:true,note,images}` — sets `doneBy`/`doneNote`/`doneImages`.
    static func completeBucket(matchId: String, id: String, note: String, images: [String]) async throws -> CoupleSpace {
        let body = CoupleBucketToggleRequest.complete(note: note, images: images)
        return try await APIClient.shared.request(.patch(path(matchId, "/bucket/\(id)"), body: body))
    }

    /// `PATCH /couple/:matchId/bucket/:id {done:false}` — clears note **and** photos permanently.
    static func uncompleteBucket(matchId: String, id: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.patch(path(matchId, "/bucket/\(id)"), body: CoupleBucketToggleRequest.uncomplete))
    }

    /// `DELETE /couple/:matchId/bucket/:id` — 400 `Completed plans cannot be deleted` when done.
    static func deleteBucket(matchId: String, id: String) async throws -> CoupleSpace {
        try await APIClient.shared.request(.delete(path(matchId, "/bucket/\(id)")))
    }
}
