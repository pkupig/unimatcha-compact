import Foundation
import Combine

// MARK: - NotificationStore (PLAN §B.7; h5-notifications.md §2, §3.7, §4, gotchas 1–2, 5, 10–13)
//
// Owns the bell badge, the list overlay's paging state and the panel-scoped polling.
//   • badge: `GET /notifications/unread-count` (never the list's `unread`), capped "99+";
//     refreshed on open, every poll tick, after mark-read, on SSE `notification` (3 s throttle)
//     and by WP-16 on launch / foreground / `.sessionDidStart`. Skipped without a token.
//   • list: every open starts from page 1 (`NOTIF_PAGE_SIZE` 20), Load More appends the next page
//     with id-dedupe, poll refresh re-fetches pages 1…n sequentially and rebuilds the list.
//   • polling: 15 s only while the panel is open; every 4th tick when SSE is up (60 s).
//   • guards: `isLoadingMore` blocks refresh, `refreshBusy` blocks overlapping refreshes,
//     per-open generation discards stale responses.
//   • `pendingRefund`: the first (newest) `energy_refunded` item in a fetched list is published
//     once per id per session; WP-16 turns it into the chat refund banner + energy refresh.
//   • Implements the SSE wiring the H5 left dead (gotcha 1): `realtimeTick()`.

@MainActor
final class NotificationStore: ObservableObject {
    static let shared = NotificationStore()

    static let pageSize = NotificationService.pageSize
    static let pollInterval: TimeInterval = 15
    /// Every 4th tick when the SSE channel is up → 60 s effective.
    static let realtimeDivisor = 4
    static let realtimeThrottle: TimeInterval = 3

    // MARK: Published state

    @Published private(set) var unreadCount: Int = 0
    /// First unseen `energy_refunded` in a fetched list (per-id dedupe, per session).
    @Published var pendingRefund: AppNotification?

    @Published private(set) var items: [AppNotification] = []
    @Published private(set) var page: Int = 1
    @Published private(set) var hasMore: Bool = false
    @Published private(set) var isLoadingMore: Bool = false
    /// First page in flight after `open()` (drives the iOS-only loading line).
    @Published private(set) var isLoading: Bool = false
    /// First load failed and nothing is rendered (error state); poll failures never set it.
    @Published private(set) var loadFailed: Bool = false
    @Published private(set) var isOpen: Bool = false

    // MARK: Private

    private var refreshBusy = false
    private var seenRefundIds = Set<String>()
    private var openGeneration = 0
    private var cancellables = Set<AnyCancellable>()

    private lazy var poller = PollingLoop(interval: NotificationStore.pollInterval) { [weak self] in
        await self?.pollTick()
    }

    private lazy var throttle = Throttle(interval: NotificationStore.realtimeThrottle) { [weak self] in
        Task { @MainActor [weak self] in
            self?.realtimeRefresh()
        }
    }

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reset() }
            .store(in: &cancellables)

        // SSE `{type:'notification'}` → throttled badge + list refresh (the intended H5 wiring).
        // `realtimeTick()` is idempotent under the throttle, so WP-16 may also call it.
        RealtimeClient.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                if case .notification = event { self?.realtimeTick() }
            }
            .store(in: &cancellables)
    }

    // MARK: Badge

    /// `"99+"` above 99, `nil` when zero (badge hidden).
    nonisolated static func badgeLabel(_ count: Int) -> String? {
        guard count > 0 else { return nil }
        return count > 99 ? "99+" : String(count)
    }

    var badgeText: String? { NotificationStore.badgeLabel(unreadCount) }

    /// `GET /notifications/unread-count`; skipped without a token; errors leave the badge unchanged.
    func refreshBadge() async {
        guard SessionStore.shared.token != nil else { return }
        // The token check above happens before the await; without a generation compare after it,
        // a count fetched for the previous account paints that user's badge on the next one.
        let gen = openGeneration
        do {
            let n = try await NotificationService.unreadCount()
            guard gen == openGeneration, SessionStore.shared.token != nil else { return }
            unreadCount = max(0, n)
        } catch {
            // console only in H5
        }
    }

    // MARK: Panel lifecycle

    /// Bell tap: reset paging, load page 1, refresh the badge, start the 15 s poll.
    func open() async {
        openGeneration += 1
        let gen = openGeneration
        isOpen = true
        items = []
        page = 1
        hasMore = false
        isLoadingMore = false
        loadFailed = false
        refreshBusy = false
        isLoading = true
        poller.restart()
        Task { await self.refreshBadge() }
        await loadFirstPage(generation: gen)
    }

    /// Back arrow / swipe-back / overlay dismissal: stop polling, keep the list (stale, harmless),
    /// and re-sync the bell (gotcha 2 — the H5 badge went stale here). Skipped without a token.
    func close() {
        let wasOpen = isOpen
        isOpen = false
        isLoading = false
        poller.stop()
        if wasOpen {
            Task { await self.refreshBadge() }
        }
    }

    private func loadFirstPage(generation gen: Int) async {
        do {
            let pg = try await NotificationService.list(page: 1, limit: NotificationStore.pageSize)
            guard gen == openGeneration, isOpen else { return }
            items = NotificationStore.dedupe(pg.items)
            page = 1
            hasMore = pg.hasMore(page: 1, pageSize: NotificationStore.pageSize)
            loadFailed = false
            surfaceRefund(in: items)
        } catch {
            guard gen == openGeneration else { return }
            if items.isEmpty { loadFailed = true }
        }
        if gen == openGeneration { isLoading = false }
    }

    // MARK: Load more

    /// Next page, id-deduped against the current list. Toast on failure, button restored.
    func loadMore() async {
        guard !isLoadingMore, hasMore, isOpen else { return }
        isLoadingMore = true
        let gen = openGeneration
        let next = page + 1
        defer { if gen == openGeneration { isLoadingMore = false } }
        do {
            let pg = try await NotificationService.list(page: next, limit: NotificationStore.pageSize)
            guard gen == openGeneration, isOpen else { return }
            var seen = Set(items.map { $0.id })
            var merged = items
            for n in pg.items where !seen.contains(n.id) {
                seen.insert(n.id)
                merged.append(n)
            }
            items = merged
            page = next
            hasMore = pg.hasMore(page: next, pageSize: NotificationStore.pageSize)
        } catch {
            guard gen == openGeneration else { return }
            ToastCenter.shared.show(L10n.pick("Failed to load more notifications", "加载更多失败"))
        }
    }

    // MARK: Mark read

    /// Row tap: optimistic read state (dot vanishes, row dims), `PUT /notifications/:id/read` in the
    /// background, badge refresh on success. On failure only a toast — the row stays read until
    /// the next poll re-asserts server truth (H5 parity, gotcha 5).
    func markRead(id: String) {
        if let i = items.firstIndex(where: { $0.id == id }) {
            items[i].isRead = true
        }
        Task { [weak self] in
            do {
                try await NotificationService.markRead(id: id)
                await self?.refreshBadge()
            } catch {
                ToastCenter.shared.show(L10n.pick("Failed to mark notification as read", "标记已读失败"))
            }
        }
    }

    // MARK: Refresh loaded pages (poll tick / SSE)

    /// Re-fetch every page 1…n sequentially, merge with id-dedupe, replace the list. Skipped while a
    /// load-more or another refresh is in flight. Errors are silent (content kept).
    func refreshLoadedPages() async {
        guard isOpen, !isLoadingMore, !refreshBusy else { return }
        refreshBusy = true
        defer { refreshBusy = false }
        let gen = openGeneration
        var merged: [AppNotification] = []
        var seen = Set<String>()
        var lastHasMore = hasMore
        var p = 1
        do {
            // `page` is re-read each iteration (H5 `p <= S.notifPage`) so a page loaded meanwhile is included.
            while p <= page {
                let pg = try await NotificationService.list(page: p, limit: NotificationStore.pageSize)
                guard gen == openGeneration, isOpen else { return }
                for n in pg.items where !seen.contains(n.id) {
                    seen.insert(n.id)
                    merged.append(n)
                }
                lastHasMore = pg.hasMore(page: p, pageSize: NotificationStore.pageSize)
                p += 1
            }
            items = merged
            hasMore = lastHasMore
            loadFailed = false
            surfaceRefund(in: merged)
        } catch {
            // console only in H5; keep what is rendered
        }
    }

    private func pollTick() async {
        guard isOpen else { return }
        if RealtimeClient.shared.isUp && poller.tickCount % NotificationStore.realtimeDivisor != 0 {
            return
        }
        await refreshLoadedPages()
        await refreshBadge()
    }

    /// SSE `notification` frame → 3 s leading + trailing throttle → badge always, loaded pages when open.
    func realtimeTick() {
        throttle.fire()
    }

    private func realtimeRefresh() {
        guard SessionStore.shared.token != nil else { return }
        Task { [weak self] in
            guard let self = self else { return }
            await self.refreshBadge()
            if self.isOpen { await self.refreshLoadedPages() }
        }
    }

    // MARK: Refund surfacing (h5-notifications §D, gotcha 6a — per-id dedupe per session)

    private func surfaceRefund(in list: [AppNotification]) {
        guard let refund = list.first(where: { $0.isEnergyRefund }) else { return }
        guard !seenRefundIds.contains(refund.id) else { return }
        seenRefundIds.insert(refund.id)
        pendingRefund = refund
    }

    /// WP-16 calls this after consuming `pendingRefund` (optional; a new refund replaces it anyway).
    func clearPendingRefund() {
        pendingRefund = nil
    }

    // MARK: Reset (`sessionDidReset`)

    func reset() {
        openGeneration += 1
        poller.stop()
        throttle.cancel()
        isOpen = false
        isLoading = false
        isLoadingMore = false
        loadFailed = false
        refreshBusy = false
        items = []
        page = 1
        hasMore = false
        unreadCount = 0
        pendingRefund = nil
        seenRefundIds = []
    }

    // MARK: Helpers

    nonisolated static func dedupe(_ list: [AppNotification]) -> [AppNotification] {
        var seen = Set<String>()
        var out: [AppNotification] = []
        for n in list where !seen.contains(n.id) {
            seen.insert(n.id)
            out.append(n)
        }
        return out
    }
}
