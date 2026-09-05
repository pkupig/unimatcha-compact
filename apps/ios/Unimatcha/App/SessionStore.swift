import Foundation
import Combine

extension Notification.Name {
    /// Posted by `SessionStore.cleanupUserState()` (logout / 401 / launch without token).
    /// Every per-user store clears itself and stops its timers on this.
    static let sessionDidReset = Notification.Name("ai.unimatcha.sessionDidReset")
    /// Posted after a successful `checkUserState()` (non-banned) or `applyRegistered`.
    static let sessionDidStart = Notification.Name("ai.unimatcha.sessionDidStart")
}

/// Root route (PLAN §A.4). `.bootError` = transport failure on `/users/me` at boot (token kept; Retry).
enum RootRoute: Equatable {
    case splash, auth, banned, profileSetup, home, bootError
}

/// Thread-safe token mirror read by `APIClient.tokenProvider` off the main actor.
final class TokenCache {
    static let shared = TokenCache()
    private let lock = NSLock()
    private var stored: String?
    var value: String? {
        get { lock.lock(); defer { lock.unlock() }; return stored }
        set { lock.lock(); stored = newValue; lock.unlock() }
    }
}

/// Token (Keychain), current user, root routing state machine, 401 handling, `cleanupUserState` broadcast.
@MainActor
final class SessionStore: ObservableObject {
    static let shared = SessionStore()

    @Published private(set) var token: String?
    @Published var currentUser: User?
    @Published private(set) var route: RootRoute = .splash
    /// True after the 3 s splash timer or Skip (`completeSplash()`).
    @Published var splashDone: Bool = false
    /// Message of the last boot transport failure (shown by `BootErrorView`).
    @Published private(set) var bootErrorMessage: String?

    /// Set by WP-16 → `RealtimeClient.shared.start(token:)`; called after a successful (non-banned)
    /// `checkUserState()` and in `applyRegistered`.
    var realtimeStartHook: (_ token: String) -> Void = { _ in }
    /// Set by WP-16 → `RealtimeClient.shared.stop()`; called first thing in `cleanupUserState()`.
    var realtimeStopHook: () -> Void = {}

    var userId: String? { currentUser?.id }
    var isLoggedIn: Bool { token != nil }

    // Boot bookkeeping — the /users/me check runs at most once per boot; the splash only gates *display*.
    private var checkTask: Task<Void, Never>?
    private var pendingRoute: RootRoute?
    private var bootChecked = false
    private var booted = false

    init() {
        let t = Keychain.token()
        token = t
        TokenCache.shared.value = t
        APIClient.shared.tokenProvider = { TokenCache.shared.value }
        APIClient.shared.onUnauthorized = { message in
            SessionStore.shared.handleUnauthorized(message: message)
        }
    }

    // MARK: Boot

    /// Kicks the boot check immediately (in parallel with the splash). Idempotent.
    func boot() {
        guard !booted else { return }
        booted = true
        Task { [weak self] in await self?.checkUserState() }
    }

    /// Splash finished (3 s timer or Skip). Idempotent; applies the resolved route once both are ready.
    func completeSplash() {
        splashDone = true
        if !booted { boot() }
        if let r = pendingRoute, route == .splash {
            pendingRoute = nil
            route = r
        }
    }

    // MARK: Token

    func setToken(_ t: String?) {
        let clean = (t?.isEmpty ?? true) ? nil : t
        token = clean
        TokenCache.shared.value = clean
        Keychain.setToken(clean)
    }

    // MARK: Routing state machine (PLAN §A.4)

    /// Runs the `/users/me` bootstrap and routes. Concurrent calls collapse into the in-flight one;
    /// a second boot-phase call (splash timer after Skip) is a no-op.
    func checkUserState() async {
        if let running = checkTask {
            await running.value
            return
        }
        if route == .splash && bootChecked {
            return
        }
        let task = Task<Void, Never> { [weak self] in
            await self?.performCheck()
        }
        checkTask = task
        await task.value
        checkTask = nil
    }

    private func performCheck() async {
        defer { bootChecked = true }
        bootErrorMessage = nil

        guard let tok = token, !tok.isEmpty else {
            cleanupUserState()
            resolve(.auth)
            return
        }

        do {
            let user: User = try await APIClient.shared.request(.get("/users/me"))
            currentUser = user
            if user.isBanned {
                // Token kept, no SSE (practically unreachable — the JWT strategy 401s banned users first).
                resolve(.banned)
                return
            }
            realtimeStartHook(tok)
            NotificationCenter.default.post(name: .sessionDidStart, object: nil)
            resolve(user.resolvedHasProfile ? .home : .profileSetup)
        } catch let e as APIError {
            switch e {
            case .unauthorized:
                // `APIClient` already ran `handleUnauthorized` (token deleted, state cleaned).
                resolve(.auth)
            case .http(401, _):
                // Defensive: a 401 that bypassed the hook (should not happen for a non-public endpoint).
                setToken(nil)
                cleanupUserState()
                resolve(.auth)
            default:
                // Transport / 5xx / decoding: keep the token, show a Retry state (D11 — do not log out).
                bootErrorMessage = e.message
                resolve(.bootError)
            }
        } catch {
            bootErrorMessage = APIError.message(of: error)
            resolve(.bootError)
        }
    }

    /// Applies a resolved route immediately unless the splash is still showing (then it is deferred).
    private func resolve(_ r: RootRoute) {
        if route == .splash && !splashDone {
            pendingRoute = r
        } else {
            pendingRoute = nil
            route = r
        }
    }

    /// `BootErrorView` Retry.
    func retryBoot() async {
        guard route == .bootError else { return }
        await checkUserState()
    }

    // MARK: Session transitions

    /// Register path: token stored, light user kept, realtime started, → profile setup.
    func applyRegistered(user: User, token: String) {
        setToken(token)
        currentUser = user
        realtimeStartHook(token)
        NotificationCenter.default.post(name: .sessionDidStart, object: nil)
        splashDone = true
        pendingRoute = nil
        route = .profileSetup
    }

    /// Profile setup confirmed: merge the saved profile into `currentUser`, → home.
    func markProfileSaved(_ merged: UserProfile) {
        if var u = currentUser {
            u.profile = merged
            u.hasProfile = true
            currentUser = u
        }
        pendingRoute = nil
        route = .home
    }

    /// Replaces `currentUser.profile` in place (used by Edit Profile / avatar / cover saves; no refetch).
    func updateProfile(_ change: (inout UserProfile) -> Void) {
        guard var u = currentUser else { return }
        var p = u.profile ?? UserProfile()
        change(&p)
        u.profile = p
        currentUser = u
    }

    /// Replaces `currentUser.verificationStatus` (student verification submit → "pending").
    func setVerificationStatus(_ status: String) {
        guard var u = currentUser else { return }
        u.verificationStatus = status
        currentUser = u
    }

    /// `GET /users/me` → `currentUser`.
    @discardableResult
    func refreshMe() async throws -> User {
        let user: User = try await APIClient.shared.request(.get("/users/me"))
        currentUser = user
        return user
    }

    /// 401 on any non-public endpoint (invoked by `APIClient` on the main actor). Idempotent.
    func handleUnauthorized(message: String) {
        if token == nil && route == .auth { return }
        teardown()
    }

    /// Explicit logout (callers confirm first). Same teardown as 401.
    func logout() {
        teardown()
    }

    private func teardown() {
        setToken(nil)
        cleanupUserState()
        bootErrorMessage = nil
        // During the splash the route is deferred (keeps the 3 s minimum); otherwise applied now.
        resolve(.auth)
    }

    /// Account-switch firewall: stops realtime (via hook), drops the user, broadcasts `sessionDidReset`
    /// so every per-user store/VM clears itself and stops its timers.
    func cleanupUserState() {
        realtimeStopHook()
        currentUser = nil
        NotificationCenter.default.post(name: .sessionDidReset, object: nil)
    }

    func goHome() {
        pendingRoute = nil
        route = .home
    }
}
