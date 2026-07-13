import SwiftUI

/// 情侣空间 — 恋爱关系确认后的双人主页。
/// 由 matchId 驱动，自建 CoupleViewModel(matchId:)。
/// 展示封面 / 双人头像 / 在一起天数 / 我爱你计数器 / 状态 / 想吃 / 心愿单 / 纪念日。
struct CoupleSpaceView: View {
    let matchId: String
    @StateObject private var vm: CoupleViewModel

    // 交互态
    @State private var statusDraft: String = ""
    @State private var cravingDraft: String = ""
    @State private var showStatusSheet = false
    @State private var showCravingSheet = false
    @State private var showAddBucket = false
    @State private var showAddAnniversary = false
    @State private var bucketDraft = ""
    @State private var annTitleDraft = ""
    @State private var annDateDraft = ""
    @State private var heartPulse = false

    init(matchId: String) {
        self.matchId = matchId
        _vm = StateObject(wrappedValue: CoupleViewModel(matchId: matchId))
    }

    var body: some View {
        ScrollView {
            if vm.isLoading && vm.space == nil {
                ProgressView().tint(Theme.accent).padding(.top, 80)
            } else if let space = vm.space {
                VStack(spacing: 16) {
                    coverHeader(space)
                    daysCard(space)
                    loveYouCard(space)
                    statusCravingCard(space)
                    bucketCard(space)
                    anniversaryCard(space)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 40)
            } else {
                emptyState
            }
        }
        .themedScreen()
        .navigationTitle("情侣空间")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.load() }
        .task { await vm.load() }
        // 状态设置
        .sheet(isPresented: $showStatusSheet) {
            textEntrySheet(title: "更新状态", placeholder: "此刻的心情…", text: $statusDraft) {
                let v = statusDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !v.isEmpty else { return }
                await vm.setStatus(v)
            }
        }
        // 想吃设置
        .sheet(isPresented: $showCravingSheet) {
            textEntrySheet(title: "想吃点什么", placeholder: "今天想吃…", text: $cravingDraft) {
                let v = cravingDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !v.isEmpty else { return }
                await vm.setCraving(v)
            }
        }
        // 心愿单添加
        .sheet(isPresented: $showAddBucket) {
            textEntrySheet(title: "添加心愿", placeholder: "想一起做的事…", text: $bucketDraft) {
                let v = bucketDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !v.isEmpty else { return }
                await vm.addBucket(v)
                bucketDraft = ""
            }
        }
        // 纪念日添加
        .sheet(isPresented: $showAddAnniversary) {
            anniversarySheet
        }
    }

    // MARK: - Cover header + dual avatars
    private func coverHeader(_ space: CoupleSpace) -> some View {
        ZStack(alignment: .bottom) {
            // 封面
            Group {
                if let cover = space.cover, let url = URL(string: cover) {
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
            .frame(height: 160)
            .frame(maxWidth: .infinity)
            .clipped()
            .overlay(
                LinearGradient(colors: [.clear, Theme.bg.opacity(0.75)],
                               startPoint: .center, endPoint: .bottom)
            )

            // 双人头像
            HStack(spacing: 18) {
                avatarBadge(space.me, label: "我")
                Image(systemName: "heart.fill")
                    .foregroundColor(Theme.accent)
                    .font(.system(size: 20))
                    .offset(y: -6)
                avatarBadge(space.partner, label: "TA")
            }
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
    }

    private func avatarBadge(_ profile: PublicProfile?, label: String) -> some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().fill(Theme.surfaceHi).frame(width: 60, height: 60)
                if let urlStr = profile?.avatarUrl, let url = URL(string: urlStr) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: initialsCircle(profile?.nickname)
                        }
                    }
                    .frame(width: 60, height: 60)
                    .clipShape(Circle())
                } else {
                    initialsCircle(profile?.nickname)
                }
            }
            .overlay(Circle().stroke(Theme.accent, lineWidth: 2))
            Text(profile?.nickname ?? label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1)
        }
    }

    private func initialsCircle(_ nickname: String?) -> some View {
        Circle()
            .fill(Theme.surfaceHi)
            .frame(width: 60, height: 60)
            .overlay(
                Text(String(nickname?.prefix(1) ?? "?"))
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(Theme.accent)
            )
    }

    // MARK: - Days together
    private func daysCard(_ space: CoupleSpace) -> some View {
        Card {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("在一起")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textSecondary)
                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                        Text("\(space.daysTogether ?? 0)")
                            .font(.system(size: 34, weight: .bold))
                            .foregroundColor(Theme.accent)
                        Text("天")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(Theme.textSecondary)
                    }
                    if let since = space.since {
                        Text("自 \(String(since.prefix(10)))")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textMuted)
                    }
                }
                Spacer()
                Image(systemName: "sparkles")
                    .font(.system(size: 40))
                    .foregroundColor(Theme.accentDim)
            }
        }
    }

    // MARK: - Love You counter
    private func loveYouCard(_ space: CoupleSpace) -> some View {
        Card {
            VStack(spacing: 14) {
                HStack {
                    Text("我爱你")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    Spacer()
                    if let total = space.loveYou?.total {
                        Text("累计 \(total)")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textMuted)
                    }
                }

                HStack(spacing: 12) {
                    loveCount(label: "我", value: space.loveYou?.mine)
                    Rectangle().fill(Theme.outline).frame(width: 1, height: 30)
                    loveCount(label: "TA", value: space.loveYou?.partner)
                }

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.4)) { heartPulse = true }
                    Task {
                        await vm.loveYou()
                        withAnimation(.easeOut(duration: 0.2)) { heartPulse = false }
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "heart.fill")
                            .scaleEffect(heartPulse ? 1.25 : 1)
                        Text("说我爱你")
                    }
                }
                .buttonStyle(NeonButtonStyle())
            }
        }
    }

    private func loveCount(label: String, value: Int?) -> some View {
        VStack(spacing: 2) {
            Text("\(value ?? 0)")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(Theme.accent)
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Status + Craving
    private func statusCravingCard(_ space: CoupleSpace) -> some View {
        Card {
            VStack(spacing: 14) {
                editableRow(icon: "quote.bubble",
                            title: "状态",
                            value: space.status,
                            emptyHint: "点击设置状态") {
                    statusDraft = space.status ?? ""
                    showStatusSheet = true
                }
                Divider().overlay(Theme.outline)
                editableRow(icon: "fork.knife",
                            title: "想吃",
                            value: space.craving,
                            emptyHint: "点击记录想吃的") {
                    cravingDraft = space.craving ?? ""
                    showCravingSheet = true
                }
            }
        }
    }

    private func editableRow(icon: String, title: String, value: String?, emptyHint: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundColor(Theme.accent)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textSecondary)
                    Text(value?.isEmpty == false ? value! : emptyHint)
                        .font(.system(size: 15))
                        .foregroundColor(value?.isEmpty == false ? Theme.textPrimary : Theme.textMuted)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textMuted)
            }
        }
    }

    // MARK: - Bucket list
    private func bucketCard(_ space: CoupleSpace) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("心愿单")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    Spacer()
                    Button {
                        bucketDraft = ""
                        showAddBucket = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Theme.accent)
                    }
                }

                let items = space.bucket ?? []
                if items.isEmpty {
                    Text("还没有心愿，一起添加想做的事吧")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textMuted)
                        .padding(.vertical, 4)
                } else {
                    ForEach(items) { item in
                        Button {
                            Task { await vm.toggleBucket(item) }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: (item.done ?? false) ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 18))
                                    .foregroundColor((item.done ?? false) ? Theme.accent : Theme.textMuted)
                                Text(item.text ?? "")
                                    .font(.system(size: 14))
                                    .foregroundColor((item.done ?? false) ? Theme.textMuted : Theme.textPrimary)
                                    .strikethrough(item.done ?? false, color: Theme.textMuted)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Anniversaries
    private func anniversaryCard(_ space: CoupleSpace) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("纪念日")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    Spacer()
                    Button {
                        annTitleDraft = ""; annDateDraft = ""
                        showAddAnniversary = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Theme.accent)
                    }
                }

                let items = space.anniversaries ?? []
                if items.isEmpty {
                    Text("记录属于你们的重要日子")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textMuted)
                        .padding(.vertical, 4)
                } else {
                    ForEach(items) { ann in
                        HStack(spacing: 12) {
                            Image(systemName: "calendar.badge.clock")
                                .font(.system(size: 16))
                                .foregroundColor(Theme.accent)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ann.title ?? "纪念日")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(Theme.textPrimary)
                                if let date = ann.date {
                                    Text(String(date.prefix(10)))
                                        .font(.system(size: 12))
                                        .foregroundColor(Theme.textSecondary)
                                }
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
    }

    // MARK: - Shared text-entry sheet
    private func textEntrySheet(title: String, placeholder: String, text: Binding<String>, onSave: @escaping () async -> Void) -> some View {
        NavigationStack {
            VStack(spacing: 16) {
                TextField(placeholder, text: text, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(12)
                    .background(Theme.surfaceHi)
                    .foregroundColor(Theme.textPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
                Spacer()
            }
            .padding(20)
            .themedScreen()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismissAllSheets() }.tint(Theme.textSecondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task { await onSave(); dismissAllSheets() }
                    }.tint(Theme.accent)
                }
            }
        }
    }

    private var anniversarySheet: some View {
        NavigationStack {
            VStack(spacing: 16) {
                TextField("纪念日名称", text: $annTitleDraft)
                    .padding(12)
                    .background(Theme.surfaceHi)
                    .foregroundColor(Theme.textPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))

                TextField("日期 (YYYY-MM-DD)", text: $annDateDraft)
                    .padding(12)
                    .background(Theme.surfaceHi)
                    .foregroundColor(Theme.textPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))

                Spacer()
            }
            .padding(20)
            .themedScreen()
            .navigationTitle("添加纪念日")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { showAddAnniversary = false }.tint(Theme.textSecondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        let t = annTitleDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                        let d = annDateDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !t.isEmpty, !d.isEmpty else { return }
                        Task { await vm.addAnniversary(title: t, date: d); showAddAnniversary = false }
                    }.tint(Theme.accent)
                }
            }
        }
    }

    private func dismissAllSheets() {
        showStatusSheet = false
        showCravingSheet = false
        showAddBucket = false
    }

    // MARK: - Empty / error
    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "heart.slash")
                .font(.system(size: 44))
                .foregroundColor(Theme.textMuted)
            Text(vm.errorMessage ?? "暂无情侣空间数据")
                .font(.system(size: 15))
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
            Button("重试") { Task { await vm.load() } }
                .buttonStyle(GhostButtonStyle())
                .frame(width: 160)
        }
        .padding(.top, 100)
        .padding(.horizontal, 40)
    }
}
