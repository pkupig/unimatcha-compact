import SwiftUI

// MARK: - CommentThreadView (`data-pd-comments` — h5-square.md §1.5 "Comments section") — WP-09
//
// `px-3 pt-5 pb-6` on the page ground. Heading 12/700 tracking .2em onSurfaceVariant, `mb-6`:
// "Observations" + " (N)" + the long-press hint (only when there are comments).
// Threads: 28 pt between top-level groups, 16 pt inside a group (parent + its replies).
// Empty: 28 pt `forum` glyph (outlineVariant) + "No observations yet. Share the first one."
// (14 outline, `mt-2`) in a `py-10` block.

struct CommentThreadView: View {
    var detail: SquarePostDetail
    var onReply: (String) -> Void
    var onLike: (String) -> Void
    var onOpenImage: (String) -> Void
    var onLongPress: (String, CGPoint) -> Void

    static let groupSpacing: CGFloat = 28
    static let inGroupSpacing: CGFloat = 16
    static let replyIndent: CGFloat = 44

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading
                .padding(.bottom, 24)

            if detail.comments.isEmpty {
                VStack(spacing: 0) {
                    Image(systemName: Theme.Icon.sf("forum"))
                        .font(.system(size: 28 * 0.82, weight: .light))
                        .frame(height: 28)
                        .foregroundColor(Theme.C.outlineVariantText)
                    Text(L10n.t("No observations yet. Share the first one."))
                        .font(Theme.font(14))
                        .foregroundColor(Theme.C.outline)
                        .padding(.top, 8)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            } else {
                VStack(alignment: .leading, spacing: Self.groupSpacing) {
                    ForEach(detail.comments) { cm in
                        VStack(alignment: .leading, spacing: Self.inGroupSpacing) {
                            CommentRow(comment: cm,
                                       isReply: false,
                                       isAuthor: detail.authorKey.isAuthor(cm),
                                       onReply: onReply,
                                       onLike: onLike,
                                       onOpenImage: onOpenImage,
                                       onLongPress: onLongPress)
                            ForEach(cm.replies) { reply in
                                CommentRow(comment: reply,
                                           isReply: true,
                                           isAuthor: detail.authorKey.isAuthor(reply),
                                           onReply: onReply,
                                           onLike: onLike,
                                           onOpenImage: onOpenImage,
                                           onLongPress: onLongPress)
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Space.postDetail)
        .padding(.top, 20)
        .padding(.bottom, 24)
        .background(Theme.C.surface)
    }

    /// "Observations" + " (N)" in 12/700 tracking .2em, then — only when there are comments — the
    /// hint in `font-normal tracking-normal text-outline`.
    private var heading: some View {
        let label = Text(L10n.t("Observations") + " (\(detail.commentTotal))")
            .font(Theme.font(12, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
            .foregroundColor(Theme.C.onSurfaceVariant)
        let hint = Text(detail.comments.isEmpty ? "" : " " + L10n.pick("· long-press for options", "· 长按更多操作"))
            .font(Theme.font(12))
            .foregroundColor(Theme.C.outline)
        return (label + hint)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - One comment row (`renderPdComment`)

struct CommentRow: View {
    var comment: SquareComment
    var isReply: Bool
    var isAuthor: Bool
    var onReply: (String) -> Void
    var onLike: (String) -> Void
    var onOpenImage: (String) -> Void
    var onLongPress: (String, CGPoint) -> Void

    private var avatarSize: CGFloat { isReply ? 28 : 32 }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            avatar
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(comment.displayName)
                        .font(Theme.font(13, weight: .bold))
                        .foregroundColor(Theme.C.onSurface)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if isAuthor { authorTag }
                    Spacer(minLength: 4)
                    Text(Formatters.relativeTime(comment.createdAt))
                        .font(Theme.font(10))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(1)
                        .layoutPriority(1)
                }

                if comment.hasContent {
                    Text(comment.content)
                        .font(Theme.font(14))
                        .foregroundColor(Theme.C.onSurface)
                        .lineSpacing(14 * 0.625)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)
                }

                if let img = comment.imageUrl, SafeURL.isSafe(img) {
                    Button {
                        onOpenImage(img)
                    } label: {
                        RemoteImage(url: img, contentMode: .fill)
                            .frame(width: 160, height: 160)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                    }
                    .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleWide))
                    .padding(.top, 8)
                }

                HStack(spacing: 16) {
                    Button {
                        onReply(comment.id)
                    } label: {
                        Text(L10n.t("Reply"))
                            .font(Theme.font(10, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                            .foregroundColor(Theme.C.outline)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleWide))

                    Button {
                        onLike(comment.id)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: Theme.Icon.sf("favorite", filled: comment.myLiked))
                                .font(.system(size: 15 * 0.82, weight: comment.myLiked ? .regular : .light))
                                .frame(width: 15, height: 15)
                            Text("\(max(0, comment.likeCount))")
                                .font(Theme.font(10, weight: .bold))
                        }
                        .foregroundColor(comment.myLiked ? Theme.C.neonPink : Theme.C.outline)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
                    .accessibilityLabel(Text(comment.myLiked ? L10n.pick("Unlike", "取消点赞") : L10n.pick("Like", "点赞")))

                    Spacer(minLength: 0)
                }
                .padding(.top, 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, isReply ? CommentThreadView.replyIndent : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Long-press (600 ms, cancels beyond 10 pt) opens the comment action card at the touch point.
        // It sits behind the row so Reply / Like keep their own taps (H5: "not on a button").
        .longPressPoint { point in
            onLongPress(comment.id, point)
        }
    }

    @ViewBuilder private var avatar: some View {
        if let seed = comment.aliasSeed {
            AliasAvatarView(seed: seed, size: avatarSize)
        } else if let url = comment.displayAvatarUrl, SafeURL.isSafe(url) {
            RemoteImage(url: url, contentMode: .fill)
                .frame(width: avatarSize, height: avatarSize)
                .clipShape(Circle())
        } else {
            ZStack {
                Circle().fill(Theme.C.container)
                Image(systemName: Theme.Icon.sf("person"))
                    .font(.system(size: 16 * 0.82, weight: .light))
                    .foregroundColor(Theme.C.outline)
            }
            .frame(width: avatarSize, height: avatarSize)
        }
    }

    /// 1×1 dot `primary/60` + "Author" / "作者" (10 pt, `primary/70`, medium).
    private var authorTag: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(Theme.C.primary.opacity(0.6))
                .frame(width: 4, height: 4)
            Text(L10n.pick("Author", "作者"))
                .font(Theme.font(10, weight: .medium))
                .foregroundColor(Theme.C.primary.opacity(0.7))
                .lineLimit(1)
        }
        .fixedSize()
    }
}
