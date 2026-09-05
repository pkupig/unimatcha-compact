import SwiftUI

// MARK: - TextCard (`bentoTextCard` — official post without image, full width) — WP-08
//
// `card` bg, p-4 (16), 1 pt `outlineVariant/10` border, `shadow-sm`, radius 6.
//   header row (`mb-3`) with pinned + official/sponsored badges when any → title 18/700 tight `mb-2`
//   (only when the post HAS a title — no content excerpt fallback) → event strip → content 14
//   onSurfaceVariant leading-relaxed 4-line clamp `mb-2` → author row. No comment-snippet line.
// Pinned page: title 18 → 16, content 14 → 12.

struct TextCard: View {
    var post: SquarePostCard
    @Environment(\.squarePinnedPage) private var pinnedPage

    var body: some View {
        let badges = CardBadgeRow(post: post)
        Button {
            AppActions.shared.openPostDetail(post.id, false)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                if !badges.isEmpty {
                    badges
                        .padding(.bottom, 12)
                }
                if let title = post.headline {
                    Text(title)
                        .font(Theme.font(SquareCardScale.lg(pinnedPage), weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.tight, size: SquareCardScale.lg(pinnedPage)))
                        .foregroundColor(Theme.C.onSurface)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 8)
                }
                if post.isEvent, let event = post.event {
                    EventStrip(event: event)
                        .padding(.bottom, 4)
                }
                if !post.content.isEmpty {
                    Text(post.content)
                        .font(Theme.font(SquareCardScale.sm(pinnedPage)))
                        .lineSpacing(SquareCardScale.sm(pinnedPage) * 0.625)
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 8)
                }
                CardAuthorRow(post: post) {
                    Task { await SquareStore.shared.like(postId: post.id) }
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(post.cardTitle))
    }
}
