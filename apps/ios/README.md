# Unimatcha iOS

Native SwiftUI client, ported 1:1 from the H5 app (`apps/h5`) — dual-mode 恋人/朋友 matching,
chat, square, couple space, energy, notifications. Talks to the NestJS backend in `apps/api`
(`/api/v1`). iOS 16+, Swift 5 language mode, **no third-party packages**.

## Build

The Xcode project is generated from [`project.yml`](project.yml) via **XcodeGen** (the text spec
is what lives in git; `Unimatcha.xcodeproj/` is generated and git-ignored):

```bash
brew install xcodegen
cd apps/ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodegen generate
open Unimatcha.xcodeproj
```

Headless build (this machine's `xcode-select` points at the Command Line Tools, so `DEVELOPER_DIR`
is required):

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project Unimatcha.xcodeproj -scheme Unimatcha \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build
```

Add `CODE_SIGNING_ALLOWED=NO` for a pure compile/link check. Note that an unsigned build has no
entitlements, so the keychain (and therefore token persistence) does not work at runtime — install
and run a normally signed build for anything behavioural.

### Type-check only (no project, no simulator runtime)

```bash
./scripts/typecheck.sh              # whole tree
./scripts/typecheck.sh --only Core App Views/Components
```

## Run

```bash
xcrun simctl install booted <path>/Unimatcha.app
xcrun simctl launch --console-pty booted com.unimatcha.app
# decode harness: every <Domain>Fixtures.verify() + the foundation self-checks
xcrun simctl launch --console-pty booted com.unimatcha.app -unimatcha-decode-check
```

See [`Unimatcha/Resources/Fixtures/README.md`](Unimatcha/Resources/Fixtures/README.md).

## Configuration

- **API base URL** — build setting `API_BASE_URL_DEFAULT` in `project.yml`, surfaced through the
  Info.plist key `API_BASE_URL`: Debug `http://localhost:3001/api/v1`, Release
  `https://api.unimatcha.ai/api/v1`. A Debug build can override it at runtime with the
  `UserDefaults` key `api_base_url`.
- **ATS** — default (no arbitrary loads); the single exception is `localhost` for the dev API.
- **Permissions** — `NSCameraUsageDescription` (QR scan-to-connect), `NSPhotoLibraryUsageDescription`
  (avatar / cover / photos).
- **Bundle id** `com.unimatcha.app`, phone-only (`TARGETED_DEVICE_FAMILY = 1`), `MARKETING_VERSION`
  `2.4.0` (the Profile footer reads `CFBundleShortVersionString`).
- **Theme / language** are app-level toggles persisted in `UserDefaults` (`cl_theme`, `cl_lang`),
  never the system setting — same as H5.

## Architecture

```
Unimatcha/
  App/         UnimatchaApp (@main) · RootView (route switch + Overlay/Dialog/Toast hosts)
               MainTabView (3 mounted panels + floating BottomNav) · AppRouter (AppActions,
               session/realtime/scenePhase wiring, decode check) · SessionStore · Theme
  Core/        APIClient/APIError/Keychain/Prefs/FixtureCheck · L10n (+dictionary, META_ZH,
               content pages) · Alias · Formatters · Realtime (SSE client, throttle, polling loop)
  Models/      Codable wire shapes per domain          Network/  one service per domain
  Stores/      EnergyStore · MatchStore · ChatSessionsStore · SquareStore · NotificationStore · AdTracker
  ViewModels/  one per screen (+ Debug fixture harnesses)
  Views/       Overlay/ (router, hosts, dialogs, toast, AppActions) · Components/ (shared UI kit)
               and one folder per screen area
  Resources/Fixtures/   Debug JSON contract fixtures
```

Key rules the port follows:

- **Three navigation layers, like H5.** Root routes (`SessionStore.route`: splash / auth / banned /
  profile-setup / home / boot-error), three tab panels that stay mounted so their scroll offsets
  survive, and a stacked `OverlayRouter` for every full-page/sheet/card/popover layer. Confirm and
  prompt cards (`DialogCenter`) and the toast (`ToastCenter`) sit above every overlay.
- **Cross-domain navigation only through `AppActions`** — screen packages never import each other;
  `App/AppRouter.swift` fills every closure with the overlay ids of the migration plan.
- **One store per concern**, all `@MainActor ObservableObject`, all subscribing to
  `Notification.Name.sessionDidReset` so logout/401 is a hard account firewall.
- **Realtime is SSE + polling fallback**: `RealtimeClient` (started/stopped through
  `SessionStore.realtimeStartHook/StopHook`), pollers downshift while the stream is up.
- **Design tokens only** — colours via `Theme.C`, radii via `Theme.R`, icons via `Theme.Icon.sf`,
  strings via `L10n.t` / `L10n.pick`. No literal hex or SF Symbol names in screen code.
