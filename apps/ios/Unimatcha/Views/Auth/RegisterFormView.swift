import SwiftUI

// MARK: - RegisterFormView (`#register-form`, h5-auth §1.2 / §2.2 `sendRegisterCode` + `doRegister`)
//
// Header "Join Unimatcha" / "Create your academic profile" → Email Address (mail) → Verification
// Code (pin): 6-digit numeric input + "Send code" `.btn-secondary text-[10px] px-3 py-2` with the
// busy label / 60 s countdown ("59s"…"1s"), hint line (10 pt, mt-1.5) after a code is sent →
// Password (lock) → Confirm Password (lock) → `.btn-cta` "Register".

struct RegisterFormView: View {
    @ObservedObject var vm: AuthViewModel

    var body: some View {
        VStack(spacing: 48) {
            AuthFormHeader(title: L10n.t("Join Unimatcha"),
                           subtitle: L10n.t("Create your academic profile"))
            VStack(spacing: 32) {
                AuthField(label: L10n.t("Email Address"),
                          icon: "mail",
                          text: $vm.regEmail,
                          // Any email works at registration — school-email verification is a
                          // separate, later step (Profile → Verify) that also needs a reviewed
                          // student-card photo, not just this address. A ".edu" example here
                          // wrongly implies it's required to sign up (H5 has the same wording;
                          // flagged as a copy fix, not migration parity).
                          placeholder: L10n.placeholder("you@example.com"),
                          keyboard: .emailAddress,
                          contentType: .username,
                          submitLabel: .next)

                VStack(alignment: .leading, spacing: 6) {
                    AuthField(label: L10n.t("Verification Code"),
                              icon: "pin",
                              text: $vm.regCode,
                              placeholder: L10n.placeholder("6-digit code"),
                              keyboard: .numberPad,
                              contentType: .oneTimeCode,
                              submitLabel: .next,
                              maxLength: AuthValidation.codeLength,
                              digitsOnly: true) {
                        CTAButton(title: vm.sendCodeLabel,
                                  style: .outlineBlack,
                                  size: 10,
                                  disabled: vm.sendCodeDisabled,
                                  fullWidth: false,
                                  paddingV: 8,
                                  paddingH: 12,
                                  action: { Task { await vm.sendCode() } })
                            .fixedSize()
                            .accessibilityLabel(L10n.t("Send code"))
                    }
                    if let hint = vm.codeHint, !hint.isEmpty {
                        Text(hint)
                            .font(Theme.font(10))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                AuthField(label: L10n.t("Password"),
                          icon: "lock",
                          text: $vm.regPassword,
                          placeholder: "••••••••",
                          secure: true,
                          contentType: .newPassword,
                          submitLabel: .next)
                AuthField(label: L10n.t("Confirm Password"),
                          icon: "lock",
                          text: $vm.regConfirm,
                          placeholder: "••••••••",
                          secure: true,
                          contentType: .newPassword,
                          submitLabel: .go,
                          onSubmit: { submit() })
                CTAButton(title: L10n.t("Register"),
                          style: .neon,
                          busy: vm.isRegistering,
                          busyTitle: L10n.t("Loading…"),
                          action: { submit() })
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func submit() {
        Task { await vm.register() }
    }
}
