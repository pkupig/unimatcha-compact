import SwiftUI

// MARK: - SessionRow (h5-chat.md §1.1 "Session row"; design §8.20) — WP-07
//
// One conversation row: `padding 10 / 17`, `gap 10`, 54 pt avatar, name 15/700 (+ note chip),
// 28-char preview, right column `items-end gap-1.5` with the relative time, the temp countdown
// badge and the unread dot. The 17 pt side padding aligns the avatar with the "+" glyph of the
// home bar; the hairline separator therefore starts at x = 81 (17 + 54 + 10) and stops 17 pt from
// the right — and is not drawn on the last row of each group.
// Temp rows sit on a pale neon band whose first/last row round their outer corners by 12 pt; a row
// whose window has run out fades to 50 % until the next fetch drops it.

struct SessionRow: View {
    let session: ChatSession
    /// Live remaining window (ticked down locally from the fetch-time value).
    let remainingMs: Double
    /// Draw the hairline under this row (false on the last row of a group).
    let showSeparator: Bool
    /// Rounded corners of the temp band (`[]` for confirmed rows).
    let bandCorners: UIRectCorner
    let onTap: () -> Void

    static let avatarSize: CGFloat = 54
    static let horizontalPadding: CGFloat = 17
    static let gap: CGFloat = 10
    static let separatorInset: CGFloat = 81      // 17 + 54 + 10
    static let bandRadius: CGFloat = 12

    private var isTemp: Bool { session.isTemp }
    private var isExpired: Bool { isTemp && remainingMs <= 0 }

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .center, spacing: SessionRow.gap) {
                AvatarView(url: session.partner.avatarUrl,
                           name: session.partner.nickname,
                           size: SessionRow.avatarSize,
                           fallback: .chat)
                textColumn
                rightColumn
            }
            .padding(.vertical, 10)
            .padding(.horizontal, SessionRow.horizontalPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressOpacityButtonStyle())
        .opacity(isExpired ? 0.5 : 1)
        .background(bandBackground)
        .overlay(alignment: .bottom) {
            if showSeparator {
                Theme.C.hairline
                    .frame(height: 1)
                    .padding(.leading, SessionRow.separatorInset)
                    .padding(.trailing, SessionRow.horizontalPadding)
            }
        }
    }

    // MARK: Pieces

    private var textColumn: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(session.partner.displayName)
                    .font(Theme.font(15, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                    .truncationMode(.tail)
                if let note = session.partner.noteChip {
                    Text(note)
                        .font(Theme.font(10, weight: .medium))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.C.container)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous))
                        .layoutPriority(-1)
                }
            }
            preview
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var preview: some View {
        if let text = session.previewText {
            Text(text)
                .font(Theme.font(12))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .lineLimit(1)
                .truncationMode(.tail)
        } else {
            Text(L10n.pick("Start the conversation…", "开始聊天吧…"))
                .font(Theme.font(12))
                .foregroundColor(Theme.C.onSurfaceVariant.opacity(0.5))
                .lineLimit(1)
        }
    }

    private var rightColumn: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if let time = session.lastMessageTime {
                Text(time)
                    .font(Theme.font(10))
                    .foregroundColor(Theme.C.outline)
            }
            if isTemp {
                countdownBadge
            }
            if session.unreadCount > 0 {
                Circle()
                    .fill(Theme.C.neonPink)
                    .frame(width: 8, height: 8)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private var countdownBadge: some View {
        Text(SessionRow.remainingLabel(remainingMs))
            .font(Theme.font(10, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
            .foregroundColor(badgeForeground)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(badgeBackground)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous))
    }

    /// Colours: normal neon tint, **under 1 hour** pink, expired grey (h5-chat §1.1).
    private var badgeBackground: Color {
        if remainingMs <= 0 { return Theme.C.container }
        return remainingMs < 3_600_000 ? Theme.C.pinkTint15 : Theme.C.neonTint15
    }

    private var badgeForeground: Color {
        if remainingMs <= 0 { return Theme.C.outline }
        return remainingMs < 3_600_000 ? Theme.C.neonPink : Theme.C.onSurface
    }

    @ViewBuilder
    private var bandBackground: some View {
        if isTemp {
            Theme.C.neonTint15
                .clipShape(ChatRoundedCorners(radius: SessionRow.bandRadius, corners: bandCorners))
        } else {
            Color.clear
        }
    }

    // MARK: Countdown copy

    /// chat.js `formatRemainingShort`: `Expiring` / `{m}m left` (min 1) / `{h}h left` (hours ceil).
    /// English-only in the H5 — localised here (open decision D3).
    static func remainingLabel(_ ms: Double) -> String {
        guard L10n.isZh else { return Formatters.remainingShort(ms: ms) }
        guard ms > 0, ms.isFinite else { return "即将过期" }
        let mins = Int(ms / 60_000)
        if mins < 60 { return "剩 \(max(1, mins)) 分钟" }
        return "剩 \(Int((Double(mins) / 60).rounded(.up))) 小时"
    }
}

// MARK: - Per-corner rounding (iOS 16 has no `UnevenRoundedRectangle`)

struct ChatRoundedCorners: Shape {
    var radius: CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        guard !corners.isEmpty, radius > 0 else { return Path(rect) }
        let p = UIBezierPath(roundedRect: rect,
                             byRoundingCorners: corners,
                             cornerRadii: CGSize(width: radius, height: radius))
        return Path(p.cgPath)
    }
}
