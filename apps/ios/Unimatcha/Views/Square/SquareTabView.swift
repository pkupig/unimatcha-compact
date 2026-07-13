import SwiftUI

/// Square v2 feed — top segmented board switch (推荐 / 校园墙), infinite-scroll card feed.
/// Cards tap into PostDetailView; like inline; toolbar + composes a new post.
struct SquareTabView: View {
    @EnvironmentObject var squareVM: SquareViewModel
    @EnvironmentObject var authVM: AuthViewModel

    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                boardPicker
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                feed
            }
            .themedScreen()
            .navigationTitle("广场")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .foregroundColor(Theme.accent)
                    }
                }
            }
            .navigationDestination(for: String.self) { postId in
                PostDetailView(postId: postId)
            }
            .sheet(isPresented: $showCreate) {
                CreatePostView(board: squareVM.board) {
                    Task { await squareVM.reload() }
                }
            }
            .task {
                if squareVM.cards.isEmpty { await squareVM.reload() }
            }
        }
        .tint(Theme.accent)
    }

    // MARK: - Board picker (推荐 / 校园墙)

    private var boardPicker: some View {
        HStack(spacing: 6) {
            ForEach(SquareBoard.allCases) { b in
                Button {
                    guard squareVM.board != b else { return }
                    Task { await squareVM.switchBoard(b) }
                } label: {
                    Text(b.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(squareVM.board == b ? Theme.onAccent : Theme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            squareVM.board == b
                                ? AnyShapeStyle(Theme.accentGradient)
                                : AnyShapeStyle(Color.clear)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Theme.surfaceLo)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
    }

    // MARK: - Feed

    @ViewBuilder
    private var feed: some View {
        if squareVM.board == .campusWall && squareVM.needProfileSchool {
            needSchoolEmptyState
        } else if squareVM.cards.isEmpty && squareVM.isLoading {
            VStack {
                Spacer()
                ProgressView().tint(Theme.accent)
                Spacer()
            }
            .frame(maxWidth: .infinity)
        } else if squareVM.cards.isEmpty {
            emptyState
        } else {
            ScrollView {
                LazyVStack(spacing: 14) {
                    ForEach(squareVM.cards) { card in
                        NavigationLink(value: card.id) {
                            SquareCardRow(card: card) {
                                Task { await squareVM.like(card.id) }
                            }
                        }
                        .buttonStyle(.plain)
                        .onAppear {
                            if card.id == squareVM.cards.last?.id {
                                Task { await squareVM.loadMore() }
                            }
                        }
                    }

                    if squareVM.isLoading {
                        ProgressView()
                            .tint(Theme.accent)
                            .padding(.vertical, 12)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .refreshable { await squareVM.reload() }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "square.grid.2x2")
                .font(.system(size: 44))
                .foregroundColor(Theme.textMuted)
            Text("这里还没有内容")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.textSecondary)
            Text("发布第一条动态，点亮广场吧～")
                .font(.system(size: 13))
                .foregroundColor(Theme.textMuted)
            Button("发布动态") { showCreate = true }
                .buttonStyle(NeonButtonStyle())
                .frame(maxWidth: 200)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 40)
    }

    private var needSchoolEmptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "graduationcap")
                .font(.system(size: 44))
                .foregroundColor(Theme.textMuted)
            Text("完善学校信息后可见校园墙")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.textSecondary)
            Text("校园墙只对同校同学开放，先在「我的」里填写你的学校吧。")
                .font(.system(size: 13))
                .foregroundColor(Theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 40)
    }
}

// MARK: - Feed card row

private struct SquareCardRow: View {
    let card: SquareCard
    let onLike: () -> Void

    private var authorName: String {
        if card.anonymous == true {
            return card.anonymousAuthor?.nickname ?? "匿名同学"
        }
        return card.authorUser?.profile?.nickname ?? "用户"
    }

    private var authorAvatar: String? {
        if card.anonymous == true { return card.anonymousAuthor?.avatarUrl }
        return card.authorUser?.profile?.avatarUrl
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                header

                if let title = card.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(Theme.textPrimary)
                        .lineLimit(2)
                }

                if let content = card.content, !content.isEmpty {
                    Text(content)
                        .font(.system(size: 14))
                        .foregroundColor(Theme.textSecondary)
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                }

                if let images = card.images, !images.isEmpty {
                    imageStrip(images)
                }

                if let tags = card.tags, !tags.isEmpty {
                    tagRow(tags)
                }

                footer
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            avatar

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(authorName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    if card.isSponsored == true {
                        badge("推广", fill: Theme.warning.opacity(0.18), fg: Theme.warning)
                    }
                    if card.sameSchool == true {
                        badge("同校", fill: Theme.accent.opacity(0.15), fg: Theme.accent)
                    }
                }
                if let school = card.school, !school.isEmpty {
                    Text(school)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textMuted)
                        .lineLimit(1)
                }
            }
            Spacer()

            if let created = card.createdAt {
                Text(String(created.prefix(10)))
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textMuted)
            }
        }
    }

    private var avatar: some View {
        AsyncImage(url: URL(string: authorAvatar ?? "")) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                Theme.surfaceHi.overlay(
                    Text(String(authorName.prefix(1)))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Theme.accent)
                )
            }
        }
        .frame(width: 38, height: 38)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.outline, lineWidth: 1))
    }

    private func imageStrip(_ images: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(images.prefix(6), id: \.self) { urlString in
                    AsyncImage(url: URL(string: urlString)) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            Theme.surfaceHi
                        }
                    }
                    .frame(width: 120, height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                }
            }
        }
    }

    private func tagRow(_ tags: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    Text("#\(tag)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.accent.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 20) {
            Button(action: onLike) {
                HStack(spacing: 5) {
                    Image(systemName: "heart")
                    Text("\(card.likeCount ?? 0)")
                }
                .font(.system(size: 13))
                .foregroundColor(Theme.textSecondary)
            }
            .buttonStyle(.plain)

            HStack(spacing: 5) {
                Image(systemName: "bubble.right")
                Text("\(card.commentCount ?? 0)")
            }
            .font(.system(size: 13))
            .foregroundColor(Theme.textSecondary)

            Spacer()
        }
        .padding(.top, 2)
    }

    private func badge(_ text: String, fill: Color, fg: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(fg)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(fill)
            .clipShape(Capsule())
    }
}
