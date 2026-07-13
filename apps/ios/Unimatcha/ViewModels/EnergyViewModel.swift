import Foundation
import SwiftUI

@MainActor
final class EnergyViewModel: ObservableObject {
    @Published var balance: EnergyBalance?
    @Published var packages: [EnergyPackage] = []
    @Published var transactions: [EnergyTransaction] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var infoMessage: String?

    var available: Int { balance?.availableEnergy ?? 0 }

    func load() async {
        isLoading = true; errorMessage = nil
        async let bal = try? await EnergyService.getBalance()
        async let pkgs = try? await EnergyService.getPackages()
        balance = await bal
        packages = await pkgs ?? []
        isLoading = false
    }

    func loadTransactions() async {
        if let resp = try? await EnergyService.getTransactions() { transactions = resp.items }
    }

    /// Mock purchase flow: create intent → immediately confirm (backend payment is mocked).
    func purchase(_ pkg: EnergyPackage) async {
        do {
            let intent = try await EnergyService.purchase(packageId: pkg.packageId)
            let result = try await EnergyService.confirmPurchase(orderId: intent.orderId, packageId: pkg.packageId,
                                                                 transactionId: "mock-\(intent.orderId)")
            infoMessage = "充值成功，当前能量 \(result.availableEnergy ?? available)"
            await load()
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
    }

    func dailyCheckIn() async {
        do {
            let r = try await EnergyService.claim("daily-checkin")
            infoMessage = "签到 +\(r.grantedEnergy ?? 0) 能量"
            await load()
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
    }
}
