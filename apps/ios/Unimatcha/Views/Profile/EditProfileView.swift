import SwiftUI

// MARK: - Edit Profile overlay (`#edit-profile-overlay`, h5-profile.md §1.3; overlay id `edit-profile`)
//
// Full page (fade, NO swipe-back — the bar has "Cancel", no arrow). `FullPageBar` Cancel / "Edit
// Profile" 18/800 / neon Save pill (busy → "Saving…"). Body scrolls `px-6 pt-6 pb-32 space-y-9`:
//   avatar 96 (+ 28 pt neon camera badge) beside the cover `h-24 rounded-[12px]` (+ badge)
//   fields (Nickname · Real name 2-col · Bio + counter · Signature + counter · 2-col grid of
//   Gender / Birthday / School / Grade / City / Major / MBTI / Nationality / Student ID)
//   Interests (neon chips + dashed "+ Add") · Photo Portfolio (3×2 grid) · Gift jar (5 inputs)
// with a 96 pt bottom fade. Avatar / cover / photos persist immediately; the rest on Save.

struct EditProfileView: View {
    static let overlayId = "edit-profile"

    private enum PickTarget { case avatar, cover, photo }

    @StateObject private var vm = EditProfileViewModel()
    @State private var pickTarget: PickTarget? = nil
    @State private var pickerPresented = false

    init() {}

    /// Profile tab "Edit Profile" row. WP-16 implements `AppActions.openEditProfile` with this.
    @MainActor
    static func present() {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .fullPage, swipeBack: false) {
            EditProfileView()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.cancelTitleAction(
                cancel: { EditProfileView.dismiss() },
                title: L10n.t("Edit Profile"),
                action: FullPageBar.BarAction(label: L10n.t("Save"),
                                              busy: vm.isSaving,
                                              busyLabel: L10n.t("Saving…"),
                                              action: { save() })
            )
            ZStack(alignment: .bottom) {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 36) {
                        avatarCoverRow
                        EditProfileFieldsView(vm: vm)
                        EditInterestsSection(vm: vm)
                        photosSection
                        EditGiftJarSection(vm: vm)
                    }
                    .padding(.horizontal, Theme.Space.page)
                    .padding(.top, 24)
                    .padding(.bottom, 128)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollDismissesKeyboard(.interactively)
                // `.bottom-sheet-gradient` 96 pt, `rgba(249,249,249,.5)`, pointer-events none.
                LinearGradient(colors: [Theme.C.surface.opacity(0), Theme.C.surface.opacity(0.5)],
                               startPoint: .top,
                               endPoint: .bottom)
                    .frame(height: 96)
                    .allowsHitTesting(false)
            }
        }
        .background(Theme.C.surface.ignoresSafeArea())
        .photoPicker(isPresented: $pickerPresented, limit: 1) { photos in
            guard let first = photos.first, let target = pickTarget else { return }
            pickTarget = nil
            Task {
                switch target {
                case .avatar: await vm.avatarPicked(first)
                case .cover: await vm.coverPicked(first)
                case .photo: await vm.photoPicked(first)
                }
            }
        }
        .onAppear { vm.onOpen() }
    }

    // MARK: Avatar + cover row

    private var avatarCoverRow: some View {
        HStack(alignment: .center, spacing: 16) {
            avatarButton
            coverButton
        }
    }

    /// `#edit-avatar`: 96 circle `surface-container-low`, 1 pt `outlineVariant/40` border, image or
    /// `add_a_photo` 30 + "Add Photo" 9/700; neon 28 pt camera badge bottom-right.
    private var avatarButton: some View {
        Button {
            guard !vm.isUploadingAvatar else { return }
            pick(.avatar)
        } label: {
            ZStack {
                Circle().fill(Theme.C.containerLow)
                if SafeURL.isSafe(vm.avatarUrl) {
                    RemoteImage(url: vm.avatarUrl, contentMode: .fill, placeholderColor: Theme.C.containerLow)
                        .frame(width: 96, height: 96)
                        .clipShape(Circle())
                } else {
                    VStack(spacing: 4) {
                        MaterialIcon(name: "add_a_photo", size: 30, color: Theme.C.onSurfaceVariant)
                        Text(EditProfileCopy.addPhoto)
                            .font(Theme.font(9, weight: .bold))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .lineLimit(1)
                    }
                }
            }
            .frame(width: 96, height: 96)
            .clipShape(Circle())
            .overlay(Circle().stroke(Theme.C.outlineVariant.opacity(0.4), lineWidth: 1))
            .overlay(alignment: .bottomTrailing) { cameraBadge }
            .opacity(vm.isUploadingAvatar ? 0.6 : 1)
            .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
        .disabled(vm.isUploadingAvatar)
        .accessibilityLabel(EditProfileCopy.addPhoto)
    }

    /// `#edit-cover-preview`: flex-1 h-24 rounded-[12px] cover (grey placeholder), badge `bottom-2 right-2`.
    private var coverButton: some View {
        Button {
            guard !vm.isUploadingCover else { return }
            pick(.cover)
        } label: {
            ZStack {
                if SafeURL.isSafe(vm.coverUrl) {
                    RemoteImage(url: vm.coverUrl, contentMode: .fill, placeholderColor: Theme.C.containerHighest)
                } else {
                    Theme.C.containerHighest
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 96)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.plate, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                cameraBadge.padding(8)
            }
            .opacity(vm.isUploadingCover ? 0.6 : 1)
            .contentShape(RoundedRectangle(cornerRadius: Theme.R.plate, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleCard))
        .disabled(vm.isUploadingCover)
        .accessibilityLabel(L10n.pick("Cover", "封面"))
    }

    /// 28 pt neon circle with `photo_camera` 15.
    private var cameraBadge: some View {
        ZStack {
            Circle().fill(Theme.C.neon)
            MaterialIcon(name: "photo_camera", size: 15, filled: true, weight: .regular, color: .black)
        }
        .frame(width: 28, height: 28)
    }

    // MARK: Photo Portfolio

    private var photosSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            EditFieldLabel(text: L10n.t("Photo Portfolio"))
            PhotoGridView(photos: vm.realPhotos,
                          busy: vm.isUploadingPhoto || vm.isRemovingPhoto,
                          onAdd: {
                              guard vm.canPickPhoto() else { return }
                              pick(.photo)
                          },
                          onRemove: { i in Task { await vm.removePhoto(at: i) } })
        }
    }

    // MARK: Actions

    private func pick(_ target: PickTarget) {
        pickTarget = target
        pickerPresented = true
    }

    private func save() {
        Task {
            if await vm.save() {
                EditProfileView.dismiss()
            }
        }
    }
}
