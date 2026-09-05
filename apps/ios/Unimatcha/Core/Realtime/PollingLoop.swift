import Foundation

/// `setInterval`-style async polling loop (H5 `startChatPolling` / `startNotifPolling` /
/// `startMatchPolling`), built on a `Task` + `Task.sleep` so `stop()` cancels it cleanly.
///
/// - `start()` is idempotent; it resets `tickCount` to 0 (H5 `let tick = 0` per start) and the first
///   tick fires **after** one `interval` (never immediately — callers do their initial load themselves).
/// - `tickCount` is incremented **before** `tick` runs, so inside the tick `tickCount` is 1, 2, 3…
///   Consumers implement the SSE downshift exactly like H5:
///   chat `!RealtimeClient.shared.isUp || tickCount % 6 == 0` (5 s → 30 s),
///   notifications `!isUp || tickCount % 4 == 0` (15 s → 60 s).
/// - Ticks never overlap: the loop awaits `tick` before sleeping again.
/// - `stop()` cancels the sleeping task; a tick already in flight **finishes** (H5's `clearInterval`
///   never aborts an in-flight `fetch`, and a cancelled request would otherwise surface to the
///   consumer as a poll failure — `MatchStore` counts those toward its 5-failure toast). The tick is
///   therefore run in its own unstructured `Task`, which does not inherit the loop's cancellation;
///   no further tick runs afterwards (a generation counter also makes a stale task's ticks no-ops —
///   H5's per-timer matchId capture).
@MainActor
final class PollingLoop {
    let interval: TimeInterval
    private let tick: () async -> Void

    private var task: Task<Void, Never>?
    private var generation: Int = 0

    private(set) var isRunning: Bool = false
    private(set) var tickCount: Int = 0

    init(interval: TimeInterval, tick: @escaping () async -> Void) {
        self.interval = interval
        self.tick = tick
    }

    /// Start ticking every `interval` seconds. No-op when already running.
    func start() {
        guard !isRunning else { return }
        isRunning = true
        tickCount = 0
        generation += 1
        let gen = generation
        let ns = UInt64(max(interval, 0.01) * 1_000_000_000)
        task = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: ns)
                } catch {
                    return
                }
                guard let self = self, self.isRunning, self.generation == gen, !Task.isCancelled else { return }
                self.tickCount += 1
                // Unstructured `Task` → not cancelled when `stop()` cancels the loop task, so an
                // in-flight tick always runs to completion instead of throwing `CancellationError`
                // out of the consumer's network call.
                await Task { [tick = self.tick] in await tick() }.value
            }
        }
    }

    /// Stop ticking. Safe to call repeatedly and from inside a tick.
    func stop() {
        isRunning = false
        generation += 1
        task?.cancel()
        task = nil
    }

    /// `stop()` + `start()` — fresh tick counter (H5 restarts the interval on every `start*Polling`).
    func restart() {
        stop()
        start()
    }
}
