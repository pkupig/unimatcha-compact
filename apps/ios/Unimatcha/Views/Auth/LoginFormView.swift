import SwiftUI

// MARK: - LoginFormView (`#signin-form`, h5-auth §1.2 / §2.2 `doLogin`)
//
// Header "Welcome Back" / "Enter your academic credentials" → Email Address (mail) → Password
// (lock) → `.btn-cta` "Sign In". "Forgot Password?" is a dead button in H5 → omitted (PLAN C.1).
// Blocks 48 pt apart, fields 32 pt apart. Wrong password shows the server text and stays here.

struct LoginFormView: View {
    @ObservedObject var vm: AuthViewModel

    var body: some View {
        VStack(spacing: 48) {
            AuthFormHeader(title: L10n.t("Welcome Back"),
                           subtitle: L10n.t("Enter your academic credentials"))
            VStack(spacing: 32) {
                AuthField(label: L10n.t("Email Address"),
                          icon: "mail",
                          text: $vm.loginEmail,
                          placeholder: L10n.placeholder("you@example.com"),
                          keyboard: .emailAddress,
                          contentType: .username,
                          submitLabel: .next)
                AuthField(label: L10n.t("Password"),
                          icon: "lock",
                          text: $vm.loginPassword,
                          placeholder: "••••••••",
                          secure: true,
                          contentType: .password,
                          submitLabel: .go,
                          onSubmit: { submit() })
                CTAButton(title: L10n.t("Sign In"),
                          style: .neon,
                          busy: vm.isLoggingIn,
                          busyTitle: L10n.t("Loading…"),
                          action: { submit() })
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func submit() {
        Task { await vm.login() }
    }
}
