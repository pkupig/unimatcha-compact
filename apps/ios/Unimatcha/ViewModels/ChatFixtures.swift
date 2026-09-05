#if DEBUG
import Foundation

/// Decode / contract checks for the chat domain (run by WP-16's `-unimatcha-decode-check`).
/// Covers the session + message wire shapes and their tolerances, the grouping rules, the preview
/// truncation, the countdown badge thresholds, the time-separator rule, the request payloads and
/// the "chat has ended" error classification.
enum ChatFixtures {
    static func verify() throws {
        try verifySessions()
        try verifyMessages()
        try verifyStream()
        try verifyRequests()
    }

    // MARK: Sessions

    private static func verifySessions() throws {
        let payload = try FixtureCheck.decode(ChatSessionsPayload.self, fixture: "chat-sessions")
        try FixtureCheck.expect(payload.sessions.count == 4, "chat-sessions", "4 sessions")
        try FixtureCheck.expect(payload.total == 4, "chat-sessions", "total")

        let temp = payload.sessions[0]
        try FixtureCheck.expect(temp.matchId == "cmatch_temp_friend_01", "chat-sessions", "matchId")
        try FixtureCheck.expect(temp.mode == .friend, "chat-sessions", "mode → enum")
        try FixtureCheck.expect(temp.sessionType == "temp" && temp.isTemp, "chat-sessions", "sessionType temp")
        try FixtureCheck.expect(temp.remainingAtFetch == 36_000_000, "chat-sessions", "remainingMs")
        try FixtureCheck.expect(temp.unreadCount == 2, "chat-sessions", "unreadCount")
        try FixtureCheck.expect(temp.partner.id == "cusr_partner_friend", "chat-sessions", "partner.id")
        try FixtureCheck.expect(temp.partner.age == 21 && temp.partner.gender == "female", "chat-sessions", "partner age/gender")
        try FixtureCheck.expect(temp.lastMessage?.id == "cmsg_101", "chat-sessions", "lastMessage is an object")
        try FixtureCheck.expect(temp.myConfirmed == false, "chat-sessions", "myConfirmed explicit false")
        // Preview truncation: 28 chars + ellipsis.
        let preview = temp.previewText ?? ""
        try FixtureCheck.expect(preview.hasSuffix("…") && preview.count == 29, "chat-sessions", "preview truncated to 28 + … (got \(preview.count))")
        try FixtureCheck.expect(preview.hasPrefix("Hey! Saw you like film photo"), "chat-sessions", "preview prefix")

        let confirmedFriend = payload.sessions[1]
        try FixtureCheck.expect(confirmedFriend.isConfirmed, "chat-sessions", "sessionType confirmed")
        try FixtureCheck.expect(confirmedFriend.remainingMs == nil, "chat-sessions", "confirmed remainingMs null")
        try FixtureCheck.expect(confirmedFriend.partner.noteChip == "climbing buddy", "chat-sessions", "note chip")
        try FixtureCheck.expect(confirmedFriend.chatBackground == "https://api.unimatcha.ai/uploads/wall01.jpg", "chat-sessions", "chatBackground")
        // Image-only last message → "[Photo]" (dictionary key, so zh gives 「[图片]」).
        try FixtureCheck.expect(confirmedFriend.previewText == L10n.t("[Photo]"), "chat-sessions", "image-only preview")

        // Alternate partner keys (`userId` / `name` / `avatar`) and a nudge last message.
        let romantic = payload.sessions[2]
        try FixtureCheck.expect(romantic.partner.id == "cusr_partner_love", "chat-sessions", "partner.userId fallback")
        try FixtureCheck.expect(romantic.partner.displayName == "林小满", "chat-sessions", "partner.name fallback")
        try FixtureCheck.expect(romantic.partner.avatarUrl == "https://api.unimatcha.ai/uploads/cc33.jpg", "chat-sessions", "partner.avatar fallback")
        try FixtureCheck.expect(romantic.lastMessage?.isNudge == true, "chat-sessions", "nudge last message")

        // Empty partner → the "Partner" fallback name.
        let expired = payload.sessions[3]
        try FixtureCheck.expect(expired.partner.displayName == L10n.t("Partner"), "chat-sessions", "fallback name")
        try FixtureCheck.expect(expired.previewText == nil, "chat-sessions", "no last message → nil preview")
        try FixtureCheck.expect(expired.lastMessageTime == nil, "chat-sessions", "no last message → no time")
        // Explicit flag missing on the wire would infer from CONFIRMING; here it is explicit true.
        try FixtureCheck.expect(expired.myConfirmed, "chat-sessions", "myConfirmed explicit true")

        // Grouping: expired temp row filtered out, romantic confirmed sorted first (stable).
        let temps = ChatSession.liveTemp(in: payload.sessions)
        try FixtureCheck.expect(temps.map { $0.matchId } == ["cmatch_temp_friend_01"], "chat-sessions", "temp group excludes remainingMs 0")
        let confirmed = ChatSession.confirmedOrdered(in: payload.sessions)
        try FixtureCheck.expect(confirmed.map { $0.matchId } == ["cmatch_conf_romantic_03", "cmatch_conf_friend_02"], "chat-sessions", "romantic first")

        // Stability: two romantic + two friend keep their server order inside each group.
        let stable = ChatSession.confirmedOrdered(in: [
            sample("f1", mode: .friend), sample("r1", mode: .romantic),
            sample("f2", mode: .friend), sample("r2", mode: .romantic),
        ])
        try FixtureCheck.expect(stable.map { $0.matchId } == ["r1", "r2", "f1", "f2"], "inline", "stable partition")

        // Inference from a CONFIRMING status when the explicit flag is absent.
        let dec = JSONDecoder()
        let inferred = try dec.decode(ChatSession.self, from: Data(#"{"matchId":"m","status":"FRIEND_CONFIRMING","sessionType":"temp","partner":{}}"#.utf8))
        try FixtureCheck.expect(inferred.myConfirmed, "inline", "CONFIRMING → myConfirmed")
        let notInferred = try dec.decode(ChatSession.self, from: Data(#"{"matchId":"m","status":"MATCHED_FRIEND","sessionType":"temp","partner":{}}"#.utf8))
        try FixtureCheck.expect(!notInferred.myConfirmed, "inline", "MATCHED → not confirmed")
        try FixtureCheck.expect(notInferred.isTerminal == false, "inline", "MATCHED not terminal")
        let dissolved = try dec.decode(ChatSession.self, from: Data(#"{"matchId":"m","status":"DISSOLVED","sessionType":"confirmed","partner":{}}"#.utf8))
        try FixtureCheck.expect(dissolved.isTerminal, "inline", "DISSOLVED terminal")
        try FixtureCheck.expect(ChatSession.confirmedOrdered(in: [dissolved]).isEmpty, "inline", "terminal filtered")

        // Bare array tolerance (`data` = [...]).
        let bare = try dec.decode(ChatSessionsPayload.self, from: Data(#"[{"matchId":"a","partner":{}},{"partner":{}}]"#.utf8))
        try FixtureCheck.expect(bare.sessions.map { $0.matchId } == ["a"], "inline", "bare array, empty ids dropped")

        // Countdown badge thresholds (pink under 1 h, "Expiring" at 0, hours rounded up).
        try FixtureCheck.expect(Formatters.remainingShort(ms: 0) == "Expiring", "inline", "0 → Expiring")
        try FixtureCheck.expect(Formatters.remainingShort(ms: 30_000) == "1m left", "inline", "sub-minute → 1m left")
        try FixtureCheck.expect(Formatters.remainingShort(ms: 59 * 60_000) == "59m left", "inline", "59m")
        try FixtureCheck.expect(Formatters.remainingShort(ms: 61 * 60_000) == "2h left", "inline", "61 min → 2h (ceil)")
        try FixtureCheck.expect(!SessionRow.remainingLabel(0).isEmpty, "inline", "localised badge label")

        // Context copied out of a session row.
        var ctx = ChatContext(session: temp)
        try FixtureCheck.expect(ctx.isTemp && ctx.hasSessionMetadata && !ctx.isDissolved, "inline", "context from temp row")
        try FixtureCheck.expect(ctx.partnerId == "cusr_partner_friend", "inline", "context partner id")
        ctx.sync(from: confirmedFriend)
        try FixtureCheck.expect(ctx.isConfirmedSession && ctx.myConfirmed && ctx.partnerConfirmed, "inline", "syncFromSessionList")
        try FixtureCheck.expect(ctx.chatBackground == confirmedFriend.chatBackground, "inline", "sync wallpaper")
        ctx.status = "EXPIRED"
        try FixtureCheck.expect(ctx.isDissolved, "inline", "EXPIRED locks the composer")
    }

    private static func sample(_ id: String, mode: MatchMode) -> ChatSession {
        ChatSession(matchId: id, mode: mode, status: mode == .romantic ? "RELATIONSHIP_ROMANTIC" : "FRIEND_CONFIRMED",
                    sessionType: "confirmed", partner: SessionPartner(id: "u-" + id, nickname: id))
    }

    // MARK: Messages

    private static func verifyMessages() throws {
        let page = try FixtureCheck.decode(ChatMessagesPage.self, fixture: "chat-messages-page")
        try FixtureCheck.expect(page.messages.count == 4, "chat-messages-page", "4 messages")
        try FixtureCheck.expect(page.nextCursor == "cmsg_004", "chat-messages-page", "nextCursor")
        try FixtureCheck.expect(page.messages[0].isMine("cusr_me"), "chat-messages-page", "own message")
        try FixtureCheck.expect(!page.messages[1].isMine("cusr_me"), "chat-messages-page", "partner message")
        try FixtureCheck.expect(page.messages[1].content.isEmpty && page.messages[1].imageUrl != nil, "chat-messages-page", "image-only message")
        try FixtureCheck.expect(!page.messages[1].isNudge, "chat-messages-page", "image is never a nudge line")
        try FixtureCheck.expect(page.messages[2].isNudge, "chat-messages-page", "kind nudge")
        try FixtureCheck.expect(page.messages[0].date != nil, "chat-messages-page", "createdAt parsed")

        let poll = try FixtureCheck.decode(ChatPollPayload.self, fixture: "chat-poll")
        try FixtureCheck.expect(poll.messages.count == 1 && poll.messages[0].id == "cmsg_005", "chat-poll", "one fresh message")

        let nudge = try FixtureCheck.decode(NudgeResult.self, fixture: "chat-nudge")
        try FixtureCheck.expect(nudge.ok && nudge.messageId == "cmsg_006", "chat-nudge", "nudge result")

        // Legacy nudge detection (no `kind`, text contains "nudged").
        let dec = JSONDecoder()
        let legacy = try dec.decode(ChatMessage.self, from: Data(#"{"id":"x","content":"A nudged B","senderId":"s","isRead":false,"createdAt":"2026-09-03T08:00:00.000Z"}"#.utf8))
        try FixtureCheck.expect(legacy.isNudge, "inline", "legacy nudge without kind")
        let plain = try dec.decode(ChatMessage.self, from: Data(#"{"id":"y","content":"nudged","kind":"text","senderId":"s","isRead":false,"createdAt":"2026-09-03T08:00:00.000Z"}"#.utf8))
        try FixtureCheck.expect(!plain.isNudge, "inline", "explicit kind text wins")

        // Bare-array tolerance for both message endpoints.
        let bareHistory = try dec.decode(ChatMessagesPage.self, from: Data(#"[{"id":"m1","content":"hi","senderId":"s","isRead":false,"createdAt":"2026-09-03T08:00:00.000Z"}]"#.utf8))
        try FixtureCheck.expect(bareHistory.messages.count == 1 && bareHistory.nextCursor == nil, "inline", "bare history array")
        let barePoll = try dec.decode(ChatPollPayload.self, from: Data("[]".utf8))
        try FixtureCheck.expect(barePoll.messages.isEmpty, "inline", "bare poll array")
    }

    // MARK: Stream (time separators)

    private static func verifyStream() throws {
        func msg(_ id: String, _ iso: String) -> ChatMessage {
            ChatMessage(id: id, content: id, senderId: "s", createdAt: iso)
        }
        let items = ChatViewModel.stream([
            msg("a", "2026-09-03T08:00:00.000Z"),
            msg("b", "2026-09-03T08:05:00.000Z"),   // +5 min  → no separator
            msg("c", "2026-09-03T08:15:00.000Z"),   // +10 min → separator
        ])
        let kinds = items.map { item -> String in
            if case .separator = item { return "sep" }
            return "msg"
        }
        try FixtureCheck.expect(kinds == ["sep", "msg", "msg", "sep", "msg"], "inline", "separator on the first row and on a ≥10 min gap (got \(kinds))")
        try FixtureCheck.expect(Formatters.chatStampGapMs == 600_000, "inline", "10 minute gap")
        try FixtureCheck.expect(ChatViewModel.stream([]).isEmpty, "inline", "empty stream")
        try FixtureCheck.expect(ChatViewModel.renderChunk == 30 && ChatViewModel.pollInterval == 5, "inline", "window 30 / poll 5 s")
        try FixtureCheck.expect(ChatViewModel.realtimeDivisor == 6 && ChatViewModel.receiptsEveryNPolls == 3, "inline", "cadence 6 / 3")
        try FixtureCheck.expect(ChatViewModel.overlayId == "chat" && ChatAvatarMenu.overlayId == "chat-avatar-menu", "inline", "overlay ids")
    }

    // MARK: Requests + error classification

    private static func verifyRequests() throws {
        let text = String(decoding: try Endpoint.encoder.encode(SendMessageRequest(content: "hello", imageUrl: nil)), as: UTF8.self)
        try FixtureCheck.expect(text == #"{"content":"hello"}"#, "inline", "text send payload got \(text)")
        // (Slash escaping differs between Foundation versions, so decode instead of string-comparing.)
        let imageData = try Endpoint.encoder.encode(SendMessageRequest(content: nil, imageUrl: "https://x/y.jpg"))
        let imageObj = (try? JSONSerialization.jsonObject(with: imageData)) as? [String: Any]
        try FixtureCheck.expect(imageObj?.count == 1, "inline", "image send payload carries only imageUrl")
        try FixtureCheck.expect(imageObj?["imageUrl"] as? String == "https://x/y.jpg", "inline", "image send payload value")
        let bg = String(decoding: try Endpoint.encoder.encode(ChatBackgroundRequest(imageUrl: nil)), as: UTF8.self)
        try FixtureCheck.expect(bg == #"{"imageUrl":null}"#, "inline", "background clear sends null got \(bg)")
        try FixtureCheck.expect(SendMessageRequest.maxContentLength == 2000, "inline", "2000-char cap")
        try FixtureCheck.expect(ChatService.sessionsLimit == 100 && ChatService.historyPageSize == 50, "inline", "limit 100 / page 50")
        try FixtureCheck.expect(ChatService.receiptsPageSize == 100 && ChatService.historyMaxPages == 100, "inline", "receipts 100 / 100 pages")

        // 403 "chat has ended" classification (substring match, all three H5 variants).
        try FixtureCheck.expect(ChatService.isEndedError(APIError.http(status: 403, message: "This chat has ended, you cannot send new messages")), "inline", "server 403 locks")
        try FixtureCheck.expect(ChatService.isEndedError(APIError.http(status: 403, message: "You can no longer send messages")), "inline", "no longer")
        try FixtureCheck.expect(!ChatService.isEndedError(APIError.http(status: 500, message: "Internal server error")), "inline", "500 is a plain failure")

        // Refund banner copy: three distinct variants, all carrying the cell count.
        let a = RefundBannerInfo(id: "n1", reason: "unconfirmed_48h", energy: 3).text
        let b = RefundBannerInfo(id: "n2", reason: "event_cancelled", energy: 2).text
        let c = RefundBannerInfo(id: "n3", reason: nil, energy: 1).text
        try FixtureCheck.expect(a.contains("3") && b.contains("2") && c.contains("1"), "inline", "banner carries the energy count")
        try FixtureCheck.expect(a != b && b != c && a != c, "inline", "three distinct refund copies")
    }
}
#endif
