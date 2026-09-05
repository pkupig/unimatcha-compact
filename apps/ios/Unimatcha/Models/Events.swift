import Foundation

// MARK: - Events & tickets models (`api-square-events-social.md §3`, `ios-models-network.md §3.11`)
//
// `EventSummary` (the `event` sub-object embedded in square posts) lives in `Models/Common.swift`
// (WP-01) because the square cards and the ticket block both read it. This file adds the three
// `/events/*` payloads plus the pure display rules the H5 applies to them (price label, CTA state,
// ticket paid line) so views and the fixture check share one implementation.

// MARK: - GET /events/:id

/// `createdByAdmin: { name, role, organizationName }` on the event detail.
struct EventAdminInfo: Decodable, Equatable {
    var name: String?
    var role: String?
    var organizationName: String?

    init(name: String? = nil, role: String? = nil, organizationName: String? = nil) {
        self.name = name; self.role = role; self.organizationName = organizationName
    }

    private enum CodingKeys: String, CodingKey { case name, role, organizationName }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.lenient(String.self, .name)
        role = c.lenient(String.self, .role)
        organizationName = c.lenient(String.self, .organizationName)
    }
}

/// `GET /events/:id` — every `Event` column plus `createdByAdmin`, `post`, `remaining`, `myTickets`.
/// H5 only fetches this as a fallback when the event is missing from the post caches.
struct EventDetail: Decodable, Identifiable, Equatable {
    var id: String
    var title: String
    var content: String
    var images: [String]
    var school: String?
    var venue: String?
    var startAt: String
    var endAt: String?
    var priceCents: Int
    var capacity: Int?
    var ticketsSold: Int
    var status: String
    var createdByAdminId: String?
    var createdAt: String?
    var updatedAt: String?
    var createdByAdmin: EventAdminInfo?
    /// The linked square post (`{ id }`), nil when none.
    var postId: String?
    /// Server-computed `capacity == null ? null : max(0, capacity - ticketsSold)`.
    var remainingFromServer: Int?
    /// My non-cancelled tickets for this event.
    var myTickets: Int

    private enum CodingKeys: String, CodingKey {
        case id, title, content, images, school, venue, startAt, endAt, priceCents, capacity, ticketsSold, status,
             createdByAdminId, createdAt, updatedAt, createdByAdmin, post, remaining, myTickets
    }

    private struct PostRef: Decodable {
        var id: String?
        private enum CodingKeys: String, CodingKey { case id }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = c.lenient(String.self, .id)
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = c.lenient(String.self, .title) ?? ""
        content = c.lenient(String.self, .content) ?? ""
        images = c.lenient([String].self, .images) ?? []
        school = c.lenient(String.self, .school)
        venue = c.lenient(String.self, .venue)
        startAt = c.lenient(String.self, .startAt) ?? ""
        endAt = c.lenient(String.self, .endAt)
        priceCents = c.lenientInt(.priceCents) ?? 0
        capacity = c.lenientInt(.capacity)
        ticketsSold = c.lenientInt(.ticketsSold) ?? 0
        status = c.lenient(String.self, .status) ?? "published"
        createdByAdminId = c.lenient(String.self, .createdByAdminId)
        createdAt = c.lenient(String.self, .createdAt)
        updatedAt = c.lenient(String.self, .updatedAt)
        createdByAdmin = c.lenient(EventAdminInfo.self, .createdByAdmin)
        postId = c.lenient(PostRef.self, .post)?.id
        remainingFromServer = c.lenientInt(.remaining)
        myTickets = c.lenientInt(.myTickets) ?? 0
    }

    /// The same shape the square posts carry — every purchase / CTA rule is written against it.
    var summary: EventSummary {
        EventSummary(id: id, title: title, venue: venue, school: school, startAt: startAt, endAt: endAt,
                     priceCents: priceCents, capacity: capacity, ticketsSold: ticketsSold, status: status, images: images)
    }

    /// Server value when present, else the client rule (`EventSummary.remaining`).
    var remaining: Int? { remainingFromServer ?? summary.remaining }
}

// MARK: - POST /events/:id/purchase

/// `event: { id, title, startAt, venue }` inside the purchase response.
struct PurchasedEventRef: Decodable, Equatable {
    var id: String?
    var title: String?
    var startAt: String?
    var venue: String?

    init(id: String? = nil, title: String? = nil, startAt: String? = nil, venue: String? = nil) {
        self.id = id; self.title = title; self.startAt = startAt; self.venue = venue
    }

    private enum CodingKeys: String, CodingKey { case id, title, startAt, venue }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id)
        title = c.lenient(String.self, .title)
        startAt = c.lenient(String.self, .startAt)
        venue = c.lenient(String.self, .venue)
    }
}

/// `{ ticketId, code: "UMT-…", event, pricePaidCents, cellsPaid }` — H5 only reads `code`.
struct PurchaseResult: Decodable, Equatable {
    var ticketId: String
    var code: String
    var event: PurchasedEventRef?
    var pricePaidCents: Int
    var cellsPaid: Int

    init(ticketId: String, code: String, event: PurchasedEventRef? = nil, pricePaidCents: Int = 0, cellsPaid: Int = 0) {
        self.ticketId = ticketId; self.code = code; self.event = event; self.pricePaidCents = pricePaidCents; self.cellsPaid = cellsPaid
    }

    private enum CodingKeys: String, CodingKey { case ticketId, code, event, pricePaidCents, cellsPaid }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ticketId = c.lenient(String.self, .ticketId) ?? ""
        code = c.lenient(String.self, .code) ?? ""
        event = c.lenient(PurchasedEventRef.self, .event)
        pricePaidCents = c.lenientInt(.pricePaidCents) ?? 0
        cellsPaid = c.lenientInt(.cellsPaid) ?? 0
    }
}

// MARK: - GET /events/tickets/mine

/// String status column: `valid | used | cancelled` (unknown values render like `used`, i.e. non-valid).
enum TicketStatus: String, Equatable {
    case valid, used, cancelled

    /// Chip label — dictionary keys `VALID` / `USED` / `CANCELLED` (zh 有效 / 已使用 / 已作废).
    var chipLabel: String {
        switch self {
        case .valid: return L10n.t("VALID")
        case .used: return L10n.t("USED")
        case .cancelled: return L10n.t("CANCELLED")
        }
    }
}

/// One wallet entry. `event` is the slim `{ id, title, venue, school, startAt, endAt, status, images }`
/// projection decoded into `EventSummary` (price/capacity default to 0 — never read on tickets).
struct Ticket: Decodable, Identifiable, Equatable {
    var id: String
    var code: String
    var eventId: String?
    var userId: String?
    var pricePaidCents: Int
    var rawStatus: String
    var usedAt: String?
    var createdAt: String?
    var event: EventSummary?

    init(id: String, code: String, eventId: String? = nil, userId: String? = nil, pricePaidCents: Int = 0,
         status: String = "valid", usedAt: String? = nil, createdAt: String? = nil, event: EventSummary? = nil) {
        self.id = id; self.code = code; self.eventId = eventId; self.userId = userId; self.pricePaidCents = pricePaidCents
        self.rawStatus = status; self.usedAt = usedAt; self.createdAt = createdAt; self.event = event
    }

    private enum CodingKeys: String, CodingKey { case id, code, eventId, userId, pricePaidCents, status, usedAt, createdAt, event }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        code = c.lenient(String.self, .code) ?? ""
        eventId = c.lenient(String.self, .eventId)
        userId = c.lenient(String.self, .userId)
        pricePaidCents = c.lenientInt(.pricePaidCents) ?? 0
        rawStatus = c.lenient(String.self, .status) ?? "valid"
        usedAt = c.lenient(String.self, .usedAt)
        createdAt = c.lenient(String.self, .createdAt)
        event = c.lenient(EventSummary.self, .event)
        if eventId == nil { eventId = event?.id }
    }

    /// `valid` / `used` / `cancelled`; anything unexpected is treated as `used` (non-valid, dimmed).
    var status: TicketStatus { TicketStatus(rawValue: rawStatus.lowercased()) ?? .used }
    var isValid: Bool { status == .valid }

    /// `event.title || 'Event'`
    var displayTitle: String {
        let t = event?.title ?? ""
        return t.isEmpty ? "Event" : t
    }

    /// `ceil(pricePaidCents / 100)`; 0 for free tickets (the paid line is hidden then).
    var paidCells: Int { pricePaidCents <= 0 ? 0 : Int((Double(pricePaidCents) / 100.0).rounded(.up)) }

    /// Paid line: `N cell(s)` / zh `N 格能量`; nil when the ticket was free.
    var paidLine: String? {
        let cells = paidCells
        guard cells > 0 else { return nil }
        return EventCopy.ticketPaidLine(cells: cells)
    }

    var startDate: Date? { event?.startDate }

    /// `YYYY-MM-DD HH:mm` + ` · venue` (stub line). Empty date when `startAt` is unparseable.
    var stubLine: String {
        var s = startDate.map { Formatters.ticketDateTime($0) } ?? ""
        if let v = event?.venue, !v.isEmpty {
            s += (s.isEmpty ? "" : " · ") + v
        }
        return s
    }
}

/// `{ tickets: [Ticket] }` — ordered `createdAt desc` by the server.
struct TicketWallet: Decodable, Equatable {
    var tickets: [Ticket]

    init(tickets: [Ticket]) { self.tickets = tickets }

    private enum CodingKeys: String, CodingKey { case tickets }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tickets = c.lenient([Ticket].self, .tickets) ?? []
    }
}

// MARK: - Display rules shared by the block, the wallet and the fixture check

/// Language-aware copy the H5 composes at render time (`eventPrice`, `paidLine`, confirm cards).
enum EventCopy {
    /// square.js `eventPrice`: `Free` (dictionary) or `N energy cell(s)` / zh `N 格能量`.
    static func priceLabel(cells: Int) -> String {
        guard cells > 0 else { return L10n.t("Free") }
        return L10n.pick("\(cells) energy \(cells == 1 ? "cell" : "cells")", "\(cells) 格能量")
    }

    static func priceLabel(for event: EventSummary) -> String {
        priceLabel(cells: event.cells)
    }

    /// profile.js `paidLine`: `N cell(s)` / zh `N 格能量`.
    static func ticketPaidLine(cells: Int) -> String {
        L10n.pick("\(cells) \(cells == 1 ? "cell" : "cells")", "\(cells) 格能量")
    }

    /// Detail block schedule line: `M/D HH:mm` (+ ` – M/D HH:mm` when `endAt` is set).
    static func scheduleLine(for event: EventSummary) -> String {
        var s = event.startDate.map { Formatters.eventStrip($0) } ?? ""
        if let end = event.endDate {
            s += " – " + Formatters.eventStrip(end)
        }
        return s
    }

    /// Detail block price line: `<price>` + ` · N left` (capacity set) + ` · N sold` (English only in H5).
    static func availabilityLine(for event: EventSummary) -> String {
        var s = priceLabel(for: event)
        if let r = event.remaining { s += " · \(r) left" }
        s += " · \(event.ticketsSold) sold"
        return s
    }

    /// Paid purchase confirm card (h5-square §1.7).
    static func paidConfirmTitle() -> String { L10n.pick("Get this ticket?", "购买这张门票？") }

    static func paidConfirmBody(cells: Int, available: Int) -> String {
        L10n.pick(
            "\(cells) energy \(cells == 1 ? "cell" : "cells") will be spent now (you have \(available)). The ticket lands in My Tickets instantly.",
            "将消耗 \(cells) 格能量（当前 \(available) 格），门票立即进入我的票夹。"
        )
    }

    static func paidConfirmLabel(cells: Int) -> String {
        L10n.pick("Spend \(cells) & get ticket", "消耗 \(cells) 格购票")
    }

    /// Free purchase confirm card (English in H5; zh added per D3).
    static func freeConfirmTitle() -> String { L10n.pick("Get this ticket?", "购买这张门票？") }

    static func freeConfirmBody() -> String {
        L10n.pick("Payment is mocked in beta — the ticket lands in My Tickets instantly.",
                  "测试期支付为模拟——门票立即进入我的票夹。")
    }

    static func notEnoughEnergyToast() -> String { L10n.t("Not enough energy — top up") }

    static func purchaseSuccessToast(code: String) -> String {
        L10n.pick("Ticket \(code) added to My Tickets", "门票 \(code) 已加入我的票夹")
    }

    static func purchaseFailedToast() -> String { L10n.pick("Purchase failed", "购票失败") }

    /// Pass-card caption.
    static func passCaption(valid: Bool) -> String {
        valid ? L10n.t("Show this QR at the entrance") : L10n.pick("This ticket has been used", "此票已使用")
    }
}

/// CTA state of the event block (`eventDetailBlock`): evaluated in this order —
/// `status != published` → Sales closed; `(endAt ?? startAt) < now` → Event ended;
/// `remaining <= 0` → Sold out; else `Get Ticket · <price>`.
enum EventCTAState: Equatable {
    case salesClosed
    case ended
    case soldOut
    case available(priceLabel: String)

    static func resolve(_ event: EventSummary, now: Date = Date()) -> EventCTAState {
        if event.isClosed { return .salesClosed }
        if let end = event.endDate ?? event.startDate, end < now { return .ended }
        if event.isSoldOut { return .soldOut }
        return .available(priceLabel: EventCopy.priceLabel(for: event))
    }

    var isDisabled: Bool {
        if case .available = self { return false }
        return true
    }

    var label: String {
        switch self {
        case .salesClosed: return L10n.t("Sales closed")
        case .ended: return L10n.t("Event ended")
        case .soldOut: return L10n.t("Sold out")
        case .available(let price): return L10n.t("Get Ticket") + " · " + price
        }
    }
}
