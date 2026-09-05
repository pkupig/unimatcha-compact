# Fixtures (Debug decode harness)

JSON captured from the API maps (`scratchpad/ios-migration/maps/api-*.md`) — one prefixed set per
work package. They are **not** test data for the running app: they exist so every `Codable` model
can be decoded without a backend, and so a shape change in the API breaks loudly at launch instead
of silently at runtime.

| Prefix | Package | Decoded by |
|---|---|---|
| `core-` | WP-01 foundation | `Core/CoreFixtures.swift` |
| `auth-` | WP-04 auth / profile / metadata | `ViewModels/AuthFixtures.swift` |
| `questionnaire-` | WP-05 | `ViewModels/QuestionnaireFixtures.swift` |
| `match-` | WP-06 | `ViewModels/MatchFixtures.swift` |
| `chat-` | WP-07 | `ViewModels/ChatFixtures.swift` |
| `square-` | WP-08 | `Stores/SquareFixtures.swift` |
| `detail-` | WP-09 post detail | `ViewModels/PostDetailFixtures.swift` |
| `events-` | WP-10 events / tickets | `ViewModels/EventsFixtures.swift` |
| `profile-` | WP-11 profile writes | `ViewModels/ProfileFixtures.swift` |
| `couple-` | WP-12 | `ViewModels/CoupleFixtures.swift` |
| `notif-` | WP-13 notifications / settings | `Stores/NotificationFixtures.swift` |
| `hub-` | WP-14 friend hub / energy | `ViewModels/HubFixtures.swift` |
| `ads-` | WP-18 | `Stores/AdsFixtures.swift` |

## Running the check

```bash
xcrun simctl launch --console-pty booted com.unimatcha.app -unimatcha-decode-check
```

`AppRouter.runDecodeCheck()` (Debug only) runs every `<Domain>Fixtures.verify()` plus the
foundation self-checks (`L10nSelfCheck`, `Formatters`, `Alias`, `ContentPages`,
`Theme.Icon.missingSymbols`, `ComponentsFixtures`, `RealtimeSelfCheck`) and prints one
`PASS`/`FAIL` line per suite followed by a summary. In Xcode, tick the argument in the
scheme's *Run → Arguments* tab.

> The run must be **signed** (a normal Xcode/`xcodebuild` build). A build forced with
> `CODE_SIGNING_ALLOWED=NO` has no entitlements, so `CoreFixtures`' keychain round-trip fails
> there — that is a property of the unsigned binary, not of the code.

## Bundling

`project.yml` adds this directory as a *folder reference* (`Unimatcha/Resources/Fixtures`,
`type: folder`), so the files land at `Fixtures/<name>.json` inside the `.app` — the first path
`Core/FixtureCheck.url(for:)` looks at. Do **not** rename the reference to `Resources`: a
top-level `Resources/` directory inside a shallow iOS `.app` makes `simctl install` fail with
“Missing bundle ID”. Outside a bundle (scripts), point `UNIMATCHA_FIXTURES_DIR` at this folder.

## Adding a fixture

1. Copy the response body verbatim from the map (envelope `{success,data,…}` or bare — both decode).
2. Name it `<your prefix>-<what>.json`.
3. Decode it from your package's `Fixtures.verify()` with `FixtureCheck.decode(_:fixture:)` and
   assert the values the UI depends on with `FixtureCheck.expect(_:_:_:)`.
