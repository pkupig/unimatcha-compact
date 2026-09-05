import SwiftUI

// MARK: - UnimatchaApp (WP-16)
//
// `@main`. Installs the integration glue (`AppRouter`: AppActions closures, session ↔ realtime
// hooks, `.sessionDidReset` / `.sessionDidStart` observers, the D18 language hook and the
// `-unimatcha-decode-check` harness) and kicks off the boot check of PLAN §A.4, which runs in
// parallel with the 3 s splash.

@main
struct UnimatchaApp: App {
    @StateObject private var session = SessionStore.shared
    @StateObject private var locale = LocaleStore.shared
    @StateObject private var theme = ThemeStore.shared
    @StateObject private var overlays = OverlayRouter.shared
    @StateObject private var dialogs = DialogCenter.shared
    @StateObject private var toasts = ToastCenter.shared
    @StateObject private var actions = AppActions.shared
    @StateObject private var realtime = RealtimeClient.shared

    @Environment(\.scenePhase) private var scenePhase

    init() {
        AppRouter.shared.install()
        // `GET /users/me` starts immediately; the splash still shows for its 3 s minimum.
        SessionStore.shared.boot()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(locale)
                .environmentObject(theme)
                .environmentObject(overlays)
                .environmentObject(dialogs)
                .environmentObject(toasts)
                .environmentObject(actions)
                .environmentObject(realtime)
                .onChange(of: scenePhase) { phase in
                    AppRouter.shared.handleScenePhase(phase)
                }
        }
    }
}
