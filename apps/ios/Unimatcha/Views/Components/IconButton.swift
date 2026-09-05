import SwiftUI

// MARK: - IconButton (h5-design-system.md §8.1 "Icon buttons")
//
// Circular tap target: 40 pt (home bar, chat composer), 36 pt (post-detail header / footer,
// square search), icon 22 / 21 / 19 pt; `active:scale-95` (or `.90` for the small circles).
// Optional filled circle background (`bg-surface-container-low` comment-bar icons, neon send).

struct IconButton: View {
    var sf: String
    var size: CGFloat = 40
    var iconSize: CGFloat = 22
    var tint: Color = Theme.C.onSurface
    var background: Color? = nil
    var weight: Font.Weight = .light          // Material weight 300 outlines (§14.15)
    var pressScale: CGFloat? = nil
    var disabled: Bool = false
    var accessibilityLabel: String? = nil
    var action: () -> Void

    /// Material-name convenience (`IconButton(material: "arrow_back", …)`).
    init(material: String,
         filled: Bool = false,
         size: CGFloat = 40,
         iconSize: CGFloat = 22,
         tint: Color = Theme.C.onSurface,
         background: Color? = nil,
         weight: Font.Weight = .light,
         pressScale: CGFloat? = nil,
         disabled: Bool = false,
         accessibilityLabel: String? = nil,
         action: @escaping () -> Void) {
        self.sf = Theme.Icon.sf(material, filled: filled)
        self.size = size
        self.iconSize = iconSize
        self.tint = tint
        self.background = background
        self.weight = weight
        self.pressScale = pressScale
        self.disabled = disabled
        self.accessibilityLabel = accessibilityLabel ?? material
        self.action = action
    }

    init(sf: String,
         size: CGFloat = 40,
         iconSize: CGFloat = 22,
         tint: Color = Theme.C.onSurface,
         background: Color? = nil,
         weight: Font.Weight = .light,
         pressScale: CGFloat? = nil,
         disabled: Bool = false,
         accessibilityLabel: String? = nil,
         action: @escaping () -> Void) {
        self.sf = sf
        self.size = size
        self.iconSize = iconSize
        self.tint = tint
        self.background = background
        self.weight = weight
        self.pressScale = pressScale
        self.disabled = disabled
        self.accessibilityLabel = accessibilityLabel
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                if let bg = background {
                    Circle().fill(bg)
                }
                Image(systemName: sf)
                    .font(.system(size: iconSize * 0.82, weight: weight))
                    .foregroundColor(tint)
                    .frame(width: iconSize, height: iconSize)
            }
            .frame(width: size, height: size)
            .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: pressScale ?? (size <= 36 ? 0.90 : 0.95)))
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
        .accessibilityLabel(accessibilityLabel ?? sf)
    }
}

// MARK: - Static icon helper

/// A Material icon rendered as an SF Symbol at the H5 pixel size (24 pt default, weight 300).
struct MaterialIcon: View {
    var name: String
    var size: CGFloat = 24
    var filled: Bool = false
    var weight: Font.Weight = .light
    var color: Color? = nil

    var body: some View {
        Image(systemName: Theme.Icon.sf(name, filled: filled))
            .font(.system(size: size * 0.82, weight: weight))
            .foregroundColor(color)
            .frame(width: size, height: size)
    }
}
