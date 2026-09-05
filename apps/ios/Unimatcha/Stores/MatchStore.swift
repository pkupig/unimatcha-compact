import Foundation
import Combine

// MARK: - MatchStore (PLAN §B.7 / §E; h5-match.md §2.1, §2.5–§2.7, §2.9, §2.11–§2.12, §4) — WP-06
//
// Owner of everything H5 keeps in `S.*` for the match tab: home view, active mode, per-mode
// status / preferences caches, the client-only enhanced intent (persisted per uid), the
// `lastEnhancedRound` marker, the 30 s status poller, sequence tokens and the behaviour-event
// de-dup set. Two `MatchPaneViewModel`s (romantic / friend) render from it.
//
// Cross-package surface (PLAN §B.7) — do not rename:
//   activate(view:) deactivate() reload(mode:) loadPrefs(mode:) savePrefs(mode:write:) isPoolActive(_:)
//   startMatch(mode:) stopMatch(mode:) dissolve(matchId:reason:) setEnhanced(mode:enabled:)
//   setFriendCells(_:) resyncSummary() reportEvent(matchId:type:) reset()

enum MatchStoreError: Error, Equatable {
    /// `savePrefs` refused because the mode is `searching` (locked toast already shown).
    case locked
    /// `loadPrefs` response discarded because the session was reset while it was in flight.
    case superseded
}

@MainActor
final class MatchStore: ObservableObject {
    static let shared = MatchStore()

    static let pollInterval: TimeInterval = 30
    static let pollFailureLimit = 5

    // MARK: Published state (H5 `S.*`)

    /// `'chat'` default; set by `activate(view:)` (== `switchHomeView`).
    @Published var homeView: HomeView = .chat
    /// `'romantic'` default.
    @Published var activeMode: MatchMode = .romantic
    /// Last `GET /matching/status` per mode (nil = unknown); optimistically set to searching on join.
    @Published var status: [MatchMode: MatchStatus] = [:]
    /// Last `GET /matching/preferences` per mode, merged with the PUT payload after a save.
    @Published var prefs: [MatchMode: MatchPreferencesRead] = [:]
    /// Client-only enhanced intent, persisted per uid (`Prefs.enhanced(uid:)`).
    @Published var enhanced: EnhancedPrefs = .default
    /// "This session joined the current round with enhanced" → summary shows "Active this round".
    @Published var lastEnhancedRound: [MatchMode: Bool] = [.romantic: false, .friend: false]
    /// Bumped by `resyncSummary()` so summary boxes re-fill without a network call.
    @Published private(set) var summaryVersion: Int = 0
    /// True between `activate` and `deactivate` — pane tickers (1 s) run only while active.
    @Published private(set) var isActive: Bool = false

    let romanticPane = MatchPaneViewModel(mode: .romantic)
    let friendPane = MatchPaneViewModel(mode: .friend)

    func pane(_ mode: MatchMode) -> MatchPaneViewModel {
        mode == .romantic ? romanticPane : friendPane
    }

    // MARK: Private bookkeeping

    private var poller: PollingLoop?
    private var pollFailCount = 0
    /// Per-mode preference fetch counters (H5 `loadPlanData._seq`); newer fetch wins the cache.
    private var prefsSeq: [MatchMode: Int] = [.romantic: 0, .friend: 0]
    /// Bumped on reset so in-flight preference responses from the previous account are discarded.
    private var prefsGeneration = 0
    /// Bumped on every `activate` / reset — awaited steps abort when the generation moved on.
    private var viewGeneration = 0
    private var reportedEvents = Set<String>()
    private var enhancedUid: String?
    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    // MARK: Enhanced hydration (`ensureEnhancedShape`)

    /// Re-hydrates the enhanced intent for the current user (per-uid UserDefaults, never bled across accounts).
    private func hydrateEnhanced() {
        let uid = SessionStore.shared.userId ?? ""
        guard uid != enhancedUid else { return }
        enhancedUid = uid
        enhanced = (uid.isEmpty ? nil : Prefs.enhanced(uid: uid)) ?? .default
    }

    private func persistEnhanced() {
        guard let uid = enhancedUid, !uid.isEmpty else { return }
        Prefs.setEnhanced(enhanced, uid: uid)
    }

    /// Friend cells clamped 1…5.
    var friendCells: Int { min(max(enhanced.friendCells, 1), 5) }

    // MARK: View switching (h5-match §2.1 `switchHomeView`)

    /// == `switchHomeView`: sets homeView/activeMode, stops polling, pre-heats the other match
    /// pane(s), then loads sessions (chat) or runs `ensureQuestionnaireThenMatch` (match modes).
    func activate(view: HomeView) async {
        hydrateEnhanced()
        viewGeneration &+= 1
        let gen = viewGeneration
        isActive = true
        homeView = view
        stopPolling()

        // Pre-heat every *other* match pane that is still empty (a swipe reveals a real page).
        for m in MatchMode.allCases where m != view.mode {
            preheat(mode: m)
        }

        switch view {
        case .chat:
            AppActions.shared.loadSessions()
        case .romantic, .friend:
            let mode = view.mode ?? .romantic
            activeMode = mode
            await ensureQuestionnaireThenMatch(mode: mode, generation: gen)
        }
    }

    /// Stop polling + tickers (switchTab away, logout). Panes keep their content.
    func deactivate() {
        isActive = false
        stopPolling()
    }

    private func preheat(mode: MatchMode) {
        let p = pane(mode)
        if p.preheatIfEmpty(cached: status[mode]) {
            Task { [weak self] in _ = try? await self?.loadPrefs(mode: mode) }
        }
    }

    /// Bumped only by `reset()` (logout / 401). Any async write that lands after a bump belongs
    /// to the previous account and is dropped.
    private var sessionGeneration = 0

    private func viewStillShows(_ mode: MatchMode, generation: Int) -> Bool {
        generation == viewGeneration && homeView == HomeView(mode: mode)
    }

    /// h5-match §2.1 step 6 — completion gate (fail-open), wall only when idle, banner otherwise.
    private func ensureQuestionnaireThenMatch(mode: MatchMode, generation: Int) async {
        let p = pane(mode)
        p.pendingBanner = false
        p.showRefillBanner = false

        let completion = await QuestionnaireViewModel.shared.completion()
        // Request failure ⇒ treated as completed (never lock the user out).
        let completed = completion?.isCompleted(mode) ?? true
        guard viewStillShows(mode, generation: generation) else { return }

        if !completed {
            var state = status[mode]?.state
            if state == nil {
                if let s = try? await MatchingService.status(mode: mode) {
                    guard viewStillShows(mode, generation: generation) else { return }
                    status[mode] = s
                    state = s.state
                }
            }
            guard viewStillShows(mode, generation: generation) else { return }
            if state == nil || state == .idle {
                p.showQuestionnaireWall()
                return
            }
            p.pendingBanner = true
        }

        await reload(mode: mode)
        guard viewStillShows(mode, generation: generation) else { return }
        if p.pendingBanner {
            p.pendingBanner = false
            p.showRefillBanner = true
        }
    }

    // MARK: Status loading (h5-match §2.11 `loadMatchTab`)

    /// == `loadMatchTab`: fetch status, render, restart polling. Failure keeps a known non-idle
    /// state (toast) or renders the idle plan page.
    func reload(mode: MatchMode) async {
        // Account-switch guard: a status response that was already in flight when the session was
        // torn down must never be published — it would render the previous user's match (partner
        // avatar, nickname, school) to whoever logs in next, and fire a `viewed` feedback event
        // under their session. Same rule H5 had to add as `resetMatchPlanState` (seq 令牌作废在途响应).
        let gen = sessionGeneration
        do {
            let s = try await MatchingService.status(mode: mode)
            guard gen == sessionGeneration else { return }
            status[mode] = s
            render(mode: mode, status: s)
            startPollingIfNeeded(mode: mode, status: s)
        } catch let e as APIError where e.isUnauthorized {
            // Session torn down by APIClient; nothing to render.
        } catch {
            guard gen == sessionGeneration else { return }
            // Never drop the cached status: it carries `nextRunAt`/`matchConfig`, and the pane
            // reads the reveal countdown from its own `lastStatus`. Clearing it on a single
            // transient failure silently demotes the countdown to the "next Friday 17:00 local"
            // offline placeholder, which is ~7 h wrong for UK users (the round is 17:00 CST).
            if let known = status[mode] {
                if known.state != .idle {
                    ToastCenter.shared.show(L10n.pick("Network error, please try again", "网络错误，请重试"))
                }
                render(mode: mode, status: known)
            } else {
                render(mode: mode, status: nil)
            }
        }
    }

    /// Feeds the pane and performs the render side effects (preference fetch, `viewed` events).
    private func render(mode: MatchMode, status s: MatchStatus?) {
        let p = pane(mode)
        let outcome = p.render(s)
        if outcome == .rebuiltPlan {
            Task { [weak self] in _ = try? await self?.loadPrefs(mode: mode) }
        }
        switch p.content {
        case .matched(let m, _):
            if let id = m.id, !id.isEmpty { reportEvent(matchId: id, type: .viewed) }
        case .candidates(let list):
            for c in list.prefix(5) where !c.matchId.isEmpty { reportEvent(matchId: c.matchId, type: .viewed) }
        default:
            break
        }
    }

    // MARK: Polling (h5-match §2.11, PLAN §D.3)

    private func startPollingIfNeeded(mode: MatchMode, status s: MatchStatus) {
        // Romantic `relationship` is terminal; friend polls forever.
        if mode == .romantic && s.state == .relationship {
            stopPolling()
            return
        }
        // `mode` was captured before this reload's round trip. If the user has since swiped to the
        // other pane, arming a poller for the mode we just loaded would replace the live one with
        // a timer whose own guard makes it a permanent no-op — the visible pane would then never
        // auto-refresh. H5 arms the timer for the current mode instead (match.js:1163).
        guard homeView == HomeView(mode: mode) || activeMode == mode else { return }
        startPolling(mode: mode)
    }

    private func startPolling(mode: MatchMode) {
        stopPolling()
        pollFailCount = 0
        let loop = PollingLoop(interval: MatchStore.pollInterval) { [weak self] in
            await self?.pollTick(mode: mode)
        }
        poller = loop
        loop.start()
    }

    private func stopPolling() {
        poller?.stop()
        poller = nil
    }

    private func pollTick(mode: MatchMode) async {
        // No-op if the active mode / view changed since the timer was armed.
        guard isActive, activeMode == mode, homeView == HomeView(mode: mode) else { return }
        do {
            let s = try await MatchingService.status(mode: mode)
            guard isActive, activeMode == mode, homeView == HomeView(mode: mode) else { return }
            status[mode] = s
            pollFailCount = 0
            render(mode: mode, status: s)   // same-state → value-only refresh (pane guard)
            if mode == .romantic && s.state == .relationship { stopPolling() }
        } catch let e as APIError where e.isUnauthorized {
            stopPolling()
        } catch {
            pollFailCount += 1
            if pollFailCount >= MatchStore.pollFailureLimit {
                stopPolling()
                ToastCenter.shared.show(L10n.pick("Match updates paused — check your connection and retry", "匹配状态更新已暂停，请检查网络后重试"))
            }
        }
    }

    // MARK: Preferences (h5-match §2.10 / gotcha 10)

    /// `GET /matching/preferences?mode=` with a per-mode sequence token: only the newest fetch
    /// writes the cache; a response that outlived a session reset throws `.superseded`.
    @discardableResult
    func loadPrefs(mode: MatchMode) async throws -> MatchPreferencesRead {
        let gen = prefsGeneration
        let seq = (prefsSeq[mode] ?? 0) + 1
        prefsSeq[mode] = seq
        let p = try await MatchingService.preferences(mode: mode)
        guard gen == prefsGeneration else { throw MatchStoreError.superseded }
        if prefsSeq[mode] == seq {
            prefs[mode] = p
        }
        return p
    }

    /// `PUT /matching/preferences` + cache merge. Refused (locked toast + `.locked`) while the pool
    /// is active for that mode; the enhanced toggle/cells are never part of the payload.
    func savePrefs(mode: MatchMode, write: MatchPreferencesWrite) async throws {
        if isPoolActive(mode) {
            showLockedToast()
            throw MatchStoreError.locked
        }
        var w = write
        w.mode = mode
        persistEnhanced()
        try await MatchingService.savePreferences(w)
        var merged = prefs[mode] ?? MatchPreferencesRead.defaults(mode: mode)
        merged.merge(w)
        prefs[mode] = merged
        resyncSummary()
    }

    /// `S.matchStatus[mode].state === 'searching'` — matched/confirming/relationship stay editable.
    func isPoolActive(_ mode: MatchMode) -> Bool {
        status[mode]?.state == .searching
    }

    /// h5-match §2.9 — lock line tap and refused saves.
    func showLockedToast() {
        ToastCenter.shared.show(L10n.pick("Leave the matching pool before changing settings", "匹配中无法修改设置，请先离开匹配池"))
    }

    // MARK: Join / leave / dissolve (PLAN §E, h5-match §2.5–§2.7)

    /// `startMatch` — completion gate → enhanced balance check + tri-state confirm → optimistic
    /// searching → `POST /matching/start` → toasts → balance refresh → always reload.
    func startMatch(mode: MatchMode) async {
        hydrateEnhanced()
        let p = pane(mode)

        // 1. Questionnaire completion (failure ⇒ let the server decide).
        if let completion = await QuestionnaireViewModel.shared.completion(), !completion.isCompleted(mode) {
            p.showQuestionnaireWall()
            return
        }

        // 2. Enhanced intent → balance → confirm card.
        var useEnhanced = enhanced.isEnabled(mode)
        let cells = friendCells
        let cost = mode == .romantic ? EnhancedPrefs.romanticCost : cells
        if useEnhanced {
            await EnergyStore.shared.refresh()
            let avail = EnergyStore.shared.available
            if avail < cost {
                ToastCenter.shared.show(L10n.t("Not enough energy — top up"))
                AppActions.shared.openEnergyPurchase()
                return
            }
            let body: String
            if L10n.isZh {
                body = "将立即消耗 \(cost) 格能量（当前 \(avail) 格）。" + (mode == .romantic ? "本轮未匹配到会全额退回。" : "保底不足会按缺口退回。")
            } else {
                body = "\(cost) energy cells will be spent now (you have \(avail)). "
                    + (mode == .romantic ? "Fully refunded if no match this round." : "Shortfall refunded if the guarantee is not met.")
            }
            let decision = await DialogCenter.shared.confirm(
                title: L10n.pick("Use Enhanced this round?", "本轮使用增强匹配？"),
                body: body,
                confirmLabel: L10n.isZh ? "消耗 \(cost) 格并进入" : "Spend \(cost) & join",
                cancelLabel: L10n.pick("Join without it", "先不用增强"),
                danger: false)
            guard let d = decision else { return }          // backdrop → abort, toggle untouched
            if !d {
                // "Join without it": toggle off, persist, resync, join plain.
                enhanced.setEnabled(mode, false)
                persistEnhanced()
                resyncSummary()
                useEnhanced = false
            }
        }

        // 3. Optimistic searching render.
        lastEnhancedRound[mode] = useEnhanced
        let optimistic = MatchStatus.optimisticSearching(mode: mode, previous: status[mode])
        status[mode] = optimistic
        render(mode: mode, status: optimistic)

        // 4. POST /matching/start.
        do {
            let result = try await MatchingService.start(mode: mode, enhanced: useEnhanced, cells: mode == .friend ? cells : nil)
            if APIError.isAlreadyMatching(text: result.message) {
                // Server did NOT deduct: reset the round marker, keep the toggle.
                lastEnhancedRound[mode] = false
                ToastCenter.shared.show(useEnhanced
                    ? L10n.pick("Already in this round's pool — leave the pool first to join with Enhanced",
                                "已在本轮匹配池中——请先离开匹配池，再用增强加入")
                    : L10n.pick("Already in the matching pool", "已在匹配池中"))
            } else {
                ToastCenter.shared.show(useEnhanced
                    ? (L10n.isZh ? "已进入匹配池 · 增强（\(cost) 格能量）" : "Entered pool · Enhanced (\(cost) cells)")
                    : L10n.pick("Entered matching pool", "已加入匹配池"))
                await EnergyStore.shared.refresh()
                if useEnhanced {
                    // Per-round payment: only a join that actually deducted resets the toggle.
                    enhanced.setEnabled(mode, false)
                    persistEnhanced()
                    resyncSummary()
                }
            }
        } catch let e as APIError where e.isUnauthorized {
            return
        } catch {
            lastEnhancedRound[mode] = false
            ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
        }

        // 5. Always finish with a reload (re-fetch, re-render, restart polling).
        await reload(mode: mode)
    }

    /// `stopMatch` — `POST /matching/stop?mode=`; no confirm, no refund.
    func stopMatch(mode: MatchMode) async {
        do {
            _ = try await MatchingService.stop(mode: mode)
            ToastCenter.shared.show(L10n.pick("Left matching pool", "已离开匹配池"))
        } catch let e as APIError where e.isUnauthorized {
            return
        } catch {
            ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
        }
        await reload(mode: mode)
    }

    /// `dissolveMatch` — danger confirm card (h5-match §1.14), `POST /matching/:id/dissolve {}`,
    /// toast, reload. Returns true when the match was dissolved. Copy follows the active mode.
    func dissolve(matchId: String, reason: String?) async -> Bool {
        let mode = activeMode
        let ok = await DialogCenter.shared.confirm(
            title: mode == .friend
                ? L10n.pick("End this friendship?", "结束这段好友关系？")
                : L10n.pick("End this relationship?", "结束这段恋爱关系？"),
            body: mode == .friend
                ? L10n.pick("You will no longer be matched as friends.", "你们将不再是彼此的好友。")
                : L10n.pick("This will end your relationship. Neither of you can message anymore.",
                            "这将结束你们的恋爱关系，之后双方都无法再发消息。"),
            confirmLabel: L10n.pick("End", "结束"),
            cancelLabel: L10n.t("Cancel"),
            danger: true)
        guard ok == true else { return false }   // backdrop (nil) is treated as cancel here
        do {
            if matchId.isEmpty {
                try await MatchingService.dissolveLegacy(reason: reason)
            } else {
                try await MatchingService.dissolve(matchId: matchId, reason: reason)
            }
            ToastCenter.shared.show(mode == .friend
                ? L10n.pick("Friendship ended", "好友关系已结束")
                : L10n.pick("Relationship ended", "恋爱关系已结束"))
            await reload(mode: mode)
            return true
        } catch let e as APIError where e.isUnauthorized {
            return false
        } catch {
            ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
            return false
        }
    }

    // MARK: Enhanced toggle / cells (PLAN §E, h5-match §2.10)

    /// Turning on: refresh balance; shortfall → toast + top-up page (returns false, toggle stays
    /// off). Otherwise flips, persists and live-updates the summary box. Turning off always succeeds.
    @discardableResult
    func setEnhanced(mode: MatchMode, enabled: Bool) async -> Bool {
        hydrateEnhanced()
        if enabled {
            await EnergyStore.shared.refresh()
            let cost = mode == .romantic ? EnhancedPrefs.romanticCost : friendCells
            if EnergyStore.shared.available < cost {
                ToastCenter.shared.show(L10n.t("Not enough energy — top up"))
                AppActions.shared.openEnergyPurchase()
                return false
            }
        }
        enhanced.setEnabled(mode, enabled)
        persistEnhanced()
        resyncSummary()
        return true
    }

    /// Friend cells slider: clamp 1…5, persist, live-update the friend summary sub-line.
    func setFriendCells(_ n: Int) {
        hydrateEnhanced()
        enhanced.friendCells = min(max(n, 1), 5)
        persistEnhanced()
        resyncSummary()
    }

    /// == `closeFilterSheet` side effect: publish so summary boxes re-fill (no network call).
    func resyncSummary() {
        summaryVersion &+= 1
    }

    // MARK: Behaviour events (h5-match §2.12)

    /// `viewed` / `openedProfile`, session-deduped; the key is released on failure so it can retry.
    func reportEvent(matchId: String, type: FeedbackEventType) {
        guard !matchId.isEmpty else { return }
        let ev = FeedbackEvent(matchId: matchId, type: type)
        guard !reportedEvents.contains(ev.key) else { return }
        reportedEvents.insert(ev.key)
        Task { [weak self] in
            do {
                _ = try await MatchingService.reportEvents([ev])
            } catch {
                self?.reportedEvents.remove(ev.key)
            }
        }
    }

    // MARK: Reset (`cleanupUserState` + `resetMatchPlanState`)

    func reset() {
        stopPolling()
        isActive = false
        sessionGeneration &+= 1
        viewGeneration &+= 1
        prefsGeneration &+= 1
        prefsSeq = [.romantic: 0, .friend: 0]
        pollFailCount = 0
        status = [:]
        prefs = [:]
        homeView = .chat
        activeMode = .romantic
        enhanced = .default
        enhancedUid = nil
        lastEnhancedRound = [.romantic: false, .friend: false]
        reportedEvents.removeAll()
        romanticPane.reset()
        friendPane.reset()
        summaryVersion &+= 1
    }
}
