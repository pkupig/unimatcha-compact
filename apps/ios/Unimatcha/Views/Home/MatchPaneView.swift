import SwiftUI

// MARK: - MatchPaneView (h5-match.md §1.1 pane layouts, §1.2 state switch, §1.3 pre-heat) — WP-06
//
// One pane of the home track for a match mode. Two layouts (H5 `setMatchPlanLayout`):
//   plan      padding `64+sat / 30 / 96+sab`, overflow hidden — the page never scrolls, only the
//             summary-box body scrolls (idle / searching)
//   centered  padding `56+sat / 24 / 208`, content vertically centred when short, top-aligned and
//             scrollable when tall (matched / no_match / candidates / couple / partner-missing / wall)
// The refill banner (§1.10) is prepended above any state. Ticks (1 s) run only while
// `MatchStore.isActive` (switchTab away stops them, like H5 `stopCountdownTick`).

struct MatchPaneView: View {
    let mode: MatchMode
    let safeTop: CGFloat
    let safeBottom: CGFloat
    let coupleSpace: (_ matchId: String, _ partner: PublicProfile) -> AnyView

    @ObservedObject private var store = MatchStore.shared
    @ObservedObject private var vm: MatchPaneViewModel
    @State private var now = Date()

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(mode: MatchMode, safeTop: CGFloat, safeBottom: CGFloat,
         coupleSpace: @escaping (_ matchId: String, _ partner: PublicProfile) -> AnyView) {
        self.mode = mode
        self.safeTop = safeTop
        self.safeBottom = safeBottom
        self.coupleSpace = coupleSpace
        self._vm = ObservedObject(wrappedValue: MatchStore.shared.pane(mode))
    }

    var body: some View {
        Group {
            if vm.content.usesPlanLayout {
                planLayout
            } else {
                centeredLayout
            }
        }
        .background(Theme.C.surface)
        .onReceive(ticker) { t in
            if store.isActive { now = t }
        }
    }

    // MARK: Plan layout (idle / searching)

    private var planLayout: some View {
        VStack(alignment: .leading, spacing: 0) {
            if vm.showRefillBanner {
                QuestionnaireRefillBanner(mode: mode)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 16)
            }
            MatchPlanView(mode: mode,
                          searching: vm.content.isSearchingPlan,
                          revealDate: RevealSchedule.nextReveal(status: vm.lastStatus, now: now),
                          now: now)
        }
        .padding(.top, 64 + safeTop)
        .padding(.horizontal, Theme.Space.plan)
        .padding(.bottom, 96 + safeBottom)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .clipped()
    }

    // MARK: Centered layout (everything else)

    private var centeredLayout: some View {
        GeometryReader { geo in
            let topPad = Theme.Bar.home + safeTop
            let bottomPad: CGFloat = 208
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    if vm.showRefillBanner {
                        QuestionnaireRefillBanner(mode: mode)
                            .frame(maxWidth: 320)
                            .padding(.bottom, 16)
                    }
                    stateContent
                }
                .frame(maxWidth: .infinity)
                .padding(.top, topPad)
                .padding(.horizontal, Theme.Space.page)
                .padding(.bottom, bottomPad)
                .frame(minHeight: geo.size.height, alignment: .center)
            }
        }
    }

    @ViewBuilder
    private var stateContent: some View {
        switch vm.content {
        case .empty, .plan:
            EmptyView()
        case .matched(let match, let partner):
            MatchedCardView(match: match,
                            partner: partner,
                            deadline: vm.remainingDeadline,
                            now: now,
                            onExpired: { Task { await store.reload(mode: .romantic) } })
        case .noMatch(let message):
            NoMatchCard(mode: .romantic, message: message)
        case .candidates(let list):
            FriendCandidatesView(matches: list,
                                 deadlines: vm.candidateDeadlines,
                                 now: now,
                                 onExpired: { Task { await store.reload(mode: .friend) } })
        case .noFriends(let message):
            NoMatchCard(mode: .friend, message: message)
        case .partnerMissing:
            PartnerMissingCard(mode: mode)
        case .couple(let matchId, let partner):
            coupleSpace(matchId, partner)
        case .questionnaireWall:
            QuestionnaireWallCard(mode: mode)
        }
    }
}
