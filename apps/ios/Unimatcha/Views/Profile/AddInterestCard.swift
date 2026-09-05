import SwiftUI

// MARK: - Add Interest popup (`#add-interest-overlay`, h5-profile.md §1.4; overlay id `add-interest`)
//
// Centred card (`max-w-xs` 320, mx-6, `surface` ground, r10, shadow, p-6) on a dim backdrop that
// closes on tap. Title "Add Interest" 16/700 + `close`; input (max 20 chars, 16 pt, placeholder
// "e.g. Photography", Return confirms, focused ~60 ms after open); `.btn-cta` "Add" `mt-6`.
// Semantics (`addInterestValue`): blank → nothing happens (stays open); at the cap → toast, stays
// open; otherwise the trimmed value is appended unless already present, and the card closes.

struct AddInterestCard: View {
    static let overlayId = "add-interest"
    static let maxLength = 20

    @ObservedObject var vm: EditProfileViewModel
    @State private var text = ""
    @FocusState private var focused: Bool

    init(vm: EditProfileViewModel) {
        self.vm = vm
    }

    /// Opened only from the "+ Add" chip of `EditProfileView` (after the cap guard).
    @MainActor
    static func present(vm: EditProfileViewModel) {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .card(dismissOnBackdrop: true)) {
            AddInterestCard(vm: vm)
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text(EditProfileCopy.addInterestTitle)
                    .font(Theme.font(16, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                Spacer(minLength: 8)
                IconButton(material: "close",
                           size: 32,
                           iconSize: 22,
                           tint: Theme.C.outline,
                           accessibilityLabel: "Close") {
                    AddInterestCard.dismiss()
                }
            }
            .padding(.bottom, 16)

            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(L10n.placeholder("e.g. Photography"))
                        .font(Theme.font(16))
                        .foregroundColor(Theme.C.outlineVariantText)
                        .allowsHitTesting(false)
                }
                TextField("", text: $text)
                    .font(Theme.font(16))
                    .foregroundColor(Theme.C.onSurface)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled(true)
                    .submitLabel(.done)
                    .focused($focused)
                    .onSubmit { confirm() }
                    .onChange(of: text) { v in
                        if v.count > Self.maxLength { text = String(v.prefix(Self.maxLength)) }
                    }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Theme.C.containerLow)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(Theme.C.neon, lineWidth: focused ? 1 : 0)
            )
            .contentShape(Rectangle())
            .onTapGesture { focused = true }

            CTAButton(title: L10n.t("Add"), style: .neon, action: { confirm() })
                .padding(.top, 24)
        }
        .padding(24)
        .frame(maxWidth: OverlayChrome.cardMaxWidthXs)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 12)
        .padding(.horizontal, Theme.Space.page)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { focused = true }
        }
    }

    private func confirm() {
        if vm.submitInterest(text) {
            AddInterestCard.dismiss()
        }
    }
}
