import SwiftUI

/// Root authenticated shell. Owns the shared ViewModels and defines the 5-tab navigation.
/// Tabs: Match (dual-mode) · Chat (sessions) · Square (v2) · Alerts (notifications) · Me (profile).
struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var matchingVM = MatchingViewModel()
    @StateObject private var sessionsVM = ChatSessionsViewModel()
    @StateObject private var squareVM = SquareViewModel()
    @StateObject private var notifVM = NotificationViewModel()
    @StateObject private var profileVM = ProfileViewModel()

    var body: some View {
        TabView {
            MatchTabView()
                .environmentObject(matchingVM).environmentObject(authVM)
                .tabItem { Label("匹配", systemImage: "sparkles") }

            ChatSessionsView()
                .environmentObject(sessionsVM).environmentObject(authVM)
                .tabItem { Label("聊天", systemImage: "bubble.left.and.bubble.right.fill") }

            SquareTabView()
                .environmentObject(squareVM).environmentObject(authVM)
                .tabItem { Label("广场", systemImage: "square.grid.2x2.fill") }

            NotificationsView()
                .environmentObject(notifVM)
                .tabItem { Label("消息", systemImage: "bell.fill") }
                .badge(notifVM.unread)

            ProfileTabView()
                .environmentObject(authVM).environmentObject(profileVM)
                .tabItem { Label("我的", systemImage: "person.crop.circle.fill") }
        }
        .tint(Theme.accent)
        .task { await notifVM.refreshUnread() }
        .onAppear {
            let appearance = UITabBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(Theme.surfaceLo)
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
    }
}
