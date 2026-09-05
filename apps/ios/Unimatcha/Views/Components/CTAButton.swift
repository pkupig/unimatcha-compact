import SwiftUI

// MARK: - CTAButton (h5-design-system.md §8.1)
//
// One button component for every H5 button family. Defaults per style follow the table:
//   .neon          `.btn-cta`: full width, neon/black, r10, padding 20/24, 14/700, tracking .1em, active scale .98, disabled .5
//   .neonPill      header Save pill: neon/black, rounded-full, px-5 py-2, 12/700 tracking widest, active .95
//   .outlineBlack  `.btn-secondary`: transparent, 1 pt `borderStrong`, r10, padding 12/24, 12/700 tracking .1em
//   .outlineNeutral modal secondary ("Close", "Maybe Later"): 1 pt outlineVariant, r10, py-4, 10/700 tracking .2em
//   .pinkOutline   `.btn-danger` / Log Out / Leave Pool: 1–2 pt neonPink border + pink text
//   .dangerFill    confirm-card danger OK: pink fill, white text
//   .text          text button: 10/700 tracking widest, `outline`
//   .linkUnderline "Retry": 10/700 tracking .2em, black, 2 pt bottom border
// `size` / `tracking` / `padding` / `fullWidth` override the defaults for the markup variants.

struct CTAButton: View {
    enum Style { case neon, neonPill, outlineBlack, outlineNeutral, pinkOutline, dangerFill, text, linkUnderline }

    var title: String
    var style: Style = .neon
    var size: CGFloat? = nil                 // font size override
    var weight: Font.Weight? = nil
    var tracking: CGFloat? = nil             // em override
    var busy: Bool = false
    var busyTitle: String? = nil             // label while busy (e.g. "Saving…"); default = title
    var disabled: Bool = false
    var fullWidth: Bool? = nil
    var paddingV: CGFloat? = nil
    var paddingH: CGFloat? = nil
    var sf: String? = nil                    // optional leading SF symbol
    var iconSize: CGFloat = 14
    var borderWidth: CGFloat? = nil
    var action: () -> Void

    @State private var pressed = false

    var body: some View {
        Button {
            guard !busy, !disabled else { return }
            action()
        } label: {
            HStack(spacing: 6) {
                if let sf = sf {
                    Image(systemName: sf)
                        .font(.system(size: iconSize, weight: .medium))
                }
                Text(busy ? (busyTitle ?? title) : title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .font(Theme.font(fontSize, weight: fontWeight))
            .tracking(Theme.tracking(trackingEm, size: fontSize))
            .foregroundColor(foreground)
            .padding(.vertical, padV)
            .padding(.horizontal, padH)
            .frame(maxWidth: isFullWidth ? .infinity : nil)
            .background(background)
            .clipShape(shape)
            .overlay(border)
            .overlay(alignment: .bottom) {
                if style == .linkUnderline {
                    Rectangle().fill(Theme.C.borderStrong).frame(height: 2)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: pressScale))
        .disabled(disabled || busy)
        .opacity(disabled ? 0.5 : (busy ? 0.7 : 1))
    }

    // MARK: Defaults per style

    private var fontSize: CGFloat {
        if let s = size { return s }
        switch style {
        case .neon: return 14
        case .neonPill: return 12
        case .outlineBlack: return 12
        case .outlineNeutral: return 10
        case .pinkOutline: return 12
        case .dangerFill: return 12
        case .text: return 10
        case .linkUnderline: return 10
        }
    }

    private var fontWeight: Font.Weight {
        weight ?? .bold
    }

    private var trackingEm: CGFloat {
        if let t = tracking { return t }
        switch style {
        case .neon, .neonPill, .outlineBlack, .pinkOutline, .dangerFill, .text: return Theme.Tracking.widest
        case .outlineNeutral, .linkUnderline: return Theme.Tracking.section
        }
    }

    private var isFullWidth: Bool {
        if let f = fullWidth { return f }
        switch style {
        case .neon, .outlineNeutral, .pinkOutline, .dangerFill: return true
        case .neonPill, .outlineBlack, .text, .linkUnderline: return false
        }
    }

    private var padV: CGFloat {
        if let p = paddingV { return p }
        switch style {
        case .neon: return 20
        case .neonPill: return 8
        case .outlineBlack: return 12
        case .outlineNeutral: return 16
        case .pinkOutline: return 12
        case .dangerFill: return 12
        case .text: return 6
        case .linkUnderline: return 4
        }
    }

    private var padH: CGFloat {
        if let p = paddingH { return p }
        switch style {
        case .neon: return 24
        case .neonPill: return 20
        case .outlineBlack: return 24
        case .outlineNeutral: return 16
        case .pinkOutline: return 24
        case .dangerFill: return 16
        case .text: return 4
        case .linkUnderline: return 0
        }
    }

    private var foreground: Color {
        switch style {
        case .neon, .neonPill: return .black
        case .outlineBlack: return Theme.C.primary
        case .outlineNeutral: return Theme.C.onSurfaceVariant
        case .pinkOutline: return Theme.C.neonPink
        case .dangerFill: return .white
        case .text: return Theme.C.outline
        case .linkUnderline: return Theme.C.primary
        }
    }

    private var background: Color {
        switch style {
        case .neon, .neonPill: return Theme.C.neon
        case .dangerFill: return Theme.C.neonPink
        default: return .clear
        }
    }

    private var shape: AnyShape {
        switch style {
        case .neonPill: return AnyShape(Capsule())
        case .text, .linkUnderline: return AnyShape(Rectangle())
        default: return AnyShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        }
    }

    @ViewBuilder private var border: some View {
        switch style {
        case .outlineBlack:
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.borderStrong, lineWidth: borderWidth ?? 1)
        case .outlineNeutral:
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.outlineVariant, lineWidth: borderWidth ?? 1)
        case .pinkOutline:
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.neonPink, lineWidth: borderWidth ?? 1)
        default:
            EmptyView()
        }
    }

    private var pressScale: CGFloat {
        switch style {
        case .neonPill: return 0.95
        case .text, .linkUnderline: return 1
        default: return 0.98
        }
    }
}

// MARK: - Press feedback

/// `active:scale-*` with `duration-150`.
struct PressScaleButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.95
    var opacity: Double = 1

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? opacity : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}

/// `active:opacity-70` (session rows).
struct PressOpacityButtonStyle: ButtonStyle {
    var opacity: Double = 0.7
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? opacity : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}

/// Type-erased shape (iOS 16 has no `AnyShape`).
struct AnyShape: Shape {
    private let pathBuilder: (CGRect) -> Path
    init<S: Shape>(_ shape: S) { pathBuilder = { shape.path(in: $0) } }
    func path(in rect: CGRect) -> Path { pathBuilder(rect) }
}
