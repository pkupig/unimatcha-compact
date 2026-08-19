// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var balance: EnergyBalance?
    @Published var packages: [EnergyPackage] = []
    @Published var transactions: [EnergyTransaction] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var infoMessage: String?
    var available: Int { balance?.availableEnergy ?? 0 }
    func load() async
    func loadTransactions() async
    func purchase(_ pkg: EnergyPackage) async
    func dailyCheckIn() async
