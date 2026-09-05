import SwiftUI

// MARK: - Notifications list overlay (h5-notifications.md §B, §2; overlay id `notifications`)
//
// Full-page overlay (fade, swipe-back) pushed from the home top-bar bell. Header = `FullPageBar`
// (64 + safe-top), scroll body px 24 / pt 24 / pb 64 with Today / Yesterday / Earlier sections
// (rolling 24 h), 28 pt between rows, 40 pt between sections, Load More pill, empty / error
// states and an iOS-only loading line (H5 shows a blank area — gotcha 12).

struct NotificationsView: View {
    static let overlayId = "notifications"

    @ObservedObject private var store = NotificationStore.shared

    init() {}

    /// Bell tap (`openNotifications()`): present the overlay and run the store's open sequence.
    /// WP-16 implements `AppActions.openNotifications` with this.
    @MainActor
    static func present() {
        OverlayRouter.shared.present(AppOverlay(
            id: overlayId,
            style: .fullPage,
            swipeBack: true,
            onDismiss: { NotificationStore.shared.close() }
        ) {
            NotificationsView()
        })
        Task { await NotificationStore.shared.open() }
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(L10n.t("Notifications"), onBack: { NotificationsView.dismiss() })
            ScrollView(.vertical, showsIndicators: false) {
                content
                    .padding(.horizontal, Theme.Space.page)
                    .padding(.top, 24)
                    .padding(.bottom, 64)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Theme.C.surface.ignoresSafeArea())
    }

    @ViewBuilder
    private var content: some View {
        if store.items.isEmpty {
            if store.loadFailed {
                // B2 — no retry (user closes / reopens), H5 parity.
                EmptyState(material: "cloud_off",
                           title: L10n.t("Failed to load"),
                           subtitle: L10n.t("Check your connection and try again"))
            } else if store.isLoading {
                LoadingLine(text: L10n.t("Loading..."), topPadding: 96, bottomPadding: 48)
            } else {
                // B1
                EmptyState(material: "notifications",
                           title: L10n.t("No notifications"),
                           subtitle: L10n.t("You're all caught up"))
            }
        } else {
            list
        }
    }

    private var list: some View {
        let groups = store.items.groupedByDay()
        return LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(groups) { group in
                VStack(alignment: .leading, spacing: 0) {
                    NotificationSectionLabel(text: group.day.label)
                    VStack(alignment: .leading, spacing: 28) {
                        ForEach(group.items) { item in
                            NotificationRow(item: item) { open(item) }
                        }
                    }
                }
                .padding(.bottom, 40)
            }
            if store.hasMore {
                NotificationLoadMoreButton(busy: store.isLoadingMore) {
                    Task { await store.loadMore() }
                }
            }
        }
    }

    /// Row tap: detail overlay above the list (which keeps polling) + optimistic mark-read.
    private func open(_ item: AppNotification) {
        NotificationDetailView.present(item)
        store.markRead(id: item.id)
    }
}
