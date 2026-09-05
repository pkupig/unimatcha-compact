import SwiftUI

// MARK: - WideCard (`bentoWideCard` — campus-wall card, full width) — WP-08
//
// `card` bg, p-4 (16), 1 pt `outlineVariant/10` border, `shadow-sm`, radius 6.
//   header `flex items-center gap-3 mb-4`: 40 avatar(s) (couple-stacked aware) · name 16/700 truncate +
//     relative time 10 neutral-400 medium widest · PINNED badge right
//   image: first only, 16:9 `object-cover` radius 6 `mb-2`, hidden on error
//   title 16/700 tight `mb-1` (only when present) · content 14 onSurfaceVariant relaxed 3-line `mb-1` ·
//   comment snippet · 12 pt spacer · poll block · action row: comment count (→ detail + composer) | like.
// Pinned page: title/name 16 → 13, body 14 → 12.

struct WideCard: View {
    var post: SquarePostCard

    @Environment(\.squarePinnedPage) private var pinnedPage
    @State private var imageFailed = false

    static let imageAspect: CGFloat = 16.0 / 9.0

    var body: some View {
        let d = AuthorDisplay.of(post)
        Button {
            AppActions.shared.openPostDetail(post.id, false)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    AuthorAvatars(post: post)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(d.name)
                            .font(Theme.font(SquareCardScale.base(pinnedPage), weight: .bold))
                            .foregroundColor(Theme.C.onSurface)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        Text(Formatters.relativeTime(post.createdAt))
                            .font(Theme.font(10, weight: .medium))
                            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                            .foregroundColor(Theme.C.neutral400)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    PinnedBadgeIfNeeded(post: post)
                }
                .padding(.bottom, 16)

                if let img = post.firstImage, !imageFailed {
                    ZStack {
                        Theme.C.container
                        RemoteImage(url: img, contentMode: .fill, placeholderColor: Theme.C.container,
                                    onFailure: { imageFailed = true })
                    }
                    .aspectRatio(WideCard.imageAspect, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous))
                    .padding(.bottom, 8)
                }

                if let title = post.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
                    Text(title)
                        .font(Theme.font(SquareCardScale.base(pinnedPage), weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.tight, size: SquareCardScale.base(pinnedPage)))
                        .foregroundColor(Theme.C.onSurface)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 4)
                }

                Text(post.content)
                    .font(Theme.font(SquareCardScale.sm(pinnedPage)))
                    .lineSpacing(SquareCardScale.sm(pinnedPage) * 0.625)
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 4)

                if let snippet = post.commentSnippet, !snippet.isEmpty {
                    CommentSnippetLine(snippet: snippet)
                }

                Color.clear.frame(height: 12)

                if post.hasPollOptions {
                    PollBlock(post: post) { index in
                        Task { await SquareStore.shared.vote(postId: post.id, optionIndex: index) }
                    }
                }

                HStack(spacing: 0) {
                    CommentCountButton(count: post.commentCount) {
                        AppActions.shared.openPostDetail(post.id, true)
                    }
                    Spacer(minLength: 8)
                    LikeButton(liked: post.myLiked == true, count: post.likeCount) {
                        Task { await SquareStore.shared.like(postId: post.id) }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous)
                    .stroke(Theme.C.outlineVariant.opacity(0.10), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 1)
            .contentShape(RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous))
        }
        .buttonStyle(SquareCardPressStyle())
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(post.cardTitle))
    }
}
