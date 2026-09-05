import SwiftUI

// MARK: - Message stream rows (h5-chat.md §1.3; design §8.20 "Bubbles") — WP-07
//
//   `.chat-time-sep`  centred 10 pt `#b6b6b6`, margin 14/10, tracking .04em
//   nudge line        centred 11 pt italic `on-surface-variant`, `py-1.5`, no bubble, no avatar
//   `.chat-row`       `flex items-end gap-8 mb-12`, `.mine` right-aligned; 36 pt avatar on the
//                     partner side (tappable → popover) and on the own side
//   `.chat-col`       max-width 72 %; image (max-h 16rem, r14) then bubble (`mt-6` when both)
//   `.chat-bubble`    `10/14`, 15 pt / 1.45; partner `#f1f1f1` r`18 18 18 6`,
//                     mine neon/black r`18 18 6 18`
//   `.chat-read`      9 pt `#b6b6b6`, `mt-3`, right aligned, own rows only, when `isRead`

struct ChatTimeSeparator: View {
    let date: Date

    var body: some View {
        Text(Formatters.chatStamp(date))
            .font(Theme.font(10))
            .tracking(Theme.tracking(0.04, size: 10))
            .foregroundColor(Theme.C.readReceipt)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 14)
            .padding(.bottom, 10)
    }
}

struct NudgeLineView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Theme.font(11).italic())
            .foregroundColor(Theme.C.onSurfaceVariant)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 6)
    }
}

struct MessageBubbleView: View {
    let message: ChatMessage
    let mine: Bool
    /// Width of the stream (the column is capped at 72 % of it).
    let rowWidth: CGFloat
    let partnerAvatarUrl: String?
    let partnerName: String
    let myAvatarUrl: String?
    let myName: String?
    /// Partner avatar tapped → popover anchored at its screen rect.
    let onPartnerAvatarTap: (CGRect) -> Void
    let onImageTap: (String) -> Void

    static let avatarSize: CGFloat = 36
    static let columnFraction: CGFloat = 0.72
    static let imageMaxHeight: CGFloat = 256   // max-h 16rem

    @State private var avatarFrame: CGRect = .zero

    private var columnWidth: CGFloat {
        max(80, rowWidth * MessageBubbleView.columnFraction)
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if mine { Spacer(minLength: 0) } else { partnerAvatar }
            column
            if mine { myAvatar } else { Spacer(minLength: 0) }
        }
        .padding(.bottom, 12)
    }

    // MARK: Column

    private var column: some View {
        VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
            if let url = message.imageUrl, SafeURL.isSafe(url) {
                ChatImageView(url: url, maxWidth: columnWidth, maxHeight: MessageBubbleView.imageMaxHeight) {
                    onImageTap(url)
                }
                .padding(.bottom, message.content.isEmpty ? 0 : 6)
            }
            if !message.content.isEmpty {
                bubble
            }
            if mine && message.isRead {
                Text(L10n.pick("Read", "已读"))
                    .font(Theme.font(9))
                    .foregroundColor(Theme.C.readReceipt)
                    .padding(.top, 3)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .frame(maxWidth: columnWidth, alignment: mine ? .trailing : .leading)
    }

    private var bubble: some View {
        Text(message.content)
            .font(Theme.font(15))
            .lineSpacing(15 * 0.45)          // line-height 1.45
            .foregroundColor(mine ? .black : Theme.C.onSurface)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(mine ? Theme.C.bubbleMine : Theme.C.bubbleTheirs)
            .clipShape(ChatBubbleShape(mine: mine))
            .frame(maxWidth: columnWidth, alignment: mine ? .trailing : .leading)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Avatars

    private var partnerAvatar: some View {
        AvatarView(url: partnerAvatarUrl, name: partnerName,
                   size: MessageBubbleView.avatarSize, fallback: .chat)
            .background(
                GeometryReader { g in
                    Color.clear
                        .onAppear { avatarFrame = g.frame(in: .global) }
                        .onChange(of: g.frame(in: .global)) { avatarFrame = $0 }
                }
            )
            .contentShape(Circle())
            .onTapGesture { onPartnerAvatarTap(avatarFrame) }
    }

    private var myAvatar: some View {
        AvatarView(url: myAvatarUrl, name: myName ?? "Me",
                   size: MessageBubbleView.avatarSize, fallback: .chat)
    }
}

// MARK: - Image message

/// `max-width:100%; max-height:16rem` with the intrinsic aspect ratio preserved (the CSS scales the
/// natural size down to satisfy both constraints). Before the bytes arrive a 4:3 placeholder box
/// holds the space.
struct ChatImageView: View {
    let url: String
    let maxWidth: CGFloat
    let maxHeight: CGFloat
    let onTap: () -> Void

    @State private var intrinsic: CGSize?

    private var size: CGSize {
        let natural = intrinsic ?? CGSize(width: 4, height: 3)
        guard natural.width > 0, natural.height > 0 else {
            return CGSize(width: maxWidth, height: maxWidth * 0.75)
        }
        let scale = min(maxWidth / natural.width, maxHeight / natural.height, 1)
        // A small natural image is never upscaled (CSS `max-*` only shrinks).
        let w = min(maxWidth, natural.width * scale)
        let h = min(maxHeight, natural.height * scale)
        return CGSize(width: max(1, w), height: max(1, h))
    }

    var body: some View {
        RemoteImage(url: url, contentMode: .fill, onSuccess: { s in
            if intrinsic != s { intrinsic = s }
        })
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.menu, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}

// MARK: - Bubble shape (per-corner radii; iOS 16 has no `UnevenRoundedRectangle`)

/// Partner `18 18 18 6` (tail bottom-left) / mine `18 18 6 18` (tail bottom-right).
struct ChatBubbleShape: Shape {
    let mine: Bool

    func path(in rect: CGRect) -> Path {
        let r = Theme.R.bubble
        let tail = Theme.R.bubbleTail
        let tl = r, tr = r
        let br = mine ? tail : r
        let bl = mine ? r : tail
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - tr, y: rect.minY + tr), radius: tr,
                 startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
        p.addArc(center: CGPoint(x: rect.maxX - br, y: rect.maxY - br), radius: br,
                 startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + bl, y: rect.maxY - bl), radius: bl,
                 startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + tl))
        p.addArc(center: CGPoint(x: rect.minX + tl, y: rect.minY + tl), radius: tl,
                 startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}
