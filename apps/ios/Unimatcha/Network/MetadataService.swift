import Foundation
import Combine

// MARK: - MetadataService (`api-auth §5.5`, `h5-profile §3`, S20)
//
// The five static option lists behind the setup / edit selects. Values are English canonical
// strings (display via `L10n.metaLabel`). Session-scoped in-memory cache that stores ONLY
// non-empty successful results (the endpoint answers `{items: []}` with 200 when its seed file
// failed to load — that is an error state, not "no data"); cleared on `.sessionDidReset`.
// Parallel callers of the same list share one in-flight request.

enum MetadataKind: String, CaseIterable, Hashable {
    case universities = "/metadata/uk/universities"
    case cities = "/metadata/uk/cities"
    case majors = "/metadata/uk/majors"
    case mbtiTypes = "/metadata/mbti-types"
    case nationalities = "/metadata/nationalities"

    var path: String { rawValue }
}

/// `GET /metadata/*` → 200 `{ items: string[] }`.
struct MetadataList: Decodable {
    let items: [String]

    private enum CodingKeys: String, CodingKey { case items }

    init(items: [String]) { self.items = items }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = c.lenient([String].self, .items) ?? []
    }
}

/// Result of `fetchAll`: every requested list (empty when it failed) + the set that failed.
struct MetadataBundle {
    var lists: [MetadataKind: [String]] = [:]
    var failed: Set<MetadataKind> = []

    subscript(_ kind: MetadataKind) -> [String] { lists[kind] ?? [] }
    var anyFailed: Bool { !failed.isEmpty }
    func succeeded(_ kind: MetadataKind) -> Bool { !(lists[kind] ?? []).isEmpty }
}

@MainActor
final class MetadataService: ObservableObject {
    static let shared = MetadataService()

    /// Only non-empty lists ever land here.
    @Published private(set) var cache: [MetadataKind: [String]] = [:]

    private var inflight: [MetadataKind: Task<[String], Error>] = [:]
    private var generation = 0
    private var bag = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.reset() }
            }
            .store(in: &bag)
    }

    /// Cached list (nil when never loaded successfully this session).
    func cached(_ kind: MetadataKind) -> [String]? {
        guard let c = cache[kind], !c.isEmpty else { return nil }
        return c
    }

    /// Returns the cached list or fetches it. Throws on transport errors and on an empty list
    /// (`APIError.emptyData`) — neither is cached, so the next open retries (H5 parity).
    func fetch(_ kind: MetadataKind) async throws -> [String] {
        if let c = cached(kind) { return c }
        if let running = inflight[kind] {
            // Piggy-backing callers must see the same contract as the one that started the
            // request: an empty list is an error state (S20), never a cached "no data".
            let shared = try await running.value
            guard !shared.isEmpty else { throw APIError.emptyData }
            return shared
        }
        let gen = generation
        let task = Task<[String], Error> {
            let list: MetadataList = try await APIClient.shared.request(.get(kind.path))
            return list.items
        }
        inflight[kind] = task
        defer {
            if inflight[kind] == task { inflight[kind] = nil }
        }
        let items = try await task.value
        guard !items.isEmpty else { throw APIError.emptyData }
        if gen == generation {
            cache[kind] = items
        }
        return items
    }

    /// Fetches several lists in parallel (the setup page's five). Never throws: failed lists come
    /// back empty and are listed in `failed` so the caller can toast once.
    func fetchAll(_ kinds: [MetadataKind] = MetadataKind.allCases) async -> MetadataBundle {
        var bundle = MetadataBundle()
        await withTaskGroup(of: (MetadataKind, [String]?).self) { group in
            for kind in kinds {
                group.addTask { [weak self] in
                    guard let self = self else { return (kind, nil) }
                    let items = try? await self.fetch(kind)
                    return (kind, items)
                }
            }
            for await (kind, items) in group {
                if let items = items, !items.isEmpty {
                    bundle.lists[kind] = items
                } else {
                    bundle.lists[kind] = []
                    bundle.failed.insert(kind)
                }
            }
        }
        return bundle
    }

    /// Drops the cache and cancels in-flight loads (logout / 401 / account switch).
    func reset() {
        generation += 1
        cache = [:]
        for (_, t) in inflight { t.cancel() }
        inflight = [:]
    }
}
