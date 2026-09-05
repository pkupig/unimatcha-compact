import SwiftUI

// MARK: - LargeCard (`bentoLargeCard` — official post with image, full width) — WP-08
//
// `card` bg, radius 6, overflow hidden. Image block `aspect-[4/5]` on `container` (`object-cover`);
// top-left overlay (`top-4 left-4`, gap 6): pinned badge then official/sponsored badge.
// Body `px-3 pt-2 pb-2`: title 18/700 tight (rendered only when the post HAS a title — official
// cards never fall back to the content excerpt, and they carry no comment-snippet line) → event
// strip (event posts) → author row.
// Pinned page: title 18 → 16. Falls back to `TextCard` when there is no image (the dispatcher does that).

struct LargeCard: View {
    var post: SquarePostCard

    @Environment(\.squarePinnedPage) private var pinnedPage
    @State private var imageFailed = false

    static let mediaAspect: CGFloat = 4.0 / 5.0
    static let badgeInset: CGFloat = 16

    var body: some View {
        Button {
            AppActions.shared.openPostDetail(post.id, false)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .topLeading) {
                    Theme.C.container
                    if !imageFailed {
                        RemoteImage(url: post.firstImage, contentMode: .fill, placeholderColor: Theme.C.container,
                                    onFailure: { imageFailed = true })
                    }
                    CardBadgeRow(post: post)
                        .padding(LargeCard.badgeInset)
                }
                .aspectRatio(LargeCard.mediaAspect, contentMode: .fit)
                .clipped()
                VStack(alignment: .leading, spacing: 0) {
                    if let title = post.headline {
                        Text(title)
                            .font(Theme.font(SquareCardScale.lg(pinnedPage), weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.tight, size: SquareCardScale.lg(pinnedPage)))
                            .foregroundColor(Theme.C.onSurface)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if post.isEvent, let event = post.event {
                        EventStrip(event: event)
                    }
                    CardAuthorRow(post: post) {
                        Task { await SquareStore.shared.like(postId: post.id) }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .padding(.bottom, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous))
        }
        .buttonStyle(SquareCardPressStyle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(post.cardTitle))
    }
}
