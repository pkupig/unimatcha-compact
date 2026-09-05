import SwiftUI

// MARK: - ChatViewModel (PLAN §B.7; h5-chat.md §1.3, §2.2–§2.14, gotchas 1–12, 22) — WP-07
//
// One instance per open conversation (`ChatViewModel.current`), created by `present(session:)` and
// torn down by `close()`. Everything the H5 keeps on `S.chat*` lives here, so switching
// conversations discards the whole state (gotcha 22 — the H5 leaks the pending image and the draft).
//
// The rules that are easy to get wrong and are implemented verbatim:
//   • full history walk: `limit=50` cursor pages until `nextCursor == nil` **or an empty page**,
//     max 100 pages; only the last 30 render, older chunks prepend from memory (no network).
//   • the poll cursor is **never** advanced by an own send (gotcha 4): otherwise partner messages
//     that arrived between the last poll and the send are skipped forever. Own messages are
//     appended locally and de-duplicated by id when the poll returns them.
//   • poll 5 s, but only every 6th tick while SSE is up (30 s); busy → set `pending` and re-poll
//     right after (gotcha 7); read receipts every 3rd executed poll and on SSE `read`.
//   • every async step is guarded by `isOpen` + the match id (A9): a response that lands after the
//     user left is discarded instead of leaking into the next conversation.

@MainActor
final class ChatViewModel: ObservableObject {
    static let overlayId = "chat"
    /// The conversation currently on screen (PLAN §B.7 / §D.2 dispatch target).
    static private(set) var current: ChatViewModel?

    static let renderChunk = 30
    static let pollInterval: TimeInterval = 5
    /// Every 6th 5 s tick while SSE is up → 30 s fallback.
    static let realtimeDivisor = 6
    /// Read receipts every 3rd executed poll.
    static let receiptsEveryNPolls = 3
    /// Auto-scroll on a new batch only when the viewport was this close to the bottom.
    static let stickToBottomSlack: CGFloat = 120
    /// Prepend the previous chunk when the stream is scrolled this close to the top.
    static let prependTriggerOffset: CGFloat = 10

    // MARK: Published state

    @Published private(set) var context: ChatContext
    /// Full in-memory history (all pages).
    @Published private(set) var messages: [ChatMessage] = []
    /// Index of the first rendered message (render window).
    @Published private(set) var renderFrom: Int = 0
    @Published private(set) var isLoadingHistory: Bool = false
    @Published private(set) var historyFailed: Bool = false
    @Published private(set) var isSending: Bool = false
    /// Confirm / dissolve single-flight (H5 `chatActionInFlight`), also disables the header buttons.
    @Published private(set) var actionInFlight: Bool = false

    @Published var draft: String = ""
    @Published private(set) var pendingImage: PickedPhoto?
    /// Avatar popover → "Chat background": drives the wallpaper picker sheet.
    @Published var wallpaperPickerRequested: Bool = false
    /// Bumped whenever the stream should jump to the bottom.
    @Published private(set) var scrollToBottomToken: Int = 0
    /// Id of the message that must stay put after a prepend (nil once consumed).
    @Published var prependAnchorId: String?

    // MARK: Private state

    private(set) var isOpen = false
    private var lastId: String?          // poll cursor (`afterId`)
    private var nextCursor: String?      // informational, last history cursor
    private var pollBusy = false
    private var pollPending = false
    private var pollTick = 0
    private var markReadInFlight = false
    private var receiptsInFlight = false
    private var loadingEarlier = false
    /// Distance from the bottom of the stream, reported by the view; drives auto-scroll.
    private var distanceFromBottom: CGFloat = 0

    private var poller: PollingLoop?

    // MARK: Lifecycle

    init(session: ChatSession) {
        self.context = ChatContext(session: session)
    }

    /// Row tap / `openConnectionChat`: tear down any previous conversation, present the `chat`
    /// overlay and start the open sequence (h5-chat §2.2).
    static func present(session: ChatSession) {
        if let existing = current, existing.context.matchId != session.matchId {
            existing.teardown()
        }
        let vm: ChatViewModel
        if let existing = current, existing.context.matchId == session.matchId {
            vm = existing
        } else {
            vm = ChatViewModel(session: session)
        }
        vm.context = ChatContext(session: session)
        current = vm
        OverlayRouter.shared.present(AppOverlay(
            id: overlayId,
            style: .fullPage,
            swipeBack: true,
            onDismiss: { [weak vm] in vm?.close() }
        ) {
            ConversationView(vm: vm)
        })
        Task { await vm.open() }
    }

    /// Back arrow / swipe-back / dissolve: dismisses the overlay, which runs `close()`.
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    /// Fresh conversation state → history → (still here?) mark read + start polling.
    func open() async {
        isOpen = true
        historyFailed = false
        messages = []
        renderFrom = 0
        lastId = nil
        nextCursor = nil
        pollBusy = false
        pollPending = false
        pollTick = 0
        draft = ""
        pendingImage = nil
        distanceFromBottom = 0
        stopPolling()

        let matchId = context.matchId
        await loadHistory()
        // The history load awaited the network: bail out if the user left meanwhile (A9).
        guard isOpen, context.matchId == matchId else { return }
        markRead()
        startPolling()
    }

    /// PLAN §A.2.6 `onDismiss`: stop polling, drop the conversation pointer (so in-flight
    /// history/poll/send responses discard themselves) and refresh the list when the Chat pane is
    /// the visible home view.
    func close() {
        teardown()
        if MatchStore.shared.homeView == .chat {
            Task { await ChatSessionsStore.shared.loadSessions() }
        }
    }

    /// Stops everything without touching the session list (used when replacing the conversation).
    func teardown() {
        isOpen = false
        stopPolling()
        pollBusy = false
        pollPending = false
        pendingImage = nil
        if ChatViewModel.current === self { ChatViewModel.current = nil }
    }

    // MARK: History

    /// Walks every cursor page (oldest → newest) and renders the last 30 (h5-chat §2.2, gotcha 11).
    func loadHistory() async {
        let matchId = context.matchId
        guard !matchId.isEmpty else { return }
        isLoadingHistory = true
        defer { isLoadingHistory = false }
        do {
            var all: [ChatMessage] = []
            var cursor: String? = nil
            for _ in 0..<ChatService.historyMaxPages {
                guard isOpen, context.matchId == matchId else { return }
                let page = try await ChatService.messages(matchId: matchId, cursor: cursor)
                all.append(contentsOf: page.messages)
                cursor = page.nextCursor
                if cursor == nil || page.messages.isEmpty { break }
            }
            // Final guard before committing (A9/B16).
            guard isOpen, context.matchId == matchId else { return }
            historyFailed = false
            nextCursor = cursor
            messages = all
            lastId = all.last?.id
            renderFrom = max(0, all.count - ChatViewModel.renderChunk)
            stickToBottom()
        } catch {
            guard isOpen, context.matchId == matchId else { return }
            if (error as? APIError)?.isUnauthorized != true {
                historyFailed = messages.isEmpty
                ToastCenter.shared.show(L10n.pick("Failed to load messages", "加载消息失败"))
            }
        }
    }

    /// Scroll-to-top → prepend the previous 30 from memory, keeping the visible content anchored.
    func loadEarlier() {
        guard !loadingEarlier, renderFrom > 0 else { return }
        loadingEarlier = true
        prependAnchorId = renderedMessages.first?.id
        renderFrom = max(0, renderFrom - ChatViewModel.renderChunk)
        loadingEarlier = false
    }

    var canLoadEarlier: Bool { renderFrom > 0 }

    /// The render window (`S.chatMessages.slice(S.chatRenderFrom)`).
    var renderedMessages: [ChatMessage] {
        guard renderFrom < messages.count else { return [] }
        return Array(messages[renderFrom...])
    }

    /// Time separators + rows for the render window (h5-chat §1.3, gotcha 12): the first rendered
    /// message always gets a separator; later ones only when ≥10 minutes after the previous one.
    var stream: [ChatStreamItem] { ChatViewModel.stream(renderedMessages) }

    nonisolated static func stream(_ msgs: [ChatMessage]) -> [ChatStreamItem] {
        var out: [ChatStreamItem] = []
        var prev: Double? = nil
        for m in msgs {
            if let t = m.timestampMs {
                if prev == nil || t - (prev ?? 0) >= Formatters.chatStampGapMs {
                    out.append(.separator(id: "sep-" + m.id, date: m.date ?? Date()))
                }
                prev = t
            }
            out.append(.message(m))
        }
        return out
    }

    // MARK: Scroll bookkeeping (fed by the view)

    func reportDistanceFromBottom(_ d: CGFloat) {
        distanceFromBottom = d
    }

    func stickToBottom() {
        scrollToBottomToken &+= 1
    }

    // MARK: Read receipts

    /// `PUT /chat/:id/messages/read` — single-flight; failures are logged only.
    func markRead() {
        guard isOpen, !markReadInFlight else { return }
        let matchId = context.matchId
        guard !matchId.isEmpty else { return }
        markReadInFlight = true
        Task { [weak self] in
            defer { self?.markReadInFlight = false }
            _ = try? await ChatService.markRead(matchId: matchId)
        }
    }

    /// PLAN §B.7: re-read the tail and light up the `Read` labels (every 3rd poll and on SSE `read`).
    func refreshReadReceipts() {
        Task { await refreshReadReceiptsAsync() }
    }

    func refreshReadReceiptsAsync() async {
        guard isOpen, !receiptsInFlight else { return }
        guard let myId = SessionStore.shared.userId, !myId.isEmpty else { return }
        let matchId = context.matchId
        guard let idx = messages.firstIndex(where: { $0.senderId == myId && !$0.isRead }) else { return }
        receiptsInFlight = true
        defer { receiptsInFlight = false }
        let cursorId = idx > 0 ? messages[idx - 1].id : nil
        do {
            let page = try await ChatService.messages(matchId: matchId,
                                                      cursor: cursorId,
                                                      limit: ChatService.receiptsPageSize)
            guard isOpen, context.matchId == matchId else { return }
            let readIds = Set(page.messages.filter { $0.isRead }.map { $0.id })
            guard !readIds.isEmpty else { return }
            for i in messages.indices where messages[i].senderId == myId && !messages[i].isRead {
                if readIds.contains(messages[i].id) {
                    messages[i].isRead = true
                }
            }
        } catch {
            // Non-critical (H5 logs only).
        }
    }

    // MARK: Polling

    func startPolling() {
        stopPolling()
        let loop = PollingLoop(interval: ChatViewModel.pollInterval) { [weak self] in
            await self?.pollTickIfDue()
        }
        poller = loop
        loop.start()
    }

    /// One 5 s tick: skipped unless the SSE channel is down or this is the 6th tick (30 s).
    func pollTickIfDue() async {
        let count = poller?.tickCount ?? 0
        if RealtimeClient.shared.isUp && count % ChatViewModel.realtimeDivisor != 0 { return }
        await poll()
    }

    func stopPolling() {
        poller?.stop()
        poller = nil
    }

    /// PLAN §B.7: poll right now (SSE `message`, foreground return).
    func pollNow() {
        Task { await poll() }
    }

    func onRealtimeMessage(matchId: String) {
        guard isOpen, matchId == context.matchId else { return }
        pollNow()
    }

    func onRealtimeRead(matchId: String) {
        guard isOpen, matchId == context.matchId else { return }
        refreshReadReceipts()
    }

    /// `GET /chat/:id/messages/poll?afterId=` — dedupe by id, advance the cursor only over the
    /// batch we accepted, auto-scroll only when we were near the bottom, mark read when a fresh
    /// unread partner message arrived. Errors are logged, never toasted (the loop retries).
    func poll() async {
        guard isOpen else { return }
        if pollBusy {
            // Never drop an SSE-driven poll: run one right after the in-flight request finishes.
            pollPending = true
            return
        }
        let matchId = context.matchId
        guard !matchId.isEmpty else { return }
        let cursor = lastId
        pollBusy = true
        do {
            let batch = try await ChatService.poll(matchId: matchId, afterId: cursor)
            guard isOpen, context.matchId == matchId else {
                finishPoll()
                return
            }
            if !batch.isEmpty {
                let known = Set(messages.map { $0.id })
                let fresh = batch.filter { !known.contains($0.id) }
                lastId = batch.last?.id ?? lastId
                if !fresh.isEmpty {
                    let near = distanceFromBottom < ChatViewModel.stickToBottomSlack
                    messages.append(contentsOf: fresh)
                    keepRenderWindow()
                    if near { stickToBottom() }
                    let myId = SessionStore.shared.userId
                    if fresh.contains(where: { $0.senderId != myId && !$0.isRead }) {
                        markRead()
                    }
                }
            }
            pollTick = (pollTick + 1) % ChatViewModel.receiptsEveryNPolls
            if pollTick == 0, isOpen, context.matchId == matchId {
                await refreshReadReceiptsAsync()
            }
        } catch {
            // Logged only in H5 — the interval retries.
        }
        finishPoll()
    }

    private func finishPoll() {
        pollBusy = false
        if pollPending {
            pollPending = false
            Task { await poll() }
        }
    }

    /// Keeps the rendered window at the newest 30 messages when the window was already at the tail
    /// (a user who scrolled back keeps their expanded window).
    private func keepRenderWindow() {
        let tail = max(0, messages.count - ChatViewModel.renderChunk)
        if renderFrom > tail { renderFrom = tail }
    }

    // MARK: Sending

    var canSend: Bool {
        !isSending && !context.isDissolved
            && (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || pendingImage != nil)
    }

    /// Send button / return key. Image first, then the caption — **two** messages (gotcha 9).
    func send() {
        Task { await sendAsync() }
    }

    func sendAsync() async {
        guard !isSending else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let pending = pendingImage
        // A9: snapshot the conversation up front — an upload can take seconds and must not be
        // routed to whoever is open by the time it finishes.
        let matchId = context.matchId
        guard !text.isEmpty || pending != nil, !matchId.isEmpty else { return }
        if context.isDissolved {
            ToastCenter.shared.show(lockedToast)
            return
        }
        isSending = true
        // Optimistic clear: whatever the user types during the round trip survives.
        draft = ""
        pendingImage = nil
        func stillHere() -> Bool { isOpen && context.matchId == matchId }
        // The H5 restores the pending image even when only the caption POST failed, which resends
        // it on the next tap; iOS restores it only while it really has not been sent.
        var imageSent = false
        do {
            if let p = pending {
                ToastCenter.shared.show(L10n.pick("Uploading image…", "图片上传中…"))
                let url = try await UploadService.upload(jpegData: p.jpeg)
                let m = try await ChatService.sendImage(matchId: matchId, imageUrl: url)
                imageSent = true
                if stillHere() {
                    if !m.id.isEmpty { appendOwn(m) } else { await loadHistory() }
                }
            }
            if !text.isEmpty {
                let m = try await ChatService.sendText(matchId: matchId, content: text)
                if stillHere() {
                    if !m.id.isEmpty { appendOwn(m) } else { await loadHistory() }
                }
            }
        } catch {
            // Restore the draft only when the user is still here and has not started typing again.
            if stillHere() {
                if draft.isEmpty && !text.isEmpty { draft = text }
                if !imageSent, pendingImage == nil, let p = pending { pendingImage = p }
            }
            handleSendError(error, fallback: L10n.pick("Failed to send", "发送失败"))
        }
        isSending = false
    }

    /// Appends an own message locally **without** advancing the poll cursor (gotcha 4).
    private func appendOwn(_ m: ChatMessage) {
        guard !messages.contains(where: { $0.id == m.id }) else { return }
        messages.append(m)
        keepRenderWindow()
        stickToBottom()
    }

    /// A 403 "this chat has ended" locks the composer; anything else is a plain failure toast.
    private func handleSendError(_ error: Error, fallback: String) {
        if (error as? APIError)?.isUnauthorized == true { return }
        if ChatService.isEndedError(error) {
            ToastCenter.shared.show(lockedToast)
            context.status = "DISSOLVED"
        } else {
            ToastCenter.shared.show(fallback)
        }
    }

    var lockedToast: String {
        L10n.pick("Relationship ended — you can no longer send messages", "关系已解除，无法再发送消息")
    }

    /// Composer placeholder, written per language (the H5 observer does not watch attributes).
    var composerPlaceholder: String {
        context.isDissolved ? lockedToast : L10n.placeholder("Type your response...")
    }

    // MARK: Pending image

    func setPendingImage(_ photo: PickedPhoto) {
        pendingImage = photo
    }

    func clearPendingImage() {
        pendingImage = nil
    }

    // MARK: Header actions (h5-chat §2.9–§2.10)

    /// Confirm pill: `POST /matching/:id/confirm-relationship`, then reload the list and re-derive
    /// the header from it (gotcha 2 — the response `status` list in the H5 is effectively dead).
    func confirmRelationship() {
        guard !actionInFlight else { return }
        let matchId = context.matchId
        guard !matchId.isEmpty else { return }
        actionInFlight = true
        Task { [weak self] in
            guard let self = self else { return }
            do {
                let res = try await MatchingService.confirm(matchId: matchId)
                self.context.myConfirmed = true
                if res.isFinalized {
                    self.context.partnerConfirmed = true
                    if let s = res.status, !s.isEmpty { self.context.status = s }
                }
                let message = res.message ?? (res.isFinalized
                    ? L10n.pick("You are connected now", "你们已经连接成功")
                    : L10n.pick("Confirmed. Waiting for them to confirm", "已确认，等待对方确认"))
                ToastCenter.shared.show(message)
                await ChatSessionsStore.shared.loadSessions()
                self.syncFromSessionList()
                AppActions.shared.reloadMatchTab()
            } catch {
                if (error as? APIError)?.isUnauthorized != true {
                    let m = APIError.message(of: error)
                    ToastCenter.shared.show(m.isEmpty ? L10n.pick("Failed to confirm", "确认失败") : m)
                }
            }
            self.actionInFlight = false
        }
    }

    /// Re-derives type/mode/status/flags of the open conversation from the freshly loaded list.
    func syncFromSessionList() {
        guard isOpen else { return }
        guard let s = ChatSessionsStore.shared.session(matchId: context.matchId) else { return }
        context.sync(from: s)
    }

    /// `link_off`: confirm card → `POST /matching/:id/dissolve {reason:'user_dissolved'}` → drop the
    /// row, close the conversation, reconcile with the server and refresh the match tab.
    func dissolveRelationship() {
        guard !actionInFlight else { return }
        let matchId = context.matchId
        guard !matchId.isEmpty else { return }
        Task { [weak self] in
            guard let self = self else { return }
            let ok = await DialogCenter.shared.confirm(
                title: L10n.pick("Delete this relationship?", "确定解除这段关系？"),
                body: L10n.pick("They will be notified and neither of you can send messages anymore.",
                                "对方会收到通知，你们都将无法再发送消息。"),
                confirmLabel: L10n.t("Delete"),
                danger: true)
            guard ok == true, !self.actionInFlight else { return }
            self.actionInFlight = true
            do {
                try await MatchingService.dissolve(matchId: matchId, reason: "user_dissolved")
                ToastCenter.shared.show(L10n.pick("Relationship deleted", "关系已解除"))
                if self.context.matchId == matchId {
                    self.context.status = "DISSOLVED"
                }
                ChatSessionsStore.shared.removeSession(matchId: matchId)
                self.actionInFlight = false
                ChatViewModel.dismiss()
                await ChatSessionsStore.shared.loadSessions()
                AppActions.shared.reloadMatchTab()
                return
            } catch {
                if (error as? APIError)?.isUnauthorized != true {
                    let m = APIError.message(of: error)
                    ToastCenter.shared.show(m.isEmpty ? L10n.pick("Failed to remove connection", "解除失败") : m)
                }
            }
            self.actionInFlight = false
        }
    }

    // MARK: Avatar popover actions (h5-chat §1.4, §2.12)

    /// Nudge → `POST /chat/:id/nudge`, then a full history reload so the system line appears.
    func nudge() {
        let matchId = context.matchId
        guard !matchId.isEmpty else { return }
        Task { [weak self] in
            guard let self = self else { return }
            do {
                _ = try await ChatService.nudge(matchId: matchId)
                guard self.isOpen, self.context.matchId == matchId else { return }
                await self.loadHistory()
            } catch {
                if (error as? APIError)?.isUnauthorized != true {
                    ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
                }
            }
        }
    }

    /// Set note → prompt card → `PUT /users/me/notes` → toast → session reload (the note chip).
    func promptSetNote() {
        guard let userId = context.partnerId, !userId.isEmpty else {
            ToastCenter.shared.show(L10n.pick("No user selected", "未选择用户"))
            return
        }
        let current = ChatSessionsStore.shared.session(matchId: context.matchId)?.partner.note ?? ""
        Task { [weak self] in
            guard let self = self else { return }
            let note = await DialogCenter.shared.prompt(
                title: L10n.pick("Set a note", "设置备注"),
                label: L10n.pick("Note", "备注"),
                placeholder: L10n.pick("Leave blank to clear", "留空即清除"),
                value: current)
            guard let note = note else { return }
            do {
                _ = try await ProfileService.setNote(targetUserId: userId, note: note)
                ToastCenter.shared.show(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? L10n.pick("Note cleared", "备注已清除")
                    : L10n.pick("Note saved", "备注已保存"))
                await ChatSessionsStore.shared.loadSessions()
                self.syncFromSessionList()
            } catch {
                if (error as? APIError)?.isUnauthorized != true {
                    ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
                }
            }
        }
    }

    /// Avatar popover → "Chat background": the conversation view owns the picker sheet.
    func requestWallpaperPicker() {
        wallpaperPickerRequested = true
    }

    /// Chat background → upload → `PUT /chat/:id/background` → apply at once.
    func setWallpaper(_ photo: PickedPhoto) {
        let matchId = context.matchId
        guard !matchId.isEmpty else { return }
        Task { [weak self] in
            guard let self = self else { return }
            ToastCenter.shared.show(L10n.pick("Uploading…", "上传中…"))
            do {
                let url = try await UploadService.upload(jpegData: photo.jpeg)
                _ = try await ChatService.setBackground(matchId: matchId, imageUrl: url)
                guard self.isOpen, self.context.matchId == matchId else { return }
                self.context.chatBackground = url
                ToastCenter.shared.show(L10n.pick("Wallpaper set", "背景已设置"))
            } catch {
                if (error as? APIError)?.isUnauthorized != true {
                    ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
                }
            }
        }
    }

    /// Header avatar → the partner's public profile (+ `openedProfile` behaviour event, reported by
    /// the partner-profile package through `MatchStore`).
    func openPartnerProfile() {
        guard let id = context.partnerId, !id.isEmpty else { return }
        AppActions.shared.openPartnerProfile(id, context.matchId)
    }
}

// MARK: - Stream items

enum ChatStreamItem: Identifiable {
    case separator(id: String, date: Date)
    case message(ChatMessage)

    var id: String {
        switch self {
        case .separator(let id, _): return id
        case .message(let m): return m.id
        }
    }
}
