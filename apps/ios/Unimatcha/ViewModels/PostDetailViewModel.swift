import Foundation
import Combine
import SwiftUI

// MARK: - PostDetailViewModel (h5-square.md §1.5, §2 "Post detail", §3 #5–#11; PLAN §C.6) — WP-09
//
// One detail is open at a time (H5 keeps `S.currentPostId` / `S.pdPostData` global), so this is a
// shared instance the overlay content binds to and `OverlayRouter`'s `onDismiss` closes.
//
// Ported behaviour, in H5 order:
//   open(postId:focusComposer:)  reset anon → clear pending image → clear header author → show chrome
//                                → present overlay → load → optionally focus the composer
//   load()                       GET detail → render → push authoritative counts back to the caches
//                                (`SquareStore.applyCounts`); failure toasts "Failed to load post"
//   likePost()                   POST first, then ±1 (or the server count) → `SquareStore.applyLike`
//   likeComment(id:)             POST → patch the tree in place (no re-render, scroll preserved)
//   send()                       text OR image required; guard; upload deferred to this moment;
//                                success → clear draft, anon off, image cleared, reply cancelled,
//                                reload detail; failure → restore the whole snapshot + "Failed: …"
//   vote(index:)                 → `SquareStore.vote` (approved polls only) → caches + this view
//   report flows                 two-step confirm → reason prompt (copy verbatim, bilingual)

@MainActor
final class PostDetailViewModel: ObservableObject {
    static let shared = PostDetailViewModel()

    // MARK: Published state

    @Published private(set) var postId: String?
    @Published private(set) var detail: SquarePostDetail?
    @Published private(set) var loading = false
    @Published private(set) var loadFailed = false

    /// Composer draft (kept when the reply target is cancelled, restored when a send fails).
    @Published var draft: String = ""
    /// Per-comment anonymity — default off, reset after every send and on every new post (gotcha 2).
    @Published private(set) var anonymous = false
    /// Locally picked comment image; uploaded only at send time (gotcha 4).
    @Published private(set) var pendingImage: PickedPhoto?
    /// `{id: topLevelCommentId, nickname}` — the API only supports two levels (gotcha 3).
    @Published private(set) var replyTo: ReplyTarget?
    @Published private(set) var sending = false

    /// Header + footer slide away on scroll-down and come back on scroll-up / near top / focus.
    @Published var chromeHidden = false
    /// Bumped to request composer focus (comment-count tap, `focusComposer` on open).
    @Published private(set) var focusComposerSignal = 0
    /// Bumped to scroll the comments heading into view.
    @Published private(set) var scrollToCommentsSignal = 0
    /// Screen-space frame of the header "more" button (post action menu anchor).
    @Published var moreButtonFrame: CGRect = .zero

    struct ReplyTarget: Equatable {
        var id: String              // top-level comment id sent as `parentCommentId`
        var nickname: String        // the tapped comment's display name (alias for anonymous — D17)
    }

    // MARK: Private

    /// Discards results of a load that belongs to a post the user has already left (A9 guard).
    private var generation = 0
    private var likeInFlight = false
    private var commentLikesInFlight: Set<String> = []
    private var cancellables: Set<AnyCancellable> = []

    static let overlayId = "post-detail"
    /// H5 `--pd-footer-h` default before the footer is measured.
    static let defaultFooterHeight: CGFloat = 76
    /// Chrome auto-hide thresholds (`bindPdChromeAutoHide`).
    static let chromeHideDelta: CGFloat = 6
    static let chromeAlwaysShowBelow: CGFloat = 40

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.reset() }
            .store(in: &cancellables)

        // Keep the open detail in sync with likes/votes/counts applied elsewhere (feed cards).
        SquareStore.shared.$lastMutation
            .compactMap { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] m in self?.apply(mutation: m) }
            .store(in: &cancellables)
    }

    // MARK: Lifecycle

    /// `openPostDetail(postId, focusComposer?)`.
    func open(postId id: String, focusComposer: Bool = false) {
        let switchingPost = postId != id
        postId = id
        if switchingPost { detail = nil }
        // H5 `openPostDetail` resets these on EVERY open (not only when the post changes): the
        // anonymity choice and the pending image must never follow the user to another post.
        // The typed draft is deliberately kept (H5 leaves the input's value alone).
        anonymous = false
        pendingImage = nil
        replyTo = nil
        loadFailed = false
        chromeHidden = false           // every open starts expanded
        lastScrollY = 0
        Task { [weak self] in
            await self?.load()
            guard let self = self, self.postId == id, focusComposer else { return }
            self.focusComposer()
        }
    }

    /// `closePostDetail`: clear the current post and the reply target; the draft survives.
    func close() {
        generation &+= 1
        postId = nil
        replyTo = nil
        chromeHidden = false
        lastScrollY = 0
        moreButtonFrame = .zero
    }

    /// `cleanupUserState` — clears everything H5 forgets too (`pdAnon`, `pdImageFile`, `pdSending`).
    func reset() {
        generation &+= 1
        postId = nil
        detail = nil
        loading = false
        loadFailed = false
        draft = ""
        anonymous = false
        pendingImage = nil
        replyTo = nil
        sending = false
        chromeHidden = false
        lastScrollY = 0
        likeInFlight = false
        commentLikesInFlight = []
        moreButtonFrame = .zero
    }

    // MARK: Load

    func load() async {
        guard let id = postId else { return }
        generation &+= 1
        let gen = generation
        loading = true
        defer { if generation == gen { loading = false } }
        do {
            let d = try await SquareDetailService.detail(postId: id)
            guard generation == gen, postId == id else { return }
            detail = d
            loadFailed = false
            // Push the authoritative counts back into every cached list card (A12/A14).
            SquareStore.shared.applyCounts(postId: d.post.id,
                                           likeCount: d.post.likeCount,
                                           commentCount: d.commentTotal,
                                           myLiked: d.post.myLiked == true)
        } catch {
            guard generation == gen, postId == id else { return }
            if detail == nil { loadFailed = true }
            ToastCenter.shared.show(L10n.pick("Failed to load post", "帖子加载失败"))
        }
    }

    func retry() {
        Task { await load() }
    }

    // MARK: Chrome auto-hide (`bindPdChromeAutoHide`)

    private var lastScrollY: CGFloat = 0

    func onScroll(_ y: CGFloat) {
        let dy = y - lastScrollY
        lastScrollY = y
        if y < Self.chromeAlwaysShowBelow {
            if chromeHidden { withAnimation(Theme.Motion.chromeHide) { chromeHidden = false } }
            return
        }
        if dy > Self.chromeHideDelta {
            if !chromeHidden { withAnimation(Theme.Motion.chromeHide) { chromeHidden = true } }
        } else if dy < -Self.chromeHideDelta {
            if chromeHidden { withAnimation(Theme.Motion.chromeHide) { chromeHidden = false } }
        }
    }

    /// Focusing the comment input always brings the chrome back.
    func showChrome() {
        if chromeHidden { withAnimation(Theme.Motion.chromeHide) { chromeHidden = false } }
    }

    /// `focusPdComposer`: scroll the comments heading into view + focus the input.
    func focusComposer() {
        showChrome()
        scrollToCommentsSignal &+= 1
        focusComposerSignal &+= 1
    }

    // MARK: Post like (`likePdPost`)

    func likePost() {
        guard let id = postId, !likeInFlight else { return }
        likeInFlight = true
        let base = detail?.post.likeCount ?? 0
        Task { [weak self] in
            defer { Task { @MainActor in self?.likeInFlight = false } }
            do {
                let res = try await SquareService.like(postId: id)
                let count = max(0, res.likeCount ?? (res.liked ? base + 1 : base - 1))
                await MainActor.run {
                    guard let self = self else { return }
                    self.detail?.post.applyLike(liked: res.liked, count: count)
                    SquareStore.shared.applyLike(postId: id, liked: res.liked, count: count)
                }
            } catch {
                await MainActor.run { ToastCenter.shared.show(L10n.pick("Failed to like post", "点赞失败")) }
            }
        }
    }

    // MARK: Comment like (`likePdComment`)

    func likeComment(id commentId: String) {
        guard !commentLikesInFlight.contains(commentId) else { return }
        commentLikesInFlight.insert(commentId)
        Task { [weak self] in
            defer { Task { @MainActor in self?.commentLikesInFlight.remove(commentId) } }
            do {
                let res = try await SquareDetailService.likeComment(commentId: commentId)
                await MainActor.run {
                    self?.detail?.applyCommentLike(id: commentId, liked: res.liked, likeCount: res.likeCount)
                }
            } catch {
                let msg = APIError.message(of: error).trimmingCharacters(in: .whitespacesAndNewlines)
                await MainActor.run {
                    ToastCenter.shared.show(msg.isEmpty ? L10n.pick("Failed to like", "点赞失败") : msg)
                }
            }
        }
    }

    // MARK: Poll vote

    func vote(optionIndex: Int) {
        guard let id = postId, let post = detail?.post, post.isApproved else { return }
        Task { await SquareStore.shared.vote(postId: id, optionIndex: optionIndex) }
    }

    // MARK: Reply target (`setPdReply` / `cancelPdReply`)

    func setReply(commentId: String) {
        guard let d = detail else { return }
        let parentId = d.topLevelId(for: commentId)
        let nickname = d.comment(id: commentId)?.replyLabelName ?? L10n.pick(AuthorDisplay.userFallback, "用户")
        replyTo = ReplyTarget(id: parentId, nickname: nickname)
        focusComposerSignal &+= 1
        showChrome()
    }

    /// Cancel keeps the draft — it will post as a top-level comment (B21).
    func cancelReply() {
        replyTo = nil
    }

    // MARK: Composer state

    func toggleAnonymous() {
        anonymous.toggle()
    }

    /// Picker validation mirrors H5: images only, ≤8 MB (both already enforced by `PhotoPicker` +
    /// `ImageTranscoder`, so the guard here is the size ceiling of the transcoded JPEG).
    func setPendingImage(_ photo: PickedPhoto?) {
        guard let photo = photo else {
            pendingImage = nil
            return
        }
        guard photo.jpeg.count <= ImageTranscoder.maxBytes else {
            ToastCenter.shared.show(L10n.pick("Image too large (max 8MB)", "图片太大（最大 8MB）"))
            return
        }
        pendingImage = photo
    }

    func clearPendingImage() {
        pendingImage = nil
    }

    var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || pendingImage != nil
    }

    var composerPlaceholder: String {
        L10n.placeholder(anonymous ? "Commenting anonymously..." : "Add an observation...")
    }

    // MARK: Send (`submitPdComment`)

    func send() {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard content.isEmpty == false || pendingImage != nil else { return }
        guard let id = postId, !sending else { return }
        sending = true
        // Snapshot first: a failure must give the typed text, the picked image and the anonymity
        // choice back exactly as they were.
        let snapshot = (content: draft, image: pendingImage, anon: anonymous, reply: replyTo)
        draft = ""
        Task { [weak self] in
            guard let self = self else { return }
            do {
                var imageUrl: String?
                if let photo = snapshot.image {
                    imageUrl = try await UploadService.upload(jpegData: photo.jpeg)
                }
                let body = CreateCommentRequest(content: String(content.prefix(CreateCommentRequest.maxLength)),
                                                anonymous: snapshot.anon,
                                                imageUrl: imageUrl,
                                                parentCommentId: snapshot.reply?.id)
                try await SquareDetailService.createComment(postId: id, request: body)
                await MainActor.run {
                    self.sending = false
                    self.draft = ""
                    self.anonymous = false          // each comment chooses again
                    self.pendingImage = nil
                    self.replyTo = nil
                }
                await self.load()
            } catch {
                await MainActor.run {
                    self.sending = false
                    if self.draft.isEmpty { self.draft = snapshot.content }
                    self.pendingImage = snapshot.image
                    self.anonymous = snapshot.anon
                    let msg = APIError.message(of: error).trimmingCharacters(in: .whitespacesAndNewlines)
                    ToastCenter.shared.show(L10n.pick("Failed: ", "操作失败：") + (msg.isEmpty ? L10n.pick("try again", "请重试") : msg))
                }
            }
        }
    }

    // MARK: Sharing (`sharePdPost` / `sharePdComment`)

    var shareTitle: String {
        let t = detail?.post.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return t.isEmpty ? "Unimatcha" : t
    }

    func sharePost() {
        let content = detail?.post.content ?? ""
        let text = content.isEmpty ? shareTitle : String(content.prefix(140))
        ShareSheet.present(title: shareTitle, text: text, url: ShareSheet.appURL)
    }

    func shareComment(id commentId: String) {
        let text = detail?.comment(id: commentId)?.content ?? ""
        let fallback = "\(text)\n— \(shareTitle) · Unimatcha\n\(ShareSheet.appURL)"
        ShareSheet.present(title: shareTitle, text: text, url: ShareSheet.appURL, clipboardFallback: fallback)
    }

    // MARK: Reporting (two-step, h5-square §1.5 "Report flow")

    func reportPost() {
        guard let id = postId else { return }
        Task { [weak self] in
            guard let reason = await ReportPrompt.ask(.post) else { return }
            do {
                try await SquareDetailService.reportPost(postId: id, reason: reason)
                ReportPrompt.doneToast(nil)
            } catch {
                ReportPrompt.doneToast(error)
            }
            _ = self
        }
    }

    func reportComment(id commentId: String) {
        // Snapshot the entry point: the detail may be closed while the cards are open.
        let pid = postId ?? ""
        let snippet = detail?.comment(id: commentId)?.content ?? ""
        Task {
            guard let reason = await ReportPrompt.ask(.comment) else { return }
            do {
                try await SquareDetailService.reportComment(commentId: commentId, postId: pid, reason: reason, text: snippet)
                ReportPrompt.doneToast(nil)
            } catch {
                ReportPrompt.doneToast(error)
            }
        }
    }

    // MARK: Store sync

    private func apply(mutation: SquarePostMutation) {
        guard var d = detail, d.post.id == mutation.postId else { return }
        switch mutation {
        case .like(_, let liked, let count):
            d.post.applyLike(liked: liked, count: count)
        case .vote(_, let options, let myVote):
            d.post.applyVote(options: options, myVote: myVote)
        case .counts(_, let likeCount, let commentCount, let myLiked):
            d.post.applyCounts(likeCount: likeCount, commentCount: commentCount, myLiked: myLiked)
        }
        detail = d
    }
}
