import Foundation
import Combine

// MARK: - ChatSessionsStore (PLAN §B.7; h5-chat.md §1.1, §2.1–§2.2, §2.11, gotchas 16–17, 23) — WP-07
//
// Owns the Chat pane's session list:
//   • `loadSessions()` → `GET /chat/sessions?mode=all&limit=100`; failure toasts
//     "Failed to load conversations" and keeps the previous cache. Every load also refreshes the
//     energy balance (`AppActions.refreshEnergy`, H5 `checkRefundOnSessions`).
//   • grouping: temp (`sessionType == temp`, non-terminal, `remainingMs > 0`) always on top, then
//     confirmed **stable-sorted with romantic first** — the only visual mode distinction.
//   • a 1 s ticker (started by `onPaneEnter`, stopped by `onPaneLeave`) drives the countdown
//     badges down from the `remainingMs` captured at fetch time; a row that hits 0 fades and stays
//     until the next fetch removes it.
//   • SSE `message` → `reloadThrottled()` (3 s leading+trailing) regardless of the visible pane,
//     and forwards to the open conversation; SSE `read` → the open conversation's receipts.
//   • `refundBanner` is filled by WP-16 from `NotificationStore.pendingRefund`; `dismissRefundBanner`
//     remembers the id so the same refund never re-appears in this session.

@MainActor
final class ChatSessionsStore: ObservableObject {
    static let shared = ChatSessionsStore()

    static let reloadThrottleInterval: TimeInterval = 3

    // MARK: Published state

    @Published var sessions: [ChatSession] = []
    /// Energy-refund banner pinned above the list (h5-chat §1.1 / §2.11, D7).
    @Published var refundBanner: RefundBannerInfo?
    /// True once a load has completed (H5 renders nothing before the first render pass).
    @Published private(set) var hasLoaded: Bool = false
    /// Ticks every second while the pane is on screen and live temp rows exist.
    @Published private(set) var now: Date = Date()

    // MARK: Private

    /// When `sessions` (and therefore every `remainingMs`) was captured.
    private var fetchedAt: Date = Date()
    /// Serialises the loads instead of dropping them: every caller's fetch starts *after* the one
    /// already running, so `openSession` cannot miss a row and `confirm` / `setNote` never
    /// re-derive from a list fetched before their own POST.
    private var loadTask: Task<Void, Never>?
    private var paneVisible = false
    private var ticker: Task<Void, Never>?
    private var dismissedRefundIds = Set<String>()
    private var cancellables = Set<AnyCancellable>()

    private lazy var reloadThrottle = Throttle(interval: ChatSessionsStore.reloadThrottleInterval) { [weak self] in
        Task { @MainActor [weak self] in
            await self?.loadSessions()
        }
    }

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reset() }
            .store(in: &cancellables)

        RealtimeClient.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                switch event {
                case .message(let matchId): self?.onRealtimeMessage(matchId: matchId)
                case .read(let matchId): self?.onRealtimeRead(matchId: matchId)
                default: break
                }
            }
            .store(in: &cancellables)
    }

    // MARK: Loading

    /// `GET /chat/sessions?mode=all&limit=100`. Never throws; a failure keeps the cache and toasts.
    /// Concurrent callers queue behind the load already running rather than being dropped — an
    /// awaited `loadSessions()` must always reflect the state of the world at its call site.
    func loadSessions() async {
        guard SessionStore.shared.token != nil else { return }
        let previous = loadTask
        let task = Task { @MainActor [weak self] in
            await previous?.value
            guard let self = self else { return }
            guard SessionStore.shared.token != nil else { return }
            await self.performLoad()
        }
        loadTask = task
        await task.value
        if loadTask == task { loadTask = nil }
    }

    private func performLoad() async {
        do {
            let list = try await ChatService.sessions()
            // `reset()` cancelled us mid-flight (logout / 401): never write the previous user's
            // rows back into the store, and never toast about it.
            if Task.isCancelled { return }
            sessions = list
            fetchedAt = Date()
            now = fetchedAt
        } catch {
            if Task.isCancelled || ChatSessionsStore.isCancellation(error) { return }
            // A 401 already tore the session down in `APIClient` — stay quiet for that one.
            if (error as? APIError)?.isUnauthorized != true {
                ToastCenter.shared.show(L10n.pick("Failed to load conversations", "加载会话失败"))
            }
        }
        hasLoaded = true
        restartTickerIfNeeded()
        // H5 `checkRefundOnSessions`: every list load resyncs the energy balance.
        AppActions.shared.refreshEnergy()
    }

    /// A load torn down by `reset()` surfaces as a cancelled URL task, not as a real failure.
    private static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if case .network(let underlying)? = error as? APIError {
            return (underlying as NSError).code == NSURLErrorCancelled
        }
        return (error as NSError).code == NSURLErrorCancelled
    }

    /// SSE `message` → one reload per 3 s (leading + trailing), whichever pane is visible.
    func reloadThrottled() {
        guard SessionStore.shared.token != nil else { return }
        reloadThrottle.fire()
    }

    // MARK: Grouping (h5-chat §1.1 "Ordering")

    /// Temp rows, server order (`Match.updatedAt desc`) preserved.
    var tempSessions: [ChatSession] { ChatSession.liveTemp(in: sessions) }

    /// Confirmed rows, romantic first (stable partition).
    var confirmedSessions: [ChatSession] { ChatSession.confirmedOrdered(in: sessions) }

    var isEmpty: Bool { tempSessions.isEmpty && confirmedSessions.isEmpty }

    func session(matchId: String) -> ChatSession? {
        sessions.first { $0.matchId == matchId }
    }

    /// `AppActions.noteForUser` backing (WP-17's partner-profile note pill must not import WP-07):
    /// MY private note for a partner, taken from the session list.
    func note(forUserId userId: String) -> String? {
        sessions.first { $0.partner.id == userId }?.partner.noteChip
    }

    /// Live remaining window for a temp row: the fetch-time value minus the elapsed time
    /// (gotcha 23 — `remainingMs` is computed server-side at fetch time and ticked down locally).
    func remainingMs(for session: ChatSession) -> Double {
        guard session.isTemp else { return 0 }
        let elapsed = max(0, now.timeIntervalSince(fetchedAt)) * 1000
        return max(0, session.remainingAtFetch - elapsed)
    }

    // MARK: Opening a conversation

    /// `openConnectionChat` / row tap: make sure the list is loaded, find the session and present
    /// the `chat` overlay. Returns false when no such session exists (expired / dissolved).
    @discardableResult
    func openSession(matchId: String) async -> Bool {
        if session(matchId: matchId) == nil {
            await loadSessions()
        }
        guard let s = session(matchId: matchId) else { return false }
        present(session: s)
        return true
    }

    /// Row tap: a conversation is only ever opened from a session object (gotcha 1).
    func present(session: ChatSession) {
        ChatViewModel.present(session: session)
    }

    /// Optimistic row removal after a dissolve (the server reconcile follows).
    func removeSession(matchId: String) {
        sessions.removeAll { $0.matchId == matchId }
    }

    // MARK: Pane lifecycle

    /// Chat pane became the visible home view: refresh the list and start the countdown ticker.
    func onPaneEnter() {
        paneVisible = true
        restartTickerIfNeeded()
        Task { await loadSessions() }
    }

    /// Left the pane (other home view / tab / logout): stop ticking, keep the rows.
    func onPaneLeave() {
        paneVisible = false
        stopTicker()
    }

    // MARK: Realtime

    /// SSE `{type:'message', matchId}` — poll the open conversation now (or flag it pending) and
    /// reload the list under the 3 s throttle.
    func onRealtimeMessage(matchId: String) {
        ChatViewModel.current?.onRealtimeMessage(matchId: matchId)
        reloadThrottled()
    }

    /// SSE `{type:'read', matchId}` — light up the receipts of the open conversation.
    func onRealtimeRead(matchId: String) {
        ChatViewModel.current?.onRealtimeRead(matchId: matchId)
    }

    // MARK: Refund banner

    /// Shows the banner unless this refund was already dismissed in this session.
    func showRefundBanner(_ info: RefundBannerInfo) {
        guard !dismissedRefundIds.contains(info.id) else { return }
        refundBanner = info
    }

    /// × on the banner.
    func dismissRefundBanner() {
        if let id = refundBanner?.id { dismissedRefundIds.insert(id) }
        refundBanner = nil
    }

    // MARK: Countdown ticker

    private func restartTickerIfNeeded() {
        guard paneVisible, !tempSessions.isEmpty else {
            stopTicker()
            return
        }
        guard ticker == nil else { return }
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                guard let self = self else { return }
                self.now = Date()
                // Stops itself once every temp badge is gone (H5 `startSessionCountdown`).
                if self.tempSessions.isEmpty { self.stopTicker(); return }
            }
        }
    }

    private func stopTicker() {
        ticker?.cancel()
        ticker = nil
    }

    // MARK: Session reset

    func reset() {
        stopTicker()
        reloadThrottle.cancel()
        loadTask?.cancel()
        loadTask = nil
        sessions = []
        refundBanner = nil
        dismissedRefundIds.removeAll()
        hasLoaded = false
        paneVisible = false
        fetchedAt = Date()
        now = fetchedAt
    }
}
