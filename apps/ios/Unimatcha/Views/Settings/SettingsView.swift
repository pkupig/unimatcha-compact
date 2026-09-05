import SwiftUI

// MARK: - Settings overlay (h5-settings.md §1.2, §2; overlay id `settings`)
//
// Full-page overlay (fade, swipe-back). `FullPageBar` (64 + safe-top) then a scroll body
// px 20 / pt 32 (H5 `pt-24` minus the 64 pt bar) / pb 80:
//   Account (Email inert · Password → two secure prompt cards)
//   Preferences (Language → dialog · Dark mode → toggle + toast · Push toggle)
//   Nudge (“…nudged me” + input + Save)
//   Privacy (3 toggles)
//   Support (Help Center · Safety Tips · Report a Problem · Terms · Privacy Policy)
//   Log Out (pink outline) · version line.

struct SettingsView: View {
    static let overlayId = "settings"

    @StateObject private var vm = SettingsViewModel()

    init() {}

    /// Profile tab "Settings" row → `openSettings()`. WP-16 implements `AppActions.openSettings` with this.
    @MainActor
    static func present() {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .fullPage, swipeBack: true) {
            SettingsView()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(L10n.t("Settings"), onBack: { SettingsView.dismiss() })
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    accountSection
                    preferencesSection
                    nudgeSection
                    privacySection
                    supportSection
                    actionsSection
                }
                .padding(.horizontal, Theme.Space.settings)
                .padding(.top, 32)
                .padding(.bottom, 80)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.C.surface.ignoresSafeArea())
        .onAppear { vm.onOpen() }
    }

    // MARK: Sections

    private var accountSection: some View {
        SettingsSection(title: L10n.t("Account")) {
            // Email — two-line, inert (no onclick, no chevron), value never translated.
            SettingsRow(label: L10n.t("Email"), value: vm.email)
            SettingsRow(label: L10n.t("Password"), chevron: true) {
                Task { await vm.changePassword() }
            }
        }
    }

    private var preferencesSection: some View {
        SettingsSection(title: L10n.t("Preferences")) {
            SettingsRow(material: "translate", label: L10n.t("Language"), chevron: true) {
                LanguageDialog.present()
            }
            // Dark mode — static `contrast` glyph on the right (not a switch), toast on tap.
            SettingsRow(material: "dark_mode", label: L10n.t("Dark mode"), action: { vm.toggleDarkMode() }) {
                MaterialIcon(name: "contrast", size: 24, color: Theme.C.outline)
            }
            SettingsToggleRow(label: L10n.t(SettingKey.pushEnabled.label), isOn: vm.value(.pushEnabled)) {
                Task { await vm.toggle(.pushEnabled) }
            }
        }
    }

    private var nudgeSection: some View {
        SettingsSection(title: L10n.t("Nudge")) {
            NudgeSuffixRow(text: $vm.nudgeSuffix,
                           busy: vm.nudgeSaving,
                           onChange: { vm.clampNudge() },
                           onSave: { Task { await vm.saveNudge() } })
        }
    }

    private var privacySection: some View {
        SettingsSection(title: L10n.t("Privacy")) {
            ForEach(SettingKey.privacyKeys, id: \.self) { key in
                SettingsToggleRow(label: L10n.t(key.label), isOn: vm.value(key)) {
                    Task { await vm.toggle(key) }
                }
            }
        }
    }

    private var supportSection: some View {
        SettingsSection(title: L10n.t("Support")) {
            SettingsRow(material: "help_outline", label: L10n.t("Help Center"), chevron: true) {
                ContentPageView.present(.help)
            }
            SettingsRow(material: "shield", label: L10n.t("Safety Tips"), chevron: true) {
                ContentPageView.present(.safety)
            }
            SettingsRow(material: "flag", label: L10n.t("Report a Problem"), chevron: true) {
                ReportProblemCard.present()
            }
            SettingsRow(material: "gavel", label: L10n.t("Terms of Service"), chevron: true) {
                ContentPageView.present(.terms)
            }
            SettingsRow(material: "policy", label: L10n.t("Privacy Policy"), chevron: true) {
                ContentPageView.present(.privacy)
            }
        }
    }

    /// `section.mt-20.space-y-8`: pink outline Log Out (border-2, py-5, 14/700 widest) + version line.
    private var actionsSection: some View {
        VStack(spacing: 32) {
            CTAButton(title: L10n.t("Log Out"),
                      style: .pinkOutline,
                      size: 14,
                      weight: .bold,
                      paddingV: 20,
                      borderWidth: 2,
                      action: { vm.logout() })
            CTAButton(title: L10n.pick("Delete Account", "注销账号"),
                      style: .linkUnderline,
                      busy: vm.deleteBusy,
                      action: { Task { await vm.deleteAccount() } })
            Text(SettingsViewModel.versionLine)
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.hero, size: 10))
                .foregroundColor(Theme.C.outline)
                .frame(maxWidth: .infinity)
                .padding(.top, 32)
                .padding(.bottom, 48)
        }
        .padding(.top, 40) // sections already end with 40 → 80 total (`mt-20`)
    }
}
