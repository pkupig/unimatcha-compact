import SwiftUI

/// Auth container — toggles between login and register, shown pre-authentication.
struct AuthView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var isLogin = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Brand header
                    VStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Theme.accentGradient)
                                .frame(width: 72, height: 72)
                                .shadow(color: Theme.accent.opacity(0.4), radius: 18, y: 6)
                            Image(systemName: "sparkles")
                                .font(.system(size: 32, weight: .bold))
                                .foregroundColor(Theme.onAccent)
                        }

                        Text("Unimatcha")
                            .font(.system(size: 28, weight: .heavy, design: .rounded))
                            .foregroundColor(Theme.textPrimary)

                        Text("找到你的长期伴侣")
                            .font(.subheadline)
                            .foregroundColor(Theme.textSecondary)
                    }
                    .padding(.top, 56)
                    .padding(.bottom, 36)

                    // Segmented switcher
                    HStack(spacing: 6) {
                        segment("登录", active: isLogin) { withAnimation(.easeInOut(duration: 0.2)) { isLogin = true } }
                        segment("注册", active: !isLogin) { withAnimation(.easeInOut(duration: 0.2)) { isLogin = false } }
                    }
                    .padding(4)
                    .background(Theme.surfaceHi)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)

                    if isLogin {
                        LoginFormView()
                            .transition(.opacity)
                    } else {
                        RegisterFormView()
                            .transition(.opacity)
                    }

                    Spacer(minLength: 32)
                }
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .themedScreen()
        }
        .tint(Theme.accent)
    }

    @ViewBuilder
    private func segment(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(active ? Theme.onAccent : Theme.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(active ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Color.clear))
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shared themed input field

/// Neon-themed text-field wrapper used by the auth forms.
struct InputFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 16))
            .foregroundColor(Theme.textPrimary)
            .tint(Theme.accent)
            .padding(14)
            .background(Theme.surfaceHi)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
    }
}
