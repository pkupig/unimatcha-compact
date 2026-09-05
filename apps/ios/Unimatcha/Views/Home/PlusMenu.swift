import SwiftUI

// MARK: - PlusMenu (h5-match.md §1.11, h5-core.md §1.7, h5-design-system.md §8.13) — WP-06
//
// Popover overlay id `plus-menu`, anchored flush under the home top bar at x = 12 (H5
// `.cpm-card { top: 56 + sat; left: 12 }`), scrim `rgba(0,0,0,.12)`. Rows (in order):
//   search      "Search & discover"     → AppActions.openFriendHub(.search)
//   qr_code_2   "Add by QR"             → AppActions.openFriendHub(.qr)
//   hub         "Relationship Network"  → AppActions.openFriendHub(.graph)
//   dark_mode   "Dark mode"             → AppActions.toggleDarkMode
//   translate   "Language"              → AppActions.openLanguageDialog
// `ActionMenu(.plus)` dismisses the overlay first, then runs the action (H5 order).

enum PlusMenu {
    static let overlayId = "plus-menu"

    @MainActor static var isOpen: Bool { OverlayRouter.shared.isPresented(overlayId) }

    /// Second tap on the `add` button closes the menu (H5 `toggleChatPlusMenu`).
    @MainActor static func toggle(safeTop: CGFloat) {
        if isOpen {
            OverlayRouter.shared.dismiss(id: overlayId)
        } else {
            present(safeTop: safeTop)
        }
    }

    @MainActor static func present(safeTop: CGFloat) {
        let anchor = CGRect(x: 12, y: 0, width: 0, height: Theme.Bar.home + safeTop)
        OverlayRouter.shared.present(AppOverlay(
            id: overlayId,
            style: .popover(anchor: anchor, alignment: .leading(gap: 0, dim: true)),
            swipeBack: false,
            onDismiss: nil
        ) {
            PlusMenuView()
        })
    }

    @MainActor static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }
}

struct PlusMenuView: View {
    var body: some View {
        ActionMenu(rows: [
            ActionMenu.Row(id: "search", sf: Theme.Icon.sf("search"), label: L10n.t("Search & discover")) {
                AppActions.shared.openFriendHub(.search)
            },
            ActionMenu.Row(id: "qr", sf: Theme.Icon.sf("qr_code_2"), label: L10n.t("Add by QR")) {
                AppActions.shared.openFriendHub(.qr)
            },
            ActionMenu.Row(id: "graph", sf: Theme.Icon.sf("hub"), label: L10n.t("Relationship Network")) {
                AppActions.shared.openFriendHub(.graph)
            },
            ActionMenu.Row(id: "dark", sf: Theme.Icon.sf("dark_mode"), label: L10n.t("Dark mode")) {
                AppActions.shared.toggleDarkMode()
            },
            ActionMenu.Row(id: "lang", sf: Theme.Icon.sf("translate"), label: L10n.t("Language")) {
                AppActions.shared.openLanguageDialog()
            },
        ], style: .plus)
    }
}
