import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var matchingVM = MatchingViewModel()
    @StateObject private var leaderboardVM = LeaderboardViewModel()
    @StateObject private var profileVM = ProfileViewModel()
    @StateObject private var squareVM = SquareViewModel()

    var body: some View {
        TabView {
            MatchTabView()
                .environmentObject(matchingVM)
                .environmentObject(authVM)
                .tabItem {
                    Label("匹配", systemImage: "sparkles")
                }

            SquareTabView()
                .environmentObject(squareVM)
                .environmentObject(leaderboardVM)
                .tabItem {
                    Label("广场", systemImage: "bubble.left.and.bubble.right.fill")
                }

            ProfileTabView()
                .environmentObject(authVM)
                .environmentObject(profileVM)
                .environmentObject(matchingVM)
                .tabItem {
                    Label("我的", systemImage: "person.crop.circle.fill")
                }
        }
        .tint(Color(red: 1, green: 0.4, blue: 0.5))
    }
}
