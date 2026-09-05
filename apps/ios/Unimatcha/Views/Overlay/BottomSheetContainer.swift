import SwiftUI
import UIKit

// MARK: - BottomSheetContainer (h5-core.md §2.5, h5-design-system.md §7.4 / §8.18 — WP-03a)
//
// The sheet body of a `.bottomSheet` overlay: `max-w-md bg-white rounded-t-[10px]
// shadow-2xl`, header = grab handle (40×4 stone-200, pt-3 mb-4) + caller row (px-6),
// `pb-4 border-b stone-100`. Only the header zone drags: the sheet follows the finger
// downward (`translateY(max(0, dy))`), release > 110 pt closes, else it snaps back.
// The body region is capped at 70 % of the screen height (H5 `max-h-[70vh]`) unless
// `bodyMaxHeightFraction` says otherwise; the caller owns the body's own `ScrollView`.
//
//   BottomSheetContainer(header: { HStack { X / title / Save } }) { ScrollView { … } }
//
// Closing: `onClose` when given, else the enclosing overlay (`overlayId` environment,
// set by `OverlayHost`), else the top-most overlay.

struct BottomSheetContainer<Header: View, SheetBody: View>: View {
    static var closeDistance: CGFloat { 110 }

    private let bodyMaxHeightFraction: CGFloat
    private let onClose: (() -> Void)?
    private let header: Header
    private let sheetBody: SheetBody

    @Environment(\.overlayId) private var overlayId
    @Environment(\.overlaySafeInsets) private var envInsets
    @State private var dragOffset: CGFloat = 0

    init(bodyMaxHeightFraction: CGFloat = 0.7,
         onClose: (() -> Void)? = nil,
         @ViewBuilder header: () -> Header,
         @ViewBuilder body: () -> SheetBody) {
        self.bodyMaxHeightFraction = bodyMaxHeightFraction
        self.onClose = onClose
        self.header = header()
        self.sheetBody = body()
    }

    var body: some View {
        let insets = OverlayChrome.resolvedInsets(envInsets)
        let maxBody = OverlayChrome.screenSize.height * bodyMaxHeightFraction
        VStack(spacing: 0) {
            headerZone
            // H5 `max-h-[70vh] overflow-y-auto`: the body is as tall as its content and only
            // caps (and scrolls) beyond the limit. A plain `.frame(maxHeight:)` would always
            // fill the cap (a short q-nav grid would float above empty space), so the layout
            // proposes at most `maxBody` and adopts the body's own height: the fixed-size
            // variant wins while the content fits, the scrolling one takes over past the cap.
            CappedHeightLayout(maxHeight: maxBody) {
                ViewThatFits(in: .vertical) {
                    sheetBody
                        .frame(maxWidth: .infinity)
                        .fixedSize(horizontal: false, vertical: true)
                    sheetBody
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.bottom, insets.bottom)
        .frame(maxWidth: OverlayChrome.cardMaxWidthMd)
        .background(Theme.C.card)
        .clipShape(TopRoundedRect(radius: Theme.R.sheetTop))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 12)
        .offset(y: dragOffset)
    }

    private var headerZone: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Theme.C.stone200)
                .frame(width: 40, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 16)
            header
                .padding(.horizontal, Theme.Space.page)
        }
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity)
        .background(Theme.C.card)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.C.hairline).frame(height: 1)
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 4, coordinateSpace: .local)
                .onChanged { value in
                    dragOffset = max(0, value.translation.height)
                }
                .onEnded { value in
                    let dy = value.translation.height
                    if dy > Self.closeDistance {
                        close()
                    } else {
                        withAnimation(Theme.Motion.sheet) { dragOffset = 0 }
                    }
                }
        )
    }

    private func close() {
        // Keep the dragged position while the dismissal transition slides the sheet away.
        if let onClose = onClose {
            onClose()
        } else if let id = overlayId {
            OverlayRouter.shared.dismiss(id: id)
        } else {
            OverlayRouter.shared.dismissTop()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { dragOffset = 0 }
    }
}

/// Proposes at most `maxHeight` to its single child and reports the child's own height
/// (capped) — "content height up to a limit", which `.frame(maxHeight:)` does not give
/// (a flexible frame always fills up to its cap).
struct CappedHeightLayout: Layout {
    var maxHeight: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let sub = subviews.first else { return .zero }
        let h = min(proposal.height ?? maxHeight, maxHeight)
        let s = sub.sizeThatFits(ProposedViewSize(width: proposal.width, height: h))
        return CGSize(width: s.width, height: min(s.height, maxHeight))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(
            at: bounds.origin,
            anchor: .topLeading,
            proposal: ProposedViewSize(width: bounds.width, height: bounds.height)
        )
    }
}

/// Rectangle with only its top corners rounded (`rounded-t-*`).
struct TopRoundedRect: Shape {
    var radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let p = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: [.topLeft, .topRight],
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(p.cgPath)
    }
}
