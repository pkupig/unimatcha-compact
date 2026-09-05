#if DEBUG
import Foundation

/// Decode / contract checks for the ads domain (run by WP-16's `-unimatcha-decode-check`).
/// Covers the feed payload tolerance, the events request shape, the queue rules and the
/// retry policy — everything in WP-18 that does not need a main-actor store.
enum AdsFixtures {
    static func verify() throws {
        // ads-feed.json → bare array as `data` (the server's real shape), both via the payload and as [AdFeedItem]
        let feed = try FixtureCheck.decode(AdFeedPayload.self, fixture: "ads-feed")
        try FixtureCheck.expect(feed.ads.count == 3, "ads-feed", "3 ads")
        try FixtureCheck.expect(feed.ads[0].id == "cmp_unioncafe_001", "ads-feed", "first id")
        try FixtureCheck.expect(feed.ads[0].landingUrl == nil, "ads-feed", "landingUrl null → nil")
        try FixtureCheck.expect(feed.ads[0].images.count == 1, "ads-feed", "one image")
        try FixtureCheck.expect(feed.ads[0].content.contains("\n"), "ads-feed", "pre-wrap newline kept")
        try FixtureCheck.expect(feed.ads[1].landingUrl == "https://example.com/campus-gym?src=unimatcha", "ads-feed", "landingUrl")
        try FixtureCheck.expect(feed.ads[1].images.count == 2, "ads-feed", "two images")
        try FixtureCheck.expect(feed.ads[2].title == nil && feed.ads[2].advertiserName == nil, "ads-feed", "null title/advertiser tolerated")
        let bare = try FixtureCheck.decode([AdFeedItem].self, fixture: "ads-feed")
        try FixtureCheck.expect(bare.count == 3, "ads-feed", "decodes as [AdFeedItem] too")

        // ads-feed-wrapped.json → {items} wrapper; missing / empty id and null entries dropped
        let wrapped = try FixtureCheck.decode(AdFeedPayload.self, fixture: "ads-feed-wrapped")
        try FixtureCheck.expect(wrapped.ads.count == 1, "ads-feed-wrapped", "only the entry with an id survives")
        try FixtureCheck.expect(wrapped.ads[0].id == "cmp_wrapped_001", "ads-feed-wrapped", "wrapped id")

        // Inline: {ads} wrapper, single object, non-list payload
        let dec = JSONDecoder()
        let adsWrapped = try dec.decode(AdFeedPayload.self, from: Data(#"{"ads":[{"id":"a1","content":"x","images":[]}]}"#.utf8))
        try FixtureCheck.expect(adsWrapped.ads.map { $0.id } == ["a1"], "inline", "{ads} wrapper")
        let single = try dec.decode(AdFeedPayload.self, from: Data(#"{"id":"s1","content":"x","images":[]}"#.utf8))
        try FixtureCheck.expect(single.ads.map { $0.id } == ["s1"], "inline", "single object")
        let junk = try dec.decode(AdFeedPayload.self, from: Data(#"{"foo":"bar"}"#.utf8))
        try FixtureCheck.expect(junk.ads.isEmpty, "inline", "unknown object → []")
        let mixed = try dec.decode(AdFeedPayload.self, from: Data(#"[null, 7, "str", {"id":"m1","content":"c","images":["u"]}]"#.utf8))
        try FixtureCheck.expect(mixed.ads.map { $0.id } == ["m1"], "inline", "junk elements skipped, container advances")

        // ads-events-accepted.json → AdEventsResponse
        let accepted = try FixtureCheck.decode(AdEventsResponse.self, fixture: "ads-events-accepted")
        try FixtureCheck.expect(accepted.accepted == 2, "ads-events-accepted", "accepted")

        // AdEventsRequest wire shape: {events:[{campaignId, school, type}]} — exactly the DTO keys
        let req = AdEventsRequest(events: [
            AdEvent(campaignId: "c1", school: "University of Warwick", type: .impression),
            AdEvent(campaignId: "c1", school: "University of Warwick", type: .click),
        ])
        let json = String(decoding: try Endpoint.encoder.encode(req), as: UTF8.self)
        let expected = #"{"events":[{"campaignId":"c1","school":"University of Warwick","type":"impression"},{"campaignId":"c1","school":"University of Warwick","type":"click"}]}"#
        try FixtureCheck.expect(json == expected, "inline", "events payload got \(json)")
        try FixtureCheck.expect(AdEventsRequest.maxEvents == 100 && AdEventQueue.capacity == 200, "inline", "limits 100 / 200")

        // AdEventQueue: cap 200 drops the oldest, drain empties, requeue re-caps, chunks ≤100
        var q = AdEventQueue()
        for i in 0..<205 { q.enqueue(AdEvent(campaignId: "c\(i)", school: "S", type: .impression)) }
        try FixtureCheck.expect(q.count == 200, "inline", "queue capped at 200 (got \(q.count))")
        try FixtureCheck.expect(q.events.first?.campaignId == "c5" && q.events.last?.campaignId == "c204", "inline", "oldest dropped first")
        let drained = q.drain()
        try FixtureCheck.expect(drained.count == 200 && q.isEmpty, "inline", "drain takes everything")
        let chunks = AdEventQueue.chunks(drained)
        try FixtureCheck.expect(chunks.count == 2 && chunks.allSatisfy { $0.count == 100 }, "inline", "200 → 2×100")
        let odd = AdEventQueue.chunks(Array(drained.prefix(150)))
        try FixtureCheck.expect(odd.map { $0.count } == [100, 50], "inline", "150 → [100, 50]")
        try FixtureCheck.expect(AdEventQueue.chunks([]).isEmpty, "inline", "empty → no chunks")
        q.requeue(Array(drained.prefix(30)))
        for i in 0..<180 { q.enqueue(AdEvent(campaignId: "n\(i)", school: "S", type: .click)) }
        try FixtureCheck.expect(q.count == 200, "inline", "enqueue after requeue keeps the cap")
        q.requeue(drained)
        try FixtureCheck.expect(q.count == 200 && q.events.last?.campaignId == "c204", "inline", "requeue re-caps, newest kept")
        q.removeAll()
        try FixtureCheck.expect(q.isEmpty, "inline", "removeAll")

        // Retry policy: 5xx / transport → requeue, 4xx / 401 / decoding → drop
        try FixtureCheck.expect(AdsService.disposition(for: APIError.http(status: 500, message: "x")) == .requeue, "inline", "500 requeue")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.http(status: 503, message: "x")) == .requeue, "inline", "503 requeue")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.http(status: 400, message: "x")) == .drop, "inline", "400 drop")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.http(status: 404, message: "x")) == .drop, "inline", "404 drop")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.unauthorized(message: "x")) == .drop, "inline", "401 drop")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.network(URLError(.timedOut))) == .requeue, "inline", "timeout requeue")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.network(URLError(.notConnectedToInternet))) == .requeue, "inline", "offline requeue")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.network(URLError(.cancelled))) == .drop, "inline", "cancelled drop")
        try FixtureCheck.expect(AdsService.disposition(for: APIError.decoding(URLError(.badServerResponse))) == .drop, "inline", "decoding after 2xx drop")
        try FixtureCheck.expect(AdsService.disposition(for: CancellationError()) == .drop, "inline", "CancellationError drop")
        try FixtureCheck.expect(AdsService.disposition(for: URLError(.networkConnectionLost)) == .requeue, "inline", "raw URLError requeue")
        try FixtureCheck.expect(AdsService.eventsTimeout == 10 && AdsService.feedLimit == 3, "inline", "10 s timeout / limit 3")

        // Landing URL policy: http(s) opens externally, anything else falls back to the detail page
        try FixtureCheck.expect(AdTracker.externalURL(from: "https://example.com/a?b=c")?.absoluteString == "https://example.com/a?b=c", "inline", "https ok")
        try FixtureCheck.expect(AdTracker.externalURL(from: " http://example.com ")?.host == "example.com", "inline", "trimmed http ok")
        try FixtureCheck.expect(AdTracker.externalURL(from: "//cdn.example.com/x")?.scheme == "https", "inline", "protocol-relative → https")
        try FixtureCheck.expect(AdTracker.externalURL(from: "example.com/promo")?.absoluteString == "https://example.com/promo", "inline", "bare host → https")
        try FixtureCheck.expect(AdTracker.externalURL(from: "javascript:alert(1)") == nil, "inline", "javascript: rejected")
        try FixtureCheck.expect(AdTracker.externalURL(from: "file:///etc/passwd") == nil, "inline", "file: rejected")
        try FixtureCheck.expect(AdTracker.externalURL(from: "") == nil && AdTracker.externalURL(from: nil) == nil, "inline", "blank / nil → nil")
        try FixtureCheck.expect(AdTracker.externalURL(from: "not a url") == nil, "inline", "free text → nil")

        // Impression visibility ratio (D15: ≥50 % of the card frame inside the viewport)
        let viewport = CGRect(x: 0, y: 0, width: 375, height: 812)
        let half = AdCardView.visibleFraction(of: CGRect(x: 0, y: 612, width: 375, height: 400), in: viewport)
        try FixtureCheck.expect(half == 0.5, "inline", "half visible → 0.5 (got \(half))")
        try FixtureCheck.expect(AdCardView.visibleFraction(of: CGRect(x: 0, y: 900, width: 375, height: 400), in: viewport) == 0, "inline", "off-screen → 0")
        try FixtureCheck.expect(AdCardView.visibleFraction(of: CGRect(x: 387, y: 100, width: 375, height: 400), in: viewport) == 0, "inline", "next pager page → 0")
        try FixtureCheck.expect(AdCardView.visibleFraction(of: CGRect(x: 0, y: 100, width: 375, height: 400), in: viewport) == 1, "inline", "fully visible → 1")
        try FixtureCheck.expect(AdTracker.impressionVisibilityThreshold == 0.5 && AdTracker.flushInterval == 10, "inline", "threshold .5 / flush 10 s")
        try FixtureCheck.expect(AdDetailView.overlayId == "ad-detail", "inline", "overlay id")

        // Masonry estimate: 4:5 media only when the first image is actually loadable
        let withImage = AdFeedItem(id: "e1", title: "T", content: "C", images: ["https://api.unimatcha.ai/uploads/a.jpg"])
        let unsafeImage = AdFeedItem(id: "e2", title: "T", content: "C", images: ["javascript:alert(1)"])
        let noImage = AdFeedItem(id: "e3", title: "T", content: "C", images: [])
        try FixtureCheck.expect(AdCardView.estimatedHeight(for: withImage, width: 363) > 363 / AdCardView.mediaAspect, "inline", "media height ≈ w × 5/4 plus body")
        try FixtureCheck.expect(AdCardView.estimatedHeight(for: unsafeImage, width: 363) == AdCardView.estimatedHeight(for: noImage, width: 363), "inline", "unsafe image estimates as the badge-only fallback")
        try FixtureCheck.expect(AdCardView.estimatedHeight(for: noImage, width: 363) < 200, "inline", "no-image card is short")
    }
}
#endif
