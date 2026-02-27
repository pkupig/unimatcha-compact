import SwiftUI

struct MatchTabView: View {
    @EnvironmentObject var matchingVM: MatchingViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Next match info
                    if let config = matchingVM.matchConfig {
                        HStack(spacing: 8) {
                            Image(systemName: "clock")
                                .foregroundColor(.secondary)
                                .font(.subheadline)
                            Text("下次匹配：\(config.description ?? config.cronExpr)")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                    }

                    // State-based content
                    switch matchingVM.matchState {
                    case .idle:
                        idleView
                    case .searching:
                        searchingView
                    case .matched:
                        matchedView
                    case .relationship:
                        relationshipView
                    }

                    // Error
                    if let error = matchingVM.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.horizontal, 20)
                    }
                }
                .padding(.bottom, 40)
            }
            .navigationTitle("匹配")
            .refreshable { await matchingVM.loadAll() }
            .task { await matchingVM.loadAll() }
        }
    }

    // MARK: - Idle
    private var idleView: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 40)

            ZStack {
                Circle()
                    .fill(Color(red: 1, green: 0.94, blue: 0.96))
                    .frame(width: 120, height: 120)
                Image(systemName: "heart.circle")
                    .font(.system(size: 56))
                    .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
            }

            VStack(spacing: 8) {
                Text("准备好找到 TA 了吗？")
                    .font(.system(size: 22, weight: .bold))
                Text("点击下方按钮，开始你的匹配之旅")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Button(action: { Task { await matchingVM.startMatch() } }) {
                HStack(spacing: 8) {
                    if matchingVM.isLoading {
                        ProgressView().tint(.white)
                    }
                    Text("开始匹配")
                        .font(.system(size: 18, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(
                    LinearGradient(
                        colors: [Color(red: 1, green: 0.4, blue: 0.5), Color(red: 1, green: 0.55, blue: 0.6)],
                        startPoint: .leading, endPoint: .trailing
                    )
                )
                .cornerRadius(27)
                .shadow(color: Color(red: 1, green: 0.4, blue: 0.5).opacity(0.4), radius: 12, y: 4)
            }
            .disabled(matchingVM.isLoading)
            .padding(.horizontal, 40)
        }
    }

    // MARK: - Searching
    private var searchingView: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 60)

            ZStack {
                Circle()
                    .stroke(Color(red: 1, green: 0.4, blue: 0.5).opacity(0.3), lineWidth: 4)
                    .frame(width: 100, height: 100)
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(Color(red: 1, green: 0.4, blue: 0.5))
            }

            VStack(spacing: 8) {
                Text("匹配进行中...")
                    .font(.system(size: 22, weight: .bold))
                Text("正在为你寻找最合适的人，请耐心等待")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Matched
    private var matchedView: some View {
        VStack(spacing: 20) {
            Text("匹配成功！")
                .font(.system(size: 24, weight: .bold))
                .padding(.top, 20)

            if let partner = matchingVM.partner {
                partnerCard(partner)
            }

            // Confirm / Reject buttons
            let myConfirmed = matchingVM.matchInfo?.myConfirmed ?? false
            if myConfirmed {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("你已确认，等待对方确认...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
                .padding(.horizontal, 20)
            } else {
                HStack(spacing: 16) {
                    Button(action: { Task { await matchingVM.rejectMatch() } }) {
                        Text("拒绝")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Color(.systemGray6))
                            .cornerRadius(24)
                    }

                    Button(action: { Task { await matchingVM.confirmMatch() } }) {
                        Text("确认匹配")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Color(red: 1, green: 0.4, blue: 0.5))
                            .cornerRadius(24)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Relationship
    private var relationshipView: some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 20)

            ZStack {
                Circle()
                    .fill(Color(red: 1, green: 0.94, blue: 0.96))
                    .frame(width: 100, height: 100)
                Text("💕").font(.system(size: 48))
            }

            VStack(spacing: 8) {
                Text("恋爱模式")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(Color(red: 1, green: 0.3, blue: 0.45))
                Text("你已找到 TA，享受美好时光吧")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            if let partner = matchingVM.partner {
                partnerCard(partner)
            }

            NavigationLink(destination: RelationshipModeView()) {
                HStack {
                    Image(systemName: "heart.text.square.fill")
                    Text("进入恋爱模式")
                }
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(
                    LinearGradient(
                        colors: [Color(red: 1, green: 0.3, blue: 0.45), Color(red: 0.9, green: 0.2, blue: 0.6)],
                        startPoint: .leading, endPoint: .trailing
                    )
                )
                .cornerRadius(24)
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Partner Card
    private func partnerCard(_ partner: PublicProfile) -> some View {
        VStack(spacing: 14) {
            // Avatar
            Circle()
                .fill(Color(red: 1, green: 0.94, blue: 0.96))
                .frame(width: 72, height: 72)
                .overlay(
                    Text(String(partner.nickname?.prefix(1) ?? "?"))
                        .font(.system(size: 30, weight: .medium))
                        .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                )

            Text(partner.nickname ?? "神秘用户")
                .font(.system(size: 20, weight: .semibold))

            HStack(spacing: 14) {
                if let school = partner.school {
                    Label(school, systemImage: "graduationcap")
                        .font(.caption).foregroundColor(.secondary)
                }
                if let age = partner.age {
                    Label("\(age) 岁", systemImage: "person")
                        .font(.caption).foregroundColor(.secondary)
                }
                if let city = partner.city {
                    Label(city, systemImage: "location")
                        .font(.caption).foregroundColor(.secondary)
                }
            }

            if let interests = partner.interests, !interests.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(interests.prefix(5), id: \.self) { tag in
                        Text(tag)
                            .font(.caption2)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color(red: 1, green: 0.94, blue: 0.96))
                            .foregroundColor(Color(red: 1, green: 0.3, blue: 0.45))
                            .cornerRadius(12)
                    }
                }
            }

            if let bio = partner.bio, !bio.isEmpty {
                Text(bio)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }

            // View profile link
            if let userId = partner.userId {
                NavigationLink(destination: PartnerProfileView(userId: userId)) {
                    HStack(spacing: 4) {
                        Text("查看 TA 的主页")
                        Image(systemName: "chevron.right")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                }
                .padding(.top, 4)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(Color.white)
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.06), radius: 12, x: 0, y: 4)
        .padding(.horizontal, 20)
    }
}

// MARK: - Simple FlowLayout
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> (positions: [CGPoint], size: CGSize) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x)
        }

        return (positions, CGSize(width: maxX, height: y + rowHeight))
    }
}
