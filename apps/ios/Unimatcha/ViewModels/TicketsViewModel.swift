import Foundation
import SwiftUI
import Combine

// MARK: - TicketsViewModel (profile.js `openTickets` / `loadMyTickets` / `openTicketDetail`)
//
// App-level ticket cache (`S.myTickets`). The wallet overlay (`tickets`) loads on every open
// (H5 parity — the list is re-fetched, never trusted across opens); the pass overlay
// (`ticket-detail`) is presented on top with the tapped ticket. H5 forgets to clear
// `S.myTickets` on logout — iOS clears it on `sessionDidReset` (PLAN §A.3).

@MainActor
final class TicketsViewModel: ObservableObject {
    static let shared = TicketsViewModel()

    static let walletOverlayId = "tickets"
    static let detailOverlayId = "ticket-detail"

    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var tickets: [Ticket] = []
    @Published private(set) var state: LoadState = .idle

    /// Generation token: a reset or a newer load invalidates in-flight responses (PLAN §A.5).
    private var generation = 0
    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    var isEmpty: Bool { state == .loaded && tickets.isEmpty }

    /// `GET /events/tickets/mine`; the list replaces the cache, failures keep the previous list but
    /// switch the page to the retry state (H5 renders the error block over whatever was there).
    func load() async {
        generation += 1
        let gen = generation
        state = .loading
        do {
            let list = try await EventsService.myTickets()
            guard gen == generation else { return }
            tickets = list
            state = .loaded
        } catch {
            guard gen == generation else { return }
            if let api = error as? APIError, api.isUnauthorized {
                state = .idle          // session teardown follows; nothing to show
                return
            }
            state = .failed(APIError.message(of: error))
        }
    }

    func ticket(id: String) -> Ticket? {
        tickets.first { $0.id == id }
    }

    // MARK: Overlays (same package → presented directly, PLAN §A.2.6)

    /// Presents the wallet (`tickets`, full page, swipe-back). WP-16's `AppActions.openTickets`
    /// may call this directly.
    static func presentWallet() {
        OverlayRouter.shared.present(AppOverlay(id: walletOverlayId, style: .fullPage, swipeBack: true) {
            TicketsView()
        })
    }

    func closeWallet() {
        OverlayRouter.shared.dismiss(id: Self.walletOverlayId)
    }

    /// Presents the pass card for `ticket` (`ticket-detail`, full page, swipe-back).
    func openDetail(_ ticket: Ticket) {
        OverlayRouter.shared.present(AppOverlay(id: Self.detailOverlayId, style: .fullPage, swipeBack: true) {
            TicketDetailView(ticket: ticket)
        })
    }

    func closeDetail() {
        OverlayRouter.shared.dismiss(id: Self.detailOverlayId)
    }

    // MARK: Reset

    func reset() {
        generation += 1
        tickets = []
        state = .idle
    }
}
