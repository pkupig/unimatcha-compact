#if DEBUG
import Foundation

/// Decode + display-rule checks for the events/tickets domain (PLAN §H.4; run by WP-16's
/// `-unimatcha-decode-check`). Pure — never touches the main-actor view models.
enum EventsFixtures {
    static func verify() throws {
        try verifyDetail()
        try verifyPurchase()
        try verifyWallet()
        try verifyDisplayRules()
    }

    // MARK: GET /events/:id

    private static func verifyDetail() throws {
        let f = "events-detail"
        let d = try FixtureCheck.decode(EventDetail.self, fixture: f)
        try FixtureCheck.expect(d.id == "clxevt00000000000000000001", f, "id")
        try FixtureCheck.expect(d.title == "Freshers Bubble Tea Night", f, "title")
        try FixtureCheck.expect(d.images.count == 1, f, "images")
        try FixtureCheck.expect(d.venue == "Piazza, Students' Union", f, "venue")
        try FixtureCheck.expect(d.priceCents == 250 && d.capacity == 200 && d.ticketsSold == 57, f, "numbers")
        try FixtureCheck.expect(d.remaining == 143 && d.remainingFromServer == 143, f, "remaining")
        try FixtureCheck.expect(d.myTickets == 1, f, "myTickets")
        try FixtureCheck.expect(d.postId == "clxpost0000000000000000042", f, "post.id")
        try FixtureCheck.expect(d.createdByAdmin?.role == "STUDENT_UNION", f, "createdByAdmin.role")
        try FixtureCheck.expect(d.createdByAdmin?.organizationName == "Warwick Students' Union", f, "createdByAdmin.organizationName")
        let s = d.summary
        try FixtureCheck.expect(s.id == d.id && s.cells == 3 && s.remaining == 143 && !s.isSoldOut && !s.isClosed, f, "summary")
        try FixtureCheck.expect(s.images?.count == 1, f, "summary.images")
        try FixtureCheck.expect(s.startDate != nil && s.endDate != nil, f, "summary dates parse")
    }

    // MARK: POST /events/:id/purchase

    private static func verifyPurchase() throws {
        let f = "events-purchase"
        let p = try FixtureCheck.decode(PurchaseResult.self, fixture: f)
        try FixtureCheck.expect(p.ticketId == "clxtkt00000000000000000009", f, "ticketId")
        try FixtureCheck.expect(p.code == "UMT-7K3PQ2WX9A", f, "code")
        try FixtureCheck.expect(p.pricePaidCents == 300 && p.cellsPaid == 3, f, "paid")
        try FixtureCheck.expect(p.event?.title == "Freshers Bubble Tea Night", f, "event.title")
        try FixtureCheck.expect(p.event?.venue == "Piazza, Students' Union", f, "event.venue")

        // Request body is the H5 `{}`.
        let body = String(decoding: try Endpoint.encoder.encode(EmptyBody()), as: UTF8.self)
        try FixtureCheck.expect(body == "{}", f, "purchase body got \(body)")
    }

    // MARK: GET /events/tickets/mine

    private static func verifyWallet() throws {
        let f = "events-tickets-mine"
        let w = try FixtureCheck.decode(TicketWallet.self, fixture: f)
        try FixtureCheck.expect(w.tickets.count == 3, f, "count")

        let valid = w.tickets[0]
        try FixtureCheck.expect(valid.status == .valid && valid.isValid, f, "[0] valid")
        try FixtureCheck.expect(valid.code == "UMT-7K3PQ2WX9A", f, "[0] code")
        try FixtureCheck.expect(valid.paidCells == 3, f, "[0] paidCells")
        try FixtureCheck.expect(valid.eventId == "clxevt00000000000000000001", f, "[0] eventId")
        try FixtureCheck.expect(valid.event?.school == "University of Warwick", f, "[0] event.school")
        try FixtureCheck.expect(valid.event?.images?.count == 1, f, "[0] event.images")
        try FixtureCheck.expect(valid.displayTitle == "Freshers Bubble Tea Night", f, "[0] displayTitle")
        try FixtureCheck.expect(valid.stubLine.hasSuffix(" · Piazza, Students' Union"), f, "[0] stubLine venue")
        try FixtureCheck.expect(valid.stubLine.count == 16 + 3 + "Piazza, Students' Union".count, f, "[0] stubLine `YYYY-MM-DD HH:mm · venue` got \(valid.stubLine)")

        let used = w.tickets[1]
        try FixtureCheck.expect(used.status == .used && !used.isValid, f, "[1] used")
        try FixtureCheck.expect(used.paidCells == 0 && used.paidLine == nil, f, "[1] free → no paid line")
        try FixtureCheck.expect(used.usedAt == "2026-08-28T19:04:11.000Z", f, "[1] usedAt")
        try FixtureCheck.expect(used.event?.venue == nil, f, "[1] venue null → nil")
        try FixtureCheck.expect(!used.stubLine.contains("·"), f, "[1] stubLine without venue")
        try FixtureCheck.expect(used.event?.images?.isEmpty == true, f, "[1] images empty")

        let cancelled = w.tickets[2]
        try FixtureCheck.expect(cancelled.status == .cancelled && !cancelled.isValid, f, "[2] cancelled")
        try FixtureCheck.expect(cancelled.paidCells == 1, f, "[2] paidCells 100 → 1")
        try FixtureCheck.expect(cancelled.event?.school == nil, f, "[2] school null → nil")

        // Unknown status falls back to non-valid; missing event → "Event" title fallback.
        let odd = try JSONDecoder().decode(Ticket.self, from: Data(#"{"id":"t","code":"UMT-AAAAAAAAAA","pricePaidCents":150,"status":"weird"}"#.utf8))
        try FixtureCheck.expect(odd.status == .used && !odd.isValid, f, "unknown status → non-valid")
        try FixtureCheck.expect(odd.displayTitle == "Event", f, "missing event → 'Event'")
        try FixtureCheck.expect(odd.paidCells == 2, f, "150 → 2 cells")
        try FixtureCheck.expect(odd.stubLine.isEmpty, f, "no event → empty stub line")
    }

    // MARK: Display rules (price label, CTA state, paid line, confirm copy) in both languages

    private static func verifyDisplayRules() throws {
        let f = "inline"
        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }

        func event(price: Int, capacity: Int?, sold: Int, status: String, start: String, end: String? = nil) -> EventSummary {
            EventSummary(id: "e", title: "T", venue: "V", school: "University of Warwick", startAt: start, endAt: end,
                         priceCents: price, capacity: capacity, ticketsSold: sold, status: status)
        }
        let future = "2999-01-01T10:00:00.000Z"
        let past = "2000-01-01T10:00:00.000Z"

        LangRegistry.current = .en
        try FixtureCheck.expect(EventCopy.priceLabel(cells: 0) == "Free", f, "price 0 en")
        try FixtureCheck.expect(EventCopy.priceLabel(cells: 1) == "1 energy cell", f, "price 1 en")
        try FixtureCheck.expect(EventCopy.priceLabel(cells: 3) == "3 energy cells", f, "price 3 en")
        try FixtureCheck.expect(EventCopy.ticketPaidLine(cells: 1) == "1 cell", f, "paid 1 en")
        try FixtureCheck.expect(EventCopy.ticketPaidLine(cells: 2) == "2 cells", f, "paid 2 en")

        let open = event(price: 250, capacity: 200, sold: 57, status: "published", start: future, end: future)
        try FixtureCheck.expect(EventCTAState.resolve(open) == .available(priceLabel: "3 energy cells"), f, "CTA available")
        try FixtureCheck.expect(EventCTAState.resolve(open).label == "Get Ticket · 3 energy cells", f, "CTA label")
        try FixtureCheck.expect(!EventCTAState.resolve(open).isDisabled, f, "CTA enabled")
        try FixtureCheck.expect(EventCopy.availabilityLine(for: open) == "3 energy cells · 143 left · 57 sold", f, "availability line")
        try FixtureCheck.expect(EventCopy.scheduleLine(for: open).contains(" – "), f, "schedule range with endAt")
        let noEnd = event(price: 0, capacity: nil, sold: 4, status: "published", start: future)
        try FixtureCheck.expect(!EventCopy.scheduleLine(for: noEnd).contains(" – "), f, "schedule single without endAt")
        try FixtureCheck.expect(EventCopy.availabilityLine(for: noEnd) == "Free · 4 sold", f, "availability line no capacity")
        try FixtureCheck.expect(EventCTAState.resolve(noEnd).label == "Get Ticket · Free", f, "CTA free label")

        let closed = event(price: 250, capacity: 200, sold: 57, status: "closed", start: future)
        try FixtureCheck.expect(EventCTAState.resolve(closed) == .salesClosed, f, "CTA closed")
        try FixtureCheck.expect(EventCTAState.resolve(closed).label == "Sales closed" && EventCTAState.resolve(closed).isDisabled, f, "CTA closed label")
        let ended = event(price: 250, capacity: 200, sold: 57, status: "published", start: past, end: past)
        try FixtureCheck.expect(EventCTAState.resolve(ended) == .ended, f, "CTA ended")
        try FixtureCheck.expect(EventCTAState.resolve(ended).label == "Event ended", f, "CTA ended label")
        let endedByStart = event(price: 250, capacity: 200, sold: 57, status: "published", start: past)
        try FixtureCheck.expect(EventCTAState.resolve(endedByStart) == .ended, f, "CTA ended via startAt")
        let soldOut = event(price: 250, capacity: 57, sold: 57, status: "published", start: future)
        try FixtureCheck.expect(EventCTAState.resolve(soldOut) == .soldOut, f, "CTA sold out")
        try FixtureCheck.expect(EventCTAState.resolve(soldOut).label == "Sold out", f, "CTA sold out label")
        // Precedence: closed > ended > sold out.
        let closedEndedSoldOut = event(price: 0, capacity: 1, sold: 1, status: "cancelled", start: past)
        try FixtureCheck.expect(EventCTAState.resolve(closedEndedSoldOut) == .salesClosed, f, "CTA precedence closed first")
        let endedSoldOut = event(price: 0, capacity: 1, sold: 1, status: "published", start: past)
        try FixtureCheck.expect(EventCTAState.resolve(endedSoldOut) == .ended, f, "CTA precedence ended before sold out")

        try FixtureCheck.expect(EventCopy.paidConfirmTitle() == "Get this ticket?", f, "confirm title en")
        try FixtureCheck.expect(EventCopy.paidConfirmBody(cells: 1, available: 5) == "1 energy cell will be spent now (you have 5). The ticket lands in My Tickets instantly.", f, "confirm body 1 en")
        try FixtureCheck.expect(EventCopy.paidConfirmBody(cells: 3, available: 7) == "3 energy cells will be spent now (you have 7). The ticket lands in My Tickets instantly.", f, "confirm body 3 en")
        try FixtureCheck.expect(EventCopy.paidConfirmLabel(cells: 3) == "Spend 3 & get ticket", f, "confirm label en")
        try FixtureCheck.expect(EventCopy.freeConfirmBody() == "Payment is mocked in beta — the ticket lands in My Tickets instantly.", f, "free body en")
        try FixtureCheck.expect(EventCopy.purchaseSuccessToast(code: "UMT-X") == "Ticket UMT-X added to My Tickets", f, "success toast en")
        try FixtureCheck.expect(EventCopy.notEnoughEnergyToast() == "Not enough energy — top up", f, "shortfall toast en")
        try FixtureCheck.expect(EventCopy.passCaption(valid: true) == "Show this QR at the entrance", f, "caption valid en")
        try FixtureCheck.expect(EventCopy.passCaption(valid: false) == "This ticket has been used", f, "caption used en")
        try FixtureCheck.expect(TicketStatus.valid.chipLabel == "VALID" && TicketStatus.used.chipLabel == "USED" && TicketStatus.cancelled.chipLabel == "CANCELLED", f, "chips en")

        LangRegistry.current = .zh
        try FixtureCheck.expect(EventCopy.priceLabel(cells: 0) == "免费", f, "price 0 zh")
        try FixtureCheck.expect(EventCopy.priceLabel(cells: 3) == "3 格能量", f, "price 3 zh")
        try FixtureCheck.expect(EventCopy.ticketPaidLine(cells: 2) == "2 格能量", f, "paid 2 zh")
        try FixtureCheck.expect(EventCTAState.resolve(open).label == "购票 · 3 格能量", f, "CTA label zh")
        try FixtureCheck.expect(EventCTAState.resolve(closed).label == "停止售票", f, "CTA closed zh")
        try FixtureCheck.expect(EventCTAState.resolve(ended).label == "活动已结束", f, "CTA ended zh")
        try FixtureCheck.expect(EventCTAState.resolve(soldOut).label == "已售罄", f, "CTA sold out zh")
        try FixtureCheck.expect(EventCopy.availabilityLine(for: open) == "3 格能量 · 143 left · 57 sold", f, "availability line zh (left/sold stay English)")
        try FixtureCheck.expect(EventCopy.paidConfirmTitle() == "购买这张门票？", f, "confirm title zh")
        try FixtureCheck.expect(EventCopy.paidConfirmBody(cells: 3, available: 7) == "将消耗 3 格能量（当前 7 格），门票立即进入我的票夹。", f, "confirm body zh")
        try FixtureCheck.expect(EventCopy.paidConfirmLabel(cells: 3) == "消耗 3 格购票", f, "confirm label zh")
        try FixtureCheck.expect(EventCopy.notEnoughEnergyToast() == "能量不足，请先充值", f, "shortfall toast zh")
        try FixtureCheck.expect(EventCopy.passCaption(valid: true) == "入场时出示此二维码", f, "caption valid zh")
        try FixtureCheck.expect(EventCopy.passCaption(valid: false) == "此票已使用", f, "caption used zh")
        try FixtureCheck.expect(TicketStatus.valid.chipLabel == "有效" && TicketStatus.used.chipLabel == "已使用" && TicketStatus.cancelled.chipLabel == "已作废", f, "chips zh")
        try FixtureCheck.expect(L10n.t("My Tickets") == "我的票夹" && L10n.t("Ticket") == "门票", f, "bar titles zh")
        try FixtureCheck.expect(L10n.t("TICKET CODE") == "票码" && L10n.t("Tap to open") == "点击查看", f, "stub labels zh")
        try FixtureCheck.expect(L10n.metaLabel("University of Warwick") == "华威大学", f, "school metaLabel zh")
    }
}
#endif
