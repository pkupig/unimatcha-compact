import SwiftUI

// MARK: - NewPostView (`#overlay-new-post` — h5-square.md §1.6, §2 "New post") — WP-09
//
// Full-page overlay id `new-post`, **no swipe-back** (H5 has no `arrow_back` here). Header
// `h-16 px-6`: "Cancel" (16/500 onSurfaceVariant) — "Publish" neon `rounded-[10px] px-6 py-2`
// pill, disabled while submitting. Body `px-6 py-6 space-y-6`:
//   1. read-only destination chip `place_item` 14 + "Posting to " + **Recommend / Campus Wall**
//   2. title input 24/700 tracking-tight, transparent, placeholder "Title"
//   3. content textarea `min-h-[160px]` 16 leading-relaxed, placeholder "Capture the moment..."
//   4. image grid `grid-cols-4 gap-3`: 80 pt thumbs r10 with a 20 pt black `close` at (−4, −4),
//      plus the 80 pt dashed add tile while fewer than 4
//   5. options card r14 `containerLow`: "Post anonymously" + ink switch; below a hairline the poll
//      row ("Create a poll" + "Goes live after review" 12 pt sub) — only when the origin board is
//      the Campus Wall — and, when on, the 2…6 option rows plus "+ Add option".

struct NewPostView: View {
    @ObservedObject private var vm = NewPostViewModel.shared

    @State private var showPicker = false

    // MARK: Presentation

    /// `openNewPost`: the Campus Wall needs a school on the profile — otherwise toast and send the
    /// user to the Profile tab instead of opening the composer (images would upload for nothing).
    @MainActor
    static func present(board: SquareBoardKind) {
        if board == .campus_wall && !SquareStore.shared.hasSchool {
            ToastCenter.shared.show(L10n.pick("Add your school in your profile first", "请先在资料中填写学校"))
            AppActions.shared.switchTab(.profile)
            return
        }
        NewPostViewModel.shared.open(board: board)
        OverlayRouter.shared.present(AppOverlay(
            id: NewPostViewModel.overlayId,
            style: .fullPage,
            swipeBack: false
        ) {
            NewPostView()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: NewPostViewModel.overlayId)
    }

    // MARK: Body

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.cancelTitleAction(
                cancel: { NewPostView.dismiss() },
                cancelLabel: L10n.t("Cancel"),
                title: "",
                action: FullPageBar.BarAction(label: L10n.t("Publish"),
                                              enabled: !vm.submitting,
                                              busy: vm.submitting,
                                              busyLabel: L10n.t("Publish"),
                                              cornerRadius: Theme.R.base,
                                              horizontalPadding: 24) {
                                                  vm.submit()
                                              }
            )

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    destinationChip
                    titleField
                    contentField
                    imageGrid
                    optionsCard
                }
                .padding(.horizontal, Theme.Space.page)
                .padding(.vertical, Theme.Space.page)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.card.ignoresSafeArea())
        .photoPicker(isPresented: $showPicker, limit: CreatePostRequest.maxImages) { picked in
            vm.addImages(picked)
        }
    }

    // MARK: 1. Destination

    private var destinationChip: some View {
        HStack(spacing: 6) {
            Image(systemName: Theme.Icon.sf("place_item"))
                .font(.system(size: 14 * 0.82, weight: .light))
            Text(L10n.t("Posting to") + " ")
                .font(Theme.font(11))
                .foregroundColor(Theme.C.onSurfaceVariant)
            + Text(vm.boardLabel)
                .font(Theme.font(11, weight: .bold))
                .foregroundColor(Theme.C.onSurface)
        }
        .foregroundColor(Theme.C.onSurfaceVariant)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Theme.C.containerLow)
        .clipShape(Capsule())
    }

    // MARK: 2/3. Text

    private var titleField: some View {
        ZStack(alignment: .leading) {
            if vm.title.isEmpty {
                Text(L10n.placeholder("Title"))
                    .font(Theme.font(24, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 24))
                    .foregroundColor(Theme.C.outlineVariantText)
                    .allowsHitTesting(false)
            }
            TextField("", text: $vm.title)
                .font(Theme.font(24, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 24))
                .foregroundColor(Theme.C.onSurface)
                .submitLabel(.next)
                .onChange(of: vm.title) { v in
                    if v.count > CreatePostRequest.maxTitle {
                        vm.title = String(v.prefix(CreatePostRequest.maxTitle))
                    }
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var contentField: some View {
        ZStack(alignment: .topLeading) {
            if vm.content.isEmpty {
                Text(L10n.placeholder("Capture the moment..."))
                    .font(Theme.font(16))
                    .foregroundColor(Theme.C.outlineVariantText)
                    .padding(.top, 8)
                    .padding(.leading, 5)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $vm.content)
                .font(Theme.font(16))
                .foregroundColor(Theme.C.onSurface)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .frame(minHeight: 160)
                .onChange(of: vm.content) { v in
                    if v.count > CreatePostRequest.maxContent {
                        vm.content = String(v.prefix(CreatePostRequest.maxContent))
                    }
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: 4. Images

    private var imageGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.fixed(80), spacing: 12, alignment: .leading), count: 4),
                  alignment: .leading,
                  spacing: 12) {
            ForEach(Array(vm.images.enumerated()), id: \.element.id) { pair in
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: pair.element.image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 80, height: 80)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                    Button {
                        vm.removeImage(at: pair.offset)
                    } label: {
                        Image(systemName: Theme.Icon.sf("close"))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Theme.C.onPrimary)
                            .frame(width: 20, height: 20)
                            .background(Theme.C.primary)
                            .clipShape(Circle())
                    }
                    .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
                    .offset(x: 4, y: -4)
                }
                .frame(width: 80, height: 80)
            }
            if vm.canAddImages {
                DashedAddTile(size: 80) { showPicker = true }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: 5. Options card

    private var optionsCard: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(L10n.t("Post anonymously"))
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.onSurface)
                Spacer(minLength: 8)
                InkSwitch(isOn: $vm.anonymous)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            if vm.showsPollRow {
                Rectangle().fill(Theme.C.hairline20).frame(height: 1)
                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.t("Create a poll"))
                                .font(Theme.font(14))
                                .foregroundColor(Theme.C.onSurface)
                            Text(L10n.t("Goes live after review"))
                                .font(Theme.font(12))
                                .foregroundColor(Theme.C.onSurfaceVariant)
                        }
                        Spacer(minLength: 8)
                        InkSwitch(isOn: Binding(get: { vm.poll }, set: { vm.setPoll($0) }))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)

                    if vm.poll {
                        pollOptionList
                    }
                }
            }
        }
        .background(Theme.C.containerLow)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.menu, style: .continuous))
    }

    private var pollOptionList: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(vm.pollOptions.enumerated()), id: \.offset) { pair in
                HStack(spacing: 8) {
                    ZStack(alignment: .leading) {
                        if pair.element.isEmpty {
                            Text(L10n.placeholder("Option \(pair.offset + 1)"))
                                .font(Theme.font(14))
                                .foregroundColor(Theme.C.outlineVariantText)
                                .allowsHitTesting(false)
                        }
                        TextField("", text: vm.bindingForOption(pair.offset))
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.onSurface)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.C.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))

                    if vm.canRemovePollOption {
                        Button {
                            vm.removePollOption(at: pair.offset)
                        } label: {
                            Image(systemName: Theme.Icon.sf("close"))
                                .font(.system(size: 18 * 0.82, weight: .light))
                                .foregroundColor(Theme.C.outline)
                                .frame(width: 32, height: 32)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
                        .accessibilityLabel(Text(L10n.pick("Remove option", "删除选项")))
                    }
                }
            }

            Button {
                vm.addPollOption()
            } label: {
                Text(L10n.t("+ Add option"))
                    .font(Theme.font(11, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 11))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .underline()
                    .contentShape(Rectangle())
            }
            .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleWide))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
