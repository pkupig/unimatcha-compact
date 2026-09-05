import SwiftUI

// MARK: - Friend Hub (`#friend-hub-overlay`, h5-addfriend-ads.md §1.1)
//
// Full-page overlay id `friend-hub` (fade + swipe-back; `onDismiss` stops the camera). Shell is
// the shared overlay page bar (64 + safe-top: back arrow + 20/700 title) over the single scroll
// body `px-6 py-8 w-full max-w-md mx-auto`. Exactly one panel is shown — the one the home "+"
// popover asked for; Back always closes (H5 deleted the intermediate "menu" page).
//
//   graph  "Relationship Network" — star graph + closeness caption
//   search "Search & discover"    — contact pill + offline results over the cached sessions
//   qr     "Add by QR"            — My QR / Scan segmented, 176 pt code, scanner + manual entry

struct FriendHubView: View {
    @ObservedObject var vm: FriendHubViewModel

    init(vm: FriendHubViewModel) { self.vm = vm }
    init(panel: FriendHubPanel) { self.vm = FriendHubViewModel(panel: panel) }

    /// `max-w-md` on the body column.
    private static let maxContentWidth: CGFloat = 448
    /// `space-y-4` between the panel's blocks.
    private static let blockSpacing: CGFloat = 16

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(vm.title, onBack: { vm.close() })
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: Self.blockSpacing) {
                    switch vm.panel {
                    case .graph:
                        RelationshipGraphPanel(state: vm.graphState) { node in
                            vm.openNode(node)
                        }
                    case .search:
                        ContactSearchPanel(vm: vm)
                    case .qr:
                        QRPanel(vm: vm)
                    }
                }
                .padding(.horizontal, Theme.Space.page)
                .padding(.vertical, 32)
                .frame(maxWidth: Self.maxContentWidth)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.surface.ignoresSafeArea())
        .onAppear { vm.onAppearIfNeeded() }
    }
}
