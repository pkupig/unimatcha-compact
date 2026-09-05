import Foundation
import CoreGraphics
import CryptoKit

/// Client-only enhanced-matching intent (H5 `localStorage.cl_enhanced_<uid>`), keyed by user id
/// so shared devices never bleed one account's toggle into another.
struct EnhancedPrefs: Codable, Equatable {
    var romanticEnabled: Bool
    var friendEnabled: Bool
    var friendCells: Int        // 1…5

    static let romanticCost = 3
    static let cellsRange = 1...5

    static let `default` = EnhancedPrefs(romanticEnabled: false, friendEnabled: false, friendCells: 1)

    init(romanticEnabled: Bool = false, friendEnabled: Bool = false, friendCells: Int = 1) {
        self.romanticEnabled = romanticEnabled
        self.friendEnabled = friendEnabled
        self.friendCells = min(max(friendCells, 1), 5)
    }

    func isEnabled(_ mode: MatchMode) -> Bool {
        mode == .romantic ? romanticEnabled : friendEnabled
    }

    /// Energy cost of joining enhanced: 3 for romantic, `friendCells` for friend.
    func cost(_ mode: MatchMode) -> Int {
        mode == .romantic ? EnhancedPrefs.romanticCost : friendCells
    }

    mutating func setEnabled(_ mode: MatchMode, _ on: Bool) {
        if mode == .romantic { romanticEnabled = on } else { friendEnabled = on }
    }
}

/// Device-level UserDefaults — NOT cleared on logout (H5 parity).
/// `cl_lang` / `cl_theme` live in `LocaleStore` / `ThemeStore` (WP-02).
enum Prefs {
    static let fabPosKey = "cl_fab_pos"

    /// The enhanced toggle is remembered per account so a shared device never bleeds one user's
    /// intent into another's. H5 keys this by the raw user id, which leaves a plaintext,permanent roster
    /// of every account that ever signed in on the handset inside an unencrypted, backed-up plist —
    /// a membership disclosure for a dating app. We key by a SHA-256 digest of the id instead:
    /// same per-account persistence, no enumerable list of who used this phone.
    static func enhancedKey(uid: String) -> String {
        let digest = SHA256.hash(data: Data(uid.utf8))
        let hex = digest.compactMap { String(format: "%02x", $0) }.joined()
        return "cl_enhanced_\(hex.prefix(32))"
    }

    private static var defaults: UserDefaults { .standard }

    /// Square FAB drag position (points, top-left origin). Nil = default placement.
    static var fabPos: CGPoint? {
        get {
            guard let arr = defaults.array(forKey: fabPosKey) as? [Double], arr.count == 2 else { return nil }
            return CGPoint(x: arr[0], y: arr[1])
        }
        set {
            if let p = newValue {
                defaults.set([Double(p.x), Double(p.y)], forKey: fabPosKey)
            } else {
                defaults.removeObject(forKey: fabPosKey)
            }
        }
    }

    static func enhanced(uid: String) -> EnhancedPrefs? {
        guard !uid.isEmpty, let data = defaults.data(forKey: enhancedKey(uid: uid)) else { return nil }
        return try? JSONDecoder().decode(EnhancedPrefs.self, from: data)
    }

    static func setEnhanced(_ prefs: EnhancedPrefs, uid: String) {
        guard !uid.isEmpty, let data = try? JSONEncoder().encode(prefs) else { return }
        defaults.set(data, forKey: enhancedKey(uid: uid))
    }
}
