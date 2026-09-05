import SwiftUI

// MARK: - SquareSearchView (`#square-search-overlay` — h5-square.md §1.4; PLAN §C.5 last row) — WP-09
//
// Full-page overlay id `square-search`, swipe-back. Header `h-16` + top inset, glass ground,
// hairline below, row `px-4 gap-3`: 24 pt `arrow_back` · search pill (`containerLow`, capsule,
// `px-4 py-2.5`: 19 pt `search` glyph, the field, an 18 pt `close` clear button while non-empty) ·
// neon "Search" pill (`px-4 py-2.5`, 12/700 tracking-widest, black).
// Body `px-1.5 pt-2 pb-16`: the shared WP-08 masonry (`SquareCardGrid`, board `.search` → small
// cards for recommend posts, wide for campus-wall posts, large/text for official ones, comment
// snippets when the hit came from a comment) — **never any ads**.

struct SquareSearchView: View {
    @ObservedObject private var vm = SquareSearchViewModel.shared
    @ObservedObject private var store = SquareStore.shared
    @Environment(\.overlaySafeInsets) private var envInsets

    @FocusState private var focused: Bool

    // MARK: Presentation

    @MainActor
    static func present() {
        SquareSearchViewModel.shared.open()
        OverlayRouter.shared.present(AppOverlay(
            id: SquareSearchViewModel.overlayId,
            style: .fullPage,
            swipeBack: true,
            onDismiss: { SquareSearchViewModel.shared.close() }
        ) {
            SquareSearchView()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: SquareSearchViewModel.overlayId)
    }

    // MARK: Body

    var body: some View {
        let safeTop = OverlayChrome.resolvedInsets(envInsets).top
        VStack(spacing: 0) {
            header(safeTop: safeTop)
            ScrollView(.vertical, showsIndicators: false) {
                content
                    .padding(.horizontal, SquareCardMetrics.outerPadding)
                    .padding(.top, 8)
                    .padding(.bottom, 64)
                    .frame(maxWidth: .infinity, alignment: .top)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.surface.ignoresSafeArea())
        .onAppear {
            // H5 focuses the field 60 ms after opening.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { focused = true }
        }
        .onChange(of: vm.focusSignal) { _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { focused = true }
        }
        .onChange(of: vm.blurSignal) { _ in focused = false }
    }

    // MARK: Header

    private func header(safeTop: CGFloat) -> some View {
        HStack(spacing: 12) {
            Button {
                SquareSearchView.dismiss()
            } label: {
                Image(systemName: Theme.Icon.sf("arrow_back"))
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(Theme.C.onSurface)
                    .frame(width: 24, height: 24)
                    .padding(6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleWide))
            .padding(.leading, -6)

            searchPill

            Button {
                vm.runNow()
            } label: {
                Text(L10n.t("Search"))
                    .font(Theme.font(12, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                    .foregroundColor(.black)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Theme.C.neon)
                    .clipShape(Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleWide))
        }
        .padding(.horizontal, 16)
        .frame(height: Theme.Bar.overlay)
        .padding(.top, safeTop)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                Theme.C.glassBar
            }
            .ignoresSafeArea(edges: .top)
        )
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.C.hairline20).frame(height: 1)
        }
    }

    private var searchPill: some View {
        HStack(spacing: 8) {
            Image(systemName: Theme.Icon.sf("search"))
                .font(.system(size: 19 * 0.82, weight: .light))
                .foregroundColor(Theme.C.outline)
                .frame(width: 19, height: 19)

            ZStack(alignment: .leading) {
                if vm.query.isEmpty {
                    Text(L10n.placeholder("Search posts"))
                        .font(Theme.font(14))
                        .foregroundColor(Theme.C.outlineVariantText)
                        .lineLimit(1)
                        .allowsHitTesting(false)
                }
                TextField("", text: Binding(get: { vm.query }, set: { vm.onQueryChange($0) }))
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.onSurface)
                    .autocorrectionDisabled(false)
                    .textInputAutocapitalization(.never)
                    .submitLabel(.search)
                    .focused($focused)
                    .onSubmit { vm.runNow() }
            }

            if vm.hasQuery {
                Button {
                    vm.clear()
                } label: {
                    Image(systemName: Theme.Icon.sf("close"))
                        .font(.system(size: 18 * 0.82, weight: .light))
                        .foregroundColor(Theme.C.outline)
                        .frame(width: 18, height: 18)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
                .accessibilityLabel(Text(L10n.t("Cancel")))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.containerLow)
        .clipShape(Capsule())
        .contentShape(Capsule())
        .onTapGesture { focused = true }
    }

    // MARK: States

    @ViewBuilder private var content: some View {
        switch vm.state {
        case .idle:
            EmptyState(material: "search",
                       title: L10n.t("Search the square"),
                       subtitle: L10n.t("Find posts by title, content or tag"),
                       bottomPadding: 96)
        case .loading:
            Text(L10n.t("Loading..."))
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 96)
        case .error:
            EmptyState(material: "cloud_off",
                       title: L10n.t("Failed to load posts"),
                       subtitle: L10n.t("Check your connection and try again"),
                       action: (L10n.t("Retry"), { vm.retry() }),
                       bottomPadding: 96)
        case .empty:
            EmptyState(material: "grid_view",
                       title: L10n.t("No posts found"),
                       subtitle: L10n.t("Try a different keyword"),
                       bottomPadding: 96)
        case .results:
            SquareCardGrid(board: .search, items: store.posts(of: .search).map { SquareFeedItem.post($0) })
        }
    }
}
