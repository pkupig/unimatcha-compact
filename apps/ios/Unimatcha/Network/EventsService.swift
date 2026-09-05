import Foundation

// MARK: - `/events/*` (`api-square-events-social.md §3`, JWT)
//
//   GET  /events/tickets/mine        → { tickets: [Ticket] }      (declared before `:id` on the server)
//   GET  /events/:id                 → EventDetail                 (fallback when the post carries no `event`)
//   POST /events/:id/purchase  {}    → PurchaseResult              (energy charged in the same transaction)
//
// Purchase is NOT idempotent (`api-square §10.10`) — `TicketPurchaseViewModel` guards double taps.

enum EventsService {
    /// `GET /events/:id` — 404 `Event not found`.
    static func detail(id: String) async throws -> EventDetail {
        try await APIClient.shared.request(.get("/events/\(id)"))
    }

    /// `POST /events/:id/purchase` with the H5 body `{}`. Errors (400): `Ticket sales are closed for this event`,
    /// `This event has ended`, `Ticket limit reached (2 per person)`, `Sold out`, `Not enough energy, please top up`.
    static func purchase(eventId: String) async throws -> PurchaseResult {
        try await APIClient.shared.request(.post("/events/\(eventId)/purchase", body: EmptyBody()))
    }

    /// `GET /events/tickets/mine` — newest first, includes used / cancelled tickets.
    static func myTickets() async throws -> [Ticket] {
        let wallet: TicketWallet = try await APIClient.shared.request(.get("/events/tickets/mine"))
        return wallet.tickets
    }
}
