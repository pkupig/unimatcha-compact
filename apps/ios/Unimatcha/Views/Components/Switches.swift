import SwiftUI

// MARK: - Toggles & checkbox (h5-design-system.md §8.3)

/// `.ink-switch`: 48×24 pill, track `#e2e2e2` → neon when on (0.3 s), 16 pt white knob at 4 pt
/// inset translating 24 pt. Filter sheet + new-post options.
struct InkSwitch: View {
    @Binding var isOn: Bool
    var disabled: Bool = false
    var onChange: ((Bool) -> Void)? = nil

    var body: some View {
        Button {
            guard !disabled else { return }
            withAnimation(.easeInOut(duration: 0.3)) { isOn.toggle() }
            onChange?(isOn)
        } label: {
            ZStack(alignment: .leading) {
                Capsule().fill(isOn ? Theme.C.neon : Theme.C.inkTrack)
                Circle()
                    .fill(Color.white)
                    .frame(width: 16, height: 16)
                    .offset(x: isOn ? 4 + 24 : 4)
            }
            .frame(width: 48, height: 24)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
        .accessibilityValue(isOn ? "on" : "off")
    }
}

/// `.setting-toggle`: 40×20; ON = neon track + 16 pt white knob at `right-0.5`; OFF = `containerHigh`
/// track + `outlineVariant` knob at `left-0.5`. Tapping runs `action` (the settings page PUTs the key).
struct SettingToggle: View {
    var isOn: Bool
    var disabled: Bool = false
    var action: () -> Void

    var body: some View {
        Button {
            guard !disabled else { return }
            action()
        } label: {
            ZStack(alignment: .leading) {
                Capsule().fill(isOn ? Theme.C.neon : Theme.C.containerHigh)
                Circle()
                    .fill(isOn ? Color.white : Theme.C.outlineVariantFill)
                    .frame(width: 16, height: 16)
                    .offset(x: isOn ? 40 - 2 - 16 : 2)
            }
            .frame(width: 40, height: 20)
            .contentShape(Capsule())
            .animation(.easeInOut(duration: 0.2), value: isOn)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
        .accessibilityValue(isOn ? "on" : "off")
    }
}

/// `.mp-toggle` (read-only display in the preferences summary box): 40×22, track `#d6d4d3` / neon,
/// 17 pt white knob with `0 1px 3px rgba(0,0,0,.25)` shadow, 2.5 pt inset, translates 18 pt.
struct DisplayToggle: View {
    var isOn: Bool

    var body: some View {
        ZStack(alignment: .leading) {
            Capsule().fill(isOn ? Theme.C.neon : Theme.C.mpToggleOff)
            Circle()
                .fill(Color.white)
                .frame(width: 17, height: 17)
                .shadow(color: Color.black.opacity(0.25), radius: 1.5, x: 0, y: 1)
                .offset(x: isOn ? 2.5 + 18 : 2.5)
        }
        .frame(width: 40, height: 22)
        .animation(.easeInOut(duration: 0.2), value: isOn)
        .accessibilityValue(isOn ? "on" : "off")
    }
}

/// `.neon-check`: 16 pt box, radius 6, checked = neon fill + neon border + black check glyph;
/// unchecked = 1 pt `outline` border. Optional label = "Any age" row style (10/700 widest `outline`, gap 12).
struct NeonCheck: View {
    @Binding var isOn: Bool
    var label: String? = nil
    var disabled: Bool = false
    var onChange: ((Bool) -> Void)? = nil

    var body: some View {
        Button {
            guard !disabled else { return }
            isOn.toggle()
            onChange?(isOn)
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.R.feed, style: .continuous)
                        .fill(isOn ? Theme.C.neon : Color.clear)
                    RoundedRectangle(cornerRadius: Theme.R.feed, style: .continuous)
                        .stroke(isOn ? Theme.C.neon : Theme.C.outline, lineWidth: 1)
                    if isOn {
                        Image(systemName: Theme.Icon.sf("check"))
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundColor(.black)
                    }
                }
                .frame(width: 16, height: 16)
                if let label = label {
                    Text(label)
                        .font(Theme.font(10, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                        .foregroundColor(Theme.C.outline)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
        .accessibilityValue(isOn ? "checked" : "unchecked")
    }
}

/// Questionnaire radio: 20 pt circle, 2 pt `outline` border, black dot when selected.
struct InkRadio: View {
    var selected: Bool

    var body: some View {
        ZStack {
            Circle().stroke(selected ? Theme.C.primary : Theme.C.outline, lineWidth: 2)
            if selected {
                Circle().fill(Theme.C.primary).frame(width: 10, height: 10)
            }
        }
        .frame(width: 20, height: 20)
    }
}
