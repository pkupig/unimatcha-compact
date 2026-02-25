import SwiftUI

struct RegisterFormView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    
    private var passwordMismatch: Bool { !confirmPassword.isEmpty && password != confirmPassword }
    private var canSubmit: Bool { !email.isEmpty && password.count >= 8 && password == confirmPassword && !authVM.isLoading }
    
    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 12) {
                TextField("大学邮箱", text: $email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .modifier(InputFieldModifier())
                
                SecureField("密码（至少8位）", text: $password)
                    .modifier(InputFieldModifier())
                
                SecureField("确认密码", text: $confirmPassword)
                    .modifier(InputFieldModifier())
                    .overlay(
                        passwordMismatch ? RoundedRectangle(cornerRadius: 12).stroke(Color.red.opacity(0.5), lineWidth: 1) : nil
                    )
            }
            .padding(.top, 24)
            
            if passwordMismatch {
                Text("两次输入的密码不一致")
                    .font(.caption).foregroundColor(.red)
            }
            
            if let error = authVM.errorMessage {
                Text(error).font(.caption).foregroundColor(.red).multilineTextAlignment(.center).padding(.horizontal)
            }
            
            Button(action: { Task { await authVM.register(email: email, password: password) } }) {
                HStack {
                    if authVM.isLoading { ProgressView().tint(.white).scaleEffect(0.8) }
                    Text("创建账号")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(canSubmit ? Color(red: 1, green: 0.30, blue: 0.43) : Color.gray.opacity(0.3))
                .foregroundColor(.white)
                .cornerRadius(14)
                .font(.system(size: 16, weight: .semibold))
            }
            .disabled(!canSubmit)
        }
        .padding(.horizontal, 24)
    }
}
