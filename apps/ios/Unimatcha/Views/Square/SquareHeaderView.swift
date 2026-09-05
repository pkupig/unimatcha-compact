import SwiftUI

// MARK: - SquareHeaderView (h5-square.md §1.1 #1, h5-design-system.md §7.2 `#tab-square`) — WP-08
//
// 44 pt + top inset glass bar (`bg-surface/80 backdrop-blur-xl`, bottom hairline `outline-variant/20`).
//   • `#square-tabs`: "Recommend" / "Campus Wall" 12/700 tracking .02em, gap 32, `pb-1.5`; inactive
//     neutral-400, active primary; 2 pt neon ink bar (radius 2) under the active segment, `left/width`
//     animated 0.28 s cubic-bezier(.22,1,.36,1).
//   • "Pinned" segment hangs 16 pt right of the group (absolutely positioned — the two main segments
//     never shift), 10 pt, baseline-aligned with "Campus Wall", shown only on the campus-wall / pinned
//     pages (opacity 0 + translateX(−6) otherwise; opacity .24 s / transform .28 s).
//   • Search button: 36 pt round, `search` 21 pt, 12 pt from the right edge, `active:scale-90`.

struct SquareHeaderView: View {
    var current: SquareBoardKind
    var safeTop: CGFloat
    var onSelect: (SquareBoardKind) -> Void
    var onSearch: () -> Void

    @State private var segmentFrames: [SquareBoardKind: CGRect] = [:]

    static let height: CGFloat = Theme.Bar.square
    static let segmentGap: CGFloat = 32
    static let pinnedGap: CGFloat = 16
    static let segmentTracking: CGFloat = 0.02

    private var showPinned: Bool { current == .campus_wall || current == .pinned }

    /// Ink under the active segment — including the hanging "Pinned" one (H5 positions it by the
    /// active segment's offsetLeft/offsetWidth, and Pinned is absolutely positioned inside the group).
    private var inkFrame: CGRect {
        segmentFrames[current] ?? segmentFrames[.recommend] ?? .zero
    }

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: safeTop)
            ZStack {
                segments
                HStack {
                    Spacer(minLength: 0)
                    IconButton(material: "search", size: 36, iconSize: 21, tint: Theme.C.onSurface,
                               pressScale: Theme.Motion.pressScaleSmallIcon,
                               accessibilityLabel: L10n.t("Search"), action: onSearch)
                        .padding(.trailing, 12)
                }
            }
            .frame(height: SquareHeaderView.height)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.C.glassBar.background(.ultraThinMaterial))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.C.hairline20).frame(height: 1)
        }
    }

    /// `#square-tabs` group with the ink bar and the hanging "Pinned" segment.
    private var segments: some View {
        HStack(spacing: SquareHeaderView.segmentGap) {
            segment(L10n.t("Recommend"), board: .recommend)
            segment(L10n.t("Campus Wall"), board: .campus_wall)
        }
        .overlay(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Theme.C.neon)
                .frame(width: max(0, inkFrame.width), height: 2)
                .offset(x: inkFrame.minX)
                .animation(Theme.Motion.inkUnderline, value: inkFrame)
        }
        .overlay(alignment: Alignment(horizontal: .trailing, vertical: .lastTextBaseline)) {
            pinnedSegment
                .alignmentGuide(.trailing) { d in d[.leading] - SquareHeaderView.pinnedGap }
        }
        // Named space wraps the segments AND both overlays so every frame is measured against the group.
        .coordinateSpace(name: "squareTabs")
        .onPreferenceChange(SquareSegmentFrameKey.self) { frames in
            segmentFrames = frames
        }
    }

    private func segment(_ title: String, board: SquareBoardKind) -> some View {
        let active = current == board
        return Button {
            onSelect(board)
        } label: {
            Text(title)
                .font(Theme.font(12, weight: .bold))
                .tracking(Theme.tracking(SquareHeaderView.segmentTracking, size: 12))
                .foregroundColor(active ? Theme.C.primary : Theme.C.neutral400)
                .lineLimit(1)
                .fixedSize()
                .padding(.bottom, 6)
                .background(
                    GeometryReader { g in
                        Color.clear.preference(key: SquareSegmentFrameKey.self,
                                               value: [board: g.frame(in: .named("squareTabs"))])
                    }
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? [.isSelected] : [])
    }

    private var pinnedSegment: some View {
        Button {
            onSelect(.pinned)
        } label: {
            Text(L10n.t("Pinned"))
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(SquareHeaderView.segmentTracking, size: 10))
                .foregroundColor(current == .pinned ? Theme.C.primary : Theme.C.neutral400)
                .lineLimit(1)
                .fixedSize()
                .padding(.bottom, 6)
                .background(
                    GeometryReader { g in
                        Color.clear.preference(key: SquareSegmentFrameKey.self,
                                               value: [SquareBoardKind.pinned: g.frame(in: .named("squareTabs"))])
                    }
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(showPinned ? 1 : 0)
        .offset(x: showPinned ? 0 : -6)
        .allowsHitTesting(showPinned)
        .animation(Theme.Motion.pinnedSeg, value: showPinned)
        .accessibilityHidden(!showPinned)
        .accessibilityAddTraits(current == .pinned ? [.isSelected] : [])
    }
}

private struct SquareSegmentFrameKey: PreferenceKey {
    static var defaultValue: [SquareBoardKind: CGRect] = [:]
    static func reduce(value: inout [SquareBoardKind: CGRect], nextValue: () -> [SquareBoardKind: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}
