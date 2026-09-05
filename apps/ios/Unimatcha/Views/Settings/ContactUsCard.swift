import SwiftUI
import UIKit

// MARK: - Contact Us modal (h5-settings.md §1.7, §2.11; overlay id `contact`)
//
// Centred card (`max-w-sm` 384, p-8, r10, white/card ground, text-centred) on a dim backdrop that
// does NOT close on tap (no swipe-back either — only a `close` glyph-less "Close" button).
//   mail_outline 36 `primary` → "Contact Us" 18/700 → "Questions, feedback or partnership
//   inquiries:" 14 variant → contact@unimatcha.ai 14/700 → Send Email (neon, mailto:) → Close.

struct ContactUsCard: View {
    static let overlayId = "contact"
    static let email = SettingsViewModel.contactEmail

    init() {}

    /// Profile tab "Contact Us" row. WP-16 implements `AppActions.openContactUs` with this.
    @MainActor
    static func present() {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .card(dismissOnBackdrop: false)) {
            ContactUsCard()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        VStack(spacing: 0) {
            MaterialIcon(name: "mail_outline", size: 36, color: Theme.C.primary)
                .padding(.bottom, 16)
            Text(L10n.t("Contact Us"))
                .font(Theme.font(18, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                .foregroundColor(Theme.C.onSurface)
                .padding(.bottom, 12)
            Text(L10n.t("Questions, feedback or partnership inquiries:"))
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 4)
            Text(ContactUsCard.email)
                .font(Theme.font(14, weight: .bold))
                .foregroundColor(Theme.C.onSurface)
                .textSelection(.enabled)
                .padding(.bottom, 32)
            Button(action: sendEmail) {
                Text(L10n.t("Send Email"))
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Theme.C.neon)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
            .padding(.bottom, 12)
            Button(action: { ContactUsCard.dismiss() }) {
                Text(L10n.t("Close"))
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                    .foregroundColor(Theme.C.onSurface)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                            .stroke(Theme.C.outlineVariant, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
        }
        .padding(32)
        .frame(maxWidth: OverlayChrome.cardMaxWidthSm)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 12)
        .padding(.horizontal, 32)
    }

    /// `mailto:contact@unimatcha.ai` (opens Mail; silently no-op when no mail client is configured).
    private func sendEmail() {
        guard let url = URL(string: "mailto:\(ContactUsCard.email)") else { return }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}
