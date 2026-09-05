import SwiftUI

// MARK: - Language dialog (h5-i18n.md §1.1, h5-settings.md §1.3; overlay id `language-dialog`)
//
// Centred card (`max-w-xs` 320, surface ground, r16, p-6) on a 40 % black backdrop that closes
// on tap. Title "Language / 语言" (en UI) or "语言 / Language" (zh UI); two fixed options
// 中文 / English with a neon `check_circle` on the selection; Cancel / Confirm. Confirm with a
// changed selection → `LocaleStore.set` (WP-16's `AppRouter` then dismisses everything and
// remounts the tree, D18); same selection or Cancel → just dismiss.

struct LanguageDialog: View {
    static let overlayId = "language-dialog"

    @State private var selection: Lang

    init() {
        _selection = State(initialValue: L10n.lang)
    }

    /// Settings › Language row and the chat "+" popover. WP-16 implements `AppActions.openLanguageDialog` with this.
    @MainActor
    static func present() {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .card(dismissOnBackdrop: true)) {
            LanguageDialog()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.LanguageDialog.title)
                .font(Theme.font(18, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                .foregroundColor(Theme.C.onSurface)
                .padding(.bottom, 16)
            VStack(spacing: 8) {
                option(.zh, label: L10n.LanguageDialog.optionZh)
                option(.en, label: L10n.LanguageDialog.optionEn)
            }
            .padding(.bottom, 24)
            HStack(spacing: 12) {
                Button(action: { LanguageDialog.dismiss() }) {
                    Text(L10n.LanguageDialog.cancel)
                        .font(Theme.font(12, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .overlay(Capsule().stroke(Theme.C.outlineVariant, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
                Button(action: confirm) {
                    Text(L10n.LanguageDialog.confirm)
                        .font(Theme.font(12, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Theme.C.neon)
                        .clipShape(Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            }
        }
        .padding(24)
        .frame(maxWidth: OverlayChrome.cardMaxWidthXs)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.langDialog, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 12)
        .padding(.horizontal, 32)
    }

    /// Option row: px-4 py-3.5 r12 border; selected = neon border + 10 % neon fill; check_circle (FILL 1, 20, neon).
    private func option(_ lang: Lang, label: String) -> some View {
        let selected = selection == lang
        return Button(action: { selection = lang }) {
            HStack {
                Text(label)
                    .font(Theme.font(14, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                Spacer(minLength: 8)
                Image(systemName: Theme.Icon.sf("check_circle", filled: true))
                    .font(.system(size: 20 * 0.82, weight: .regular))
                    .foregroundColor(Theme.C.neon)
                    .frame(width: 20, height: 20)
                    .opacity(selected ? 1 : 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(selected ? Theme.C.neonTint10 : Color.clear)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.plate, style: .continuous)
                    .stroke(selected ? Theme.C.neon : Theme.C.outlineVariant.opacity(0.5), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.plate, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.15), value: selected)
    }

    private func confirm() {
        let target = selection
        LanguageDialog.dismiss()
        guard target != LocaleStore.shared.lang else { return }
        LocaleStore.shared.set(target)
    }
}
