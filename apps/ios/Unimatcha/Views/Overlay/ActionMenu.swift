import SwiftUI

// MARK: - ActionMenu (h5-core.md §1.7, h5-design-system.md §8.13 / §8.14 — WP-03a)
//
// Popover card used as the content of `.popover` overlays.
//   .compact  post-detail / comment action menu (`.pd-cm-menu`): min-width 148, bg card,
//             1 pt `outline-variant/30` border, r12, shadow-2xl, py-1; rows px-4 py-2.5
//             gap-2.5: 18 pt outline icon + 14 pt on-surface text, press bg container.
//   .plus     chat "+" menu (`#chat-plus-menu`): min-width 208, bg card, r14, 1 pt hairline
//             border, shadow 0 10 32 .16, padding 6; rows padding 11/12 gap 12 r10,
//             13/700 tracking .02em on-surface, 20 pt icon, hover container-low, press .98.
// Tapping a row dismisses the enclosing overlay (via the `overlayId` environment) and THEN
// runs the action (H5: "menu removes itself, then runs the action").

struct ActionMenu: View {
    struct Row: Identifiable {
        let id: String
        /// SF Symbol name (use `Theme.Icon.sf("ios_share")` etc.).
        let sf: String
        let label: String
        var tint: Color? = nil
        let action: () -> Void

        init(id: String? = nil, sf: String, label: String, tint: Color? = nil, action: @escaping () -> Void) {
            self.id = id ?? label
            self.sf = sf
            self.label = label
            self.tint = tint
            self.action = action
        }
    }

    enum Style {
        case compact
        case plus

        var minWidth: CGFloat { self == .compact ? 148 : 208 }
        var cornerRadius: CGFloat { self == .compact ? Theme.R.plate : Theme.R.menu }
        var iconSize: CGFloat { self == .compact ? 18 : 20 }
        var fontSize: CGFloat { self == .compact ? 14 : 13 }
        var fontWeight: Font.Weight { self == .compact ? .regular : .bold }
        var rowGap: CGFloat { self == .compact ? 10 : 12 }
        var rowHorizontal: CGFloat { self == .compact ? 16 : 12 }
        var rowVertical: CGFloat { self == .compact ? 10 : 11 }
        var cardPadding: CGFloat { self == .compact ? 0 : 6 }
        var listVerticalPadding: CGFloat { self == .compact ? 4 : 0 }
    }

    let rows: [Row]
    var style: Style = .compact
    var dismissOnSelect: Bool = true

    @Environment(\.overlayId) private var overlayId

    init(rows: [Row], style: Style = .compact, dismissOnSelect: Bool = true) {
        self.rows = rows
        self.style = style
        self.dismissOnSelect = dismissOnSelect
    }

    /// Convenience for the PLAN shape `[(sf, label, action)]`.
    init(_ items: [(sf: String, label: String, action: () -> Void)], style: Style = .compact, dismissOnSelect: Bool = true) {
        self.init(
            rows: items.map { Row(sf: $0.sf, label: $0.label, action: $0.action) },
            style: style,
            dismissOnSelect: dismissOnSelect
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(rows) { row in
                Button {
                    select(row)
                } label: {
                    HStack(spacing: style.rowGap) {
                        Image(systemName: row.sf)
                            .font(.system(size: style.iconSize - 2, weight: style == .plus ? .semibold : .regular))
                            .frame(width: style.iconSize, height: style.iconSize)
                        Text(row.label)
                            .font(Theme.font(style.fontSize, weight: style.fontWeight))
                            .tracking(style == .plus ? Theme.tracking(0.02, size: style.fontSize) : 0)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .foregroundColor(row.tint ?? Theme.C.onSurface)
                    .padding(.horizontal, style.rowHorizontal)
                    .padding(.vertical, style.rowVertical)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(MenuRowStyle(style: style))
            }
        }
        .padding(.vertical, style.listVerticalPadding)
        .padding(style.cardPadding)
        .frame(minWidth: style.minWidth, alignment: .leading)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous)
                .stroke(style == .compact ? Theme.C.outlineVariant.opacity(0.3) : Theme.C.hairline, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(style == .compact ? 0.25 : 0.16),
                radius: style == .compact ? 25 : 16,
                x: 0,
                y: style == .compact ? 20 : 10)
    }

    private func select(_ row: Row) {
        if dismissOnSelect, let id = overlayId {
            OverlayRouter.shared.dismiss(id: id)
        }
        row.action()
    }
}

private struct MenuRowStyle: ButtonStyle {
    let style: ActionMenu.Style

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: style == .plus ? Theme.R.base : 0, style: .continuous)
                    .fill(configuration.isPressed
                          ? (style == .plus ? Theme.C.containerLow : Theme.C.container)
                          : Color.clear)
            )
            .scaleEffect(configuration.isPressed && style == .plus ? Theme.Motion.pressScaleWide : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}
