import Foundation

/// Leading + one-trailing throttle — port of H5 `core.js#throttleWithTrailing`.
///
/// Semantics (window = `interval`):
/// - the first `fire()` in a window runs `action` immediately and opens the window;
/// - further `fire()` calls inside the window schedule exactly **one** trailing run at the
///   window end (so the last state is never stale — "3 s of N events" still ends with a refresh);
/// - the trailing run re-opens the window from its own execution time (H5 `slot.last = Date.now()`);
/// - `cancel()` drops the pending trailing run (H5 `stopRealtime` clears the timers so no
///   token-less request fires after logout) and resets the window.
///
/// Main-thread only: consumers call it from stores/VMs on the main actor and the trailing run is
/// dispatched on `DispatchQueue.main`.
final class Throttle {
    let interval: TimeInterval
    private let action: () -> Void

    /// Time the current window was opened (H5 `slot.last`); `.distantPast` = no window.
    private var last: Date = .distantPast
    /// Pending trailing run (H5 `slot.timer`).
    private var trailing: DispatchWorkItem?

    init(interval: TimeInterval = 3, action: @escaping () -> Void) {
        self.interval = interval
        self.action = action
    }

    deinit {
        trailing?.cancel()
    }

    /// Whether a trailing run is currently scheduled.
    var hasPendingTrailing: Bool { trailing != nil }

    /// Request a run: immediate when outside the window, otherwise coalesced into one trailing run.
    func fire() {
        let now = Date()
        let elapsed = now.timeIntervalSince(last)
        if elapsed >= interval {
            last = now
            action()
        } else if trailing == nil {
            let item = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                self.trailing = nil
                self.last = Date()
                self.action()
            }
            trailing = item
            DispatchQueue.main.asyncAfter(deadline: .now() + (interval - elapsed), execute: item)
        }
    }

    /// Drop any pending trailing run and reset the window (next `fire()` runs immediately).
    func cancel() {
        trailing?.cancel()
        trailing = nil
        last = .distantPast
    }
}
