#if DEBUG
import Foundation
import CoreGraphics

/// Decode / contract checks for the square-feed domain (run by WP-16's `-unimatcha-decode-check`).
/// Covers the feed / search / vote / like payloads, the card-kind rule, anonymous identity, the
/// text-card highlighter split, the ad placement rule, the FAB geometry and the service constants.
enum SquareFixtures {
    static func verify() throws {
        try verifyRecommend()
        try verifyCampusWall()
        try verifyPinnedAndSearch()
        try verifyVoteAndLike()
        try verifyHighlighter()
        try verifyAdPlacement()
        try verifyGeometry()
    }

    // MARK: square-recommend.json

    private static func verifyRecommend() throws {
        let f = "square-recommend"
        let page = try FixtureCheck.decode(FeedPage.self, fixture: f)
        try FixtureCheck.expect(page.items.count == 10, f, "10 items (got \(page.items.count))")
        try FixtureCheck.expect(page.page == 1 && page.limit == 20 && page.hasMore == false && page.total == 10, f, "paging fields")
        try FixtureCheck.expect(page.needsSchool == false, f, "no school gate on recommend")

        let byId = Dictionary(uniqueKeysWithValues: page.items.map { ($0.id, $0) })
        guard let image = byId["clsq0000000000000000rec01"], let text = byId["clsq0000000000000000rec02"],
              let anon = byId["clsq0000000000000000rec03"], let union = byId["clsq0000000000000000rec04"],
              let wall = byId["clsq0000000000000000rec05"], let couple = byId["clsq0000000000000000rec06"],
              let team = byId["clsq0000000000000000rec07"], let sponsor = byId["clsq0000000000000000rec08"],
              let mine = byId["clsq0000000000000000rec09"] else {
            throw FixtureCheck.Failure(fixture: f, reason: "expected ids missing")
        }

        // Card kinds (h5-square §1.3 `kindOf`)
        try FixtureCheck.expect(image.kind(on: .recommend) == .small && image.hasImage, f, "user image post → small")
        try FixtureCheck.expect(text.kind(on: .recommend) == .small && !text.hasImage, f, "user text post → small (text tile)")
        try FixtureCheck.expect(union.kind(on: .recommend) == .large && union.isOfficial, f, "student union with image → large")
        try FixtureCheck.expect(team.kind(on: .recommend) == .text && team.isOfficial, f, "team without image → text card")
        try FixtureCheck.expect(wall.kind(on: .recommend) == .wide && wall.isCampusWall, f, "CAMPUS_WALL board → wide even on recommend")
        try FixtureCheck.expect(image.kind(on: .campus_wall) == .wide, f, "user post on the wall page → wide")
        try FixtureCheck.expect(image.kind(on: .pinned) == .small && image.kind(on: .search) == .small, f, "pinned/search → small")
        try FixtureCheck.expect(sponsor.kind(on: .recommend) == .large && sponsor.showsSponsoredBadge && sponsor.officialBadgeText == nil, f, "sponsor → large + Sponsored badge")

        // Official badge text
        try FixtureCheck.expect(union.officialBadgeText == "Student Union · Warwick Students' Union" || union.officialBadgeText == "学生会 · Warwick Students' Union", f, "union badge \(union.officialBadgeText ?? "nil")")
        try FixtureCheck.expect(team.officialBadgeText == "Official Team · Unimatcha Team" || team.officialBadgeText == "官方团队 · Unimatcha Team", f, "team badge falls back to admin.name")
        try FixtureCheck.expect(image.officialBadgeText == nil, f, "user post has no official badge")

        // Anonymous identity (api-square §1.5): seed 0x00010203 → adj 3 Gentle, animal 2 Sparrow, bg index 1
        try FixtureCheck.expect(anon.anonymous && anon.authorUser == nil && anon.authorUserId == nil, f, "anonymous post carries no identity")
        try FixtureCheck.expect(anon.anonymousAuthor?.aliasSeed == 66051, f, "aliasSeed decoded as UInt32")
        try FixtureCheck.expect(anon.anonymousAuthorToken == "a_1k3j9x0z", f, "anonymousAuthorToken")
        let d = AuthorDisplay.of(anon)
        try FixtureCheck.expect(d.isAnonymous && d.seed == 66051 && d.avatarUrl == nil && d.school == "University of Warwick", f, "anonymous display uses seed + post.school")
        try FixtureCheck.expect(Alias.name(seed: 66051, lang: .en) == "Gentle Sparrow", f, "en alias")
        try FixtureCheck.expect(Alias.name(seed: 66051, lang: .zh) == "温柔的麻雀", f, "zh alias")
        try FixtureCheck.expect(d.name == "Gentle Sparrow" || d.name == "温柔的麻雀", f, "display name follows the language (got \(d.name))")
        try FixtureCheck.expect(Alias.backgroundIndex(66051) == 1 && Alias.emojiIndex(66051) == 2, f, "bg/emoji indices")

        // Non-anonymous display: nickname → admin.name → organizationName → "User"
        try FixtureCheck.expect(AuthorDisplay.of(image).name == "沐晨" && AuthorDisplay.of(image).avatarUrl != nil, f, "nickname display")
        try FixtureCheck.expect(AuthorDisplay.of(team).name == "Unimatcha Team", f, "admin.name display")
        try FixtureCheck.expect(AuthorDisplay.of(image).school == "University of Warwick", f, "profile.school first")
        var noName = image
        noName.authorUser = SquareAuthorUser(id: "x", profile: SquareAuthorProfile(nickname: "  ", avatarUrl: nil, school: nil))
        noName.admin = nil
        try FixtureCheck.expect(AuthorDisplay.of(noName).name == "User" || AuthorDisplay.of(noName).name == "用户", f, "\"User\" fallback")

        // Couple post
        try FixtureCheck.expect(couple.isCouplePost && couple.match?.userB?.profile?.nickname == "Ben", f, "couple match decoded")
        try FixtureCheck.expect(anon.isCouplePost == false, f, "anonymous never stacks avatars")

        // Title / text rules
        try FixtureCheck.expect(anon.cardTitle.count == 60, f, "title falls back to content[0..60]")
        try FixtureCheck.expect(image.cardTitle == "图书馆窗边的下午" && image.textCardText == "图书馆窗边的下午", f, "title preferred")
        // Official large / text cards print the title ONLY when there is one (no content excerpt fallback).
        try FixtureCheck.expect(union.headline == union.title, f, "official headline = title")
        var untitled = union
        untitled.title = "   "
        try FixtureCheck.expect(untitled.headline == nil && !untitled.cardTitle.isEmpty, f, "blank title → no official headline, small card still excerpts")
        try FixtureCheck.expect(mine.isMine && mine.myLiked == nil && mine.myVote == nil, f, "feed cards carry no myLiked / myVote")
        try FixtureCheck.expect(union.isPinned && union.cardType == "large" && union.sameSchool == true, f, "feed-only fields")
        try FixtureCheck.expect(image.counts?.likes == 12 && image.tags == ["library", "study"], f, "_count + tags")

        // Mutations
        var m = image
        m.applyLike(liked: true, count: 13)
        try FixtureCheck.expect(m.myLiked == true && m.likeCount == 13, f, "applyLike")
        m.applyCounts(likeCount: 20, commentCount: 5, myLiked: false)
        try FixtureCheck.expect(m.likeCount == 20 && m.commentCount == 5 && m.myLiked == false, f, "applyCounts")
    }

    // MARK: square-campus-wall.json / square-campus-wall-noschool.json

    private static func verifyCampusWall() throws {
        let f = "square-campus-wall"
        let page = try FixtureCheck.decode(FeedPage.self, fixture: f)
        try FixtureCheck.expect(page.items.count == 5, f, "5 items")
        let byId = Dictionary(uniqueKeysWithValues: page.items.map { ($0.id, $0) })
        guard let event = byId["clsq00000000000000000wal1"], let poll = byId["clsq00000000000000000wal2"],
              let pending = byId["clsq00000000000000000wal3"], let anon = byId["clsq00000000000000000wal4"] else {
            throw FixtureCheck.Failure(fixture: f, reason: "expected ids missing")
        }
        // Event post (pinned event stays on the wall)
        try FixtureCheck.expect(event.isEvent && event.isPinned && event.kind(on: .campus_wall) == .large, f, "official event → large")
        guard let ev = event.event else { throw FixtureCheck.Failure(fixture: f, reason: "event summary missing") }
        try FixtureCheck.expect(ev.id == "clevt000000000000000000e01" && ev.venue == "The Piazza" && ev.priceCents == 250, f, "event fields")
        try FixtureCheck.expect(ev.cells == 3 && ev.remaining == 57 && !ev.isSoldOut && !ev.isClosed, f, "ceil(250/100)=3 cells, 57 left")
        try FixtureCheck.expect(EventStrip.priceLabel(for: ev) == "3 energy cells" || EventStrip.priceLabel(for: ev) == "3 格能量", f, "price label")
        var sold = ev; sold.ticketsSold = 200
        try FixtureCheck.expect(sold.isSoldOut && (EventStrip.priceLabel(for: sold) == "Sold out" || EventStrip.priceLabel(for: sold) == "已售罄"), f, "sold out label")
        var free = ev; free.priceCents = 0
        try FixtureCheck.expect(EventStrip.priceLabel(for: free) == "Free" || EventStrip.priceLabel(for: free) == "免费", f, "free label")
        var one = ev; one.priceCents = 100
        try FixtureCheck.expect(EventStrip.priceLabel(for: one) == "1 energy cell" || EventStrip.priceLabel(for: one) == "1 格能量", f, "singular cell")
        try FixtureCheck.expect(EventStrip.timeLine(for: ev).hasSuffix(" · The Piazza"), f, "time · venue")

        // Approved poll with my vote
        try FixtureCheck.expect(poll.isPoll && poll.hasPollOptions && poll.isApproved && poll.myVote == 1, f, "poll decoded")
        try FixtureCheck.expect(poll.pollTotalVotes == 39 && poll.kind(on: .campus_wall) == .wide, f, "39 votes, wide card")
        try FixtureCheck.expect(PollBlock.percent(votes: 20, total: 39) == 51 && PollBlock.percent(votes: 0, total: 0) == 0, f, "pct rounding")
        let footer = PollBlock.footer(total: 39, hasVoted: true)
        try FixtureCheck.expect(footer == "39 votes · tap to change" || footer == "39 票 · 点击可更改", f, "footer voted (got \(footer))")
        let single = PollBlock.footer(total: 1, hasVoted: false)
        try FixtureCheck.expect(single == "1 vote" || single == "1 票", f, "footer singular")

        // Pending poll (author only) — not votable, review chip
        try FixtureCheck.expect(pending.isPendingReview && !pending.isApproved && pending.isMine && pending.myVote == nil, f, "pending poll")
        var voted = poll
        voted.applyVote(options: [PollOption(text: "A", votes: 1)], myVote: 0)
        try FixtureCheck.expect(voted.pollOptions?.count == 1 && voted.myVote == 0, f, "applyVote")

        // Anonymous wall post: seed 2864434397 = 0xAABBCCDD → adj 13 Eager, animal (0xAABBCC)%16 = 12 Seal, bg (0xAABB)%16 = 11
        try FixtureCheck.expect(anon.anonymousAuthor?.aliasSeed == 2_864_434_397, f, "large seed stays UInt32")
        try FixtureCheck.expect(Alias.name(seed: 2_864_434_397, lang: .en) == "Eager Seal", f, "alias of a high seed")
        try FixtureCheck.expect(Alias.backgroundIndex(2_864_434_397) == 11, f, "bg index of a high seed")

        let gate = try FixtureCheck.decode(FeedPage.self, fixture: "square-campus-wall-noschool")
        try FixtureCheck.expect(gate.needsSchool && gate.items.isEmpty && gate.total == 0, "square-campus-wall-noschool", "needProfileSchool gate")
    }

    // MARK: square-pinned.json / square-search.json

    private static func verifyPinnedAndSearch() throws {
        let pinned = try FixtureCheck.decode(FeedPage.self, fixture: "square-pinned")
        try FixtureCheck.expect(pinned.items.count == 3 && pinned.total == 3 && pinned.page == nil, "square-pinned", "unpaginated pinned page")
        try FixtureCheck.expect(pinned.items.allSatisfy { $0.isPinned && $0.isOfficial }, "square-pinned", "all pinned official")
        try FixtureCheck.expect(pinned.items[2].kind(on: .pinned) == .text, "square-pinned", "notice without image → text card")
        try FixtureCheck.expect(pinned.items[2].officialBadgeText == "Student Union · Warwick SU" || pinned.items[2].officialBadgeText == "学生会 · Warwick SU", "square-pinned", "org falls back to admin.name")
        try FixtureCheck.expect(pinned.items.map { $0.pinnedOrder ?? -1 } == [0, 1, 2], "square-pinned", "pinnedOrder ascending")

        let search = try FixtureCheck.decode(SearchResponse.self, fixture: "square-search")
        try FixtureCheck.expect(search.query == "library" && search.posts.isSearch == true && search.posts.items.count == 3, "square-search", "search shape")
        let snippets = search.posts.items.compactMap { $0.commentSnippet }
        try FixtureCheck.expect(snippets.count == 1 && snippets[0].hasPrefix("Count me in"), "square-search", "commentSnippet only on the comment hit")
        try FixtureCheck.expect(search.posts.items[2].kind(on: .search) == .wide && search.posts.items[0].kind(on: .search) == .small, "square-search", "search kinds")
        try FixtureCheck.expect(SquareAdPlacement.merge(posts: search.posts.items, ads: [AdFeedItem(id: "x", content: "c")], board: .search).count == 3, "square-search", "no ads on search")

        // Bare-array tolerance
        let bare = try JSONDecoder().decode(FeedPage.self, from: Data(#"[{"id":"p1","content":"a"},null,{"noid":true}]"#.utf8))
        try FixtureCheck.expect(bare.items.map { $0.id } == ["p1"], "inline", "bare array + junk elements tolerated")
        let blank = try JSONDecoder().decode(SearchResponse.self, from: Data(#"{"query":"","posts":{"items":[],"page":1,"limit":20,"total":0,"hasMore":false}}"#.utf8))
        try FixtureCheck.expect(blank.posts.items.isEmpty && blank.posts.isSearch == nil, "inline", "blank search")
    }

    // MARK: square-vote.json / square-like.json

    private static func verifyVoteAndLike() throws {
        let vote = try FixtureCheck.decode(VoteResult.self, fixture: "square-vote")
        try FixtureCheck.expect(vote.pollOptions.count == 4 && vote.myVote == 2 && vote.pollOptions[1].votes == 19, "square-vote", "vote result")
        let like = try FixtureCheck.decode(LikeResult.self, fixture: "square-like")
        try FixtureCheck.expect(like.liked && like.likeCount == nil && like.message == "Liked", "square-like", "like result without count")
        let unlike = try JSONDecoder().decode(LikeResult.self, from: Data(#"{"liked":false,"message":"Like removed"}"#.utf8))
        try FixtureCheck.expect(!unlike.liked, "inline", "unlike")
        let body = String(decoding: try Endpoint.encoder.encode(VoteRequest(optionIndex: 2)), as: UTF8.self)
        try FixtureCheck.expect(body == #"{"optionIndex":2}"#, "inline", "vote payload got \(body)")
        try FixtureCheck.expect(SquareService.page == 1 && SquareService.limit == 20 && SquareService.maxQueryLength == 64, "inline", "feed contract page=1&limit=20")
        try FixtureCheck.expect(SquareStore.pagerBoards == [.recommend, .campus_wall, .pinned], "inline", "pager order")
        try FixtureCheck.expect(SquareStore.pagerIndex(of: .pinned) == 2 && SquareStore.pagerIndex(of: .search) == 0, "inline", "pager index")
    }

    // MARK: Highlighter (h5-design-system §10.2)

    private static func verifyHighlighter() throws {
        let f = "inline"
        let cjk = TextCardHighlight.split("今天天气真好，出去走走")
        try FixtureCheck.expect(cjk.head == "今天天气真好" && cjk.rest == "，出去走走", f, "CJK split at punctuation (got \(cjk.head))")
        let cjkCap = TextCardHighlight.split("图书馆窗边的下午的阳光")
        try FixtureCheck.expect(cjkCap.head == "图书馆窗边的" && cjkCap.rest == "下午的阳光", f, "CJK capped at 6")
        let latin = TextCardHighlight.split("Hello world, foo")
        try FixtureCheck.expect(latin.head == "Hello" && latin.rest == " world, foo", f, "Latin split at whitespace")
        let latinCap = TextCardHighlight.split("Supercalifragilistic mood")
        try FixtureCheck.expect(latinCap.head == "Supercalifra" && latinCap.rest == "gilistic mood", f, "Latin capped at 12")
        let leading = TextCardHighlight.split("，abc")
        try FixtureCheck.expect(leading.head == "，abc" && leading.rest == "", f, "breaker at index 0 → whole text (capped)")
        let leadingLatin = TextCardHighlight.split(".abcdefghijklmnop")
        try FixtureCheck.expect(leadingLatin.head == ".abcdefghijk" && leadingLatin.rest == "lmnop", f, "leading breaker + Latin cap 12")
        let empty = TextCardHighlight.split("")
        try FixtureCheck.expect(empty.head == "" && empty.rest == "", f, "empty text")
        try FixtureCheck.expect(abs(TextCardHighlight.fontSize(viewportWidth: 375) - 20.625) < 0.01, f, "5.5vw at 375")
        try FixtureCheck.expect(TextCardHighlight.fontSize(viewportWidth: 200) == 16.8 && TextCardHighlight.fontSize(viewportWidth: 1000) == 23.2, f, "clamp 1.05rem…1.45rem")
    }

    // MARK: Ad placement (h5-addfriend-ads §1.2)

    private static func verifyAdPlacement() throws {
        let f = "inline"
        func small(_ i: Int) -> SquarePostCard { SquarePostCard(id: "s\(i)", board: "RECOMMEND", authorType: "USER", content: "c") }
        func wide(_ i: Int) -> SquarePostCard { SquarePostCard(id: "w\(i)", board: "CAMPUS_WALL", authorType: "USER", content: "c") }
        let ads = (1...3).map { AdFeedItem(id: "ad\($0)", content: "ad") }

        // 12 small cards + 3 ads → first ad after card 3, second after 8 more small cards (card 11), third would need 8 more.
        let smalls = (1...12).map(small)
        let merged = SquareAdPlacement.merge(posts: smalls, ads: ads, board: .recommend)
        let ids = merged.map { $0.id }
        try FixtureCheck.expect(ids.count == 14, f, "two ads placed (got \(ids.count))")
        try FixtureCheck.expect(ids[3] == "ad:ad1", f, "first ad after the 3rd card")
        try FixtureCheck.expect(ids[12] == "ad:ad2", f, "second ad after 8 small cards")
        try FixtureCheck.expect(!ids.contains("ad:ad3"), f, "third ad unused")

        // Wide cards after the first ad do not advance the 8-counter.
        var mixed: [SquarePostCard] = (1...3).map(small)
        mixed += (1...5).map(wide)
        mixed += (4...11).map(small)
        let mm = SquareAdPlacement.merge(posts: mixed, ads: ads, board: .recommend).map { $0.id }
        try FixtureCheck.expect(mm[3] == "ad:ad1", f, "first ad after 3 cards (mixed)")
        try FixtureCheck.expect(mm.firstIndex(of: "ad:ad2") == mm.firstIndex(of: "post:s11").map { $0 + 1 }, f, "second ad only after 8 SMALL cards")

        // Fewer than 3 posts → one ad appended at the end; empty → nothing.
        let few = SquareAdPlacement.merge(posts: [small(1), small(2)], ads: ads, board: .recommend).map { $0.id }
        try FixtureCheck.expect(few == ["post:s1", "post:s2", "ad:ad1"], f, "ad appended when < 3 posts")
        try FixtureCheck.expect(SquareAdPlacement.merge(posts: [], ads: ads, board: .recommend).isEmpty, f, "empty feed → no ad")
        try FixtureCheck.expect(SquareAdPlacement.merge(posts: smalls, ads: [], board: .recommend).count == 12, f, "no ads → posts only")
        try FixtureCheck.expect(SquareAdPlacement.merge(posts: smalls, ads: ads, board: .campus_wall).count == 12, f, "campus wall → zero ads")
        try FixtureCheck.expect(SquareAdPlacement.merge(posts: smalls, ads: ads, board: .pinned).count == 12, f, "pinned → zero ads")
        try FixtureCheck.expect(SquareAdPlacement.firstAdAfterCards == 3 && SquareAdPlacement.smallCardsBetweenAds == 8, f, "3 / 8")
        try FixtureCheck.expect(merged[3].ad?.id == "ad1" && merged[0].post?.id == "s1", f, "SquareFeedItem accessors")
    }

    // MARK: Geometry (FAB clamp / snap, small-card media height, metrics)

    private static func verifyGeometry() throws {
        let f = "inline"
        let screen = CGSize(width: 375, height: 812)
        let headerBottom: CGFloat = 44 + 59
        let def = SquareFAB.defaultPosition(container: screen)
        try FixtureCheck.expect(def == CGPoint(x: 375 - 20 - 56, y: 812 - 208 - 56), f, "FAB default bottom 208 / right 20")
        let clamped = SquareFAB.clamp(CGPoint(x: -50, y: 0), container: screen, headerBottom: headerBottom)
        try FixtureCheck.expect(clamped == CGPoint(x: 8, y: headerBottom + 8), f, "FAB clamp top-left (got \(clamped))")
        let clampedBR = SquareFAB.clamp(CGPoint(x: 900, y: 900), container: screen, headerBottom: headerBottom)
        try FixtureCheck.expect(clampedBR == CGPoint(x: 375 - 56 - 8, y: 812 - 56 - 8), f, "FAB clamp bottom-right")
        let left = SquareFAB.snapped(CGPoint(x: 100, y: 400), container: screen, headerBottom: headerBottom)
        try FixtureCheck.expect(left == CGPoint(x: 20, y: 400), f, "FAB snaps left keeping y")
        let right = SquareFAB.snapped(CGPoint(x: 200, y: 400), container: screen, headerBottom: headerBottom)
        try FixtureCheck.expect(right == CGPoint(x: 375 - 56 - 20, y: 400), f, "FAB snaps right keeping y")
        try FixtureCheck.expect(SquareFAB.size == 56 && SquareFAB.tapSlop == 6 && SquareFAB.iconSize == 24, f, "FAB constants")

        try FixtureCheck.expect(SmallCard.mediaHeight(width: 178, imageSize: nil) == 110, f, "media 110 while loading")
        try FixtureCheck.expect(SmallCard.mediaHeight(width: 178, imageSize: CGSize(width: 100, height: 300)) == 300, f, "media capped at 300")
        try FixtureCheck.expect(SmallCard.mediaHeight(width: 178, imageSize: CGSize(width: 300, height: 100)) == 110, f, "media floored at 110")
        try FixtureCheck.expect(SmallCard.mediaHeight(width: 178, imageSize: CGSize(width: 178, height: 178)) == 178, f, "media natural aspect")
        try FixtureCheck.expect(SquareCardMetrics.outerPadding == 6 && SquareCardMetrics.gap == 6 && SquareCardMetrics.cardRadius == 6, f, "6 pt gutters, radius 6")
        try FixtureCheck.expect(FeedPageView.contentTop == 50 && FeedPageView.contentBottom == 96, f, "page padding pt-[50px] pb-24")
        try FixtureCheck.expect(SquareHeaderView.height == 44 && SquareHeaderView.pinnedGap == 16 && SquareHeaderView.segmentGap == 32, f, "header geometry")
        try FixtureCheck.expect(SquareCardScale.lg(true) == 16 && SquareCardScale.base(true) == 13 && SquareCardScale.sm(true) == 12 && SquareCardScale.smallTitle(true) == 11, f, "pinned font step-down")
        try FixtureCheck.expect(SquareCardScale.lg(false) == 18 && SquareCardScale.base(false) == 16 && SquareCardScale.sm(false) == 14 && SquareCardScale.smallTitle(false) == 13, f, "default card fonts")
        try FixtureCheck.expect(HighlightLabelView.barFraction == 0.32, f, "highlighter bar 32 %")
    }
}
#endif
