import SwiftUI

struct AuthView: View {
    @State private var isLogin = true
    
    var body: some View {
        NavigationStack {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [Color(red: 1, green: 0.94, blue: 0.96), Color(red: 0.98, green: 0.88, blue: 0.92)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Logo
                    VStack(spacing: 12) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 60))
                            .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                        Text("Unimatcha")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.primary)
                        Text("找到你的长期伴侣")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 60)
                    .padding(.bottom, 40)
                    
                    // Tab switcher
                    HStack(spacing: 0) {
                        ForEach(["登录", "注册"], id: \.self) { tab in
                            Button(tab) { withAnimation { isLogin = (tab == "登录") } }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(
                                    (isLogin && tab == "登录") || (!isLogin && tab == "注册")
                                        ? .white : .secondary
                                )
                                .background(
                                    (isLogin && tab == "登录") || (!isLogin && tab == "注册")
                                        ? Color(red: 1, green: 0.30, blue: 0.43) : Color.clear
                                )
                        }
                    }
                    .background(Color.white.opacity(0.5))
                    .cornerRadius(12)
                    .padding(.horizontal, 24)
                    
                    if isLogin {
                        LoginFormView()
                            .transition(.opacity)
                    } else {
                        RegisterFormView()
                            .transition(.opacity)
                    }
                    
                    Spacer()
                }
            }
        }
    }
}
