import SwiftUI
import UIKit

// MARK: - AuthView (h5-auth §1.2, design §7.1 `#page-auth`)
//
// `main` (flex-grow, centered, px-6 py-12) over the decorative `login_bg.png` (bottom, h-256,
// 10 % opacity) → `.auth-container` max-w 420: tab switcher (two 12/700 +0.2em buttons, 48 pt
// apart, 2 pt underline, 64 pt below) → Sign In / Register form. Footer py-8: Terms · / ·
// Privacy (10/700 widest) + © line (9/500 +0.1em). No inline errors — toasts only.

struct AuthView: View {
    @StateObject private var vm = AuthViewModel()

    var body: some View {
        ZStack {
            Theme.C.surface.ignoresSafeArea()
            VStack(spacing: 0) {
                GeometryReader { geo in
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 0) {
                            authContainer
                        }
                        .padding(.horizontal, Theme.Space.page)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: geo.size.height)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .background(alignment: .bottom) {
                        // Decorative campus sketch: full width, 256 tall, object-cover object-bottom, opacity .10
                        Image("LoginBackground")
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: geo.size.width, height: 256, alignment: .bottom)
                            .clipped()
                            .opacity(0.10)
                            .allowsHitTesting(false)
                    }
                    .clipped()
                }
                AuthFooter()
            }
        }
    }

    private var authContainer: some View {
        VStack(spacing: 0) {
            AuthTabSwitcher(tab: $vm.tab)
                .padding(.bottom, 64)
            switch vm.tab {
            case .signIn:
                LoginFormView(vm: vm)
            case .register:
                RegisterFormView(vm: vm)
            }
        }
        .frame(maxWidth: 420)
    }
}

// MARK: - Tab switcher (`switchAuthTab`)

struct AuthTabSwitcher: View {
    @Binding var tab: AuthViewModel.Tab

    var body: some View {
        HStack(spacing: 48) {
            tabButton(L10n.t("Sign In"), .signIn)
            tabButton(L10n.t("Register"), .register)
        }
        .frame(maxWidth: .infinity)
    }

    private func tabButton(_ title: String, _ value: AuthViewModel.Tab) -> some View {
        let active = tab == value
        return Button {
            withAnimation(Theme.Motion.fade) { tab = value }
        } label: {
            Text(title)
                .font(Theme.font(12, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
                .foregroundColor(active ? Theme.C.primary : Theme.C.onSurfaceVariant)
                .padding(.bottom, 8)
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(active ? Theme.C.primary : Color.clear)
                        .frame(height: 2)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Form header (h2 30/800 tighter + p 14 wide)

struct AuthFormHeader: View {
    var title: String
    var subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(Theme.font(30, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tighter, size: 30))
                .foregroundColor(Theme.C.primary)
                .multilineTextAlignment(.center)
            Text(subtitle)
                .font(Theme.font(14))
                .tracking(Theme.tracking(Theme.Tracking.wide, size: 14))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Auth field (label 10/700 +0.15em outline · 24 pt icon · soft-fill 16 pt input)

/// The auth input row: leading Material icon (`outline`, `primary` while the group has focus) +
/// soft-fill input (`#f3f3f3`, r10, px-3 py-2.5, 16 pt, placeholder `outlineVariant`, 1 pt neon
/// focus ring) + optional trailing control (the register "Send code" button).
struct AuthField<Trailing: View>: View {
    var label: String
    var icon: String                        // Material name: mail / lock / pin
    @Binding var text: String
    var placeholder: String
    var keyboard: UIKeyboardType = .default
    var secure: Bool = false
    var contentType: UITextContentType? = nil
    var submitLabel: SubmitLabel = .next
    var maxLength: Int? = nil
    var digitsOnly: Bool = false
    var onSubmit: () -> Void = {}
    @ViewBuilder var trailing: () -> Trailing

    @FocusState private var focused: Bool

    init(label: String,
         icon: String,
         text: Binding<String>,
         placeholder: String,
         keyboard: UIKeyboardType = .default,
         secure: Bool = false,
         contentType: UITextContentType? = nil,
         submitLabel: SubmitLabel = .next,
         maxLength: Int? = nil,
         digitsOnly: Bool = false,
         onSubmit: @escaping () -> Void = {},
         @ViewBuilder trailing: @escaping () -> Trailing) {
        self.label = label
        self.icon = icon
        self._text = text
        self.placeholder = placeholder
        self.keyboard = keyboard
        self.secure = secure
        self.contentType = contentType
        self.submitLabel = submitLabel
        self.maxLength = maxLength
        self.digitsOnly = digitsOnly
        self.onSubmit = onSubmit
        self.trailing = trailing
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            MicroLabel(text: label, color: Theme.C.outline, tracking: Theme.Tracking.label)
            HStack(spacing: 12) {
                MaterialIcon(name: icon, size: 24, color: focused ? Theme.C.primary : Theme.C.outline)
                input
                trailing()
            }
        }
    }

    private var input: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(Theme.font(16))
                    .foregroundColor(Theme.C.outlineVariantText)
                    .lineLimit(1)
                    .allowsHitTesting(false)
            }
            Group {
                if secure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                }
            }
            .font(Theme.font(16))
            .foregroundColor(Theme.C.onSurface)
            .keyboardType(keyboard)
            .textContentType(contentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .submitLabel(submitLabel)
            .focused($focused)
            .onSubmit { onSubmit() }
            .onChange(of: text) { v in
                var next = v
                if digitsOnly { next = next.filter { $0.isASCII && $0.isNumber } }
                if let m = maxLength, next.count > m { next = String(next.prefix(m)) }
                if next != v { text = next }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.containerLow)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.neon, lineWidth: focused ? 1 : 0)
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }
}

extension AuthField where Trailing == EmptyView {
    init(label: String,
         icon: String,
         text: Binding<String>,
         placeholder: String,
         keyboard: UIKeyboardType = .default,
         secure: Bool = false,
         contentType: UITextContentType? = nil,
         submitLabel: SubmitLabel = .next,
         maxLength: Int? = nil,
         digitsOnly: Bool = false,
         onSubmit: @escaping () -> Void = {}) {
        self.init(label: label, icon: icon, text: text, placeholder: placeholder, keyboard: keyboard, secure: secure,
                  contentType: contentType, submitLabel: submitLabel, maxLength: maxLength, digitsOnly: digitsOnly,
                  onSubmit: onSubmit) { EmptyView() }
    }
}

// MARK: - Footer (Terms / Privacy → content overlay; © line)

struct AuthFooter: View {
    var showLinks: Bool = true

    var body: some View {
        VStack(spacing: 16) {
            if showLinks {
                HStack(spacing: 8) {
                    footerLink(L10n.t("Terms of Service")) { AppActions.shared.openContentPage(.terms) }
                    Text("/")
                        .font(Theme.font(10, weight: .bold))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                    footerLink(L10n.t("Privacy Policy")) { AppActions.shared.openContentPage(.privacy) }
                }
            }
            Text("© 2026 Unimatcha. All Rights Reserved.")
                .font(Theme.font(9, weight: .medium))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                .foregroundColor(Theme.C.outlineVariantText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, Theme.Space.page)
    }

    private func footerLink(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .padding(.vertical, 4)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
