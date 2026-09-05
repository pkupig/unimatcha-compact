import SwiftUI

// MARK: - HomeTopBar (h5-core.md §1.4, h5-design-system.md §7.2 / §8.6) — WP-06
//
// 56 + safe-top glass bar, no border/shadow, px 8, gap 4:
//   [40 pt round `add` button] [Chat · Romantic · Friend pill, max-w 268, centred] [40 pt `notifications_none` + badge]
// The `add` button opens the plus-menu popover on every view; the bell opens Notifications.

struct HomeTopBar: View {
    @ObservedObject var store: MatchStore
    var badgeCount: Int
    var safeTop: CGFloat
    var onPlus: () -> Void
    var onSelectView: (HomeView) -> Void

    private var selection: Binding<Int> {
        Binding(
            get: { HomeView.allCases.firstIndex(of: store.homeView) ?? 0 },
            set: { i in
                let v = HomeView.allCases[min(max(i, 0), HomeView.allCases.count - 1)]
                if v != store.homeView { onSelectView(v) }
            })
    }

    var body: some View {
        HStack(spacing: 4) {
            IconButton(material: "add", size: 40, iconSize: 22, tint: Theme.C.onSurface,
                       accessibilityLabel: L10n.t("Add"), action: onPlus)

            PillSegmented(items: [L10n.t("Chat"), L10n.t("Romantic"), L10n.t("Friend")],
                          selection: selection,
                          style: .home)
                .frame(maxWidth: .infinity)

            ZStack(alignment: .topTrailing) {
                IconButton(material: "notifications_none", size: 40, iconSize: 22, tint: Theme.C.onSurface,
                           accessibilityLabel: L10n.t("Notifications")) {
                    AppActions.shared.openNotifications()
                }
                if badgeCount > 0 {
                    Text(badgeCount > 99 ? "99+" : "\(badgeCount)")
                        .font(Theme.font(10, weight: .bold))
                        .foregroundColor(.black)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .frame(height: 16)
                        .background(Theme.C.neon)
                        .clipShape(Capsule())
                        .padding(.top, 2)
                        .padding(.trailing, 2)
                        .allowsHitTesting(false)
                }
            }
        }
        .padding(.horizontal, 8)
        .frame(height: Theme.Bar.home)
        .padding(.top, safeTop)
        .frame(maxWidth: .infinity)
        .background(
            Theme.C.glassBar
                .background(.ultraThinMaterial)
                .ignoresSafeArea(edges: .top)
        )
    }
}
