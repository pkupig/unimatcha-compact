import SwiftUI

/// 「我的」标签页 —— 展示当前用户资料卡片，并提供进入编辑、匹配偏好、
/// 连接码、能量、设置等页面的入口。仅使用 authVM + profileVM 的真实成员。
struct ProfileTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var profileVM: ProfileViewModel

    private var verified: Bool { authVM.currentUser?.verificationStatus == "verified" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    headerCard
                    completenessCard
                    entriesCard
                    logoutButton
                    Text("Unimatcha v1.0.0")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textMuted)
                        .padding(.top, 4)
                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .themedScreen()
            .navigationTitle("我的")
            .toolbarColorScheme(.dark, for: .navigationBar)
            .task { await profileVM.loadProfile() }
            .refreshable {
                await profileVM.loadProfile()
                await authVM.refresh()
            }
        }
    }

    // MARK: - Header (cover + avatar + basic info)
    private var headerCard: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                // Cover
                Group {
                    if let url = URL(string: profileVM.coverUrl), !profileVM.coverUrl.isEmpty {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: Theme.accentGradient
                            }
                        }
                    } else {
                        Theme.accentGradient
                    }
                }
                .frame(height: 132)
                .frame(maxWidth: .infinity)
                .clipped()

                // Dark scrim so text stays readable over any cover
                LinearGradient(colors: [.clear, Theme.bg.opacity(0.85)],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 132)
            }

            HStack(alignment: .top, spacing: 14) {
                avatarView
                    .offset(y: -28)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 6) {
                        Text(displayNickname)
                            .font(.system(size: 19, weight: .bold))
                            .foregroundColor(Theme.textPrimary)
                        if verified {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 15))
                                .foregroundColor(Theme.accent)
                        }
                    }

                    if !profileVM.school.isEmpty {
                        Text("\(profileVM.school) · \(profileVM.grade)")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                    }

                    HStack(spacing: 6) {
                        if !profileVM.mbti.isEmpty { chip(profileVM.mbti) }
                        if !profileVM.zodiac.isEmpty { chip(profileVM.zodiac) }
                        if profileVM.age > 0 { chip("\(profileVM.age)岁") }
                    }
                    .padding(.top, 1)
                }
                .padding(.top, 6)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 14)
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
    }

    private var avatarView: some View {
        ZStack {
            Circle()
                .fill(Theme.surfaceHi)
                .frame(width: 72, height: 72)
            if let url = URL(string: profileVM.avatarUrl), !profileVM.avatarUrl.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: avatarPlaceholder
                    }
                }
                .frame(width: 72, height: 72)
                .clipShape(Circle())
            } else {
                avatarPlaceholder
            }
        }
        .overlay(Circle().stroke(verified ? Theme.accent : Theme.outline, lineWidth: 3))
    }

    private var avatarPlaceholder: some View {
        Text(String(displayNickname.prefix(1)))
            .font(.system(size: 28, weight: .semibold))
            .foregroundColor(Theme.accent)
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Theme.accent)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Theme.accent.opacity(0.12))
            .clipShape(Capsule())
    }

    private var displayNickname: String {
        profileVM.nickname.isEmpty ? "未设置昵称" : profileVM.nickname
    }

    // MARK: - Completeness bar
    private var completenessCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("资料完整度")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    Spacer()
                    Text("\(profileVM.completeness)%")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Theme.accent)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.surfaceHi)
                        Capsule()
                            .fill(Theme.accentGradient)
                            .frame(width: geo.size.width * CGFloat(min(max(profileVM.completeness, 0), 100)) / 100)
                    }
                }
                .frame(height: 8)

                if profileVM.completeness < 100 {
                    Text("完善资料能显著提升匹配质量")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textMuted)
                }
            }
        }
    }

    // MARK: - Navigation entries
    private var entriesCard: some View {
        VStack(spacing: 0) {
            NavigationLink {
                ProfileEditView().environmentObject(profileVM)
            } label: {
                entryRow(icon: "pencil", title: "编辑资料", subtitle: "昵称、学校、标签、社交方式")
            }
            divider
            NavigationLink {
                MatchFilterView(mode: .romantic)
            } label: {
                entryRow(icon: "line.3.horizontal.decrease.circle", title: "匹配偏好", subtitle: "设定同城 / 同校等条件")
            }
            divider
            NavigationLink {
                ConnectCodeView()
            } label: {
                entryRow(icon: "qrcode", title: "我的连接码", subtitle: "扫码或输入编号，直接建立好友")
            }
            divider
            NavigationLink {
                EnergyView()
            } label: {
                entryRow(icon: "bolt.fill", title: "能量中心", subtitle: "签到领取，解锁增强匹配")
            }
            divider
            NavigationLink {
                SettingsView().environmentObject(authVM)
            } label: {
                entryRow(icon: "gearshape", title: "设置", subtitle: "隐私、认证、账号安全")
            }
        }
        .padding(.vertical, 4)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
    }

    private var divider: some View {
        Divider().overlay(Theme.outline).padding(.leading, 56)
    }

    private func entryRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous)
                    .fill(Theme.accent.opacity(0.12))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.accent)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textMuted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.textMuted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    // MARK: - Logout
    private var logoutButton: some View {
        Button(role: .destructive) {
            authVM.logout()
        } label: {
            Text("退出登录")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.danger)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        }
    }
}
