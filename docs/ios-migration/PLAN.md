# Unimatcha iOS migration plan — H5 (2026-09-03) → native SwiftUI, 1:1

Maps directory (read the map named in each row before touching a screen):
`/private/tmp/claude-501/-Users-aimi-Downloads-unimatcha-compact/8b05a921-d056-47e7-8007-3e616ffc8775/scratchpad/ios-migration/maps/`
- H5 behaviour: `h5-core.md`, `h5-design-system.md`, `h5-i18n.md`, `h5-auth-onboarding.md`, `h5-questionnaire.md`, `h5-match.md`, `h5-chat.md`, `h5-couple.md`, `h5-square.md`, `h5-profile.md`, `h5-settings.md`, `h5-notifications.md`, `h5-addfriend-ads.md`
- Backend contracts: `api-auth-users-profiles.md`, `api-matching-questionnaire.md`, `api-chat-realtime-notifications.md`, `api-square-events-social.md`
- Existing iOS audit: `ios-models-network.md`, `ios-viewmodels.md`, `ios-views.md`

Fixed decisions (from the lead, not negotiable): SwiftUI + MVVM (`ObservableObject`/`@Published`), iOS 16.0, **no third-party packages**, Swift 5 language mode (`SWIFT_VERSION 5.9`, avoid strict-concurrency-only features, no `@Observable`), light theme by default + dark palette, neon `#CCFF00`, 3 bottom tabs, bilingual zh/en in-app toggle, SSE realtime with H5 polling cadence, Keychain token, `API_BASE_URL` from Info.plist (Release `https://api.unimatcha.ai/api/v1`, Debug `http://localhost:3001/api/v1`), parallel agents with disjoint file ownership (see `OWNERSHIP.md`).

Project root for all Swift files: `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/` (called `$APP` below). Xcode project is generated from `/Users/aimi/Downloads/unimatcha-compact/apps/ios/project.yml` with xcodegen (`sources: - path: Unimatcha` → every `.swift` under `$APP` is compiled automatically; new folders need no project edit).

---

## A. Target architecture

### A.1 Folder layout (final tree; every file has exactly one owning work package)

```
$APP/
  App/
    UnimatchaApp.swift          @main; injects SessionStore/LocaleStore/ThemeStore/OverlayRouter/ToastCenter/DialogCenter/AppActions/RealtimeClient
    RootView.swift              splash → auth | banned | profileSetup | home ; hosts OverlayHost + ToastHost + DialogHost on top
    MainTabView.swift           3-tab shell: tab panels + floating pill BottomNav (auto-hide) ; owns tab-level stores
    AppRouter.swift             implements AppActions closures (integration glue: opens overlays/switches tabs)
    SessionStore.swift          token (Keychain), currentUser, route state machine (checkUserState), 401 handling, cleanupUserState broadcast
    Theme.swift                 colour tokens (light+dark), radii, fonts, motion, Material→SF icon map, ThemeStore
  Core/
    APIClient.swift, APIError.swift, Keychain.swift, Prefs.swift, ImageTranscoder.swift, StringOrArray.swift, FixtureCheck.swift      (WP-01)
    L10n.swift (mechanism), L10nDictionary.swift (en→zh + placeholders + EXTRA_ZH), L10nMeta.swift (META_ZH), L10nContentPages.swift (help/safety/terms/privacy, both languages), Alias.swift, Formatters.swift   (WP-02 — Formatters is language-aware, so it lives with L10n)
    NotificationL10n.swift (WP-13)
    Realtime/RealtimeClient.swift, Realtime/Throttle.swift, Realtime/PollingLoop.swift   (WP-15)
  Models/      Common (MatchMode/AppTab/HomeView/FriendHubPanel/ContentPageKey/SquareBoardKind, PublicProfile, EventSummary, AdFeedItem, ISODate, AnyCodable), Auth (User/MeUser), Profile (UserProfile READ model — WP-01), ProfileWrite (ProfileUpdate + verification/note/photo DTOs — WP-04), Energy, Matching, Chat, Couple, Questionnaire, Square, SquareDetail, Events, Ads, Relationships, AppNotification, Settings
  Network/     AuthService, ProfileService, MetadataService, UploadService (WP-01), ReportService (WP-01, POST /reports — shared by settings + comment report), MatchingService, ChatService, CoupleService, EnergyService, QuestionnaireService, SquareService, SquareDetailService, EventsService, AdsService, RelationshipsService, NotificationService, SettingsService
  Stores/      SessionStore lives in App/; here: EnergyStore, MatchStore, ChatSessionsStore, SquareStore, NotificationStore, AdTracker
  ViewModels/  per screen
  Views/
    Components/   shared UI kit (see B.5; WP-03b) + BottomNav (WP-16)
    Overlay/      OverlayRouter, OverlayHost, DialogCenter/DialogHost, ToastCenter/ToastHost, SwipeBackContainer, BottomSheetContainer, AppActions (WP-03a)
    Splash/ Auth/ Onboarding/ Questionnaire/ Home/ Chat/ Couple/ Square/ (Cards/ incl. AdCardView) PostDetail/ Events/ Profile/ Settings/ Notifications/ Energy/ FriendHub/
  Resources/    Fonts/ (optional Plus Jakarta Sans, see open decision), Fixtures/ (Debug JSON: one `<wp-domain>-*.json` set per domain package, see H.4)
  Assets.xcassets (AccentColor → #CCFF00 by WP-02; LoginBackground + SplashLogo imagesets copied from apps/h5/public by WP-04; AppIcon by WP-16), Info.plist
```

**Legacy-file strategy (binding):** WP-01 deletes every pre-existing Swift file under `Models/`, `Network/`, `ViewModels/`, `Views/` **except** `Views/Components/FlowLayoutView.swift`, and replaces `App/UnimatchaApp.swift`, `App/RootView.swift`, `App/MainTabView.swift` with minimal compiling stubs (WP-16 rewrites them). `App/Theme.swift` is left for WP-02 to rewrite. Result: the tree typechecks green from Tier 0 onward, and every later package only *adds* compiling files. Packages that "reuse" old code read it with `git show HEAD:apps/ios/Unimatcha/<path>` (the file-level verdicts are in §F and `ios-*.md`).

### A.2 Navigation model — how H5 pages/overlays map to SwiftUI

H5 has three navigation layers; we replicate them literally instead of forcing them into a nav stack.

1. **Root pages** (`.page` in H5: splash, auth, banned, profile-setup, home). One `RootRoute` enum in `SessionStore`; `RootView` switches on it with a `.transition(.opacity)`. Routing is `checkUserState()` (see A.4). The questionnaire page (`#page-questionnaire`) is *not* a root route: it is presented as a full-page overlay (below) so home keeps its state, exactly like H5 keeps home DOM alive.
2. **Tabs** inside home: `MainTabView` renders the three tab panels (Match home, Square, Profile) in a `ZStack`, only the active one visible (`display:none` semantics — H5 keeps the other panels' DOM/scroll positions alive; we keep the views mounted and toggle `.opacity/.allowsHitTesting` rather than using `TabView`, so scroll positions and per-page state survive). A custom floating pill `BottomNav` (icon-only, 62 pt, auto-hides on scroll-down via a `ScrollOffsetReporter` preference) replaces `UITabBar`. Re-tapping Square = scroll-to-top + refresh current page only; Match/Profile re-tap = no-op.
3. **Overlays** (`.overlay` in H5 — stacked layers, not push/pop): a global `OverlayRouter` (ObservableObject) holding an ordered `[AppOverlay]`; `OverlayHost` renders them in a `ZStack` above the tab shell in array order. Each overlay declares its `OverlayStyle`:
   - `.fullPage` — opaque `Theme.C.surface` ground, fade 0.25 s, optional left-edge **swipe-back** (`SwipeBackContainer`: start ≤30 pt from left edge, direction lock after 10 pt, follows finger, commit ≥80 pt → slide out 0.2 s then dismiss, else spring back 0.25 s). Only overlays whose H5 counterpart contains an `arrow_back`/`arrow_forward` icon get `swipeBack: true` (list in `h5-core.md §2.6`): chat, friend hub, notifications, notif-detail, post-detail, square-search, settings, content, tickets, ticket-detail, energy purchase, milestone, partner-profile, questionnaire page. NOT: edit-profile, new-post, bottom sheets, image viewer, ad detail.
   - `.bottomSheet` — dimmed backdrop `black/40` + 2 pt blur, sheet slides up 0.32 s (`Theme.Motion.snap`), header is the drag handle: drag down >110 pt → close (`BottomSheetContainer`); backdrop tap closes. Used by preferences sheet and questionnaire nav grid.
   - `.card(dismissOnBackdrop:)` — centred card on `black/40` backdrop (verify, add-interest, contact, report, questionnaire cards, language dialog).
   - `.lightbox` — image viewer (tap anywhere closes).
   - `.popover(anchor:)` — plus-menu card, post/comment action menus (tap outside closes).
   `OverlayRouter.dismissAll()` is called by logout/401 (H5 `closeAllOverlays`). Confirm/prompt cards and toasts are NOT overlays (H5 parity): `DialogCenter` and `ToastCenter` render in their own hosts above everything (z: overlays < dialog < toast).
4. **Cross-domain navigation** goes through `AppActions` (closure bag; implemented by `App/AppRouter.swift` in the integration package). Domain packages never import each other's views; they call `AppActions.shared.openChat(matchId)` etc. This is what makes the packages disjoint.
5. **Conversation, post detail, partner profile, notifications, settings, friend hub, energy purchase, tickets, content pages, questionnaire** are all overlays (full page). Couple Space is not an overlay: it is the content of the Romantic pane when state == `relationship` (rendered inside `MatchPaneView` via a slot). Preference sheet, q-nav grid = bottom sheets. Plus-menu = popover.
6. **Overlay id registry (single source of truth — every `AppOverlay.id` and `OverlayRouter.isPresented(_:)` check uses exactly these strings).** A domain package presents its *own* overlays directly (`OverlayRouter.shared.present(...)`) when the trigger is inside the same package; anything cross-package goes through `AppActions`, which `AppRouter` (WP-16) implements by presenting the same ids.

| id | style | swipeBack | onDismiss must | owner (content view) |
|---|---|---|---|---|
| `page-questionnaire` | fullPage | yes | keep answers in VM (same-version resume) | WP-05 |
| `questionnaire-cards` | card(dismissOnBackdrop:false) | – | – | WP-05 |
| `q-nav` | bottomSheet | – | – | WP-05 |
| `plus-menu` | popover(anchor: + button) | – | – | WP-06 |
| `filter-overlay` | bottomSheet (drag-close >110) | – | `MatchStore.resyncSummary()` (all close paths) | WP-17 |
| `partner-profile` | fullPage (back control always rendered, even while loading/error — D14) | yes | – | WP-17 |
| `chat` | fullPage | yes | `ChatViewModel.close()` → sessions reload if chat pane visible | WP-07 |
| `chat-avatar-menu` | popover(anchor: tapped avatar) | – | – | WP-07 |
| `image-viewer` | lightbox | – | – | WP-03b (view) / WP-16 (route) |
| `square-search` | fullPage | yes | – | WP-09 |
| `post-detail` | fullPage | yes | `PostDetailViewModel.close()` (clear reply target, keep draft) | WP-09 |
| `post-action-menu`, `comment-action-menu` | popover | – | – | WP-09 |
| `new-post` | fullPage | **no** | – | WP-09 |
| `ad-detail` | fullPage | **no** | – | WP-18 |
| `tickets`, `ticket-detail` | fullPage | yes | – | WP-10 |
| `edit-profile` | fullPage | **no** | – | WP-11 |
| `add-interest` | card(dismissOnBackdrop:true) | – | – | WP-11 |
| `verify` | card(dismissOnBackdrop:true), scroll max 88 % | – | – | WP-11 |
| `notifications` | fullPage | yes | `NotificationStore.close()` (stop polling) | WP-13 |
| `notif-detail` | fullPage | yes | – | WP-13 |
| `settings` | fullPage | yes | – | WP-13 |
| `content` | fullPage (works logged-out — must not read SessionStore) | yes | – | WP-13 |
| `contact` | card(dismissOnBackdrop:false) | – | – | WP-13 |
| `report` | card(dismissOnBackdrop:false) | – | – | WP-13 |
| `language-dialog` | card(dismissOnBackdrop:true) | – | – | WP-13 |
| `energy-purchase` | fullPage | yes | – | WP-14 |
| `friend-hub` | fullPage | yes | stop QR scanner | WP-14 |
| `milestone` | not built (D2) | | | |

Confirm/prompt cards (`DialogCenter`) and couple popups (`DialogCenter.custom`) are not in this registry.

### A.3 State ownership (H5 `S.*` → iOS)

| Concern | Owner (singleton, `@MainActor ObservableObject`) | Reset on `sessionDidReset` |
|---|---|---|
| token, currentUser, route, energy-free session facts | `SessionStore` | it is the broadcaster |
| language / dark mode / FAB position | `LocaleStore`, `ThemeStore`, `Prefs` (device-level, **not** reset — H5 parity) | no |
| enhanced toggle per mode | `MatchStore` (persisted `Prefs.enhanced(uid:)`, keyed by user id) | in-memory yes; UserDefaults keyed by uid stays |
| energy balance | `EnergyStore` | yes |
| match status/prefs per mode, homeView, activeMatchMode, lastEnhancedRound, sequence tokens | `MatchStore` | yes |
| sessions, open chat | `ChatSessionsStore`, `ChatViewModel` | yes |
| square caches per page, scroll memory, search, compose | `SquareStore` (+ `PostDetailViewModel`, `NewPostViewModel`) | yes (all fields, incl. the ones H5 forgets) |
| notifications list/paging/badge | `NotificationStore` | yes |
| ads queue/impressions | `AdTracker` | yes (explicit, not lazy token compare) |
| questionnaire buckets | `QuestionnaireViewModel` (app-level instance) | yes |
| couple space cache | `CoupleViewModel` | yes |
| metadata lists cache | `MetadataService.cache` | yes |
| tickets cache, verify card url | `TicketsViewModel`, `VerifyViewModel` | yes |

Every store subscribes to `NotificationCenter` `.sessionDidReset` and clears itself, stops timers/polling. `RealtimeClient.stop()` is called by `SessionStore.cleanupUserState()` first (through `SessionStore.realtimeStopHook`, set by WP-16 — WP-01 must not import WP-15). `OverlayRouter.dismissAll()` + `DialogCenter.dismissAll()` are likewise performed by WP-16's `AppRouter` on `.sessionDidReset` (WP-01 must not import WP-03a).

Language switch (`LocaleStore.set`): H5 reloads the page. iOS parity policy (D18): `AppRouter` observes `LocaleStore` and on change calls `OverlayRouter.dismissAll()`, `DialogCenter.dismissAll()`, then `RootView` remounts via `.id(locale.lang)`; stores are singletons and keep their data (session, caches) — only view state is dropped. No splash replay.

### A.4 Boot / routing state machine (`SessionStore.checkUserState()` — port of `h5-core.md §2.1/§3.3`, `h5-auth-onboarding.md §1.7`)

```
launch → route = .splash (min 3.0 s or Skip; the /users/me fetch starts immediately in parallel)
  no token                          → cleanupUserState(); OverlayRouter.dismissAll(); route = .auth
  GET /users/me → 401               → delete token; cleanup; route = .auth
  GET /users/me → other error       → keep token; route = .auth with retry hint? NO: show .splashError (retry button) — divergence from H5 (which logs out on network failure); H5 maps flag this as a bug not to replicate
  user.status == "BANNED"           → route = .banned (token kept, no SSE)   (practically unreachable, see api-auth S2)
  else start RealtimeClient; hasProfile = user.hasProfile ?? (user.profile?.nickname != nil)
       !hasProfile                  → route = .profileSetup
       hasProfile                   → route = .home; activeTab = .match; homeView = .chat
login success  → setToken; checkUserState()   (login 401 must NOT run the session-expired path: Endpoint.isPublic)
register       → setToken; currentUser = light user; start realtime; route = .profileSetup
profile saved  → route = .home, tab match, homeView chat, then present questionnaire-cards overlay
logout / 401   → stop realtime + all pollers; delete token; cleanupUserState(); dismissAll(); route = .auth
```
Questionnaire is never a boot gate; the wall lives in the match pane (`h5-match.md §2.1`).

### A.5 Threading & concurrency rules (Swift 5 mode)
- All stores/VMs are `@MainActor final class X: ObservableObject`. Network calls `async throws` on `APIClient` (non-isolated). No `@Observable`, no `Sendable` annotations required; avoid capturing non-Sendable across actors in ways that warn under Swift 6 later (prefer value types in results).
- Every async screen action that depends on "which item is open" snapshots the id first and discards results if the id changed (H5 A9 guards) — use a per-VM `generation` integer.
- Timers: `PollingLoop` (Task + `Task.sleep`), cancelled on `stop()`; `Timer.publish` is fine for 1 s countdown ticks inside views.

---

## B. Foundation layer specification (WP-01, WP-02, WP-03a, WP-03b, WP-15 must ship exactly these public signatures; domain packages code against them; §B.7 lists the domain-store signatures that sibling packages and WP-16 code against)

### B.1 Network (`Core/APIClient.swift`, `Core/APIError.swift`, `Core/StringOrArray.swift`, `Models/Common.swift`) — WP-01

```swift
enum HTTPMethod: String { case GET, POST, PUT, PATCH, DELETE }

struct Endpoint {
    var path: String                       // "/chat/sessions" — relative to base, leading slash, NO "/api/v1"
    var method: HTTPMethod = .GET
    var query: [URLQueryItem] = []
    var body: Data? = nil                  // pre-encoded JSON
    var isPublic: Bool = false             // true → a 401 is a normal error (login/register), NOT session expiry
    static func get(_ path: String, query: [URLQueryItem] = []) -> Endpoint
    static func post<B: Encodable>(_ path: String, body: B?, query: [URLQueryItem] = [], isPublic: Bool = false) -> Endpoint
    static func post(_ path: String, query: [URLQueryItem] = []) -> Endpoint          // no body
    static func put<B: Encodable>(_ path: String, body: B?) -> Endpoint
    static func put(_ path: String) -> Endpoint
    static func patch<B: Encodable>(_ path: String, body: B) -> Endpoint
    static func delete(_ path: String) -> Endpoint
}
// JSON encoding: JSONEncoder with default keys; optionals that are nil are OMITTED (synthesized Codable) — required by forbidNonWhitelisted.
// To send an explicit JSON null (e.g. preferredGender null, ageMin null) the request struct uses `NullableField<T>` (see below).

struct APIEnvelope<T: Decodable>: Decodable { let success: Bool; let data: T?; let message: String?; let timestamp: String? }
struct APIErrorBody: Decodable { let statusCode: Int?; let message: StringOrArray?; let path: String? }
enum StringOrArray: Decodable { case one(String), many([String]); var text: String /* joined "\n" */ }

enum APIError: Error {
    case invalidURL
    case network(Error)
    case decoding(Error)
    case http(status: Int, message: String)     // message = server text verbatim (English) or "API <status>"
    case unauthorized(message: String)          // 401 on a non-public endpoint → session already torn down by APIClient
    case emptyData
    var message: String   // user-facing; server text verbatim; callers toast "Failed: \(e.message)" like H5
    var isNotEnoughEnergy: Bool   // message ~ /not enough energy/i
    var isAlreadyMatching: Bool   // message ~ /already matching/i  (used on 200 message too, see MatchingService.start)
}

final class APIClient {
    static let shared: APIClient
    let baseURL: URL          // Info.plist API_BASE_URL; falls back to https://api.unimatcha.ai/api/v1
    var tokenProvider: () -> String?     // set by SessionStore
    var onUnauthorized: (String) -> Void // set by SessionStore (runs on main)
    func request<T: Decodable>(_ e: Endpoint) async throws -> T            // returns envelope.data (throws .emptyData if nil)
    func requestEnvelope<T: Decodable>(_ e: Endpoint) async throws -> APIEnvelope<T>   // when top-level message is needed
    func send(_ e: Endpoint) async throws                                  // ignores payload
    func uploadImage(_ jpeg: Data, mimeType: String = "image/jpeg", filename: String = "image.jpg") async throws -> UploadResult  // multipart field "file"; 120 s resource timeout; 401 here does NOT tear down session (H5 parity)
}
// Request policy: cachePolicy .reloadIgnoringLocalCacheData, timeout 30 s, header Content-Type: application/json, Authorization: Bearer <token> when present.
// 2xx → decode APIEnvelope<T>; non-2xx → decode APIErrorBody (or {message} bare for passport 401); 401 && !isPublic → onUnauthorized(msg) then throw .unauthorized.

struct UploadResult: Decodable { let url: String; let filename: String? }
struct GenericResponse: Decodable { let message: String?; let status: String?; let ok: Bool? }
struct EmptyBody: Encodable {}

/// Encodes `nil` as JSON null (explicit clear) — used for preferredGender/ageMin/ageMax/imageUrl clears.
struct NullableField<T: Encodable>: Encodable { var value: T?; func encode(to:) /* encodeNil when nil */ }
```

Also in `Models/Common.swift` (WP-01): `enum MatchMode: String, Codable { romantic, friend }`, `enum AppTab { match, square, profile }`, `enum HomeView: String { chat, romantic, friend }`, `enum FriendHubPanel { search, qr, graph }`, `enum ContentPageKey: String { help, safety, terms, privacy }`, `enum SquareBoardKind: String { recommend, campus_wall, pinned, search }`, `struct PublicProfile: Decodable` (all optional: userId, verificationStatus, nickname, realName, school, grade, age, city, interests, bio, avatarUrl, socialLinks [String:String]?, relationshipScore, signature, coverUrl, tags, major, mbti, nationality, realPhotos, zodiac, daysKnown, hidden), `struct EventSummary: Decodable` (`id, title, venue?, school?, startAt, endAt?, priceCents, capacity?, ticketsSold, status` + computed `remaining`, `isSoldOut`, `hasEnded`, `isClosed`, `cells = ceil(priceCents/100)` — shared by WP-08 cards and WP-10 purchase), `struct AdFeedItem: Decodable { id, title?, content, images, landingUrl?, advertiserName? }` (the `/ads/feed` item; the *view* is `AdCardView`), `enum ISODate { static func parse(_ s: String) -> Date? /* ISO8601 with/without fractional; "YYYY-MM-DD" as local midnight; "YYYY-MM-DDTHH:mm" as local */ ; static func iso(_ d: Date) -> String }`, `AnyCodable` (fixed encode for dictionaries), `struct MeUser`/`User` in `Models/Auth.swift` per `api-auth-users-profiles.md §3.1`.

`Models/Profile.swift` (WP-01, READ model only): `struct UserProfile: Decodable` — every column of `api-auth §1.2` as optional (`nickname, realName, familyName, givenName, school, grade, gender, genderPref, age, birthday, city, interests [String] (default []), bio, avatarUrl, socialLinks, signature, coverUrl, tags, major, mbti, nationality, studentId, realPhotos, zodiac, wishGifts, relationshipScore, profileCompleteness, joinedAt, connectCode, verificationStatus`), plus `mutating func merge(_ patch: [String: AnyCodable])` used by `SessionStore.markProfileSaved`. It lives in WP-01 because `User.profile` and `SessionStore` need it; the WRITE side (`ProfileUpdate`, `GradeOptions`, verification/note/photo DTOs) is WP-04's `Models/ProfileWrite.swift`.

`Network/UploadService.swift` (WP-01): `enum UploadService { static func upload(image: UIImage) async throws -> String /* absolute URL */ }` = `ImageTranscoder.jpegData` → `APIClient.uploadImage`. `Network/ReportService.swift` (WP-01): `enum ReportService { static func submit(category: ReportCategory, content: String, contact: String?) async throws }` with `enum ReportCategory: String, Encodable { bug, user, content, other }` — used by Settings (WP-13) and comment reporting (WP-09).

### B.2 Session, Keychain, Prefs, ImageTranscoder — WP-01 (Formatters moved to WP-02, see B.3)

```swift
enum Keychain { static func token() -> String?; static func setToken(_: String?) }   // kSecClassGenericPassword, service "ai.unimatcha.token", kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

enum Prefs {   // UserDefaults, device-level, NOT cleared on logout. (lang/theme keys "cl_lang"/"cl_theme" are owned by LocaleStore/ThemeStore in WP-02 so WP-01 and WP-02 stay independent.)
    static var fabPos: CGPoint?         // key "cl_fab_pos"
    static func enhanced(uid: String) -> EnhancedPrefs?; static func setEnhanced(_:, uid:)   // key "cl_enhanced_<uid>"
}
struct EnhancedPrefs: Codable { var romanticEnabled: Bool; var friendEnabled: Bool; var friendCells: Int /* 1…5 */ }

enum RootRoute: Equatable { case splash, auth, banned, profileSetup, home, bootError }

@MainActor final class SessionStore: ObservableObject {
    static let shared: SessionStore
    @Published private(set) var token: String?
    @Published var currentUser: User?
    @Published private(set) var route: RootRoute
    @Published var splashDone: Bool          // true after 3 s or Skip
    var userId: String? { currentUser?.id }
    func setToken(_ t: String?)              // Keychain + APIClient.tokenProvider
    func checkUserState() async              // A.4
    func applyRegistered(user: User, token: String)   // register path → profileSetup
    func markProfileSaved(_ merged: UserProfile)      // merges into currentUser.profile, route .home
    func refreshMe() async throws -> User             // GET /users/me → currentUser
    func handleUnauthorized(message: String)          // 401 path (A.4)
    func logout()                                     // no confirm here (callers confirm) → same teardown → .auth
    func cleanupUserState()                           // calls realtimeStopHook, posts .sessionDidReset
    func goHome()                                     // route = .home
    var realtimeStartHook: (_ token: String) -> Void  // set by WP-16 → RealtimeClient.shared.start(token:) ; called after successful checkUserState (non-banned) and in applyRegistered
    var realtimeStopHook: () -> Void                  // set by WP-16 → RealtimeClient.shared.stop()
}
extension Notification.Name { static let sessionDidReset, sessionDidStart /* posted after successful checkUserState/register */ }

enum ImageTranscoder { static func jpegData(from image: UIImage, maxDimension: CGFloat = 1600, quality: CGFloat = 0.85) -> Data? }   // HEIC→JPEG; enforce ≤8 MB by stepping quality down

enum FixtureCheck {   // Debug-only decode harness (see H.4)
    static func decode<T: Decodable>(_ type: T.Type, fixture name: String) throws   // loads Resources/Fixtures/<name>.json and decodes APIEnvelope<T> or bare T
}
```

`Models/Energy.swift` + `Network/EnergyService.swift` + `Stores/EnergyStore.swift` also belong to WP-01 (they are cross-cutting: match, square tickets, profile all read the balance):
```swift
struct EnergyBalance: Decodable { totalEnergy, usedEnergy, availableEnergy: Int }
struct EnergyPackage: Decodable { packageId: String; cells: Int; priceCny: Int }
enum EnergyService { static func balance() async throws -> EnergyBalance; packages(); purchase(packageId:) -> PurchaseOrder; confirm(orderId:packageId:) -> PurchaseConfirm }
@MainActor final class EnergyStore: ObservableObject { static let shared; @Published var balance: EnergyBalance?; var available: Int; func refresh() async /* silent on failure */; func refreshThrowing() async throws }
```

### B.3 L10n + Alias + Formatters + content pages (`Core/L10n.swift`, `Core/L10nDictionary.swift`, `Core/L10nMeta.swift`, `Core/L10nContentPages.swift`, `Core/Alias.swift`, `Core/Formatters.swift`) — WP-02

```swift
enum Lang: String { case en, zh }
@MainActor final class LocaleStore: ObservableObject { static let shared; @Published private(set) var lang: Lang; func set(_ l: Lang) /* persists UserDefaults "cl_lang" */ }
@MainActor final class ThemeStore: ObservableObject { static let shared; @Published private(set) var isDark: Bool; func toggle(); func set(dark: Bool) /* persists UserDefaults "cl_theme" */ }

enum Formatters {   // all language-aware via L10n.lang (why it lives in WP-02)
    static func relativeTime(_ iso: String) -> String           // formatPostTime: Just now / 5M Ago / 3H Ago / 2D Ago / locale date (device locale in en, zh-CN in zh) ; zh 刚刚 / 5 分钟前 / 3 小时前 / 2 天前
    static func chatStamp(_ date: Date) -> String               // HH:MM | Yesterday HH:MM | M/D HH:MM ; zh 昨天 HH:MM | M月D日 HH:MM
    static func countdown(ms: Double) -> String                 // HH:MM:SS or "Dd HH:MM:SS" (match.js formatCountdown)
    static func remainingShort(ms: Double) -> String            // chat.js flavour: "Expiring" | "Nm left" | "Nh left" (hours ceil)
    static func eventStrip(_ date: Date) -> String              // "M/D HH:mm" (square event strip / detail schedule range)
    static func ticketDateTime(_ date: Date) -> String          // "YYYY-MM-DD HH:mm" (ticket stub line)
    static func ticketDate(_ date: Date) -> String              // "YYYY-MM-DD" ; ticketTime → "HH:mm" (pass card)
    static func coupleSchedule(_ date: Date) -> String          // device locale "MMM d, hh:mm a" (couple.js fmtTime)
    static func anniversaryTile(_ date: Date) -> (month: String /* "SEP" en */, day: String /* "03" */, year: String)
    static func ageFrom(birthday: String) -> Int?               // calendar age, local YYYY-MM-DD
    static func nextFriday17Local(from: Date = Date()) -> Date  // H5 fallback for reveal (if Friday ≥17:00 → next week)
}

struct ContentPage { let title: String; let intro: String?; let lastUpdated: String?; let items: [ContentItem] }   // ContentItem = .faq(q,a) | .section(h, body)
enum ContentPages { static func page(_ key: ContentPageKey, lang: Lang) -> ContentPage }   // verbatim copy of h5-i18n.md §5.7 / h5-settings.md §5.4 (both languages, whole-page)
enum L10n {
    static var lang: Lang                    // reads LocaleStore.shared.lang
    static var isZh: Bool
    static func t(_ en: String) -> String    // exact-key lookup in ZH dictionary; returns `en` when missing or lang == .en. Keys are the EXACT English strings from the H5 maps (e.g. L10n.t("Join Matching Pool"))
    static func pick(_ en: String, _ zh: String) -> String   // for composed/dynamic strings (the 79 H5 ternaries)
    static func placeholder(_ en: String) -> String          // ZH_PLACEHOLDER table
    static func metaLabel(_ value: String?) -> String?        // META_ZH → ZH → value ; identity in en
    static func grade(_ value: String) -> String              // canonical grade display
}
```
Dictionary source: `h5-i18n.md §5` dumps the complete `ZH` (333 entries) and `ZH_PLACEHOLDER` (27) tables and `META_ZH` (247). Copy verbatim. The dictionary file additionally contains a small `EXTRA_ZH` table for **shared** strings H5 leaves English and that more than one package renders: "Are you sure?", "Confirm", "Enter a value", "Skip", "Loading…" (U+2026 variant), "Failed: ", "Failed to load", "Dark mode on", "Light mode on", "Log out of Unimatcha?", "Account Suspended" + its body sentence, "Partner", "[Photo]"→"[图片]", "Sending…", "Saving…". Package-local English-only strings (each map's "English-only" list, e.g. couple copy, friend-hub captions, toasts) are localised **inside the owning package with `L10n.pick(en, zh)`** using the map's suggested zh — WP-02 does not have to harvest them. Adding zh for these is an approved divergence (open decision D3, default yes). Note the H5 key mismatch `Non-Binary` (button) vs `Non-binary` (dictionary): iOS uses the key `Non-binary` everywhere.

Language switch semantics: `LocaleStore.set` publishes; `RootView` applies `.id(locale.lang)` to the whole tree → full remount (== H5 page reload, session kept, in-progress state dropped). Views therefore never need to observe LocaleStore individually; they may read `L10n.t` freely at render.

```swift
enum Alias {  // bit-identical to i18n.js (h5-i18n.md §1.5, api-square-events-social.md §1.5)
    static func name(seed: UInt32?, fallback: String?) -> String   // en "Cozy Heron" / zh "暖心的白鹭"; nil seed → fallback ?? "Anonymous"
    static func emoji(seed: UInt32) -> String                        // EMOJI[(n>>8)%16]
    static func background(seed: UInt32) -> Color                    // BG[(n>>16)%16]
}
```

### B.4 Theme (`App/Theme.swift`) — WP-02

Exact tokens (light / dark) — from `h5-design-system.md §1`:

| Token | Light | Dark |
|---|---|---|
| `neon` | #CCFF00 | #CCFF00 |
| `neonPink` | #FF2EC4 | #FF2EC4 |
| `surface` (page/tab/overlay ground) | #f9f9f9 | #121110 |
| `card` (surface-container-lowest, white) | #ffffff | #1c1b19 |
| `containerLow` (soft inputs) | #f3f3f3 | #23211f |
| `container` | #eeeeee | #292724 |
| `containerHigh` | #e8e8e8 | #2f2d2a |
| `containerHighest` | #e2e2e2 | #363431 |
| `onSurface` (primary text) | #1b1b1b | #eceae6 |
| `onSurfaceVariant` (secondary) | #474747 | #aaa8a3 |
| `outline` (tertiary text) | #777777 | #8c8a85 |
| `outlineVariant` (hairline/placeholder) | #c6c6c6 | #343230 |
| `primary` (ink, titles, black buttons) | #000000 | #eceae6 |
| `borderStrong` (border-black) | #000000 | #4b4945 |
| `hairline` (rgba) | rgba(0,0,0,.07) | rgba(255,255,255,.09) |
| `glassBar` | rgba(249,249,249,.80) | rgba(18,17,16,.85) |
| `navPill` | rgba(255,255,255,.92) / border rgba(0,0,0,.08) | rgba(28,27,25,.92) / rgba(255,255,255,.08) |
| `bubbleTheirs` | #f1f1f1 | #292724 |
| `avatarFallbackBg / fg` | #e2e2e2 / #474747 | #343230 / #dddddd |
| `emptyTile / emptyIcon` | #efefef / #8a8a8a | #23211f / #8c8a85 (dark-aware improvement over H5) |
| `textCardIvory` | #f6f1e7 | #f6f1e7 (unchanged, intentional) |
| `textCardInk` | #3f3f3f | #3f3f3f |
| `mpMuted` #b0b0b0, `mpLabel` #9a9a9a, `mpSub` #8a8a8a | same | #8c8a85 |
| `toastBg / toastFg` | #000 / #fff | #000 / #fff (unchanged) |
| `notifPlate` | #f1f1f1 / #1b1b1b | #292724 / #eceae6 |
| `coupleHeroPlum` | #2e1a3a | same |

```swift
// ThemeStore is declared in B.3 (WP-02) — it persists UserDefaults "cl_theme" itself.
extension Color { init(hex: String); init(light: String, dark: String) /* UIColor dynamic provider */; init(lightRGBA: (Double,Double,Double,Double), darkRGBA: ...) }
enum Theme {
    enum C { static let neon, neonPink, surface, card, containerLow, container, containerHigh, containerHighest, onSurface, onSurfaceVariant, outline, outlineVariant, primary, borderStrong, hairline, glassBar, navPill, navPillBorder, bubbleTheirs, avatarFallbackBg, avatarFallbackFg, emptyTile, emptyIcon, textCardIvory, textCardInk, mpMuted, mpLabel, mpSub, toastBg, toastFg, notifPlate, notifPlateFg, coupleHeroPlum, aliasBg(index:Int) : Color }
    enum R { static let base: CGFloat = 10, feed = 6, chip = 10, sheetTop = 10, bubble = 18, bubbleTail = 6, plate = 12, menu = 14, empty = 18, pass = 20, profileSheet = 24, cta = 12 }
    enum Space { page 24, settings 20, feed 6, postDetail 12, chat 16, plan 30 }
    enum Bar { static let home: CGFloat = 56, square = 44, overlay = 64 }   // + safeAreaInsets.top
    static func font(_ size: CGFloat, weight: Font.Weight = .regular) -> Font   // Plus Jakarta Sans if bundled ("PlusJakartaSans-<Weight>"), else .system(size:weight:)
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font   // JetBrains Mono if bundled else .system(design:.monospaced)
    enum Motion { static let snap = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.28); static let sheet = ...0.32; static let fade = .easeInOut(duration: 0.25); static let hero = ...0.45; static let press = 0.15 }
    enum Icon { static func sf(_ material: String) -> String }   // complete map for the icon inventory in h5-design-system.md §13 (add→plus, notifications_none→bell, chat_bubble→bubble.left.fill, eco→leaf.fill, person→person.fill, search→magnifyingglass, close→xmark, arrow_back→chevron.left, more_horiz→ellipsis, favorite→heart / heart.fill, verified→checkmark.seal.fill, lock→lock, refresh→arrow.clockwise, bolt/flash_on→bolt.fill, confirmation_number→ticket, settings→gearshape, chevron_right→chevron.right, expand_more→chevron.down, translate→globe, dark_mode→moon, contrast→circle.lefthalf.filled, help_outline→questionmark.circle, shield→shield, flag→flag, gavel→scale.3d, policy→doc.text, tune→slider.horizontal.3, grid_view→square.grid.2x2, auto_awesome→sparkles, group→person.2, check_circle→checkmark.circle.fill, check→checkmark, image→photo, visibility/visibility_off→eye/eye.slash, arrow_upward→arrow.up, qr_code_2→qrcode, hub→point.3.connected.trianglepath.dotted, ios_share→square.and.arrow.up, link_off→link.badge.minus? (use "link" with slash overlay → "personalhotspot.slash" fallback "xmark.circle"), waving_hand→hand.wave, edit_note→square.and.pencil, wallpaper→photo.on.rectangle, forum→bubble.left.and.bubble.right, cloud_off→icloud.slash, school→graduationcap, push_pin→pin.fill, person_off→person.slash, hourglass_empty→hourglass, hourglass_disabled→hourglass.tophalf.filled (with slash if available), group_off→person.2.slash, block→nosign, add_a_photo→camera.badge.plus (fallback camera), photo_camera→camera.fill, place_item→square.and.arrow.down, mail/mail_outline→envelope, pin→number, calendar_month→calendar, redeem→gift, celebration→party.popper, bedtime→bed.double, sentiment_*→face.smiling etc., timer→timer, touch_app→hand.tap, account_balance_wallet→wallet.pass, credit_card→creditcard, chat→message, schedule→clock, location_on→mappin.and.ellipse, list→list.bullet, edit→pencil, delete→trash, ...)
}
```
Theme application: `RootView` sets `.preferredColorScheme(theme.isDark ? .dark : .light)` — the app never follows the system (H5 parity; open decision D10). All dynamic colours resolve through the trait collection, so `Color(light:dark:)` works with `preferredColorScheme`. Neon/pink never change in dark; neon always carries black text/icons.

### B.5 Shared UI kit — WP-03a (`Views/Overlay/*`: overlay system, dialogs, toast, actions bag, `FullPageBar`, `ActionMenu`) and WP-03b (`Views/Components/*`: everything else). Exact signatures (design specs in `h5-design-system.md §8`). WP-03a and WP-03b are independent of each other (03b's `ImageViewerView` is a plain view; 03a's `OverlayHost` renders `AnyView` content).

```swift
// Overlay system (WP-03a)
enum OverlayStyle { case fullPage, bottomSheet, card(dismissOnBackdrop: Bool), lightbox, popover(anchor: CGRect, alignment: PopoverAlignment) }
struct AppOverlay: Identifiable { let id: String; let style: OverlayStyle; let swipeBack: Bool; let onDismiss: (() -> Void)?; let content: () -> AnyView }
@MainActor final class OverlayRouter: ObservableObject {
    static let shared: OverlayRouter
    @Published private(set) var stack: [AppOverlay]
    func present(_ o: AppOverlay)                 // replaces an existing overlay with the same id (re-open == H5 openOverlay)
    func dismiss(id: String)                      // runs onDismiss
    func dismissTop(); func dismissAll()
    func isPresented(_ id: String) -> Bool
    var isAnyPresented: Bool                      // used by home swipe guard
    var topSwipeBackTarget: AppOverlay?           // top-most with swipeBack == true
}
struct OverlayHost: View                          // ZStack over content; fade/slide per style; backdrop taps; SwipeBackContainer for eligible
struct SwipeBackContainer<Content: View>: View    // edge ≤30 pt, lock 10 pt, commit 80 pt, follow finger, no fade
struct BottomSheetContainer<Header: View, Body: View>: View   // grab handle 40×4 stone-200, header = drag zone, >110 pt close, maxHeight 70 % (or param)
struct FullPageBar: View                          // 64+safeTop glass bar: back arrow (chevron) + title 20/700 tracking -0.025em, optional trailing; variants: .backTitle(title, onBack, trailing?), .cancelTitleAction(cancel, title, action)

// Feedback (WP-03a)
@MainActor final class ToastCenter: ObservableObject { static let shared; func show(_ text: String, duration: TimeInterval = 3) }   // single toast like H5: a new show() REPLACES the text and RESTARTS the timer (fixes the H5 overlapping-timer bug); no queue, no variants
struct ToastHost: View                                       // black pill, 14 pt white, top 16+safeTop, slideDown 0.3 s
@MainActor final class DialogCenter: ObservableObject {
    static let shared
    func confirm(title: String, body: String? = nil, confirmLabel: String? = nil /* default L10n "Confirm" */, cancelLabel: String? = nil, danger: Bool = false) async -> Bool?   // nil = backdrop tap (abort)
    func prompt(title: String, label: String? = nil, placeholder: String = "", value: String = "", confirmLabel: String? = nil, cancelLabel: String? = nil, multiline: Bool = false, secure: Bool = false) async -> String?   // nil = cancel/backdrop ; single-line: return key submits ; autofocus
    func custom<V: View>(_ id: String, dismissOnBackdrop: Bool, @ViewBuilder content: () -> V)   // for couple popups; dismiss via dismissCustom(id); may stack
    func dismissCustom(_ id: String); func dismissAll()      // dismissAll: pending confirm/prompt resolve nil ; called by AppRouter on sessionDidReset / language change
}
struct DialogHost: View

// Actions bag (WP-03a declares it with no-op defaults so every package compiles and runs standalone; WP-16 fills it)
@MainActor final class AppActions: ObservableObject {
    static let shared
    var switchTab: (AppTab) -> Void
    var switchHomeView: (HomeView) -> Void
    var reloadMatchTab: () -> Void
    var loadSessions: () -> Void
    var noteForUser: (_ userId: String) -> String?                // reads ChatSessionsStore.sessions[*].partner.note (partner profile note pill) — WP-17 must not import WP-07
    var openChat: (_ matchId: String) -> Void                     // openConnectionChat: switch home view chat → load sessions → open (ChatSessionsStore.openSession)
    var openPartnerProfile: (_ userId: String, _ matchId: String?) -> Void
    var openQuestionnaire: (MatchMode) -> Void
    var showQuestionnaireCards: () -> Void
    var openPreferencesSheet: (MatchMode) -> Void
    var openEnergyPurchase: () -> Void
    var openNotifications: () -> Void
    var openFriendHub: (FriendHubPanel) -> Void
    var openPostDetail: (_ postId: String, _ focusComposer: Bool) -> Void
    var openNewPost: (_ board: SquareBoardKind) -> Void
    var openSquareSearch: () -> Void
    var openSettings: () -> Void
    var openEditProfile: () -> Void
    var openVerify: () -> Void
    var openTickets: () -> Void
    var openContentPage: (ContentPageKey) -> Void
    var openContactUs: () -> Void
    var openReportProblem: () -> Void
    var openLanguageDialog: () -> Void
    var toggleDarkMode: () -> Void
    var openImageViewer: (_ url: String) -> Void
    var openAdDetail: (AdFeedItem) -> Void
    var refreshEnergy: () -> Void
    var refreshUnreadBadge: () -> Void
    var requestLogout: () -> Void                                  // confirm card + SessionStore.logout()
}
// SquareBoardKind, AdFeedItem, EventSummary are defined in Models/Common.swift (WP-01) so AppActions and every package can reference them.
struct FullPageBar: View / ActionMenu: View  — WP-03a (they are used by OverlayHost defaults and by every full-page overlay)

// Controls (WP-03b)
struct SoftField: View            // (text: Binding<String>, placeholder: String, size: CGFloat = 14, keyboard:, secure: Bool = false, autocap:) — #f3f3f3 bg, r10, px12 py10, 1 pt neon focus ring
struct SoftTextArea: View         // multiline, rows, maxLength + counter option
struct SoftSelect<T: Hashable>: View   // label + chevron → MetadataPickerSheet (searchable list, placeholder row)
struct UnderlineSelect: View      // setup-page variant
struct CTAButton: View            // (title, style: .neon|.neonPill|.outlineBlack|.outlineNeutral|.pinkOutline|.dangerFill|.text|.linkUnderline, size, tracking, busy, disabled, action)
struct IconButton: View           // (sf: String, size: CGFloat = 40, iconSize: 22, tint, action) circular hit area, press scale .95
struct PillSegmented: View        // (items: [String], selection: Binding<Int>, style: .home|.sheet|.qr) — home style: white pill 40 pt, segments 12/700 tracking .04em, active neon/black
struct InkSwitch: View            // 48×24 (#e2e2e2 → neon, 16 pt knob) ; SettingToggle 40×20 ; DisplayToggle 40×22 read-only
struct RangeSlider: View          // dual-thumb 18–30 (min/max linkage), 14 pt neon thumbs, 2 pt track
struct NeonCheck: View            // 16 pt, r6, neon fill + black check
struct Chip: View                 // (text, selected, style: .stage|.tag|.suggestion|.interest, onTap, onRemove?)
struct Badge: View                // .official(text) .sponsored .pinned .event .underReview .rejected .school(text)
struct SectionLabel: View         // 12/800 tracking .2em
struct MicroLabel: View           // 10/700 tracking .1em
struct EmptyState: View           // (sf icon, title, subtitle, tone: .muted|.neon, action: (label, () -> Void)? , retryUnderline)
struct LoadingLine: View          // grey "Loading…" text
struct HairlineRow: View          // profile/settings row: icon + label + accessory + hairline

// Images
final class ImageCache            // NSCache<NSURL, UIImage> + URLSession download (no APIClient); memory only
struct RemoteImage: View          // (url: String?, contentMode: .fill, placeholder: AnyView?) — validates scheme (http/https/data:image only, safeUrl rule) ; onSuccess reports intrinsic size (needed by masonry)
struct AvatarView: View           // (url: String?, name: String?, size: CGFloat, style: .circle) initials fallback (black circle white initials 2 chars for feed, #e2e2e2/#474747 for chat) ; AvatarView.anonymous(seed:size:) → AliasAvatarView
struct AliasAvatarView: View      // pastel circle + emoji sized round(size*0.62)
struct PhotoPicker: View          // PhotosUI wrapper; returns JPEG Data via ImageTranscoder; single/multi
struct ImageViewerView: View      // lightbox content (overlay id "image-viewer")
struct QRCodeView: View           // CoreImage CIQRCodeGenerator, level M, size, black on white
struct QRScannerView: UIViewControllerRepresentable   // AVCaptureSession + AVCaptureMetadataOutput(.qr); onCode(String) fires once then pauses; error state callback (permission denied / no camera)

// Layout & gestures
struct HorizontalPager<Content: View>: View  // (index: Binding<Int>, count: Int, gap: 12, enabled: () -> Bool, content: (Int) -> Content) — follow finger 1:1, direction lock 12 pt, 0.3 rubber band at ends, commit 70 pt, ±1 clamp, snap Theme.Motion.snap ; each page is its own vertical ScrollView owned by the caller ; exposes `horizLock` to sibling PTR via preference
struct MasonryGrid: View          // (items: [MasonryItem], columnGap: 6, rowGap: 6, content) — MasonryItem { id, fullWidth: Bool, estimatedHeight } ; shorter-column placement + hole backfill (h5-square.md §1.2 algorithm) ; heights measured via preference key ; re-lays out on size change
struct PullToRefresh              // modifier: .pullToRefresh(enabled:, onPull: (CGFloat)->Void = {}, action: async) — custom (not .refreshable): damping 180·(1−e^(−dy/180)), 70 pt commit, indicator disc 40 pt slides from under the bar (z below bar), rotate dist/70·360°, neon when ready, spin ≥600 ms, content translates with finger ; arms only at scrollTop ≤ 0
struct ScrollOffsetReporter       // modifier `.reportScrollOffset(id: String)` publishing `ScrollOffsetKey` (for nav auto-hide, post-detail chrome hide, profile hero). WP-07 ChatListPane, WP-08 SquareTabView pages, WP-11 ProfileTabView MUST apply it so WP-16's BottomNav auto-hide works.
struct NavAutoHideObserver        // helper: dy>6 hide, dy<-6 show, offset<40 always show
struct ActionMenu: View           // (WP-03a) popover card: rows [(sf, label, action)] min width 148/208, r12/14, shadow
struct ConfirmCardView / PromptCardView  // (WP-03a) used by DialogHost
```

### B.6 Realtime + polling (`Core/Realtime/*`) — WP-15

```swift
enum RealtimeEvent: Equatable { case ready, message(matchId: String), read(matchId: String), notification, evicted }
@MainActor final class RealtimeClient: ObservableObject {
    static let shared: RealtimeClient
    @Published private(set) var isUp: Bool               // true after "ready", false on error/stop
    let events: PassthroughSubject<RealtimeEvent, Never>  // Combine; consumers use .sink on main
    func start(token: String)    // GET <base>/realtime/stream?token= via URLSession.bytes(for:); parse "data:" lines (JSON), ignore ": ping"; 60 s liveness watchdog
    func stop()                  // cancels task, isUp = false, cancels reconnect
    // Reconnect: transport error/EOF → backoff 3 s, 6 s, 12 s… max 30 s ; HTTP 401 → stop, no reconnect ; "evicted" → stop, no reconnect (stay full-rate polling)
    // App lifecycle: stop on background after 30 s grace? NO — keep simple: stop on .background, start on .active (integration wires scenePhase)
}
final class Throttle { init(interval: TimeInterval = 3, action: @escaping () -> Void); func fire() /* leading + one trailing */; func cancel() }
@MainActor final class PollingLoop { init(interval: TimeInterval, tick: @escaping () async -> Void); func start(); func stop(); var isRunning; var tickCount: Int }
// Cadence helpers used by consumers:
//   chat poll: interval 5 s; run only when (!RealtimeClient.shared.isUp || tickCount % 6 == 0)
//   notifications: interval 15 s; run when (!isUp || tickCount % 4 == 0)
//   match status: 30 s; countdown ticks: 1 s (Timer in view)
```

Consumers (documented per package): ChatViewModel (message/read for open chat → immediate poll / receipts refresh; busy → pending flag), ChatSessionsStore (message → `loadSessions` via Throttle 3 s), NotificationStore (notification → Throttle 3 s → badge + list refresh if open; **implements the intended wiring H5 left dead**). Integration starts/stops the client in `SessionStore` (start after `/users/me` ok and after register; stop in cleanup).

### B.7 Domain store contracts (cross-package-visible API; the owning package must ship exactly these names so WP-16 and sibling packages can compile against them)

```swift
// WP-06  Stores/MatchStore.swift
@MainActor final class MatchStore: ObservableObject {
    static let shared
    @Published var homeView: HomeView                      // 'chat' default; set by switchHomeView
    @Published var activeMode: MatchMode                   // 'romantic' default
    @Published var status: [MatchMode: MatchStatus]        // last GET /matching/status per mode (nil = unknown)
    @Published var prefs: [MatchMode: MatchPreferencesRead]
    @Published var enhanced: EnhancedPrefs                 // client intent, persisted per uid
    @Published var lastEnhancedRound: [MatchMode: Bool]
    func activate(view: HomeView) async     // == switchHomeView: sets homeView/activeMode, pre-heats, runs ensureQuestionnaireThenMatch or loadSessions (via AppActions.loadSessions), restarts 30 s polling
    func deactivate()                       // stop polling + countdown tick (switchTab away, logout)
    func reload(mode: MatchMode) async      // == loadMatchTab: fetch status, render, restart polling
    func loadPrefs(mode: MatchMode) async throws -> MatchPreferencesRead   // seq-token guarded, caches into prefs[mode]
    func savePrefs(mode: MatchMode, write: MatchPreferencesWrite) async throws   // PUT + merge into cache ; refuses while isPoolActive(mode) (locked toast)
    func isPoolActive(_ mode: MatchMode) -> Bool           // status[mode]?.state == .searching
    func startMatch(mode: MatchMode) async                 // §E
    func stopMatch(mode: MatchMode) async
    func dissolve(matchId: String, reason: String?) async -> Bool
    func setEnhanced(mode: MatchMode, enabled: Bool) async -> Bool   // §E (balance check, toast, opens top-up)
    func setFriendCells(_ n: Int)
    func resyncSummary()                                   // == closeFilterSheet side effect (publish tick so summary boxes re-fill)
    func reportEvent(matchId: String, type: FeedbackEventType)  // viewed / openedProfile, session-deduped
    func reset()                                           // sessionDidReset
}

// WP-07  Stores/ChatSessionsStore.swift + ViewModels/ChatViewModel.swift
@MainActor final class ChatSessionsStore: ObservableObject {
    static let shared
    @Published var sessions: [ChatSession]
    @Published var refundBanner: RefundBannerInfo?         // struct RefundBannerInfo: Equatable { id: String; reason: String?; energy: Int } in Models/Chat.swift ; WP-16 maps AppNotification → RefundBannerInfo
    func loadSessions() async                              // GET /chat/sessions?mode=all&limit=100 ; toast on failure, keep cache
    func reloadThrottled()                                 // Throttle 3 s leading+trailing (SSE message)
    func openSession(matchId: String) async -> Bool        // ensure loaded → find → present overlay "chat" ; false if not found
    func onPaneEnter(); func onPaneLeave()                 // 1 s countdown ticker on/off
    func onRealtimeMessage(matchId: String)                // forwards to ChatViewModel.current + reloadThrottled
    func onRealtimeRead(matchId: String)
}
@MainActor final class ChatViewModel: ObservableObject { static private(set) var current: ChatViewModel?; func pollNow(); func refreshReadReceipts(); func close() }

// WP-08  Stores/SquareStore.swift
@MainActor final class SquareStore: ObservableObject {
    static let shared
    @Published var current: SquareBoardKind                // recommend default (never .search here)
    @Published var pages: [SquareBoardKind: [SquarePostCard]]   // incl. .search cache
    @Published var scrollToTopSignal: Int                  // WP-16 bumps on Square re-tap; SquareTabView scrolls current page to top
    func onTabEnter() async                                // reset scroll memory, load all three pages in parallel (recommend with ads)
    func switchTo(_ board: SquareBoardKind) async          // save/restore scroll, reload only if page empty
    func reloadCurrent() async                             // PTR / nav re-tap
    func applyLike(postId: String, liked: Bool, count: Int)         // sync every cache + open detail
    func applyVote(postId: String, options: [PollOption], myVote: Int?)
    func applyCounts(postId: String, likeCount: Int, commentCount: Int, myLiked: Bool)   // after detail load
    var hasSchool: Bool                                    // SessionStore.currentUser?.profile?.school non-empty
}

// WP-18  Stores/AdTracker.swift
@MainActor final class AdTracker: ObservableObject {
    static let shared
    func fetch(school: String) async -> [AdFeedItem]       // never throws; caches adsById + school captured at fetch time
    func impression(_ id: String)                          // once per campaign per session
    func click(_ id: String)                               // never deduped
    func flush() async                                     // ≤100/req, 5xx/network requeue, 4xx drop, cap 200
    func reset()                                           // sessionDidReset
}

// WP-13  Stores/NotificationStore.swift
@MainActor final class NotificationStore: ObservableObject {
    static let shared
    @Published var unreadCount: Int
    @Published var pendingRefund: AppNotification?         // first unseen energy_refunded in a fetched list (per-id dedupe, per session)
    func refreshBadge() async                              // GET /notifications/unread-count (skips when no token)
    func realtimeTick()                                    // Throttle 3 s: badge always; loaded pages if open
    func open() async; func close()                        // panel lifecycle: reset paging, load page 1, start/stop 15 s polling
}

// WP-05  ViewModels/QuestionnaireViewModel.swift
@MainActor final class QuestionnaireViewModel: ObservableObject { static let shared; func completion() async -> QuestionnaireCompletion? /* nil on failure = fail-open */; func open(mode: MatchMode) /* presents page-questionnaire + loads */; func presentCards() }

// WP-01  Stores/EnergyStore.swift — see B.2.  WP-14 has no store (FriendHubViewModel is per-overlay).
```

---

## C. Screen catalogue — every H5 screen/overlay/state → iOS file, VM, service, models, spec pointer

Legend: file paths relative to `$APP/`. "Spec" = map + section to read. Behaviour must match the spec unless an open decision (section H) says otherwise.

### C.1 Boot & auth (WP-04; routing shell WP-16)

| H5 | iOS view | VM / store | Service + models | Spec |
|---|---|---|---|---|
| `#splash` (logo bob, wordmark, tagline, progress sweep, BETA, Skip; 3 s or Skip → route) | `Views/Splash/SplashView.swift` | `SessionStore.splashDone` | — | h5-core §1.1, h5-auth §1.1, design §7.1 |
| boot error (network failure on /users/me) — iOS-only retry state | `Views/Splash/BootErrorView.swift` (EmptyState cloud_off + Retry) | SessionStore `.bootError` | GET /users/me | h5-core gotcha 2/18 |
| `#page-auth` Sign In / Register tabs, fields, Send code + 60 s cooldown + devCode hint, Forgot (dead → omit), Terms/Privacy footer → content overlay; decorative `login_bg.png` sketch at the bottom (h-256, 10 % opacity — asset copied from `apps/h5/public/login_bg.png` into `Assets.xcassets/LoginBackground`); form state cleared on `sessionDidReset` (fixes h5-auth gotcha 15) | `Views/Auth/AuthView.swift`, `LoginFormView.swift`, `RegisterFormView.swift` | `ViewModels/AuthViewModel.swift` (login, sendCode, register, cooldown countdown, validation toasts) | `Network/AuthService.swift`; `Models/Auth.swift` (WP-01: `AuthResponse`, `User`, `SendCodeResult`) | h5-auth §1.2, §2.2, §3; api-auth §2 |
| `#page-banned` | `Views/Auth/BannedView.swift` | SessionStore | — | h5-core §1.2 |
| `#page-profile-setup` wizard (4 steps) + optional form (avatar immediate upload, 5 underline selects, Looking For, grade, interests ≤8, bio 250, Confirm) | `Views/Onboarding/ProfileSetupView.swift`, `ProfileSetupWizardView.swift`, `ProfileSetupRestView.swift` | `ViewModels/ProfileSetupViewModel.swift` | `Network/ProfileService.swift` (PUT /profiles/me, uploads/avatar), `MetadataService`, `UploadService` (WP-01); `Models/Profile.swift` (`UserProfile` read — WP-01) + `Models/ProfileWrite.swift` (`ProfileUpdate` write struct with encodeIfPresent semantics, `GradeOptions` — WP-04) | h5-profile §1.1, §2 "Profile Setup", §3; h5-auth §1.4/§2.4; api-auth §4.2 |
| post-setup `#questionnaire-cards` overlay | (questionnaire package, C.2) triggered via `AppActions.showQuestionnaireCards` | | | |

Rules: login 401 shows server text ("Incorrect email or password"), never session-expiry; Register jumps to setup with light user + starts SSE; Setup back arrow = explicit logout (D13); age computed from birthday, bounds 16–40; payload exactly as `api-auth §4.2` (setup variant).

### C.2 Questionnaire (WP-05)

| H5 | iOS | VM | Service/models | Spec |
|---|---|---|---|---|
| `#questionnaire-cards` chooser (2 cards, Start/Retake, check, Maybe Later; pre-start confirm card on this path only) | `Views/Questionnaire/QuestionnaireCardsView.swift` (overlay `.card(dismissOnBackdrop:false)` id `questionnaire-cards`) | `QuestionnaireViewModel.completion` | GET /questionnaire/completion | h5-questionnaire §1.1, §1.2, §2.1 |
| `#page-questionnaire` (badge, progress NN/TT zero-padded, watermark Q.NN, title titleEn/title by lang, SCALE/SINGLE/MULTI/TEXT rows, fixed footer Previous/Next→Submit) | `Views/Questionnaire/QuestionnairePageView.swift`, `QuestionRowViews.swift` (overlay `.fullPage`, swipeBack true, id `page-questionnaire`) | `ViewModels/QuestionnaireViewModel.swift` (per-mode buckets, resume A19, blank rule, required-at-submit, drop blanks, generation token) | `Network/QuestionnaireService.swift` (active, completion, answers/mine, submit); `Models/Questionnaire.swift` (`QuestionnaireVersion`, `Question` +titleEn/code/…, `QuestionOption` +labelEn, `AnswerValue` enum {scale(Int), single(String), multi([String]), text(String)} Codable, `MyAnswer`) | h5-questionnaire §1.3, §2.2–2.6, §3; api-matching §5–6 |
| `#q-nav-overlay` bottom sheet grid (8 cols, neon answered, outlined unanswered, ring current) | `Views/Questionnaire/QuestionNavSheet.swift` (overlay `.bottomSheet` id `q-nav`) | same VM | — | h5-questionnaire §1.4 |
| loading / error / empty states (iOS proper, H5 had none) | inside page view | | | gotcha 7 |

Submit success → `SessionStore`/`AppActions.switchHomeView(mode)` + dismiss page. Back/swipe-back exits without saving (answers stay in VM for same-version resume).

### C.3 Match home (WP-06 core; WP-17 preferences sheet + partner profile) — the Match tab

State matrix to implement verbatim (h5-match §1.2): romantic idle/unknown → plan(idle); searching → plan(searching); matched/confirming → matched card (partner missing → Profile Unavailable); no_match → no-match card; relationship → couple slot (partner missing → Profile Unavailable). Friend idle/unknown **or matched with empty `matches`** → plan(idle); searching → plan(searching); matched with ≥1 → candidate list (branch per item `status`); no_match with empty matches → no-friends card; **no_match with non-empty matches → plan(idle)**. Questionnaire wall only when completion=false AND state idle/unknown; otherwise refill banner prepended after the real state.

| H5 | iOS | VM/store | Service/models | Spec |
|---|---|---|---|---|
| `#tab-match` shell: 56+sat glass top bar [+ button][Chat·Romantic·Friend pill max-w 268][bell+badge] + 3-pane horizontal track (12 pt gap, swipe physics, disabled when any overlay/popover open) | `Views/Home/MatchHomeView.swift` (uses `HorizontalPager`; slots: `chatPane: () -> AnyView`, `coupleSpace: (matchId, partner) -> AnyView` injected by integration) , `Views/Home/HomeTopBar.swift` | `Stores/MatchStore.swift` (B.7: homeView, activeMode, status[mode], prefs[mode], enhanced, lastEnhancedRound, seq tokens, polling 30 s w/ 5-failure stop, countdown tick) | `Network/MatchingService.swift` (status, start via `requestEnvelope`, stop, preferences GET/PUT, dissolve(matchId, reason?) — chat passes `user_dissolved`, match passes nil → `{}`, confirm, feedback events, connect, milestones); `Models/Matching.swift` (`MatchStatus` romantic/friend union, `RomanticMatch`, `FriendMatch`, `MatchPreferencesRead`, `MatchPreferencesWrite` with `NullableField` for preferredGender/ageMin/ageMax/universityStage, `StartMatchRequest`, `FeedbackEvent`, `ConnectResult`, `Milestones`) | h5-match §1.1, §1.2, §2.1–2.3, §2.11; h5-core §1.4, §2.3; design §7.2, §8.6 |
| plus-menu popover (5 items) | `Views/Home/PlusMenu.swift` (overlay `.popover`, id `plus-menu`) | — | — | h5-match §1.11, design §8.13 |
| plan page idle/searching × romantic/friend (title 26, sub 2-line, bleeding neon countdown card with week row + REVEAL badge/ring + outlined digits ticking, summary box fixed head + scroll body, CTA join / pink Leave) | `Views/Home/MatchPlanView.swift`, `RevealCountdownCard.swift`, `PreferenceSummaryBox.swift` | `MatchStore` + `ViewModels/MatchPaneViewModel.swift` (one per mode; pre-heat inactive pane; same-state value-only refresh) | preferences GET per mode (seq token), energy balance | h5-match §1.3, §2.5, §2.6, §2.11, gotchas 1–5; design §9 |
| romantic matched/confirming card (pulsing 112 avatar, cover gradient, chips, 48 h countdown, Enter Chat, footnote) | `Views/Home/MatchedCardView.swift` | pane VM (report `viewed`) | | h5-match §1.4; design §8.23 |
| romantic no_match / friend no_match / Profile Unavailable | `Views/Home/MatchEmptyStates.swift` | | | h5-match §1.5, §1.7, §1.8 |
| friend candidates (≤5 cards: timer / Friends / Pending, Enter Chat, Cancel connection + dissolve confirm) | `Views/Home/FriendCandidatesView.swift` | pane VM (per-card status branch, remaining tick) | dissolve | h5-match §1.6, §1.14, §2.7 |
| questionnaire wall prompt card + refill banner | `Views/Home/QuestionnaireGateViews.swift` | pane VM (`ensureQuestionnaireThenMatch`) | GET /questionnaire/completion, status | h5-match §1.9, §1.10, §2.1 |
| `#filter-overlay` preferences bottom sheet (romantic/friend sections, shared age/school, enhanced toggles + cells slider, extra info 500, Retake row; view-only while searching + notice; Save rules; all close paths resync summary) — **WP-17** | `Views/Home/PreferencesSheet.swift` (overlay `.bottomSheet` id `filter-overlay`), `Views/Home/PreferencesControls.swift` | `ViewModels/PreferencesViewModel.swift` (reads/writes `MatchStore`; Retake row → `AppActions.openQuestionnaire(mode)` after dismissing the sheet) | `MatchStore.loadPrefs/savePrefs/setEnhanced/setFriendCells`, energy balance | h5-match §1.12, §2.10; api-matching §3.8–3.9 gotchas 1–2 |
| enhanced-confirm card, locked toast, join/leave toasts, already-matching detection | in `MatchStore.startMatch()` via `DialogCenter.confirm` | | POST start (`requestEnvelope` to read message) | h5-match §1.13, §2.5, gotchas 5–7 |
| `#partner-profile-overlay` (cover hero + absolute back, avatar ring, verified/UNVERIFIED, note pill + note prompt, realName, school, grade·age·city, Known for N days, facts grid, interest chips, About, Photo Portfolio; hidden:true state) — **WP-17** | `Views/Home/PartnerProfileView.swift` (overlay `.fullPage`, swipeBack true, id `partner-profile`; back control always rendered; error state = EmptyState + Retry, D14) | `ViewModels/PartnerProfileViewModel.swift` (note via `AppActions.noteForUser`; after note save `AppActions.loadSessions()`) | `ProfileService.publicProfile`, `ProfileService.setNote`, `MatchStore.reportEvent(openedProfile)` | h5-match §1.15; h5-profile §1.6; api-auth §3.9–3.10 |

### C.4 Chat (WP-07)

| H5 | iOS | VM/store | Service/models | Spec |
|---|---|---|---|---|
| Chat pane (list: temp block w/ 12 pt corners + countdown badges, confirmed w/ romantic first, note chip, preview 28 chars/[Photo], relative time, unread dot, empty state, PTR only here, refund banner mount: tap → `AppActions.openEnergyPurchase`, × hides; copy `Boost match unconfirmed after 48h — N energy refunded` / `No match available this round — N energy refunded` / D7 `The event was cancelled — N energy refunded`) | `Views/Chat/ChatListPane.swift` (applies `.reportScrollOffset(id:"chat")`), `SessionRow.swift`, `RefundBanner.swift` (`init(info: RefundBannerInfo, onTap:, onClose:)`) | `Stores/ChatSessionsStore.swift` (B.7: sessions, loadSessions, 1 s countdown ticker, `refundBanner`, SSE message → Throttle 3 s reload; `loadSessions` also triggers `AppActions.refreshEnergy`) | `Network/ChatService.swift` (sessions limit 100, messages, poll, send, read, nudge, background, nudge-suffix); `Models/Chat.swift` (`ChatSession` w/ `SessionPartner{id,note,nickname,avatarUrl,school,gender,age}`, `ChatMessage`, `MessagesPage`, `RefundBannerInfo`, requests) | h5-chat §1.1, §2.1, §2.11; api-chat §1.2 |
| `#chat-overlay` conversation (wallpaper blur, 64+sat header: back / 36 avatar → profile / name + school / confirm pill / Waiting… / link_off; time separators ≥10 min; bubbles 72 %; Read receipt; nudge lines; composer with pending image; dissolved notice; last-30 window + prepend on top) | `Views/Chat/ConversationView.swift`, `ChatHeaderView.swift`, `MessageBubbleView.swift`, `ChatComposerView.swift` (overlay `.fullPage`, swipeBack true, id `chat`) | `ViewModels/ChatViewModel.swift` (full history walk, render window, poll 5 s/30 s with busy+pending, cursor rules, dedupe, read receipts every 3rd poll + SSE read, send guard + draft restore, 403 lock, confirm/dissolve + syncFromSessionList) | ChatService, MatchingService.confirm/dissolve, UploadService, ProfileService.setNote | h5-chat §1.3–1.7, §2.2–2.14, gotchas 1–23; api-chat §1.3–1.10 |
| partner-avatar popover (Nudge / Set note / Chat background) | `Views/Chat/ChatAvatarMenu.swift` (ActionMenu popover) | ChatViewModel | nudge, notes, background + upload | h5-chat §1.4, §2.12 |
| image viewer | shared `ImageViewerView` via `AppActions.openImageViewer` | | | h5-chat §1.5 |

### C.5 Square feed (WP-08) + ads (WP-18)

Feed contract (parity, not negotiable): every feed request is `page=1&limit=20` and **there is no infinite scroll / load-more** (H5 never paginates); pinned is unpaginated. Like = POST first, then local ±1 (server returns no count) — no optimistic pre-flip. Cards show title (or first 60 chars of content), 16 pt avatar + name, like count; no time/school on small cards.

| H5 | iOS | VM/store | Service/models | Spec |
|---|---|---|---|---|
| `#tab-square` (44+sat bar: Recommend/Campus Wall ink tabs + hanging 10 pt Pinned segment + search button; 3-page pager; per-page scroll memory; FAB draggable persisted, hidden on pinned; PTR current page; nav re-tap) | `Views/Square/SquareTabView.swift` (each page `.reportScrollOffset(id:"square")`; observes `SquareStore.scrollToTopSignal`), `SquareHeaderView.swift`, `SquareFAB.swift` | `Stores/SquareStore.swift` (B.7: pages cache, seq per page, scroll memory, like/vote/counts sync across caches, ads placement using `AdTracker.fetch`) | `Network/SquareService.swift` (recommend, campusWall, pinned, search, like, vote); `Models/Square.swift` (`SquarePostCard` full field list, `PollOption`, `AnonymousAuthor{aliasSeed}`, `FeedPage`, `SearchResponse{query, posts: FeedPage}`, `VoteResult`, `LikeResult`, `AuthorDisplay` helper) — `EventSummary`/`AdFeedItem` come from Models/Common | h5-square §1.1, §2 "Square tab"; h5-addfriend-ads §1.2, §2.5–2.6; api-square §2.2–2.5 |
| masonry + card kinds (small image / ivory highlighter text card / official large / wide campus / text card; badges; event strip; poll block with vote) | `Views/Square/FeedPageView.swift`, `Cards/SmallCard.swift`, `Cards/TextCard.swift`, `Cards/LargeCard.swift`, `Cards/WideCard.swift`, `Cards/PollBlock.swift`, `Cards/EventStrip.swift`, `Cards/CardParts.swift` (author row, like button, badges, comment-snippet line) | SquareStore | vote, like | h5-square §1.2, §1.3; design §8.19, §10 |
| feed states (error / need school / empty / pinned empty) | inside `FeedPageView` (EmptyState) | | | h5-square §1.1 states |
| sponsored ad card + `#ad-detail-overlay` + impression/click batching — **WP-18** | `Views/Square/Cards/AdCardView.swift` (`init(ad: AdFeedItem, onTap:)`, reports impression via `onVisible(≥50 %)`), `Views/Square/AdDetailView.swift` (overlay `.fullPage`, swipeBack false, id `ad-detail`) | `Stores/AdTracker.swift` (B.7; click queued before opening `landingUrl` in Safari / detail) | `Network/AdsService.swift` (feed, events); `Models/Ads.swift` (`AdEvent`, `AdEventsRequest`) | h5-addfriend-ads §1.2, §1.3, §2.5–2.6; api-square §4 |
| `#square-search-overlay` — **WP-09** (renders WP-08 cards) | `Views/Square/SquareSearchView.swift` (overlay `.fullPage`, swipeBack true, id `square-search`; guide/loading/error/empty/results states; no ads) | `ViewModels/SquareSearchViewModel.swift` (300 ms debounce, seq, results into `SquareStore.pages[.search]`) | `SquareService.search(q:)` (no `board`) | h5-square §1.4, §2 "Search" |

Ads: fetch only on recommend with `profile.school` (school string captured at fetch time is what every event carries); placement: first ad after the 3rd card (or appended if <3 cards), then one after every 8 *small* cards, no repeats per render; impression ≥50 % once per campaign per session (`onAppear` + visibility check via GeometryReader); queue cap 200; flush every 10 s + on `scenePhase .background/.inactive` (UIApplication background task); ≤100 per request; 5xx/network requeue, 4xx drop; never on wall/pinned/search.

### C.6 Post detail + new post + square search (WP-09)

| H5 | iOS | VM | Service/models | Spec |
|---|---|---|---|---|
| `#post-detail-overlay` 3-part (absolute header w/ author + more; scroll body: single image / snap carousel + dots + arrows, article, poll, event block, action row + date right, comments heading `Observations (N)` + `· long-press for options` hint, threads w/ Author tag, reply, like, image; empty comments state; footer composer: reply bar, deferred image preview, anon toggle changing placeholder, send; chrome auto-hide; long-press comment menu; post menu Share/Report; share sheet; two-step report). **No delete-post UI** (H5 parity; `DELETE /square/v2/posts/:id` is not exposed). | `Views/PostDetail/PostDetailView.swift`, `PostDetailHeader.swift`, `PostArticleView.swift`, `CommentThreadView.swift`, `CommentComposer.swift`, `PostActionMenus.swift` (overlay `.fullPage`, swipeBack true, id `post-detail`) | `ViewModels/PostDetailViewModel.swift` (load, like ±1 after response → `SquareStore.applyLike`, `applyCounts` after load, comment send w/ guard + restore, comment like in place, report flows, vote → `SquareStore.applyVote`) | `Network/SquareDetailService.swift` (detail, comment, commentLike, reportPost); `ReportService` (WP-01) for comment reports; `Models/SquareDetail.swift` (`SquarePostDetail`, `SquareComment`, `CreateCommentRequest{content,anonymous,imageUrl?,parentCommentId?}`, `CreatePostRequest`, `ReportPostRequest`) ; event block = `EventTicketBlock` from WP-10 | h5-square §1.5, §2 "Post detail", gotchas 1–5, 12–14; api-square §1.2–1.4, §2.6–2.13 |
| `#square-search-overlay` | see C.5 last row (owned here) | `ViewModels/SquareSearchViewModel.swift` | | h5-square §1.4 |
| `#overlay-new-post` (Cancel/Publish bar, "Posting to" chip, title, content, ≤4 images sequential upload, anonymous switch, poll switch campus-wall-only w/ 2–6 options remove) | `Views/PostDetail/NewPostView.swift` (overlay `.fullPage`, swipeBack false, id `new-post`) | `ViewModels/NewPostViewModel.swift` | create post, UploadService | h5-square §1.6, §2 "New post" |
| share sheet | `UIActivityViewController` wrapper in `PostActionMenus.swift` | | | h5-square §2 share |

### C.7 Events & tickets (WP-10)

| H5 | iOS | VM | Service/models | Spec |
|---|---|---|---|---|
| event detail block inside post detail (EVENT chip, schedule/venue/price lines, CTA states, purchase confirm cards paid/free, energy shortfall → top-up, success toast) | `Views/Events/EventTicketBlock.swift` (`init(event: EventSummary, onPurchased: () -> Void)`) | `ViewModels/TicketPurchaseViewModel.swift` | `Network/EventsService.swift` (GET /events/:id, purchase, tickets/mine); `Models/Events.swift` (`EventDetail`, `PurchaseResult`, `Ticket`) ; EnergyStore | h5-square §1.7, §2 "Get Ticket"; api-square §3 |
| `#tickets-overlay` wallet (stubs with tear line, QR 74, code mono, status chips, states; non-valid stubs at 60 % opacity) | `Views/Events/TicketsView.swift`, `TicketStubView.swift` (overlay `.fullPage`, swipeBack true, id `tickets`) | `ViewModels/TicketsViewModel.swift` | tickets/mine | h5-square §1.8; h5-profile §1.10; design §8.22 |
| `#ticket-detail-overlay` pass card (neon head, DATE/TIME/VENUE, 180 QR, caption `Show this QR at the entrance` / `This ticket has been used`; non-valid at 70 % opacity; no Wallet button) | `Views/Events/TicketDetailView.swift` (overlay `.fullPage`, swipeBack true, id `ticket-detail`) | same | | h5-square §1.8 |

### C.8 Profile (WP-11)

| H5 | iOS | VM | Service/models | Spec |
|---|---|---|---|---|
| `#tab-profile` (400+sat hero cover w/ progressive blur mask, pull stretches 1:1 + un-blurs 0→140, 92 avatar ring, 28 name + verify badge 3 states, neon school, facts rows, 2-line signature, 24-radius white sheet w/ rows Energy(cells) / My Tickets / Edit Profile / Contact Us / Settings, version footer from bundle; no logout row, no photo strip) | `Views/Profile/ProfileTabView.swift` (`.reportScrollOffset(id:"profile")`), `ProfileHeroView.swift`, `EnergyCellsView.swift` | `ViewModels/ProfileTabViewModel.swift` (renders from `SessionStore.currentUser`; refresh = re-render + EnergyStore.refresh; never refetches /users/me — parity) | EnergyStore | h5-profile §1.2, §2 "Profile tab"; design §7.2 |
| `#edit-profile-overlay` (Cancel/Save bar; avatar+cover immediate upload; fields; 2-col selects; birthday + age hint; student id; interests chips + Add popup; 6-slot photo grid immediate; gift jar 5; payload rules A18) | `Views/Profile/EditProfileView.swift`, `EditProfileFields.swift`, `PhotoGridView.swift` (overlay `.fullPage`, swipeBack false, id `edit-profile`) | `ViewModels/EditProfileViewModel.swift` | ProfileService (PUT profiles/me, uploads/avatar, uploads/real-photo), MetadataService, UploadService | h5-profile §1.3, §2 "Edit Profile", §3, gotchas 2–6 |
| `#add-interest-overlay` | `Views/Profile/AddInterestCard.swift` (overlay `.card(dismissOnBackdrop:true)`) | EditProfileViewModel | | h5-profile §1.4 |
| `#verify-overlay` (card upload w/ pulsing hourglass, .edu/.ac. email, Send code cooldown 60 s + hint/devCode, 6-digit code, Submit; pending state) | `Views/Profile/VerifyCard.swift` (overlay `.card(dismissOnBackdrop:true)`, scroll max 88 %) | `ViewModels/VerifyViewModel.swift` | ProfileService.verificationSendCode/submit, UploadService | h5-profile §1.5, §2 "Student Verification"; api-auth §3.6–3.7 |
| `#contact-overlay` | `Views/Settings/ContactUsCard.swift` (WP-13; opened via AppActions) | | | h5-profile §1.7 |

### C.9 Couple Space & milestone (WP-12)

| H5 | iOS | VM | Service/models | Spec |
|---|---|---|---|---|
| couple hub (hero cover card w/ status grid, anniversaries ≤3 tiles, craving me/partner + history chips, schedule me/partner w/ expired, plans & checklist neon-left rows, gift jar row, Send I love you / Sent today, End Relationship) — rendered inside romantic pane | `Views/Couple/CoupleSpaceView.swift`, `CoupleSections.swift` (`init(matchId:, partner: PublicProfile?)`) | `ViewModels/CoupleViewModel.swift` (every write replaces whole space from response; loveYou guard) | `Network/CoupleService.swift` (13 routes); `Models/Couple.swift` (nested `CoupleSpace` per api-chat §4.2 + request structs incl. `NullableField` cover) ; UploadService; MatchingService.dissolve via `AppActions.reloadMatchTab` | h5-couple §0, §1.1, §2, §3; api-chat §4 |
| 12 popups + confirms (P1–P11, C1–C3) | `Views/Couple/CouplePopups.swift` (DialogCenter.custom + confirm/prompt) | same | | h5-couple §1.2 |
| `#milestone-overlay` | **not built** (D2 default skip); `Models/Matching.swift` keeps `Milestones` | | | h5-couple §1.3 |

### C.10 Notifications, settings, content pages (WP-13)

| H5 | iOS | VM/store | Service/models | Spec |
|---|---|---|---|---|
| bell badge (99+) — refreshed on launch, foreground, panel open/close, poll ticks, SSE notification (3 s throttle), mark-read | `HomeTopBar(badgeCount:)` — WP-16 passes `NotificationStore.unreadCount` (WP-06 never imports the store) | `Stores/NotificationStore.swift` (B.7) | `Network/NotificationService.swift`; `Models/AppNotification.swift` (+ `metadata: [String: AnyCodable]?`) | h5-notifications §A, §3.2, gotchas 1–2 |
| `#notifications-overlay` (sticky bar, Today/Yesterday/Earlier rolling 24 h, rows 44 plate + unread dot, 15/700 title in **onSurface** (not `primary` — fixes the H5 dark-mode black-on-black bug), 10 pt time, 2-line body, read rows 60 %, Load More pill, empty/error, iOS loading line, poll 15 s/60 s while open) | `Views/Notifications/NotificationsView.swift`, `NotificationRow.swift` (overlay `.fullPage`, swipeBack true, id `notifications`) | NotificationStore (paging, refresh pages 1..n, dedupe, guards) | list, unread-count, mark one read | h5-notifications §B, §2, §3 |
| `#notif-detail-overlay` | `Views/Notifications/NotificationDetailView.swift` (overlay `.fullPage`, swipeBack true, id `notif-detail`) | | | h5-notifications §C |
| localisation tables (16 titles, 7 bodies, 10 regex) + icon map | `Core/NotificationL10n.swift` | | | h5-notifications §5 |
| refund banner trigger | `NotificationStore.pendingRefund: AppNotification?` (published when a fetched list contains an unseen `energy_refunded`, dedupe per id per session) → WP-16 maps it to `ChatSessionsStore.refundBanner = RefundBannerInfo(id:, reason: metadata.refundReason, energy: metadata.energy)` and calls `EnergyStore.refresh()` | | | h5-notifications §D, gotcha 6 (fix event_cancelled copy, D7) |
| `#settings-overlay` (Account: Email inert / Password → 2 prompt cards w/ SecureField ≥8; Preferences: Language row → dialog, Dark mode row (static `contrast` icon, toast), Push toggle; Nudge suffix input starts **empty** every open — server never returns it (h5-settings gotcha 1, parity; flagged in report) + Save; Privacy 3 toggles single-key PUT + guards, default ON while unloaded; Support rows; Log Out pink; version) | `Views/Settings/SettingsView.swift`, `SettingsRows.swift` (overlay `.fullPage`, swipeBack true, id `settings`) | `ViewModels/SettingsViewModel.swift` | `Network/SettingsService.swift` (GET/PUT settings, nudge-suffix, change-password); `ReportService` (WP-01); `Models/Settings.swift` (`UserSettings` read, `SettingsPatch` write) | h5-settings §1.2, §2; api-auth §3.4–3.5 |
| language dialog (中文 / English, Cancel/Confirm → dismissAll + remount, D18) | `Views/Settings/LanguageDialog.swift` (overlay `.card(dismissOnBackdrop:true)`, id `language-dialog`) | LocaleStore | | h5-i18n §1.1 |
| `#content-overlay` help/safety/terms/privacy (whole-page zh/en) | `Views/Settings/ContentPageView.swift` (overlay `.fullPage`, swipeBack true, id `content`; works logged-out — reads only `ContentPages.page(key, lang:)` from WP-02) | | | h5-settings §1.6, §5.4; h5-i18n §5.7 |
| `#contact-overlay`, `#report-overlay` | `Views/Settings/ContactUsCard.swift` (mailto: via `UIApplication.open`), `Views/Settings/ReportProblemCard.swift` (overlay `.card(dismissOnBackdrop:false)`; resets fields on every open; category default `bug`) | SettingsViewModel.report | `ReportService.submit` | h5-settings §1.7–1.8 |
| logout confirm | `AppActions.requestLogout` → DialogCenter.confirm(danger) → SessionStore.logout() (implemented in WP-16 `AppRouter`) | | | h5-settings §1.5 |

### C.11 Energy purchase + Friend Hub (WP-14)

| H5 | iOS | VM | Service/models | Spec |
|---|---|---|---|---|
| `#modal-energy-purchase` (packages 3-col, payment rows w/ check, CTA states, purchase→confirm, success toast) | `Views/Energy/EnergyPurchaseView.swift` (overlay `.fullPage`, swipeBack true, id `energy-purchase`) | `ViewModels/EnergyPurchaseViewModel.swift` | EnergyService, EnergyStore | h5-profile §1.9, §2 "Energy purchase"; api-matching §7 |
| `#friend-hub-overlay` shell + 3 panels: graph (320 SVG → Canvas/Path: ring R112, self r26, nodes r20, pink romantic edges, weight stroke, labels, semantic colours in dark, tap → chat or profile), search (offline over sessions, 120 ms debounce, note-first name, subtitle = last message (`[Photo]`/`[图片]` for image-only) else `metaLabel(school)`), QR (My QR / Scan segmented; 176 QR of code; scanner w/ error line; manual input uppercase + Add) | `Views/FriendHub/FriendHubView.swift`, `RelationshipGraphView.swift`, `ContactSearchPanel.swift`, `QRPanel.swift` (overlay `.fullPage`, swipeBack true, id `friend-hub`; onDismiss stops the scanner) | `ViewModels/FriendHubViewModel.swift` (connect guard, scanner pause/resume after error — D-fix, `ChatSessionsStore.loadSessions()` before graph) | `Network/RelationshipsService.swift` (graph), `ProfileService.connectCode` (WP-04), `MatchingService.connect` (WP-06); `Models/Relationships.swift`; reads `ChatSessionsStore.sessions` (WP-07) | h5-addfriend-ads §1.1, §2.1–2.4, §3; api-matching §3.11, §4 |

### C.12 Shell (WP-16)

| H5 | iOS | Spec |
|---|---|---|
| `#page-home` + `#bottom-nav` floating pill (62 pt, 50 pt circles, 33 pt icons, active neon filled, auto-hide driven by `ScrollOffsetKey` ids `chat` / `square` / `profile`; match panes never hide it) | `App/MainTabView.swift`, `Views/Components/BottomNav.swift` (WP-16 owns BottomNav) | h5-core §1.3, §2.2; design §7.3 |
| `switchTab` semantics: `MatchStore.deactivate()`, `ChatSessionsStore.onPaneLeave()`, `NotificationStore.close()` (if open), then show panel and `MatchStore.activate(view:)` / `SquareStore.onTabEnter()` / profile refresh; Square re-tap → `scrollToTopSignal += 1` + `SquareStore.reloadCurrent()`; Match/Profile re-tap no-op | `MainTabView` + `AppRouter` | h5-core §2.1 |
| overlay id registry (§A.2.6) + all AppActions closures + `sessionDidReset` → dismissAll/AdTracker.reset + `sessionDidStart` → badge + scenePhase → realtime start/stop + ad flush + `LocaleStore` change → D18 + `-unimatcha-decode-check` → every `<Domain>Fixtures.verify()` | `App/AppRouter.swift` | every map's cross-module section |
| Info.plist, project.yml, AppIcon (from `apps/h5/public/icons/icon-512.png` if the asset is missing), `.gitignore` | | ios-models-network §4.5 |

---

## D. Realtime + polling design (details)

1. `SessionStore.checkUserState()` success (non-banned) and `applyRegistered` → `realtimeStartHook(token)` → `RealtimeClient.shared.start(token:)`. `cleanupUserState()` → `realtimeStopHook()` → `stop()`, then posts `.sessionDidReset`; `AppRouter` (WP-16) observes `.sessionDidReset` and calls `OverlayRouter.dismissAll()`, `DialogCenter.dismissAll()`, `AdTracker.reset()`. `scenePhase`: `.background` → `stop()` + `AdTracker.flush()`; `.active` → if token present `start()` + `NotificationStore.refreshBadge()` + if a chat is open `ChatViewModel.current?.pollNow()`. `.sessionDidStart` → `NotificationStore.refreshBadge()`.
2. Event dispatch (in `AppRouter` or each store's own `sink`):
   - `.message(matchId)`: `ChatViewModel.current?.onRealtimeMessage(matchId)` (immediate poll; if busy set pending); `ChatSessionsStore.reloadThrottled()` (Throttle 3 s leading+trailing).
   - `.read(matchId)`: open chat → `refreshReadReceipts()`.
   - `.notification`: `NotificationStore.realtimeTick()` (Throttle 3 s): badge always; if panel open refresh loaded pages.
   - `.evicted`: client already stopped; stores observe `isUp == false` → full-rate polling.
3. Polling cadence: chat 5 s (every 6th when `isUp`), read-receipt refresh every 3rd executed poll, notifications 15 s (every 4th when `isUp`) only while panel open, match status 30 s per active mode (stop on romantic relationship; stop after 5 consecutive failures with toast), temp-session countdown 1 s (list), 48 h tickers 1 s, reveal countdown 1 s per pane.
4. Throttle timers are cancelled in `cleanupUserState` (no token-less requests after logout).

---

## E. Energy & enhanced flows (single source of truth; implement in `MatchStore`, `EnergyStore`, `TicketPurchaseViewModel`)

- Balance: `EnergyStore.refresh()` on profile open, before enabling enhanced toggle, before join, after purchase, after ticket purchase, on `energy_refunded` notification surfaced. `available = availableEnergy ?? total − used`.
- Enhanced toggle (client-only, per user, `Prefs.enhanced(uid:)`): turning on → refresh balance; cost = 3 (romantic) or friend cells (1…5); `available < cost` → toast "Not enough energy — top up" + `openEnergyPurchase`; else flip + persist + live-update summary box. Cells slider updates cost live.
- Join (`MatchStore.startMatch(mode)`): completion check (fail-open) → wall if incomplete; if enhanced: refresh balance → shortfall → toast + top-up; else `DialogCenter.confirm` (copy in h5-match §1.13): `nil` → abort; `false` → toggle off (persist, resync) and join plain; `true` → join enhanced. Optimistic `searching` render; `POST /matching/start` via `requestEnvelope` to read `message`; `isAlreadyMatching` → reset `lastEnhancedRound`, toast variant, do **not** reset toggle; else toast success, refresh balance, if enhanced used → toggle off + persist; always reload status.
- Leave: `POST /matching/stop?mode=` no confirm, no refund, toast "Left matching pool".
- Ticket purchase: `cells = ceil(priceCents/100)`; paid → refresh balance → shortfall → toast + top-up; confirm card (paid/free copy); `POST /events/:id/purchase {}`; success toast "Ticket <code> added to My Tickets", refresh balance, reload post; error `isNotEnoughEnergy` → toast + top-up.
- Purchase page: mock two-step; payment method cosmetic; button states; `S.energy.availableEnergy` from confirm response then `EnergyStore.refresh()`.
- No check-in / transactions UI (D6).

---

## F. Existing iOS files — keep / upgrade / delete (owner in OWNERSHIP.md)

**Execution note:** per §A.1 "Legacy-file strategy", WP-01 physically deletes every legacy file below except `Views/Components/FlowLayoutView.swift`, `App/Theme.swift` and the three `App/` shell files (which WP-01 stubs). "Rewrite/upgrade" in this table therefore means: the named package *creates* the new file and may consult the old one via `git show HEAD:apps/ios/Unimatcha/<path>`. Owners listed here are the creators of the replacement.

| Existing file | Decision |
|---|---|
| `App/UnimatchaApp.swift` | rewrite (inject stores) — WP-16 |
| `App/RootView.swift` | rewrite — WP-16 |
| `App/MainTabView.swift` | rewrite (3 tabs, custom nav) — WP-16 |
| `App/Theme.swift` | rewrite (light-first tokens) — WP-02 |
| `Network/APIClient.swift` | move to `Core/APIClient.swift` (delete old) — WP-01 |
| `Network/AuthService.swift` | upgrade to Endpoint API — WP-04 |
| `Network/ProfileService.swift` | upgrade + add verification/submit, notes, real-photo, uploads/avatar — WP-04 |
| `Network/MetadataService.swift` | upgrade + cache — WP-04 |
| `Network/MatchingService.swift` | upgrade; drop `result`, `connectUser` — WP-06 |
| `Network/ChatService.swift` | upgrade (limit 100, Endpoint API) — WP-07 |
| `Network/CoupleService.swift` | rewrite (full space returns, 4 missing routes) — WP-12 |
| `Network/EnergyService.swift` | upgrade — WP-01 |
| `Network/QuestionnaireService.swift` | upgrade + answers/mine — WP-05 |
| `Network/SquareService.swift` | rewrite (feeds/pinned/search/like/vote) — WP-08; detail/comments → new `SquareDetailService` WP-09 |
| `Network/NotificationService.swift` | upgrade (drop mark-all UI use; keep method) — WP-13 |
| `Models/Common.swift` | rewrite — WP-01 |
| `Models/Auth.swift` | upgrade (+createdAt, birthday, studentId) — WP-01 |
| `Models/Profile.swift` | rewrite as READ model — WP-01; write DTOs in new `Models/ProfileWrite.swift` — WP-04 |
| `Models/Matching.swift` | rewrite — WP-06 |
| `Models/Chat.swift` | rewrite — WP-07 |
| `Models/Couple.swift` | rewrite — WP-12 |
| `Models/Energy.swift` | upgrade — WP-01 |
| `Models/Questionnaire.swift` | upgrade — WP-05 |
| `Models/Square.swift` | rewrite — WP-08 |
| `Models/AppNotification.swift` | upgrade — WP-13 |
| `ViewModels/AuthViewModel.swift` | rewrite — WP-04 |
| `ViewModels/MetadataViewModel.swift` | delete (replaced by MetadataService cache) — WP-04 |
| `ViewModels/ProfileViewModel.swift` | delete; replaced by ProfileSetupViewModel (WP-04), EditProfileViewModel/ProfileTabViewModel (WP-11) — deleted by WP-11 |
| `ViewModels/MatchingViewModel.swift` | delete → MatchStore/pane VMs — WP-06 |
| `ViewModels/ChatSessionsViewModel.swift`, `ChatViewModel.swift` | rewrite — WP-07 |
| `ViewModels/CoupleViewModel.swift` | rewrite — WP-12 |
| `ViewModels/EnergyViewModel.swift` | delete → EnergyPurchaseViewModel — WP-14 |
| `ViewModels/NotificationViewModel.swift` | delete → NotificationStore — WP-13 |
| `ViewModels/QuestionnaireViewModel.swift` | rewrite — WP-05 |
| `ViewModels/SquareViewModel.swift` | delete → SquareStore — WP-08 |
| `Views/Splash/SplashView.swift`, `Views/Auth/*` | rewrite — WP-04 |
| `Views/Onboarding/OnboardingCoordinator.swift` | delete — WP-16 |
| `Views/Onboarding/ProfileSetupView.swift` | rewrite — WP-04 |
| `Views/Onboarding/QuestionnaireView.swift` | delete; new `Views/Questionnaire/*` — WP-05 |
| `Views/Matching/*` (MatchTabView, EnhancedSheet, MatchFilterView, PartnerProfileView) | delete; new `Views/Home/*` — WP-06 (pane/plan/cards) and WP-17 (PreferencesSheet, PartnerProfileView) |
| `Views/Chat/*` | rewrite in place — WP-07 |
| `Views/Square/*` (SquareTabView, CreatePostView, PostDetailView) | SquareTabView rewrite WP-08; CreatePostView/PostDetailView deleted by WP-09, new `Views/PostDetail/*` |
| `Views/Couple/CoupleSpaceView.swift` | rewrite — WP-12 |
| `Views/Energy/EnergyView.swift` | delete → `EnergyPurchaseView` — WP-14 |
| `Views/Notifications/NotificationsView.swift` | rewrite — WP-13 |
| `Views/Profile/ProfileTabView.swift`, `ProfileEditView.swift` | rewrite (EditProfileView new name; delete ProfileEditView) — WP-11 |
| `Views/Profile/SettingsView.swift` | delete; new `Views/Settings/SettingsView.swift` — WP-13 |
| `Views/Profile/ConnectCodeView.swift` | delete (QR gen moves to Components) — WP-14 |
| `Views/Components/FlowLayoutView.swift` | keep — WP-03b (the only legacy file WP-01 does not delete besides `App/Theme.swift`) |
| `Info.plist`, `project.yml`, `Assets.xcassets/AccentColor` | upgrade — WP-16 (AccentColor #CCFF00 by WP-02) |
| `apps/ios/Unimatcha.xcodeproj/` (untracked, generated) | add to `.gitignore`; regenerate with xcodegen — WP-16 |

---

## G. Info.plist / project.yml (WP-16)

- `API_BASE_URL`: use xcconfig-free approach: keep the key but resolve per configuration in code — `APIClient` reads `API_BASE_URL`; project.yml sets `INFOPLIST_PREPROCESS`? Simpler: in `project.yml` add `configs: Debug: API_BASE_URL_DEFAULT = http://localhost:3001/api/v1`, `Release: https://api.unimatcha.ai/api/v1` as build settings and reference `$(API_BASE_URL_DEFAULT)` from Info.plist (`API_BASE_URL` = `$(API_BASE_URL_DEFAULT)`). Debug builds may override via `UserDefaults` key `api_base_url` (developer menu not required).
- ATS: remove `NSAllowsArbitraryLoads`; add `NSExceptionDomains` → `localhost` with `NSExceptionAllowsInsecureHTTPLoads = true` (Debug-only concern; acceptable in both).
- `NSCameraUsageDescription` ("Scan a friend's QR code to connect" / zh via InfoPlist.strings optional), `NSPhotoLibraryUsageDescription` (English: "Upload your avatar, cover and photos"), `NSPhotoLibraryAddUsageDescription` not needed.
- `UIUserInterfaceStyle` NOT set (theme is driven by `preferredColorScheme`).
- `TARGETED_DEVICE_FAMILY` = `1` (D8).
- `UILaunchScreen` keep; background colour #f9f9f9 (`UIColorName` optional).
- `MARKETING_VERSION` 2.4.0 (matches H5 "Unimatcha v2.4.0"; footer reads `CFBundleShortVersionString`).
- `.gitignore` add `apps/ios/Unimatcha.xcodeproj/`.

---

## H. Verification plan

1. **Per-package typecheck (mandatory before returning)**: `cd /Users/aimi/Downloads/unimatcha-compact/apps/ios && ./scripts/typecheck.sh` where the script (owned by WP-01) runs `xcrun -sdk iphonesimulator swiftc -typecheck -swift-version 5 -target arm64-apple-ios16.0-simulator $(find Unimatcha -name '*.swift' | sort)` with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. Because packages land in parallel, a package must (a) keep its own files compiling against the foundation files, and (b) if the full-tree check fails only inside files it does not own, rerun with `./scripts/typecheck.sh --only Core App Models Network Stores Views/Components Views/Overlay <own dirs>` (the script accepts directory filters) and report which foreign files broke. Foundation packages must produce a fully green full-tree typecheck before domain packages start.
2. **Integration (WP-16)**: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodegen generate` then `xcodebuild -project Unimatcha.xcodeproj -scheme Unimatcha -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -configuration Debug build CODE_SIGNING_ALLOWED=NO` — compiles + links without a simulator runtime.
3. **Runtime smoke** (needs a simulator runtime download — `xcodebuild -downloadPlatform iOS` — and either the local API via docker or production): boot → auth → register/login → setup wizard → home three panes swipe → join pool (idle→searching) → square pager/masonry/detail/comment → profile edit → settings language/dark toggle. Use the iOS Simulator MCP `control` tool (attach/launch/screenshot/tap) for visual checks at 393×852 (iPhone 15) and 375 pt logical (iPhone SE) — compare against the pixel tables in `h5-design-system.md` (bar heights 56/44/64 + inset, nav pill 62, cards 6 pt gutters, plan-page title y = 64 + inset).
4. **Contract fixtures without device**: each domain package ships `Resources/Fixtures/<prefix>-*.json` (prefix = its package name in OWNERSHIP.md, e.g. `auth-me.json`, `chat-sessions.json`) copied from the map response examples, and a Debug-only `XCTest`-free decode check `#if DEBUG enum <Domain>Fixtures { static func verify() throws }` in its own file that calls `FixtureCheck.decode(_:fixture:)` (WP-01) for each fixture/model pair. WP-16's `AppRouter` calls every `<Domain>Fixtures.verify()` when launched with `-unimatcha-decode-check` and prints pass/fail; until a simulator exists, the same code is covered by typecheck only. Fixture files must be added to the app bundle (xcodegen picks up `Resources/` automatically as folder references — WP-16 verifies in project.yml).
5. **SSE manual check**: `curl -N "https://api.unimatcha.ai/api/v1/realtime/stream?token=<jwt>"` to confirm frame format if the parser misbehaves.
6. Visual parity checklist per screen is the corresponding "Screens & states" section of its map; agents must self-verify geometry values they can compute (font sizes, paddings, radii) against the tables rather than eyeballing.

---

## I. Open decisions (defaults applied unless the human overrides)

- **D1 Fonts**: Plus Jakarta Sans / JetBrains Mono are not in the repo and cannot be fetched offline. Default: `Theme.font` uses system SF (weights mapped) with H5 tracking values; if `Resources/Fonts/PlusJakartaSans-*.ttf` are dropped in later and listed under `UIAppFonts`, `Theme.font` picks them up automatically (name probe at launch). CJK falls back to PingFang SC natively.
- **D2 Milestone overlay**: unreachable in H5. Default: not built (model kept). Alternative: add a row in Couple Space hero.
- **D3 Strings H5 leaves English in zh mode** (toasts, dialog titles, couple copy, friend hub, banned page…): default: add zh translations from the maps' "suggested zh" lists in an `EXTRA_ZH` table (divergence toward better zh coverage). Alternative: strict parity (English).
- **D4 Couple schedule times**: default: send ISO-8601 with timezone offset (correct display) instead of H5's zone-less string (which shifts by the user's offset).
- **D5 Apple Wallet**: not shipped (backend 501).
- **D6 Energy check-in / transactions ledger** (iOS-only in old code, no H5 UI): default: not shipped.
- **D7 Refund banner** in chat list: default: port with the `event_cancelled` copy fixed ("The event was cancelled — N energy refunded") and dedupe per notification id per session.
- **D8 iPad**: default `TARGETED_DEVICE_FAMILY = 1` (phone-only like H5).
- **D9 Mark-all-read / notification deep links**: default: none (H5 parity).
- **D10 Dark mode follows system?** Default: no — manual toggle only (H5 parity), stored device-level.
- **D11 Splash**: default H5 parity 3 s minimum (or Skip), routing already resolved in parallel; boot network failure shows a Retry state instead of logging out.
- **D12 Local dev base URL**: Debug default `http://localhost:3001/api/v1` with ATS exception scoped to localhost; Release `https://api.unimatcha.ai/api/v1`.
- **D13 Profile-setup back arrow**: default: explicit logout (confirm card) instead of H5's "auth page while still logged in".
- **D14 Partner-profile fetch failure**: default: keep overlay with back control + EmptyState Retry (fixes the H5 trap).
- **D15 Ads impression visibility**: default: count when ≥50 % of the card frame is inside the scroll viewport (GeometryReader), once per campaign per session; clicks never deduped.
- **D16 Post publish refresh**: H5 shows the new post only after a refresh; default: after successful publish force-reload the target board (small divergence, better UX). Alternative: parity.
- **D17 Reply label on anonymous comments**: H5 shows `Replying to User` for anonymous targets; default: show the alias name (h5-square gotcha 3 suggests it). Alternative: parity.
- **D18 Language switch**: H5 reloads the whole page (all overlays gone, lands on home). Default: dismiss all overlays/dialogs and remount the view tree; stores keep their data; no splash. Alternative: also reset tab/homeView to match/chat.
- **D19 Toast timer**: H5 single element whose earlier timer can hide a newer toast; default: replace text + restart timer (no queue).
- **D20 Nudge suffix display**: the server never returns the saved suffix (`GET /users/me/settings` lacks it), so the Settings input is empty on every open in H5. Default: parity (empty). Fix requires a backend change (include `nudgeSuffix` in `/users/me/settings`) — recorded for the backend backlog, not done here.
- **D21 Notification title colour in dark mode**: H5 renders titles black on the dark ground (`text-primary` has no dark override); default: use the `onSurface` token (fix).
