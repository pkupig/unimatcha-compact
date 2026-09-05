import Foundation
import Combine

/// Invalidation signals pushed by `GET /realtime/stream` (`api-chat-realtime-notifications.md §2.2`).
/// They never carry data — consumers always follow up with the REST call.
enum RealtimeEvent: Equatable {
    /// First frame after (re)connect; the client is now "SSE up" and pollers may downshift.
    case ready
    /// A message / nudge / "I love you" was created for me in that match.
    case message(matchId: String)
    /// The partner marked my messages in that match as read.
    case read(matchId: String)
    /// A notification was created for me (no further fields).
    case notification
    /// I opened a 6th concurrent stream and this one was evicted. Client stays on full-rate polling.
    case evicted
}

// MARK: - SSE line reader / frame parser (pure, non-isolated)

/// Splits a byte stream into lines on `\n` (a preceding `\r` is stripped, so CRLF works too).
/// Empty lines ARE yielded — they terminate SSE frames. A trailing partial line at EOF is dropped
/// (a frame is only valid once its blank-line terminator arrived).
struct SSELineReader {
    private var buffer: [UInt8] = []

    /// Feed one byte; returns a complete line (without terminator) when `\n` is seen.
    mutating func feed(_ byte: UInt8) -> String? {
        if byte == 0x0A {                               // "\n"
            if buffer.last == 0x0D { buffer.removeLast() }   // "\r"
            let line = String(decoding: buffer, as: UTF8.self)
            buffer.removeAll(keepingCapacity: true)
            return line
        }
        buffer.append(byte)
        return nil
    }
}

/// Accumulates SSE lines into frames. Default-type `data:` frames only — the server sends no
/// `event:`/`id:` lines (§2.2); `: ping` comment lines (heartbeat every 25 s) are ignored but
/// still count as liveness. A blank line terminates a frame; multi-line `data:` payloads are
/// joined with `\n` per the SSE spec.
struct SSEFrameParser {
    private var dataLines: [String] = []

    /// Feed one line (without its terminator). Returns the completed frame's data on a blank line,
    /// `nil` otherwise.
    mutating func feed(line raw: String) -> String? {
        // Tolerate a stray trailing CR (CRLF streams split by a bare-LF reader).
        let line = raw.hasSuffix("\r") ? String(raw.dropLast()) : raw
        if line.isEmpty {
            guard !dataLines.isEmpty else { return nil }
            let frame = dataLines.joined(separator: "\n")
            dataLines.removeAll(keepingCapacity: true)
            return frame
        }
        if line.hasPrefix(":") { return nil }             // comment / heartbeat
        let name: Substring
        let value: Substring
        if let colon = line.firstIndex(of: ":") {
            name = line[line.startIndex..<colon]
            var v = line[line.index(after: colon)...]
            if v.hasPrefix(" ") { v = v.dropFirst() }    // exactly one optional leading space
            value = v
        } else {
            name = Substring(line)
            value = ""
        }
        if name == "data" {
            dataLines.append(String(value))
        }
        // `event:`, `id:`, `retry:` and unknown fields are ignored (never sent by the server).
        return nil
    }

    /// Decode a frame's data into an event. Unknown / malformed frames → `nil`.
    static func event(fromFrame data: String) -> RealtimeEvent? {
        guard let bytes = data.data(using: .utf8),
              let frame = try? JSONDecoder().decode(Frame.self, from: bytes) else { return nil }
        switch frame.type {
        case "ready": return .ready
        case "evicted": return .evicted
        case "notification": return .notification
        case "message":
            guard let id = frame.matchId, !id.isEmpty else { return nil }
            return .message(matchId: id)
        case "read":
            guard let id = frame.matchId, !id.isEmpty else { return nil }
            return .read(matchId: id)
        default: return nil
        }
    }

    private struct Frame: Decodable {
        let type: String
        let matchId: String?
    }
}

// MARK: - Client

/// Native SSE client for `GET <base>/realtime/stream?token=<jwt>` (port of H5 `core.js startRealtime`
/// / `stopRealtime`; PLAN §B.6 / §D).
///
/// Lifecycle:
/// - `start(token:)` after `/users/me` succeeds and after register (`SessionStore.realtimeStartHook`),
///   and on `scenePhase == .active` (integration). `stop()` on logout/401 (`realtimeStopHook`) and on
///   `.background`.
/// - `isUp` flips to `true` only on the `ready` frame (after every (re)connect), to `false` on any
///   error/EOF/stop — pollers read it to downshift (chat 5 s → every 6th tick, notifications 15 s →
///   every 4th tick) and return to full rate automatically when it drops.
/// - Transport error / EOF / non-2xx (not 401) → reconnect with backoff 3, 6, 12, 24, 30 s (max 30 s);
///   the ladder resets after a connection that stayed up ≥ 30 s (or on an explicit `start`).
/// - HTTP 401 (bare `{"message":"Unauthorized"}` body) → stop, **no reconnect** (session handling is
///   done by the REST 401 path).
/// - `evicted` frame → stop, **no reconnect** (would otherwise create a ~3 s eviction loop against
///   the user's other connections); `.evicted` is published so stores stay on full-rate polling.
/// - 60 s liveness watchdog: the server pings every 25 s; if nothing (frames or comments) arrives for
///   60 s the connection is assumed dead and restarted through the backoff path.
@MainActor
final class RealtimeClient: ObservableObject {
    static let shared = RealtimeClient()

    /// True after the `ready` frame; false on error/stop.
    @Published private(set) var isUp: Bool = false

    /// Invalidation events; consumers `.sink` on the main actor (all sends happen on main).
    let events = PassthroughSubject<RealtimeEvent, Never>()

    /// Between `start(token:)` and `stop()` (covers backoff waits too).
    private(set) var isRunning: Bool = false

    nonisolated static let path = "/realtime/stream"
    nonisolated static let livenessTimeout: TimeInterval = 60
    nonisolated static let watchdogPeriod: TimeInterval = 5
    nonisolated static let backoffBase: TimeInterval = 3
    nonisolated static let backoffMax: TimeInterval = 30
    /// A connection that stayed up (after `ready`) at least this long resets the backoff ladder;
    /// shorter-lived connections keep escalating (flapping-server protection).
    nonisolated static let stableUptime: TimeInterval = 30

    private let session: URLSession
    private var token: String?
    /// Bumped by every `start`/`stop`; async continuations compare it to ignore stale outcomes.
    private var generation: Int = 0
    private var streamTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var watchdogTask: Task<Void, Never>?
    /// Consecutive short-lived/failed attempts — drives the backoff step (3, 6, 12, 24, 30 s).
    private var failureCount: Int = 0
    /// When the current connection received `ready` (nil until then).
    private var readyAt: Date?
    private var lastActivity: Date = Date()
    private var reconnectPending: Bool = false
    private var resetObserver: NSObjectProtocol?

    init(session: URLSession? = nil) {
        if let s = session {
            self.session = s
        } else {
            let cfg = URLSessionConfiguration.ephemeral
            cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
            cfg.urlCache = nil
            // Idle timeout between bytes must exceed the 25 s ping period; the 60 s watchdog is the
            // real liveness check.
            cfg.timeoutIntervalForRequest = 90
            cfg.timeoutIntervalForResource = 60 * 60 * 24 * 7
            cfg.waitsForConnectivity = false
            cfg.httpAdditionalHeaders = [
                "Accept": "text/event-stream",
                "Cache-Control": "no-cache",
            ]
            self.session = URLSession(configuration: cfg)
        }
        // Belt-and-braces: `SessionStore.cleanupUserState()` already stops us through the hook
        // before posting this; a second `stop()` is a no-op.
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.stop() }
        }
    }

    // MARK: Public API

    /// Open (or re-open) the stream with the given JWT. Idempotent while connected with the same token;
    /// with the same token during a backoff wait it reconnects immediately; a different token restarts.
    func start(token: String) {
        let t = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else {
            stop()
            return
        }
        // The server already rejected this exact token; reconnecting can only 401 again.
        guard t != rejectedToken else {
            RealtimeClient.log("start ignored — token was already rejected with 401")
            return
        }
        if isRunning, self.token == t {
            if streamTask != nil { return }          // already connected / connecting
            // In a backoff wait (e.g. app returned to foreground): try now.
            reconnectTask?.cancel()
            reconnectTask = nil
            reconnectPending = false
            failureCount = 0
            connect()
            return
        }
        teardown()
        self.token = t
        isRunning = true
        failureCount = 0
        connect()
    }

    /// Close the stream, cancel any pending reconnect, `isUp = false`. Safe to call repeatedly.
    func stop() {
        teardown()
        token = nil
        rejectedToken = nil
    }

    /// A token the server answered 401 to. `start` refuses to reconnect with it, so a banned or
    /// deleted account does not burn a doomed connect → 401 round trip on every foreground
    /// (`api-chat-realtime-notifications.md §2.1`: on 401 stop, do not reconnect). A genuinely new
    /// token from a fresh sign-in differs and connects normally.
    private var rejectedToken: String?

    // MARK: Connection

    private func teardown() {
        generation &+= 1
        isRunning = false
        reconnectPending = false
        reconnectTask?.cancel()
        reconnectTask = nil
        watchdogTask?.cancel()
        watchdogTask = nil
        streamTask?.cancel()
        streamTask = nil
        if isUp { isUp = false }
    }

    private func connect() {
        guard isRunning, let token = token else { return }
        streamTask?.cancel()
        watchdogTask?.cancel()
        generation &+= 1
        let gen = generation
        lastActivity = Date()
        readyAt = nil
        RealtimeClient.log("connecting (attempt \(failureCount + 1))")

        streamTask = Task { [weak self] in
            guard let self = self else { return }
            let outcome = await self.runStream(token: token, generation: gen)
            // Stopped or restarted while we were streaming → this outcome is stale.
            guard self.generation == gen, self.isRunning else { return }
            self.streamTask = nil
            self.watchdogTask?.cancel()
            self.watchdogTask = nil
            if self.isUp { self.isUp = false }
            switch outcome {
            case .unauthorized:
                RealtimeClient.log("401 — stopping, no reconnect")
                self.rejectedToken = self.token
                self.teardown()
                self.token = nil
            case .evicted:
                RealtimeClient.log("evicted — stopping, no reconnect")
                self.teardown()
                self.events.send(.evicted)
            case .ended(let reason):
                RealtimeClient.log("stream ended: \(reason)")
                if let r = self.readyAt, Date().timeIntervalSince(r) >= RealtimeClient.stableUptime {
                    self.failureCount = 0          // healthy connection dropped → start the ladder over
                }
                self.scheduleReconnect()
            }
        }

        watchdogTask = Task { [weak self] in
            let period = UInt64(RealtimeClient.watchdogPeriod * 1_000_000_000)
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: period)
                } catch {
                    return
                }
                guard let self = self, self.generation == gen, self.isRunning else { return }
                if Date().timeIntervalSince(self.lastActivity) > RealtimeClient.livenessTimeout {
                    RealtimeClient.log("no activity for \(Int(RealtimeClient.livenessTimeout)) s — restarting stream")
                    // Cancelling the reader makes `runStream` return `.ended`, which reconnects.
                    self.streamTask?.cancel()
                    return
                }
            }
        }
    }

    private enum StreamOutcome {
        case unauthorized
        case evicted
        case ended(String)
    }

    /// Runs one connection to completion. Every `await` resumes on the main actor, so frame handling
    /// and `lastActivity` updates need no locking; the work per line is tiny.
    private func runStream(token: String, generation gen: Int) async -> StreamOutcome {
        guard let url = APIClient.shared.makeURL(path: RealtimeClient.path,
                                                 query: [URLQueryItem(name: "token", value: token)]) else {
            return .ended("invalid URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 90
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        // The server only reads `?token=`; the header is harmless and keeps parity with REST calls.
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let bytes: URLSession.AsyncBytes
        let response: URLResponse
        do {
            (bytes, response) = try await session.bytes(for: req)
        } catch {
            if Task.isCancelled { return .ended("cancelled") }
            return .ended("transport: \(error.localizedDescription)")
        }
        guard self.generation == gen, self.isRunning else { return .ended("stale") }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { return .unauthorized }
        guard (200..<300).contains(status) else { return .ended("HTTP \(status)") }
        lastActivity = Date()

        // NOTE: `bytes.lines` drops empty lines, which would swallow the SSE blank-line frame
        // terminator — split the raw byte stream ourselves (`SSELineReader`).
        var reader = SSELineReader()
        var parser = SSEFrameParser()
        do {
            for try await byte in bytes {
                guard let line = reader.feed(byte) else { continue }
                guard self.generation == gen, self.isRunning else { return .ended("stale") }
                lastActivity = Date()                    // frames AND `: ping` comments count
                guard let frame = parser.feed(line: line) else { continue }
                guard let event = SSEFrameParser.event(fromFrame: frame) else {
                    RealtimeClient.log("ignored frame: \(frame)")
                    continue
                }
                if event == .evicted { return .evicted }
                handle(event)
            }
        } catch {
            if Task.isCancelled { return .ended("cancelled") }
            return .ended("read error: \(error.localizedDescription)")
        }
        return .ended("EOF")
    }

    private func handle(_ event: RealtimeEvent) {
        switch event {
        case .ready:
            readyAt = Date()
            if !isUp { isUp = true }
            RealtimeClient.log("ready")
            events.send(.ready)
        case .message, .read, .notification:
            events.send(event)
        case .evicted:
            break   // handled by the stream loop (stop + publish after teardown)
        }
    }

    // MARK: Reconnect

    /// Backoff 3 s, 6 s, 12 s, 24 s, 30 s, 30 s… (`min(3·2ⁿ, 30)`).
    nonisolated static func backoffDelay(forFailureCount n: Int) -> TimeInterval {
        let exp = max(0, min(n, 10))
        return min(backoffBase * pow(2, Double(exp)), backoffMax)
    }

    private func scheduleReconnect() {
        guard isRunning, token != nil else { return }
        let delay = RealtimeClient.backoffDelay(forFailureCount: failureCount)
        failureCount += 1
        reconnectPending = true
        let gen = generation
        RealtimeClient.log("reconnect in \(Int(delay)) s")
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            } catch {
                return
            }
            guard let self = self, self.generation == gen, self.isRunning, self.reconnectPending else { return }
            self.reconnectPending = false
            self.reconnectTask = nil
            self.connect()
        }
    }

    // MARK: Debug

    nonisolated private static func log(_ s: @autoclosure () -> String) {
        #if DEBUG
        print("[realtime] \(s())")
        #endif
    }
}

// MARK: - Debug self-check (parser + backoff; run by WP-16's decode-check launch if desired)

#if DEBUG
enum RealtimeSelfCheck {
    struct Failure: Error, CustomStringConvertible {
        let description: String
    }

    /// Verifies the line reader, the SSE parser (documented frame format) and the backoff table.
    static func verify() throws {
        var r = SSELineReader()
        var rawLines: [String] = []
        for b in Array("data: {\"type\":\"ready\"}\r\n\r\n: ping\n\ndata: x".utf8) {
            if let l = r.feed(b) { rawLines.append(l) }
        }
        guard rawLines == ["data: {\"type\":\"ready\"}", "", ": ping", ""] else {
            throw Failure(description: "SSE line reader mismatch: \(rawLines)")
        }

        var p = SSEFrameParser()
        var got: [RealtimeEvent] = []
        let lines = [
            ": ping",                                            // heartbeat comment → ignored
            "",                                                  // blank without data → no frame
            "data: {\"type\":\"ready\"}",
            "",
            "data:{\"type\":\"message\",\"matchId\":\"m1\"}",    // no space after colon
            "",
            "data: {\"type\":\"read\",",                          // multi-line payload joined with \n
            "data: \"matchId\":\"m2\"}",
            "",
            "event: custom",                                     // unknown field ignored
            "id: 7",
            "data: {\"type\":\"notification\"}",
            "\r",                                                // CRLF remnant treated as blank
            "data: not json",                                    // malformed → ignored
            "",
            "data: {\"type\":\"unknown\"}",                       // unknown type → ignored
            "",
            "data: {\"type\":\"message\"}",                       // message without matchId → ignored
            "",
            "data: {\"type\":\"evicted\"}",
            "",
        ]
        for l in lines {
            if let frame = p.feed(line: l), let e = SSEFrameParser.event(fromFrame: frame) {
                got.append(e)
            }
        }
        let expected: [RealtimeEvent] = [.ready, .message(matchId: "m1"), .read(matchId: "m2"), .notification, .evicted]
        guard got == expected else { throw Failure(description: "SSE parser mismatch: \(got)") }

        let delays = (0..<6).map { RealtimeClient.backoffDelay(forFailureCount: $0) }
        guard delays == [3, 6, 12, 24, 30, 30] else { throw Failure(description: "backoff mismatch: \(delays)") }
    }
}
#endif
