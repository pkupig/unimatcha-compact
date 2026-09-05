import SwiftUI

// MARK: - Chip (h5-design-system.md §8.4)
//
//   .tag         `.tag-chip` (profile interests): gap 6, transparent, 1 pt transparent border, r10, padding 4/12,
//                12/700 tracking .08em; selected = neon bg + black text + neon border; trailing × (weight 400, 70 %).
//   .stage       `.stage-chip` / `.friend-interest-chip`: px-5 py-2.5, r10, 1 pt outlineVariant, 12/700 tracking .05em;
//                selected = neon/black/neon border.
//   .suggestion  setup-page suggestions: px-4 py-2, r10, 1 pt outlineVariant, 12 tracking .1em.
//   .interest    `.btn-tag`: 1 pt `outline` border, r10, padding 4/12, 12 tracking .08em; selected (`.filled`) =
//                black bg + white text.
//   .gender      setup gender / looking-for buttons: py-4 px-4, r10, 1 pt outlineVariant, 14 tracking .05em; selected neon.
//   .add         `.add-tag`: dashed `outline` border ("+ Add").

struct Chip: View {
    enum Style { case tag, stage, suggestion, interest, gender, add }

    var text: String
    var selected: Bool = false
    var style: Style = .tag
    var disabled: Bool = false
    var onTap: (() -> Void)? = nil
    var onRemove: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 6) {
            Button {
                guard !disabled else { return }
                onTap?()
            } label: {
                Text(text)
                    .font(Theme.font(fontSize, weight: fontWeight))
                    .tracking(Theme.tracking(trackingEm, size: fontSize))
                    .foregroundColor(foreground)
                    .lineLimit(1)
                    .frame(maxWidth: style == .gender ? .infinity : nil)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.98))
            .disabled(disabled || onTap == nil)

            if let onRemove = onRemove {
                Button(action: onRemove) {
                    Text("×")
                        .font(Theme.font(fontSize + 2, weight: .regular))
                        .foregroundColor(foreground)
                        .opacity(0.7)
                        .frame(width: 14, height: 14)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(disabled)
            }
        }
        .padding(.horizontal, padH)
        .padding(.vertical, padV)
        .frame(maxWidth: style == .gender ? .infinity : nil)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous))
        .overlay(border)
        .opacity(disabled ? 0.5 : 1)
    }

    private var fontSize: CGFloat { style == .gender ? 14 : 12 }

    private var fontWeight: Font.Weight {
        switch style {
        case .tag, .stage, .interest: return .bold
        case .suggestion, .gender, .add: return .regular
        }
    }

    private var trackingEm: CGFloat {
        switch style {
        case .tag, .interest, .add: return Theme.Tracking.badge   // .08em
        case .stage, .gender: return Theme.Tracking.wider         // .05em
        case .suggestion: return Theme.Tracking.widest            // .1em
        }
    }

    private var padH: CGFloat {
        switch style {
        case .tag, .interest, .add: return 12
        case .stage: return 20
        case .suggestion: return 16
        case .gender: return 16
        }
    }

    private var padV: CGFloat {
        switch style {
        case .tag, .interest, .add: return 4
        case .stage: return 10
        case .suggestion: return 8
        case .gender: return 16
        }
    }

    private var foreground: Color {
        if selected {
            switch style {
            case .interest: return Theme.C.onPrimary
            default: return .black
            }
        }
        switch style {
        case .add: return Theme.C.outline
        default: return Theme.C.onSurface
        }
    }

    private var background: Color {
        guard selected else { return .clear }
        switch style {
        case .interest: return Theme.C.primary
        default: return Theme.C.neon
        }
    }

    @ViewBuilder private var border: some View {
        let shape = RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous)
        switch style {
        case .tag:
            shape.stroke(selected ? Theme.C.neon : Color.clear, lineWidth: 1)
        case .stage, .suggestion, .gender:
            shape.stroke(selected ? Theme.C.neon : Theme.C.outlineVariant, lineWidth: 1)
        case .interest:
            shape.stroke(selected ? Theme.C.primary : Theme.C.outline, lineWidth: 1)
        case .add:
            shape.stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 3])).foregroundColor(Theme.C.outline)
        }
    }
}
