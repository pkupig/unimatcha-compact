import Foundation
import Combine
import SwiftUI

// MARK: - Ad placement (h5-square §1.3 "Ad card", h5-addfriend-ads §1.2 — `renderSquareFeed`)
//
// Pure function so the rule is testable from `SquareFixtures`:
//   walk posts in order, `cardCount++` after each; a small card also bumps `smallSinceAd`;
//   first ad right after the 3rd card (any kind); each subsequent ad after 8 small cards since the
//   previous ad (official large / text / wide cards do not advance the counter); ads used in fetch
//   order, never repeated; if fewer than 3 posts and no ad was placed, one ad is appended at the end.
//   An empty feed renders the empty state, never an ad. Campus wall / pinned / search get zero ads.

enum SquareAdPlacement {
    static let firstAdAfterCards = 3
    static let smallCardsBetweenAds = 8

    static func merge(posts: [SquarePostCard], ads: [AdFeedItem], board: SquareBoardKind) -> [SquareFeedItem] {
        guard !posts.isEmpty else { return [] }
        guard board == .recommend, !ads.isEmpty else { return posts.map { .post($0) } }
        var out: [SquareFeedItem] = []
        out.reserveCapacity(posts.count + ads.count)
        var adIdx = 0
        var cardCount = 0
        var smallSinceAd = 0
        var firstAdPlaced = false
        for post in posts {
            out.append(.post(post))
            if post.kind(on: board) == .small { smallSinceAd += 1 }
            cardCount += 1
            if adIdx < ads.count {
                if !firstAdPlaced && cardCount >= firstAdAfterCards {
                    out.append(.ad(ads[adIdx])); adIdx += 1
                    firstAdPlaced = true
                    smallSinceAd = 0
                } else if firstAdPlaced && smallSinceAd >= smallCardsBetweenAds {
                    out.append(.ad(ads[adIdx])); adIdx += 1
                    smallSinceAd = 0
                }
            }
        }
        if !firstAdPlaced, adIdx < ads.count {
            out.append(.ad(ads[adIdx]))
        }
        return out
    }
}

/// A change the store applied to a post, republished so an open detail (WP-09) can patch itself
/// without importing the store's internals (H5 "sync every cache + open detail").
enum SquarePostMutation: Equatable {
    case like(postId: String, liked: Bool, likeCount: Int)
    case vote(postId: String, options: [PollOption], myVote: Int?)
    case counts(postId: String, likeCount: Int, commentCount: Int, myLiked: Bool)

    var postId: String {
        switch self {
        case .like(let id, _, _), .vote(let id, _, _), .counts(let id, _, _, _): return id
        }
    }
}

// MARK: - SquareStore (PLAN §B.7 — WP-08)
//
// Port of the square half of `S.*` (h5-square §4) with everything H5 forgets to clear on logout
// cleared here (`sessionDidReset`). Three feed pages + the search cache, per-page request sequence
// tokens (stale responses dropped), scroll memory reset on tab entry, ads only on recommend,
// like / vote / counts synced across every cache.

@MainActor
final class SquareStore: ObservableObject {
    static let shared = SquareStore()

    /// The three pager pages in swipe order (recommend → campus_wall → pinned).
    nonisolated static let pagerBoards: [SquareBoardKind] = [.recommend, .campus_wall, .pinned]

    /// `.search` is not a pager page → index 0 (H5 points the track back at the current feed page).
    nonisolated static func pagerIndex(of board: SquareBoardKind) -> Int {
        pagerBoards.firstIndex(of: board) ?? 0
    }

    // MARK: Published state

    /// Active pager page (`S.squareTab`) — never `.search`.
    @Published var current: SquareBoardKind = .recommend
    /// Card caches per page incl. `.search` (written by WP-09's search VM).
    @Published var pages: [SquareBoardKind: [SquarePostCard]] = [:]
    /// Render state per page (`.search` state is owned by WP-09's view; kept here for completeness).
    @Published var states: [SquareBoardKind: SquareFeedState] = [:]
    /// Sponsored cards of the latest recommend load (never on the other pages).
    @Published var recommendAds: [AdFeedItem] = []
    /// WP-16 bumps on Square re-tap → the current page scrolls to top (smooth).
    @Published var scrollToTopSignal: Int = 0
    /// Bumped on tab entry → every page resets its scroll position to 0 (H5 `squareScrollPos` reset).
    @Published var scrollResetSignal: Int = 0
    /// Pages with a pull-to-refresh / reload in flight (drives nothing visual — no spinners in feeds).
    @Published private(set) var loadingBoards: Set<SquareBoardKind> = []
    /// Last like / vote / counts patch applied (WP-09 detail observes it to stay in sync).
    @Published private(set) var lastMutation: SquarePostMutation?
    /// True once `onTabEnter` ran in this session (the tab view triggers it when the shell did not).
    @Published private(set) var hasEntered = false

    // MARK: Private

    private var seqs: [SquareBoardKind: Int] = [.recommend: 0, .campus_wall: 0, .pinned: 0, .search: 0]
    private var likesInFlight: Set<String> = []
    private var votesInFlight: Set<String> = []
    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    // MARK: Derived

    /// `S.currentUser.profile.school` non-empty — gates ads and the campus-wall composer.
    var hasSchool: Bool { !school.isEmpty }

    var school: String {
        (SessionStore.shared.currentUser?.profile?.school ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func state(of board: SquareBoardKind) -> SquareFeedState {
        states[board] ?? .idle
    }

    func posts(of board: SquareBoardKind) -> [SquarePostCard] {
        pages[board] ?? []
    }

    /// Whether the page shows at least one card (H5 `[data-post-id],[data-ad-id]` present).
    func hasRenderedCards(_ board: SquareBoardKind) -> Bool {
        !posts(of: board).isEmpty
    }

    /// Rendered entries of a page: posts, with sponsored cards woven in on recommend only.
    func feedItems(for board: SquareBoardKind) -> [SquareFeedItem] {
        SquareAdPlacement.merge(posts: posts(of: board), ads: board == .recommend ? recommendAds : [], board: board)
    }

    func post(id: String) -> SquarePostCard? {
        for board in [current] + SquareBoardKind.allCases {
            if let p = pages[board]?.first(where: { $0.id == id }) { return p }
        }
        return nil
    }

    // MARK: Tab lifecycle (h5-square §2 "Square tab")

    /// `loadSquareTab`: reset every page's scroll position, then load all three pages in parallel
    /// (recommend with ads) so neighbouring pages already have content when swiping.
    func onTabEnter() async {
        hasEntered = true
        scrollResetSignal &+= 1
        await withTaskGroup(of: Void.self) { group in
            for board in SquareStore.pagerBoards {
                group.addTask { await self.load(board) }
            }
        }
    }

    /// `switchSquareTab`: change page; reload only when the target page has no rendered card.
    func switchTo(_ board: SquareBoardKind) async {
        guard board != .search else { return }
        if current != board { current = board }
        if !hasRenderedCards(board) {
            await load(board)
        }
    }

    /// Pull-to-refresh / nav re-tap: reload only the current page (other pages keep content + position).
    func reloadCurrent() async {
        await load(current)
    }

    /// Reload one page (`loadSquareTab2`). Stale responses are dropped via the per-page sequence token.
    func load(_ board: SquareBoardKind) async {
        guard board != .search else { return }
        let seq = (seqs[board] ?? 0) &+ 1
        seqs[board] = seq
        loadingBoards.insert(board)
        if !hasRenderedCards(board) {
            states[board] = .loading
        }
        defer {
            if seqs[board] == seq { loadingBoards.remove(board) }
        }
        let wantsAds = board == .recommend && hasSchool
        let adSchool = school
        do {
            async let adsTask: [AdFeedItem] = wantsAds ? AdTracker.shared.fetch(school: adSchool) : []
            let page: FeedPage
            switch board {
            case .recommend: page = try await SquareService.recommend()
            case .campus_wall: page = try await SquareService.campusWall()
            case .pinned: page = try await SquareService.pinned()
            case .search: return
            }
            let ads = await adsTask
            guard seqs[board] == seq else { return }
            if page.needsSchool && board != .recommend {
                pages[board] = []
                states[board] = .needSchool
                return
            }
            pages[board] = page.items
            states[board] = page.items.isEmpty ? .empty : .content
            if board == .recommend {
                recommendAds = wantsAds ? ads : []
            }
        } catch {
            guard seqs[board] == seq else { return }
            pages[board] = []
            states[board] = .error(APIError.message(of: error))
        }
    }

    // MARK: Search cache (written by WP-09)

    /// Replace the search page cache (WP-09's `SquareSearchViewModel` results).
    func setSearchResults(_ items: [SquarePostCard]) {
        pages[.search] = items
        states[.search] = items.isEmpty ? .empty : .content
    }

    func clearSearchResults() {
        pages[.search] = []
        states[.search] = .idle
    }

    // MARK: Like (h5-square §2 "Tap like on a card")

    /// POST first, then local ±1 (or the server's `likeCount` when present) synced across every
    /// cache — no optimistic pre-flip. Failure → toast "Failed to like post".
    func like(postId: String) async {
        guard !likesInFlight.contains(postId) else { return }
        likesInFlight.insert(postId)
        defer { likesInFlight.remove(postId) }
        let base = post(id: postId)?.likeCount ?? 0
        do {
            let res = try await SquareService.like(postId: postId)
            let count = res.likeCount ?? max(0, base + (res.liked ? 1 : -1))
            applyLike(postId: postId, liked: res.liked, count: count)
        } catch {
            ToastCenter.shared.show(L10n.pick("Failed to like post", "点赞失败"))
        }
    }

    /// Sync a like state into every cache (recommend / campus wall / pinned / search) and publish it.
    func applyLike(postId: String, liked: Bool, count: Int) {
        patch(postId: postId) { $0.applyLike(liked: liked, count: count) }
        lastMutation = .like(postId: postId, liked: liked, likeCount: max(0, count))
    }

    // MARK: Vote (h5-square §2 "Tap poll option")

    /// Approved polls only. POST → patch `pollOptions` / `myVote` into every copy. Failure toast =
    /// server message or "Vote failed".
    func vote(postId: String, optionIndex: Int) async {
        guard optionIndex >= 0, !votesInFlight.contains(postId) else { return }
        if let p = post(id: postId), !p.isApproved { return }
        votesInFlight.insert(postId)
        defer { votesInFlight.remove(postId) }
        do {
            let res = try await SquareService.vote(postId: postId, optionIndex: optionIndex)
            applyVote(postId: postId, options: res.pollOptions, myVote: res.myVote)
        } catch {
            let msg = APIError.message(of: error).trimmingCharacters(in: .whitespacesAndNewlines)
            ToastCenter.shared.show(msg.isEmpty ? L10n.pick("Vote failed", "投票失败") : msg)
        }
    }

    func applyVote(postId: String, options: [PollOption], myVote: Int?) {
        patch(postId: postId) { $0.applyVote(options: options, myVote: myVote) }
        lastMutation = .vote(postId: postId, options: options, myVote: myVote)
    }

    // MARK: Counts write-back (after a detail load — api-square §2.6)

    func applyCounts(postId: String, likeCount: Int, commentCount: Int, myLiked: Bool) {
        patch(postId: postId) { $0.applyCounts(likeCount: likeCount, commentCount: commentCount, myLiked: myLiked) }
        lastMutation = .counts(postId: postId, likeCount: max(0, likeCount), commentCount: max(0, commentCount), myLiked: myLiked)
    }

    private func patch(postId: String, _ change: (inout SquarePostCard) -> Void) {
        var next = pages
        var touched = false
        for (board, list) in next {
            var arr = list
            var hit = false
            for i in arr.indices where arr[i].id == postId {
                change(&arr[i])
                hit = true
            }
            if hit {
                next[board] = arr
                touched = true
            }
        }
        if touched { pages = next }
    }

    // MARK: Reset (`sessionDidReset`) — clears everything, including what H5 forgets

    func reset() {
        for k in seqs.keys { seqs[k] = (seqs[k] ?? 0) &+ 1 }
        current = .recommend
        pages = [:]
        states = [:]
        recommendAds = []
        loadingBoards = []
        likesInFlight = []
        votesInFlight = []
        lastMutation = nil
        hasEntered = false
        scrollResetSignal &+= 1
    }
}
