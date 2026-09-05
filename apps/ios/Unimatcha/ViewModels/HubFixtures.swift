#if DEBUG
import Foundation
import CoreGraphics

/// Decode / contract checks for WP-14 (energy purchase + friend hub), run by WP-16's
/// `-unimatcha-decode-check`. Covers the relationship-graph payload and its geometry, the
/// connect-by-code contract, the connect-code endpoint and the mock top-up two-step.
enum HubFixtures {
    static func verify() throws {
        try verifyGraphPayload()
        try verifyGraphGeometry()
        try verifyConnect()
        try verifyContactRows()
        try verifyEnergy()
    }

    // MARK: Graph payload

    private static func verifyGraphPayload() throws {
        let g = try FixtureCheck.decode(RelationshipGraph.self, fixture: "hub-graph")
        try FixtureCheck.expect(g.selfNode.id == "clu_me_0001", "hub-graph", "self id")
        try FixtureCheck.expect(g.selfNode.avatarUrl?.hasPrefix("https://") == true, "hub-graph", "self avatar")
        // The id-less row is dropped (it could neither be positioned nor tapped).
        try FixtureCheck.expect(g.nodes.count == 4, "hub-graph", "4 usable nodes, got \(g.nodes.count)")
        try FixtureCheck.expect(g.nodes[0].kind == .romantic, "hub-graph", "romantic kind")
        try FixtureCheck.expect(g.nodes[1].kind == .friend, "hub-graph", "friend kind")
        try FixtureCheck.expect(g.nodes[3].kind == .friend, "hub-graph", "unknown kind → friend")
        try FixtureCheck.expect(g.nodes[1].avatarUrl == "", "hub-graph", "empty avatar tolerated")
        try FixtureCheck.expect(g.nodes[3].avatarUrl == nil, "hub-graph", "null avatar → nil")
        try FixtureCheck.expect(g.edges.count == 5, "hub-graph", "5 edges")
        try FixtureCheck.expect(g.edges[0].weight == 6 && g.edges[0].msgCount == 312, "hub-graph", "edge fields")
        try FixtureCheck.expect(!g.isEmpty, "hub-graph", "non-empty graph")

        // Only edges whose `b` resolves to a drawn node are painted (the 5th points nowhere).
        let lines = GraphLayout.edgeLines(for: g)
        try FixtureCheck.expect(lines.count == 4, "hub-graph", "4 drawable edges, got \(lines.count)")
        try FixtureCheck.expect(lines[0].romantic && lines[0].width == 6, "hub-graph", "romantic edge width 6")
        try FixtureCheck.expect(lines.filter { $0.romantic }.count == 1, "hub-graph", "exactly one pink edge")

        // Empty payload → the "No connections yet" state.
        let empty = try JSONDecoder().decode(RelationshipGraph.self,
                                             from: Data(#"{"self":{"id":"me","nickname":"You","avatarUrl":""},"nodes":[],"edges":[]}"#.utf8))
        try FixtureCheck.expect(empty.isEmpty && GraphLayout.edgeLines(for: empty).isEmpty, "inline", "empty graph")
        // A missing `self` / missing arrays must not throw (H5 `g.nodes || []`).
        let junk = try JSONDecoder().decode(RelationshipGraph.self, from: Data(#"{}"#.utf8))
        try FixtureCheck.expect(junk.nodes.isEmpty && junk.edges.isEmpty && junk.selfNode.id == nil, "inline", "{} → empty graph")
    }

    // MARK: Graph geometry (viewBox 320 · centre 160,160 · R 112 · r 26 / 20)

    private static func verifyGraphGeometry() throws {
        try FixtureCheck.expect(GraphLayout.viewBox == 320 && GraphLayout.ringRadius == 112, "inline", "viewBox / R")
        try FixtureCheck.expect(GraphLayout.selfRadius == 26 && GraphLayout.nodeRadius == 20, "inline", "node radii")
        try FixtureCheck.expect(GraphLayout.minBoxHeight == 300, "inline", "min-height 300")

        func near(_ a: CGPoint, _ b: CGPoint) -> Bool { abs(a.x - b.x) < 0.01 && abs(a.y - b.y) < 0.01 }
        // Four nodes: 12 o'clock, 3, 6, 9 (start at −π/2, clockwise).
        try FixtureCheck.expect(near(GraphLayout.point(index: 0, count: 4), CGPoint(x: 160, y: 48)), "inline", "node 0 at 12 o'clock")
        try FixtureCheck.expect(near(GraphLayout.point(index: 1, count: 4), CGPoint(x: 272, y: 160)), "inline", "node 1 at 3 o'clock")
        try FixtureCheck.expect(near(GraphLayout.point(index: 2, count: 4), CGPoint(x: 160, y: 272)), "inline", "node 2 at 6 o'clock")
        try FixtureCheck.expect(near(GraphLayout.point(index: 3, count: 4), CGPoint(x: 48, y: 160)), "inline", "node 3 at 9 o'clock")
        try FixtureCheck.expect(near(GraphLayout.point(index: 0, count: 1), CGPoint(x: 160, y: 48)), "inline", "single node at 12 o'clock")
        try FixtureCheck.expect(near(GraphLayout.point(index: 0, count: 0), GraphLayout.center), "inline", "count 0 → centre")

        // Labels: below in the lower half (y + 20 + 12), above otherwise (y − 20 − 6).
        try FixtureCheck.expect(GraphLayout.labelBaselineY(for: CGPoint(x: 160, y: 272)) == 304, "inline", "lower-half label below")
        try FixtureCheck.expect(GraphLayout.labelBaselineY(for: CGPoint(x: 160, y: 48)) == 22, "inline", "upper-half label above")
        try FixtureCheck.expect(GraphLayout.labelBaselineY(for: CGPoint(x: 272, y: 160)) == 134, "inline", "y == centre → above")
        try FixtureCheck.expect(GraphLayout.selfLabelBaselineY == 198, "inline", "self label baseline 198")
        try FixtureCheck.expect(abs(GraphLayout.labelCenterY(baseline: 22) - (22 - 9 * 0.32)) < 0.001, "inline", "baseline → centre")

        // Stroke width = server weight, clamped to the documented 0…6 range.
        try FixtureCheck.expect(GraphLayout.strokeWidth(1) == 1 && GraphLayout.strokeWidth(6) == 6, "inline", "weight passthrough")
        try FixtureCheck.expect(GraphLayout.strokeWidth(9) == 6 && GraphLayout.strokeWidth(-2) == 0, "inline", "weight clamped")

        // Fallback disc: uppercase first character, font size r × 0.8.
        try FixtureCheck.expect(GraphLayout.initial("noble hare") == "N", "inline", "initial uppercased")
        try FixtureCheck.expect(GraphLayout.initial(nil) == "?" && GraphLayout.initial("   ") == "?", "inline", "initial fallback")
        try FixtureCheck.expect(GraphLayout.initialFontSize(radius: 20) == 16, "inline", "node initial 16")
        try FixtureCheck.expect(GraphLayout.initialFontSize(radius: 26) == 21, "inline", "self initial 21")

        // Labels truncate at 10 characters (H5 `slice(0,10)`), user content untouched otherwise.
        try FixtureCheck.expect(GraphLayout.label("Alexandra Constantine") == "Alexandra ", "inline", "label 10 chars")
        try FixtureCheck.expect(GraphLayout.label("沐晨") == "沐晨" && GraphLayout.label(nil).isEmpty, "inline", "short / nil label")

        let placements = GraphLayout.placements(for: [
            GraphNode(id: "a"), GraphNode(id: "b"), GraphNode(id: "c"), GraphNode(id: "d"),
        ])
        try FixtureCheck.expect(placements.count == 4 && placements[0].id == "a", "inline", "placements keep order")
        try FixtureCheck.expect(placements[2].labelBaselineY == 304, "inline", "placement label y")
    }

    // MARK: Connect (QR / manual code)

    private static func verifyConnect() throws {
        let r = try FixtureCheck.decode(ConnectResult.self, fixture: "hub-connect")
        try FixtureCheck.expect(r.matchId == "clm_friend_qr_0001", "hub-connect", "matchId")
        try FixtureCheck.expect(r.message == "Added — start chatting!", "hub-connect", "server message")
        try FixtureCheck.expect(r.partner?.nickname == "Noble Hare", "hub-connect", "partner projection")

        let code = try FixtureCheck.decode(ConnectCodeResult.self, fixture: "hub-connect-code")
        try FixtureCheck.expect(code.connectCode == "CL7Q2M9XKD", "hub-connect-code", "code value")
        try FixtureCheck.expect(code.connectCode.range(of: "^CL[0-9A-Z]{8}$", options: .regularExpression) != nil,
                                "hub-connect-code", "code shape CL + 8")

        // A 2xx without `matchId` is a failure carrying the server message (H5 keeps that check).
        let noMatch = try JSONDecoder().decode(ConnectResult.self, from: Data(#"{"message":"Invalid connection code"}"#.utf8))
        try FixtureCheck.expect(noMatch.matchId.isEmpty, "inline", "missing matchId → empty")

        // Trim + uppercase before sending (server look-up is exact-match).
        try FixtureCheck.expect(FriendHubViewModel.normalizeCode("  cl7q2m9xkd \n") == "CL7Q2M9XKD", "inline", "code normalised")
        try FixtureCheck.expect(FriendHubViewModel.normalizeCode("   ").isEmpty, "inline", "blank code → empty")

        // Request body is exactly `{code}` (forbidNonWhitelisted).
        let body = String(decoding: try Endpoint.encoder.encode(ConnectCodeRequest(code: "CL7Q2M9XKD")), as: UTF8.self)
        try FixtureCheck.expect(body == #"{"code":"CL7Q2M9XKD"}"#, "inline", "connect body got \(body)")

        if !L10n.isZh {
            try FixtureCheck.expect(FriendHubViewModel.connectMessage("Added — start chatting!") == "Added — start chatting!",
                                    "inline", "server message verbatim in en")
            try FixtureCheck.expect(FriendHubViewModel.connectMessage(nil) == "Connected!", "inline", "connect fallback")
            try FixtureCheck.expect(FriendHubViewModel.connectMessage("Something new") == "Something new", "inline", "unknown message verbatim")
        } else {
            try FixtureCheck.expect(FriendHubViewModel.connectMessage("You cannot add yourself") == "不能添加自己", "inline", "zh connect error")
            try FixtureCheck.expect(FriendHubViewModel.connectMessage("Something new") == "Something new", "inline", "unknown message verbatim")
        }

        try FixtureCheck.expect(FriendHubViewModel.overlayId == "friend-hub", "inline", "hub overlay id")
        try FixtureCheck.expect(FriendHubViewModel.searchDebounce == 0.120, "inline", "120 ms debounce")
        try FixtureCheck.expect(FriendHubViewModel.scannerResumeDelay == 2, "inline", "2 s scanner resume")
    }

    // MARK: Contact rows + offline search

    private static func verifyContactRows() throws {
        let noted = ChatSession(
            matchId: "m1",
            mode: .friend,
            sessionType: "confirmed",
            partner: SessionPartner(id: "u1", note: "Lab partner", nickname: "Noble Hare", school: "University of Warwick"),
            lastMessage: ChatMessage(id: "msg1", content: "", imageUrl: "https://api.unimatcha.ai/uploads/x.jpg", senderId: "u1")
        )
        let plain = ChatSession(
            matchId: "m2",
            mode: .romantic,
            sessionType: "confirmed",
            partner: SessionPartner(id: "u2", nickname: "沐晨", school: "University of Warwick")
        )
        let nameless = ChatSession(matchId: "m3", sessionType: "temp", partner: SessionPartner(id: "u3"))

        // Name: the private note wins here (unlike the chat list, where it is only a chip).
        try FixtureCheck.expect(FriendHubViewModel.rowName(noted) == "Lab partner", "inline", "note beats nickname")
        try FixtureCheck.expect(FriendHubViewModel.rowName(plain) == "沐晨", "inline", "nickname")
        try FixtureCheck.expect(FriendHubViewModel.rowName(nameless) == L10n.t("Partner"), "inline", "Partner fallback")

        // Subtitle: last message → `[Photo]` for image-only → school.
        try FixtureCheck.expect(FriendHubViewModel.lastMessageText(noted) == L10n.t("[Photo]"), "inline", "image-only preview")
        try FixtureCheck.expect(FriendHubViewModel.rowSubtitle(noted) == L10n.t("[Photo]"), "inline", "subtitle uses last message")
        try FixtureCheck.expect(FriendHubViewModel.rowSubtitle(plain) == (L10n.metaLabel("University of Warwick") ?? ""),
                                "inline", "subtitle falls back to the school")
        try FixtureCheck.expect(FriendHubViewModel.rowSubtitle(nameless).isEmpty, "inline", "no message, no school → empty")

        // Search: empty term lists everything; matching is case-insensitive over
        // nickname / note / school / last message.
        try FixtureCheck.expect(FriendHubViewModel.matches(plain, term: "   "), "inline", "blank term matches all")
        try FixtureCheck.expect(FriendHubViewModel.matches(noted, term: "lab"), "inline", "note match")
        try FixtureCheck.expect(FriendHubViewModel.matches(noted, term: "HARE"), "inline", "nickname match, case-insensitive")
        try FixtureCheck.expect(FriendHubViewModel.matches(plain, term: "warwick"), "inline", "school match")
        try FixtureCheck.expect(!FriendHubViewModel.matches(plain, term: "oxford"), "inline", "no false positive")
        let chatty = ChatSession(matchId: "m4",
                                 partner: SessionPartner(id: "u4", nickname: "Ivy"),
                                 lastMessage: ChatMessage(id: "msg2", content: "see you at the library", senderId: "u4"))
        try FixtureCheck.expect(FriendHubViewModel.matches(chatty, term: "library"), "inline", "last-message match")
        try FixtureCheck.expect(!FriendHubViewModel.haystack(chatty).contains("object"), "inline", "no [object Object] in the haystack")
    }

    // MARK: Energy purchase (mock two-step)

    private static func verifyEnergy() throws {
        let packages = try FixtureCheck.decode([EnergyPackage].self, fixture: "hub-energy-packages")
        try FixtureCheck.expect(packages.count == 3, "hub-energy-packages", "3 tiers")
        try FixtureCheck.expect(packages.map { $0.packageId } == ["pkg_30", "pkg_60", "pkg_100"], "hub-energy-packages", "tier ids")
        try FixtureCheck.expect(packages.map { $0.cells } == [30, 60, 100], "hub-energy-packages", "cells")
        try FixtureCheck.expect(packages.map { $0.priceCny } == [30, 58, 88], "hub-energy-packages", "prices")
        try FixtureCheck.expect(packages == EnergyPackage.fallback, "hub-energy-packages", "matches the static fallback cards")

        let order = try FixtureCheck.decode(PurchaseOrder.self, fixture: "hub-energy-purchase")
        try FixtureCheck.expect(order.orderId == "order_clu_me_1756890851234", "hub-energy-purchase", "orderId")
        try FixtureCheck.expect(order.packageId == "pkg_60" && order.cells == 60 && order.priceCny == 58,
                                "hub-energy-purchase", "order echoes the tier")

        let confirm = try JSONDecoder().decode(PurchaseConfirm.self,
                                               from: Data(#"{"success":true,"availableEnergy":72,"transactionId":"order_clu_me_1756890851234"}"#.utf8))
        try FixtureCheck.expect(confirm.availableEnergy == 72 && confirm.success == true, "inline", "confirm response")

        // Bodies carry exactly the DTO keys; `transactionId` is omitted in the mock.
        let purchaseBody = String(decoding: try Endpoint.encoder.encode(PurchaseRequest(packageId: "pkg_60")), as: UTF8.self)
        try FixtureCheck.expect(purchaseBody == #"{"packageId":"pkg_60"}"#, "inline", "purchase body got \(purchaseBody)")
        let confirmBody = String(decoding: try Endpoint.encoder.encode(
            PurchaseConfirmRequest(orderId: "order_1", packageId: "pkg_60")), as: UTF8.self)
        try FixtureCheck.expect(confirmBody == #"{"orderId":"order_1","packageId":"pkg_60"}"#, "inline", "confirm body got \(confirmBody)")

        // CTA label of the final state.
        let pkg = EnergyPackage(packageId: "pkg_60", cells: 60, priceCny: 58)
        let expected = L10n.isZh ? "支付 ¥58 · 60 格" : "Pay ¥58 · 60 cells"
        try FixtureCheck.expect(EnergyPurchaseViewModel.payTitle(for: pkg) == expected,
                                "inline", "pay title got \(EnergyPurchaseViewModel.payTitle(for: pkg))")
        try FixtureCheck.expect(EnergyPurchaseViewModel.overlayId == "energy-purchase", "inline", "energy overlay id")
    }
}
#endif
