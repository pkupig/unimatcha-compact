import SwiftUI

// MARK: - ChatComposerView (h5-chat.md §1.3 composer, §2.5–§2.6, §2.14; design §8.20) — WP-07
//
// `bg-surface-container-low`, 1 pt top hairline, `py-3 px-4` (+ the bottom safe area, which the
// full-page overlay already applies). Stack:
//   dissolved notice   centred 10 pt tracking-widest `neutral-400`, `mb-2`
//   pending image      80 pt thumb `rounded-[10px] border outline-variant/40` with a 20 pt pink
//                      `close` badge at `-top-1.5 -right-1.5`
//   input row          40 pt `add` button (neutral-500) · rounded-[18px] white field ·
//                      40 pt neon circle with `arrow_upward`
// Enter sends (the H5 preventDefaults the newline); on iOS the return key inserts a newline into
// the vertical-axis field, so a trailing newline is detected, stripped and sent — same result.

struct ChatComposerView: View {
    @ObservedObject var vm: ChatViewModel

    @State private var showPicker = false
    @FocusState private var focused: Bool

    private var locked: Bool { vm.context.isDissolved }

    var body: some View {
        VStack(spacing: 0) {
            if locked {
                Text(L10n.t("This connection has ended. You can no longer send messages."))
                    .font(Theme.font(10))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                    .foregroundColor(Theme.C.neutral400)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 8)
            }
            if let pending = vm.pendingImage {
                pendingThumb(pending)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)
            }
            inputRow
        }
        .padding(.horizontal, Theme.Space.chat)
        .padding(.vertical, 12)
        .background(
            Theme.C.containerLow
                .overlay(alignment: .top) { Theme.C.hairline20.frame(height: 1) }
        )
        .sheet(isPresented: $showPicker) {
            PhotoPicker(limit: 1) { picked in
                showPicker = false
                if let p = picked.first {
                    vm.setPendingImage(p)
                    focused = true
                }
            } onCancel: {
                showPicker = false
            }
            .ignoresSafeArea()
        }
    }

    // MARK: Rows

    private var inputRow: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Button {
                showPicker = true
            } label: {
                Image(systemName: Theme.Icon.sf("add"))
                    .font(.system(size: 22, weight: .light))
                    .foregroundColor(Theme.C.neutral500)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(locked)
            .opacity(locked ? 0.5 : 1)

            TextField(vm.composerPlaceholder, text: $vm.draft, axis: .vertical)
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(1...5)
                .textInputAutocapitalization(.sentences)
                .focused($focused)
                .disabled(locked)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Theme.C.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.bubble, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.bubble, style: .continuous)
                        .stroke(focused ? Theme.C.neon : Color.clear, lineWidth: 1)
                )
                .onChange(of: vm.draft) { value in
                    // Return key → send (the H5 blocks the newline entirely).
                    guard value.hasSuffix("\n") else { return }
                    var trimmed = value
                    while trimmed.hasSuffix("\n") { trimmed.removeLast() }
                    vm.draft = trimmed
                    if !trimmed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.pendingImage != nil {
                        vm.send()
                    }
                }

            Button {
                vm.send()
            } label: {
                Image(systemName: Theme.Icon.sf("arrow_upward"))
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.black)
                    .frame(width: 40, height: 40)
                    .background(Theme.C.neon)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            .disabled(!vm.canSend)
            .opacity(vm.canSend ? 1 : 0.5)
            .accessibilityLabel(L10n.t("Send"))
        }
        .frame(maxWidth: .infinity)
    }

    private func pendingThumb(_ photo: PickedPhoto) -> some View {
        ZStack(alignment: .topTrailing) {
            Image(uiImage: photo.image)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 80, height: 80)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .stroke(Theme.C.outlineVariant.opacity(0.4), lineWidth: 1)
                )
            Button {
                vm.clearPendingImage()
            } label: {
                Image(systemName: Theme.Icon.sf("close"))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 20, height: 20)
                    .background(Theme.C.neonPink)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.9))
            .offset(x: 6, y: -6)
        }
        .padding(.top, 6)
        .padding(.trailing, 6)
    }
}
