import SwiftUI

// MARK: - Preference-sheet building blocks (h5-match.md §1.12 markup) — WP-17
//
// The pieces of `#filter-overlay` that are not already in the shared kit. Every geometry
// value below is the Tailwind class of the H5 markup:
//   section heading   `font-headline font-extrabold text-xs tracking-[0.2em] text-black`
//   read-only notice  `mx-6 mt-4 mb-1 px-4 py-2.5 rounded-[12px] bg-surface-container-low`
//   switch row        `flex justify-between items-center py-3.5 border-b border-stone-100`
//                     label `font-headline font-bold text-sm tracking-tight`
//   enhance item      `flex items-start justify-between gap-4 py-2`, label 14 `on-surface`
//                     `leading-relaxed`, sub `text-xs text-stone-500 mt-0.5`, switch `mt-1`
//   cells block       `mt-5`; labels 10 widest `outline` with a bold black number; slider 1–5;
//                     end labels `mt-2` 10 medium `stone-400`
//   retake row        `py-4 px-4 border border-black rounded-[10px]`, 14/700 tracking-tight

/// `<h2 class="font-headline font-extrabold text-xs tracking-[0.2em] text-black">`.
struct PrefSectionHeading: View {
    var text: String
    /// `mb-3` (12) for most headings, `mb-6` (24) for School Filter and the friend gender block.
    var bottomPadding: CGFloat = 12

    var body: some View {
        SectionLabel(text: text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, bottomPadding)
    }
}

/// Inserted between the header and the body while the pool is active (`applyPanelReadonly`).
struct PrefReadOnlyNotice: View {
    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Image(systemName: Theme.Icon.sf("lock"))
                .font(.system(size: 17, weight: .light))
                .foregroundColor(Theme.C.outline)
            Text(L10n.pick("Matching in progress — view only. Leave the pool to make changes.",
                           "匹配中：设置仅可查看。离开匹配池后可修改。"))
                .font(Theme.font(11))
                .lineSpacing(11 * 0.375)          // leading-snug (1.375)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: Theme.R.plate, style: .continuous).fill(Theme.C.containerLow))
        .padding(.horizontal, Theme.Space.page)
        .padding(.top, 16)
        .padding(.bottom, 4)
    }
}

/// School-filter row: 14/700 tracking-tight label + `.ink-switch`, `py-3.5` with a hairline below.
struct PrefSwitchRow: View {
    var label: String
    @Binding var isOn: Bool
    var disabled: Bool = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(label)
                .font(Theme.font(14, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 14))
                .foregroundColor(Theme.C.onSurface)
            Spacer(minLength: 0)
            InkSwitch(isOn: $isOn, disabled: disabled)
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.C.hairline).frame(height: 1) }
    }
}

/// `#romantic-enhance-item` / `#friend-enhance-item` label + sub-line + switch.
struct PrefEnhanceRow: View {
    var title: String
    var subtitle: String
    var isOn: Bool
    var disabled: Bool
    var toggle: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.font(14))
                    .lineSpacing(14 * 0.625)      // leading-relaxed (1.625)
                    .foregroundColor(Theme.C.onSurface)
                Text(subtitle)
                    .font(Theme.font(12))
                    .foregroundColor(Theme.C.stone500)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Button(action: toggle) {
                // Read-only rendering of the current state; the tap runs the async balance check.
                ZStack(alignment: .leading) {
                    Capsule().fill(isOn ? Theme.C.neon : Theme.C.inkTrack)
                    Circle()
                        .fill(Color.white)
                        .frame(width: 16, height: 16)
                        .offset(x: isOn ? 4 + 24 : 4)
                }
                .frame(width: 48, height: 24)
                .contentShape(Capsule())
                .animation(.easeInOut(duration: 0.3), value: isOn)
            }
            .buttonStyle(.plain)
            .disabled(disabled)
            .opacity(disabled ? 0.5 : 1)
            .padding(.top, 4)
            .accessibilityValue(isOn ? "on" : "off")
        }
        .padding(.vertical, 8)
    }
}

/// `#friend-cells-wrap`: "GUARANTEE: N friends" / "Cost: N cells" + the 1–5 slider.
struct PrefFriendCellsBlock: View {
    var cells: Int
    var disabled: Bool
    var onChange: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom) {
                composed(prefix: L10n.pick("GUARANTEE: ", "保底："),
                         value: cells,
                         suffix: L10n.pick(" friends", " 位朋友"))
                Spacer(minLength: 8)
                composed(prefix: L10n.pick("Cost: ", "消耗："),
                         value: cells,
                         suffix: L10n.pick(" cells", " 格能量"))
            }
            .padding(.bottom, 8)

            InkSlider(value: Binding(get: { cells }, set: { onChange($0) }),
                      range: EnhancedPrefs.cellsRange,
                      disabled: disabled)

            HStack {
                endLabel("1")
                Spacer(minLength: 0)
                endLabel("5")
            }
            .padding(.top, 8)
        }
        .padding(.top, 20)
    }

    private func composed(prefix: String, value: Int, suffix: String) -> some View {
        // The number is `font-headline font-bold text-black`; the label around it is
        // 10 / 700 / widest `outline` — colours are set per run, never on the concatenation.
        (Text(prefix)
            .font(Theme.font(10, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
            .foregroundColor(Theme.C.outline)
            + Text("\(value)")
            .font(Theme.font(10, weight: .bold))
            .foregroundColor(Theme.C.primary)
            + Text(suffix)
            .font(Theme.font(10, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
            .foregroundColor(Theme.C.outline))
            .lineLimit(1)
    }

    private func endLabel(_ t: String) -> some View {
        Text(t)
            .font(Theme.font(10, weight: .medium))
            .foregroundColor(Theme.C.stone400)
    }
}

/// Age Range block: heading + live value, "Min"/"Max" sliders with linkage, "Any age" checkbox.
struct PrefAgeRangeSection: View {
    @Binding var ageAny: Bool
    @Binding var ageMin: Int
    @Binding var ageMax: Int
    var disabled: Bool
    var display: String

    var body: some View {
        // H5 `space-y-4` (16) with a `pt-2` (8) on each block → 24 between the three blocks.
        VStack(alignment: .leading, spacing: 24) {
            HStack(alignment: .bottom) {
                SectionLabel(text: L10n.t("Age Range"))
                Spacer(minLength: 8)
                Text(display)
                    .font(Theme.font(18, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.tighter, size: 18))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
            }

            RangeSlider(minValue: $ageMin,
                        maxValue: $ageMax,
                        range: MatchPreferencesWrite.ageRange,
                        disabled: ageAny || disabled,
                        minLabel: L10n.pick("Min", "最小"),
                        maxLabel: L10n.pick("Max", "最大"))

            NeonCheck(isOn: $ageAny, label: L10n.t("Any age"), disabled: disabled)
        }
    }
}

/// Full-width "Retake Questionnaire" row: `tune` + label + `chevron_right`, 1 pt black frame.
struct PrefRetakeRow: View {
    var disabled: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 0) {
                HStack(spacing: 6) {
                    Image(systemName: Theme.Icon.sf("tune"))
                        .font(.system(size: 20, weight: .light))
                        .foregroundColor(Theme.C.primary)
                    Text(L10n.t("Retake Questionnaire"))
                        .font(Theme.font(14, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.tight, size: 14))
                        .foregroundColor(Theme.C.primary)
                }
                Spacer(minLength: 8)
                Image(systemName: Theme.Icon.sf("chevron_right"))
                    .font(.system(size: 20, weight: .light))
                    .foregroundColor(Theme.C.primary)
            }
            .padding(.vertical, 16)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(Theme.C.borderStrong, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
        .disabled(disabled)
    }
}
