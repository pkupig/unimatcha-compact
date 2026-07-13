# Unimatcha iOS

SwiftUI client for the Unimatcha platform (dual-mode 恋人/朋友 matching, chat, square, couple space,
energy, notifications). Talks to the NestJS backend at `apps/api` (`/api/v1`).

## Build

The Xcode project is generated from [`project.yml`](project.yml) via **XcodeGen** (we keep the
text spec in git instead of a binary `.pbxproj` so it stays reviewable/mergeable):

```bash
brew install xcodegen
cd apps/ios
xcodegen generate          # writes Unimatcha.xcodeproj
open Unimatcha.xcodeproj
```

Then build/run on an iOS 16+ simulator. No third‑party Swift packages are required.

## Configuration

- **API base URL** — `Unimatcha/Info.plist` key `API_BASE_URL` (default `http://localhost:3001/api/v1`).
  Point it at `https://api.<your-domain>/api/v1` for a real device / production.
- **ATS** — Info.plist allows arbitrary loads for local `http://localhost` dev. Tighten this
  (use https) before shipping.
- **Bundle id** — `com.unimatcha.app` in `project.yml`; set `DEVELOPMENT_TEAM` there for device signing.

## Architecture

```
Unimatcha/
  App/         UnimatchaApp, RootView, MainTabView (5 tabs), Theme (neon‑green tokens)
  Models/      Codable request/response shapes, split by domain
  Network/     APIClient (envelope unwrap, Bearer, 401→logout, multipart upload) + one Service per domain
  ViewModels/  @MainActor ObservableObject, @Published state + async load/actions
  Views/       SwiftUI screens per domain
```

- `APIClient.shared.request<T>` unwraps the `{success,data,message}` envelope and injects the Bearer token.
- `TokenStorage` persists the token + user in `UserDefaults` (swap for Keychain before release).
- Colors/typography come only from `Theme` — no per‑file color literals.

## Notes / follow‑ups

- Real image upload goes through `POST /uploads/image` (`UploadService`); avatar/cover/post images
  store the returned URL.
- School verification currently surfaces the backend `devCode` (SMTP is not wired server‑side yet).
- App icon is a placeholder (`Assets.xcassets/AppIcon`); add real artwork before submission.
