import SwiftUI

// MARK: - FlowLayout
//
// Wrapping row layout (iOS 16 `Layout`) used for chip/tag rows: interest chips, stage chips,
// suggestion chips, the event strip and the profile tag lists. Items keep their ideal size and
// wrap to the next line when the proposed width runs out; `spacing` applies on both axes.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        for (index, item) in result.items.enumerated() {
            guard index < subviews.count else { break }
            subviews[index].place(at: CGPoint(x: bounds.minX + item.position.x, y: bounds.minY + item.position.y),
                                  proposal: ProposedViewSize(width: item.size.width, height: item.size.height))
        }
    }

    private struct Item {
        var position: CGPoint
        var size: CGSize
    }

    private struct ArrangeResult {
        var items: [Item]
        var size: CGSize
    }

    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> ArrangeResult {
        let maxWidth = proposal.width ?? .infinity
        var items: [Item] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            var size = subview.sizeThatFits(.unspecified)
            // A single item wider than the row (long user-entered interest tag on a 375 pt screen) is
            // clamped instead of overflowing the container.
            if size.width > maxWidth { size.width = maxWidth }
            if currentX + size.width > maxWidth, currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            items.append(Item(position: CGPoint(x: currentX, y: currentY), size: size))
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
            maxX = max(maxX, currentX - spacing)
        }

        return ArrangeResult(items: items,
                             size: CGSize(width: maxX, height: currentY + lineHeight))
    }
}
