import SwiftUI

struct MatchTabView: View {
    @EnvironmentObject var matchingVM: MatchingViewModel
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    switch matchingVM.matchState {
                    case .idle:
                        idleView
                    case .searching:
                        searchingView
                    case .noMatch:
                        noMatchView
                    case .proposed, .matched:
                        // 兼容旧数据：显示为关系状态或已匹配状态
                        if matchingVM.isInRelationship {
                            relationshipView
                        } else {
                            searchingView
                        }
                    case .relationship:
                        relationshipView
                    }

                    if let error = matchingVM.errorMessage {
                        Text(error).font(.caption).foregroundColor(.red).padding(.horizontal, 20)
                    }
                }
                .padding(.bottom, 40)
            }
            .navigationTitle("匹配")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { matchingVM.showFilterSheet = true } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                    }
                }
            }
            .sheet(isPresented: $matchingVM.showFilterSheet) {
                MatchFilterView().environmentObject(matchingVM)
            }
            .refreshable { await matchingVM.loadAll() }
            .task { await matchingVM.loadAll() }
        }
    }

    // MARK: - Idle
    private var idleView: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 40)
            ZStack {
                Circle().fill(Color(red: 1, green: 0.94, blue: 0.96)).frame(width: 120, height: 120)
                Image(systemName: "sparkles").font(.system(size: 56))
                    .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
            }
            VStack(spacing: 8) {
                Text("准备好找到 TA 了吗？").font(.system(size: 22, weight: .bold))
                Text("加入本周匹配池，系统将在").font(.subheadline).foregroundColor(.secondary)
                Text("每周五 17:00 公布结果").font(.subheadline.bold()).foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                Text("距下次公布：\(matchingVM.nextFridayCountdown)")
                    .font(.caption).foregroundColor(.secondary).padding(.top, 2)
            }
            Button(action: { Task { await matchingVM.startMatch() } }) {
                HStack(spacing: 8) {
                    if matchingVM.isLoading { ProgressView().tint(.white) }
                    Text("加入匹配").font(.system(size: 18, weight: .semibold))
                }
                .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: 54)
                .background(LinearGradient(colors: [Color(red: 1, green: 0.4, blue: 0.5), Color(red: 1, green: 0.55, blue: 0.6)], startPoint: .leading, endPoint: .trailing))
                .cornerRadius(27)
                .shadow(color: Color(red: 1, green: 0.4, blue: 0.5).opacity(0.4), radius: 12, y: 4)
            }
            .disabled(matchingVM.isLoading).padding(.horizontal, 40)
        }
    }

    // MARK: - Searching
    private var searchingView: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 50)
            ZStack {
                Circle().stroke(Color(red: 1, green: 0.4, blue: 0.5).opacity(0.25), lineWidth: 4).frame(width: 100, height: 100)
                Circle().trim(from: 0, to: 0.75)
                    .stroke(Color(red: 1, green: 0.4, blue: 0.5), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 100, height: 100)
                    .rotationEffect(.degrees(-90))
                Image(systemName: "sparkles").font(.system(size: 36))
                    .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
            }
            VStack(spacing: 8) {
                Text("已加入匹配池").font(.system(size: 22, weight: .bold))
                Text("系统将在本周五 17:00 为你公布结果")
                    .font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
                Text(matchingVM.nextFridayCountdown)
                    .font(.subheadline.bold()).foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
            }
            VStack(spacing: 12) {
                Button(action: { Task { await matchingVM.stopMatch() } }) {
                    HStack(spacing: 8) {
                        if matchingVM.isLoading { ProgressView().tint(.secondary) }
                        Text("退出匹配").font(.system(size: 16, weight: .medium))
                    }
                    .foregroundColor(.secondary).frame(maxWidth: .infinity).frame(height: 48)
                    .background(Color(.systemGray6)).cornerRadius(24)
                }
                .disabled(matchingVM.isLoading)

                Button { matchingVM.showFilterSheet = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                        Text("调整筛选条件")
                    }
                    .font(.subheadline).foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 40)
        }
    }

    // MARK: - No Match This Week
    private var noMatchView: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 40)
            ZStack {
                Circle().fill(Color(.systemGray6)).frame(width: 120, height: 120)
                Image(systemName: "moon.stars").font(.system(size: 56))
                    .foregroundColor(.secondary)
            }
            VStack(spacing: 8) {
                Text("本周暂无合适的缘分").font(.system(size: 22, weight: .bold))
                Text("我们认真为你比对了所有人\n这周还没找到高度契合的对象")
                    .font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
                Text("下周五 17:00 我们再为你寻找")
                    .font(.subheadline).foregroundColor(.secondary)
                Label(matchingVM.nextFridayCountdown, systemImage: "clock")
                    .font(.subheadline.bold()).foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                    .padding(.top, 4)
            }
            VStack(spacing: 12) {
                Button { matchingVM.showFilterSheet = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                        Text("调整筛选条件")
                    }
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: 48)
                    .background(Color(red: 1, green: 0.4, blue: 0.5)).cornerRadius(24)
                }
                Button(action: { Task { await matchingVM.stopMatch() } }) {
                    Text("退出匹配").font(.system(size: 15)).foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(Color(.systemGray6)).cornerRadius(22)
                }
            }
            .padding(.horizontal, 40)
        }
    }

    // MARK: - Relationship
    private var relationshipView: some View {
        VStack(spacing: 0) {
            if let partner = matchingVM.partner {
                // ─── 背景图 / 封面 ─────────────────────────
                ZStack(alignment: .bottom) {
                    // Cover bg
                    LinearGradient(
                        colors: [Color(red: 1, green: 0.42, blue: 0.55), Color(red: 0.9, green: 0.2, blue: 0.6)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    .frame(height: 200)
                    .cornerRadius(18)
                    .padding(.horizontal, 16)

                    // Avatar centered at bottom edge
                    ZStack {
                        Circle().fill(.white).frame(width: 82, height: 82)
                        Circle()
                            .fill(LinearGradient(colors: [Color(red: 1, green: 0.4, blue: 0.5), Color(red: 1, green: 0.6, blue: 0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 74, height: 74)
                        Text(String(partner.nickname?.prefix(1) ?? "?"))
                            .font(.system(size: 32, weight: .medium)).foregroundColor(.white)
                    }
                    .offset(y: 41)
                }
                .padding(.top, 20)

                // ─── Info Card ────────────────────────────
                VStack(spacing: 14) {
                    Spacer().frame(height: 50) // space for avatar overflow

                    Text(partner.nickname ?? "你的另一半")
                        .font(.system(size: 22, weight: .bold))
                    if let school = partner.school {
                        Text(school + (partner.grade.map { " · \($0)" } ?? ""))
                            .font(.subheadline).foregroundColor(.secondary)
                    }

                    // Days together
                    if let startStr = matchingVM.matchInfo?.relationshipStartedAt,
                       let startDate = ISO8601DateFormatter().date(from: startStr) {
                        let days = Calendar.current.dateComponents([.day], from: startDate, to: Date()).day ?? 0
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles").foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                            Text("在一起 \(days) 天").font(.subheadline.bold()).foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                        }
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(Color(red: 1, green: 0.94, blue: 0.96)).cornerRadius(20)
                    }

                    if let score = matchingVM.matchInfo?.score {
                        Text("灵魂契合度 \(Int(score))分")
                            .font(.caption).foregroundColor(.secondary)
                    }

                    Divider().padding(.horizontal, 20)

                    // ─── Chat Button ──────────────────────
                    if let matchId = matchingVM.matchInfo?.id, let userId = authVM.currentUser?.id {
                        NavigationLink(destination: ChatView(matchId: matchId, currentUserId: userId, partner: partner)) {
                            HStack(spacing: 8) {
                                Image(systemName: "bubble.left.and.bubble.right.fill")
                                Text("开启聊天").font(.system(size: 16, weight: .semibold))
                            }
                            .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: 52)
                            .background(LinearGradient(colors: [Color(red: 1, green: 0.4, blue: 0.5), Color(red: 0.9, green: 0.2, blue: 0.6)], startPoint: .leading, endPoint: .trailing))
                            .cornerRadius(26)
                            .shadow(color: Color(red: 1, green: 0.4, blue: 0.5).opacity(0.35), radius: 10, y: 4)
                        }
                        .padding(.horizontal, 20)
                    }

                    // View partner profile
                    if let userId = partner.userId {
                        NavigationLink(destination: PartnerProfileView(userId: userId)) {
                            HStack(spacing: 4) {
                                Text("查看 TA 的主页")
                                Image(systemName: "chevron.right")
                            }
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                        }
                    }

                    Divider().padding(.horizontal, 20)

                    // Dissolve button
                    Button(action: { Task { await matchingVM.dissolve() } }) {
                        Text("解除恋爱关系")
                            .font(.subheadline).foregroundColor(.red)
                            .frame(maxWidth: .infinity).frame(height: 44)
                            .background(Color(.systemGray6)).cornerRadius(22)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 20)
                }
                .frame(maxWidth: .infinity)
                .background(Color(.systemBackground))
                .cornerRadius(24)
                .shadow(color: .black.opacity(0.06), radius: 16, y: 4)
                .padding(.horizontal, 16)
                .padding(.top, 0)
            } else {
                // Fallback: partner not loaded
                VStack(spacing: 16) {
                    Image(systemName: "sparkles").font(.system(size: 60))
                        .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                        .padding(.top, 60)
                    Text("恋爱模式").font(.system(size: 24, weight: .bold)).foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                    Button(action: { Task { await matchingVM.dissolve() } }) {
                        Text("解除恋爱关系").font(.subheadline).foregroundColor(.red)
                    }
                }
            }
        }
    }
}
