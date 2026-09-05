import SwiftUI

// MARK: - PostDetailView (`#post-detail-overlay` — h5-square.md §1.5, §2 "Post detail"; PLAN §C.6) — WP-09
//
// Three-part page (overlay id `post-detail`, `.fullPage`, swipe-back): the header and the composer
// are absolutely positioned and slide away on scroll-down, the scroll area is padded by
// `64 + top inset` and by the measured composer height (H5 `--pd-footer-h`, default 76).
//
// Presentation is `PostDetailView.present(postId:focusComposer:)` — WP-16 wires
// `AppActions.openPostDetail` to it; the feed cards (WP-08) reach it through that action.

struct PostDetailView: View {
    @ObservedObject private var vm = PostDetailViewModel.shared
    @Environment(\.overlaySafeInsets) private var envInsets

    @State private var footerHeight: CGFloat = PostDetailViewModel.defaultFooterHeight

    static let scrollId = "post-detail"
    static let commentsAnchor = "pd-comments"

    // MARK: Presentation

    /// `openPostDetail(postId, focusComposer?)`: reset per-post state, present, load, then focus.
    @MainActor
    static func present(postId: String, focusComposer: Bool = false) {
        PostDetailViewModel.shared.open(postId: postId, focusComposer: focusComposer)
        OverlayRouter.shared.present(AppOverlay(
            id: PostDetailViewModel.overlayId,
            style: .fullPage,
            swipeBack: true,
            onDismiss: { PostDetailViewModel.shared.close() }
        ) {
            PostDetailView()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: PostDetailViewModel.overlayId)
    }

    // MARK: Body

    var body: some View {
        let safeTop = OverlayChrome.resolvedInsets(envInsets).top
        let barHeight = Theme.Bar.overlay + safeTop
        ZStack(alignment: .top) {
            Theme.C.surface.ignoresSafeArea()

            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        content
                    }
                    .padding(.top, barHeight)
                    .padding(.bottom, footerHeight)
                    .frame(maxWidth: .infinity, alignment: .top)
                }
                .reportScrollOffset(id: Self.scrollId)
                .onPreferenceChange(ScrollOffsetKey.self) { offsets in
                    vm.onScroll(offsets[Self.scrollId] ?? 0)
                }
                .onChange(of: vm.scrollToCommentsSignal) { _ in
                    withAnimation(Theme.Motion.snap) {
                        proxy.scrollTo(Self.commentsAnchor, anchor: .top)
                    }
                }
            }

            PostDetailHeader(detail: vm.detail,
                             safeTop: safeTop,
                             onBack: { PostDetailView.dismiss() },
                             onMore: { frame in
                                 vm.moreButtonFrame = frame
                                 PostActionMenus.presentPostMenu(anchorFrame: frame)
                             })
                .offset(y: vm.chromeHidden ? -barHeight : 0)
                .opacity(vm.chromeHidden ? 0 : 1)
                .allowsHitTesting(!vm.chromeHidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .bottom) {
            CommentComposer(vm: vm) { h in
                if h > 0, abs(h - footerHeight) > 0.5 { footerHeight = h }
            }
            .offset(y: vm.chromeHidden ? footerHeight : 0)
        }
    }

    @ViewBuilder private var content: some View {
        if let detail = vm.detail {
            PostArticleView(detail: detail,
                            onLike: { vm.likePost() },
                            onCommentCount: { vm.focusComposer() },
                            onVote: { vm.vote(optionIndex: $0) },
                            onOpenImage: { AppActions.shared.openImageViewer($0) },
                            onEventPurchased: { Task { await vm.load() } })

            CommentThreadView(detail: detail,
                              onReply: { vm.setReply(commentId: $0) },
                              onLike: { vm.likeComment(id: $0) },
                              onOpenImage: { AppActions.shared.openImageViewer($0) },
                              onLongPress: { id, point in
                                  let liked = detail.comment(id: id)?.myLiked ?? false
                                  PostActionMenus.presentCommentMenu(commentId: id, at: point, liked: liked)
                              })
                .id(Self.commentsAnchor)
        } else if vm.loadFailed {
            EmptyState(material: "cloud_off",
                       title: L10n.pick("Failed to load post", "帖子加载失败"),
                       subtitle: L10n.t("Check your connection and try again"),
                       action: (L10n.t("Retry"), { vm.retry() }),
                       bottomPadding: 96)
        } else {
            // No spinner (H5 parity): the page stays blank until the payload arrives.
            Color.clear.frame(height: 1)
        }
    }
}
