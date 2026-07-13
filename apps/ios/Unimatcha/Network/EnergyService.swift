import Foundation

struct EnergyService {
    static func getBalance() async throws -> EnergyBalance {
        try await APIClient.shared.request("/energy/balance")
    }
    static func getPackages() async throws -> [EnergyPackage] {
        try await APIClient.shared.request("/energy/packages")
    }
    static func purchase(packageId: String) async throws -> PurchaseIntent {
        try await APIClient.shared.request("/energy/purchase", method: .POST, body: PurchaseRequest(packageId: packageId))
    }
    static func confirmPurchase(orderId: String, packageId: String, transactionId: String? = nil) async throws -> PurchaseConfirmResult {
        try await APIClient.shared.request("/energy/purchase/confirm", method: .POST,
                                           body: PurchaseConfirmRequest(orderId: orderId, packageId: packageId, transactionId: transactionId))
    }
    @discardableResult
    static func claim(_ type: String, taskKey: String? = nil) async throws -> ClaimResult {
        try await APIClient.shared.request("/energy/claim", method: .POST, body: ClaimRequest(claimType: type, taskKey: taskKey))
    }
    static func getTransactions(page: Int = 1, limit: Int = 20) async throws -> EnergyTransactionsResponse {
        try await APIClient.shared.request("/energy/transactions", queryParams: ["page": "\(page)", "limit": "\(limit)"])
    }
}
