import Foundation
import Security

/// JWT storage. `kSecClassGenericPassword`, service "ai.unimatcha.token",
/// `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (never synced, never migrated to another device).
enum Keychain {
    static let service = "ai.unimatcha.token"
    static let account = "jwt"

    static func token() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        let s = String(data: data, encoding: .utf8)
        return (s?.isEmpty ?? true) ? nil : s
    }

    /// `nil` deletes the stored token.
    static func setToken(_ token: String?) {
        guard let token = token, !token.isEmpty, let data = token.data(using: .utf8) else {
            SecItemDelete(baseQuery() as CFDictionary)
            return
        }
        let query = baseQuery()
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            for (k, v) in attrs { add[k] = v }
            SecItemAdd(add as CFDictionary, nil)
        } else if status != errSecSuccess {
            // Update failed for another reason (e.g. accessibility mismatch): replace the item.
            SecItemDelete(query as CFDictionary)
            var add = query
            for (k, v) in attrs { add[k] = v }
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
