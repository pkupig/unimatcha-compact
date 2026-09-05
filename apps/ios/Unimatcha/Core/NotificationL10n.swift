import Foundation

// MARK: - Notification localisation + icon map (h5-notifications.md §3.5, §5.2–§5.4; api-chat §3.7)
//
// Port of `notifications.js` `NOTIF_TITLE_ZH` / `NOTIF_BODY_ZH` / `NOTIF_BODY_PATTERNS` /
// `NOTIF_ICONS`. Titles and bodies are server-written English; in zh mode the title is looked
// up by exact match, the body by exact match then by the first anchored regex that matches
// (captures — nicknames, aliases, numbers, poll labels, reasons — pass through verbatim).
// Anything unmatched stays English. Notification text is user-ish content and must never go
// through the generic dictionary (`L10n.t`).

enum NotificationL10n {
    // MARK: 5.2 Title map (16)

    static let titleZh: [String: String] = [
        "Your match is here": "你的匹配来了",
        "New friend match": "新朋友匹配",
        "No match this round": "本轮未匹配到",
        "You're now a couple": "你们在一起了",
        "You're now friends": "你们成为朋友了",
        "Relationship ended": "恋爱关系已结束",
        "Friendship ended": "朋友关系已解除",
        "Match expired": "匹配已过期",
        "New friend": "新朋友",
        "New comment": "新评论",
        "New reply": "新回复",
        "New like": "新点赞",
        "Energy refunded": "能量已退还",
        "A secret unlocked": "解锁了一个小秘密",
        "Poll approved": "投票已通过",
        "Poll rejected": "投票未通过",
    ]

    // MARK: 5.3 Static body map (7)

    static let bodyZh: [String: String] = [
        "Great news! We found a match for you. Head to Chat and start the conversation!": "好消息！为你找到了匹配对象，去聊天页开启对话吧！",
        "We found a friend who's on your wavelength. Head to Chat and say hi!": "为你找到了一位同频的朋友，去聊天页打个招呼吧！",
        "We couldn't find a great match for you this round. Hang tight and check back next round!": "本轮暂时没有找到合适的匹配，下一轮再来看看吧！",
        "You've both confirmed — your relationship is official!": "你们都已确认——恋爱关系正式确立！",
        "You've both confirmed — you're friends now!": "你们都已确认——现在是朋友啦！",
        "This match expired because it was not confirmed by both of you within 48 hours.": "双方未在 48 小时内确认，本次匹配已过期。",
        "Someone connected with you — open the chat and say hi!": "有人和你建立了连接——打开聊天打个招呼吧！",
    ]

    // MARK: 5.4 Dynamic body patterns (10 from H5 + 1 iOS addition)

    struct BodyPattern {
        let regex: NSRegularExpression
        /// Receives the capture groups (index 0 = group 1, …; `nil` for groups that did not participate).
        let render: ([String?]) -> String

        init(_ pattern: String, render: @escaping ([String?]) -> String) {
            // Patterns are literal constants; a failure would be a programming error.
            regex = try! NSRegularExpression(pattern: pattern, options: [])
            self.render = render
        }
    }

    static let bodyPatterns: [BodyPattern] = [
        BodyPattern(#"^(.+) liked your post$"#) { m in "\(m[0] ?? "") 赞了你的帖子" },
        BodyPattern(#"^(.+) commented on your post$"#) { m in "\(m[0] ?? "") 评论了你的帖子" },
        BodyPattern(#"^(.+) replied to your comment$"#) { m in "\(m[0] ?? "") 回复了你的评论" },
        BodyPattern(#"^(.+) ended your friendship\.$"#) { m in "\(m[0] ?? "") 解除了你们的朋友关系。" },
        BodyPattern(#"^(.+) ended your relationship\.$"#) { m in "\(m[0] ?? "") 结束了你们的恋爱关系。" },
        BodyPattern(#"^Your enhanced match wasn't confirmed within 48 hours, so (\d+) energy cells? (?:has|have) been refunded\.$"#) { m in
            "增强匹配 48 小时内未确认，已退还 \(m[0] ?? "") 格能量。"
        },
        BodyPattern(#"^No match was available this round, so (\d+) energy cells? (?:has|have) been refunded\.$"#) { m in
            "本轮未匹配到对象，已退还 \(m[0] ?? "") 格能量。"
        },
        BodyPattern(#"^Your poll "(.+)" is now live on the campus wall\.$"#) { m in "你的投票「\(m[0] ?? "")」已在校园墙上线。" },
        BodyPattern(#"^Your poll "(.+)" was not approved\.(?: Reason: (.+))?$"#) { m in
            let reason = m.count > 1 ? (m[1] ?? "") : ""
            return "你的投票「\(m[0] ?? "")」未通过审核。" + (reason.isEmpty ? "" : "原因：\(reason)")
        },
        BodyPattern(#"^You and (.+) have each said "I love you" 100 times\. Here is to many more\.$"#) { m in
            "你和 \(m[0] ?? "") 已互道 100 次「我爱你」，愿未来更多。"
        },
        // iOS addition (h5-notifications §5.4 "Not covered", D7): the `event_cancelled` refund body
        // renders English in the H5; translated here as an approved divergence.
        BodyPattern(#"^The event was cancelled, so (\d+) energy cells? (?:has|have) been refunded\.$"#) { m in
            "活动已取消，已退还 \(m[0] ?? "") 格能量。"
        },
    ]

    // MARK: Lookup

    static func localizedTitle(_ raw: String, lang: Lang = L10n.lang) -> String {
        guard lang == .zh else { return raw }
        return titleZh[raw] ?? raw
    }

    static func localizedBody(_ raw: String, lang: Lang = L10n.lang) -> String {
        guard lang == .zh else { return raw }
        if let exact = bodyZh[raw] { return exact }
        let ns = raw as NSString
        let whole = NSRange(location: 0, length: ns.length)
        for p in bodyPatterns {
            guard let m = p.regex.firstMatch(in: raw, options: [], range: whole) else { continue }
            var groups: [String?] = []
            if m.numberOfRanges > 1 {
                for i in 1..<m.numberOfRanges {
                    let r = m.range(at: i)
                    groups.append(r.location == NSNotFound ? nil : ns.substring(with: r))
                }
            }
            return p.render(groups)
        }
        return raw
    }

    static func title(_ n: AppNotification) -> String { localizedTitle(n.title) }
    static func body(_ n: AppNotification) -> String { localizedBody(n.body) }

    // MARK: 3.5 Icon map (`NOTIF_ICONS`, fallback `info`; FILL 1 only for like / match_result)

    struct IconSpec: Equatable {
        let material: String
        let filled: Bool
        var sf: String { Theme.Icon.sf(material, filled: filled) }
    }

    static func icon(for type: String) -> IconSpec {
        switch type {
        case "like": return IconSpec(material: "favorite", filled: true)
        case "comment": return IconSpec(material: "chat_bubble", filled: false)
        case "match_result": return IconSpec(material: "auto_awesome", filled: true)
        case "no_match": return IconSpec(material: "hourglass_empty", filled: false)
        case "match_expired": return IconSpec(material: "hourglass_disabled", filled: false)
        case "energy_refunded": return IconSpec(material: "bolt", filled: false)
        default: return IconSpec(material: "info", filled: false)
        }
    }

    static func icon(for n: AppNotification) -> IconSpec { icon(for: n.type) }

    // MARK: Refund banner copy (h5-notifications §D, D7 fixes the `event_cancelled` text)

    /// English-only in H5; zh added per D3.
    static func refundBannerText(reason: String?, energy: Int) -> String {
        switch reason {
        case "unconfirmed_48h":
            return L10n.pick("Boost match unconfirmed after 48h — \(energy) energy refunded",
                             "增强匹配 48 小时未确认——已退还 \(energy) 能量")
        case "event_cancelled":
            return L10n.pick("The event was cancelled — \(energy) energy refunded",
                             "活动已取消——已退还 \(energy) 能量")
        default:
            return L10n.pick("No match available this round — \(energy) energy refunded",
                             "本轮未匹配到对象——已退还 \(energy) 能量")
        }
    }
}
