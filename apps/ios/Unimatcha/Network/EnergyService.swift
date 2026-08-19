// Interface outline: implementation bodies removed.
import Foundation
struct EnergyService {
    static func getBalance() async throws -> EnergyBalance
    static func getPackages() async throws -> [EnergyPackage]
    static func purchase(packageId: String) async throws -> PurchaseIntent
    static func confirmPurchase(orderId: String, packageId: String, transactionId: String? = nil) async throws -> PurchaseConfirmResult
    static func claim(_ type: String, taskKey: String? = nil) async throws -> ClaimResult
    static func getTransactions(page: Int = 1, limit: Int = 20) async throws -> EnergyTransactionsResponse
