import SwiftUI

// MARK: - PillSegmented (h5-design-system.md §8.6)
//
//   .home  `.home-mode-switch`: white (dark #1c1b19) pill, 40 pt tall, 1 pt 8 % border, 3 pt padding + 3 pt gap,
//          max-width 268, segments sized by content (`padding 0 10.4px`), 12/700 tracking .04em, active neon/black,
//          press scale .98.
//   .sheet Target-Gender pill in the preferences sheet: 1 pt `outlineVariant/60` frame, `p-1`, equal segments
//          `py-3`, 12/700 tracking .05em, black text, selected neon/black.
//   .qr    Friend-hub "My QR / Scan" (`.af-seg`): same frame, `py-2`, unselected `onSurface`.

struct PillSegmented: View {
    enum Style { case home, sheet, qr }

    var items: [String]
    @Binding var selection: Int
    var style: Style = .home
    var disabled: Bool = false
    var onSelect: ((Int) -> Void)? = nil

    var body: some View {
        HStack(spacing: style == .home ? 3 : 0) {
            ForEach(items.indices, id: \.self) { i in
                Button {
                    guard !disabled else { return }
                    if selection != i {
                        withAnimation(Theme.Motion.snap) { selection = i }
                    }
                    onSelect?(i)
                } label: {
                    Text(items[i])
                        .font(Theme.font(12, weight: .bold))
                        .tracking(Theme.tracking(style == .home ? 0.04 : Theme.Tracking.wider, size: 12))
                        .lineLimit(1)
                        .foregroundColor(selection == i ? .black : Theme.C.onSurface)
                        .padding(.horizontal, style == .home ? 10.4 : 8)
                        .frame(maxWidth: style == .home ? nil : .infinity)
                        .frame(height: segmentHeight)
                        .background(selection == i ? Theme.C.neon : Color.clear)
                        .clipShape(Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.98))
                .disabled(disabled)
            }
        }
        .padding(style == .home ? 3 : 4)
        .frame(maxWidth: style == .home ? 268 : .infinity)
        .frame(height: style == .home ? 40 : nil)
        .background(style == .home ? Theme.C.card : Color.clear)
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(style == .home ? Theme.C.navPillBorder : Theme.C.outlineVariant.opacity(0.6), lineWidth: 1)
        )
        .opacity(disabled ? 0.6 : 1)
    }

    private var segmentHeight: CGFloat {
        switch style {
        case .home: return 32          // 40 − 2×3 padding − 2×1 border
        case .sheet: return 12 * 1.0 + 24  // py-3 around a 12 pt / lh 1 label
        case .qr: return 12 * 1.0 + 16     // py-2
        }
    }
}
