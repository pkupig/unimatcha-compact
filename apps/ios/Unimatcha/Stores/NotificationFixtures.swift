#if DEBUG
import Foundation

/// Decode / behaviour checks for the notifications + settings contracts (PLAN §H.4), run by
/// WP-16's `-unimatcha-decode-check`. Fixtures: `notif-list.json`, `notif-unread.json`, `notif-settings.json`.
enum NotificationFixtures {
    static func verify() throws {
        try verifyList()
        try verifyBareArrayAndUnread()
        try verifySettings()
        try verifyLocalisation()
        try verifyGroupingAndIcons()
    }

    // MARK: notif-list.json → NotificationsPage

    private static func verifyList() throws {
        let f = "notif-list"
        let page = try FixtureCheck.decode(NotificationsPage.self, fixture: f)
        try FixtureCheck.expect(page.items.count == 8, f, "8 items")
        try FixtureCheck.expect(page.total == 47 && page.unread == 3 && page.page == 1 && page.limit == 20, f, "totals")
        try FixtureCheck.expect(!page.isBareArray, f, "keyed payload")
        try FixtureCheck.expect(page.hasMore(page: 1, pageSize: 20), f, "hasMore page 1 (20 < 47)")
        try FixtureCheck.expect(page.hasMore(page: 2, pageSize: 20), f, "hasMore page 2 (40 < 47)")
        try FixtureCheck.expect(!page.hasMore(page: 3, pageSize: 20), f, "no more at page 3 (60 ≥ 47)")

        let first = page.items[0]
        try FixtureCheck.expect(first.id == "clnotif0000000000000000001", f, "first id")
        try FixtureCheck.expect(first.kind == .matchResult && !first.isRead, f, "match_result unread")
        try FixtureCheck.expect(first.matchId == "clmatch000000000000000001" && first.mode == "romantic", f, "metadata matchId/mode")

        let refund = page.items[1]
        try FixtureCheck.expect(refund.isEnergyRefund, f, "energy_refunded flag")
        try FixtureCheck.expect(refund.refundEnergy == 3 && refund.refundReason == "unconfirmed_48h", f, "refund energy/reason")

        let like = page.items[2]
        try FixtureCheck.expect(like.kind == .like && like.isRead && like.postId == "clpost0000000000000000001", f, "like read + postId")

        let cancelled = page.items[6]
        try FixtureCheck.expect(cancelled.refundEnergy == 1, f, "numeric-string energy → 1")
        try FixtureCheck.expect(cancelled.refundReason == "event_cancelled", f, "event_cancelled reason")
        try FixtureCheck.expect(cancelled.matchId == nil && cancelled.mode == nil, f, "null metadata values → nil")

        let dissolved = page.items[7]
        try FixtureCheck.expect(dissolved.metadata == nil && dissolved.refundEnergy == 0, f, "null metadata tolerated")

        // Dedupe helper keeps first occurrence.
        let doubled = NotificationStore.dedupe(page.items + page.items)
        try FixtureCheck.expect(doubled.count == 8, f, "dedupe by id")

        // H5 fallbacks: body ← message / content, createdAt ← created_at, missing isRead → false.
        let legacy = try JSONDecoder().decode(AppNotification.self, from: Data(#"{"id":"x","type":"system","title":"T","message":"M","created_at":"2026-09-03T00:00:00.000Z"}"#.utf8))
        try FixtureCheck.expect(legacy.body == "M" && legacy.createdAt == "2026-09-03T00:00:00.000Z" && !legacy.isRead, "inline", "legacy field fallbacks")
    }

    // MARK: bare array + notif-unread.json

    private static func verifyBareArrayAndUnread() throws {
        let bare = try JSONDecoder().decode(NotificationsPage.self, from: Data(#"[{"id":"a","type":"like","title":"New like","body":"X liked your post","isRead":false,"createdAt":"2026-09-03T00:00:00.000Z","metadata":null}]"#.utf8))
        try FixtureCheck.expect(bare.isBareArray && bare.items.count == 1 && bare.total == 1, "inline", "bare array decode")
        try FixtureCheck.expect(!bare.hasMore(page: 1, pageSize: 20), "inline", "bare array → hasMore false")

        let f = "notif-unread"
        let unread = try FixtureCheck.decode(UnreadCount.self, fixture: f)
        try FixtureCheck.expect(unread.unreadCount == 120, f, "unreadCount 120")
        try FixtureCheck.expect(NotificationStore.badgeLabel(120) == "99+", f, "badge cap 99+")
        try FixtureCheck.expect(NotificationStore.badgeLabel(99) == "99", f, "badge 99 uncapped")
        try FixtureCheck.expect(NotificationStore.badgeLabel(5) == "5", f, "badge 5")
        try FixtureCheck.expect(NotificationStore.badgeLabel(0) == nil, f, "badge hidden at 0")
        try FixtureCheck.expect(NotificationStore.badgeLabel(-1) == nil, f, "badge hidden below 0")
    }

    // MARK: notif-settings.json → UserSettings + SettingsPatch encoding

    private static func verifySettings() throws {
        let f = "notif-settings"
        let s = try FixtureCheck.decode(UserSettings.self, fixture: f)
        try FixtureCheck.expect(s.value(.pushEnabled) == true, f, "pushEnabled")
        try FixtureCheck.expect(s.value(.showProfile) == true, f, "showProfile")
        try FixtureCheck.expect(s.value(.showOnline) == false, f, "showOnline false")
        try FixtureCheck.expect(s.value(.showMoments) == true, f, "showMoments")
        try FixtureCheck.expect(s.privacy?.searchable == true && s.privacy?.discoverable == false, f, "hidden keys decoded")

        // Missing keys read as true (H5 `getSettingValue` fallback); unloaded (nil) also true via the VM.
        let sparse = try JSONDecoder().decode(UserSettings.self, from: Data(#"{"privacy":{"showOnline":"nope"}}"#.utf8))
        try FixtureCheck.expect(sparse.value(.pushEnabled) && sparse.value(.showOnline) && sparse.value(.showMoments), "inline", "missing/non-boolean → true")

        var mutated = UserSettings.defaults
        mutated.set(.showMoments, false)
        try FixtureCheck.expect(mutated.value(.showMoments) == false && mutated.value(.showProfile) == true, "inline", "set keeps siblings")
        var fresh = UserSettings()
        fresh.set(.pushEnabled, false)
        try FixtureCheck.expect(fresh.value(.pushEnabled) == false && fresh.privacy == nil, "inline", "set pushEnabled on empty")

        // Single-key payloads — exact bytes.
        let push = String(decoding: try Endpoint.encoder.encode(SettingsPatch(key: .pushEnabled, value: false)), as: UTF8.self)
        try FixtureCheck.expect(push == #"{"pushEnabled":false}"#, "inline", "push patch got \(push)")
        let online = String(decoding: try Endpoint.encoder.encode(SettingsPatch(key: .showOnline, value: false)), as: UTF8.self)
        try FixtureCheck.expect(online == #"{"privacy":{"showOnline":false}}"#, "inline", "privacy patch got \(online)")
        let profile = String(decoding: try Endpoint.encoder.encode(SettingsPatch(key: .showProfile, value: true)), as: UTF8.self)
        try FixtureCheck.expect(profile == #"{"privacy":{"showProfile":true}}"#, "inline", "privacy patch got \(profile)")

        let nudge = String(decoding: try Endpoint.encoder.encode(NudgeSuffixRequest(suffix: " on the head")), as: UTF8.self)
        try FixtureCheck.expect(nudge == #"{"suffix":" on the head"}"#, "inline", "nudge payload got \(nudge)")
        let nudgeEcho = try JSONDecoder().decode(NudgeSuffixResponse.self, from: Data(#"{"nudgeSuffix":" on the head"}"#.utf8))
        try FixtureCheck.expect(nudgeEcho.nudgeSuffix == " on the head", "inline", "nudge echo")

        let pw = String(decoding: try Endpoint.encoder.encode(ChangePasswordRequest(currentPassword: "old", password: "newpass123")), as: UTF8.self)
        try FixtureCheck.expect(pw == #"{"currentPassword":"old","password":"newpass123"}"#, "inline", "change-password payload got \(pw)")

        try FixtureCheck.expect(SettingKey.showOnline.rawValue == "privacy.showOnline" && SettingKey.showOnline.jsonKey == "showOnline", "inline", "SettingKey mapping")
        try FixtureCheck.expect(SettingKey.privacyKeys == [.showProfile, .showOnline, .showMoments], "inline", "privacy key order")
    }

    // MARK: Localisation maps (h5-notifications §5.2–§5.4)

    private static func verifyLocalisation() throws {
        let f = "inline-l10n"
        try FixtureCheck.expect(NotificationL10n.titleZh.count == 16, f, "16 title entries")
        try FixtureCheck.expect(NotificationL10n.bodyZh.count == 7, f, "7 static bodies")
        try FixtureCheck.expect(NotificationL10n.bodyPatterns.count == 11, f, "10 H5 patterns + event_cancelled")

        // English identity.
        try FixtureCheck.expect(NotificationL10n.localizedTitle("Your match is here", lang: .en) == "Your match is here", f, "en title identity")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Cozy Heron liked your post", lang: .en) == "Cozy Heron liked your post", f, "en body identity")

        // zh titles / static bodies.
        try FixtureCheck.expect(NotificationL10n.localizedTitle("Your match is here", lang: .zh) == "你的匹配来了", f, "zh title")
        try FixtureCheck.expect(NotificationL10n.localizedTitle("Poll rejected", lang: .zh) == "投票未通过", f, "zh title poll rejected")
        try FixtureCheck.expect(NotificationL10n.localizedTitle("Unknown title", lang: .zh) == "Unknown title", f, "unmatched title stays English")
        try FixtureCheck.expect(NotificationL10n.localizedBody("You've both confirmed — you're friends now!", lang: .zh) == "你们都已确认——现在是朋友啦！", f, "zh static body")

        // zh regex bodies — captures verbatim (aliases stay English).
        try FixtureCheck.expect(NotificationL10n.localizedBody("Cozy Heron liked your post", lang: .zh) == "Cozy Heron 赞了你的帖子", f, "like pattern")
        try FixtureCheck.expect(NotificationL10n.localizedBody("林小满 commented on your post", lang: .zh) == "林小满 评论了你的帖子", f, "comment pattern")
        try FixtureCheck.expect(NotificationL10n.localizedBody("林小满 replied to your comment", lang: .zh) == "林小满 回复了你的评论", f, "reply pattern")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Noble Hare ended your friendship.", lang: .zh) == "Noble Hare 解除了你们的朋友关系。", f, "friendship pattern")
        try FixtureCheck.expect(NotificationL10n.localizedBody("晓月 ended your relationship.", lang: .zh) == "晓月 结束了你们的恋爱关系。", f, "relationship pattern")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Your enhanced match wasn't confirmed within 48 hours, so 3 energy cells have been refunded.", lang: .zh) == "增强匹配 48 小时内未确认，已退还 3 格能量。", f, "refund 48h plural")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Your enhanced match wasn't confirmed within 48 hours, so 1 energy cell has been refunded.", lang: .zh) == "增强匹配 48 小时内未确认，已退还 1 格能量。", f, "refund 48h singular")
        try FixtureCheck.expect(NotificationL10n.localizedBody("No match was available this round, so 2 energy cells have been refunded.", lang: .zh) == "本轮未匹配到对象，已退还 2 格能量。", f, "refund no-match")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Your poll \"Best canteen?\" is now live on the campus wall.", lang: .zh) == "你的投票「Best canteen?」已在校园墙上线。", f, "poll approved")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Your poll \"Best canteen?\" was not approved.", lang: .zh) == "你的投票「Best canteen?」未通过审核。", f, "poll rejected no reason")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Your poll \"Best canteen?\" was not approved. Reason: Duplicate", lang: .zh) == "你的投票「Best canteen?」未通过审核。原因：Duplicate", f, "poll rejected with reason")
        try FixtureCheck.expect(NotificationL10n.localizedBody("You and 晓月 have each said \"I love you\" 100 times. Here is to many more.", lang: .zh) == "你和 晓月 已互道 100 次「我爱你」，愿未来更多。", f, "milestone pattern")
        try FixtureCheck.expect(NotificationL10n.localizedBody("The event was cancelled, so 1 energy cell has been refunded.", lang: .zh) == "活动已取消，已退还 1 格能量。", f, "event_cancelled addition")
        try FixtureCheck.expect(NotificationL10n.localizedBody("Something the server invented", lang: .zh) == "Something the server invented", f, "unmatched body stays English")
        // Anchoring: a prefix must not match.
        try FixtureCheck.expect(NotificationL10n.localizedBody("Cozy Heron liked your post today", lang: .zh) == "Cozy Heron liked your post today", f, "anchored regex")

        // Refund banner copy (D7).
        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }
        LangRegistry.current = .en
        try FixtureCheck.expect(NotificationL10n.refundBannerText(reason: "unconfirmed_48h", energy: 3) == "Boost match unconfirmed after 48h — 3 energy refunded", f, "banner 48h")
        try FixtureCheck.expect(NotificationL10n.refundBannerText(reason: "event_cancelled", energy: 1) == "The event was cancelled — 1 energy refunded", f, "banner event_cancelled (fixed copy)")
        try FixtureCheck.expect(NotificationL10n.refundBannerText(reason: nil, energy: 2) == "No match available this round — 2 energy refunded", f, "banner default")
    }

    // MARK: Grouping (rolling 24 h) + icon map

    private static func verifyGroupingAndIcons() throws {
        let f = "inline-grouping"
        let now = ISODate.parse("2026-09-03T12:00:00.000Z")!
        func n(_ id: String, hoursAgo: Double, type: String = "system") -> AppNotification {
            AppNotification(id: id, type: type, title: "T", body: "B", isRead: false,
                            createdAt: ISODate.iso(now.addingTimeInterval(-hoursAgo * 3600)))
        }
        let list = [n("a", hoursAgo: 0.5), n("b", hoursAgo: 23.9), n("c", hoursAgo: 24.1), n("d", hoursAgo: 47.9), n("e", hoursAgo: 48.1), n("f", hoursAgo: 24 * 30)]
        let groups = list.groupedByDay(now: now)
        try FixtureCheck.expect(groups.map { $0.day } == [.today, .yesterday, .earlier], f, "three sections in order")
        try FixtureCheck.expect(groups[0].items.map { $0.id } == ["a", "b"], f, "today = < 24 h")
        try FixtureCheck.expect(groups[1].items.map { $0.id } == ["c", "d"], f, "yesterday = 24–48 h")
        try FixtureCheck.expect(groups[2].items.map { $0.id } == ["e", "f"], f, "earlier = ≥ 48 h")
        let onlyOld = [n("z", hoursAgo: 100)].groupedByDay(now: now)
        try FixtureCheck.expect(onlyOld.count == 1 && onlyOld[0].day == .earlier, f, "empty sections omitted")
        let unparsable = AppNotification(id: "u", type: "system", title: "T", body: "B", createdAt: "not-a-date")
        try FixtureCheck.expect(NotificationDay.of(unparsable, now: now) == .earlier, f, "unparsable date → Earlier")

        try FixtureCheck.expect(NotificationL10n.icon(for: "like") == NotificationL10n.IconSpec(material: "favorite", filled: true), f, "like icon filled")
        try FixtureCheck.expect(NotificationL10n.icon(for: "match_result") == NotificationL10n.IconSpec(material: "auto_awesome", filled: true), f, "match_result filled")
        try FixtureCheck.expect(NotificationL10n.icon(for: "comment") == NotificationL10n.IconSpec(material: "chat_bubble", filled: false), f, "comment icon")
        try FixtureCheck.expect(NotificationL10n.icon(for: "no_match").material == "hourglass_empty", f, "no_match icon")
        try FixtureCheck.expect(NotificationL10n.icon(for: "match_expired").material == "hourglass_disabled", f, "match_expired icon")
        try FixtureCheck.expect(NotificationL10n.icon(for: "energy_refunded").material == "bolt", f, "energy_refunded icon")
        for t in ["relationship_confirmed", "relationship_dissolved", "friend_added", "milestone", "system", "whatever"] {
            try FixtureCheck.expect(NotificationL10n.icon(for: t) == NotificationL10n.IconSpec(material: "info", filled: false), f, "\(t) → info")
        }
        try FixtureCheck.expect(!NotificationL10n.icon(for: "like").sf.isEmpty, f, "SF name resolves")
    }
}
#endif
