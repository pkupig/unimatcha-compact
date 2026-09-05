import SwiftUI
import UIKit

// MARK: - BottomNav (WP-16)
//
// H5 `#bottom-nav` (`h5-core.md §1.3`, `h5-design-system.md §7.3`):
//   floating pill, horizontally centred, `bottom: 14 + safe-area-bottom`, `padding 6px 14px`,
//   `gap 18`, `border-radius 9999`, `background rgba(255,255,255,.92)` (dark `rgba(28,27,25,.92)`)
//   + `backdrop-blur(20px)`, `border 1px rgba(0,0,0,.08)` (dark white 8 %), **no shadow**.
//   Height 62 = 50 (circle) + 2×6 padding; width ≈ 214.
//   Three icon-only items in 50×50 circular hit areas, icon 33 pt: `chat_bubble` → Match,
//   `eco` → Square, `person` → Profile. Inactive `#a3a3a3` FILL 0; active neon `#CCFF00` FILL 1,
//   no background pill behind the icon. Labels exist in the DOM but are `display:none`
//   (they are kept here as accessibility labels only).
//   Hidden state: `translateY(100% + 24)` + `opacity 0` over 0.3 s `cubic-bezier(.22,1,.36,1)`.

struct BottomNav: View {
    let active: AppTab
    let hidden: Bool
    let onSelect: (AppTab) -> Void

    private struct Item: Identifiable {
        let tab: AppTab
        /// Material Symbols name (mapped through `Theme.Icon.sf`).
        let icon: String
        /// Dictionary key for the (visually hidden) label — used as the accessibility label.
        let label: String
        var id: String { label }
    }

    private static let items: [Item] = [
        Item(tab: .match, icon: "chat_bubble", label: "Match"),
        Item(tab: .square, icon: "eco", label: "Square"),
        Item(tab: .profile, icon: "person", label: "Profile"),
    ]

    /// H5 draws the nav glyph with `FILL 1` when active and `FILL 0` when inactive.
    /// `Theme.Icon.sf` maps all three tab icons to the filled SF variant, so the inactive
    /// state drops a trailing `.fill` (guarded by an existence probe, never a literal name).
    static func symbol(_ material: String, active: Bool) -> String {
        let filled = Theme.Icon.sf(material, filled: true)
        guard !active, filled.hasSuffix(".fill") else { return filled }
        let outline = String(filled.dropLast(5))
        return UIImage(systemName: outline) != nil ? outline : filled
    }

    var body: some View {
        HStack(spacing: 18) {
            ForEach(Self.items) { item in
                Button {
                    onSelect(item.tab)
                } label: {
                    Image(systemName: Self.symbol(item.icon, active: item.tab == active))
                        .font(.system(size: Theme.Bar.navIcon * 0.72, weight: item.tab == active ? .regular : .light))
                        .frame(width: Theme.Bar.navCircle, height: Theme.Bar.navCircle)
                        .foregroundColor(item.tab == active ? Theme.C.neon : Theme.C.neutral400)
                        .contentShape(Circle())
                }
                .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
                .accessibilityLabel(Text(L10n.t(item.label)))
                .accessibilityAddTraits(item.tab == active ? [.isButton, .isSelected] : [.isButton])
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 14)
        .background(
            Capsule(style: .circular)
                .fill(Theme.C.navPill)
                .background(Capsule(style: .circular).fill(.ultraThinMaterial))
                .overlay(Capsule(style: .circular).strokeBorder(Theme.C.navPillBorder, lineWidth: 1))
        )
        .clipShape(Capsule(style: .circular))
        .opacity(hidden ? 0 : 1)
        // `translateY(calc(100% + 24px))` — the pill is 62 pt tall.
        .offset(y: hidden ? Theme.Bar.navPill + 24 : 0)
        .animation(Theme.Motion.navHide, value: hidden)
        .allowsHitTesting(!hidden)
    }
}
