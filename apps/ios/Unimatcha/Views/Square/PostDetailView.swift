import SwiftUI

/// Square v2 post detail — full content + images, like toggle, comment composer,
/// nested comments (one reply level), report menu, and delete when the post is mine.
struct PostDetailView: View {
    let postId: String

    @Environment(\.dismiss) private var dismiss

    @State private var detail: SquarePostDetail?
    @State private var isLoading = true
    @State private var errorMessage: String?

    // Like state (mirrors detail.myLiked / detail.likeCount so the button reacts instantly)
    @State private var liked = false
    @State private var likeCount = 0

    // Comment composer
    @State private var comments: [SquareComment] = []
    @State private var commentText = ""
    @State private var isSendingComment = false

    // Report
    @State private var showReport = false
    @State private var reportReason = ""

    // Delete
    @State private var showDeleteConfirm = false

    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView().tint(Theme.accent).padding(.top, 80)
            } else if let detail = detail {
                content(detail)
            } else if let errorMessage = errorMessage {
                errorState(errorMessage)
            }
        }
        .themedScreen()
        .navigationTitle("详情")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if detail != nil { composer }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button {
                        showReport = true
                    } label: {
                        Label("举报", systemImage: "flag")
                    }
                    if detail?.isMine == true {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Label("删除", systemImage: "trash")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis").foregroundColor(Theme.textPrimary)
                }
            }
        }
        .alert("举报该内容", isPresented: $showReport) {
            TextField("举报原因（可选）", text: $reportReason)
            Button("取消", role: .cancel) {}
            Button("提交举报") { Task { await submitReport() } }
        } message: {
            Text("我们会尽快核实处理。")
        }
        .alert("删除该动态？", isPresented: $showDeleteConfirm) {
            Button("取消", role: .cancel) {}
            Button("删除", role: .destructive) { Task { await deletePost() } }
        } message: {
            Text("删除后无法恢复。")
        }
        .task { await load() }
    }

    // MARK: - Content

    private func content(_ d: SquarePostDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            authorHeader(d)

            if let title = d.title, !title.isEmpty {
                Text(title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(Theme.textPrimary)
            }

            if let body = d.content, !body.isEmpty {
                Text(body)
                    .font(.system(size: 15))
                    .foregroundColor(Theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let images = d.images, !images.isEmpty {
                VStack(spacing: 10) {
                    ForEach(images, id: \.self) { urlString in
                        AsyncImage(url: URL(string: urlString)) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFit()
                            default:
                                Theme.surfaceHi.frame(height: 200)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    }
                }
            }

            likeBar

            Divider().overlay(Theme.outline)

            commentsSection
        }
        .padding(16)
    }

    private func authorHeader(_ d: SquarePostDetail) -> some View {
        let isAnon = d.anonymous == true
        let name = isAnon ? (d.anonymousAuthor?.nickname ?? "匿名同学")
                          : (d.authorUser?.profile?.nickname ?? "用户")
        let avatar = isAnon ? d.anonymousAuthor?.avatarUrl : d.authorUser?.profile?.avatarUrl

        return HStack(spacing: 12) {
            AsyncImage(url: URL(string: avatar ?? "")) { phase in
                switch phase {
                case .success(let image): image.resizable().scaledToFill()
                default:
                    Theme.surfaceHi.overlay(
                        Text(String(name.prefix(1)))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(Theme.accent)
                    )
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(Circle())
            .overlay(Circle().stroke(Theme.outline, lineWidth: 1))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    if d.isSponsored == true {
                        Text("推广")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Theme.warning)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Theme.warning.opacity(0.18))
                            .clipShape(Capsule())
                    }
                }
                HStack(spacing: 8) {
                    if let school = d.school, !school.isEmpty {
                        Text(school)
                    }
                    if let created = d.createdAt {
                        Text(String(created.prefix(10)))
                    }
                }
                .font(.system(size: 12))
                .foregroundColor(Theme.textMuted)
            }
            Spacer()
        }
    }

    private var likeBar: some View {
        HStack(spacing: 24) {
            Button {
                Task { await toggleLike() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: liked ? "heart.fill" : "heart")
                        .foregroundColor(liked ? Theme.accent : Theme.textSecondary)
                    Text("\(likeCount)")
                        .foregroundColor(Theme.textSecondary)
                }
                .font(.system(size: 15, weight: .medium))
            }
            .buttonStyle(.plain)

            HStack(spacing: 6) {
                Image(systemName: "bubble.right")
                Text("\(comments.count)")
            }
            .font(.system(size: 15, weight: .medium))
            .foregroundColor(Theme.textSecondary)

            Spacer()
        }
        .padding(.vertical, 4)
    }

    // MARK: - Comments

    private var commentsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("评论 \(comments.count)")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.textPrimary)

            if comments.isEmpty {
                Text("还没有评论，来说两句吧～")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textMuted)
                    .padding(.vertical, 8)
            } else {
                ForEach(comments) { comment in
                    commentRow(comment, isReply: false)
                    if let replies = comment.replies, !replies.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(replies) { reply in
                                commentRow(reply, isReply: true)
                            }
                        }
                        .padding(.leading, 42)
                    }
                }
            }
        }
    }

    private func commentRow(_ c: SquareComment, isReply: Bool) -> some View {
        let name = c.user?.profile?.nickname ?? "匿名"
        let avatar = c.user?.profile?.avatarUrl
        return HStack(alignment: .top, spacing: 10) {
            AsyncImage(url: URL(string: avatar ?? "")) { phase in
                switch phase {
                case .success(let image): image.resizable().scaledToFill()
                default:
                    Theme.surfaceHi.overlay(
                        Text(String(name.prefix(1)))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Theme.accent)
                    )
                }
            }
            .frame(width: isReply ? 28 : 32, height: isReply ? 28 : 32)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    if let created = c.createdAt {
                        Text(String(created.prefix(10)))
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textMuted)
                    }
                }
                if let content = c.content, !content.isEmpty {
                    Text(content)
                        .font(.system(size: 14))
                        .foregroundColor(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let img = c.imageUrl, let url = URL(string: img) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image): image.resizable().scaledToFit()
                        default: Theme.surfaceHi.frame(height: 120)
                        }
                    }
                    .frame(maxWidth: 160, alignment: .leading)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                }
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Composer

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("写下你的评论…", text: $commentText, axis: .vertical)
                .font(.system(size: 14))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1...4)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Theme.surfaceHi)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))

            Button {
                Task { await sendComment() }
            } label: {
                if isSendingComment {
                    ProgressView().tint(Theme.onAccent)
                        .frame(width: 20, height: 20)
                } else {
                    Image(systemName: "paperplane.fill")
                        .foregroundColor(canSend ? Theme.onAccent : Theme.textMuted)
                }
            }
            .frame(width: 42, height: 40)
            .background(canSend ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.outline))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
            .disabled(!canSend || isSendingComment)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.surfaceLo)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Theme.outline), alignment: .top)
    }

    private var canSend: Bool {
        !commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundColor(Theme.textMuted)
            Text(message)
                .font(.system(size: 14))
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
            Button("重试") { Task { await load() } }
                .buttonStyle(GhostButtonStyle())
                .frame(maxWidth: 160)
        }
        .padding(.top, 80)
        .padding(.horizontal, 40)
    }

    // MARK: - Actions

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let d = try await SquareService.post(id: postId)
            detail = d
            liked = d.myLiked ?? false
            likeCount = d.likeCount ?? 0
            comments = d.comments ?? []
        } catch let e as APIError {
            errorMessage = e.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func toggleLike() async {
        let baseLiked = liked
        let baseCount = likeCount
        // Optimistic update
        liked.toggle()
        likeCount = baseCount + (liked ? 1 : -1)
        do {
            let r = try await SquareService.like(id: postId)
            // Reconcile to the server's authoritative liked state relative to baseline.
            liked = r.liked
            likeCount = baseCount + (r.liked == baseLiked ? 0 : (r.liked ? 1 : -1))
        } catch {
            // Revert on failure
            liked = baseLiked
            likeCount = baseCount
        }
    }

    private func sendComment() async {
        let text = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        isSendingComment = true
        do {
            let new = try await SquareService.comment(postId: postId, content: text)
            comments.append(new)
            commentText = ""
        } catch let e as APIError {
            errorMessage = e.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSendingComment = false
    }

    private func submitReport() async {
        let reason = reportReason.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await SquareService.report(id: postId, reason: reason.isEmpty ? nil : reason)
        } catch {
            // silently ignore; report is best-effort
        }
        reportReason = ""
    }

    private func deletePost() async {
        do {
            try await SquareService.delete(id: postId)
            dismiss()
        } catch let e as APIError {
            errorMessage = e.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
