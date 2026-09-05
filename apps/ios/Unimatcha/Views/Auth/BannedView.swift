import SwiftUI

// MARK: - BannedView (`#page-banned`, h5-core §1.2, h5-auth §1.3 / §2.3)
//
// Same shell as the auth page (centered main px-6 py-12, container 420): 80 pt circle with a
// 2 pt `outline` border + `block` icon 36 → "Account Suspended" 24/800 tighter → body 14
// relaxed max-w 320 → full-width pink-outline "Log Out" (2 pt border, py-5, 10/700 +0.3em) →
// footer with only the © line. Log Out = `AppActions.requestLogout` (confirm card + logout).

struct BannedView: View {
    var body: some View {
        ZStack {
            Theme.C.surface.ignoresSafeArea()
            VStack(spacing: 0) {
                GeometryReader { geo in
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 32) {
                            ZStack {
                                Circle()
                                    .stroke(Theme.C.outline, lineWidth: 2)
                                MaterialIcon(name: "block", size: 36, color: Theme.C.onSurfaceVariant)
                            }
                            .frame(width: 80, height: 80)

                            VStack(spacing: 12) {
                                Text(L10n.t("Account Suspended"))
                                    .font(Theme.font(24, weight: .heavy))
                                    .tracking(Theme.tracking(Theme.Tracking.tighter, size: 24))
                                    .foregroundColor(Theme.C.primary)
                                    .multilineTextAlignment(.center)
                                Text(L10n.t("Your account has been disabled for violating the community guidelines. If you believe this is a mistake, please contact support."))
                                    .font(Theme.font(14))
                                    .lineSpacing(14 * 0.625)
                                    .foregroundColor(Theme.C.onSurfaceVariant)
                                    .multilineTextAlignment(.center)
                                    .frame(maxWidth: 320)
                            }

                            CTAButton(title: L10n.t("Log Out"),
                                      style: .pinkOutline,
                                      size: 10,
                                      tracking: Theme.Tracking.hero,
                                      paddingV: 20,
                                      paddingH: 24,
                                      borderWidth: 2,
                                      action: { AppActions.shared.requestLogout() })
                        }
                        .frame(maxWidth: 420)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, Theme.Space.page)
                        .padding(.vertical, 48)
                        .frame(minHeight: geo.size.height)
                    }
                }
                AuthFooter(showLinks: false)
            }
        }
    }
}
