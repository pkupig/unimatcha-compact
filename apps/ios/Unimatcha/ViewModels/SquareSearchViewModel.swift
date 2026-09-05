import Foundation
import Combine

// MARK: - SquareSearchViewModel (`#square-search-overlay` — h5-square.md §1.4, §2 "Search overlay", §3 #4) — WP-09
//
// Shared instance so re-opening the page shows the previous query and results (H5 keeps the search
// grid's DOM and `S.squarePostsByTab.search`). Typing debounces 300 ms; Enter / the "Search" button
// run immediately and blur the keyboard. Every run bumps a sequence token so a stale response is
// dropped. Results are cross-board (no `board` param) and land in `SquareStore.pages[.search]` so
// likes / votes stay synced with the feeds; **no ads** are ever placed here.

@MainActor
final class SquareSearchViewModel: ObservableObject {
    static let shared = SquareSearchViewModel()

    static let overlayId = "square-search"
    static let debounce: TimeInterval = 0.3

    enum State: Equatable {
        case idle                 // guide state: first open or an empty query
        case loading
        case results
        case empty
        case error(String)
    }

    @Published var query: String = ""
    @Published private(set) var state: State = .idle
    /// Bumped to request keyboard focus (60 ms after opening, and after "clear").
    @Published private(set) var focusSignal = 0
    /// Bumped to dismiss the keyboard (Enter / Search button).
    @Published private(set) var blurSignal = 0

    private var seq = 0
    private var debounceTask: Task<Void, Never>?
    private var cancellables: Set<AnyCancellable> = []

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.reset() }
            .store(in: &cancellables)
    }

    var results: [SquarePostCard] { SquareStore.shared.posts(of: .search) }

    var hasQuery: Bool { !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    // MARK: Lifecycle

    /// `openSquareSearch`: the guide state on a first open; the previous results stay otherwise.
    func open() {
        if results.isEmpty && !hasQuery { state = .idle }
        focusSignal &+= 1
    }

    /// `closeSquareSearch`: blur; the cache and the query survive (H5 keeps the rendered grid).
    func close() {
        debounceTask?.cancel()
        debounceTask = nil
        blurSignal &+= 1
    }

    func reset() {
        debounceTask?.cancel()
        debounceTask = nil
        seq &+= 1
        query = ""
        state = .idle
    }

    // MARK: Input

    /// `onSquareSearch`: store the trimmed query and debounce the request by 300 ms.
    func onQueryChange(_ text: String) {
        query = text
        debounceTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            seq &+= 1                       // cancel any in-flight response
            SquareStore.shared.clearSearchResults()
            state = .idle
            return
        }
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(SquareSearchViewModel.debounce * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.run()
        }
    }

    /// Enter key / "Search" button: immediate search, keyboard dismissed.
    func runNow() {
        debounceTask?.cancel()
        blurSignal &+= 1
        Task { await run() }
    }

    /// Clear button: empty the field, cancel the debounce, show the guide state, refocus.
    func clear() {
        debounceTask?.cancel()
        seq &+= 1
        query = ""
        SquareStore.shared.clearSearchResults()
        state = .idle
        focusSignal &+= 1
    }

    /// Retry from the error state.
    func retry() {
        Task { await run() }
    }

    // MARK: Request

    func run() async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            SquareStore.shared.clearSearchResults()
            state = .idle
            return
        }
        seq &+= 1
        let token = seq
        state = .loading
        do {
            let response = try await SquareService.search(q: q)
            guard token == seq else { return }          // superseded by a newer search
            let items = response.posts.items
            SquareStore.shared.setSearchResults(items)
            state = items.isEmpty ? .empty : .results
        } catch {
            guard token == seq else { return }
            state = .error(APIError.message(of: error))
        }
    }
}
