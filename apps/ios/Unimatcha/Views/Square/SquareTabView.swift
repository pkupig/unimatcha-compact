import SwiftUI

enum SquareSection: String, CaseIterable {
    case square = "广场"
    case leaderboard = "排行榜"
}

struct SquareTabView: View {
    @EnvironmentObject var squareVM: SquareViewModel
    @EnvironmentObject var leaderboardVM: LeaderboardViewModel
    @State private var section: SquareSection = .square
    @State private var commentText: [String: String] = [:]

    let pink = Color(red: 1, green: 0.4, blue: 0.5)

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // ─── 胶囊切换 ─────────────────────────
                capsuleToggle
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)

                // ─── 内容区 ──────────────────────────
                if section == .square {
                    squareContent
                } else {
                    leaderboardContent
                }
            }
            .navigationTitle("广场")
            .overlay(alignment: .bottomTrailing) {
                if section == .square {
                    floatingAddButton
                }
            }
            .sheet(isPresented: $squareVM.showNewPost) {
                newPostSheet
            }
        }
    }

    // MARK: - Capsule Toggle
    private var capsuleToggle: some View {
        HStack(spacing: 0) {
            ForEach(SquareSection.allCases, id: \.self) { s in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { section = s }
                } label: {
                    Text(s.rawValue)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(section == s ? .white : .primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            section == s ? pink : Color.clear
                        )
                        .cornerRadius(20)
                }
            }
        }
        .padding(3)
        .background(Color(.systemGray6))
        .cornerRadius(22)
    }

    // MARK: - Square Content
    private var squareContent: some View {
        ScrollView {
            if squareVM.isLoading && squareVM.posts.isEmpty {
                ProgressView().padding(.top, 60)
            } else if squareVM.posts.isEmpty {
                emptySquare
            } else {
                LazyVStack(spacing: 16) {
                    ForEach(squareVM.posts) { post in
                        postCard(post)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
        }
        .refreshable { await squareVM.loadPosts() }
        .task { await squareVM.loadPosts() }
    }

    private var emptySquare: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundColor(Color(.systemGray4))
            Text("广场还没有动态")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("恋爱中的情侣可以发布甜蜜动态哦～")
                .font(.subheadline)
                .foregroundColor(Color(.systemGray3))
        }
        .padding(.top, 60)
    }

    // MARK: - Post Card
    private func postCard(_ post: CouplePost) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header: author + couple names
            HStack(spacing: 10) {
                Circle()
                    .fill(Color(red: 1, green: 0.92, blue: 0.95))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(String((post.author?.profile?.nickname ?? "?").prefix(1)))
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(pink)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    let nameA = post.match?.userA?.profile?.nickname ?? "?"
                    let nameB = post.match?.userB?.profile?.nickname ?? "?"
                    Text("\(nameA) & \(nameB)")
                        .font(.system(size: 14, weight: .semibold))
                    Text(post.createdAt.prefix(10))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }

            // Content
            Text(post.content)
                .font(.system(size: 15))
                .lineLimit(6)

            // Actions
            HStack(spacing: 24) {
                Button {
                    Task { await squareVM.likePost(post.id) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "heart")
                        Text("\(post.likeCount)")
                    }
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                }

                HStack(spacing: 4) {
                    Image(systemName: "bubble.right")
                    Text("\(post.commentCount)")
                }
                .font(.system(size: 13))
                .foregroundColor(.secondary)

                Spacer()
            }

            // Recent comments
            if let comments = post.comments, !comments.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(comments.prefix(3)) { c in
                        HStack(spacing: 4) {
                            Text(c.user?.profile?.nickname ?? "匿名")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(pink)
                            Text(c.content)
                                .font(.system(size: 12))
                                .foregroundColor(.primary)
                                .lineLimit(1)
                        }
                    }
                }
                .padding(8)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }

            // Comment input
            HStack(spacing: 8) {
                TextField("说点什么...", text: Binding(
                    get: { commentText[post.id] ?? "" },
                    set: { commentText[post.id] = $0 }
                ))
                .font(.system(size: 13))
                .textFieldStyle(.roundedBorder)

                Button {
                    let text = commentText[post.id] ?? ""
                    guard !text.isEmpty else { return }
                    Task {
                        await squareVM.addComment(postId: post.id, content: text)
                        commentText[post.id] = ""
                    }
                } label: {
                    Text("发送")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(pink)
                        .cornerRadius(14)
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(14)
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    // MARK: - Floating Add Button
    private var floatingAddButton: some View {
        Button {
            squareVM.showNewPost = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 56, height: 56)
                .background(pink)
                .clipShape(Circle())
                .shadow(color: pink.opacity(0.4), radius: 8, y: 4)
        }
        .padding(.trailing, 20)
        .padding(.bottom, 20)
    }

    // MARK: - New Post Sheet
    private var newPostSheet: some View {
        NavigationStack {
            VStack(spacing: 16) {
                TextEditor(text: $squareVM.newPostContent)
                    .frame(minHeight: 150)
                    .padding(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(.systemGray4), lineWidth: 1)
                    )

                // Image placeholder
                HStack {
                    Image(systemName: "photo.badge.plus")
                        .foregroundColor(.secondary)
                    Text("图片功能即将上线")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }

                if let err = squareVM.errorMessage {
                    Text(err).font(.caption).foregroundColor(.red)
                }

                Spacer()
            }
            .padding(20)
            .navigationTitle("发布动态")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { squareVM.showNewPost = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await squareVM.createPost() }
                    } label: {
                        if squareVM.isPosting {
                            ProgressView()
                        } else {
                            Text("发布").bold()
                        }
                    }
                    .disabled(squareVM.newPostContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || squareVM.isPosting)
                }
            }
        }
    }

    // MARK: - Leaderboard Content (embedded)
    private var leaderboardContent: some View {
        VStack(spacing: 0) {
            // Type selector (horizontal scroll)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(LeaderboardViewModel.LeaderboardTab.allCases, id: \.self) { tab in
                        Button {
                            leaderboardVM.selectedTab = tab
                            Task { await leaderboardVM.loadCurrent() }
                        } label: {
                            Text(tab.rawValue)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(leaderboardVM.selectedTab == tab ? .white : .primary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .background(leaderboardVM.selectedTab == tab ? pink : Color(.systemGray6))
                                .cornerRadius(16)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.vertical, 8)

            // List
            ScrollView {
                if leaderboardVM.isLoading {
                    ProgressView().padding(.top, 60)
                } else if leaderboardVM.entries.isEmpty {
                    emptyLeaderboard
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(leaderboardVM.entries) { entry in
                            leaderboardRow(entry)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                }
            }
            .refreshable { await leaderboardVM.loadCurrent() }
            .task { await leaderboardVM.loadCurrent() }
        }
    }

    private var emptyLeaderboard: some View {
        VStack(spacing: 16) {
            Image(systemName: "trophy")
                .font(.system(size: 48))
                .foregroundColor(Color(.systemGray4))
            Text("暂无数据")
                .font(.headline)
                .foregroundColor(.secondary)
        }
        .padding(.top, 60)
    }

    private func leaderboardRow(_ entry: LeaderboardEntry) -> some View {
        HStack(spacing: 14) {
            rankBadge(entry.rank)

            HStack(spacing: -8) {
                miniAvatar(entry.coupleA.nickname)
                miniAvatar(entry.coupleB.nickname)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("\(entry.coupleA.nickname) & \(entry.coupleB.nickname)")
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                if let school = entry.coupleA.school {
                    Text(school)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(entry.label ?? "\(entry.metric ?? 0)")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(pink)
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(14)
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private func rankBadge(_ rank: Int) -> some View {
        ZStack {
            if rank <= 3 {
                Circle()
                    .fill(rank == 1 ? Color.yellow : rank == 2 ? Color.gray : Color.orange)
                    .frame(width: 32, height: 32)
                Text("\(rank)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Text("\(rank)")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 32)
            }
        }
    }

    private func miniAvatar(_ name: String) -> some View {
        Circle()
            .fill(Color(red: 1, green: 0.92, blue: 0.95))
            .frame(width: 36, height: 36)
            .overlay(
                Text(String(name.prefix(1)))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(pink)
            )
            .overlay(Circle().stroke(Color.white, lineWidth: 2))
    }
}
