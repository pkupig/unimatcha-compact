import SwiftUI

// MARK: - Badge (h5-design-system.md §8.5)
//
// Base: inline-flex, gap 4, padding 2/8, radius 10, 9 pt, line-height 1.4.
//   .school(text)   `.school-badge`: black/40 scrim + 4 pt blur, white, 700 tracking .08em, max-width 144 (9rem), ellipsis;
//                   `neon: true` = `--neon` variant (neon bg / black text).
//   .official(text) `.official-badge`: rgba(27,27,27,.4) scrim + blur, white 700 .08em ("Student Union · Org", "Official").
//   .sponsored      neon bg, black, 800 .1em uppercase "SPONSORED".
//   .pinned         black/75 bg, **neon** text, 800 .1em uppercase "PINNED".
//   .event          EVENT chip: px-2 py-0.5, r8, neon/black, 9/700 widest.
//   .underReview    px-2 py-0.5, r8, containerHigh bg, onSurfaceVariant.
//   .rejected       px-2 py-0.5, r8, pink/15 bg, pink text.

struct Badge: View {
    enum Kind: Equatable {
        case school(String, neon: Bool = false)
        case official(String)
        case sponsored
        case pinned
        case event
        case underReview
        case rejected
    }

    var kind: Kind
    var sf: String? = nil          // optional leading symbol (14 pt)

    static func official(_ text: String) -> Badge { Badge(kind: .official(text)) }
    static func school(_ text: String, neon: Bool = false) -> Badge { Badge(kind: .school(text, neon: neon)) }
    static var sponsored: Badge { Badge(kind: .sponsored) }
    static var pinned: Badge { Badge(kind: .pinned) }
    static var event: Badge { Badge(kind: .event) }
    static var underReview: Badge { Badge(kind: .underReview) }
    static var rejected: Badge { Badge(kind: .rejected) }

    var body: some View {
        HStack(spacing: 4) {
            if let sf = sf {
                Image(systemName: sf)
                    .font(.system(size: 11, weight: .medium))
                    .frame(width: 14, height: 14)
            }
            Text(label)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .font(Theme.font(9, weight: weight))
        .tracking(Theme.tracking(trackingEm, size: 9))
        .foregroundColor(foreground)
        .padding(.horizontal, 8)
        .padding(.vertical, 2)
        .frame(maxWidth: maxWidth)
        .fixedSize(horizontal: maxWidth == nil, vertical: true)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    private var label: String {
        switch kind {
        case .school(let t, _): return t
        case .official(let t): return t
        case .sponsored: return L10n.t("Sponsored").uppercased()
        case .pinned: return L10n.t("PINNED").uppercased()
        case .event: return L10n.t("EVENT").uppercased()
        case .underReview: return L10n.t("UNDER REVIEW").uppercased()
        case .rejected: return L10n.t("REJECTED").uppercased()
        }
    }

    private var weight: Font.Weight {
        switch kind {
        case .sponsored, .pinned: return .heavy
        default: return .bold
        }
    }

    private var trackingEm: CGFloat {
        switch kind {
        case .school, .official: return Theme.Tracking.badge
        default: return Theme.Tracking.widest
        }
    }

    private var radius: CGFloat {
        switch kind {
        case .event, .underReview, .rejected: return Theme.R.eventChip
        default: return Theme.R.base
        }
    }

    private var maxWidth: CGFloat? {
        if case .school = kind { return 144 }
        return nil
    }

    private var foreground: Color {
        switch kind {
        case .school(_, let neon): return neon ? .black : .white
        case .official: return .white
        case .sponsored, .event: return .black
        case .pinned: return Theme.C.neon
        case .underReview: return Theme.C.onSurfaceVariant
        case .rejected: return Theme.C.neonPink
        }
    }

    @ViewBuilder private var background: some View {
        switch kind {
        case .school(_, let neon):
            if neon { Theme.C.neon } else { Theme.C.scrimBadge.background(.ultraThinMaterial) }
        case .official:
            Theme.C.scrimBadge.background(.ultraThinMaterial)
        case .sponsored, .event:
            Theme.C.neon
        case .pinned:
            Theme.C.scrimPinned
        case .underReview:
            Theme.C.containerHigh
        case .rejected:
            Theme.C.pinkTint15
        }
    }
}

// MARK: - Small status badges

/// `#notif-badge`: neon circle `min-w 16 h-4 px-1`, 10/700 black. Hidden when `count == 0`.
struct CountBadge: View {
    var count: Int
    var max: Int = 99

    var body: some View {
        if count > 0 {
            Text(count > max ? "\(max)+" : "\(count)")
                .font(Theme.font(10, weight: .bold))
                .foregroundColor(.black)
                .padding(.horizontal, 4)
                .frame(minWidth: 16, minHeight: 16)
                .frame(height: 16)
                .background(Theme.C.neon)
                .clipShape(Capsule())
        }
    }
}

/// 8 pt unread dot (`neonPink` on session rows, `neon` on notification plates).
struct UnreadDot: View {
    var color: Color = Theme.C.neonPink
    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
    }
}
