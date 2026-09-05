import SwiftUI
import UIKit

// MARK: - Profile tab (`#tab-profile`, h5-profile.md §1.2, §2 "Profile tab"; design §7.2)
//
// Two layers, exactly like H5:
//   layer 0  `ProfileHeroCover` — fixed behind the scroller, `400 + inset (+ pull)` tall, blur mask
//   layer 1  the scroller: spacer `88 + inset` → hero text (px-6, mb-86) → white panel
//            (`rounded-t-[24px]`, overlapping the hero text margin by 24, px-6 pt-7 pb-32,
//            max-w-lg) with the five rows + version footer.
// Pull-to-refresh (shared component) translates the scroller; `onPull` grows the cover 1:1 and
// fades the blur (0 → 140 pt). Refresh = re-render + `GET /energy/balance` only.
// `.reportScrollOffset(id: "profile")` feeds WP-16's BottomNav auto-hide. No top bar, no logout row,
// no photo strip.

struct ProfileTabView: View {
    static let scrollId = "profile"

    @ObservedObject private var vm = ProfileTabViewModel.shared
    @ObservedObject private var session = SessionStore.shared
    @ObservedObject private var energy = EnergyStore.shared

    init() {}

    var body: some View {
        GeometryReader { geo in
            let window = OverlayChrome.windowSafeInsets
            let top = geo.safeAreaInsets.top > 0 ? geo.safeAreaInsets.top : window.top
            // When the host already ignores the bottom inset the scroll view gets no automatic
            // bottom inset, so the panel pads it itself.
            let extraBottom = geo.safeAreaInsets.bottom > 0 ? 0 : window.bottom
            ZStack(alignment: .top) {
                Theme.C.surface
                ProfileHeroCover(coverUrl: session.currentUser?.profile?.coverUrl,
                                 height: vm.heroHeight(topInset: top),
                                 blurOpacity: vm.blurOpacity)
                    .frame(maxWidth: .infinity, alignment: .top)
                    .allowsHitTesting(false)
                ScrollView(.vertical, showsIndicators: false) {
                    content(top: top, extraBottom: extraBottom)
                }
                .pullToRefresh(enabled: { true },
                               topInset: top,
                               onPull: { vm.handlePull($0) },
                               action: { await vm.refresh() })
                .reportScrollOffset(id: Self.scrollId)
            }
            .frame(width: geo.size.width, height: geo.size.height + geo.safeAreaInsets.top, alignment: .top)
            .ignoresSafeArea(edges: .top)
        }
        .background(Theme.C.surface)
        .onAppear {
            Task { await vm.onTabEnter() }
        }
    }

    // MARK: Scroller content

    private func content(top: CGFloat, extraBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            Color.clear
                .frame(height: ProfileTabViewModel.topSpacer + top)
            ProfileHeroText(user: session.currentUser, onVerifyTap: { onVerifyTap() })
                .padding(.horizontal, Theme.Space.page)
            // `mb-[86px]` on the hero text minus the panel's `-mt-6` pull-up.
            Color.clear
                .frame(height: ProfileTabViewModel.heroTextBottomMargin - ProfileTabViewModel.panelOverlap)
            panel(extraBottom: extraBottom)
        }
        .frame(maxWidth: .infinity)
    }

    /// `bg-background rounded-t-[24px] px-6 pt-7 pb-32 max-w-lg mx-auto`.
    private func panel(extraBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            HairlineRow(material: "flash_on",
                        filled: true,
                        label: L10n.t("Energy"),
                        action: { AppActions.shared.openEnergyPurchase() }) {
                EnergyCellsView(cells: energy.cells)
            }
            HairlineRow(material: "confirmation_number",
                        label: L10n.t("My Tickets"),
                        action: { AppActions.shared.openTickets() })
            HairlineRow(material: "person_outline",
                        label: L10n.t("Edit Profile"),
                        action: { AppActions.shared.openEditProfile() })
            HairlineRow(material: "mail_outline",
                        label: L10n.t("Contact Us"),
                        action: { AppActions.shared.openContactUs() })
            HairlineRow(material: "settings",
                        label: L10n.t("Settings"),
                        action: { AppActions.shared.openSettings() })
            Text(ProfileTabCopy.versionLine)
                .font(Theme.font(10, weight: .medium))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
        }
        .padding(.horizontal, Theme.Space.page)
        .padding(.top, ProfileTabViewModel.panelTopPadding)
        .padding(.bottom, ProfileTabViewModel.panelBottomPadding + extraBottom)
        .frame(maxWidth: ProfileTabViewModel.panelMaxWidth)
        .background(
            Theme.C.surface
                .clipShape(TopRoundedRectangle(radius: Theme.R.profileSheet))
        )
        .frame(maxWidth: .infinity)
    }

    // MARK: Actions

    /// `#verify-btn` → `openVerify()` (guarded again there: only when not pending / verified).
    private func onVerifyTap() {
        let state = VerifyBadgeState.from(status: session.currentUser?.verificationStatus)
        guard state.isTappable else { return }
        AppActions.shared.openVerify()
    }
}

// MARK: - Top-rounded rectangle (`rounded-t-[24px]`)

struct TopRoundedRectangle: Shape {
    var radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let p = UIBezierPath(roundedRect: rect,
                             byRoundingCorners: [.topLeft, .topRight],
                             cornerRadii: CGSize(width: radius, height: radius))
        return Path(p.cgPath)
    }
}
