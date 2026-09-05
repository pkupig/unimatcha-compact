import Foundation
import Combine

// MARK: - AuthValidation (pure rules of h5-auth §2.2 — verified by AuthFixtures)

enum AuthValidation {
    static let minPasswordLength = 8
    static let codeLength = 6

    /// `/^\d{6}$/`
    static func isSixDigitCode(_ s: String) -> Bool {
        s.count == codeLength && s.allSatisfy { $0.isASCII && $0.isNumber }
    }

    /// Toast text for the Sign In form, nil when valid. (Inputs already trimmed by the caller.)
    static func loginError(email: String, password: String) -> String? {
        if email.isEmpty || password.isEmpty { return AuthCopy.fillAllFields }
        return nil
    }

    /// Toast text for the Register form in H5 order: all four non-empty → 6-digit code →
    /// password ≥ 8 → password == confirm. Nil when valid.
    static func registerError(email: String, code: String, password: String, confirm: String) -> String? {
        if email.isEmpty || code.isEmpty || password.isEmpty || confirm.isEmpty { return AuthCopy.fillAllFields }
        if !isSixDigitCode(code) { return AuthCopy.enterSixDigitCode }
        if password.count < minPasswordLength { return AuthCopy.passwordTooShort }
        if password != confirm { return AuthCopy.passwordsMismatch }
        return nil
    }
}

// MARK: - AuthCopy (package-local strings; zh through `L10n.pick`, D3)

enum AuthCopy {
    static var fillAllFields: String { L10n.pick("Please fill all fields", "请填写所有字段") }
    static var enterSixDigitCode: String { L10n.pick("Enter the 6-digit email verification code", "请输入 6 位邮箱验证码") }
    static var passwordTooShort: String { L10n.pick("Password must be at least 8 characters", "密码至少需要 8 位") }
    static var passwordsMismatch: String { L10n.pick("Passwords do not match", "两次输入的密码不一致") }
    static var enterEmailFirst: String { L10n.pick("Enter your email first", "请先填写邮箱") }
    static var codeSent: String { L10n.pick("Code sent", "验证码已发送") }
    static var codeSentHint: String { L10n.pick("Code sent to your email, valid for 10 minutes", "验证码已发送到你的邮箱，10 分钟内有效") }
    static func devCodeHint(_ code: String) -> String {
        L10n.pick("Dev mode (no email service yet): your code is \(code)", "开发模式（未接邮件服务）：验证码 \(code)")
    }
    static var failedToSendPrefix: String { L10n.pick("Failed to send: ", "发送失败：") }
    static var loginFailedPrefix: String { L10n.pick("Login failed: ", "登录失败：") }
    static var registerFailedPrefix: String { L10n.pick("Registration failed: ", "注册失败：") }
}

// MARK: - AuthViewModel (h5-auth §1.2, §2.2; api-auth §2)

@MainActor
final class AuthViewModel: ObservableObject {
    enum Tab: Hashable { case signIn, register }

    static let cooldownSeconds = 60

    @Published var tab: Tab = .signIn

    // Sign In form
    @Published var loginEmail = ""
    @Published var loginPassword = ""

    // Register form
    @Published var regEmail = ""
    @Published var regCode = ""
    @Published var regPassword = ""
    @Published var regConfirm = ""

    /// Hint line under the code field (dev code or "valid for 10 minutes"); nil until a code is sent.
    @Published private(set) var codeHint: String?
    /// 60 → 1 while the "Send code" button counts down; 0 = idle.
    @Published private(set) var cooldownRemaining = 0
    @Published private(set) var isSendingCode = false
    @Published private(set) var isLoggingIn = false
    @Published private(set) var isRegistering = false

    private var cooldownTask: Task<Void, Never>?
    private var bag = Set<AnyCancellable>()

    init() {
        // h5-auth gotcha 15: H5 keeps typed values (password included) across logout — iOS clears them.
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.clearForms() }
            }
            .store(in: &bag)
    }

    // MARK: Derived

    /// "Send code" | "Sending…" | "59s" … "1s" (the countdown label is language-neutral).
    var sendCodeLabel: String {
        if cooldownRemaining > 0 { return "\(cooldownRemaining)s" }
        if isSendingCode { return L10n.t("Sending…") }
        return L10n.t("Send code")
    }

    var sendCodeDisabled: Bool { isSendingCode || cooldownRemaining > 0 }

    // MARK: Actions

    /// `doLogin`: both fields required → `POST /auth/login` → token + light user → `checkUserState()`.
    /// Failure keeps the app on the auth page (no cleanup) and toasts the server text verbatim.
    func login() async {
        let email = loginEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let password = loginPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        if let err = AuthValidation.loginError(email: email, password: password) {
            ToastCenter.shared.show(err)
            return
        }
        guard !isLoggingIn else { return }
        isLoggingIn = true
        defer { isLoggingIn = false }
        do {
            let res = try await AuthService.login(email: email, password: password)
            let session = SessionStore.shared
            session.setToken(res.token)
            session.currentUser = res.user
            await session.checkUserState()      // /users/me decides banned / setup / home
        } catch {
            ToastCenter.shared.show(AuthCopy.loginFailedPrefix + APIError.message(of: error))
        }
    }

    /// `sendRegisterCode`: email required → busy label → `POST /auth/register/send-code` →
    /// hint (devCode or "valid for 10 minutes") + toast + 60 s countdown. Failure: toast, no cooldown.
    func sendCode() async {
        let email = regEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            ToastCenter.shared.show(AuthCopy.enterEmailFirst)
            return
        }
        guard !sendCodeDisabled else { return }     // race guard: cooldown or in flight
        isSendingCode = true
        do {
            let res = try await AuthService.sendRegisterCode(email: email)
            isSendingCode = false
            if let dev = res.devCode, !dev.isEmpty {
                codeHint = AuthCopy.devCodeHint(dev)
            } else {
                codeHint = AuthCopy.codeSentHint
            }
            ToastCenter.shared.show(AuthCopy.codeSent)
            startCooldown(AuthViewModel.cooldownSeconds)
        } catch {
            isSendingCode = false
            ToastCenter.shared.show(AuthCopy.failedToSendPrefix + APIError.message(of: error))
        }
    }

    /// `doRegister`: validation in H5 order → `POST /auth/register` → `SessionStore.applyRegistered`
    /// (token, light user, realtime, route → profile setup).
    func register() async {
        let email = regEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let code = regCode.trimmingCharacters(in: .whitespacesAndNewlines)
        let password = regPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        let confirm = regConfirm.trimmingCharacters(in: .whitespacesAndNewlines)
        if let err = AuthValidation.registerError(email: email, code: code, password: password, confirm: confirm) {
            ToastCenter.shared.show(err)
            return
        }
        guard !isRegistering else { return }
        isRegistering = true
        defer { isRegistering = false }
        do {
            let res = try await AuthService.register(email: email, password: password, code: code)
            SessionStore.shared.applyRegistered(user: res.user, token: res.token)
        } catch {
            ToastCenter.shared.show(AuthCopy.registerFailedPrefix + APIError.message(of: error))
        }
    }

    /// Wipes every field, the hint and the countdown (logout / 401 / account switch).
    func clearForms() {
        cooldownTask?.cancel()
        cooldownTask = nil
        cooldownRemaining = 0
        isSendingCode = false
        loginEmail = ""
        loginPassword = ""
        regEmail = ""
        regCode = ""
        regPassword = ""
        regConfirm = ""
        codeHint = nil
        tab = .signIn
    }

    // MARK: Cooldown (`codeCooldown(btn, 60, 'Send code')`)

    private func startCooldown(_ seconds: Int) {
        cooldownTask?.cancel()
        cooldownRemaining = seconds
        cooldownTask = Task { [weak self] in
            var remaining = seconds
            while remaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                remaining -= 1
                self?.cooldownRemaining = remaining
            }
        }
    }
}
