import SwiftUI

// MARK: - Unimatcha Theme (neon-green on dark; brand aligned with apps/website + apps/h5)
//
// Central design tokens. Every view reads colors/typography from here — no inlined
// Color(red:...) literals scattered per file (that was the old pink-era mistake).

enum Theme {
    // Core palette
    static let accent = Color(hex: 0x39FF6A)          // neon green — primary brand
    static let accentDim = Color(hex: 0x2BCC55)
    static let onAccent = Color(hex: 0x07120B)        // near-black text on neon

    static let bg = Color(hex: 0x0B0F0C)              // near-black green-tinted background
    static let surface = Color(hex: 0x121814)         // cards
    static let surfaceHi = Color(hex: 0x1B241E)       // raised cards / inputs
    static let surfaceLo = Color(hex: 0x0E130F)

    static let textPrimary = Color(hex: 0xF2F7F3)
    static let textSecondary = Color(hex: 0x9BB0A2)
    static let textMuted = Color(hex: 0x64766A)
    static let outline = Color(hex: 0x243026)

    static let danger = Color(hex: 0xFF5A5F)
    static let warning = Color(hex: 0xFFC24B)

    // Radii / spacing
    static let radius: CGFloat = 14
    static let radiusSm: CGFloat = 10

    // Gradients
    static var accentGradient: LinearGradient {
        LinearGradient(colors: [accent, accentDim], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

// MARK: - Color hex helper
extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// MARK: - Reusable view modifiers / components

/// Primary call-to-action button style (neon fill).
struct NeonButtonStyle: ButtonStyle {
    var enabled: Bool = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .bold))
            .foregroundColor(Theme.onAccent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(enabled ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.outline))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

/// Outlined secondary button.
struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(Theme.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Card container.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: () -> Content
    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
    }
}

extension View {
    /// Apply the dark themed background to a screen root.
    func themedScreen() -> some View {
        self.background(Theme.bg.ignoresSafeArea())
    }
}
