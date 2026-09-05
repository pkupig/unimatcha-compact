import Foundation
import Combine

/// Energy balance cache shared by match (enhanced flow), tickets and the Profile tab.
/// Refreshed silently; cleared on `sessionDidReset`.
@MainActor
final class EnergyStore: ObservableObject {
    static let shared = EnergyStore()

    @Published var balance: EnergyBalance?
    /// True while a refresh is in flight (views may show a subtle loading state).
    @Published private(set) var isRefreshing = false

    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    /// `availableEnergy ?? total − used`; 0 when unknown.
    var available: Int { balance?.available ?? 0 }

    /// Layout of the 5-cell bar for the current balance (all-zero when unknown).
    var cells: EnergyCells { (balance ?? .zero).cells }

    /// `GET /energy/balance`; failures are silent (console only) — the bar keeps its last value (H5 parity).
    func refresh() async {
        do {
            try await refreshThrowing()
        } catch {
            #if DEBUG
            print("[EnergyStore] refresh failed: \(APIError.message(of: error))")
            #endif
        }
    }

    @discardableResult
    func refreshThrowing() async throws -> EnergyBalance {
        // Account-switch guard: callers are fire-and-forget Tasks (AppRouter, ChatSessionsStore),
        // so a balance fetched for the previous account can land after logout and show that user's
        // cell count to the next one. Publish only when the session is still the one we asked for.
        let gen = sessionGeneration
        isRefreshing = true
        defer { isRefreshing = false }
        let b = try await EnergyService.balance()
        guard gen == sessionGeneration else { return b }
        balance = b
        return b
    }

    /// Applies a server-reported available count (purchase confirm response) before the next refresh.
    func setAvailable(_ n: Int) {
        if var b = balance {
            let delta = n - b.available
            b.availableEnergy = n
            if delta > 0 { b.totalEnergy += delta }
            balance = b
        } else {
            balance = EnergyBalance(totalEnergy: n, usedEnergy: 0, availableEnergy: n)
        }
    }

    func reset() {
        sessionGeneration &+= 1
        balance = nil
        isRefreshing = false
    }

    /// Bumped only by `reset()` (logout / 401); see `refreshThrowing()`.
    private var sessionGeneration = 0
}
