import Foundation
import Combine

// MARK: - TicketPurchaseViewModel (square.js `buyEventTicket`, PLAN §E "Ticket purchase")
//
// One instance per `EventTicketBlock`. Flow (never charges silently):
//   cells = ceil(priceCents / 100)
//   paid  → refresh balance → `available < cells` ⇒ toast "Not enough energy — top up" + open top-up, stop
//         → confirm card (paid copy, cells + current balance in the body)
//   free  → confirm card (mock-payment copy)
//   nil (backdrop) / false (Cancel) ⇒ abort
//   POST /events/:id/purchase {}  → toast "Ticket <code> added to My Tickets", refresh balance (paid),
//                                   `onPurchased()` (the post detail reloads so remaining/sold update)
//   error ~ /not enough energy/i  → same top-up path (balance may have changed between check and charge)
//   other error                   → toast server message or "Purchase failed"
// `isPurchasing` covers the whole flow so a double tap cannot open two confirm cards or POST twice
// (`api-square §10.10`: the endpoint is not idempotent).

@MainActor
final class TicketPurchaseViewModel: ObservableObject {
    @Published private(set) var isPurchasing = false

    init() {}

    /// Buys one ticket for `event`. Returns `true` when a ticket was created.
    @discardableResult
    func buy(event: EventSummary, onPurchased: @escaping () -> Void) async -> Bool {
        guard !isPurchasing else { return false }
        isPurchasing = true
        defer { isPurchasing = false }

        let cells = event.cells
        if cells > 0 {
            // Fresh balance before the confirm card (the cached value may be a cold-start 0 or stale).
            await EnergyStore.shared.refresh()
            let available = EnergyStore.shared.available
            if available < cells {
                shortfall()
                return false
            }
            let ok = await DialogCenter.shared.confirm(
                title: EventCopy.paidConfirmTitle(),
                body: EventCopy.paidConfirmBody(cells: cells, available: available),
                confirmLabel: EventCopy.paidConfirmLabel(cells: cells),
                cancelLabel: L10n.t("Cancel")
            )
            guard ok == true else { return false }
        } else {
            let ok = await DialogCenter.shared.confirm(
                title: EventCopy.freeConfirmTitle(),
                body: EventCopy.freeConfirmBody(),
                confirmLabel: L10n.t("Confirm"),
                cancelLabel: L10n.t("Cancel")
            )
            guard ok == true else { return false }
        }

        do {
            let result = try await EventsService.purchase(eventId: event.id)
            ToastCenter.shared.show(EventCopy.purchaseSuccessToast(code: result.code))
            if cells > 0 {
                // Energy was debited in the same transaction: re-sync the bar immediately.
                await EnergyStore.shared.refresh()
            }
            onPurchased()
            return true
        } catch {
            if let api = error as? APIError {
                if api.isUnauthorized { return false }          // session already torn down
                if api.isNotEnoughEnergy {
                    shortfall()
                    return false
                }
            }
            let message = APIError.message(of: error)
            ToastCenter.shared.show(message.isEmpty ? EventCopy.purchaseFailedToast() : message)
            return false
        }
    }

    /// Toast + energy purchase page (H5 `openEnergyModal`).
    private func shortfall() {
        ToastCenter.shared.show(EventCopy.notEnoughEnergyToast())
        AppActions.shared.openEnergyPurchase()
    }
}
