import SwiftUI

/// Dual-mode match home (恋人 / 朋友). Renders by `matchingVM.state`:
/// idle → searching → noMatch → matched/confirming → relationship.
struct MatchTabView: View {
    @EnvironmentObject var matchingVM: MatchingViewModel
    @EnvironmentObject var authVM: AuthViewModel

    @State private var showEnhancedSheet = false
    @State private var showFilter = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    modePicker

                    switch matchingVM.state {
                    case .idle:        idleView
                    case .searching:   searchingView
                    case .noMatch:     noMatchView
                    case .matched, .confirming: matchedView
                    case .relationship: relationshipView
                    }

                    if let error = matchingVM.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(Theme.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(16)
                .padding(.bottom, 32)
            }
            .themedScreen()
            .navigationTitle("匹配")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showFilter = true } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .foregroundColor(Theme.accent)
                    }
                }
            }
            .sheet(isPresented: $showEnhancedSheet) {
                EnhancedSheet().environmentObject(matchingVM)
            }
            .sheet(isPresented: $showFilter) {
                MatchFilterView(mode: matchingVM.mode)
            }
            .refreshable { await matchingVM.load() }
            .task { await matchingVM.load() }
        }
        .tint(Theme.accent)
    }

    // MARK: - Mode picker
    private var modePicker: some View {
        Picker("模式", selection: Binding(
            get: { matchingVM.mode },
            set: { newMode in Task { await matchingVM.switchMode(newMode) } }
        )) {
            ForEach(MatchMode.allCases) { m in
                Label(m.title, systemImage: m.icon).tag(m)
            }
        }
        .pickerStyle(.segmented)
        .padding(.bottom, 4)
    }

    // MARK: - Idle (join pool)
    private var idleView: some View {
        VStack(spacing: 22) {
            Spacer().frame(height: 24)
            heroCircle(icon: matchingVM.mode.icon)

            VStack(spacing: 8) {
                Text(matchingVM.mode == .romantic ? "准备好遇见 TA 了吗？" : "找到志同道合的朋友")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.textPrimary)
                Text("加入本周匹配池")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                Text("每周五 17:00 公布结果")
                    .font(.subheadline.bold())
                    .foregroundColor(Theme.accent)
                if let next = matchingVM.status?.nextRunAt {
                    Text("下次公布：\(shortTime(next))")
                        .font(.caption)
                        .foregroundColor(Theme.textMuted)
                        .padding(.top, 2)
                }
            }

            VStack(spacing: 12) {
                Button { Task { await matchingVM.start(enhanced: false) } } label: {
                    HStack(spacing: 8) {
                        if matchingVM.isLoading { ProgressView().tint(Theme.onAccent) }
                        Text("加入匹配")
                    }
                }
                .buttonStyle(NeonButtonStyle())
                .disabled(matchingVM.isLoading)

                Button { showEnhancedSheet = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "bolt.fill")
                        Text("使用增强匹配")
                    }
                }
                .buttonStyle(GhostButtonStyle())
                .disabled(matchingVM.isLoading)
            }
            .padding(.horizontal, 8)
        }
    }

    // MARK: - Searching
    private var searchingView: some View {
        VStack(spacing: 22) {
            Spacer().frame(height: 30)
            SearchingRing()

            VStack(spacing: 8) {
                Text("已加入匹配池")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.textPrimary)
                Text("系统将在本周五 17:00 为你公布结果")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                if let next = matchingVM.status?.nextRunAt {
                    Label(shortTime(next), systemImage: "clock")
                        .font(.subheadline.bold())
                        .foregroundColor(Theme.accent)
                        .padding(.top, 2)
                }
            }

            Button { Task { await matchingVM.stop() } } label: {
                Text("退出匹配")
            }
            .buttonStyle(GhostButtonStyle())
            .disabled(matchingVM.isLoading)
            .padding(.horizontal, 8)
        }
    }

    // MARK: - No match this week
    private var noMatchView: some View {
        VStack(spacing: 22) {
            Spacer().frame(height: 24)
            heroCircle(icon: "moon.stars", dim: true)

            VStack(spacing: 8) {
                Text("本周暂无合适的缘分")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.textPrimary)
                Text(matchingVM.status?.message ?? "我们认真比对了所有人\n这周还没找到高度契合的对象")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                Text("下周五 17:00 我们再为你寻找")
                    .font(.subheadline)
                    .foregroundColor(Theme.textMuted)
            }

            VStack(spacing: 12) {
                Button { Task { await matchingVM.start(enhanced: false) } } label: {
                    Text("重新加入")
                }
                .buttonStyle(NeonButtonStyle())
                .disabled(matchingVM.isLoading)

                Button { showFilter = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                        Text("调整筛选条件")
                    }
                }
                .buttonStyle(GhostButtonStyle())
            }
            .padding(.horizontal, 8)
        }
    }

    // MARK: - Matched / confirming
    @ViewBuilder
    private var matchedView: some View {
        if matchingVM.mode == .romantic {
            romanticMatchedCard
        } else {
            friendMatchedList
        }
    }

    // Romantic: single match + partner card
    @ViewBuilder
    private var romanticMatchedCard: some View {
        if let match = matchingVM.status?.match, let partner = matchingVM.status?.partner {
            VStack(spacing: 16) {
                sectionHeader(title: "本周为你匹配到", subtitle: "确认建立关系，或礼貌地错过")

                PartnerMatchCard(partner: partner, score: match.score)

                if let mine = match.myConfirmed, mine {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(Theme.accent)
                        Text(match.partnerConfirmed == true ? "双方已确认" : "已发送你的确认，等待对方")
                            .font(.footnote)
                            .foregroundColor(Theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                confirmDissolveButtons(matchId: match.id)
            }
        } else {
            emptyMatchPlaceholder
        }
    }

    // Friend: list of matches
    @ViewBuilder
    private var friendMatchedList: some View {
        if let matches = matchingVM.status?.matches, !matches.isEmpty {
            VStack(spacing: 16) {
                sectionHeader(title: "本周为你匹配到 \(matches.count) 位朋友",
                              subtitle: "逐一确认想继续认识的人")

                ForEach(matches) { fm in
                    VStack(spacing: 14) {
                        if let partner = fm.partner {
                            PartnerMatchCard(partner: partner, score: fm.score)
                        }
                        if let mine = fm.myConfirmed, mine {
                            HStack(spacing: 8) {
                                Image(systemName: "checkmark.circle.fill").foregroundColor(Theme.accent)
                                Text(fm.partnerConfirmed == true ? "双方已确认" : "已发送确认，等待对方")
                                    .font(.footnote)
                                    .foregroundColor(Theme.textSecondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        confirmDissolveButtons(matchId: fm.matchId)
                    }
                    .padding(14)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
                }
            }
        } else {
            emptyMatchPlaceholder
        }
    }

    // MARK: - Relationship
    @ViewBuilder
    private var relationshipView: some View {
        VStack(spacing: 16) {
            heroCircle(icon: matchingVM.mode == .romantic ? "heart.fill" : "person.2.fill")

            if matchingVM.mode == .romantic, let partner = matchingVM.status?.partner {
                Card {
                    VStack(spacing: 14) {
                        AvatarCircle(urlString: partner.avatarUrl,
                                     fallback: partner.nickname, size: 84)
                        Text(partner.nickname ?? "你的另一半")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(Theme.textPrimary)
                        if let school = partner.school {
                            Text(school + (partner.grade.map { " · \($0)" } ?? ""))
                                .font(.subheadline)
                                .foregroundColor(Theme.textSecondary)
                        }
                        if let started = matchingVM.status?.match?.relationshipStartedAt,
                           let date = ISODate.parse(started) {
                            let days = Calendar.current.dateComponents([.day], from: date, to: Date()).day ?? 0
                            Label("在一起 \(days) 天", systemImage: "sparkles")
                                .font(.subheadline.bold())
                                .foregroundColor(Theme.onAccent)
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .background(Theme.accentGradient)
                                .clipShape(Capsule())
                        }
                    }
                    .frame(maxWidth: .infinity)
                }

                if let matchId = matchingVM.status?.match?.id {
                    NavigationLink { CoupleSpaceView(matchId: matchId) } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "sparkles")
                            Text("进入情侣空间")
                        }
                    }
                    .buttonStyle(NeonButtonStyle())

                    Button { Task { await matchingVM.dissolve(matchId: matchId) } } label: {
                        Text("解除恋爱关系").foregroundColor(Theme.danger)
                    }
                    .buttonStyle(GhostButtonStyle())
                }
            } else if matchingVM.mode == .friend, let matches = matchingVM.status?.matches {
                sectionHeader(title: "你的朋友", subtitle: "已建立联系的伙伴")
                ForEach(matches) { fm in
                    if let partner = fm.partner {
                        Card {
                            HStack(spacing: 12) {
                                AvatarCircle(urlString: partner.avatarUrl,
                                             fallback: partner.nickname, size: 52)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(partner.nickname ?? "朋友")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(Theme.textPrimary)
                                    if let school = partner.school {
                                        Text(school).font(.caption).foregroundColor(Theme.textSecondary)
                                    }
                                }
                                Spacer()
                                Button { Task { await matchingVM.dissolve(matchId: fm.matchId) } } label: {
                                    Text("解除").font(.caption).foregroundColor(Theme.danger)
                                }
                            }
                        }
                    }
                }
            } else {
                Text(matchingVM.mode == .romantic ? "恋爱关系进行中" : "已建立朋友关系")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(Theme.accent)
            }
        }
    }

    // MARK: - Shared pieces
    private func confirmDissolveButtons(matchId: String?) -> some View {
        HStack(spacing: 12) {
            Button { if let id = matchId { Task { await matchingVM.dissolve(matchId: id) } } } label: {
                Text("暂不")
            }
            .buttonStyle(GhostButtonStyle())

            Button { if let id = matchId { Task { await matchingVM.confirm(matchId: id) } } } label: {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark")
                    Text("确认建立关系")
                }
            }
            .buttonStyle(NeonButtonStyle())
        }
        .disabled(matchId == nil)
    }

    private func sectionHeader(title: String, subtitle: String) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(Theme.textPrimary)
            Text(subtitle)
                .font(.footnote)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private var emptyMatchPlaceholder: some View {
        VStack(spacing: 12) {
            heroCircle(icon: "sparkles")
            Text("匹配结果加载中…")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(.top, 24)
    }

    private func heroCircle(icon: String, dim: Bool = false) -> some View {
        ZStack {
            Circle()
                .fill(dim ? AnyShapeStyle(Theme.surfaceHi)
                          : AnyShapeStyle(Theme.accent.opacity(0.14)))
                .frame(width: 118, height: 118)
            Image(systemName: icon)
                .font(.system(size: 50))
                .foregroundColor(dim ? Theme.textMuted : Theme.accent)
        }
    }

    private func shortTime(_ iso: String) -> String {
        guard let date = ISODate.parse(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = "M月d日 HH:mm"
        return f.string(from: date)
    }
}

// MARK: - Searching ring animation
private struct SearchingRing: View {
    @State private var spin = false
    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.accent.opacity(0.2), lineWidth: 4)
                .frame(width: 100, height: 100)
            Circle()
                .trim(from: 0, to: 0.72)
                .stroke(Theme.accentGradient, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 100, height: 100)
                .rotationEffect(.degrees(spin ? 360 : 0))
                .animation(.linear(duration: 1.4).repeatForever(autoreverses: false), value: spin)
            Image(systemName: "sparkles")
                .font(.system(size: 34))
                .foregroundColor(Theme.accent)
        }
        .onAppear { spin = true }
    }
}

// MARK: - Partner match card (used in matched state)
private struct PartnerMatchCard: View {
    let partner: PublicProfile
    let score: Double?

    var body: some View {
        NavigationLink { PartnerProfileView(profile: partner) } label: {
            Card {
                VStack(spacing: 14) {
                    ZStack(alignment: .bottomLeading) {
                        coverBanner
                        HStack(alignment: .bottom, spacing: 12) {
                            AvatarCircle(urlString: partner.avatarUrl,
                                         fallback: partner.nickname, size: 66)
                                .overlay(Circle().stroke(Theme.bg, lineWidth: 3))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(partner.nickname ?? "神秘对象")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(Theme.textPrimary)
                                if let school = partner.school {
                                    Text(school).font(.caption).foregroundColor(Theme.textSecondary)
                                }
                            }
                            Spacer()
                        }
                        .padding(.leading, 4)
                        .offset(y: 30)
                    }
                    .padding(.bottom, 30)

                    if let score = score {
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles").foregroundColor(Theme.accent)
                            Text("契合度 \(Int(score.rounded()))")
                                .font(.footnote.bold())
                                .foregroundColor(Theme.accent)
                            Spacer()
                            Text("查看主页 ›")
                                .font(.caption)
                                .foregroundColor(Theme.textMuted)
                        }
                    }

                    if let bio = partner.bio, !bio.isEmpty {
                        Text(bio)
                            .font(.subheadline)
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let tags = partner.tags ?? partner.interests, !tags.isEmpty {
                        FlowLayout(spacing: 8) {
                            ForEach(tags.prefix(6), id: \.self) { tag in
                                TagChip(text: tag)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var coverBanner: some View {
        Group {
            if let cover = partner.coverUrl, let url = URL(string: cover) {
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
        .frame(height: 92)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
    }
}

// MARK: - Reusable avatar
struct AvatarCircle: View {
    let urlString: String?
    let fallback: String?
    var size: CGFloat = 56

    var body: some View {
        Group {
            if let s = urlString, !s.isEmpty, let url = URL(string: s) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    case .empty: Theme.surfaceHi
                    case .failure: placeholder
                    @unknown default: placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var placeholder: some View {
        ZStack {
            Theme.surfaceHi
            Text(String(fallback?.prefix(1) ?? "?"))
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundColor(Theme.accent)
        }
    }
}

// MARK: - Tag chip
struct TagChip: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundColor(Theme.accent)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Theme.accent.opacity(0.12))
            .clipShape(Capsule())
    }
}
