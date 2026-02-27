import SwiftUI

struct ProfileTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var profileVM: ProfileViewModel
    @EnvironmentObject var matchingVM: MatchingViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Avatar + Name
                    VStack(spacing: 12) {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 1, green: 0.85, blue: 0.9), Color(red: 1, green: 0.94, blue: 0.96)],
                                    startPoint: .top, endPoint: .bottom
                                )
                            )
                            .frame(width: 80, height: 80)
                            .overlay(
                                Text(String(profileVM.nickname.prefix(1)))
                                    .font(.system(size: 34, weight: .medium))
                                    .foregroundColor(Color(red: 1, green: 0.35, blue: 0.45))
                            )

                        Text(profileVM.nickname.isEmpty ? "未设置昵称" : profileVM.nickname)
                            .font(.system(size: 20, weight: .bold))

                        HStack(spacing: 16) {
                            if !profileVM.school.isEmpty {
                                Label(profileVM.school, systemImage: "graduationcap")
                                    .font(.caption).foregroundColor(.secondary)
                            }
                            Label(profileVM.grade, systemImage: "book")
                                .font(.caption).foregroundColor(.secondary)
                            Label(profileVM.city.isEmpty ? "未设置" : profileVM.city, systemImage: "location")
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                    .padding(.top, 16)

                    // Edit profile button
                    NavigationLink(destination: ProfileEditView().environmentObject(profileVM)) {
                        HStack {
                            Image(systemName: "pencil")
                            Text("编辑资料")
                        }
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Color(red: 1, green: 0.94, blue: 0.96))
                        .cornerRadius(22)
                    }
                    .padding(.horizontal, 20)

                    // Relationship mode entry
                    if matchingVM.isInRelationship {
                        NavigationLink(destination: RelationshipModeView()) {
                            HStack(spacing: 10) {
                                Text("💕")
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("恋爱模式")
                                        .font(.system(size: 16, weight: .semibold))
                                    Text("管理你的恋爱生活")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                            }
                            .padding(16)
                            .background(Color.white)
                            .cornerRadius(14)
                        }
                        .padding(.horizontal, 20)
                    }

                    // Social links display
                    socialLinksCard

                    // Settings
                    settingsSection

                    // Logout
                    Button(action: { authVM.logout() }) {
                        Text("退出登录")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Color.white)
                            .cornerRadius(14)
                    }
                    .padding(.horizontal, 20)

                    Spacer().frame(height: 30)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("我的")
            .task { await profileVM.loadProfile() }
        }
    }

    // MARK: - Social Links Card
    private var socialLinksCard: some View {
        let links: [(String, String, String)] = [
            ("微信", "message.fill", profileVM.wechat),
            ("QQ", "bubble.left.fill", profileVM.qq),
            ("小红书", "book.fill", profileVM.xiaohongshu),
            ("微博", "globe", profileVM.weibo),
            ("Instagram", "camera.fill", profileVM.instagram),
        ]
        let nonEmpty = links.filter { !$0.2.isEmpty }

        return Group {
            if !nonEmpty.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("社交账号")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 20)

                    VStack(spacing: 0) {
                        ForEach(Array(nonEmpty.enumerated()), id: \.offset) { index, item in
                            HStack(spacing: 12) {
                                Image(systemName: item.1)
                                    .frame(width: 24)
                                    .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                                Text(item.0)
                                    .foregroundColor(.secondary)
                                    .frame(width: 60, alignment: .leading)
                                Text(item.2)
                                    .foregroundColor(.primary)
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)

                            if index < nonEmpty.count - 1 {
                                Divider().padding(.leading, 52)
                            }
                        }
                    }
                    .background(Color.white)
                    .cornerRadius(14)
                    .padding(.horizontal, 20)
                }
            }
        }
    }

    // MARK: - Settings
    private var settingsSection: some View {
        VStack(spacing: 0) {
            NavigationLink(destination: SettingsView()) {
                settingsRow(icon: "gearshape", title: "设置")
            }
        }
        .background(Color.white)
        .cornerRadius(14)
        .padding(.horizontal, 20)
    }

    private func settingsRow(icon: String, title: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
            Text(title)
                .foregroundColor(.primary)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(Color(.systemGray3))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}
