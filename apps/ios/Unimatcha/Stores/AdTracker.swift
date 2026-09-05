import Foundation
import Combine
import UIKit

// MARK: - AdEventQueue (pure queue logic — h5-addfriend-ads §2.6, api-square §4.3)
//
// Non-isolated value type so the rules are testable from `AdsFixtures` without the main actor:
//   • capacity 200 (oldest dropped on overflow — H5 `adQueue.shift()`),
//   • `drain()` takes everything off (H5 `splice(0, length)`),
//   • `requeue()` appends a failed chunk back (H5 `adQueue.concat(events)`), re-capped to 200,
//   • `chunks()` splits into ≤100-event requests (`ReportAdEventsDto` `ArrayMaxSize(100)`).

struct AdEventQueue: Equatable {
    static let capacity = 200

    private(set) var events: [AdEvent] = []

    init() {}

    var isEmpty: Bool { events.isEmpty }
    var count: Int { events.count }

    mutating func enqueue(_ event: AdEvent) {
        if events.count >= AdEventQueue.capacity {
            events.removeFirst(events.count - AdEventQueue.capacity + 1)
        }
        events.append(event)
    }

    mutating func drain() -> [AdEvent] {
        let pending = events
        events.removeAll(keepingCapacity: true)
        return pending
    }

    mutating func requeue(_ chunk: [AdEvent]) {
        events.append(contentsOf: chunk)
        if events.count > AdEventQueue.capacity {
            events.removeFirst(events.count - AdEventQueue.capacity)
        }
    }

    mutating func removeAll() {
        events.removeAll()
    }

    static func chunks(_ list: [AdEvent], size: Int = AdEventsRequest.maxEvents) -> [[AdEvent]] {
        guard !list.isEmpty else { return [] }
        let step = max(1, size)
        return stride(from: 0, to: list.count, by: step).map { start in
            Array(list[start..<min(start + step, list.count)])
        }
    }
}

// MARK: - AdTracker (PLAN §B.7 — WP-18)
//
// Process-wide port of `ads.js`: the latest fetched ads (`adsById`), the school captured at
// fetch time (every event carries it), the per-session impression set, the event queue, the
// 10 s flush timer (started on the first enqueue, runs for the rest of the session; an empty
// flush is a no-op) and the click → navigation flow. Everything is dropped on `reset()`,
// which runs on `sessionDidReset` (explicit, not H5's lazy token compare) and is also called
// by WP-16's `AppRouter`. Flush is awaitable so the scene-phase handler can flush on
// `.background` / `.inactive` (H5 `visibilitychange`/`pagehide`).

@MainActor
final class AdTracker: ObservableObject {
    static let shared = AdTracker()

    nonisolated static let flushInterval: TimeInterval = 10
    nonisolated static let impressionVisibilityThreshold: CGFloat = 0.5

    /// Ads returned by the most recent `fetch` (empty when the feed had none or failed).
    @Published private(set) var latest: [AdFeedItem] = []

    /// `School.name` used for the last fetch — the value every queued event carries.
    private(set) var school: String = ""
    /// Ads by campaign id. Accumulates across fetches within a session (superset of H5's
    /// last-fetch map) so a card still on screen during a re-fetch never loses its click.
    private(set) var adsById: [String: AdFeedItem] = [:]

    private var seenImpressions: Set<String> = []
    private var queue = AdEventQueue()
    private var timerTask: Task<Void, Never>?
    private var flushTask: Task<Void, Never>?
    /// Bumped by `reset()`; in-flight fetches/flushes compare it and discard stale results.
    private var generation: Int = 0
    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    // MARK: Inspection

    var pendingEventCount: Int { queue.count }
    var isFlushTimerRunning: Bool { timerTask != nil }

    func hasSeenImpression(_ campaignId: String) -> Bool {
        seenImpressions.contains(campaignId)
    }

    func ad(for campaignId: String) -> AdFeedItem? {
        adsById[campaignId]
    }

    // MARK: Fetch

    /// `GET /ads/feed?school=&limit=3`. Never throws: any failure (or an empty/blank school)
    /// yields `[]` and the feed renders normally. Captures `school` for event tagging and
    /// caches the ads by id. A `reset()` during the request discards the result.
    func fetch(school: String) async -> [AdFeedItem] {
        let name = school.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return [] }
        let gen = generation
        self.school = name
        var items: [AdFeedItem] = []
        do {
            items = try await AdsService.feed(school: name, limit: AdsService.feedLimit)
        } catch {
            #if DEBUG
            print("[AdTracker] feed failed: \(APIError.message(of: error))")
            #endif
            items = []
        }
        guard gen == generation else { return [] }
        for ad in items where !ad.id.isEmpty {
            adsById[ad.id] = ad
        }
        latest = items
        return items
    }

    // MARK: Events

    /// ≥50 % visible card → one `impression` per campaign per app session (the card reports
    /// visibility; the tracker owns the dedupe). Re-renders / re-scrolls never re-count.
    func impression(_ campaignId: String) {
        guard !campaignId.isEmpty, !seenImpressions.contains(campaignId) else { return }
        seenImpressions.insert(campaignId)
        enqueue(campaignId, .impression)
    }

    /// Every tap queues a `click` — never deduped. Unknown ids (not from this session's
    /// fetches) are a no-op, like H5's `adsById` lookup.
    func click(_ campaignId: String) {
        guard adsById[campaignId] != nil else { return }
        enqueue(campaignId, .click)
    }

    /// Card tap: queue the click **first**, then navigate (`landingUrl` → external browser,
    /// else the in-app `ad-detail` page). Ordering matters: the click must be in the queue
    /// before the app can go to the background for Safari.
    func handleTap(_ ad: AdFeedItem) {
        click(ad.id)
        navigate(ad)
    }

    /// Navigation half of a tap (no event). External browser for an openable `landingUrl`,
    /// otherwise the ad-detail overlay (also the fallback for a landing URL iOS cannot open).
    func navigate(_ ad: AdFeedItem) {
        if let url = AdTracker.externalURL(from: ad.landingUrl) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        } else {
            AdDetailView.present(ad)
        }
    }

    private func enqueue(_ campaignId: String, _ type: AdEventType) {
        guard !campaignId.isEmpty, !school.isEmpty else { return }
        queue.enqueue(AdEvent(campaignId: campaignId, school: school, type: type))
        ensureFlushTimer()
    }

    // MARK: Flush

    /// Drains the queue in ≤100-event requests: 5xx / transport error → chunk back on the queue,
    /// 4xx → dropped. A concurrent flush is awaited first (its items were already taken).
    func flush() async {
        if let running = flushTask {
            await running.value
        }
        guard !queue.isEmpty else { return }
        let gen = generation
        let task = Task<Void, Never> { [weak self] in
            guard let self = self else { return }
            await self.drain(generation: gen)
        }
        flushTask = task
        await task.value
        if flushTask == task { flushTask = nil }
    }

    private func drain(generation gen: Int) async {
        let pending = queue.drain()
        guard !pending.isEmpty else { return }
        for chunk in AdEventQueue.chunks(pending, size: AdsService.maxEventsPerRequest) {
            guard gen == generation, !Task.isCancelled else { return }
            do {
                _ = try await AdsService.report(chunk)
            } catch {
                // A reset while the request was in flight: the events belonged to the previous
                // account — never re-queue them into the new session.
                guard gen == generation else { return }
                if AdsService.disposition(for: error) == .requeue {
                    queue.requeue(chunk)
                }
            }
        }
    }

    private func ensureFlushTimer() {
        guard timerTask == nil else { return }
        let gen = generation
        let ns = UInt64(AdTracker.flushInterval * 1_000_000_000)
        timerTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: ns)
                } catch {
                    return
                }
                guard let self = self, !Task.isCancelled, self.generation == gen else { return }
                await self.flush()
            }
        }
    }

    // MARK: Reset

    /// Account-switch firewall (`sessionDidReset`): pending events of the previous account are
    /// discarded (H5 `ensureAdSession` parity — better lost than attributed to the new user),
    /// the seen-impression set, ad cache, school and timer are cleared.
    func reset() {
        generation &+= 1
        timerTask?.cancel()
        timerTask = nil
        flushTask?.cancel()
        flushTask = nil
        queue.removeAll()
        seenImpressions.removeAll()
        adsById.removeAll()
        latest = []
        school = ""
    }

    // MARK: Landing URL

    /// Openable landing URL: `http(s)://…`, protocol-relative `//host/…`, or a bare host
    /// (`example.com/promo` → https). Anything else (`javascript:`, `file:`, blank) → nil, so
    /// the tap falls back to the in-app detail instead of handing an arbitrary scheme to iOS.
    nonisolated static func externalURL(from raw: String?) -> URL? {
        guard var s = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        if s.hasPrefix("//") { s = "https:" + s }
        let lower = s.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
            if let u = URL(string: s), u.host != nil { return u }
            if let enc = s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
               let u = URL(string: enc), u.host != nil { return u }
            return nil
        }
        if !s.contains(":"), !s.contains(" "),
           let u = URL(string: "https://" + s), let host = u.host, host.contains(".") {
            return u
        }
        return nil
    }
}
