import SwiftUI

// MARK: - ProfileSetupView (`#page-profile-setup`, h5-auth §1.4 / §2.4, h5-profile §1.1, design §7.1)
//
// Fixed glass header 64 + safe-top (`bg-surface/80 backdrop-blur-xl`, bottom hairline, px-6):
// back arrow (p-2 -ml-2) · "Profile Setup" 16/700 tight · 40 pt spacer. Back = explicit logout
// (D13, `AppActions.requestLogout`). `main pt-24 pb-12 px-6 max-w-2xl` scrolls under the header;
// the wizard (state A) and the optional details form (state B) are mutually exclusive.

struct ProfileSetupView: View {
    @StateObject private var vm = ProfileSetupViewModel()

    private let topAnchor = "setup-top"

    var body: some View {
        ZStack(alignment: .top) {
            Theme.C.surface.ignoresSafeArea()

            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        Color.clear
                            .frame(height: 1)
                            .id(topAnchor)
                        switch vm.phase {
                        case .wizard:
                            ProfileSetupWizardView(vm: vm)
                        case .rest:
                            ProfileSetupRestView(vm: vm)
                        }
                    }
                    .padding(.top, 96 - 1)
                    .padding(.bottom, 48)
                    .padding(.horizontal, Theme.Space.page)
                    .frame(maxWidth: 672, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: vm.scrollToTopSignal) { _ in
                    proxy.scrollTo(topAnchor, anchor: .top)
                }
            }

            SetupHeader(title: L10n.t("Profile Setup")) {
                AppActions.shared.requestLogout()
            }
        }
        .onAppear { vm.onEnter() }
    }
}

// MARK: - Header (h-16 + safe-top glass bar)

struct SetupHeader: View {
    var title: String
    var onBack: () -> Void

    @Environment(\.overlaySafeInsets) private var envInsets

    var body: some View {
        let top = OverlayChrome.resolvedInsets(envInsets).top
        ZStack {
            Text(title)
                .font(Theme.font(16, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 16))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 56)
            HStack(spacing: 0) {
                IconButton(material: "arrow_back", size: 40, iconSize: 24, tint: Theme.C.onSurface,
                           accessibilityLabel: L10n.t("Back"), action: onBack)
                    .padding(.leading, -8)
                Spacer(minLength: 0)
                Color.clear.frame(width: 40, height: 40)
            }
        }
        .padding(.horizontal, Theme.Space.page)
        .frame(height: Theme.Bar.overlay)
        .padding(.top, top)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                Theme.C.glassBar
            }
            .ignoresSafeArea(edges: .top)
        )
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.C.hairline20).frame(height: 1)
        }
        .ignoresSafeArea(edges: .top)
    }
}

// MARK: - Shared setup pieces

/// Field label: 10/700 +0.2em `onSurfaceVariant` with an optional pink `*`.
struct SetupFieldLabel: View {
    var text: String
    var required: Bool = false

    var body: some View {
        HStack(spacing: 2) {
            MicroLabel(text: text, color: Theme.C.onSurfaceVariant, tracking: Theme.Tracking.section)
            if required {
                Text("*")
                    .font(Theme.font(10, weight: .bold))
                    .foregroundColor(Theme.C.neonPink)
            }
        }
    }
}

/// Section header: h2 20/700 tight + hairline (`outline-variant` at 30 %, `ml-6`, flex-grow).
struct SetupSectionHeader: View {
    var title: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(title)
                .font(Theme.font(20, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 20))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(1)
            Rectangle()
                .fill(Theme.C.outlineVariantFill.opacity(0.3))
                .frame(height: 1)
                .padding(.leading, 24)
        }
    }
}

/// Gender / Looking-For segment button: r10, 1 pt `outlineVariant` border, 14 pt +0.05em;
/// selected = neon fill + black text (no border). `paddingV` 16 (gender) / 12 (looking for).
struct SetupChoiceButton: View {
    var label: String
    var selected: Bool
    var paddingV: CGFloat = 16
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(Theme.font(14))
                .tracking(Theme.tracking(Theme.Tracking.wider, size: 14))
                .foregroundColor(selected ? .black : Theme.C.onSurface)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.vertical, paddingV)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity)
                .background(selected ? Theme.C.neon : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .stroke(selected ? Color.clear : Theme.C.outlineVariant, lineWidth: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.98))
    }
}
