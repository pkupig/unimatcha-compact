import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var matchingVM = MatchingViewModel()
    @StateObject private var leaderboardVM = LeaderboardViewModel()
    @StateObject private var profileVM = ProfileViewModel()

    var body: some View {
        TabView {
            MatchTabView()
                .environmentObject(matchingVM)
                .tabItem {
                    Label("匹配", systemImage: "heart.circle.fill")
                }

            LeaderboardTabView()
                .environmentObject(leaderboardVM)
                .tabItem {
                    Label("排行榜", systemImage: "trophy.fill")
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
