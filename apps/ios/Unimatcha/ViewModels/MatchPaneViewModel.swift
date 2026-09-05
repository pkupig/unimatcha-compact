import Foundation
import Combine

// MARK: - MatchPaneViewModel (h5-match.md §1.2 state matrix, §1.3 pre-heat, gotchas 3–4) — WP-06
//
// One instance per match mode (romantic / friend), owned by `MatchStore` and kept alive for the
// session so both panes stay independently rendered (H5 keeps two plan-page DOMs). It is a pure
// render model: `MatchStore` feeds it status objects, it decides what the pane shows.
//
// Same-state guard (gotcha 4): a 30 s poll that lands in the same plan state (idle→idle,
// searching→searching) does NOT rebuild the plan page — `render` reports `.unchanged`, the
// summary box keeps its scroll position and no preference re-fetch happens. Any other transition
// rebuilds; a rebuild into a plan state reports `.rebuiltPlan` so the store re-fetches preferences
// (H5 `loadPlanData`, per-mode sequence token).

@MainActor
final class MatchPaneViewModel: ObservableObject {
    let mode: MatchMode

    /// What the pane renders (h5-match §1.2 — one case per renderer).
    enum Content: Equatable {
        /// Nothing rendered yet (pre-heat fills this from the cached status).
        case empty
        /// Plan page: idle (`searching == false`) or searching. Plan layout.
        case plan(searching: Bool)
        /// Romantic matched / confirming card (§1.4). Centered layout.
        case matched(match: RomanticMatch, partner: PublicProfile)
        /// Romantic no_match (§1.5). Centered.
        case noMatch(message: String?)
        /// Friend candidates (§1.6), ≤5 rendered. Centered.
        case candidates([FriendMatch])
        /// Friend no_match with no matches (§1.7). Centered.
        case noFriends(message: String?)
        /// Romantic matched/confirming/relationship without `partner.nickname` (§1.8). Centered.
        case partnerMissing
        /// Romantic relationship → Couple Space slot (WP-12). Centered.
        case couple(matchId: String, partner: PublicProfile)
        /// Questionnaire wall (§1.9). Centered.
        case questionnaireWall

        var isPlan: Bool {
            if case .plan = self { return true }
            return false
        }

        var isSearchingPlan: Bool {
            if case .plan(let s) = self { return s }
            return false
        }

        /// H5 `setMatchPlanLayout(mode, on)` — plan layout only for the plan page.
        var usesPlanLayout: Bool { isPlan }
    }

    enum RenderOutcome: Equatable {
        /// Same plan state as before: values only (no rebuild, no preference re-fetch).
        case unchanged
        /// Rebuilt into a plan page → preferences should be (re)fetched.
        case rebuiltPlan
        /// Rebuilt into a non-plan state.
        case rebuilt
    }

    @Published private(set) var content: Content = .empty
    /// Refill banner prepended above any state (§1.10) — set by the store after the real state renders.
    @Published var showRefillBanner: Bool = false
    /// Romantic 48 h deadline (`now + remainingMs` at render), nil when not temp.
    @Published private(set) var remainingDeadline: Date?
    /// Friend per-card deadlines keyed by matchId (`now + remainingMs` at render).
    @Published private(set) var candidateDeadlines: [String: Date] = [:]
    /// Bumped on every render so views can re-derive countdown sources cheaply.
    @Published private(set) var renderVersion: Int = 0

    /// Set by `ensureQuestionnaireThenMatch` when the user is incomplete but not idle.
    var pendingBanner: Bool = false

    init(mode: MatchMode) {
        self.mode = mode
    }

    /// The last status this pane rendered from (for countdown sources on the plan page).
    private(set) var lastStatus: MatchStatus?

    // MARK: Rendering (h5-match §1.2 `renderMatchTab`)

    /// Applies a status. `nil` (load failure with nothing known) renders the idle plan page.
    @discardableResult
    func render(_ status: MatchStatus?) -> RenderOutcome {
        lastStatus = status
        let target = MatchPaneViewModel.content(for: mode, status: status)
        return apply(target, status: status)
    }

    /// Pre-heat (§1.3): render the plan page from the cached status only when the pane is still empty.
    /// Returns true when something was rendered (the store then fetches preferences).
    @discardableResult
    func preheatIfEmpty(cached: MatchStatus?) -> Bool {
        guard content == .empty else { return false }
        let searching = cached?.state == .searching
        lastStatus = cached
        _ = apply(.plan(searching: searching), status: cached)
        return true
    }

    /// Questionnaire wall (§1.9) — replaces whatever the pane shows.
    func showQuestionnaireWall() {
        showRefillBanner = false
        pendingBanner = false
        _ = apply(.questionnaireWall, status: lastStatus)
    }

    private func apply(_ target: Content, status: MatchStatus?) -> RenderOutcome {
        let now = Date()
        // Deadlines are recomputed on every render (remainingMs is relative to "now" — api gotcha 7).
        switch target {
        case .matched(let m, _):
            remainingDeadline = MatchStatus.deadline(remainingMs: m.remainingMs, now: now)
            candidateDeadlines = [:]
        case .candidates(let list):
            remainingDeadline = nil
            var d: [String: Date] = [:]
            for c in list.prefix(5) {
                if let dl = MatchStatus.deadline(remainingMs: c.remainingMs, now: now) { d[c.matchId] = dl }
            }
            candidateDeadlines = d
        default:
            remainingDeadline = nil
            candidateDeadlines = [:]
        }
        renderVersion &+= 1

        if case .plan(let s) = target, case .plan(let cur) = content, s == cur {
            return .unchanged
        }
        content = target
        return target.isPlan ? .rebuiltPlan : .rebuilt
    }

    /// The state matrix (PLAN §C.3 / h5-match §1.2), pure — `nonisolated` so the fixture harness
    /// (and any background caller) can exercise it without hopping to the main actor.
    nonisolated static func content(for mode: MatchMode, status: MatchStatus?) -> Content {
        guard let s = status else { return .plan(searching: false) }
        switch mode {
        case .romantic:
            switch s.state {
            case .idle: return .plan(searching: false)
            case .searching: return .plan(searching: true)
            case .matched, .confirming:
                if let m = s.match, let p = s.partner, let n = p.nickname, !n.isEmpty {
                    return .matched(match: m, partner: p)
                }
                return .partnerMissing
            case .noMatch: return .noMatch(message: s.message)
            case .relationship:
                // H5 gates the couple space on the partner alone and takes the id from
                // `match?.id || matchId` (match.js:622-632). Requiring a non-empty `match.id` here
                // dead-ended a confirmed relationship on "Profile Unavailable".
                if let p = s.partner, let n = p.nickname, !n.isEmpty {
                    let id = s.match?.id ?? s.matchId ?? ""
                    if !id.isEmpty { return .couple(matchId: id, partner: p) }
                }
                return .partnerMissing
            }
        case .friend:
            let list = s.matches
            switch s.state {
            case .idle, .confirming, .relationship:
                // H5 `renderFriendMatchTab` only shows candidates for `matched`; every other raw UMS
                // value (incl. `relationship`, unreachable while `matches` is non-empty because the
                // server rewrites the state to `matched` — api §3.3) falls through to the idle plan.
                return .plan(searching: false)
            case .searching: return .plan(searching: true)
            case .matched: return list.isEmpty ? .plan(searching: false) : .candidates(list)
            case .noMatch: return list.isEmpty ? .noFriends(message: s.message) : .plan(searching: false)
            }
        }
    }

    // MARK: Reset (`sessionDidReset` / account switch)

    func reset() {
        content = .empty
        showRefillBanner = false
        pendingBanner = false
        remainingDeadline = nil
        candidateDeadlines = [:]
        lastStatus = nil
        renderVersion &+= 1
    }
}
