import SwiftUI

// MARK: - Settings page building blocks (h5-settings.md §1.2 row anatomy, §1.2.1 toggle)
//
// Section: header 12/black tracking .2em `outline` (`mb-3`), rows, `mb-10` (40) after.
// Row: `py-4` (16) + 1 pt `outline-variant/20` divider; label 14/500 tracking wide `onSurface`;
// optional 24 pt Material icon before the label (gap normalised to 16 — gotcha 11); navigational
// rows end with `chevron_right` in `outline`.

struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    init(title: String, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(Theme.font(12, weight: .black))
                .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
                .foregroundColor(Theme.C.outline)
                .padding(.bottom, 12)
            content()
        }
        .padding(.bottom, 40)
    }
}

/// Generic row: `[icon] label [subtitle]` … `accessory` `[chevron]`, hairline beneath.
struct SettingsRow<Accessory: View>: View {
    var material: String? = nil
    var label: String
    var value: String? = nil          // second line (Email row), never translated
    var chevron: Bool = false
    var action: (() -> Void)? = nil
    @ViewBuilder var accessory: () -> Accessory

    init(material: String? = nil,
         label: String,
         value: String? = nil,
         chevron: Bool = false,
         action: (() -> Void)? = nil,
         @ViewBuilder accessory: @escaping () -> Accessory) {
        self.material = material
        self.label = label
        self.value = value
        self.chevron = chevron
        self.action = action
        self.accessory = accessory
    }

    var body: some View {
        Group {
            if let action = action {
                Button(action: action) { content }
                    .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
            } else {
                content
            }
        }
    }

    private var content: some View {
        HStack(alignment: .center, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                if let m = material {
                    MaterialIcon(name: m, size: 24, color: Theme.C.onSurface)
                }
                VStack(alignment: .leading, spacing: 4) {
                    RowLabel(text: label)
                    if let v = value {
                        Text(v)
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
            }
            Spacer(minLength: 12)
            accessory()
            if chevron {
                Image(systemName: Theme.Icon.sf("chevron_right"))
                    .font(.system(size: 16, weight: .light))
                    .foregroundColor(Theme.C.outline)
                    .frame(width: 24, height: 24)
            }
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            Hairline()
        }
    }
}

extension SettingsRow where Accessory == EmptyView {
    init(material: String? = nil,
         label: String,
         value: String? = nil,
         chevron: Bool = false,
         action: (() -> Void)? = nil) {
        self.init(material: material, label: label, value: value, chevron: chevron, action: action) { EmptyView() }
    }
}

/// Label + `.setting-toggle` (40×20). The tap is forwarded to the view model (single-key PUT);
/// taps while that key is saving are ignored there (B28) with no visual change (H5 parity).
struct SettingsToggleRow: View {
    let label: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        SettingsRow(label: label) {
            SettingToggle(isOn: isOn, action: action)
        }
    }
}

/// "…nudged me" + 40-char soft input + neon "Save" pill (`Saving…` while busy).
struct NudgeSuffixRow: View {
    @Binding var text: String
    let busy: Bool
    let onChange: () -> Void
    let onSave: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(L10n.t("…nudged me"))
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: true, vertical: false)
            SoftField(text: $text,
                      placeholder: L10n.placeholder("on the head"),
                      size: 14,
                      keyboard: .default,
                      autocap: .sentences,
                      submitLabel: .done,
                      onSubmit: onSave)
                .frame(maxWidth: .infinity)
                .onChange(of: text) { _ in onChange() }
            CTAButton(title: L10n.t("Save"),
                      style: .neonPill,
                      size: 10,
                      busy: busy,
                      busyTitle: L10n.t("Saving…"),
                      paddingV: 8,
                      paddingH: 16,
                      action: onSave)
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.vertical, 4)
    }
}
