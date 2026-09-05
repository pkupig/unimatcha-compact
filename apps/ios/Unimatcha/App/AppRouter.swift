import Combine
import Foundation
import SwiftUI
import UIKit

// MARK: - ShellState (WP-16)
//
// The tab shell's own state, held outside `MainTabView` so that
//   • `AppActions.switchTab` can drive it from anywhere, and
//   • the D18 language remount (`RootView.id(locale.lang)`) does not throw the user back to Match.
//
// H5 keeps every `[id^="tab-"]` panel in the DOM and just toggles `display`; the panels are only
// *populated* when the tab is first entered. iOS mirrors that: a panel is mounted on first visit
// and stays mounted (scroll offsets and per-page state survive), so the boot does not fire three
// tabs' worth of requests at once.

@MainActor
final class ShellState: ObservableObject {
    static let shared = ShellState()

    @Published var tab: AppTab = .match
    @Published private(set) var mounted: Set<AppTab> = [.match]

    init() {}

    func isMounted(_ tab: AppTab) -> Bool { mounted.contains(tab) }

    func mount(_ tab: AppTab) {
        guard !mounted.contains(tab) else { return }
        mounted.insert(tab)
    }

    /// `cleanupUserState`: H5 resets `S.activeTab = 'match'`. Dropping the mount set as well keeps
    /// a new account from seeing the previous account's rendered feed for one frame.
    func reset() {
        tab = .match
        mounted = [.match]
    }
}

// MARK: - AppRouter (WP-16)
//
// The integration glue: fills every `AppActions` closure with the overlay ids/styles of
// PLAN §A.2.6, implements `switchTab` (PLAN §C.12 / `h5-core.md §2.1`), owns the session /
// realtime / scene-phase wiring of PLAN §D, and runs the `-unimatcha-decode-check` harness.

@MainActor
final class AppRouter {
    static let shared = AppRouter()

    static let decodeCheckArgument = "-unimatcha-decode-check"

    private var cancellables = Set<AnyCancellable>()
    private var installed = false

    init() {}

    // MARK: Install

    func install() {
        guard !installed else { return }
        installed = true
        touchSingletons()
        wireSessionHooks()
        wireActions()
        wireObservers()
        runDecodeCheckIfRequested()
    }

    /// Every store subscribes to `.sessionDidReset` (and some to `RealtimeClient.events`) in its
    /// `init`, so the singletons must exist before the first event rather than at first render.
    private func touchSingletons() {
        _ = SessionStore.shared
        _ = LocaleStore.shared
        _ = ThemeStore.shared
        _ = OverlayRouter.shared
        _ = DialogCenter.shared
        _ = ToastCenter.shared
        _ = AppActions.shared
        _ = RealtimeClient.shared
        _ = EnergyStore.shared
        _ = MatchStore.shared
        _ = ChatSessionsStore.shared
        _ = SquareStore.shared
        _ = NotificationStore.shared
        _ = AdTracker.shared
        _ = QuestionnaireViewModel.shared
        _ = MetadataService.shared
        _ = ShellState.shared
    }

    // MARK: Session ↔ realtime hooks (PLAN §D.1)

    private func wireSessionHooks() {
        let session = SessionStore.shared
        // `cleanupUserState` runs this BEFORE posting `.sessionDidReset`, so the stream is always
        // closed before the stores tear down (WP-01/WP-15 contract).
        session.realtimeStopHook = { RealtimeClient.shared.stop() }
        session.realtimeStartHook = { token in RealtimeClient.shared.start(token: token) }
    }

    // MARK: AppActions (PLAN §B.5 — every closure, overlay ids per §A.2.6)

    private func wireActions() {
        let a = AppActions.shared

        // ── Tab / home shell ──────────────────────────────────────────────────────────────
        a.switchTab = { tab in AppRouter.shared.switchTab(tab) }
        a.switchHomeView = { view in
            Task { await MatchStore.shared.activate(view: view) }
        }
        a.reloadMatchTab = {
            Task { await MatchStore.shared.reload(mode: MatchStore.shared.activeMode) }
        }
        a.loadSessions = {
            Task { await ChatSessionsStore.shared.loadSessions() }
        }
        a.noteForUser = { userId in ChatSessionsStore.shared.note(forUserId: userId) }

        // ── Chat / match ──────────────────────────────────────────────────────────────────
        // H5 `openConnectionChat`: switchHomeView('chat') → await loadSessions() → openSessionById.
        a.openChat = { matchId in
            Task {
                await MatchStore.shared.activate(view: .chat)
                guard !matchId.isEmpty else { return }
                await ChatSessionsStore.shared.loadSessions()
                _ = await ChatSessionsStore.shared.openSession(matchId: matchId)
            }
        }
        // `PartnerProfileView.present` reports the `openedProfile` feedback event itself (WP-17).
        a.openPartnerProfile = { userId, matchId in
            PartnerProfileView.present(userId: userId, matchId: matchId)
        }
        a.openQuestionnaire = { mode in QuestionnaireViewModel.shared.open(mode: mode) }
        a.showQuestionnaireCards = { QuestionnaireViewModel.shared.presentCards() }
        a.openPreferencesSheet = { mode in PreferencesSheet.present(mode: mode) }
        a.openEnergyPurchase = { EnergyPurchaseViewModel.present() }
        a.openNotifications = { NotificationsView.present() }
        a.openFriendHub = { panel in FriendHubViewModel.present(panel: panel) }

        // ── Square ────────────────────────────────────────────────────────────────────────
        a.openPostDetail = { postId, focusComposer in
            PostDetailView.present(postId: postId, focusComposer: focusComposer)
        }
        a.openNewPost = { board in NewPostView.present(board: board) }
        a.openSquareSearch = { SquareSearchView.present() }

        // ── Profile / settings / content ──────────────────────────────────────────────────
        a.openSettings = { SettingsView.present() }
        a.openEditProfile = { EditProfileView.present() }
        a.openVerify = { VerifyCard.present() }
        a.openTickets = { TicketsViewModel.presentWallet() }
        a.openContentPage = { key in ContentPageView.present(key) }
        a.openContactUs = { ContactUsCard.present() }
        a.openReportProblem = { ReportProblemCard.present() }
        a.openLanguageDialog = { LanguageDialog.present() }
        a.toggleDarkMode = { SettingsViewModel.toggleDarkMode() }

        // ── Media / ads ───────────────────────────────────────────────────────────────────
        a.openImageViewer = { url in AppRouter.shared.presentImageViewer(url) }
        a.openAdDetail = { ad in AdDetailView.present(ad) }

        // ── Session-wide refreshes ────────────────────────────────────────────────────────
        a.refreshEnergy = { Task { await EnergyStore.shared.refresh() } }
        a.refreshUnreadBadge = { Task { await NotificationStore.shared.refreshBadge() } }
        a.requestLogout = { AppRouter.shared.requestLogout() }
    }

    // MARK: Observers (PLAN §A.3, §D.1, D18)

    private func wireObservers() {
        // Logout / 401: WP-01 must not import WP-03a or WP-18, so the shell performs the
        // overlay + dialog + ad teardown (PLAN §A.3).
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .receive(on: DispatchQueue.main)
            .sink { _ in
                OverlayRouter.shared.dismissAll()
                DialogCenter.shared.dismissAll()
                // A toast lives in RootView above the route switch, so without this it stays on
                // screen across the transition to the auth page still showing the previous
                // account's text ("Entered pool · Enhanced (3 cells)", a server error string).
                ToastCenter.shared.hide()
                AdTracker.shared.reset()
                ShellState.shared.reset()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .sessionDidStart)
            .receive(on: DispatchQueue.main)
            .sink { _ in
                Task { await NotificationStore.shared.refreshBadge() }
            }
            .store(in: &cancellables)

        // Refund banner hop (PLAN §C.10 / D7): the newest unseen `energy_refunded` notification
        // becomes the chat-list banner, and the balance is re-read (PLAN §E).
        NotificationStore.shared.$pendingRefund
            .compactMap { $0 }
            .receive(on: DispatchQueue.main)
            .sink { notification in
                let info = RefundBannerInfo(id: notification.id,
                                            reason: notification.refundReason,
                                            energy: notification.refundEnergy)
                ChatSessionsStore.shared.showRefundBanner(info)
                NotificationStore.shared.clearPendingRefund()
                Task { await EnergyStore.shared.refresh() }
            }
            .store(in: &cancellables)

        // D18 language switch: H5 reloads the page. iOS drops every overlay/dialog and remounts
        // the tree via `RootView.id(locale.lang)`; the stores keep their data.
        LocaleStore.shared.$lang
            .dropFirst()
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { _ in
                OverlayRouter.shared.dismissAll()
                DialogCenter.shared.dismissAll()
            }
            .store(in: &cancellables)
    }

    // MARK: Tab switching (PLAN §C.12 / `h5-core.md §2.1`)

    func switchTab(_ tab: AppTab) {
        let shell = ShellState.shared
        let reTap = shell.tab == tab
        let alreadyMounted = shell.isMounted(tab)

        // 1. H5 stops every background poller first; each tab restarts its own on load.
        MatchStore.shared.deactivate()
        ChatSessionsStore.shared.onPaneLeave()
        if NotificationStore.shared.isOpen { NotificationStore.shared.close() }

        // 2. Show the panel.
        shell.mount(tab)
        if shell.tab != tab { shell.tab = tab }

        // 3. Load. A panel that is being mounted for the first time triggers its own entry work
        //    in `onAppear` (Square, Profile); calling it here as well would double-fetch.
        switch tab {
        case .match:
            // Step 1 stopped the chat pane's 1 s ticker. `ChatListPane` only restarts it from
            // `onAppear` (fires once — panels stay mounted) or an actual `homeView` change, and
            // `activate` re-assigns the same value, so without this the temp-session countdown
            // badges freeze after any Match → other tab → Match round trip.
            if MatchStore.shared.homeView == .chat { ChatSessionsStore.shared.onPaneEnter() }
            Task { await MatchStore.shared.activate(view: MatchStore.shared.homeView) }
        case .square:
            if reTap {
                SquareStore.shared.scrollToTopSignal &+= 1
                Task { await SquareStore.shared.reloadCurrent() }
            } else if alreadyMounted {
                Task { await SquareStore.shared.onTabEnter() }
            }
        case .profile:
            if alreadyMounted {
                Task { await ProfileTabViewModel.shared.onTabEnter() }
            }
        }
    }

    /// `checkUserState` → `showPage('page-home'); switchTab('match')`.
    func enterHome() {
        switchTab(.match)
    }

    // MARK: Overlays owned by the shell

    /// H5 `#chat-image-viewer` (overlay id `image-viewer`, lightbox, no swipe-back).
    func presentImageViewer(_ url: String) {
        OverlayRouter.shared.present(AppOverlay(id: "image-viewer", style: .lightbox, swipeBack: false) {
            ImageViewerView(url: url, onClose: { OverlayRouter.shared.dismiss(id: "image-viewer") })
        })
    }

    /// H5 `doLogout`: danger confirm card, then the full teardown.
    func requestLogout() {
        Task {
            let ok = await DialogCenter.shared.confirm(
                title: L10n.t("Log out of Unimatcha?"),
                body: nil,
                confirmLabel: L10n.t("Log Out"),
                cancelLabel: L10n.t("Cancel"),
                danger: true)
            guard ok == true else { return }
            SessionStore.shared.logout()
        }
    }

    // MARK: Scene phase (PLAN §D.1)

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .background:
            RealtimeClient.shared.stop()
            Task { await AdTracker.shared.flush() }
        case .inactive:
            Task { await AdTracker.shared.flush() }
        case .active:
            guard let token = SessionStore.shared.token, !token.isEmpty else { return }
            RealtimeClient.shared.start(token: token)
            Task { await NotificationStore.shared.refreshBadge() }
            ChatViewModel.current?.pollNow()
        @unknown default:
            break
        }
    }

    // MARK: `-unimatcha-decode-check` (PLAN §H.4)

    private func runDecodeCheckIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains(AppRouter.decodeCheckArgument) else { return }
        AppRouter.runDecodeCheck()
    }

    /// Runs every `<Domain>Fixtures.verify()` plus the foundation self-checks and prints a report.
    /// Debug-only: the harnesses live behind `#if DEBUG`.
    static func runDecodeCheck() {
        #if DEBUG
        func line(_ s: String) {
            print(s)
            fflush(stdout)
        }

        line("═══ unimatcha decode-check ═══")
        var failures = 0
        var checks = 0

        // Throwing fixture harnesses (one per domain package).
        let throwing: [(String, () throws -> Void)] = [
            ("CoreFixtures", CoreFixtures.verify),
            ("AuthFixtures", AuthFixtures.verify),
            ("QuestionnaireFixtures", QuestionnaireFixtures.verify),
            ("MatchFixtures", MatchFixtures.verify),
            ("ChatFixtures", ChatFixtures.verify),
            ("SquareFixtures", SquareFixtures.verify),
            ("PostDetailFixtures", PostDetailFixtures.verify),
            ("EventsFixtures", EventsFixtures.verify),
            ("AdsFixtures", AdsFixtures.verify),
            ("ProfileFixtures", ProfileFixtures.verify),
            ("CoupleFixtures", CoupleFixtures.verify),
            ("NotificationFixtures", NotificationFixtures.verify),
            ("HubFixtures", HubFixtures.verify),
            ("ComponentsFixtures", ComponentsFixtures.verify),
            ("RealtimeSelfCheck", RealtimeSelfCheck.verify),
        ]
        for (name, run) in throwing {
            checks += 1
            do {
                try run()
                line("PASS  \(name)")
            } catch {
                failures += 1
                line("FAIL  \(name): \(error)")
            }
        }

        // Foundation self-checks that report a list of problems instead of throwing.
        let listing: [(String, () -> [String])] = [
            ("L10nSelfCheck", L10nSelfCheck.verify),
            ("Formatters", Formatters.verify),
            ("Alias", Alias.verify),
            ("ContentPages", ContentPages.verify),
            ("Theme.Icon", Theme.Icon.missingSymbols),
        ]
        for (name, run) in listing {
            checks += 1
            let problems = run()
            if problems.isEmpty {
                line("PASS  \(name)")
            } else {
                failures += 1
                line("FAIL  \(name): \(problems.count) problem(s)")
                for p in problems.prefix(20) { line("        · \(p)") }
            }
        }

        line("═══ decode-check \(failures == 0 ? "ALL PASS" : "\(failures) FAILED") (\(checks) suites) ═══")
        #else
        print("decode-check is Debug-only")
        fflush(stdout)
        #endif
    }
}
