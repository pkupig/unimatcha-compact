// Interface outline: implementation bodies removed.
import SwiftUI
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ())
    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> ArrangeResult
