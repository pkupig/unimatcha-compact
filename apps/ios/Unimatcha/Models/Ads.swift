import Foundation

// MARK: - Ads models (api-square-events-social.md §4, h5-addfriend-ads.md §2.6 / §3 #6–#7) — WP-18
//
// `AdFeedItem` (one `/ads/feed` entry: id, title?, content, images, landingUrl?, advertiserName?)
// lives in `Models/Common.swift` (WP-01) so `AppActions.openAdDetail` can reference it. This file
// holds the event-reporting DTOs and the tolerant feed payload decoder.

/// `type` of an `/ads/events` entry. Wire values are lowercase (`ReportAdEventsDto` enum).
enum AdEventType: String, Codable, Equatable, Hashable, CaseIterable {
    case impression
    case click
}

/// One entry of `POST /ads/events { events: [...] }`.
/// `school` is the `School.name` captured when the ads were fetched — never the live profile
/// value, so a mid-session school change cannot mis-attribute (h5-addfriend-ads gotcha 11).
struct AdEvent: Codable, Equatable, Hashable {
    var campaignId: String
    var school: String
    var type: AdEventType

    init(campaignId: String, school: String, type: AdEventType) {
        self.campaignId = campaignId
        self.school = school
        self.type = type
    }
}

/// Request body of `POST /ads/events` (`ReportAdEventsDto`): 1…100 events, `school` ≤ 200 chars.
/// A bigger batch is rejected with 400 — the client chunks (`AdEventQueue.chunks`).
struct AdEventsRequest: Encodable, Equatable {
    static let maxEvents = 100
    static let maxSchoolLength = 200

    var events: [AdEvent]

    init(events: [AdEvent]) {
        self.events = events
    }
}

/// Response `data` of `POST /ads/events` — `{ accepted: n }` (events for unknown/non-ACTIVE
/// campaigns are silently dropped server-side). The UI ignores it.
struct AdEventsResponse: Decodable, Equatable {
    var accepted: Int?

    init(accepted: Int?) {
        self.accepted = accepted
    }

    private enum CodingKeys: String, CodingKey { case accepted }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accepted = c.lenientInt(.accepted)
    }
}

/// Tolerant `/ads/feed` payload. The server returns a bare array as `data`; H5 additionally
/// accepts `{items}` / `{ads}` wrappers and drops entries without an `id` — so do we.
/// Undecodable / `null` elements are skipped instead of failing the whole feed (ads fail open).
struct AdFeedPayload: Decodable, Equatable {
    var ads: [AdFeedItem]

    init(ads: [AdFeedItem]) {
        self.ads = ads
    }

    private enum Keys: String, CodingKey { case items, ads, data }

    init(from decoder: Decoder) throws {
        if var unkeyed = try? decoder.unkeyedContainer() {
            ads = AdFeedPayload.decodeList(&unkeyed)
            return
        }
        if let keyed = try? decoder.container(keyedBy: Keys.self) {
            for key in [Keys.items, Keys.ads, Keys.data] {
                if var nested = try? keyed.nestedUnkeyedContainer(forKey: key) {
                    ads = AdFeedPayload.decodeList(&nested)
                    return
                }
            }
            // A single ad object (defensive).
            if let one = try? AdFeedItem(from: decoder), !one.id.isEmpty {
                ads = [one]
                return
            }
        }
        ads = []
    }

    /// Decodes every element it can; `null` elements are consumed via `decodeNil()` so the
    /// container always advances (a non-advancing failure ends the loop instead of spinning).
    private static func decodeList(_ c: inout UnkeyedDecodingContainer) -> [AdFeedItem] {
        var out: [AdFeedItem] = []
        while !c.isAtEnd {
            if let entry = try? c.decode(AdFeedEntry.self) {
                if let ad = entry.item, !ad.id.isEmpty { out.append(ad) }
                continue
            }
            if (try? c.decodeNil()) == true { continue }
            break
        }
        return out
    }
}

/// Never-failing element wrapper: `item == nil` when the element is not a valid ad (missing id…).
private struct AdFeedEntry: Decodable {
    let item: AdFeedItem?

    init(from decoder: Decoder) throws {
        item = try? AdFeedItem(from: decoder)
    }
}
