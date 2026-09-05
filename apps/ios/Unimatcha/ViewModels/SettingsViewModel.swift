import Foundation
import Combine

// MARK: - SettingsViewModel (h5-settings.md §2.1–§2.8, §3)
//
// One instance per opened Settings overlay (created by `SettingsView`), so every open starts
// with an empty nudge input (D20 — the server never returns the saved suffix) and freshly
// loaded toggles. Toggles are optimistic single-key PUTs with the two H5 race guards:
//   B28 per-key in-flight dedup (taps on a saving key are ignored, no queueing);
//   B29 the GET snapshot is dropped while any PUT is pending.

@MainActor
final class SettingsViewModel: ObservableObject {
    static let nudgeMaxLength = 40
    static let passwordMinLength = 8
    static let contactEmail = "contact@unimatcha.ai"
    static let fallbackEmail = "user@example.edu"

    /// `null` until the GET resolves or a toggle seeds the defaults; `nil` renders every toggle ON.
    @Published private(set) var settings: UserSettings?
    @Published private(set) var saving: Set<SettingKey> = []
    @Published var nudgeSuffix: String = ""
    @Published private(set) var nudgeSaving: Bool = false
    @Published private(set) var passwordBusy: Bool = false
    @Published private(set) var deleteBusy: Bool = false

    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reset() }
            .store(in: &cancellables)
    }

    // MARK: Derived

    /// `S.currentUser.email` or the H5 fallback text.
    var email: String {
        let e = SessionStore.shared.currentUser?.email ?? ""
        return e.isEmpty ? SettingsViewModel.fallbackEmail : e
    }

    /// "Unimatcha v<CFBundleShortVersionString>" (H5 hard-codes v2.4.0; iOS reads the bundle).
    static var versionLine: String {
        let v = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return "Unimatcha v" + (v.isEmpty ? "2.4.0" : v)
    }

    /// H5 `getSettingValue`: stored boolean, `true` when missing / unloaded.
    func value(_ key: SettingKey) -> Bool {
        settings?.value(key) ?? true
    }

    func isSaving(_ key: SettingKey) -> Bool { saving.contains(key) }

    // MARK: Open / load

    /// `openSettings()`: nudge input empty, toggles from cache (all ON while unloaded), then GET.
    func onOpen() {
        nudgeSuffix = ""
        Task { await load() }
    }

    /// `loadUserSettings()` — snapshot adopted only when no toggle PUT is in flight (B29); failures swallowed.
    func load() async {
        do {
            let s = try await SettingsService.settings()
            guard saving.isEmpty else { return }
            settings = s
        } catch {
            // keep defaults / cached values
        }
    }

    // MARK: Toggles

    /// `toggleSetting(key)`: seed defaults → B28 guard → optimistic flip → single-key PUT → revert on failure.
    func toggle(_ key: SettingKey) async {
        if settings == nil { settings = UserSettings.defaults }
        guard !saving.contains(key) else { return }
        let next = !value(key)
        settings?.set(key, next)
        saving.insert(key)
        defer { saving.remove(key) }
        do {
            try await SettingsService.update(SettingsPatch(key: key, value: next))
            // Echo deliberately ignored: keeps the optimistic value so concurrent flips are not clobbered.
        } catch {
            settings?.set(key, !next)
            ToastCenter.shared.show(L10n.pick("Failed to save setting", "设置保存失败"))
        }
    }

    // MARK: Nudge suffix

    /// Enforces `maxlength=40` on the input (server also slices; no trimming on either side).
    func clampNudge() {
        if nudgeSuffix.count > SettingsViewModel.nudgeMaxLength {
            nudgeSuffix = String(nudgeSuffix.prefix(SettingsViewModel.nudgeMaxLength))
        }
    }

    /// `saveNudgeSuffix()`: busy → `PUT /chat/nudge-suffix` → toast `Saved` / `Failed: …`.
    func saveNudge() async {
        guard !nudgeSaving else { return }
        nudgeSaving = true
        defer { nudgeSaving = false }
        let raw = String(nudgeSuffix.prefix(SettingsViewModel.nudgeMaxLength))
        do {
            try await SettingsService.setNudgeSuffix(raw)
            ToastCenter.shared.show(L10n.pick("Saved", "已保存"))
        } catch {
            let msg = APIError.message(of: error)
            ToastCenter.shared.show(L10n.t("Failed: ") + (msg.isEmpty ? L10n.pick("try again", "请重试") : msg))
        }
    }

    // MARK: Change password (two secure prompt cards, §1.4 / §2.7)

    func changePassword() async {
        guard !passwordBusy else { return }
        let title = L10n.pick("Change password", "修改密码")
        guard let currentRaw = await DialogCenter.shared.prompt(
            title: title,
            label: L10n.pick("Current password", "当前密码"),
            placeholder: L10n.placeholder("Enter your current password"),
            confirmLabel: L10n.t("Next"),
            cancelLabel: L10n.t("Cancel"),
            secure: true
        ) else { return }
        guard let newRaw = await DialogCenter.shared.prompt(
            title: title,
            label: L10n.pick("New password", "新密码"),
            placeholder: L10n.placeholder("At least 8 characters"),
            confirmLabel: L10n.pick("Change", "修改"),
            cancelLabel: L10n.t("Cancel"),
            secure: true
        ) else { return }

        let current = currentRaw.trimmingCharacters(in: .whitespacesAndNewlines)
        let new = newRaw.trimmingCharacters(in: .whitespacesAndNewlines)
        if current.isEmpty {
            ToastCenter.shared.show(L10n.pick("Enter your current password", "请输入当前密码"))
            return
        }
        if new.count < SettingsViewModel.passwordMinLength {
            ToastCenter.shared.show(L10n.pick("Password must be at least 8 characters", "密码至少 8 位"))
            return
        }
        passwordBusy = true
        defer { passwordBusy = false }
        do {
            try await SettingsService.changePassword(current: current, new: new)
            ToastCenter.shared.show(L10n.pick("Password changed", "密码已修改"))
        } catch {
            let msg = APIError.message(of: error)
            ToastCenter.shared.show(msg.isEmpty ? L10n.pick("Failed to change password", "修改密码失败") : msg)
        }
    }

    // MARK: Dark mode / language / logout

    /// `toggleDarkMode()` (i18n.js): flips + persists immediately (no reload), toast
    /// `Dark mode on` / `Light mode on` for 3 s. Static because the other entry point is the
    /// chat "+" popover (WP-06 → `AppActions.toggleDarkMode`, wired by WP-16) which has no
    /// Settings view model.
    static func toggleDarkMode() {
        ThemeStore.shared.toggle()
        ToastCenter.shared.show(L10n.t(ThemeStore.shared.isDark ? "Dark mode on" : "Light mode on"))
    }

    func toggleDarkMode() {
        SettingsViewModel.toggleDarkMode()
    }

    func logout() {
        AppActions.shared.requestLogout()
    }

    // MARK: Delete account (self-service; App Store 5.1.1(v) — mirrors H5 `deleteAccount()`)

    /// Danger confirm → secure password re-auth → `POST /users/me/delete` → same teardown as
    /// logout. Two steps (not a single confirm) because this is irreversible and, unlike logout,
    /// destroys data — worth a beat of friction beyond a single tap.
    func deleteAccount() async {
        guard !deleteBusy else { return }
        let confirmed = await DialogCenter.shared.confirm(
            title: L10n.pick("Delete your account?", "确定要注销账号吗？"),
            body: L10n.pick(
                "This permanently deletes your profile, photos and personal information. Your existing chats and matches keep working for the other person, but you will no longer be able to sign in. This cannot be undone.",
                "这将永久删除你的资料、照片与个人信息。你已有的聊天和匹配记录仍会保留在对方那边，但你之后将无法再登录。此操作不可撤销。"
            ),
            confirmLabel: L10n.pick("Delete Account", "注销账号"),
            cancelLabel: L10n.t("Cancel"),
            danger: true
        )
        guard confirmed == true else { return }

        guard let passwordRaw = await DialogCenter.shared.prompt(
            title: L10n.pick("Confirm your password", "请确认密码"),
            label: L10n.pick("Password", "密码"),
            placeholder: L10n.placeholder("Enter your password to continue"),
            confirmLabel: L10n.pick("Delete Account", "注销账号"),
            cancelLabel: L10n.t("Cancel"),
            secure: true
        ) else { return }
        let password = passwordRaw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !password.isEmpty else {
            ToastCenter.shared.show(L10n.pick("Password is required", "请输入密码"))
            return
        }

        deleteBusy = true
        defer { deleteBusy = false }
        do {
            try await SettingsService.deleteAccount(password: password)
            ToastCenter.shared.show(L10n.pick("Your account has been deleted", "你的账号已注销"))
            SessionStore.shared.logout()
        } catch {
            let msg = APIError.message(of: error)
            ToastCenter.shared.show(msg.isEmpty ? L10n.pick("Failed to delete account", "注销失败") : msg)
        }
    }

    // MARK: Report a problem (§2.8)

    /// Returns `true` on success (caller closes the card). Empty description → toast, no request.
    static func submitReport(category: ReportCategory, content: String, contact: String) async -> Bool {
        let desc = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !desc.isEmpty else {
            ToastCenter.shared.show(L10n.pick("Please describe the problem", "请描述遇到的问题"))
            return false
        }
        let who = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await ReportService.submit(category: category, content: desc, contact: who.isEmpty ? nil : who)
            ToastCenter.shared.show(L10n.pick("Report submitted. Thank you!", "反馈已提交，谢谢！"))
            return true
        } catch {
            let msg = APIError.message(of: error)
            ToastCenter.shared.show(msg.isEmpty ? L10n.pick("Failed to submit report", "提交反馈失败") : msg)
            return false
        }
    }

    // MARK: Reset

    func reset() {
        settings = nil
        saving = []
        nudgeSuffix = ""
        nudgeSaving = false
        passwordBusy = false
        deleteBusy = false
    }
}
