import Foundation

/// `GET /energy/balance` (`api-matching §7.1`). `availableEnergy` is optional so
/// `available` can fall back to `total − used` (H5 parity).
struct EnergyBalance: Decodable, Equatable {
    var totalEnergy: Int
    var usedEnergy: Int
    var availableEnergy: Int?

    static let zero = EnergyBalance(totalEnergy: 0, usedEnergy: 0, availableEnergy: 0)

    init(totalEnergy: Int, usedEnergy: Int, availableEnergy: Int?) {
        self.totalEnergy = totalEnergy
        self.usedEnergy = usedEnergy
        self.availableEnergy = availableEnergy
    }

    private enum CodingKeys: String, CodingKey { case totalEnergy, usedEnergy, availableEnergy }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totalEnergy = c.lenientInt(.totalEnergy) ?? 0
        usedEnergy = c.lenientInt(.usedEnergy) ?? 0
        availableEnergy = c.lenientInt(.availableEnergy)
    }

    /// `availableEnergy ?? total − used`
    var available: Int { availableEnergy ?? (totalEnergy - usedEnergy) }

    /// Energy bar layout (`h5-profile §1.2`): max 5 squares, filled = available, empty = used, `+N` overflow.
    var cells: EnergyCells { EnergyCells(balance: self) }
}

/// Pure layout of the 5-cell energy bar: `filled` neon squares, `empty` outlined squares, `extra` = "+N".
struct EnergyCells: Equatable {
    let filled: Int
    let empty: Int
    let extra: Int
    /// True when there is nothing at all to draw (H5 shows a muted "0").
    var isZero: Bool { filled == 0 && empty == 0 && extra == 0 }

    static let maxCells = 5

    init(balance: EnergyBalance) {
        let avail = max(0, balance.available)
        let total = max(avail, balance.totalEnergy)
        let filled = min(avail, EnergyCells.maxCells)
        let empty = min(max(total - avail, 0), EnergyCells.maxCells - filled)
        self.filled = filled
        self.empty = empty
        self.extra = total > EnergyCells.maxCells ? total - EnergyCells.maxCells : 0
    }
}

/// `GET /energy/packages` item: `{ packageId: 'pkg_30', cells: 30, priceCny: 30 }`.
struct EnergyPackage: Decodable, Identifiable, Equatable {
    var packageId: String
    var cells: Int
    var priceCny: Int
    var id: String { packageId }

    init(packageId: String, cells: Int, priceCny: Int) {
        self.packageId = packageId
        self.cells = cells
        self.priceCny = priceCny
    }

    private enum CodingKeys: String, CodingKey { case packageId, cells, priceCny }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        packageId = c.lenient(String.self, .packageId) ?? ""
        cells = c.lenientInt(.cells) ?? 0
        // priceCny is an integer on the wire; tolerate 58.0.
        priceCny = c.lenientInt(.priceCny) ?? 0
    }

    /// Static fallback shown before/if `/energy/packages` answers (`h5-profile §3`).
    static let fallback: [EnergyPackage] = [
        EnergyPackage(packageId: "pkg_30", cells: 30, priceCny: 30),
        EnergyPackage(packageId: "pkg_60", cells: 60, priceCny: 58),
        EnergyPackage(packageId: "pkg_100", cells: 100, priceCny: 88),
    ]
}

/// `POST /energy/purchase` → order (nothing credited yet).
struct PurchaseOrder: Decodable, Equatable {
    var orderId: String
    var packageId: String?
    var cells: Int?
    var priceCny: Int?

    private enum CodingKeys: String, CodingKey { case orderId, packageId, cells, priceCny }

    init(orderId: String, packageId: String? = nil, cells: Int? = nil, priceCny: Int? = nil) {
        self.orderId = orderId; self.packageId = packageId; self.cells = cells; self.priceCny = priceCny
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        orderId = c.lenient(String.self, .orderId) ?? ""
        packageId = c.lenient(String.self, .packageId)
        cells = c.lenientInt(.cells)
        priceCny = c.lenientInt(.priceCny)
    }
}

/// `POST /energy/purchase/confirm` → `{ success, availableEnergy, transactionId }`.
struct PurchaseConfirm: Decodable, Equatable {
    var success: Bool?
    var availableEnergy: Int?
    var transactionId: String?

    private enum CodingKeys: String, CodingKey { case success, availableEnergy, transactionId }

    init(success: Bool? = nil, availableEnergy: Int? = nil, transactionId: String? = nil) {
        self.success = success; self.availableEnergy = availableEnergy; self.transactionId = transactionId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = c.lenientBool(.success)
        availableEnergy = c.lenientInt(.availableEnergy)
        transactionId = c.lenient(String.self, .transactionId)
    }
}

// MARK: - Request DTOs (exact keys only — forbidNonWhitelisted)

struct PurchaseRequest: Encodable {
    let packageId: String
}

struct PurchaseConfirmRequest: Encodable {
    let orderId: String
    let packageId: String
    var transactionId: String? = nil
}
