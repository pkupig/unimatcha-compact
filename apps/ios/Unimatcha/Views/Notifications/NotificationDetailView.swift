import SwiftUI

// MARK: - Notification detail overlay (h5-notifications.md §C; overlay id `notif-detail`)
//
// Stacks above the list (which stays open and keeps polling). Same chrome (`FullPageBar`,
// title "Notification"), body px 24 / pt 32 / pb 64, `article.space-y-10`:
//   meta row (48 pt plate r14 + 10 pt relative time, gap 24) → title 30/700 tighter → body 18.
// Read-only: no deep link, no delete, no share (opening it is what marks the item read).

struct NotificationDetailView: View {
    static let overlayId = "notif-detail"

    let item: AppNotification

    init(item: AppNotification) {
        self.item = item
    }

    @MainActor
    static func present(_ item: AppNotification) {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .fullPage, swipeBack: true) {
            NotificationDetailView(item: item)
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(L10n.t("Notification"), onBack: { NotificationDetailView.dismiss() })
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 40) {
                    HStack(alignment: .center, spacing: 24) {
                        NotificationIconPlate(type: item.type, size: 48, radius: Theme.R.notifDetailPlate, iconSize: 24)
                        Text(Formatters.relativeTime(item.createdAt))
                            .font(Theme.font(10))
                            .tracking(Theme.tracking(Theme.Tracking.tighter, size: 10))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .lineLimit(1)
                    }
                    Text(NotificationL10n.title(item))
                        .font(Theme.font(30, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.tighter, size: 30))
                        .lineSpacing(0)
                        .foregroundColor(Theme.C.onSurface)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(NotificationL10n.body(item))
                        .font(Theme.font(18))
                        .lineSpacing(18 * 0.625)
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
                .padding(.horizontal, Theme.Space.page)
                .padding(.top, 32)
                .padding(.bottom, 64)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Theme.C.surface.ignoresSafeArea())
    }
}
