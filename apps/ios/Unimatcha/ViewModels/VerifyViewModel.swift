import SwiftUI
import UIKit
import Combine

// MARK: - Student Verification (h5-profile.md §1.5, §2 "Student Verification"; api-auth §3.6–§3.7)
//
// Card state: student-card photo (uploaded the moment it is picked → `POST /uploads/image`),
// school email + "Send code" (60 s cooldown, hint line with the server message or the dev code),
// 6-digit code, "Submit for review". Opening resets everything; so does `sessionDidReset`
// (PLAN §A.3: the verify card url is per-session state).
//
// Client pre-checks mirror the server rules so a bad address never burns the 60 s cooldown:
// format `^[^@\s]+@[^@\s]+\.[^@\s]+$`, then `.edu` / `.ac.` substring (same messages as the API).

// MARK: Copy

enum VerifyCopy {
    static var enterEmail: String { L10n.pick("Enter your school email", "请输入学校邮箱") }
    static var enterCode: String { L10n.pick("Enter the verification code", "请输入验证码") }
    static var uploadCardFirst: String { L10n.pick("Upload your student ID card first", "请先上传学生卡照片") }
    static var codeSent: String { L10n.pick("Code sent", "验证码已发送") }
    static var submittedPending: String { L10n.pick("Submitted — pending review", "已提交，等待审核") }
    static var invalidEmail: String { L10n.pick("Invalid email format", "邮箱格式不正确") }
    static var schoolEmailOnly: String {
        L10n.pick("Please use a school email (must contain .edu or .ac.)", "请使用学校邮箱（需包含 .edu 或 .ac.）")
    }
    static var uploadFailedPrefix: String { L10n.pick("Upload failed: ", "上传失败：") }
    static var failedPrefix: String { L10n.t("Failed: ") }
    static var sendCode: String { L10n.t("Send code") }
    static var sending: String { L10n.t("Sending…") }
    /// Dev-mode hint when the API returns `devCode`.
    static func devHint(_ code: String) -> String {
        L10n.pick("Dev mode (no email service yet): your code is \(code)", "开发模式（暂无邮件服务）：你的验证码是 \(code)")
    }
}

// MARK: Rules (pure)

enum VerifyRules {
    static let cooldownSeconds = 60
    static let codeLength = 6
    static let emailPattern = #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#

    /// Normalised (`trim().toLowerCase()`) address.
    static func normalize(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// nil = ok; otherwise the toast to show (H5 guard first, then the two server rules).
    static func emailPrecheckError(_ raw: String) -> String? {
        let e = normalize(raw)
        if e.isEmpty { return VerifyCopy.enterEmail }
        if e.range(of: emailPattern, options: .regularExpression) == nil { return VerifyCopy.invalidEmail }
        if !(e.contains(".edu") || e.contains(".ac.")) { return VerifyCopy.schoolEmailOnly }
        return nil
    }

    /// Digits only, at most 6.
    static func sanitizeCode(_ raw: String) -> String {
        String(raw.filter { $0.isNumber }.prefix(codeLength))
    }

    /// "Send code" | "Sending…" | "59s" … "1s" (countdown label is language-neutral).
    static func sendLabel(sending: Bool, cooldown: Int) -> String {
        if cooldown > 0 { return "\(cooldown)s" }
        if sending { return VerifyCopy.sending }
        return VerifyCopy.sendCode
    }

    /// Hint line after a successful send: the dev code when present, else the server message.
    static func hint(for result: VerificationSendResult) -> String {
        if let dev = result.devCode?.trimmingCharacters(in: .whitespacesAndNewlines), !dev.isEmpty {
            return VerifyCopy.devHint(dev)
        }
        if let m = result.message?.trimmingCharacters(in: .whitespacesAndNewlines), !m.isEmpty {
            return m
        }
        return VerifyCopy.codeSent
    }
}

// MARK: - View model

@MainActor
final class VerifyViewModel: ObservableObject {
    @Published private(set) var cardUrl: String? = nil
    @Published private(set) var cardPreview: UIImage? = nil
    @Published private(set) var isUploadingCard = false
    @Published var email = ""
    @Published var code = "" {
        didSet {
            let clean = VerifyRules.sanitizeCode(code)
            if clean != code { code = clean }
        }
    }
    @Published private(set) var hint: String? = nil
    @Published private(set) var isSending = false
    @Published private(set) var cooldownRemaining = 0
    @Published private(set) var isSubmitting = false

    private var cooldownTask: Task<Void, Never>?
    private var bag = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.reset() }
            }
            .store(in: &bag)
    }

    var sendLabel: String { VerifyRules.sendLabel(sending: isSending, cooldown: cooldownRemaining) }
    var sendDisabled: Bool { isSending || cooldownRemaining > 0 }
    var hasCard: Bool { !(cardUrl ?? "").isEmpty }

    /// `openVerify()`: card url, preview, email, code and hint all start blank.
    func reset() {
        cooldownTask?.cancel()
        cooldownTask = nil
        cardUrl = nil
        cardPreview = nil
        isUploadingCard = false
        email = ""
        code = ""
        hint = nil
        isSending = false
        cooldownRemaining = 0
        isSubmitting = false
    }

    // MARK: Student card (`handleStudentCardFile` — immediate upload)

    func cardPicked(_ photo: PickedPhoto) async {
        guard !isUploadingCard else { return }
        isUploadingCard = true
        do {
            let url = try await UploadService.upload(jpegData: photo.jpeg)
            cardUrl = url
            cardPreview = photo.image
        } catch {
            cardUrl = nil
            cardPreview = nil
            ToastCenter.shared.show(VerifyCopy.uploadFailedPrefix + APIError.message(of: error))
        }
        isUploadingCard = false
    }

    // MARK: Send code (`sendVerifyCode`)

    func sendCode() async {
        guard !sendDisabled else { return }
        if let err = VerifyRules.emailPrecheckError(email) {
            ToastCenter.shared.show(err)
            return
        }
        isSending = true
        do {
            let res = try await ProfileService.verificationSendCode(schoolEmail: email)
            isSending = false
            hint = VerifyRules.hint(for: res)
            let toast = res.message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            ToastCenter.shared.show(toast.isEmpty ? VerifyCopy.codeSent : toast)
            startCooldown(VerifyRules.cooldownSeconds)
        } catch {
            isSending = false
            ToastCenter.shared.show(VerifyCopy.failedPrefix + APIError.message(of: error))
        }
    }

    /// `codeCooldown(btn, 60, 'Send code')`: "60s" … "1s" then back to "Send code".
    private func startCooldown(_ seconds: Int) {
        cooldownTask?.cancel()
        cooldownRemaining = seconds
        cooldownTask = Task { [weak self] in
            var remaining = seconds
            while remaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                remaining -= 1
                self?.cooldownRemaining = remaining
            }
        }
    }

    // MARK: Submit (`submitVerification`)

    /// Guards in H5 order (card → email → code), POST, status → pending, toast, close.
    /// Returns true when the card should close.
    @discardableResult
    func submit() async -> Bool {
        guard !isSubmitting else { return false }
        guard let card = cardUrl, !card.isEmpty else {
            ToastCenter.shared.show(VerifyCopy.uploadCardFirst)
            return false
        }
        let mail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !mail.isEmpty else {
            ToastCenter.shared.show(VerifyCopy.enterEmail)
            return false
        }
        let c = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !c.isEmpty else {
            ToastCenter.shared.show(VerifyCopy.enterCode)
            return false
        }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let res = try await ProfileService.verificationSubmit(studentCardUrl: card, schoolEmail: mail, code: c)
            let status = (res.verificationStatus ?? "").isEmpty ? "pending" : (res.verificationStatus ?? "pending")
            SessionStore.shared.setVerificationStatus(status)
            let msg = res.message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            ToastCenter.shared.show(msg.isEmpty ? VerifyCopy.submittedPending : msg)
            return true
        } catch {
            ToastCenter.shared.show(VerifyCopy.failedPrefix + APIError.message(of: error))
            return false
        }
    }
}
