import Foundation
import SwiftUI

// MARK: - EnergyPurchaseViewModel (profile.js `openEnergyModal` … `confirmEnergyPurchase`)
//
// Mock two-step top-up (PLAN §E "Purchase page"): pick a package → pick a payment channel →
// `POST /energy/purchase {packageId}` → `POST /energy/purchase/confirm {orderId, packageId}`.
// The order is created only when Pay is tapped (H5 fixed a "half order on every card tap" bug),
// the payment method is cosmetic (never sent), and the confirm response's `availableEnergy` is
// applied before a full `EnergyStore.refresh()` re-syncs total / used.

@MainActor
final class EnergyPurchaseViewModel: ObservableObject {
    nonisolated static let overlayId = "energy-purchase"

    /// The three cosmetic channels of `#payment-methods` (H5 `data-method`).
    enum PaymentMethod: String, CaseIterable, Identifiable {
        case wechat, alipay, stripe

        var id: String { rawValue }

        /// Material icon name (mapped to SF by `Theme.Icon.sf`).
        var icon: String {
            switch self {
            case .wechat: return "chat"
            case .alipay: return "account_balance_wallet"
            case .stripe: return "credit_card"
            }
        }

        var label: String {
            switch self {
            case .wechat: return L10n.t("WeChat Pay")
            case .alipay: return L10n.t("Alipay")
            case .stripe: return L10n.t("Card (Stripe)")
            }
        }
    }

    /// Static markup fallback (`pkg_30` 30/¥30 · `pkg_60` 60/¥58 · `pkg_100` 100/¥88); replaced by
    /// `GET /energy/packages` on every open, kept as-is when that call fails.
    @Published private(set) var packages: [EnergyPackage] = EnergyPackage.fallback
    @Published private(set) var selectedPackageId: String?
    @Published private(set) var selectedMethod: PaymentMethod?
    /// `energyPurchaseBusy` — blocks selection changes and re-entrant Pay taps.
    @Published private(set) var busy = false

    /// `onOpen()` runs once per presentation: `present()` fires it, and a standalone caller gets
    /// it from the view's `onAppear` (a re-`present()` of the same id replaces the layer in place,
    /// so `onAppear` would not fire again).
    private var didOpen = false
    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    deinit {
        if let o = resetObserver { NotificationCenter.default.removeObserver(o) }
    }

    // MARK: Derived state

    var selectedPackage: EnergyPackage? {
        guard let id = selectedPackageId else { return nil }
        return packages.first { $0.packageId == id }
    }

    /// `updateEnergyPayButton()`: "Select a package" → "Select a payment method" →
    /// "Pay ¥58 · 60 cells" → "Processing…".
    var ctaTitle: String {
        if busy { return L10n.pick("Processing…", "处理中…") }
        guard let pkg = selectedPackage else { return L10n.t("Select a package") }
        guard selectedMethod != nil else { return L10n.t("Select a payment method") }
        return Self.payTitle(for: pkg)
    }

    nonisolated static func payTitle(for pkg: EnergyPackage) -> String {
        L10n.pick("Pay ¥\(pkg.priceCny) · \(pkg.cells) cells",
                  "支付 ¥\(pkg.priceCny) · \(pkg.cells) 格")
    }

    var ctaEnabled: Bool { !busy && selectedPackage != nil && selectedMethod != nil }

    func isSelected(_ pkg: EnergyPackage) -> Bool { pkg.packageId == selectedPackageId }
    func isSelected(_ method: PaymentMethod) -> Bool { method == selectedMethod }

    // MARK: Lifecycle

    /// Every open clears the selection (a stale pick from a previous session must not be payable)
    /// and re-reads the package list.
    func onOpen() {
        didOpen = true
        selectedPackageId = nil
        selectedMethod = nil
        busy = false
        Task { await loadPackages() }
    }

    func onOpenIfNeeded() {
        guard !didOpen else { return }
        onOpen()
    }

    /// `GET /energy/packages`; silent on failure — the static cards stay (H5 parity).
    func loadPackages() async {
        do {
            let list = try await EnergyService.packages()
            guard !list.isEmpty else { return }
            packages = list
            // The refreshed list may not contain the pick made against the fallback cards.
            if let id = selectedPackageId, !list.contains(where: { $0.packageId == id }) {
                selectedPackageId = nil
            }
        } catch {
            #if DEBUG
            print("[EnergyPurchase] packages load failed: \(APIError.message(of: error))")
            #endif
        }
    }

    // MARK: Selection (pure UI — nothing is ordered yet)

    func select(package: EnergyPackage) {
        guard !busy else { return }
        selectedPackageId = package.packageId
    }

    func select(method: PaymentMethod) {
        guard !busy else { return }
        selectedMethod = method
    }

    // MARK: Pay

    func pay() async {
        guard !busy else { return }
        guard let pkg = selectedPackage else {
            ToastCenter.shared.show(L10n.pick("Please select a package first", "请先选择套餐"))
            return
        }
        guard selectedMethod != nil else {
            ToastCenter.shared.show(L10n.pick("Please select a payment method", "请选择支付方式"))
            return
        }
        busy = true
        defer { busy = false }
        do {
            let order = try await EnergyService.purchase(packageId: pkg.packageId)
            guard !order.orderId.isEmpty else {
                throw APIError.http(status: 200, message: L10n.pick("No order id returned", "未返回订单号"))
            }
            // `transactionId` is omitted in the mock; a real SDK supplies it here.
            let confirm = try await EnergyService.confirm(orderId: order.orderId, packageId: pkg.packageId)
            if let available = confirm.availableEnergy {
                EnergyStore.shared.setAvailable(available)
            }
            close()
            await EnergyStore.shared.refresh()      // re-sync total / used from the server
            ToastCenter.shared.show(L10n.pick("Recharge successful", "充值成功"))
        } catch {
            if (error as? APIError)?.isUnauthorized == true { return }   // session teardown already ran
            ToastCenter.shared.show(L10n.pick("Payment failed: ", "支付失败：") + APIError.message(of: error))
        }
    }

    // MARK: Overlay plumbing (own package → presented directly, PLAN §A.2.6)

    func reset() {
        packages = EnergyPackage.fallback
        selectedPackageId = nil
        selectedMethod = nil
        busy = false
        didOpen = false
    }

    /// `AppActions.openEnergyPurchase` (WP-16) and every "not enough energy" path land here.
    @MainActor
    static func present() {
        let vm = EnergyPurchaseViewModel()
        vm.onOpen()
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .fullPage, swipeBack: true) {
            EnergyPurchaseView(vm: vm)
        })
    }

    func close() {
        OverlayRouter.shared.dismiss(id: Self.overlayId)
    }
}
