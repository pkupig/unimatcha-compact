import SwiftUI
import UIKit

// MARK: - SmallCard (`bentoSmallCard` — h5-square.md §1.3, h5-design-system.md §8.19 / §10.2) — WP-08
//
// Half-width masonry card: `card` bg, radius 6, no border/shadow.
//   media  = first image at its natural aspect ratio clamped 110…300 pt (`min-h 110 / max-h 300 object-cover`),
//            hidden on load error; while loading the block is 110 pt (`min-height`)
//          | ivory 3:4 highlighter tile when there is no image (`#f6f1e7`, p-5, vertically centred, left-aligned,
//            800 tight `clamp(1.05rem, 5.5vw, 1.45rem)` lh 1.6 `#3f3f3f`, 5-line clamp, first segment neon-marked)
//   body   `px-2.5 pt-2 pb-2.5`: title 13/700 tight snug 2 lines (`title || content[0..60]`) → comment snippet → author row.
// Pinned page: title 13 → 11.

struct SmallCard: View {
    var post: SquarePostCard

    @Environment(\.squarePinnedPage) private var pinnedPage
    @State private var imageSize: CGSize? = nil
    @State private var imageFailed = false
    @State private var cardWidth: CGFloat = 0

    static let minImageHeight: CGFloat = 110
    static let maxImageHeight: CGFloat = 300

    private var width: CGFloat { cardWidth > 0 ? cardWidth : SquareCardMetrics.columnWidth }

    /// `height: auto` clamped by `min/max-height` → natural aspect within [110, 300]; 110 until the size is known.
    static func mediaHeight(width: CGFloat, imageSize: CGSize?) -> CGFloat {
        guard let s = imageSize, s.width > 0, s.height > 0, width > 0 else { return minImageHeight }
        let natural = width * s.height / s.width
        return min(max(natural, minImageHeight), maxImageHeight)
    }

    var body: some View {
        Button {
            AppActions.shared.openPostDetail(post.id, false)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                if let img = post.firstImage {
                    if !imageFailed {
                        ZStack {
                            Theme.C.container
                            RemoteImage(url: img, contentMode: .fill, placeholderColor: Theme.C.container,
                                        onSuccess: { size in
                                            if imageSize != size { imageSize = size }
                                        },
                                        onFailure: { imageFailed = true })
                        }
                        .frame(height: SmallCard.mediaHeight(width: width, imageSize: imageSize))
                        .clipped()
                    }
                } else {
                    TextTile(text: post.textCardText)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(post.cardTitle)
                        .font(Theme.font(SquareCardScale.smallTitle(pinnedPage), weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.tight, size: SquareCardScale.smallTitle(pinnedPage)))
                        .lineSpacing(SquareCardScale.smallTitle(pinnedPage) * 0.375)
                        .foregroundColor(Theme.C.onSurface)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let snippet = post.commentSnippet, !snippet.isEmpty {
                        CommentSnippetLine(snippet: snippet)
                    }
                    CardAuthorRow(post: post) {
                        Task { await SquareStore.shared.like(postId: post.id) }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 8)
                .padding(.bottom, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: SquareCardMetrics.cardRadius, style: .continuous))
        }
        .buttonStyle(SquareCardPressStyle())
        .background(
            GeometryReader { g in
                Color.clear
                    .onAppear { cardWidth = g.size.width }
                    .onChange(of: g.size.width) { w in cardWidth = w }
            }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(post.cardTitle))
    }
}

// MARK: - Ivory highlighter tile

/// `aspect-[3/4] p-5 flex items-center bg #f6f1e7` with the marked headline.
struct TextTile: View {
    var text: String

    var body: some View {
        GeometryReader { geo in
            let font = TextCardHighlight.fontSize(viewportWidth: UIScreen.main.bounds.width)
            let split = TextCardHighlight.split(text)
            ZStack(alignment: .leading) {
                Theme.C.textCardIvory
                HighlightTextView(text: text, headLength: (split.head as NSString).length, fontSize: font,
                                  lineHeightFactor: 1.6, maxLines: 5, textColor: Theme.C.textCardInk)
                    .frame(width: max(0, geo.size.width - 40))
                    .frame(maxHeight: .infinity, alignment: .center)
                    .padding(20)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipped()
    }
}

// MARK: - HighlightTextView (TextKit; `highlightMarkHtml`)

/// Draws the text with the head segment underlined by a neon bar covering the lower 32 % of the glyph
/// box (`linear-gradient(to top, rgba(204,255,0,.95) 32%, transparent 32%)`), wrapping like a `<p>`.
struct HighlightTextView: UIViewRepresentable {
    var text: String
    var headLength: Int
    var fontSize: CGFloat
    var lineHeightFactor: CGFloat = 1.6
    var maxLines: Int = 5
    var textColor: Color = Theme.C.textCardInk

    func makeUIView(context: Context) -> HighlightLabelView {
        let v = HighlightLabelView()
        v.configure(text: text, headLength: headLength, fontSize: fontSize, lineHeightFactor: lineHeightFactor,
                    maxLines: maxLines, textColor: UIColor(textColor))
        return v
    }

    func updateUIView(_ uiView: HighlightLabelView, context: Context) {
        uiView.configure(text: text, headLength: headLength, fontSize: fontSize, lineHeightFactor: lineHeightFactor,
                         maxLines: maxLines, textColor: UIColor(textColor))
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: HighlightLabelView, context: Context) -> CGSize? {
        let w = proposal.width ?? uiView.bounds.width
        guard w > 0 else { return nil }
        return uiView.sizeFitting(width: w)
    }
}

final class HighlightLabelView: UIView {
    private let storage = NSTextStorage()
    private let layoutManager = NSLayoutManager()
    private let container = NSTextContainer(size: .zero)
    private var font: UIFont = UIFont.systemFont(ofSize: 20, weight: .heavy)
    private var headLength = 0
    private var lineHeight: CGFloat = 32
    private var extraLeading: CGFloat = 0

    static let barFraction: CGFloat = 0.32

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        isUserInteractionEnabled = false
        container.lineFragmentPadding = 0
        container.lineBreakMode = .byTruncatingTail
        layoutManager.addTextContainer(container)
        storage.addLayoutManager(layoutManager)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(text: String, headLength: Int, fontSize: CGFloat, lineHeightFactor: CGFloat, maxLines: Int, textColor: UIColor) {
        let f: UIFont
        if let name = FontProbe.jakarta(.heavy), let custom = UIFont(name: name, size: fontSize) {
            f = custom
        } else {
            f = UIFont.systemFont(ofSize: fontSize, weight: .heavy)
        }
        font = f
        self.headLength = max(0, headLength)
        lineHeight = fontSize * lineHeightFactor
        extraLeading = max(0, lineHeight - f.lineHeight)
        container.maximumNumberOfLines = maxLines
        let para = NSMutableParagraphStyle()
        para.lineHeightMultiple = f.lineHeight > 0 ? lineHeight / f.lineHeight : 1
        para.lineBreakMode = .byTruncatingTail
        para.alignment = .left
        let attrs: [NSAttributedString.Key: Any] = [
            .font: f,
            .foregroundColor: textColor,
            .paragraphStyle: para,
            .kern: Theme.Tracking.tight * fontSize,
        ]
        storage.setAttributedString(NSAttributedString(string: text, attributes: attrs))
        setNeedsLayout()
        setNeedsDisplay()
        invalidateIntrinsicContentSize()
    }

    func sizeFitting(width: CGFloat) -> CGSize {
        container.size = CGSize(width: width, height: .greatestFiniteMagnitude)
        layoutManager.ensureLayout(for: container)
        let used = layoutManager.usedRect(for: container)
        return CGSize(width: width, height: ceil(used.height))
    }

    override var intrinsicContentSize: CGSize {
        bounds.width > 0 ? sizeFitting(width: bounds.width) : CGSize(width: UIView.noIntrinsicMetric, height: UIView.noIntrinsicMetric)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        container.size = CGSize(width: bounds.width, height: .greatestFiniteMagnitude)
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard bounds.width > 0, let ctx = UIGraphicsGetCurrentContext() else { return }
        container.size = CGSize(width: bounds.width, height: .greatestFiniteMagnitude)
        layoutManager.ensureLayout(for: container)
        let glyphRange = layoutManager.glyphRange(for: container)
        guard glyphRange.length > 0 else { return }
        // CSS half-leading: TextKit puts the extra line height above the glyphs; shift up by half of it.
        let origin = CGPoint(x: 0, y: -extraLeading / 2)
        let headChars = min(headLength, storage.length)
        if headChars > 0 {
            let headGlyphs = layoutManager.glyphRange(forCharacterRange: NSRange(location: 0, length: headChars), actualCharacterRange: nil)
            let ascent = font.ascender
            let descent = -font.descender
            let contentHeight = ascent + descent
            let barHeight = contentHeight * HighlightLabelView.barFraction
            ctx.saveGState()
            ctx.setFillColor(UIColor(Theme.C.neon).withAlphaComponent(0.95).cgColor)
            layoutManager.enumerateLineFragments(forGlyphRange: headGlyphs) { [layoutManager] fragment, _, cont, lineGlyphs, _ in
                let inter = NSIntersectionRange(lineGlyphs, headGlyphs)
                guard inter.length > 0 else { return }
                let bounds = layoutManager.boundingRect(forGlyphRange: inter, in: cont)
                let loc = layoutManager.location(forGlyphAt: inter.location)
                let baseline = fragment.origin.y + loc.y
                let contentBottom = baseline + descent
                let bar = CGRect(x: bounds.minX + origin.x, y: contentBottom - barHeight + origin.y,
                                 width: bounds.width, height: barHeight)
                ctx.fill(bar)
            }
            ctx.restoreGState()
        }
        layoutManager.drawBackground(forGlyphRange: glyphRange, at: origin)
        layoutManager.drawGlyphs(forGlyphRange: glyphRange, at: origin)
    }
}
