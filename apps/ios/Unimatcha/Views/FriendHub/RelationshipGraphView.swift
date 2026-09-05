import SwiftUI

// MARK: - Relationship network panel (h5-addfriend-ads.md §1.1.a)
//
// Box: `w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-lowest`,
// `min-height: 300`, contents centred. States: "Loading…" · "Couldn't load network." ·
// "No connections yet — add a friend below." (`py-12`) · the star graph. Caption below the box:
// 10 px `outline`, `tracking-wider`, relaxed leading.
//
// The graph is the H5 `<svg viewBox="0 0 320 320">` drawn 1:1: edges in a `Canvas` (stroke width
// = server weight 1…6, neon-pink for a romantic counterpart, ink otherwise, opacity 0.7), then
// the friend nodes (r 20 avatars with a 1.5 ring), then self (r 26) on top. Labels sit below a
// node in the lower half and above it in the upper half. H5 hard-codes `#000` / `#1b1b1b` /
// `#ececec`, which is nearly invisible on the dark ground (gotcha 10) — iOS uses the semantic
// tokens instead.

struct RelationshipGraphPanel: View {
    let state: FriendHubViewModel.GraphState
    var onTapNode: (GraphNode) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            box
            Text(L10n.pick("Line thickness shows closeness (chats + post interaction). Tap a node to open the chat.",
                           "线条粗细代表亲密度（聊天 + 帖子互动）。点头像打开对话。"))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.wider, size: 10))
                .lineSpacing(4)
                .foregroundColor(Theme.C.outline)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var box: some View {
        ZStack {
            switch state {
            case .loading:
                message(L10n.t("Loading…"))
            case .failed:
                message(L10n.pick("Couldn't load network.", "关系网加载失败"))
            case .loaded(let graph):
                if graph.isEmpty {
                    message(L10n.pick("No connections yet — add a friend below.", "还没有好友——去扫码添加吧"))
                        .padding(.vertical, 48)          // `py-12`
                } else {
                    RelationshipGraphView(graph: graph, onTapNode: onTapNode)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: GraphLayout.minBoxHeight)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .strokeBorder(Theme.C.outlineVariant.opacity(0.3), lineWidth: 1)
        )
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(Theme.font(14))
            .foregroundColor(Theme.C.outline)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
    }
}

// MARK: - The graph itself

struct RelationshipGraphView: View {
    let graph: RelationshipGraph
    var onTapNode: (GraphNode) -> Void

    /// Measured box width; the viewBox (320) is scaled to it.
    @State private var side: CGFloat = 0

    var body: some View {
        let drawSide = max(side, 0)
        ZStack(alignment: .topLeading) {
            if drawSide > 0 {
                content(side: drawSide)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: max(drawSide, GraphLayout.minBoxHeight))
        .background(
            GeometryReader { geo in
                Color.clear.preference(key: FriendHubWidthKey.self, value: geo.size.width)
            }
        )
        .onPreferenceChange(FriendHubWidthKey.self) { w in
            if abs(w - side) > 0.5 { side = w }
        }
    }

    private func content(side: CGFloat) -> some View {
        let scale = side / GraphLayout.viewBox
        let placements = GraphLayout.placements(for: graph.nodes)
        let lines = GraphLayout.edgeLines(for: graph)
        let center = CGPoint(x: GraphLayout.center.x * scale, y: GraphLayout.center.y * scale)

        return ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                for line in lines {
                    var path = Path()
                    path.move(to: center)
                    path.addLine(to: CGPoint(x: line.to.x * scale, y: line.to.y * scale))
                    let color = (line.romantic ? Theme.C.neonPink : Theme.C.primary)
                        .opacity(GraphLayout.edgeOpacity)
                    ctx.stroke(path,
                               with: .color(color),
                               style: StrokeStyle(lineWidth: max(line.width * scale, 0.5), lineCap: .round))
                }
            }
            .frame(width: side, height: side)
            .allowsHitTesting(false)

            ForEach(placements) { placement in
                nodeLabel(placement, scale: scale)
                Button {
                    onTapNode(placement.node)
                } label: {
                    GraphAvatar(url: placement.node.avatarUrl,
                                name: placement.node.nickname,
                                viewRadius: GraphLayout.nodeRadius,
                                scale: scale)
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.94))
                .position(x: placement.point.x * scale, y: placement.point.y * scale)
                .accessibilityLabel(GraphLayout.label(placement.node.nickname))
            }

            // Self is drawn last (on top) and is not tappable. The fallback initial comes from the
            // literal "You" (H5 passes that nickname), while the label below it is localised.
            GraphAvatar(url: graph.selfNode.avatarUrl,
                        name: "You",
                        viewRadius: GraphLayout.selfRadius,
                        scale: scale)
                .position(x: center.x, y: center.y)
                .allowsHitTesting(false)
            label(L10n.pick("You", "我"), weight: .bold, color: Theme.C.primary, scale: scale)
                .position(x: center.x,
                          y: GraphLayout.labelCenterY(baseline: GraphLayout.selfLabelBaselineY) * scale)
                .allowsHitTesting(false)
        }
        .frame(width: side, height: side)
    }

    @ViewBuilder
    private func nodeLabel(_ placement: GraphLayout.Placement, scale: CGFloat) -> some View {
        let text = GraphLayout.label(placement.node.nickname)
        if !text.isEmpty {
            label(text, weight: .semibold, color: Theme.C.onSurface, scale: scale)
                .position(x: placement.point.x * scale,
                          y: GraphLayout.labelCenterY(baseline: placement.labelBaselineY) * scale)
                .allowsHitTesting(false)
        }
    }

    /// 9 px label in viewBox units, scaled with the box. Node labels are user content — never localised.
    private func label(_ text: String, weight: Font.Weight, color: Color, scale: CGFloat) -> some View {
        Text(text)
            .font(Theme.font(GraphLayout.labelFontSize * scale, weight: weight))
            .foregroundColor(color)
            .lineLimit(1)
            .fixedSize()
    }
}

// MARK: - Node avatar (image clipped to a circle, else disc + initial, both with a 1.5 ring)

private struct GraphAvatar: View {
    let url: String?
    let name: String?
    /// Radius in viewBox units (20 for a friend node, 26 for self).
    let viewRadius: CGFloat
    let scale: CGFloat

    private var radius: CGFloat { viewRadius * scale }

    var body: some View {
        ZStack {
            if SafeURL.isSafe(url) {
                RemoteImage(url: url, contentMode: .fill, placeholder: AnyView(fallback))
            } else {
                fallback
            }
        }
        .frame(width: radius * 2, height: radius * 2)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Theme.C.primary, lineWidth: GraphLayout.ringLineWidth * scale))
    }

    /// `#ececec` disc + uppercase initial at `r × 0.8`; the dark-aware token replaces the hex.
    private var fallback: some View {
        ZStack {
            Circle().fill(Theme.C.container)
            Text(GraphLayout.initial(name))
                .font(Theme.font(GraphLayout.initialFontSize(radius: viewRadius) * scale, weight: .bold))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
    }
}

/// Width of a square hub block (the graph box, the camera viewport) — the height is derived from
/// it, so the block stays square without an `aspectRatio` that a `ScrollView` cannot resolve.
/// Only one panel is mounted at a time, so the two users never collide.
struct FriendHubWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
