import SwiftUI

// MARK: - AppActions (PLAN §A.2.4 / §B.5 — WP-03a declares, WP-16 `AppRouter` fills)
//
// Cross-domain navigation bag. Domain packages never import each other's views: they call
// `AppActions.shared.openChat(matchId)` etc. Every closure has a no-op default so each
// package compiles and runs standalone; `App/AppRouter.swift` (WP-16) assigns the real
// implementations (presenting the overlay ids of PLAN §A.2.6, switching tabs, …).

@MainActor
final class AppActions: ObservableObject {
    static let shared = AppActions()

    init() {}

    // Tab / home shell
    var switchTab: (AppTab) -> Void = { _ in }
    var switchHomeView: (HomeView) -> Void = { _ in }
    var reloadMatchTab: () -> Void = {}
    var loadSessions: () -> Void = {}

    /// Reads `ChatSessionsStore.sessions[*].partner.note` for the partner-profile note pill
    /// (WP-17 must not import WP-07).
    var noteForUser: (_ userId: String) -> String? = { _ in nil }

    // Chat / match
    /// `openConnectionChat`: switch home view to chat → load sessions → open the session.
    var openChat: (_ matchId: String) -> Void = { _ in }
    var openPartnerProfile: (_ userId: String, _ matchId: String?) -> Void = { _, _ in }
    var openQuestionnaire: (MatchMode) -> Void = { _ in }
    var showQuestionnaireCards: () -> Void = {}
    var openPreferencesSheet: (MatchMode) -> Void = { _ in }
    var openEnergyPurchase: () -> Void = {}
    var openNotifications: () -> Void = {}
    var openFriendHub: (FriendHubPanel) -> Void = { _ in }

    // Square
    var openPostDetail: (_ postId: String, _ focusComposer: Bool) -> Void = { _, _ in }
    var openNewPost: (_ board: SquareBoardKind) -> Void = { _ in }
    var openSquareSearch: () -> Void = {}

    // Profile / settings / content
    var openSettings: () -> Void = {}
    var openEditProfile: () -> Void = {}
    var openVerify: () -> Void = {}
    var openTickets: () -> Void = {}
    var openContentPage: (ContentPageKey) -> Void = { _ in }
    var openContactUs: () -> Void = {}
    var openReportProblem: () -> Void = {}
    var openLanguageDialog: () -> Void = {}
    var toggleDarkMode: () -> Void = {}

    // Media / ads
    var openImageViewer: (_ url: String) -> Void = { _ in }
    var openAdDetail: (AdFeedItem) -> Void = { _ in }

    // Session-wide refreshes
    var refreshEnergy: () -> Void = {}
    var refreshUnreadBadge: () -> Void = {}

    /// Confirm card + `SessionStore.logout()`.
    var requestLogout: () -> Void = {}
}
