import Foundation

// MARK: - Energy (enhanced matching currency)
struct EnergyBalance: Codable {
    let totalEnergy: Int
    let usedEnergy: Int
    let availableEnergy: Int
}

struct EnergyPackage: Codable, Identifiable {
    let packageId: String           // pkg_30 | pkg_60 | pkg_100
    let cells: Int
    let priceCny: Double
    var id: String { packageId }
}

struct PurchaseIntent: Codable {
    let orderId: String
    let packageId: String
    let cells: Int
    let priceCny: Double
}

struct PurchaseRequest: Codable { let packageId: String }
struct PurchaseConfirmRequest: Codable {
    let orderId: String
    let packageId: String
    let transactionId: String?
}
struct PurchaseConfirmResult: Codable {
    let success: Bool?
    let availableEnergy: Int?
    let transactionId: String?
}

struct ClaimRequest: Codable {
    let claimType: String           // registration | daily-checkin | task-complete
    let taskKey: String?
}
struct ClaimResult: Codable {
    let success: Bool?
    let grantedEnergy: Int?
    let availableEnergy: Int?
}

struct EnergyTransaction: Codable, Identifiable {
    let id: String
    let type: String                // CONSUME | REFUND | RECHARGE | CLAIM
    let amountEnergy: Int?
    let balanceAfter: Int?
    let reason: String?
    let createdAt: String?
}

struct EnergyTransactionsResponse: Codable {
    let items: [EnergyTransaction]
    let total: Int?
    let page: Int?
    let limit: Int?
}
