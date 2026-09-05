import Foundation

/// `/energy/*` (`api-matching §7`). Mock two-step purchase kept as-is (StoreKit may replace it later).
enum EnergyService {
    static func balance() async throws -> EnergyBalance {
        try await APIClient.shared.request(.get("/energy/balance"))
    }

    /// Bare array on the wire (`[{packageId, cells, priceCny}]`).
    static func packages() async throws -> [EnergyPackage] {
        try await APIClient.shared.request(.get("/energy/packages"))
    }

    /// Creates the order; credits nothing until `confirm`.
    static func purchase(packageId: String) async throws -> PurchaseOrder {
        try await APIClient.shared.request(.post("/energy/purchase", body: PurchaseRequest(packageId: packageId)))
    }

    /// Settles the order (idempotent per `orderId`).
    static func confirm(orderId: String, packageId: String, transactionId: String? = nil) async throws -> PurchaseConfirm {
        try await APIClient.shared.request(.post("/energy/purchase/confirm",
                                                 body: PurchaseConfirmRequest(orderId: orderId, packageId: packageId, transactionId: transactionId)))
    }
}
