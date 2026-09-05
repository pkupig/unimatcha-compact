import SwiftUI
import Combine

// MARK: - Profile tab (h5-profile.md §1.2, §2 "Profile tab"; PLAN §C.8 — WP-11)
//
// `loadProfileTab()` parity: the tab renders straight from `SessionStore.currentUser` (the
// `/users/me` snapshot merged with local edits) and the only network call on open is the
// fire-and-forget `GET /energy/balance`. Refresh (pull-to-refresh) = re-render + energy
// refresh — it never refetches `/users/me`.
//
// The pure display rules (facts rows, day counter, verify badge state) live in non-isolated
// helpers so `ProfileFixtures.verify()` can check them without touching the main actor.

// MARK: Copy (run-time zh/en branches of profile.js — not dictionary keys)

enum ProfileTabCopy {
    static var yourName: String { L10n.pick("Your Name", "你的名字") }
    static var university: String { L10n.pick("University", "学校") }
    /// Facts row age: en "21", zh "21 岁".
    static func age(_ n: Int) -> String { L10n.pick("\(n)", "\(n) 岁") }
    /// Facts row student id: en "ID u2312345", zh "学号 u2312345".
    static func studentId(_ id: String) -> String { L10n.pick("ID \(id)", "学号 \(id)") }
    /// Facts row membership day: en "Day 12", zh "已加入 12 天".
    static func day(_ n: Int) -> String { L10n.pick("Day \(n)", "已加入 \(n) 天") }

    static var badgePending: String { L10n.t("Pending") }
    static var badgeVerify: String { L10n.t("Verify") }
    static var titleVerified: String { L10n.pick("Verified", "已认证") }
    static var titlePending: String { L10n.pick("Verification under review", "认证审核中") }
    static var titleVerify: String { L10n.pick("Get student verified", "进行学生认证") }

    /// Footer "Unimatcha v2.4.0" — read from the bundle (`CFBundleShortVersionString`), H5 value as fallback.
    static var versionLine: String {
        let v = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return "Unimatcha v" + (v.isEmpty ? "2.4.0" : v)
    }
}

// MARK: Verify badge (`renderVerifyButton`: 4 backend states → 3 visuals)

enum VerifyBadgeState: Equatable {
    case verified
    case pending
    /// `unverified`, `rejected` or missing — tappable → verify card.
    case verify

    static func from(status: String?) -> VerifyBadgeState {
        switch (status ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "verified": return .verified
        case "pending": return .pending
        default: return .verify
        }
    }

    var isTappable: Bool { self == .verify }
}

// MARK: Facts rows (`renderProfileFacts`)

struct ProfileFacts: Equatable {
    /// `.pf-primary`: `realName · age · grade` (already display-formatted, separators added by the view).
    var primary: [String] = []
    /// `.pf-secondary`: `ID x · Day N`.
    var secondary: [String] = []
    /// `.pf-signature` (2-line clamp), nil when blank.
    var signature: String? = nil

    var isEmpty: Bool { primary.isEmpty && secondary.isEmpty && signature == nil }
}

enum ProfileFactsBuilder {
    /// `N = max(1, floor((now − joinedAt) / 86400000) + 1)`; nil when `joinedAt` is missing / unparseable.
    static func dayNumber(joinedAt: String?, now: Date = Date()) -> Int? {
        guard let raw = joinedAt, let joined = ISODate.parse(raw) else { return nil }
        let seconds = now.timeIntervalSince(joined)
        let days = Int(floor(seconds / 86_400))
        return max(1, days + 1)
    }

    static func facts(user: User?, now: Date = Date()) -> ProfileFacts {
        var f = ProfileFacts()
        guard let user = user else { return f }
        let p = user.profile ?? UserProfile()

        if let name = p.displayRealName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            f.primary.append(name)
        }
        let age = p.age ?? p.birthday.flatMap { Formatters.ageFrom(birthday: $0, now: now) }
        if let a = age, a > 0 {
            f.primary.append(ProfileTabCopy.age(a))
        }
        if let g = p.grade?.trimmingCharacters(in: .whitespacesAndNewlines), !g.isEmpty {
            f.primary.append(L10n.metaLabel(g) ?? g)
        }

        if let sid = p.studentId?.trimmingCharacters(in: .whitespacesAndNewlines), !sid.isEmpty {
            f.secondary.append(ProfileTabCopy.studentId(sid))
        }
        if let n = dayNumber(joinedAt: user.joinedAtString, now: now) {
            f.secondary.append(ProfileTabCopy.day(n))
        }

        if let s = p.signature?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty {
            f.signature = s
        }
        return f
    }
}

// MARK: - View model

@MainActor
final class ProfileTabViewModel: ObservableObject {
    /// One instance for the mounted tab panel so WP-16's `switchTab(.profile)` can call `onTabEnter()`.
    static let shared = ProfileTabViewModel()

    // Hero geometry (h5-profile §1.2 / gotcha 7) — all in points, `+ safeAreaInsets.top` where noted.
    static let heroBase: CGFloat = 400            // `--hero-base = 400px + sat`
    static let topSpacer: CGFloat = 88            // `.profile-top-spacer = 88px + sat`
    static let heroTextBottomMargin: CGFloat = 86 // `mb-[86px]`
    static let panelOverlap: CGFloat = 24         // white panel `-mt-6` + `rounded-t-[24px]`
    static let panelTopPadding: CGFloat = 28      // `pt-7`
    static let panelBottomPadding: CGFloat = 128  // `pb-32`
    static let panelMaxWidth: CGFloat = 512       // `max-w-lg`
    static let avatarSize: CGFloat = 92
    static let avatarRing: CGFloat = 3
    static let blurRadius: CGFloat = 12
    static let blurRevealDist: CGFloat = 140      // `BLUR_REVEAL_DIST`

    /// Current pull distance (0 at rest, ≤180 while dragging, 70 while refreshing).
    @Published private(set) var pullDist: CGFloat = 0
    @Published private(set) var isRefreshing = false

    private var bag = Set<AnyCancellable>()

    init() {
        // Rule 6: the singleton outlives a session — drop the gesture state on logout / 401 so the
        // next user never lands on a stretched hero. (The rendered data is `SessionStore`'s.)
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.pullDist = 0
                    self?.isRefreshing = false
                }
            }
            .store(in: &bag)
    }

    /// `.profile-blur-mask` opacity = `max(0, 1 − dist / 140)`.
    var blurOpacity: Double { max(0, 1 - Double(pullDist / Self.blurRevealDist)) }

    /// `#profile-hero` height = `--hero-base + dist` (cover grows 1:1 with the finger, no scale).
    func heroHeight(topInset: CGFloat) -> CGFloat { Self.heroBase + topInset + pullDist }

    /// `switchTab('profile')` → `loadProfileTab()`: render from state + `GET /energy/balance`.
    func onTabEnter() async {
        await EnergyStore.shared.refresh()
    }

    /// Pull-to-refresh action = `loadProfileTab()` again (never refetches `/users/me`).
    func refresh() async {
        isRefreshing = true
        defer { isRefreshing = false }
        await EnergyStore.shared.refresh()
    }

    /// `onPull(dist)` from the shared pull-to-refresh: per-frame values follow the finger without
    /// animation; the release values (0 = spring back, 70 = refresh hold) animate with the H5
    /// 0.45 s hero curve so the cover and blur ease back like `transition: height .45s`.
    func handlePull(_ dist: CGFloat) {
        let d = max(0, dist)
        if d == 0 || d == PullToRefreshState.threshold {
            withAnimation(Theme.Motion.hero) { pullDist = d }
        } else {
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) { pullDist = d }
        }
    }
}
