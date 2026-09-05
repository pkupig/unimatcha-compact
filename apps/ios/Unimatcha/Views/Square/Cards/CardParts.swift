import SwiftUI

// MARK: - Shared card pieces (h5-square.md §1.3 "Common pieces", h5-design-system.md §8.19) — WP-08
//
// Environment: `\.squareBoard` (which page renders the card — decides small vs wide for user posts)
// and `\.squarePinnedPage` (`.square-pinned-page` scope: PINNED badge hidden, fonts one step smaller:
// 18→16, 16→13, 14→12, 13→11).

struct SquareBoardEnvironmentKey: EnvironmentKey {
    static let defaultValue: SquareBoardKind = .recommend
}

struct SquarePinnedPageEnvironmentKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    var squareBoard: SquareBoardKind {
        get { self[SquareBoardEnvironmentKey.self] }
        set { self[SquareBoardEnvironmentKey.self] = newValue }
    }
    var squarePinnedPage: Bool {
        get { self[SquarePinnedPageEnvironmentKey.self] }
        set { self[SquarePinnedPageEnvironmentKey.self] = newValue }
    }
}

/// Font-size step-down table for the pinned page (`.text-lg`→16, `.text-base`→13, `.text-sm`→12, `.text-[13px]`→11).
enum SquareCardScale {
    static func lg(_ pinned: Bool) -> CGFloat { pinned ? 16 : 18 }
    static func base(_ pinned: Bool) -> CGFloat { pinned ? 13 : 16 }
    static func sm(_ pinned: Bool) -> CGFloat { pinned ? 12 : 14 }
    static func smallTitle(_ pinned: Bool) -> CGFloat { pinned ? 11 : 13 }
}

/// Column / page widths shared by the estimators (page = screen − 2 × 6 outer padding; column = (page − 6) / 2).
enum SquareCardMetrics {
    static let outerPadding: CGFloat = 6
    static let gap: CGFloat = 6
    static let cardRadius: CGFloat = Theme.R.feed

    static var pageWidth: CGFloat {
        let w = UIScreen.main.bounds.width
        return max(0, (w > 0 ? w : 375) - 2 * outerPadding)
    }

    static var columnWidth: CGFloat { max(0, (pageWidth - gap) / 2) }
}

// MARK: - Press feedback

/// Whole-card tap feedback (`cursor-pointer` cards get the shared card press scale on touch).
struct SquareCardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? Theme.Motion.pressScaleCard : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}

/// `active:scale-95` on inline buttons (like / comment count).
struct SquareInlinePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? Theme.Motion.pressScaleIcon : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}

// MARK: - Avatars (`avatarChip` / `renderAuthorAvatars`)

/// One author avatar: anonymous with seed → alias emoji; anonymous without seed → grey `person`;
/// URL → round image; else black circle with white initials (first 2 chars).
struct PostAvatar: View {
    var display: AuthorDisplay
    var size: CGFloat

    var body: some View {
        if display.isAnonymous {
            AliasAvatarView(seed: display.seed, size: size)
        } else {
            AvatarView(url: display.avatarUrl, name: display.name, size: size, fallback: .feed)
        }
    }
}

/// 40×40 slot: couple posts (`match.userA` + `userB`, not anonymous) stack a 36 avatar with a 24 one
/// (2 pt card-colour ring) overlapping bottom-right; otherwise a single 40 avatar.
struct AuthorAvatars: View {
    var post: SquarePostCard

    var body: some View {
        if post.isCouplePost {
            let a = post.match?.userA?.profile
            let b = post.match?.userB?.profile
            CoupleAvatarStack(primaryUrl: a?.avatarUrl, primaryName: a?.nickname,
                              secondaryUrl: b?.avatarUrl, secondaryName: b?.nickname, size: 36)
                .frame(width: 40, height: 40, alignment: .topLeading)
        } else {
            PostAvatar(display: AuthorDisplay.of(post), size: 40)
        }
    }
}

// MARK: - Like button (`postLikeButton`)

/// `favorite` 14 pt (filled + pink when liked) + count 12/700. Stops propagation to the card.
struct LikeButton: View {
    var liked: Bool
    var count: Int
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 4) {
                Image(systemName: Theme.Icon.sf("favorite", filled: liked))
                    .font(.system(size: 14 * 0.82, weight: liked ? .regular : .light))
                    .frame(width: 14, height: 14)
                Text("\(max(0, count))")
                    .font(Theme.font(12, weight: .bold))
            }
            .foregroundColor(liked ? Theme.C.neonPink : Theme.C.neutral400)
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(SquareInlinePressStyle())
        .accessibilityLabel(Text(liked ? L10n.t("Unlike") : L10n.t("Like")))
    }
}

/// Wide-card comment count (`chat_bubble` 14 + count 12/700, neutral-400) → detail with the composer focused.
struct CommentCountButton: View {
    var count: Int
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 4) {
                Image(systemName: Theme.Icon.sf("chat_bubble"))
                    .font(.system(size: 14 * 0.82, weight: .light))
                    .frame(width: 14, height: 14)
                Text("\(max(0, count))")
                    .font(Theme.font(12, weight: .bold))
            }
            .foregroundColor(Theme.C.neutral400)
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(SquareInlinePressStyle())
        .accessibilityLabel(Text(L10n.t("Observations")))
    }
}

// MARK: - Author row (`cardAuthorRow`)

/// `flex justify-between mt-1.5`: 16 avatar + name (11 neutral-400 truncate) | like button.
struct CardAuthorRow: View {
    var post: SquarePostCard
    var onLike: () -> Void

    var body: some View {
        let d = AuthorDisplay.of(post)
        HStack(spacing: 0) {
            HStack(spacing: 6) {
                PostAvatar(display: d, size: 16)
                Text(d.name)
                    .font(Theme.font(11))
                    .foregroundColor(Theme.C.neutral400)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            LikeButton(liked: post.myLiked == true, count: post.likeCount, onTap: onLike)
        }
        .padding(.top, 6)
    }
}

// MARK: - Badges

/// PINNED badge (hidden on the pinned page — the whole page is pinned posts).
struct PinnedBadgeIfNeeded: View {
    var post: SquarePostCard
    @Environment(\.squarePinnedPage) private var pinnedPage

    var body: some View {
        if post.isPinned && !pinnedPage {
            Badge.pinned
        }
    }
}

/// Official / Sponsored badge for non-USER posts.
struct OfficialBadgeIfAny: View {
    var post: SquarePostCard

    var body: some View {
        if post.showsSponsoredBadge {
            Badge.sponsored
        } else if let text = post.officialBadgeText {
            Badge.official(text)
        }
    }
}

/// `gap-1.5` row: pinned then official/sponsored (large card overlay, text card header).
struct CardBadgeRow: View {
    var post: SquarePostCard
    @Environment(\.squarePinnedPage) private var pinnedPage

    var isEmpty: Bool {
        !(post.isPinned && !pinnedPage) && !post.isOfficial
    }

    var body: some View {
        HStack(spacing: 6) {
            PinnedBadgeIfNeeded(post: post)
            OfficialBadgeIfAny(post: post)
        }
    }
}

// MARK: - Comment snippet (search results only)

/// `text-[11px] text-outline leading-snug mt-1 pl-2 border-l-2 border-neon/60` 2-line clamp;
/// "COMMENT" label 9/700 tracking .15em (translatable) + the snippet (user content).
struct CommentSnippetLine: View {
    var snippet: String

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Rectangle()
                .fill(Theme.C.neon.opacity(0.6))
                .frame(width: 2)
            (Text(L10n.t("COMMENT") + " ")
                .font(Theme.font(9, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.label, size: 9))
             + Text(snippet)
                .font(Theme.font(11)))
                .foregroundColor(Theme.C.outline)
                .lineSpacing(11 * 0.375)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .padding(.leading, 8)
        }
        .padding(.top, 4)
    }
}

// MARK: - Card dispatcher + height estimates

/// Renders one feed entry with the H5 `kindOf` rule for the page it sits on.
struct SquareCardView: View {
    var item: SquareFeedItem
    @Environment(\.squareBoard) private var board

    var body: some View {
        switch item {
        case .ad(let ad):
            AdCardView(ad: ad)
        case .post(let post):
            switch post.kind(on: board) {
            case .small: SmallCard(post: post)
            case .wide: WideCard(post: post)
            case .large: LargeCard(post: post)
            case .text: TextCard(post: post)
            }
        }
    }
}

/// Pre-measurement heights for `MasonryItem` (the grid re-lays out once real heights arrive).
enum SquareCardEstimator {
    static func height(for item: SquareFeedItem, board: SquareBoardKind, pinnedPage: Bool) -> CGFloat {
        let full = SquareCardMetrics.pageWidth
        let col = SquareCardMetrics.columnWidth
        switch item {
        case .ad(let ad):
            return AdCardView.estimatedHeight(for: ad, width: full)
        case .post(let post):
            switch post.kind(on: board) {
            case .small:
                let media: CGFloat = post.hasImage ? 110 : col * 4 / 3
                return media + 8 + 2 * SquareCardScale.smallTitle(pinnedPage) * 1.375 + 6 + 16 + 10
            case .wide:
                var h: CGFloat = 16 + 40 + 16
                if post.hasImage { h += full * 9 / 16 + 8 }
                if post.title != nil { h += SquareCardScale.base(pinnedPage) * 1.25 + 4 }
                h += 3 * SquareCardScale.sm(pinnedPage) * 1.625 + 4 + 12
                if post.hasPollOptions { h += CGFloat((post.pollOptions ?? []).count) * 44 + 24 + 20 }
                h += 20 + 16
                return h
            case .large:
                let title: CGFloat = post.headline != nil ? SquareCardScale.lg(pinnedPage) * 1.25 : 0
                return full * 5 / 4 + 8 + title + (post.isEvent ? 26 : 0) + 6 + 16 + 8
            case .text:
                let title: CGFloat = post.headline != nil ? SquareCardScale.lg(pinnedPage) * 1.25 + 8 : 0
                let badges: CGFloat = (post.isPinned && !pinnedPage) || post.isOfficial ? 22 : 0
                let body: CGFloat = post.content.isEmpty ? 0 : 4 * SquareCardScale.sm(pinnedPage) * 1.625 + 8
                return 16 + badges + title + body + 22 + 16
            }
        }
    }

    static func masonryItem(for item: SquareFeedItem, board: SquareBoardKind, pinnedPage: Bool) -> MasonryItem {
        let full: Bool
        switch item {
        case .ad: full = true
        case .post(let p): full = p.kind(on: board).isFullWidth
        }
        return MasonryItem(id: item.id, fullWidth: full, estimatedHeight: height(for: item, board: board, pinnedPage: pinnedPage))
    }
}
