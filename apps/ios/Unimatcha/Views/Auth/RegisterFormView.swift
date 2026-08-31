import SwiftUI

struct RegisterFormView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    private var passwordMismatch: Bool { !confirmPassword.isEmpty && password != confirmPassword }
    private var canSubmit: Bool {
        !email.isEmpty && code.count == 6 && password.count >= 8 && password == confirmPassword && !authVM.isLoading
    }

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 12) {
                TextField("大学邮箱", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .textContentType(.emailAddress)
                    .modifier(InputFieldModifier())

                HStack(spacing: 8) {
                    TextField("6 位验证码", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .modifier(InputFieldModifier())
                    Button(action: { Task { await authVM.sendRegisterCode(email: email) } }) {
                        Text(authVM.isSendingCode ? "发送中…" : "发验证码")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .disabled(email.isEmpty || authVM.isSendingCode)
                }

                if let hint = authVM.codeHint {
                    Text(hint)
                        .font(.caption)
                        .foregroundColor(Theme.textMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                SecureField("密码（至少 8 位）", text: $password)
                    .textContentType(.newPassword)
                    .modifier(InputFieldModifier())

                SecureField("确认密码", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .modifier(InputFieldModifier())
                    .overlay(
                        passwordMismatch
                            ? RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.danger.opacity(0.7), lineWidth: 1)
                            : nil
                    )
            }
            .padding(.top, 24)

            if passwordMismatch {
                Text("两次输入的密码不一致")
                    .font(.caption)
                    .foregroundColor(Theme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let error = authVM.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.danger)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            Button(action: { Task { await authVM.register(email: email, password: password, code: code) } }) {
                HStack(spacing: 8) {
                    if authVM.isLoading {
                        ProgressView().tint(Theme.onAccent).scaleEffect(0.85)
                    }
                    Text("创建账号")
                }
            }
            .buttonStyle(NeonButtonStyle(enabled: canSubmit))
            .disabled(!canSubmit)

            Text("注册即代表同意用户协议与隐私政策")
                .font(.system(size: 12))
                .foregroundColor(Theme.textMuted)
                .padding(.top, 4)
        }
        .padding(.horizontal, 24)
    }
}
