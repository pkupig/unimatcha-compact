import SwiftUI

struct LoginFormView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    
    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 12) {
                TextField("邮箱", text: $email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
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
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            Button(action: { Task { await authVM.login(email: email, password: password) } }) {
                HStack {
                    if authVM.isLoading {
                        ProgressView().tint(.white).scaleEffect(0.8)
                    }
                    Text("登录")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(email.isEmpty || password.isEmpty ? Color.gray.opacity(0.3) : Color(red: 1, green: 0.30, blue: 0.43))
                .foregroundColor(.white)
                .cornerRadius(14)
                .font(.system(size: 16, weight: .semibold))
            }
            .disabled(email.isEmpty || password.isEmpty || authVM.isLoading)
        }
        .padding(.horizontal, 24)
    }
}

struct InputFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(Color.white)
            .cornerRadius(12)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.15), lineWidth: 1))
            .font(.system(size: 16))
    }
}
