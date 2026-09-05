import SwiftUI

// MARK: - PostArticleView (`#pd-content` images + article — h5-square.md §1.5) — WP-09
//
// 1. Images: none → nothing; one → full-width `object-cover` on the `container` ground at its
//    natural aspect; several → a snap carousel of `aspect-[4/5]` slides with two 32 pt `black/40`
//    arrows (clamped to [0, last]) and a dot bar of 32×2 pt bars (`white` / `white/40`) at `bottom-6`.
// 2. Article `px-3 pt-5 pb-4` on the card ground: title 30/700 tracking-tighter leading-none mb-4;
//    content 18 light onSurfaceVariant leading-relaxed, newlines preserved; poll block; event block.
//    Action row `py-3 border-t mt-6`: like (20 pt heart, filled + pink when liked, count 12/700
//    tracking-tighter) and comment (20 pt bubble + total) in a `gap-8` group, relative time at the
//    far right (10 pt, tracking-widest).

struct PostArticleView: View {
    var detail: SquarePostDetail
    var onLike: () -> Void
    var onCommentCount: () -> Void
    var onVote: (Int) -> Void
    var onOpenImage: (String) -> Void
    var onEventPurchased: () -> Void

    private var post: SquarePostCard { detail.post }

    var body: some View {
        VStack(spacing: 0) {
            PostDetailImages(images: post.images, onOpen: onOpenImage)

            VStack(alignment: .leading, spacing: 0) {
                if let title = post.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
                    Text(title)
                        .font(Theme.font(30, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.tighter, size: 30))
                        .foregroundColor(Theme.C.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 16)
                }
                if !post.content.isEmpty {
                    Text(post.content)
                        .font(Theme.font(18, weight: .light))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineSpacing(18 * 0.625)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if post.hasPollOptions {
                    PollBlock(post: post, onVote: onVote)
                }
                if post.isEvent, let event = post.event {
                    // The block already carries the H5 `mt-6` (24 pt) top margin itself.
                    EventTicketBlock(event: event, onPurchased: onEventPurchased)
                }

                VStack(spacing: 0) {
                    Rectangle().fill(Theme.C.hairline20).frame(height: 1)
                    actionRow
                }
                .padding(.top, 24)
            }
            .padding(.horizontal, Theme.Space.postDetail)
            .padding(.top, 20)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
        }
    }

    private var actionRow: some View {
        HStack(spacing: 16) {
            HStack(spacing: 32) {
                Button(action: onLike) {
                    HStack(spacing: 8) {
                        Image(systemName: Theme.Icon.sf("favorite", filled: detail.isLiked))
                            .font(.system(size: 20 * 0.82, weight: detail.isLiked ? .regular : .light))
                            .frame(width: 20, height: 20)
                            .foregroundColor(detail.isLiked ? Theme.C.neonPink : Theme.C.onSurface)
                        Text("\(max(0, post.likeCount))")
                            .font(Theme.font(12, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.tighter, size: 12))
                            .foregroundColor(Theme.C.onSurface)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
                .accessibilityLabel(Text(detail.isLiked ? L10n.pick("Unlike", "取消点赞") : L10n.pick("Like", "点赞")))

                Button(action: onCommentCount) {
                    HStack(spacing: 8) {
                        Image(systemName: Theme.Icon.sf("chat_bubble"))
                            .font(.system(size: 20 * 0.82, weight: .light))
                            .frame(width: 20, height: 20)
                        Text("\(detail.commentTotal)")
                            .font(Theme.font(12, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.tighter, size: 12))
                    }
                    .foregroundColor(Theme.C.onSurface)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
                .accessibilityLabel(Text(L10n.t("Observations")))
            }
            Spacer(minLength: 0)
            Text(Formatters.relativeTime(post.createdAt))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .lineLimit(1)
        }
        .padding(.vertical, 12)
    }
}

// MARK: - Images (`renderPdImages`)

struct PostDetailImages: View {
    var images: [String]
    var onOpen: (String) -> Void

    @State private var index = 0

    var body: some View {
        let safe = images.filter { SafeURL.isSafe($0) }
        if safe.isEmpty {
            EmptyView()
        } else if safe.count == 1 {
            SingleDetailImage(url: safe[0], onOpen: onOpen)
        } else {
            ZStack(alignment: .bottom) {
                TabView(selection: $index) {
                    ForEach(Array(safe.enumerated()), id: \.offset) { pair in
                        RemoteImage(url: pair.element, contentMode: .fill)
                            .contentShape(Rectangle())
                            .onTapGesture { onOpen(pair.element) }
                            .tag(pair.offset)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                HStack {
                    carouselArrow("chevron_left") { index = max(0, index - 1) }
                    Spacer(minLength: 0)
                    carouselArrow("chevron_right") { index = min(safe.count - 1, index + 1) }
                }
                .padding(.horizontal, 8)
                .frame(maxHeight: .infinity)

                // `#pd-carousel-dots`: `flex gap-2` of 32×2 bars, white for the current slide.
                HStack(spacing: 8) {
                    ForEach(0..<safe.count, id: \.self) { i in
                        Rectangle()
                            .fill(i == index ? Color.white : Color.white.opacity(0.4))
                            .frame(width: 32, height: 2)
                    }
                }
                .padding(.bottom, 24)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(4.0 / 5.0, contentMode: .fit)
            .background(Theme.C.container)
            .clipped()
            .animation(Theme.Motion.snap, value: index)
        }
    }

    private func carouselArrow(_ material: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: Theme.Icon.sf(material))
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(Color.black.opacity(0.4))
                .contentShape(Rectangle())
        }
        .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
    }
}

/// One image at its natural aspect (`w-full object-cover` with automatic height), 4:5 until loaded.
struct SingleDetailImage: View {
    var url: String
    var onOpen: (String) -> Void

    /// width / height (`aspectRatio` convention); 4:5 is the pre-load placeholder shape.
    @State private var aspect: CGFloat = 4.0 / 5.0

    var body: some View {
        RemoteImage(url: url, contentMode: .fill, onSuccess: { size in
            guard size.width > 0, size.height > 0 else { return }
            let a = size.width / size.height
            if abs(a - aspect) > 0.01 { aspect = a }
        })
        .frame(maxWidth: .infinity)
        .aspectRatio(aspect, contentMode: .fit)
        .background(Theme.C.container)
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture { onOpen(url) }
    }
}
