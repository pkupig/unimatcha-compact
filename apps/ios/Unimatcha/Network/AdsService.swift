import Foundation
import UIKit

// MARK: - AdsService (`/ads/*`, api-square-events-social.md §4) — WP-18
//
// `feed` throws like every other service (its only caller, `AdTracker.fetch`, swallows errors —
// ads must never break the recommend feed). `report` is the H5 `flushAdEvents` request:
// `POST /ads/events` with ≤100 events, a 10 s timeout and a UIKit background task around the
// call so a flush started on the way to the background is allowed to finish (the iOS stand-in
// for `fetch keepalive`, which H5 uses because `sendBeacon` cannot carry the JWT).

enum AdsService {
    /// H5 sends `limit=3`; the server clamps to 1…10.
    static let feedLimit = 3
    static let feedLimitRange = 1...10
    static let eventsTimeout: TimeInterval = 10
    static let maxEventsPerRequest = AdEventsRequest.maxEvents

    /// `GET /ads/feed?school=<School.name>&limit=<n>` → `[AdFeedItem]`.
    /// Tolerates a bare array or `{items}`/`{ads}` wrappers; entries without `id` are dropped;
    /// a `null` data payload is an empty list.
    static func feed(school: String, limit: Int = feedLimit) async throws -> [AdFeedItem] {
        let clamped = min(max(limit, feedLimitRange.lowerBound), feedLimitRange.upperBound)
        let endpoint = Endpoint.get("/ads/feed", query: [
            URLQueryItem(name: "school", value: school),
            URLQueryItem(name: "limit", value: String(clamped)),
        ])
        do {
            let payload: AdFeedPayload = try await APIClient.shared.request(endpoint)
            return payload.ads
        } catch APIError.emptyData {
            return []
        }
    }

    /// `POST /ads/events { events }` → accepted count. Callers chunk to ≤100 (`AdEventQueue.chunks`);
    /// a longer list is truncated defensively rather than rejected with 400 (which would lose
    /// billable clicks).
    @MainActor
    static func report(_ events: [AdEvent]) async throws -> Int {
        guard !events.isEmpty else { return 0 }
        let chunk = events.count > maxEventsPerRequest ? Array(events.prefix(maxEventsPerRequest)) : events
        let endpoint = Endpoint.post("/ads/events", body: AdEventsRequest(events: chunk)).timeout(eventsTimeout)
        let task = AdBackgroundTask.begin(name: "ai.unimatcha.ads.flush")
        defer { task.end() }
        let env: APIEnvelope<AdEventsResponse> = try await APIClient.shared.requestEnvelope(endpoint)
        return env.data?.accepted ?? 0
    }

    // MARK: Retry policy (h5-addfriend-ads §2.6 / gotcha 12)

    /// What to do with a chunk whose request failed: 5xx / transport → put it back, 4xx → drop
    /// (retrying would fail again). A 401 has already torn the session down (the tracker resets).
    enum Disposition: Equatable {
        case requeue
        case drop
    }

    static func disposition(for error: Error) -> Disposition {
        if error is CancellationError { return .drop }
        guard let e = error as? APIError else {
            let ns = error as NSError
            if ns.domain == NSURLErrorDomain { return ns.code == NSURLErrorCancelled ? .drop : .requeue }
            return .requeue
        }
        switch e {
        case .network(let inner):
            let ns = inner as NSError
            if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return .drop }
            return .requeue
        case .http(let status, _):
            return status >= 500 ? .requeue : .drop
        case .unauthorized:
            return .drop
        case .invalidURL, .decoding, .emptyData:
            // `.decoding` only happens after a 2xx (the server accepted the batch) — nothing to retry.
            return .drop
        }
    }
}

// MARK: - Background task handle

/// `UIApplication.beginBackgroundTask` wrapper: `end()` is idempotent and also runs from the
/// expiration handler, so the identifier can never leak.
@MainActor
final class AdBackgroundTask {
    private var identifier: UIBackgroundTaskIdentifier = .invalid

    private init() {}

    static func begin(name: String) -> AdBackgroundTask {
        let handle = AdBackgroundTask()
        handle.identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak handle] in
            handle?.end()
        }
        return handle
    }

    func end() {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
        identifier = .invalid
    }
}
