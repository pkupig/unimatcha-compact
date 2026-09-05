import SwiftUI

// MARK: - CommentComposer (post-detail footer — h5-square.md §1.5 "Footer") — WP-09
//
// `border-t` hairline + page ground, `px-3 pt-3`, bottom padding 8 (the overlay already keeps the
// bottom safe area), three optional rows:
//   reply bar     `mb-2` — "Replying to {name}" 10/700 widest onSurfaceVariant | "Cancel" 10/700 outline
//   image preview `mb-2` — 64 pt thumbnail r10 with a 20 pt `black/70` white `close` at (−6, −6)
//   composer row  `gap-1.5` — image 36 round (containerLow/outline) · anonymity 36 round
//                 (`visibility` off / `visibility_off` + neon when on) · input pill (containerLow,
//                 capsule, px-4 py-2.5, 14 pt, placeholder switches with the anonymity state) ·
//                 send 36 round neon with `arrow_upward` 19, disabled while sending.
// Composer-only height ≈ 61 pt + safe area; the measured height is reported so the scroll area can
// pad itself (H5 `--pd-footer-h`).

struct CommentComposer: View {
    @ObservedObject var vm: PostDetailViewModel
    var onHeightChange: (CGFloat) -> Void

    @FocusState private var focused: Bool
    @State private var showPicker = false

    var body: some View {
        VStack(spacing: 0) {
            if let reply = vm.replyTo {
                HStack(spacing: 8) {
                    Text(L10n.pick("Replying to \(reply.nickname)", "正在回复 \(reply.nickname)"))
                        .font(Theme.font(10, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 8)
                    Button {
                        vm.cancelReply()
                        focused = false
                    } label: {
                        Text(L10n.t("Cancel"))
                            .font(Theme.font(10, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                            .foregroundColor(Theme.C.outline)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleWide))
                }
                .padding(.bottom, 8)
            }

            if let photo = vm.pendingImage {
                HStack {
                    ZStack(alignment: .topTrailing) {
                        Image(uiImage: photo.image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                        Button {
                            vm.clearPendingImage()
                        } label: {
                            Image(systemName: Theme.Icon.sf("close"))
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 20, height: 20)
                                .background(Color.black.opacity(0.7))
                                .clipShape(Circle())
                        }
                        .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleSmallIcon))
                        .offset(x: 6, y: -6)
                    }
                    .padding(.trailing, 6)
                    Spacer(minLength: 0)
                }
                .padding(.bottom, 8)
            }

            HStack(spacing: 6) {
                roundButton(material: "image",
                            iconSize: 19,
                            fg: Theme.C.outline,
                            bg: Theme.C.containerLow,
                            label: L10n.pick("Add image", "添加图片")) {
                    showPicker = true
                }

                roundButton(material: vm.anonymous ? "visibility_off" : "visibility",
                            iconSize: 19,
                            fg: vm.anonymous ? .black : Theme.C.outline,
                            bg: vm.anonymous ? Theme.C.neon : Theme.C.containerLow,
                            label: L10n.t("Comment anonymously")) {
                    vm.toggleAnonymous()
                }

                inputPill

                Button {
                    vm.send()
                } label: {
                    Image(systemName: Theme.Icon.sf("arrow_upward"))
                        .font(.system(size: 19 * 0.82, weight: .semibold))
                        .foregroundColor(.black)
                        .frame(width: 36, height: 36)
                        .background(Theme.C.neon)
                        .clipShape(Circle())
                }
                .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleIcon))
                .disabled(vm.sending)
                .opacity(vm.sending ? 0.5 : 1)
                .accessibilityLabel(Text(L10n.t("Send")))
            }
        }
        .padding(.horizontal, Theme.Space.postDetail)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .background(Theme.C.surface)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.C.hairline20).frame(height: 1)
        }
        .background(
            GeometryReader { g in
                Color.clear.preference(key: ComposerHeightKey.self, value: g.size.height)
            }
        )
        .onPreferenceChange(ComposerHeightKey.self) { onHeightChange($0) }
        .photoPicker(isPresented: $showPicker, limit: 1) { picked in
            vm.setPendingImage(picked.first)
        }
        .onChange(of: vm.focusComposerSignal) { _ in
            focused = true
        }
        .onChange(of: focused) { isFocused in
            // Focusing the input always brings the chrome back (H5 `comment-input` focus listener).
            if isFocused { vm.showChrome() }
        }
    }

    private var inputPill: some View {
        ZStack(alignment: .leading) {
            if vm.draft.isEmpty {
                Text(vm.composerPlaceholder)
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.outlineVariantText)
                    .lineLimit(1)
                    .allowsHitTesting(false)
            }
            TextField("", text: $vm.draft)
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurface)
                .submitLabel(.send)
                .focused($focused)
                .autocorrectionDisabled(false)
                .onSubmit { vm.send() }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.containerLow)
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(Theme.C.neon, lineWidth: focused ? 1 : 0)
        )
        .contentShape(Capsule())
        .onTapGesture { focused = true }
    }

    private func roundButton(material: String,
                             iconSize: CGFloat,
                             fg: Color,
                             bg: Color,
                             label: String,
                             action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: Theme.Icon.sf(material))
                .font(.system(size: iconSize * 0.82, weight: .light))
                .foregroundColor(fg)
                .frame(width: 36, height: 36)
                .background(bg)
                .clipShape(Circle())
        }
        .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleIcon))
        .accessibilityLabel(Text(label))
    }
}

struct ComposerHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = PostDetailViewModel.defaultFooterHeight
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        let next = nextValue()
        if next > 0 { value = next }
    }
}
