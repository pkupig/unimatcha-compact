import SwiftUI

struct LoginFormView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    private var canSubmit: Bool { !email.isEmpty && !password.isEmpty && !authVM.isLoading }

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 12) {
                TextField("邮箱", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .textContentType(.emailAddress)
                    .modifier(InputFieldModifier())

                SecureField("密码", text: $password)
                    .textContentType(.password)
                    .modifier(InputFieldModifier())
            }
            .padding(.top, 24)

            if let error = authVM.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.danger)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            Button(action: { Task { await authVM.login(email: email, password: password) } }) {
                HStack(spacing: 8) {
                    if authVM.isLoading {
                        ProgressView().tint(Theme.onAccent).scaleEffect(0.85)
                    }
                    Text("登录")
                }
            }
            .buttonStyle(NeonButtonStyle(enabled: canSubmit))
            .disabled(!canSubmit)

            Text("大学邮箱登录 · 每周五公布新一轮匹配")
                .font(.system(size: 12))
                .foregroundColor(Theme.textMuted)
                .padding(.top, 4)
        }
        .padding(.horizontal, 24)
    }
}
