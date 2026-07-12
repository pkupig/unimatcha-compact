import SwiftUI

struct ProfileTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var profileVM: ProfileViewModel
    @EnvironmentObject var matchingVM: MatchingViewModel

    @State private var showPreview = false

    let pink = Color(red: 1, green: 0.4, blue: 0.5)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // ─── 上方：背景图 Banner ──────────────────────
                    ZStack(alignment: .topTrailing) {
                        // 背景图区域
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 1, green: 0.85, blue: 0.9), Color(red: 0.93, green: 0.88, blue: 1)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                            .frame(height: 180)

                        // 预览按钮
                        Button(action: { showPreview = true }) {
                            HStack(spacing: 4) {
                                Image(systemName: "eye").font(.system(size: 11))
                                Text("预览").font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(pink)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.white.opacity(0.85))
                            .cornerRadius(14)
                        }
                        .padding(.top, 12)
                        .padding(.trailing, 12)
                    }

                    // ─── 下方：个人信息卡片（浮在背景图下方） ────────
                    VStack(alignment: .leading, spacing: 12) {
                        // 头像 + 基本信息
                        HStack(alignment: .top, spacing: 14) {
                            // 头像
                            ZStack(alignment: .bottomTrailing) {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [Color(red: 1, green: 0.85, blue: 0.9), Color(red: 1, green: 0.94, blue: 0.96)],
                                            startPoint: .top, endPoint: .bottom
                                        )
                                    )
                                    .frame(width: 68, height: 68)
                                    .overlay(
                                        Text(String(profileVM.nickname.prefix(1)))
                                            .font(.system(size: 26, weight: .medium))
                                            .foregroundColor(Color(red: 1, green: 0.35, blue: 0.45))
                                    )
                                    .overlay(
                                        Circle().stroke(
                                            profileVM.verificationStatus == "verified" ? Color.yellow : Color.white,
                                            lineWidth: profileVM.verificationStatus == "verified" ? 3 : 2
                                        )
                                    )

                                if profileVM.verificationStatus == "verified" {
                                    Image(systemName: "checkmark.seal.fill")
                                        .foregroundColor(.yellow)
                                        .font(.system(size: 14))
                                        .offset(x: 2, y: 2)
                                }
                            }

                            // 信息
                            VStack(alignment: .leading, spacing: 4) {
                                Text(profileVM.nickname.isEmpty ? "未设置昵称" : profileVM.nickname)
                                    .font(.system(size: 18, weight: .bold))

                                if !profileVM.school.isEmpty {
                                    Text("\(profileVM.school) \(profileVM.grade)")
                                        .font(.system(size: 13))
                                        .foregroundColor(.secondary)
                                }

                                // 状态 + MBTI + 星座
                                HStack(spacing: 6) {
                                    matchStatePill
                                    if !profileVM.mbti.isEmpty {
                                        Text(profileVM.mbti)
                                            .font(.system(size: 10, weight: .semibold))
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 1)
                                            .background(Color.purple.opacity(0.12))
                                            .foregroundColor(.purple)
                                            .cornerRadius(6)
                                    }
                                    if !profileVM.zodiac.isEmpty {
                                        Text(profileVM.zodiac)
                                            .font(.system(size: 10))
                                            .foregroundColor(.secondary)
                                    }
                                }

                                // 城市/年龄/专业
                                HStack(spacing: 8) {
                                    if !profileVM.city.isEmpty {
                                        Label(profileVM.city, systemImage: "location")
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                    }
                                    if profileVM.age > 0 {
                                        Text("\(profileVM.age)岁")
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                    }
                                    if !profileVM.major.isEmpty {
                                        Label(profileVM.major, systemImage: "book")
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }

                            Spacer()
                        }

                        // 个性签名
                        if !profileVM.signature.isEmpty {
                            Text("\"\(profileVM.signature)\"")
                                .font(.system(size: 13, design: .serif))
                                .foregroundColor(.secondary)
                                .italic()
                        }

                        // 标签
                        if !profileVM.tags.isEmpty {
                            FlowLayout(spacing: 4) {
                                ForEach(profileVM.tags.prefix(10), id: \.self) { tag in
                                    Text(tag)
                                        .font(.system(size: 10, weight: .medium))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 3)
                                        .background(Color(red: 1, green: 0.94, blue: 0.96))
                                        .foregroundColor(pink)
                                        .cornerRadius(10)
                                }
                            }
                        }

                        // 个人简介
                        if !profileVM.bio.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Divider()
                                Text(profileVM.bio)
                                    .font(.system(size: 13))
                                    .foregroundColor(.primary)
                                    .lineSpacing(3)
                            }
                        }

                        // 社交联系方式（内嵌在卡片里）
                        let socialLinks: [(String, String, String)] = [
                            ("微信", "message.fill", profileVM.wechat),
                            ("QQ", "bubble.left.fill", profileVM.qq),
                            ("小红书", "book.fill", profileVM.xiaohongshu),
                            ("微博", "globe", profileVM.weibo),
                            ("Instagram", "camera.fill", profileVM.instagram),
                        ]
                        let nonEmpty = socialLinks.filter { !$0.2.isEmpty }
                        if !nonEmpty.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Divider()
                                Text("社交联系方式")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.secondary)

                                ForEach(Array(nonEmpty.enumerated()), id: \.offset) { _, item in
                                    HStack(spacing: 8) {
                                        Image(systemName: item.1)
                                            .foregroundColor(.secondary)
                                            .frame(width: 18)
                                        Text(item.0)
                                            .foregroundColor(.secondary)
                                            .frame(width: 55, alignment: .leading)
                                            .font(.system(size: 13))
                                        Text(item.2)
                                            .font(.system(size: 13))
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                    }
                    .padding(20)
                    .background(Color.white)
                    .cornerRadius(20)
                    .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
                    .padding(.horizontal, 16)
                    .offset(y: -36)

                    // ─── 编辑按钮 ──────────────────────────────
                    HStack(spacing: 8) {
                        NavigationLink(destination: ProfileEditView().environmentObject(profileVM)) {
                            HStack {
                                Image(systemName: "pencil")
                                Text("编辑资料")
                            }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(pink)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .background(Color(red: 1, green: 0.94, blue: 0.96))
                            .cornerRadius(20)
                        }
                    }
                    .padding(.horizontal, 16)
                    .offset(y: -24)

                    VStack(spacing: 16) {
                        // Relationship mode entry
                        if matchingVM.isInRelationship {
                            NavigationLink(destination: RelationshipModeView()) {
                                HStack(spacing: 10) {
                                    Image(systemName: "sparkles")
                                        .foregroundColor(pink)
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
                            .padding(.horizontal, 16)
                        }

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
                        .padding(.horizontal, 16)

                        Spacer().frame(height: 30)
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("我的")
            .task {
                await profileVM.loadProfile()
                if let vs = authVM.currentUser?.verificationStatus {
                    profileVM.verificationStatus = vs
                }
            }
            .sheet(isPresented: $showPreview) {
                previewSheet
            }
        }
    }

    // MARK: - Match State Pill
    private var matchStatePill: some View {
        let state = matchingVM.matchState
        let (color, text): (Color, String) = {
            switch state {
            case .relationship: return (.green, "恋爱中")
            case .proposed: return (Color(red: 1, green: 0.6, blue: 0.2), "待确认")
            case .searching: return (.orange, "匹配中")
            case .matched: return (pink, "已匹配")
            default: return (.gray, "空闲")
            }
        }()

        return HStack(spacing: 3) {
            Circle().fill(color).frame(width: 5, height: 5)
            Text(text)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(color)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 2)
        .background(color.opacity(0.1))
        .cornerRadius(8)
    }

    // MARK: - Preview Sheet (他人视角)
    private var previewSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Label("这是匹配对方看到你的样子", systemImage: "eye")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .padding(.top, 8)

                    // Avatar + basic info
                    VStack(spacing: 8) {
                        ZStack(alignment: .bottomTrailing) {
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
                                        .font(.system(size: 32, weight: .medium))
                                        .foregroundColor(Color(red: 1, green: 0.35, blue: 0.45))
                                )
                                .overlay(
                                    Circle().stroke(
                                        profileVM.verificationStatus == "verified" ? Color.yellow : Color.white,
                                        lineWidth: 3
                                    )
                                )
                            if profileVM.verificationStatus == "verified" {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundColor(.yellow)
                                    .font(.system(size: 16))
                            }
                        }

                        Text(profileVM.nickname.isEmpty ? "未设置昵称" : profileVM.nickname)
                            .font(.system(size: 20, weight: .bold))

                        HStack(spacing: 6) {
                            if !profileVM.mbti.isEmpty {
                                Text(profileVM.mbti)
                                    .font(.caption).fontWeight(.semibold)
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(Color.purple.opacity(0.12))
                                    .foregroundColor(.purple)
                                    .cornerRadius(8)
                            }
                            if !profileVM.zodiac.isEmpty {
                                Text(profileVM.zodiac)
                                    .font(.caption).fontWeight(.semibold)
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(Color.yellow.opacity(0.15))
                                    .foregroundColor(Color(red: 0.72, green: 0.53, blue: 0))
                                    .cornerRadius(8)
                            }
                        }

                        HStack(spacing: 12) {
                            if !profileVM.school.isEmpty {
                                Label(profileVM.school, systemImage: "graduationcap")
                                    .font(.caption).foregroundColor(.secondary)
                            }
                            Label(profileVM.grade, systemImage: "book")
                                .font(.caption).foregroundColor(.secondary)
                            Label(profileVM.city.isEmpty ? "未设置" : profileVM.city, systemImage: "location")
                                .font(.caption).foregroundColor(.secondary)
                        }

                        HStack(spacing: 12) {
                            if !profileVM.major.isEmpty {
                                Label(profileVM.major, systemImage: "book.closed")
                                    .font(.caption).foregroundColor(.secondary)
                            }
                            if !profileVM.nationality.isEmpty {
                                Label(profileVM.nationality, systemImage: "globe")
                                    .font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(.bottom, 8)

                    if !profileVM.signature.isEmpty {
                        VStack(alignment: .leading) {
                            Text("个性签名").font(.system(size: 14, weight: .semibold)).foregroundColor(.secondary)
                            Text("\"\(profileVM.signature)\"")
                                .font(.system(size: 14, design: .serif)).italic()
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.white)
                                .cornerRadius(12)
                        }
                        .padding(.horizontal, 20)
                    }

                    if !profileVM.tags.isEmpty {
                        VStack(alignment: .leading) {
                            Text("兴趣标签").font(.system(size: 14, weight: .semibold)).foregroundColor(.secondary)
                            FlowLayout(spacing: 6) {
                                ForEach(profileVM.tags, id: \.self) { tag in
                                    Text(tag)
                                        .font(.system(size: 12, weight: .medium))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 5)
                                        .background(Color(red: 1, green: 0.94, blue: 0.96))
                                        .foregroundColor(pink)
                                        .cornerRadius(12)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                    if !profileVM.bio.isEmpty {
                        VStack(alignment: .leading) {
                            Text("个人简介").font(.system(size: 14, weight: .semibold)).foregroundColor(.secondary)
                            Text(profileVM.bio)
                                .font(.system(size: 14))
                                .lineSpacing(4)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.white)
                                .cornerRadius(12)
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("他人视角")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("关闭") { showPreview = false }
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
        .padding(.horizontal, 16)
    }

    private func settingsRow(icon: String, title: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundColor(pink)
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
