import SwiftUI

// MARK: - Text labels & list rows (h5-design-system.md §2.6, §3.4)

/// SectionLabel: 12 / 800 / tracking .2em (filter sheet `text-black`; settings `text-outline`).
struct SectionLabel: View {
    var text: String
    var color: Color = Theme.C.primary
    var uppercase: Bool = false

    var body: some View {
        Text(uppercase ? text.uppercased() : text)
            .font(Theme.font(12, weight: .heavy))
            .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
            .foregroundColor(color)
    }
}

/// MicroLabel: 10 / 700 / tracking .1em (default) in `onSurfaceVariant`; `.15em` outline on auth,
/// `.2em` on setup — pass `tracking:` / `color:`.
struct MicroLabel: View {
    var text: String
    var color: Color = Theme.C.onSurfaceVariant
    var tracking: CGFloat = Theme.Tracking.widest
    var weight: Font.Weight = .bold
    var uppercase: Bool = false

    var body: some View {
        Text(uppercase ? text.uppercased() : text)
            .font(Theme.font(10, weight: weight))
            .tracking(Theme.tracking(tracking, size: 10))
            .foregroundColor(color)
    }
}

/// RowLabel: 14 / 500 / tracking .025em / onSurface (settings & profile rows).
struct RowLabel: View {
    var text: String
    var color: Color = Theme.C.onSurface
    var body: some View {
        Text(text)
            .font(Theme.font(14, weight: .medium))
            .tracking(Theme.tracking(Theme.Tracking.wide, size: 14))
            .foregroundColor(color)
    }
}

/// Profile / settings list row: 24 pt icon (`onSurface`) + 14/500/wide label + accessory
/// (value text, custom view or `chevron_right` in `outlineVariant`), `py-4` = 16 pt, 1 pt hairline
/// (`outline-variant/20`) beneath, icon→label gap 16.
struct HairlineRow<Accessory: View>: View {
    var sf: String?
    var label: String
    var subtitle: String? = nil
    var iconFilled: Bool = false
    var iconColor: Color = Theme.C.onSurface
    var chevron: Bool = true
    var hairline: Bool = true
    var paddingV: CGFloat = 16
    var action: (() -> Void)? = nil
    @ViewBuilder var accessory: () -> Accessory

    init(sf: String? = nil,
         label: String,
         subtitle: String? = nil,
         iconFilled: Bool = false,
         iconColor: Color = Theme.C.onSurface,
         chevron: Bool = true,
         hairline: Bool = true,
         paddingV: CGFloat = 16,
         action: (() -> Void)? = nil,
         @ViewBuilder accessory: @escaping () -> Accessory) {
        self.sf = sf
        self.label = label
        self.subtitle = subtitle
        self.iconFilled = iconFilled
        self.iconColor = iconColor
        self.chevron = chevron
        self.hairline = hairline
        self.paddingV = paddingV
        self.action = action
        self.accessory = accessory
    }

    /// Material-name convenience.
    init(material: String,
         filled: Bool = false,
         label: String,
         subtitle: String? = nil,
         iconColor: Color = Theme.C.onSurface,
         chevron: Bool = true,
         hairline: Bool = true,
         paddingV: CGFloat = 16,
         action: (() -> Void)? = nil,
         @ViewBuilder accessory: @escaping () -> Accessory) {
        self.init(sf: Theme.Icon.sf(material, filled: filled),
                  label: label,
                  subtitle: subtitle,
                  iconFilled: filled,
                  iconColor: iconColor,
                  chevron: chevron,
                  hairline: hairline,
                  paddingV: paddingV,
                  action: action,
                  accessory: accessory)
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
        HStack(spacing: 16) {
            if let sf = sf {
                Image(systemName: sf)
                    .font(.system(size: 20, weight: iconFilled ? .regular : .light))
                    .foregroundColor(iconColor)
                    .frame(width: 24, height: 24)
            }
            VStack(alignment: .leading, spacing: 2) {
                RowLabel(text: label)
                if let s = subtitle {
                    Text(s)
                        .font(Theme.font(11))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 8)
            accessory()
            if chevron {
                Image(systemName: Theme.Icon.sf("chevron_right"))
                    .font(.system(size: 15, weight: .light))
                    .foregroundColor(Theme.C.outlineVariantText)
                    .frame(width: 24, height: 24)
            }
        }
        .padding(.vertical, paddingV)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            if hairline {
                Rectangle().fill(Theme.C.hairline20).frame(height: 1)
            }
        }
    }
}

extension HairlineRow where Accessory == EmptyView {
    init(sf: String? = nil,
         label: String,
         subtitle: String? = nil,
         iconFilled: Bool = false,
         iconColor: Color = Theme.C.onSurface,
         chevron: Bool = true,
         hairline: Bool = true,
         paddingV: CGFloat = 16,
         action: (() -> Void)? = nil) {
        self.init(sf: sf, label: label, subtitle: subtitle, iconFilled: iconFilled, iconColor: iconColor,
                  chevron: chevron, hairline: hairline, paddingV: paddingV, action: action) { EmptyView() }
    }

    init(material: String,
         filled: Bool = false,
         label: String,
         subtitle: String? = nil,
         iconColor: Color = Theme.C.onSurface,
         chevron: Bool = true,
         hairline: Bool = true,
         paddingV: CGFloat = 16,
         action: (() -> Void)? = nil) {
        self.init(sf: Theme.Icon.sf(material, filled: filled), label: label, subtitle: subtitle,
                  iconFilled: filled, iconColor: iconColor, chevron: chevron, hairline: hairline,
                  paddingV: paddingV, action: action) { EmptyView() }
    }
}

/// 1 pt hairline divider (`border-outline-variant/20`).
struct Hairline: View {
    var color: Color = Theme.C.hairline20
    var body: some View { Rectangle().fill(color).frame(height: 1) }
}
