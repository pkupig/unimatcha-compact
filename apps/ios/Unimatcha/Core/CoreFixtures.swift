#if DEBUG
import Foundation

/// Decode checks for the foundation contracts (run by WP-16's `-unimatcha-decode-check`).
enum CoreFixtures {
    static func verify() throws {
        // core-me.json → User (enveloped)
        let me = try FixtureCheck.decode(User.self, fixture: "core-me")
        try FixtureCheck.expect(me.id == "clx0me0000000000000000001", "core-me", "id")
        try FixtureCheck.expect(me.resolvedHasProfile, "core-me", "hasProfile")
        try FixtureCheck.expect(me.matchState(.romantic) == "searching", "core-me", "romantic matchState")
        try FixtureCheck.expect(me.matchState(.friend) == "idle", "core-me", "friend matchState fallback")
        try FixtureCheck.expect(me.profile?.interests == ["Music"], "core-me", "profile.interests")
        try FixtureCheck.expect(me.profile?.birthday == "2004-06-01", "core-me", "profile.birthday")
        try FixtureCheck.expect(me.profile?.coverUrl == nil, "core-me", "coverUrl null → nil")
        try FixtureCheck.expect(me.joinedAtString == me.createdAt, "core-me", "joinedAt falls back to createdAt")

        // UserProfile.merge(patch)
        var p = me.profile ?? UserProfile()
        p.merge([
            "nickname": AnyCodable("New Name"),
            "interests": AnyCodable(["A", "B"]),
            "age": AnyCodable(22),
            "coverUrl": AnyCodable(nil),
            "city": AnyCodable(""),
            "unknownKey": AnyCodable("ignored"),
        ])
        try FixtureCheck.expect(p.nickname == "New Name", "core-me", "merge nickname")
        try FixtureCheck.expect(p.interests == ["A", "B"], "core-me", "merge interests")
        try FixtureCheck.expect(p.age == 22, "core-me", "merge age")
        try FixtureCheck.expect(p.coverUrl == nil, "core-me", "merge null clears")
        try FixtureCheck.expect(p.city == "", "core-me", "merge empty string")
        try FixtureCheck.expect(p.school == me.profile?.school, "core-me", "merge keeps untouched keys")

        // core-energy-balance.json → EnergyBalance (+ cells layout)
        let bal = try FixtureCheck.decode(EnergyBalance.self, fixture: "core-energy-balance")
        try FixtureCheck.expect(bal.available == 7, "core-energy-balance", "available")
        try FixtureCheck.expect(bal.cells.filled == 5 && bal.cells.empty == 0 && bal.cells.extra == 5, "core-energy-balance", "cells 5/0/+5")
        let noAvail = EnergyBalance(totalEnergy: 4, usedEnergy: 3, availableEnergy: nil)
        try FixtureCheck.expect(noAvail.available == 1, "core-energy-balance", "available fallback total-used")
        try FixtureCheck.expect(noAvail.cells.filled == 1 && noAvail.cells.empty == 3 && noAvail.cells.extra == 0, "core-energy-balance", "cells 1/3")

        // core-error-array.json → APIErrorBody (bare), message array joined with "\n"
        let err = try FixtureCheck.decode(APIErrorBody.self, fixture: "core-error-array")
        try FixtureCheck.expect(err.statusCode == 400, "core-error-array", "statusCode")
        try FixtureCheck.expect(err.message?.text == "Please enter a valid email address\nproperty foo should not exist", "core-error-array", "joined text")

        // Bare passport 401 body and string message
        let bare = try JSONDecoder().decode(APIErrorBody.self, from: Data(#"{"statusCode":401,"message":"Unauthorized"}"#.utf8))
        try FixtureCheck.expect(bare.message?.text == "Unauthorized", "inline", "bare 401 message")

        // Envelope decodes arrays and objects
        let arr = try JSONDecoder().decode(APIEnvelope<[EnergyPackage]>.self, from: Data(#"{"success":true,"data":[{"packageId":"pkg_30","cells":30,"priceCny":30}],"timestamp":"t"}"#.utf8))
        try FixtureCheck.expect(arr.data?.first?.cells == 30, "inline", "envelope array")
        let obj = try JSONDecoder().decode(APIEnvelope<GenericResponse>.self, from: Data(#"{"success":true,"data":{"message":"ok"},"message":"ok","timestamp":"t"}"#.utf8))
        try FixtureCheck.expect(obj.data?.message == "ok" && obj.message == "ok", "inline", "envelope object + top-level message")

        // NullableField encodes explicit null; plain optionals are omitted
        struct W: Encodable { var a: NullableField<String>; var b: String?; var c: NullableField<Int> }
        let enc = try Endpoint.encoder.encode(W(a: NullableField(nil), b: nil, c: NullableField(3)))
        let json = String(decoding: enc, as: UTF8.self)
        try FixtureCheck.expect(json == #"{"a":null,"c":3}"#, "inline", "NullableField encoding got \(json)")

        // EmptyBody → {}
        let empty = String(decoding: try Endpoint.encoder.encode(EmptyBody()), as: UTF8.self)
        try FixtureCheck.expect(empty == "{}", "inline", "EmptyBody encoding got \(empty)")

        // ReportService request omits contact when nil
        let rep = String(decoding: try Endpoint.encoder.encode(ReportService.Request(category: .bug, content: "x", contact: nil)), as: UTF8.self)
        try FixtureCheck.expect(rep == #"{"category":"bug","content":"x"}"#, "inline", "report payload got \(rep)")

        // ISODate
        try FixtureCheck.expect(ISODate.parse("2026-09-03T10:00:00.000Z") != nil, "inline", "ISO fractional")
        try FixtureCheck.expect(ISODate.parse("2026-09-03T10:00:00Z") != nil, "inline", "ISO plain")
        try FixtureCheck.expect(ISODate.parse("2004-06-01") != nil, "inline", "YYYY-MM-DD")
        try FixtureCheck.expect(ISODate.parse("2026-06-21T14:00") != nil, "inline", "local minute")
        try FixtureCheck.expect(ISODate.parse("") == nil, "inline", "empty → nil")

        // EventSummary derived values
        let ev = try JSONDecoder().decode(EventSummary.self, from: Data(#"{"id":"e1","title":"T","venue":null,"school":"S","startAt":"2020-01-01T10:00:00.000Z","endAt":null,"priceCents":250,"capacity":10,"ticketsSold":10,"status":"published"}"#.utf8))
        try FixtureCheck.expect(ev.cells == 3 && ev.isSoldOut && ev.hasEnded && !ev.isClosed && ev.remaining == 0, "inline", "EventSummary derived")

        // AdFeedItem tolerates missing optionals
        let ad = try JSONDecoder().decode(AdFeedItem.self, from: Data(#"{"id":"c1","title":"A","content":"B","images":[],"landingUrl":null,"advertiserName":"X"}"#.utf8))
        try FixtureCheck.expect(ad.landingUrl == nil && ad.images.isEmpty, "inline", "AdFeedItem")

        // Keychain round-trip (isolated account value; restored afterwards)
        let before = Keychain.token()
        Keychain.setToken("fixture-token")
        try FixtureCheck.expect(Keychain.token() == "fixture-token", "inline", "Keychain set/get")
        Keychain.setToken(nil)
        try FixtureCheck.expect(Keychain.token() == nil, "inline", "Keychain delete")
        Keychain.setToken(before)

        // Prefs round-trip
        let prefs = EnhancedPrefs(romanticEnabled: true, friendEnabled: false, friendCells: 4)
        Prefs.setEnhanced(prefs, uid: "fixture-uid")
        try FixtureCheck.expect(Prefs.enhanced(uid: "fixture-uid") == prefs, "inline", "Prefs.enhanced round-trip")
        UserDefaults.standard.removeObject(forKey: Prefs.enhancedKey(uid: "fixture-uid"))
    }
}
#endif
