import SwiftUI

// MARK: - Student Verification popup (`#verify-overlay`, h5-profile.md §1.5; overlay id `verify`)
//
// Centred card (`max-w-sm` 384, mx-6, `surface` ground, r10, shadow, p-6, internal scroll ≤88 %)
// on a dim backdrop that closes on tap. Top-to-bottom: "Student Verification" 16/700 + `close`;
// "Student ID Card" tile 16:10 dashed `outline` (add_a_photo 30 + "Tap to upload"; pulsing
// hourglass while uploading; then the picture); hint 10 `outline`; "School Email" field +
// "Send code" (`btn-secondary` small, → "Sending…" → 60 s countdown); pink code hint; "Verification
// Code" 6-digit input (+0.3em tracking); `.btn-cta` "Submit for review".

struct VerifyCard: View {
    static let overlayId = "verify"

    @StateObject private var vm = VerifyViewModel()
    @State private var pickerPresented = false
    /// `openVerify()` resets once, at open. `onAppear` can fire again (a sheet dismissal, a host
    /// re-composition) and must never wipe an already-uploaded card / typed code.
    @State private var didOpen = false

    init() {}

    /// `#verify-btn` (unverified / rejected only). WP-16 implements `AppActions.openVerify` with this.
    @MainActor
    static func present() {
        // `openVerify()` guards again: nothing to do while pending / verified.
        let state = VerifyBadgeState.from(status: SessionStore.shared.currentUser?.verificationStatus)
        guard state.isTappable else { return }
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .card(dismissOnBackdrop: true)) {
            VerifyCard()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        ViewThatFits(in: .vertical) {
            form
            ScrollView(.vertical, showsIndicators: false) { form }
        }
        .frame(maxWidth: OverlayChrome.cardMaxWidthSm)
        .frame(maxHeight: OverlayChrome.screenSize.height * 0.88)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 12)
        .padding(.horizontal, Theme.Space.page)
        .photoPicker(isPresented: $pickerPresented, limit: 1) { photos in
            guard let first = photos.first else { return }
            Task { await vm.cardPicked(first) }
        }
        .onAppear {
            guard !didOpen else { return }
            didOpen = true
            vm.reset()
        }
    }

    // MARK: Form

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.bottom, 16)

            VerifyLabel(text: L10n.t("Student ID Card"))
                .padding(.bottom, 8)
            cardTile
                .padding(.bottom, 8)
            Text(L10n.t("Upload a clear photo of your student ID — an admin will review it."))
                .font(Theme.font(10))
                .foregroundColor(Theme.C.outline)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 20)

            VerifyLabel(text: L10n.t("School Email"))
                .padding(.bottom, 8)
            HStack(alignment: .center, spacing: 8) {
                SoftField(text: $vm.email,
                          placeholder: L10n.placeholder("you@university.ac.uk"),
                          size: 14,
                          keyboard: .emailAddress,
                          submitLabel: .done)
                CTAButton(title: vm.sendLabel,
                          style: .outlineBlack,
                          size: 10,
                          disabled: vm.sendDisabled,
                          fullWidth: false,
                          paddingV: 8,
                          paddingH: 12,
                          action: { Task { await vm.sendCode() } })
                    .fixedSize()
            }
            if let hint = vm.hint, !hint.isEmpty {
                Text(hint)
                    .font(Theme.font(10))
                    .foregroundColor(Theme.C.neonPink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }

            VerifyLabel(text: L10n.t("Verification Code"))
                .padding(.top, 12)
                .padding(.bottom, 8)
            SoftField(text: $vm.code,
                      placeholder: L10n.placeholder("6-digit code"),
                      size: 16,
                      keyboard: .numberPad,
                      submitLabel: .done,
                      tracking: 0.3)
                .padding(.bottom, 24)

            CTAButton(title: L10n.t("Submit for review"),
                      style: .neon,
                      busy: vm.isSubmitting,
                      action: { submit() })
        }
        .padding(24)
    }

    private var header: some View {
        HStack(alignment: .center) {
            Text(L10n.t("Student Verification"))
                .font(Theme.font(16, weight: .bold))
                .foregroundColor(Theme.C.onSurface)
            Spacer(minLength: 8)
            IconButton(material: "close",
                       size: 32,
                       iconSize: 22,
                       tint: Theme.C.outline,
                       accessibilityLabel: "Close") {
                VerifyCard.dismiss()
            }
        }
    }

    /// `#verify-card-preview`: `aspect-[16/10]` r10, dashed `outline` border, `outline` text.
    private var cardTile: some View {
        Button {
            guard !vm.isUploadingCard else { return }
            pickerPresented = true
        } label: {
            ZStack {
                if let img = vm.cardPreview, vm.hasCard, !vm.isUploadingCard {
                    Color.clear
                        .overlay(
                            Image(uiImage: img)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        )
                        .clipped()
                } else if vm.isUploadingCard {
                    PulsingHourglass()
                } else {
                    VStack(spacing: 6) {
                        MaterialIcon(name: "add_a_photo", size: 30, color: Theme.C.outline)
                        Text(L10n.t("Tap to upload"))
                            .font(Theme.font(10, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                            .foregroundColor(Theme.C.outline)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16.0 / 10.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                    .foregroundColor(Theme.C.outline)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleCard))
        .disabled(vm.isUploadingCard)
        .accessibilityLabel(L10n.t("Tap to upload"))
    }

    private func submit() {
        Task {
            if await vm.submit() {
                VerifyCard.dismiss()
            }
        }
    }
}

// MARK: - Pieces

/// 10/700 tracking-widest `onSurfaceVariant` label (same family as the edit-profile labels).
private struct VerifyLabel: View {
    var text: String
    var body: some View {
        MicroLabel(text: text)
    }
}

/// `hourglass_top` with `.cl-pulse` (1.8 s scale / opacity pulse) while the card uploads.
private struct PulsingHourglass: View {
    @State private var pulsing = false

    var body: some View {
        MaterialIcon(name: "hourglass_top", size: 30, color: Theme.C.outline)
            .scaleEffect(pulsing ? 1.08 : 0.94)
            .opacity(pulsing ? 1 : 0.55)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    pulsing = true
                }
            }
    }
}
