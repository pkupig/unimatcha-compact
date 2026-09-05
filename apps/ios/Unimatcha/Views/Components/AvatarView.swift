import SwiftUI

// MARK: - AvatarView (h5-design-system.md §8.7)
//
// Circle image with an initials fallback:
//   .feed  feed `avatarChip`: black circle + white initials (2 chars, 7–10 pt by size: w-4 16 → 7, w-6 24 → 8, w-9 36 → 9, w-10 40 → 10)
//   .chat  `.chat-avatar--fallback`: `#e2e2e2` bg + `#474747` 14/700 uppercase initial (dark `#343230` / `#ddd`)
// `AvatarView.anonymous(seed:size:)` → `AliasAvatarView` (pastel circle + animal emoji sized round(size × 0.62), min 9).

struct AvatarView: View {
    enum Fallback { case feed, chat }
    enum Style { case circle, rounded(CGFloat) }

    var url: String?
    var name: String?
    var size: CGFloat
    var style: Style = .circle
    var fallback: Fallback = .chat
    var ring: (color: Color, width: CGFloat)? = nil

    init(url: String?, name: String?, size: CGFloat, style: Style = .circle, fallback: Fallback = .chat,
         ring: (color: Color, width: CGFloat)? = nil) {
        self.url = url
        self.name = name
        self.size = size
        self.style = style
        self.fallback = fallback
        self.ring = ring
    }

    static func anonymous(seed: UInt32?, size: CGFloat) -> AliasAvatarView {
        AliasAvatarView(seed: seed, size: size)
    }

    var body: some View {
        ZStack {
            if SafeURL.isSafe(url) {
                RemoteImage(url: url, contentMode: .fill, placeholder: AnyView(initialsView))
            } else {
                initialsView
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(ringOverlay)
    }

    private var shape: AnyShape {
        switch style {
        case .circle: return AnyShape(Circle())
        case .rounded(let r): return AnyShape(RoundedRectangle(cornerRadius: r, style: .continuous))
        }
    }

    @ViewBuilder private var ringOverlay: some View {
        if let ring = ring {
            shape.stroke(ring.color, lineWidth: ring.width)
        }
    }

    private var initialsView: some View {
        ZStack {
            shape.fill(fallback == .feed ? Color.black : Theme.C.avatarFallbackBg)
            Text(initials)
                .font(Theme.font(initialsFontSize, weight: .bold))
                .foregroundColor(fallback == .feed ? .white : Theme.C.avatarFallbackFg)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
    }

    private var initials: String {
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return fallback == .feed ? "?" : "?" }
        switch fallback {
        case .feed: return String(trimmed.prefix(2)).uppercased()
        case .chat: return String(trimmed.prefix(1)).uppercased()
        }
    }

    private var initialsFontSize: CGFloat {
        switch fallback {
        case .feed: return min(10, max(7, (size / 4).rounded()))
        case .chat: return size < 30 ? max(9, (size * 0.39).rounded()) : 14
        }
    }
}

// MARK: - AliasAvatarView

/// Anonymous avatar: `ALIAS_BG[(seed>>16)%16]` pastel circle + `ALIAS_EMOJI[(seed>>8)%16]`, emoji font
/// `round(size × 0.62)` (min 9). A `nil` seed renders the neutral chat fallback.
struct AliasAvatarView: View {
    var seed: UInt32?
    var size: CGFloat

    static func emojiSize(for box: CGFloat) -> CGFloat {
        max(9, (box * 0.62).rounded())
    }

    var body: some View {
        ZStack {
            if let s = seed {
                Circle().fill(Alias.background(seed: s))
                Text(Alias.emoji(seed: s))
                    .font(.system(size: Self.emojiSize(for: size)))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            } else {
                Circle().fill(Theme.C.avatarFallbackBg)
                Image(systemName: Theme.Icon.sf("person"))
                    .font(.system(size: max(9, size * 0.45), weight: .light))
                    .foregroundColor(Theme.C.avatarFallbackFg)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

// MARK: - Couple stack (wide card / couple space): 36 + 24 overlapped at `-bottom-1 -right-1` with 2 pt white border.

struct CoupleAvatarStack: View {
    var primaryUrl: String?
    var primaryName: String?
    var secondaryUrl: String?
    var secondaryName: String?
    var size: CGFloat = 36

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            AvatarView(url: primaryUrl, name: primaryName, size: size, fallback: .feed)
            AvatarView(url: secondaryUrl, name: secondaryName, size: size * 24 / 36, fallback: .feed,
                       ring: (Theme.C.card, 2))
                .offset(x: 4, y: 4)
        }
        .frame(width: size + 4, height: size + 4, alignment: .topLeading)
    }
}
