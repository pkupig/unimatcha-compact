import SwiftUI

// MARK: - RootView (WP-16)
//
// H5's `.page` layer (PLAN §A.2.1): one opaque root screen at a time, chosen by
// `SessionStore.route` (the boot machine of PLAN §A.4), with the three global hosts stacked on
// top in H5's z-order — overlays (`.overlay`, z 50…100) < dialog cards (z 120) < toast (z 999).
// Content overlays therefore work on the logged-out auth route too (Terms / Privacy).
//
// `.id(locale.lang)` implements D18: H5 reloads the whole page on a language switch; iOS drops
// every overlay/dialog (AppRouter) and remounts the view tree, while the singleton stores keep
// their data. The tab and mount set live in `ShellState`, so the remount does not lose them.

struct RootView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var locale: LocaleStore
    @EnvironmentObject private var theme: ThemeStore

    var body: some View {
        ZStack {
            Theme.C.surface.ignoresSafeArea()

            route
                .transition(.opacity)

            OverlayHost()
            DialogHost()
            ToastHost()
        }
        .id(locale.lang)
        .animation(Theme.Motion.fade, value: session.route)
        .preferredColorScheme(theme.isDark ? .dark : .light)
        .environment(\.layoutDirection, .leftToRight)
        // H5 `checkUserState` ends with `showPage('page-home'); switchTab('match')`. Deliberately
        // NOT in `onAppear`: the D18 remount re-runs `onAppear` and would throw the user back to
        // the Match tab on every language switch.
        .onChange(of: session.route) { newRoute in
            if newRoute == .home { AppRouter.shared.enterHome() }
        }
    }

    @ViewBuilder
    private var route: some View {
        switch session.route {
        case .splash:
            SplashView()
        case .bootError:
            BootErrorView()
        case .auth:
            AuthView()
        case .banned:
            BannedView()
        case .profileSetup:
            ProfileSetupView()
        case .home:
            MainTabView()
        }
    }
}
