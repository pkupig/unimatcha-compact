import SwiftUI

// MARK: - CoupleSpaceView (h5-couple.md §1.1 — the Romantic pane in `relationship` state) — WP-12
//
// NOT an overlay: `MatchPaneView` renders this through its `coupleSpace` slot, inside the pane's
// own scroll view (padding `56+sat / 24 / 208`). The hub therefore only contributes the H5 root
// wrapper `w-full max-w-xl mx-auto py-4` and stacks its sections with `mb-5` (20 pt).
//
// Three states: Loading / Load failed (+ inline `Retry`) / Hub.

struct CoupleSpaceView: View {
    let matchId: String
    let partner: PublicProfile?

    @ObservedObject private var vm = CoupleViewModel.shared

    /// Last `MatchStore.homeView` seen, so only a real transition *into* the Romantic pane
    /// re-reads the space (the publisher replays its current value on subscribe).
    @State private var lastHomeView: HomeView?

    init(matchId: String, partner: PublicProfile?) {
        self.matchId = matchId
        self.partner = partner
    }

    var body: some View {
        content
            .frame(maxWidth: CoupleLayout.maxWidth)
            .frame(maxWidth: .infinity)
            .task(id: matchId) {
                await vm.activate(matchId: matchId, partner: partner)
            }
            .onReceive(MatchStore.shared.$homeView) { view in
                let previous = lastHomeView
                lastHomeView = view
                guard let previous = previous, previous != .romantic, view == .romantic else { return }
                Task { await vm.refreshOnPaneEnter() }
            }
    }

    @ViewBuilder
    private var content: some View {
        if let space = vm.space {
            hub(space)
        } else if vm.phase == .failed {
            failedState
        } else {
            loadingState
        }
    }

    // MARK: State A — Loading

    private var loadingState: some View {
        Text(L10n.pick("Loading your space…", "正在加载你们的空间…"))
            .font(Theme.font(14))
            .foregroundColor(Theme.C.outline)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
    }

    // MARK: State B — Load failed

    private var failedState: some View {
        HStack(spacing: 4) {
            Text(L10n.pick("Couldn't load your space.", "无法加载你们的空间。"))
                .font(Theme.font(14))
                .foregroundColor(Theme.C.outline)
            Button {
                Task { await vm.load() }
            } label: {
                Text(L10n.t("Retry"))
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.outline)
                    .underline()
            }
            .buttonStyle(PressOpacityButtonStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: State C — Hub

    private func hub(_ space: CoupleSpace) -> some View {
        VStack(alignment: .leading, spacing: CoupleLayout.sectionGap) {
            CoupleHeroCard(space: space, vm: vm)
            CoupleAnniversariesSection(space: space, vm: vm)
            CoupleCravingSection(space: space, vm: vm)
            CoupleScheduleSection(space: space, vm: vm)
            CoupleBucketSection(space: space, vm: vm)
            CoupleGiftJarRow(space: space, vm: vm)
            CoupleActions(space: space, vm: vm)
        }
        .padding(.vertical, 16)                 // py-4
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Shared metrics (h5-couple §1.1 State C)

enum CoupleLayout {
    /// `max-w-xl` (36 rem).
    static let maxWidth: CGFloat = 576
    /// `mb-5` between every section.
    static let sectionGap: CGFloat = 20
    /// Section header → body (`mb-3`).
    static let headerGap: CGFloat = 12
    /// `grid-cols-2 gap-3` (craving / schedule / status grid).
    static let columnGap: CGFloat = 12
    /// `p-3` cell padding for the craving & schedule columns.
    static let cellPadding: CGFloat = 12
    /// `p-6` hero padding.
    static let heroPadding: CGFloat = 24
    /// Schedule column cap before it scrolls (`max-h-64`, more than 4 entries).
    static let scheduleMaxHeight: CGFloat = 256
    static let scheduleScrollThreshold = 4
}
