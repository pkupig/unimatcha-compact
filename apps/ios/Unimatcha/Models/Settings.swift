import Foundation

// MARK: - User settings (api-auth-users-profiles.md §3.4–§3.5, h5-settings.md §2.2–§2.4)

/// `privacy` object of `GET /users/me/settings`. Only the first three keys are rendered;
/// `searchable` / `discoverable` are decoded for completeness but never shown or written
/// (the UI was removed 2026-08-19, the backend still honours them).
struct PrivacySettings: Decodable, Equatable {
    var showProfile: Bool?
    var showOnline: Bool?
    var showMoments: Bool?
    var searchable: Bool?
    var discoverable: Bool?

    init(showProfile: Bool? = nil, showOnline: Bool? = nil, showMoments: Bool? = nil,
         searchable: Bool? = nil, discoverable: Bool? = nil) {
        self.showProfile = showProfile
        self.showOnline = showOnline
        self.showMoments = showMoments
        self.searchable = searchable
        self.discoverable = discoverable
    }

    private enum CodingKeys: String, CodingKey { case showProfile, showOnline, showMoments, searchable, discoverable }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        showProfile = c.lenient(Bool.self, .showProfile)
        showOnline = c.lenient(Bool.self, .showOnline)
        showMoments = c.lenient(Bool.self, .showMoments)
        searchable = c.lenient(Bool.self, .searchable)
        discoverable = c.lenient(Bool.self, .discoverable)
    }
}

/// The four settings the H5 page renders. `rawValue` is the H5 `data-key`.
enum SettingKey: String, CaseIterable, Hashable {
    case pushEnabled = "pushEnabled"
    case showProfile = "privacy.showProfile"
    case showOnline = "privacy.showOnline"
    case showMoments = "privacy.showMoments"

    var isPrivacy: Bool { self != .pushEnabled }

    /// JSON field name inside `privacy` (or the top-level key for `pushEnabled`).
    var jsonKey: String {
        switch self {
        case .pushEnabled: return "pushEnabled"
        case .showProfile: return "showProfile"
        case .showOnline: return "showOnline"
        case .showMoments: return "showMoments"
        }
    }

    /// English row label (dictionary key).
    var label: String {
        switch self {
        case .pushEnabled: return "Push Notifications"
        case .showProfile: return "Show my profile"
        case .showOnline: return "Show online status"
        case .showMoments: return "Show my moments"
        }
    }

    static let privacyKeys: [SettingKey] = [.showProfile, .showOnline, .showMoments]
}

/// `GET /users/me/settings` read model. Missing / non-boolean values read as `true`
/// (H5 `getSettingValue`, `SETTING_FALLBACKS` is empty).
struct UserSettings: Decodable, Equatable {
    var pushEnabled: Bool?
    var privacy: PrivacySettings?

    init(pushEnabled: Bool? = nil, privacy: PrivacySettings? = nil) {
        self.pushEnabled = pushEnabled
        self.privacy = privacy
    }

    private enum CodingKeys: String, CodingKey { case pushEnabled, privacy }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pushEnabled = c.lenient(Bool.self, .pushEnabled)
        privacy = c.lenient(PrivacySettings.self, .privacy)
    }

    /// H5 `DEFAULT_SETTINGS` — seeded when the first toggle is tapped before the GET resolved.
    static let defaults = UserSettings(
        pushEnabled: true,
        privacy: PrivacySettings(showProfile: true, showOnline: true, showMoments: true)
    )

    /// Stored boolean, `true` when missing.
    func value(_ key: SettingKey) -> Bool {
        switch key {
        case .pushEnabled: return pushEnabled ?? true
        case .showProfile: return privacy?.showProfile ?? true
        case .showOnline: return privacy?.showOnline ?? true
        case .showMoments: return privacy?.showMoments ?? true
        }
    }

    mutating func set(_ key: SettingKey, _ value: Bool) {
        switch key {
        case .pushEnabled:
            pushEnabled = value
        case .showProfile, .showOnline, .showMoments:
            var p = privacy ?? PrivacySettings()
            switch key {
            case .showProfile: p.showProfile = value
            case .showOnline: p.showOnline = value
            case .showMoments: p.showMoments = value
            default: break
            }
            privacy = p
        }
    }
}

/// `PUT /users/me/settings` body — **exactly one key**: `{"pushEnabled": v}` or
/// `{"privacy": {"<key>": v}}` (h5-settings gotcha 4: never send the whole object so the
/// hidden `searchable` / `discoverable` values are never overwritten).
struct SettingsPatch: Encodable {
    let key: SettingKey
    let value: Bool

    init(key: SettingKey, value: Bool) {
        self.key = key
        self.value = value
    }

    private struct DynamicKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ s: String) { stringValue = s }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DynamicKey.self)
        if key.isPrivacy {
            var nested = c.nestedContainer(keyedBy: DynamicKey.self, forKey: DynamicKey("privacy"))
            try nested.encode(value, forKey: DynamicKey(key.jsonKey))
        } else {
            try c.encode(value, forKey: DynamicKey("pushEnabled"))
        }
    }
}

// MARK: - Nudge suffix (api-chat-realtime-notifications.md §1.9)

/// `PUT /chat/nudge-suffix {suffix}` — raw input, ≤40 chars (server slices, no trim).
struct NudgeSuffixRequest: Encodable {
    let suffix: String
}

struct NudgeSuffixResponse: Decodable {
    var nudgeSuffix: String?

    private enum CodingKeys: String, CodingKey { case nudgeSuffix }

    init(nudgeSuffix: String?) { self.nudgeSuffix = nudgeSuffix }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nudgeSuffix = c.lenient(String.self, .nudgeSuffix)
    }
}

// MARK: - Change password (api-auth-users-profiles.md §2.4)

/// `POST /auth/change-password {currentPassword, password}` (password 8…64, both trimmed client-side).
struct ChangePasswordRequest: Encodable {
    let currentPassword: String
    let password: String
}

// MARK: - Delete account (self-service; App Store 5.1.1(v))

/// `POST /users/me/delete {password}` — re-auth confirmation before an irreversible action.
struct DeleteAccountRequest: Encodable {
    let password: String
}
