import Foundation
import CoreGraphics

// MARK: - Relationship graph (`GET /relationships/graph` — api-matching §4, h5-addfriend-ads §1.1.a)
//
// Nodes are my *active* relationships only (`RELATIONSHIP_ROMANTIC` / `RELATIONSHIP_MODE` /
// `FRIEND_CONFIRMED` with `dissolvedAt == null`); temp / pending matches never appear. The
// payload also carries `school`, `raw`, `msgCount`, `posts` — decoded for completeness, unused
// by the UI. `matchId` is deliberately absent (privacy): the client maps a node to a chat
// through its own session cache.

/// `node.kind` — drives the edge colour (romantic = neon pink, friend = ink).
enum GraphNodeKind: String, Decodable, Equatable {
    case romantic
    case friend

    /// Unknown / missing values fall back to `friend` (H5 `kind === 'romantic' ? pink : black`).
    static func parse(_ raw: String?) -> GraphNodeKind {
        guard let raw = raw?.lowercased() else { return .friend }
        return GraphNodeKind(rawValue: raw) ?? .friend
    }
}

/// `data.self` — only `avatarUrl` is rendered (centre node); the label is the literal "You".
struct GraphSelf: Decodable, Equatable {
    var id: String?
    var nickname: String?
    var avatarUrl: String?

    init(id: String? = nil, nickname: String? = nil, avatarUrl: String? = nil) {
        self.id = id
        self.nickname = nickname
        self.avatarUrl = avatarUrl
    }

    private enum CodingKeys: String, CodingKey { case id, nickname, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id)
        nickname = c.lenient(String.self, .nickname)
        avatarUrl = c.lenient(String.self, .avatarUrl)
    }
}

struct GraphNode: Decodable, Identifiable, Equatable {
    var id: String
    var nickname: String?
    var avatarUrl: String?
    var school: String?
    var kind: GraphNodeKind

    init(id: String, nickname: String? = nil, avatarUrl: String? = nil, school: String? = nil, kind: GraphNodeKind = .friend) {
        self.id = id
        self.nickname = nickname
        self.avatarUrl = avatarUrl
        self.school = school
        self.kind = kind
    }

    private enum CodingKeys: String, CodingKey { case id, nickname, avatarUrl, school, kind }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenient(String.self, .id) ?? ""
        nickname = c.lenient(String.self, .nickname)
        avatarUrl = c.lenient(String.self, .avatarUrl)
        school = c.lenient(String.self, .school)
        kind = GraphNodeKind.parse(c.lenient(String.self, .kind))
    }

    var isRomantic: Bool { kind == .romantic }
}

/// One spoke of the star graph. `b` is the node id; `weight` is the 1…6 stroke width the
/// server derived from `log1p(msgCount) + 2·exp(−daysSinceLastMsg/14) + 1.5·log1p(postInteractions)`.
struct GraphEdge: Decodable, Equatable {
    var a: String?
    var b: String
    var weight: Double
    var raw: Double?
    var msgCount: Int?
    var posts: Int?

    init(a: String? = nil, b: String, weight: Double, raw: Double? = nil, msgCount: Int? = nil, posts: Int? = nil) {
        self.a = a
        self.b = b
        self.weight = weight
        self.raw = raw
        self.msgCount = msgCount
        self.posts = posts
    }

    private enum CodingKeys: String, CodingKey { case a, b, weight, raw, msgCount, posts }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        a = c.lenient(String.self, .a)
        b = c.lenient(String.self, .b) ?? ""
        weight = c.lenientDouble(.weight) ?? 1
        raw = c.lenientDouble(.raw)
        msgCount = c.lenientInt(.msgCount)
        posts = c.lenientInt(.posts)
    }
}

struct RelationshipGraph: Decodable, Equatable {
    /// `self` on the wire (Swift keyword → renamed).
    var selfNode: GraphSelf
    var nodes: [GraphNode]
    var edges: [GraphEdge]

    static let empty = RelationshipGraph(selfNode: GraphSelf(), nodes: [], edges: [])

    init(selfNode: GraphSelf, nodes: [GraphNode], edges: [GraphEdge]) {
        self.selfNode = selfNode
        self.nodes = nodes
        self.edges = edges
    }

    private enum CodingKeys: String, CodingKey {
        case selfNode = "self"
        case nodes, edges
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        selfNode = c.lenient(GraphSelf.self, .selfNode) ?? GraphSelf()
        // Ids key the position table (H5 `pos[node.id]`): an id-less row could never be drawn
        // or tapped, and an empty id would collide with every other empty one.
        nodes = (c.lenient([GraphNode].self, .nodes) ?? []).filter { !$0.id.isEmpty }
        edges = (c.lenient([GraphEdge].self, .edges) ?? []).filter { !$0.b.isEmpty }
    }

    /// H5 renders the "No connections yet" copy on `nodes.length === 0` (edges are ignored).
    var isEmpty: Bool { nodes.isEmpty }
}

// MARK: - Star-graph geometry (pure — verified by `HubFixtures`)
//
// Everything below is in the H5 viewBox space (`<svg viewBox="0 0 320 320">`), which the view
// scales by `side / 320`. Centre (160,160); ring radius 112; self r 26; friend node r 20; the
// first node sits at 12 o'clock and they run clockwise.

enum GraphLayout {
    static let viewBox: CGFloat = 320
    static let center = CGPoint(x: 160, y: 160)
    static let ringRadius: CGFloat = 112
    static let selfRadius: CGFloat = 26
    static let nodeRadius: CGFloat = 20
    /// `#friend-graph { min-height: 300px }` — the box never gets shorter than this.
    static let minBoxHeight: CGFloat = 300
    /// Node + self labels: 9 px, 600 / 700.
    static let labelFontSize: CGFloat = 9
    /// `stroke-width: 1.5` ring around every avatar / fallback disc.
    static let ringLineWidth: CGFloat = 1.5
    /// `opacity: 0.7` on every edge.
    static let edgeOpacity: Double = 0.7
    /// `nickname.slice(0, 10)`.
    static let maxLabelChars = 10
    /// Fallback initial font size = `r × 0.8` (16 for a node, 21 for self — H5 `toFixed(0)`).
    static func initialFontSize(radius: CGFloat) -> CGFloat { (radius * 0.8).rounded() }

    /// `θ = i/n·2π − π/2` → `(160 + 112cosθ, 160 + 112sinθ)`.
    static func point(index: Int, count: Int) -> CGPoint {
        guard count > 0 else { return center }
        let angle = (Double(index) / Double(count)) * 2 * Double.pi - Double.pi / 2
        return CGPoint(x: center.x + ringRadius * CGFloat(cos(angle)),
                       y: center.y + ringRadius * CGFloat(sin(angle)))
    }

    /// SVG text baseline: below the node in the lower half, above it in the upper half.
    static func labelBaselineY(for point: CGPoint) -> CGFloat {
        point.y > center.y ? point.y + nodeRadius + 12 : point.y - nodeRadius - 6
    }

    static let selfLabelBaselineY: CGFloat = center.y + selfRadius + 12

    /// SwiftUI positions a `Text` by its centre, SVG by its baseline. Ascent above the centre of
    /// a 9 pt line is ≈ 0.32 em, so the centre sits that far above the baseline.
    static func labelCenterY(baseline: CGFloat, fontSize: CGFloat = labelFontSize) -> CGFloat {
        baseline - fontSize * 0.32
    }

    /// `stroke-width = edge.weight`; the server contract is 1…6, clamped so a corrupt payload
    /// cannot paint a 60 pt slab across the card.
    static func strokeWidth(_ weight: Double) -> CGFloat {
        CGFloat(min(max(weight, 0), 6))
    }

    /// `(nickname || '?').slice(0,1).toUpperCase()`.
    static func initial(_ nickname: String?) -> String {
        let n = (nickname ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = n.first else { return "?" }
        return String(first).uppercased()
    }

    /// `escapeHtml(nickname.slice(0,10))` — user content, never localised.
    static func label(_ nickname: String?) -> String {
        String((nickname ?? "").prefix(maxLabelChars))
    }

    struct Placement: Identifiable, Equatable {
        let node: GraphNode
        let point: CGPoint
        let labelBaselineY: CGFloat
        var id: String { node.id }
    }

    static func placements(for nodes: [GraphNode]) -> [Placement] {
        nodes.enumerated().map { i, node in
            let p = point(index: i, count: nodes.count)
            return Placement(node: node, point: p, labelBaselineY: labelBaselineY(for: p))
        }
    }

    struct EdgeLine: Identifiable, Equatable {
        let id: String
        let to: CGPoint
        let width: CGFloat
        let romantic: Bool
    }

    /// One line per edge whose `b` resolves to a drawn node (H5 skips unresolvable edges).
    /// Draw order: edges first, then friend nodes, then self on top.
    static func edgeLines(for graph: RelationshipGraph) -> [EdgeLine] {
        let placed = placements(for: graph.nodes)
        var byId: [String: Placement] = [:]
        for p in placed { byId[p.node.id] = p }
        var seen = Set<String>()
        var out: [EdgeLine] = []
        for edge in graph.edges {
            guard let p = byId[edge.b] else { continue }
            // Two edges for the same node would overdraw; keep the first (H5 draws both,
            // visually identical because they share endpoints).
            guard seen.insert(edge.b).inserted else { continue }
            out.append(EdgeLine(id: edge.b,
                                to: p.point,
                                width: strokeWidth(edge.weight),
                                romantic: p.node.isRomantic))
        }
        return out
    }
}
