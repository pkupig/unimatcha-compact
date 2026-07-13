import SwiftUI

/// 设置页 —— 隐私开关、拍一拍后缀、修改密码、校园邮箱认证、退出登录。
struct SettingsView: View {
    @EnvironmentObject var authVM: AuthViewModel

    // Privacy / settings
    @State private var settings: UserSettings = .defaults
    @State private var settingsLoaded = false
    @State private var savingSettings = false

    // Nudge suffix
    @State private var nudgeSuffix = ""
    @State private var savingNudge = false
    @State private var nudgeSavedMessage: String?

    // Change password
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var changingPassword = false
    @State private var passwordMessage: String?
    @State private var passwordSuccess = false

    // School verification
    @State private var schoolEmail = ""
    @State private var sendingCode = false
    @State private var devCode: String?
    @State private var verifyMessage: String?

    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                privacySection
                nudgeSection
                passwordSection
                verificationSection
                aboutSection
                logoutButton

                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 12)).foregroundColor(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer().frame(height: 24)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .themedScreen()
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await loadSettings() }
    }

    // MARK: - Privacy
    private var privacySection: some View {
        sectionCard(title: "隐私") {
            toggleRow(title: "接收推送通知", isOn: Binding(
                get: { settings.pushEnabled },
                set: { settings.pushEnabled = $0; persistSettings() }))
            rowDivider
            toggleRow(title: "展示我的资料", isOn: Binding(
                get: { settings.privacy.showProfile },
                set: { settings.privacy.showProfile = $0; persistSettings() }))
            rowDivider
            toggleRow(title: "展示在线状态", isOn: Binding(
                get: { settings.privacy.showOnline },
                set: { settings.privacy.showOnline = $0; persistSettings() }))
            rowDivider
            toggleRow(title: "展示我的动态", isOn: Binding(
                get: { settings.privacy.showMoments },
                set: { settings.privacy.showMoments = $0; persistSettings() }))
        }
    }

    // MARK: - Nudge suffix
    private var nudgeSection: some View {
        sectionCard(title: "拍一拍后缀") {
            VStack(alignment: .leading, spacing: 10) {
                themedField("例如：拍了拍你的小脑袋", text: $nudgeSuffix)
                if let msg = nudgeSavedMessage {
                    Text(msg).font(.system(size: 12)).foregroundColor(Theme.accent)
                }
                Button {
                    Task { await saveNudge() }
                } label: {
                    HStack(spacing: 6) {
                        if savingNudge { ProgressView().tint(Theme.textPrimary) }
                        Text("保存后缀")
                    }
                }
                .buttonStyle(GhostButtonStyle())
                .disabled(savingNudge)
            }
            .padding(14)
        }
    }

    // MARK: - Change password
    private var passwordSection: some View {
        sectionCard(title: "修改密码") {
            VStack(alignment: .leading, spacing: 10) {
                secureField("当前密码", text: $currentPassword)
                secureField("新密码（至少 6 位）", text: $newPassword)
                secureField("确认新密码", text: $confirmPassword)
                if let msg = passwordMessage {
                    Text(msg).font(.system(size: 12))
                        .foregroundColor(passwordSuccess ? Theme.accent : Theme.danger)
                }
                Button {
                    Task { await changePassword() }
                } label: {
                    HStack(spacing: 6) {
                        if changingPassword { ProgressView().tint(Theme.textPrimary) }
                        Text("更新密码")
                    }
                }
                .buttonStyle(GhostButtonStyle())
                .disabled(changingPassword)
            }
            .padding(14)
        }
    }

    // MARK: - School verification
    private var verificationSection: some View {
        sectionCard(title: "校园邮箱认证") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Text("当前状态").foregroundColor(Theme.textPrimary).font(.system(size: 14))
                    verificationBadge
                    Spacer()
                }
                themedField("请输入校园邮箱", text: $schoolEmail)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                if let code = devCode {
                    HStack(spacing: 6) {
                        Image(systemName: "envelope.badge").foregroundColor(Theme.accent)
                        Text("开发验证码：\(code)")
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(Theme.accent)
                    }
                }
                if let msg = verifyMessage {
                    Text(msg).font(.system(size: 12)).foregroundColor(Theme.textSecondary)
                }
                Button {
                    Task { await sendVerification() }
                } label: {
                    HStack(spacing: 6) {
                        if sendingCode { ProgressView().tint(Theme.textPrimary) }
                        Text("发送验证码")
                    }
                }
                .buttonStyle(GhostButtonStyle())
                .disabled(sendingCode || schoolEmail.isEmpty)
            }
            .padding(14)
        }
    }

    // MARK: - About
    private var aboutSection: some View {
        sectionCard(title: "关于") {
            HStack {
                Text("版本").foregroundColor(Theme.textPrimary).font(.system(size: 15))
                Spacer()
                Text("1.0.0").foregroundColor(Theme.textMuted).font(.system(size: 15))
            }
            .padding(.horizontal, 14).padding(.vertical, 13)
        }
    }

    // MARK: - Logout
    private var logoutButton: some View {
        Button(role: .destructive) {
            authVM.logout()
        } label: {
            Text("退出登录")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.danger)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        }
    }

    @ViewBuilder
    private var verificationBadge: some View {
        switch authVM.currentUser?.verificationStatus {
        case "verified":
            badge(icon: "checkmark.seal.fill", text: "已认证", color: Theme.accent)
        case "pending":
            badge(icon: "clock.fill", text: "审核中", color: Theme.warning)
        case "rejected":
            badge(icon: "xmark.circle.fill", text: "被拒绝", color: Theme.danger)
        default:
            badge(icon: "seal", text: "未认证", color: Theme.textMuted)
        }
    }

    private func badge(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 12))
            Text(text).font(.system(size: 12, weight: .semibold))
        }
        .foregroundColor(color)
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(color.opacity(0.12))
        .clipShape(Capsule())
    }

    // MARK: - Reusable

    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.textSecondary)
                .padding(.leading, 4)
            VStack(spacing: 0) { content() }
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        }
    }

    private var rowDivider: some View { Divider().overlay(Theme.outline).padding(.leading, 14) }

    private func toggleRow(title: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Text(title).foregroundColor(Theme.textPrimary).font(.system(size: 15))
        }
        .tint(Theme.accent)
        .padding(.horizontal, 14).padding(.vertical, 11)
        .disabled(!settingsLoaded || savingSettings)
    }

    private func themedField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.textMuted))
            .font(.system(size: 15))
            .foregroundColor(Theme.textPrimary)
            .tint(Theme.accent)
            .padding(12)
            .background(Theme.surfaceHi)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
    }

    private func secureField(_ placeholder: String, text: Binding<String>) -> some View {
        SecureField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.textMuted))
            .font(.system(size: 15))
            .foregroundColor(Theme.textPrimary)
            .tint(Theme.accent)
            .padding(12)
            .background(Theme.surfaceHi)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
    }

    // MARK: - Actions

    private func loadSettings() async {
        do {
            settings = try await ProfileService.getSettings()
        } catch {
            settings = .defaults
        }
        settingsLoaded = true
    }

    private func persistSettings() {
        guard settingsLoaded else { return }
        Task {
            savingSettings = true
            do { _ = try await ProfileService.updateSettings(settings) }
            catch let e as APIError { errorMessage = e.errorDescription }
            catch { errorMessage = error.localizedDescription }
            savingSettings = false
        }
    }

    private func saveNudge() async {
        savingNudge = true; nudgeSavedMessage = nil; errorMessage = nil
        do {
            _ = try await ChatService.setNudgeSuffix(nudgeSuffix)
            nudgeSavedMessage = "已保存"
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        savingNudge = false
    }

    private func changePassword() async {
        passwordMessage = nil; passwordSuccess = false
        guard newPassword.count >= 6 else {
            passwordMessage = "新密码至少 6 位"; return
        }
        guard newPassword == confirmPassword else {
            passwordMessage = "两次输入的新密码不一致"; return
        }
        changingPassword = true
        do {
            try await ProfileService.changePassword(current: currentPassword, new: newPassword)
            passwordSuccess = true
            passwordMessage = "密码已更新"
            currentPassword = ""; newPassword = ""; confirmPassword = ""
        } catch let e as APIError { passwordMessage = e.errorDescription }
        catch { passwordMessage = error.localizedDescription }
        changingPassword = false
    }

    private func sendVerification() async {
        sendingCode = true; verifyMessage = nil; devCode = nil; errorMessage = nil
        do {
            let result = try await ProfileService.sendVerificationCode(schoolEmail: schoolEmail)
            verifyMessage = result.message
            devCode = result.devCode
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        sendingCode = false
    }
}
