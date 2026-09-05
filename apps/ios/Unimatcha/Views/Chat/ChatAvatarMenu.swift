import SwiftUI

// MARK: - ChatAvatarMenu (h5-chat.md §1.4, §2.12; PLAN §A.2.6 id `chat-avatar-menu`) — WP-07
//
// Small popover anchored under the tapped **partner** avatar (never the own one, never the header
// avatar — that opens the public profile). Rows, gated by the session type:
//   confirmed only  `waving_hand` Nudge            → POST /chat/:id/nudge, then reload the history
//   always          `edit_note`   Set note         → prompt card → PUT /users/me/notes
//   confirmed only  `wallpaper`   Chat background  → pick → upload → PUT /chat/:id/background
// (The server rejects nudge/background on temp sessions with a 403, so the rows are hidden there.)

enum ChatAvatarMenu {
    static let overlayId = "chat-avatar-menu"

    @MainActor
    static func present(vm: ChatViewModel, anchor: CGRect) {
        let confirmed = vm.context.isConfirmedSession
        var rows: [ActionMenu.Row] = []
        if confirmed {
            rows.append(ActionMenu.Row(id: "nudge", sf: Theme.Icon.sf("waving_hand"), label: L10n.t("Nudge")) {
                vm.nudge()
            })
        }
        rows.append(ActionMenu.Row(id: "note", sf: Theme.Icon.sf("edit_note"), label: L10n.t("Set note")) {
            vm.promptSetNote()
        })
        if confirmed {
            rows.append(ActionMenu.Row(id: "background", sf: Theme.Icon.sf("wallpaper"), label: L10n.t("Chat background")) {
                vm.requestWallpaperPicker()
            })
        }
        OverlayRouter.shared.present(AppOverlay(
            id: overlayId,
            style: .popover(anchor: anchor, alignment: .leading(gap: 8))
        ) {
            ActionMenu(rows: rows, style: .compact)
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }
}
