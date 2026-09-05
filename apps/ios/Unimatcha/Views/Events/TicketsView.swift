import SwiftUI

// MARK: - My Tickets wallet (`#tickets-overlay`, h5-square.md §1.8, h5-profile.md §1.10)
//
// Full-page overlay id `tickets` (swipe-back). Bar: back + "My Tickets". Content `pt-24 pb-20 px-5
// max-w-lg mx-auto` — the bar sits in the flow here, so the scroll content pads 32 below it.
// States: "Loading…" (14 pt grey, pt-16) · cloud_off "Failed to load tickets" + Retry · confirmation_number
// "No tickets yet" + subtitle · list of `TicketStubView` (`mb-5`). Every open re-fetches (H5 parity).

struct TicketsView: View {
    @ObservedObject private var vm = TicketsViewModel.shared

    init() {}

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(L10n.t("My Tickets"), onBack: { vm.closeWallet() })
            ScrollView(.vertical, showsIndicators: false) {
                content
                    .padding(.horizontal, 20)
                    .frame(maxWidth: 512)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 32)
                    .padding(.bottom, 80)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.surface)
        .task { await vm.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch vm.state {
        case .idle, .loading:
            LoadingLine(topPadding: 64, bottomPadding: 0)
        case .failed:
            EmptyState(
                material: "cloud_off",
                title: L10n.pick("Failed to load tickets", "门票加载失败"),
                action: (L10n.t("Retry"), { Task { await vm.load() } }),
                topPadding: 64
            )
        case .loaded:
            if vm.tickets.isEmpty {
                EmptyState(
                    material: "confirmation_number",
                    title: L10n.t("No tickets yet"),
                    subtitle: L10n.t("Tickets you get for campus events appear here."),
                    topPadding: 64
                )
            } else {
                LazyVStack(spacing: 20) {
                    ForEach(vm.tickets) { ticket in
                        TicketStubView(ticket: ticket) {
                            vm.openDetail(ticket)
                        }
                    }
                }
            }
        }
    }
}
