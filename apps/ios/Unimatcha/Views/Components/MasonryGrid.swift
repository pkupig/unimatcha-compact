import SwiftUI

// MARK: - MasonryGrid (h5-square.md §1.2, h5-design-system.md §10.1)
//
// Two-column waterfall reproducing `layoutSquareMasonry()` exactly (visual order parity):
//   SP = 6 (rowGap); rows are 1 pt tall; col1 = col2 = 1 (next free row per column); holes = []
//   for each item in order:  n = max(1, ceil(height) + SP)
//     full-width  → row = max(col1, col2); the shorter column's gap becomes a hole; place at row; col1 = col2 = row + n
//     single      → first hole with size ≥ n (start += n, size −= n, drop when < 30) else the SHORTER column
//   (col1 <= col2 → column 1), advance it by n.
// Column gap 6, top padding 6; the caller adds the 6 pt horizontal page padding. Heights are measured with
// a preference key (estimated heights are used until measured) and the grid re-lays out on any change.

struct MasonryItem: Identifiable, Equatable {
    var id: String
    var fullWidth: Bool
    var estimatedHeight: CGFloat

    init(id: String, fullWidth: Bool = false, estimatedHeight: CGFloat = 160) {
        self.id = id
        self.fullWidth = fullWidth
        self.estimatedHeight = estimatedHeight
    }
}

enum MasonryLayout {
    struct Input: Equatable {
        var id: String
        var fullWidth: Bool
        var height: CGFloat
    }

    struct Placement: Equatable {
        var id: String
        var x: CGFloat
        var y: CGFloat
        var width: CGFloat
        var height: CGFloat
        var column: Int          // 1 / 2, 0 = full width
    }

    struct Result: Equatable {
        var placements: [Placement]
        var totalHeight: CGFloat
    }

    static let minHole: CGFloat = 30

    static func compute(items: [Input],
                        width: CGFloat,
                        columnGap: CGFloat = 6,
                        rowGap: CGFloat = 6,
                        topPadding: CGFloat = 6) -> Result {
        let colW = max(0, (width - columnGap) / 2)
        var col = [CGFloat](repeating: 1, count: 3)      // index 1, 2 (1-based like H5)
        struct Hole { var col: Int; var start: CGFloat; var size: CGFloat }
        var holes: [Hole] = []
        var out: [Placement] = []
        out.reserveCapacity(items.count)

        for item in items {
            let h = max(0, item.height)
            let n = max(1, ceil(h) + rowGap)
            if item.fullWidth {
                let row = max(col[1], col[2])
                if row - col[1] > 0 { holes.append(Hole(col: 1, start: col[1], size: row - col[1])) }
                if row - col[2] > 0 { holes.append(Hole(col: 2, start: col[2], size: row - col[2])) }
                out.append(Placement(id: item.id, x: 0, y: topPadding + row - 1, width: width, height: h, column: 0))
                col[1] = row + n
                col[2] = row + n
            } else {
                if let hi = holes.firstIndex(where: { $0.size >= n }) {
                    let hole = holes[hi]
                    let x = hole.col == 1 ? 0 : colW + columnGap
                    out.append(Placement(id: item.id, x: x, y: topPadding + hole.start - 1, width: colW, height: h, column: hole.col))
                    holes[hi].start += n
                    holes[hi].size -= n
                    if holes[hi].size < minHole { holes.remove(at: hi) }
                } else {
                    let c = col[1] <= col[2] ? 1 : 2
                    let x = c == 1 ? 0 : colW + columnGap
                    out.append(Placement(id: item.id, x: x, y: topPadding + col[c] - 1, width: colW, height: h, column: c))
                    col[c] += n
                }
            }
        }
        let total = topPadding + max(col[1], col[2]) - 1
        return Result(placements: out, totalHeight: max(0, total))
    }

    #if DEBUG
    /// Pure helper for tests: heights + full-width flags at a 363 pt page width (375 − 2×6).
    static func compute(heights: [CGFloat], fullWidth: [Bool], width: CGFloat = 363) -> [Placement] {
        let items = heights.indices.map { Input(id: "\($0)", fullWidth: $0 < fullWidth.count ? fullWidth[$0] : false, height: heights[$0]) }
        return compute(items: items, width: width).placements
    }

    /// Asserts the 6 pt vertical-gap invariant on a mixed sample (integer heights → gap exactly 6).
    static func verifyGapInvariant() throws {
        let heights: [CGFloat] = [180, 120, 160, 240, 90, 300, 140, 110, 200, 130]
        let full: [Bool] = [false, false, true, false, false, false, true, false, false, false]
        let p = compute(heights: heights, fullWidth: full)
        guard p.count == heights.count else { throw MasonryCheckError.count }
        // Per column: consecutive items are never closer than rowGap (exactly rowGap when stacked; larger
        // only across a hole), and at least one stacked pair is exactly 6 apart.
        var exactSix = 0
        for column in 1...2 {
            let colItems = p.filter { $0.column == column || $0.column == 0 }.sorted { $0.y < $1.y }
            for (a, b) in zip(colItems, colItems.dropFirst()) {
                let gap = b.y - (a.y + ceil(a.height))
                if gap < 6 - 0.001 { throw MasonryCheckError.gap(a.id, b.id, gap) }
                if abs(gap - 6) < 0.001 { exactSix += 1 }
            }
        }
        guard exactSix > 0 else { throw MasonryCheckError.placement }
        // Shorter-column rule: the second single card lands in column 2 (col1 already advanced).
        guard p[0].column == 1, p[0].y == 6, p[1].column == 2, p[1].y == 6 else { throw MasonryCheckError.placement }
        // Full-width card sits below the taller column (180 + 6) and leaves a 60-row hole under column 2.
        guard p[2].column == 0, p[2].y == 6 + 180 + 6 else { throw MasonryCheckError.placement }
        // 240 does not fit the 60-row hole → shorter column (col1 == col2 → column 1) right below the full card.
        guard p[3].column == 1, p[3].y == 6 + 186 + 166 else { throw MasonryCheckError.placement }
        // 90 does not fit either → column 2 at the same row (both columns were equal after the full card).
        guard p[4].column == 2, p[4].y == p[3].y else { throw MasonryCheckError.placement }
    }

    enum MasonryCheckError: Error { case count, placement, gap(String, String, CGFloat) }
    #endif
}

// MARK: - Height measurement

struct MasonryHeightKey: PreferenceKey {
    static var defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

// MARK: - View

struct MasonryGrid<Content: View>: View {
    var items: [MasonryItem]
    var columnGap: CGFloat = 6
    var rowGap: CGFloat = 6
    var topPadding: CGFloat = 6
    @ViewBuilder var content: (MasonryItem) -> Content

    @State private var heights: [String: CGFloat] = [:]
    @State private var width: CGFloat = 0

    init(items: [MasonryItem],
         columnGap: CGFloat = 6,
         rowGap: CGFloat = 6,
         topPadding: CGFloat = 6,
         @ViewBuilder content: @escaping (MasonryItem) -> Content) {
        self.items = items
        self.columnGap = columnGap
        self.rowGap = rowGap
        self.topPadding = topPadding
        self.content = content
    }

    private var effectiveWidth: CGFloat {
        if width > 0 { return width }
        let screen = UIScreen.main.bounds.width
        return max(0, (screen > 0 ? screen : 375) - 12)
    }

    private var layout: MasonryLayout.Result {
        let inputs = items.map { MasonryLayout.Input(id: $0.id, fullWidth: $0.fullWidth, height: heights[$0.id] ?? $0.estimatedHeight) }
        return MasonryLayout.compute(items: inputs, width: effectiveWidth, columnGap: columnGap, rowGap: rowGap, topPadding: topPadding)
    }

    var body: some View {
        let result = layout
        let byId = Dictionary(uniqueKeysWithValues: result.placements.map { ($0.id, $0) })
        ZStack(alignment: .topLeading) {
            Color.clear
                .frame(height: 0)
                .background(
                    GeometryReader { g in
                        Color.clear
                            .onAppear { width = g.size.width }
                            .onChange(of: g.size.width) { w in width = w }
                    }
                )
            ForEach(items) { item in
                if let p = byId[item.id] {
                    content(item)
                        .frame(width: max(0, p.width))
                        .fixedSize(horizontal: false, vertical: true)
                        .background(
                            GeometryReader { g in
                                Color.clear.preference(key: MasonryHeightKey.self, value: [item.id: g.size.height])
                            }
                        )
                        .offset(x: p.x, y: p.y)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .frame(height: result.totalHeight, alignment: .topLeading)
        .onPreferenceChange(MasonryHeightKey.self) { measured in
            var next = heights
            var changed = false
            for (k, v) in measured {
                let r = ceil(v)
                if next[k] != r { next[k] = r; changed = true }
            }
            if changed { heights = next }
        }
        .onChange(of: items) { new in
            let ids = Set(new.map { $0.id })
            let pruned = heights.filter { ids.contains($0.key) }
            if pruned.count != heights.count { heights = pruned }
        }
    }
}

// MARK: - Debug self-checks for the components package (PLAN §H.4 — no JSON fixtures: no models here)

#if DEBUG
enum ComponentsFixtures {
    enum CheckError: Error { case url(String), alias, pager }

    static func verify() throws {
        try MasonryLayout.verifyGapInvariant()
        // RemoteImage / SafeURL rule: only http(s) + data:image/*.
        let rejected = ["javascript:alert(1)", "file:///etc/passwd", "data:text/html;base64,AAAA", "blob:https://x", "vbscript:x", " \u{0001}javascript:x"]
        for r in rejected where SafeURL.isSafe(r) { throw CheckError.url(r) }
        let accepted = ["https://api.unimatcha.ai/uploads/a.jpg", "http://localhost:3001/uploads/b.png", "//cdn.example.com/c.webp",
                        "data:image/png;base64,iVBORw0KGgo="]
        for a in accepted where !SafeURL.isSafe(a) { throw CheckError.url(a) }
        // AliasAvatarView emoji = round(size × 0.62), min 9.
        guard AliasAvatarView.emojiSize(for: 16) == 10, AliasAvatarView.emojiSize(for: 32) == 20,
              AliasAvatarView.emojiSize(for: 54) == 33, AliasAvatarView.emojiSize(for: 8) == 9 else { throw CheckError.alias }
        // Pager / PTR constants.
        guard HorizontalPager<EmptyView>.directionLock == 12, HorizontalPager<EmptyView>.commitThreshold == 70,
              HorizontalPager<EmptyView>.rubberBand == 0.3, PullToRefreshState.threshold == 70,
              abs(PullToRefreshState.damped(90) - 70) < 2, abs(PullToRefreshState.damped(200) - 122) < 2,
              abs(PullToRefreshState.damped(400) - 160) < 2, PullToRefreshState.damped(10_000) <= 180 else { throw CheckError.pager }
    }
}
#endif
