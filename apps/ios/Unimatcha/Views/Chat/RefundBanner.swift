import SwiftUI

// MARK: - RefundBanner (h5-chat.md §1.1 / §2.11; h5-notifications.md §D; open decision D7) — WP-07
//
// Energy-refund card pinned above the session list: `px-4 py-3 rounded-[10px] bg-neon/15
// border border-neon/40`, `flex gap-3` with a neon `bolt`, 12 pt medium copy and a trailing
// `close` (16 pt outline). Tapping the card opens the energy-purchase page; the × hides it
// (and the store remembers the notification id so it never comes back this session).

struct RefundBanner: View {
    let info: RefundBannerInfo
    let onTap: () -> Void
    let onClose: () -> Void

    init(info: RefundBannerInfo, onTap: @escaping () -> Void, onClose: @escaping () -> Void) {
        self.info = info
        self.onTap = onTap
        self.onClose = onClose
    }

    var body: some View {
        // The card and the × are *siblings*, never nested buttons: a `Button` inside another
        // `Button`'s label does not reliably receive its own taps on iOS, which would make the ×
        // open the energy page instead of dismissing the banner.
        HStack(spacing: 12) {
            Button(action: onTap) {
                HStack(spacing: 12) {
                    Image(systemName: Theme.Icon.sf("bolt", filled: true))
                        .font(.system(size: 20, weight: .regular))
                        .foregroundColor(Theme.C.neon)
                    Text(info.text)
                        .font(Theme.font(12, weight: .medium))
                        .foregroundColor(Theme.C.onSurface)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressOpacityButtonStyle())

            Button(action: onClose) {
                Image(systemName: Theme.Icon.sf("close"))
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Theme.C.outline)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.C.neonTint15)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.neon.opacity(0.4), lineWidth: 1)
        )
    }
}
