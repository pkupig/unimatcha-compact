# iOS audit map — `models-network` layer (Models / Network / App / Info.plist / project.yml)

Scope audited: `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/{Models,Network,App}/*.swift`, `Info.plist`, `project.yml`, `README.md`, `Assets.xcassets`.
Every endpoint/field verdict below was checked against the real backend under `/Users/aimi/Downloads/unimatcha-compact/apps/api/src` (controllers, DTOs, services, `prisma/schema.prisma`) and against the H5 client (`apps/h5/src`) as of 2026-09-03. Nothing was guessed.

Reading guide: **OK** = shape/endpoint matches the backend today; **FIELDS** = endpoint right, Codable shape needs the listed changes; **WRONG** = decoding will throw / endpoint does not exist / semantics differ; **OBSOLETE** = drop.

---

## 0. Executive verdict

| File | Verdict | One-line reason |
|---|---|---|
| `Network/APIClient.swift` | WRONG (never compiled) | `request<T: Decodable>` decodes `APIResponse<T>` which requires `T: Codable`; error body `message` can be `string[]`; 401 clears UserDefaults but nothing observes it; no cache policy; `!` force-unwrap; Chinese error strings |
| `Network/APIClient.swift › TokenStorage` | WRONG (policy) | JWT + full `User` JSON in `UserDefaults`; must be Keychain; not observable |
| `Network/AuthService.swift` | OK | `send-code` / `register` / `login` bodies + responses match |
| `Network/ProfileService.swift` | FIELDS | endpoints exist; missing `verification/submit`, `me/notes`; `getMyProfile` returns extra `joinedAt/connectCode/verificationStatus` |
| `Network/MatchingService.swift` | FIELDS | `result()` decodes into the wrong model (drop it — H5 never calls it); `connectUser` exists but H5 no longer uses it; everything else matches |
| `Network/ChatService.swift` | OK (endpoints) / WRONG (model) | endpoints all exist; `ChatSession.lastMessage: String?` receives an **object** → whole session list fails to decode |
| `Network/CoupleService.swift` | WRONG (model) | 4 top-level fields typed as scalars/arrays are **objects** in the real response → `getSpace` always throws; 3 endpoints missing |
| `Network/EnergyService.swift` | OK | all 6 endpoints + shapes match |
| `Network/QuestionnaireService.swift` | FIELDS | `Question` lacks `titleEn`; `QuestionOption` lacks `labelEn` (needed for EN mode); missing `GET /answers/mine` |
| `Network/SquareService.swift` | FIELDS | 8 endpoints right; missing `pinned`, `search`, `vote`, `comments/:id/like`, `/ads/feed`, `/ads/events`; card model misses poll/event/pinned/anonymous-token fields |
| `Network/NotificationService.swift` | OK | list/unread/read shapes match; `ReportService` OK; `UploadService` OK |
| `Network/MetadataService.swift` | OK | `{items:[String]}` |
| `Models/Common.swift` | FIELDS | `APIResponse<T: Codable>` → `Decodable`; `PublicProfile` add `daysKnown/hidden/realName/socialLinks/relationshipScore`; `ISODate` cannot parse `YYYY-MM-DD` / `2026-06-21T14:00` |
| `Models/Auth.swift` | OK (+minor) | add `createdAt`; `profile.birthday/studentId` |
| `Models/Profile.swift` | FIELDS | see §3.3 |
| `Models/Matching.swift` | FIELDS | `MatchPreferences` lacks read-only `enhancedModeEnabled/friendEnhancedCells`; hard-coded Chinese `title` |
| `Models/Chat.swift` | WRONG | `lastMessage` object; `partner` is a 7-field mini-profile keyed `id` not `userId`; `sessionType` is `temp|confirmed` |
| `Models/Couple.swift` | WRONG | see §3.7 (real aggregate is nested `{me,partner}` objects) |
| `Models/Energy.swift` | OK | |
| `Models/Questionnaire.swift` | FIELDS | `titleEn`, `labelEn`, v2 metadata; answer value union |
| `Models/Square.swift` | FIELDS | see §3.9 |
| `Models/AppNotification.swift` | OK (+loosen metadata) | |
| `App/Theme.swift` | OBSOLETE | dark-only neon **#39FF6A** palette; H5 is light-first, neon is **#CCFF00**, radius 10, Plus Jakarta Sans |
| `App/MainTabView.swift` | OBSOLETE | 5 tabs (Match/Chat/Square/Alerts/Me) vs H5 **3 tabs** (Match[chat/romantic/friend] / Square / Profile); Chinese labels; global `UITabBar.appearance()` mutation |
| `App/RootView.swift` | FIELDS | 1.8 s fixed splash timer; routing must follow H5 `checkUserState` (BANNED page, profile-setup gate, questionnaire NOT a gate) |
| `App/UnimatchaApp.swift` | OK | trivial |
| `Info.plist` | WRONG (for prod) | `API_BASE_URL=http://localhost:3001/api/v1`, `NSAllowsArbitraryLoads=true`, Chinese photo-permission string, no camera permission (QR scan needs it) |
| `project.yml` | FIELDS | iOS 16 deployment target while Views use nothing above iOS 16 — fine; `SWIFT_VERSION 5.9`; no `.xcconfig` per environment; `Unimatcha.xcodeproj/` is generated and **untracked** in git (`?? apps/ios/Unimatcha.xcodeproj/`) — keep it out of git or add to `.gitignore` |

---

## 1. Transport contract (verified in `apps/api/src/main.ts`, `common/*`)

### 1.1 Base URL
* Global prefix: `api/v1` → every path below is `<origin>/api/v1/...`.
* H5 derivation (`apps/h5/src/state.js`): `localhost | 127.0.0.1 | bare IPv4` → `${protocol}//${host}:3001/api/v1`; otherwise `https://api.${hostname minus leading "app."}/api/v1`. Production H5 is `app.unimatcha.ai` → API `https://api.unimatcha.ai/api/v1`.
* iOS today: `Info.plist` key `API_BASE_URL` (defaults to `http://localhost:3001/api/v1`). Recommendation: per-configuration `.xcconfig` (`API_BASE_URL = https://api.unimatcha.ai/api/v1` for Release; simulator Debug may use `http://localhost:3001/api/v1` with an ATS exception scoped to `localhost` only — **not** `NSAllowsArbitraryLoads`).
* Static uploads are served from the **API origin** at `/uploads/<uuid>.<ext>` (`Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`). Upload responses already return the absolute URL (`req.protocol://host/uploads/...`, trust-proxy=1 so it is `https` in prod). Treat image URLs as opaque absolute strings.

### 1.2 Success envelope (`TransformInterceptor`)
```json
{ "success": true, "data": <payload>, "message": <string|undefined>, "timestamp": "2026-09-03T10:00:00.000Z" }
```
Unwrapping rule (verbatim from the interceptor): `data = handler.data !== undefined ? handler.data : handler` and `message = handler.message`. Consequences an iOS decoder must honour:
* Arrays are passed straight through (`/energy/packages`, `/ads/feed`, `/answers/mine` → `data` is a JSON array).
* When a handler returns only `{message:'...'}`, `data` is that same object **and** `message` is duplicated at the top level. `GenericResponse` decoding of `data` works.
* No user-facing handler returns `undefined`/void, so `data` is never absent on 2xx (the SSE route bypasses the interceptor entirely, see §1.6).
* `data` may be **`null`-free but empty-object-free** too; keep `data: T?` and treat `nil` as a client error.

### 1.3 Error envelope (`HttpExceptionFilter`)
```json
{ "success": false, "statusCode": 400, "message": "…" | ["…","…"], "errors": null, "timestamp": "…", "path": "/api/v1/…" }
```
* `message` is a **string OR an array of strings** — `class-validator` errors from the global `ValidationPipe` arrive as an array. The current `ErrorResponse { let message: String }` fails on arrays and falls back to the literal `"请求失败"`. Decode as `enum { string, array }` and join with `\n`.
* 401 bodies from passport are `{statusCode:401, message:"Unauthorized"}` (no `success` key).
* Global `ValidationPipe({ whitelist:true, forbidNonWhitelisted:true, transform:true, enableImplicitConversion:true })` → **any unknown JSON key in a request body is a 400** (“property x should not exist”). Swift request structs must contain *only* DTO keys. `JSONEncoder` omits `nil` optionals from synthesized `Codable`, which is what keeps `StartMatchRequest`'s `enhanced/cells` safe.
* Query params are implicitly converted; unknown query keys on DTO-typed `@Query()` handlers (e.g. `/chat/sessions`) also 400.

### 1.4 Auth
* Bearer JWT, `Authorization: Bearer <token>`; payload `{sub, email, role:'user'}`; `expiresIn` = `JWT_EXPIRES_IN` env, default **7d**. No refresh endpoint — expiry means re-login.
* `JwtStrategy.validate` re-checks the user on **every** request: deleted user → 401 `User not found or has been deactivated`; `status==='BANNED'` → 401 `Your account has been banned`. So a BANNED user gets 401 everywhere except `/auth/login`, which returns 401 `Your account has been banned, please contact support`. (H5 reaches its `page-banned` screen only via `GET /users/me` returning `status:'BANNED'` — that can happen only in the race before the strategy rejects; in practice banned = logged out.)
* Login/Register email is `trim()`+`toLowerCase()` server-side; send as typed.
* Rate limits: `POST /auth/register/send-code` and `POST /auth/register` share a 30 req/min per-IP bucket; each code allows 5 wrong attempts, 10 min TTL, 60 s resend cool-down (400 on early resend).

### 1.5 Upload (`POST /uploads/image`)
* `multipart/form-data`, field name **`file`**, allowed `image/jpeg|png|gif|webp` (SVG rejected 400 `Only JPEG, PNG, GIF, or WebP images are allowed`), **8 MB** hard limit (multer → 413/400). Saved as `<uuid>.<ext>` where ext is derived from the mimetype, never from the filename.
* Response `data`: `{ "url": "https://api.unimatcha.ai/uploads/<uuid>.jpg", "filename": "<uuid>.jpg" }`.
* Companion placeholder endpoints (used by H5, not by iOS): `POST /uploads/avatar {url}` → `{message, avatarUrl}`; `POST /uploads/real-photo {url, caption?}` → `{message, realPhotos:[…]}` (max 6, returns 200 with the *unchanged* array when full — not an error).
* iOS should downscale/re-encode JPEG (≤ ~2 MB) before upload; H5 uploads the raw file.

### 1.6 Realtime (SSE) — `GET /realtime/stream?token=<jwt>`
* `@Public()` route; token goes in the query string (EventSource cannot set headers). Verifies JWT (`role==='user'`), then re-checks `status!=='BANNED'` → otherwise `401 {message:'Unauthorized'}` **as JSON, not a stream** (client must not auto-reconnect on 401).
* Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`. Compression is disabled for this path. First frame: `data: {"type":"ready"}`. Heartbeat comment `: ping` every 25 s.
* Frames (all `data: <json>`): `{"type":"ready"}`, `{"type":"evicted"}` (6th concurrent connection for the same user evicts the oldest — client must **close and not reconnect**), `{"type":"message","matchId"}`, `{"type":"read","matchId"}`, `{"type":"notification"}`. They are *invalidations only*; fetch via REST afterwards.
* H5 behaviour to replicate: on `message` for the open chat → poll that chat immediately; else throttle (3 s leading+trailing) a session-list reload; on `read` for the open chat → refresh read receipts; on `notification` → throttled unread/notification refresh. While connected, chat polling drops 5 s→30 s and notification polling 15 s→60 s; on `onerror` revert to full-rate polling. Stop the stream and clear throttles on logout/401.
* Not reachable through `URLSession.dataTask` semantics in one shot — use `URLSession.bytes(for:)` + line parser (`data:` lines, blank line terminates an event, ignore `:` comment lines), or a small SSE class. No third-party dependency needed.

---

## 2. Network layer file-by-file

### 2.1 `Network/APIClient.swift` (190 lines)
Defines `APIConfig.baseURL`, `APIError` (6 cases, **Chinese** `errorDescription`s), `HTTPMethod`, `APIClient.shared` (`request<T: Decodable>`, `send`, `uploadImage`), private `ErrorResponse`, `TokenStorage.shared`.

Defects (do not carry forward):
1. **Does not compile**: `JSONDecoder().decode(APIResponse<T>.self…)` where `APIResponse<T: Codable>` but `T: Decodable` only. Fix: `struct APIResponse<T: Decodable>: Decodable`.
2. `ErrorResponse.message: String` — backend sends `string | string[]` (§1.3).
3. `TokenStorage` = `UserDefaults` for the JWT **and** the serialized `User` (README even says "swap for Keychain before release"). Use Keychain (`kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), never persist the `User` blob — re-fetch `/users/me` on launch like H5 does.
4. On 401 it clears the token and throws `.unauthorized`, but nothing publishes the change → SwiftUI root cannot react. Provide an observable session store (`@MainActor final class Session: ObservableObject { @Published var token }` or `@Observable`) and route *all* 401s through it (also stop polling + SSE + clear per-user caches exactly like H5 `cleanupUserState`, §5.3).
5. No `cachePolicy`; the API sends no `Cache-Control` and H5 had a real "saved but re-read stale" bug → set `request.cachePolicy = .reloadIgnoringLocalCacheData` on GETs.
6. `body: Encodable?` erased param + `JSONEncoder().encode(body)` compiles only via SE-0352 implicit opening (Swift ≥5.7) — fine on 5.9, but prefer a generic `body: B?`.
7. `func append(_ s: String) { body.append(s.data(using: .utf8)!) }` — force unwrap.
8. `queryParams: [String: String]?` loses ordering and cannot express repeated keys; fine for this API but pass `[URLQueryItem]`.
9. Hard-coded Chinese user-facing strings (`"无效的请求地址"`, `"登录已过期，请重新登录"`, `"请求失败"`, `"上传失败"`, `"无数据返回"`, `"上传无返回"`) — the app is **bilingual (en default / zh)**; move to `Localizable.strings`.
10. Timeout 30 s is fine; uploads should get a longer `timeoutIntervalForResource`.
11. No request cancellation / `Task` awareness beyond `async`; acceptable.

### 2.2 `Network/AuthService.swift` — **OK**
| Method | Endpoint | Body | Response `data` |
|---|---|---|---|
| `sendRegisterCode(email)` | `POST /auth/register/send-code` (public, rate-limited) | `{email}` | `{message, expiresInSec:600}` in prod; `{message, devCode, expiresInSec}` only when SMTP unconfigured **and** not production (`503 Email service is not configured` in prod without SMTP) |
| `register(email,password,code)` | `POST /auth/register` | `{email, password(8–64), code(6 chars)}` | `{user:{id,email,status,createdAt}, token}` — 409 `This email is already registered`; 400 on bad/expired code |
| `login(email,password)` | `POST /auth/login` | `{email,password}` | `{user:{id,email,status,hasProfile,profileCompleteness}, token}` — 401 `Incorrect email or password` (same text for unknown email) |
Note `AuthService.SendCodeResponse` duplicates `Models/Profile.swift › SendCodeResult` (identical shape) — keep one.

### 2.3 `Network/ProfileService.swift` — FIELDS
| Method | Endpoint | Verdict / notes |
|---|---|---|
| `getMe()` | `GET /users/me` | OK. Real shape §3.2 |
| `getMyProfile()` | `GET /profiles/me` | OK, but response = full Prisma `Profile` **+ `joinedAt` (ISO), `connectCode` (string|null), `verificationStatus`**; 404 `Profile not completed` when no row |
| `updateProfile(req)` | `PUT /users/me` | OK (same DTO as `PUT /profiles/me`, which H5 uses; both call `profilesService.upsertProfile`) → returns raw `Profile` row (no `joinedAt`) |
| `getPublicProfile(userId)` | `GET /users/:id/public-profile` | OK. Three shapes: self/confirmed-connection → **full** profile (`getFullPublicProfile` + `daysKnown` when connected); stranger with `privacy.showProfile=false` → `{nickname, avatarUrl, hidden:true}`; stranger otherwise → config-driven field list (default list §3.1) minus `coverUrl/realPhotos/realName` |
| `getSettings()` / `updateSettings()` | `GET/PUT /users/me/settings` | OK. Response `{pushEnabled, privacy:{showProfile,showOnline,showMoments,searchable,discoverable}}`. PUT merges only these keys; send just the toggled key (H5 sends `{privacy:{showOnline:false}}`) |
| `getConnectCode()` | `GET /users/me/connect-code` | OK `{connectCode}` (generated on first call) |
| `sendVerificationCode(schoolEmail)` | `POST /users/me/verification/send-code` | OK `{message, expiresInSec}` (+`devCode` dev only). 400 if already `verified`; 60 s cool-down 400 |
| `changePassword` | `POST /auth/change-password` | OK `{currentPassword, password}` → `{message:'Password updated'}` |
| **missing** | `POST /users/me/verification/submit` | `{studentCardUrl, schoolEmail, code}` → `{message, id, verificationStatus:'pending'}`; 400 if verified/pending/wrong code (5 attempts) |
| **missing** | `PUT /users/me/notes` | `{targetUserId, note?}` → `{targetUserId, note:string|null}` (per-contact alias shown in chat list as `partner.note`) |
| (legacy) | `GET /users/me/match-status` | exists, H5 does not use; skip |
| (legacy) | `GET /users/search?q=` | exists; H5 removed people search on 2026-08-19 — skip |
H5 also calls `POST /users/me/verification/apply` (`auth.js:153`) — **that route does not exist** (dead H5 code, always 404). Do not port.

### 2.4 `Network/MatchingService.swift` — FIELDS
| Method | Endpoint | Verdict |
|---|---|---|
| `status(mode)` | `GET /matching/status?mode=romantic|friend` | OK — shape §3.4 |
| `result(mode)` | `GET /matching/result?mode=` | **WRONG model**: returns `{matched, mode, state, matchId, status, myConfirmed, partnerConfirmed, score, matchedAt, relationshipStartedAt, confirmedAt, remainingMs, partner}` (romantic) or `{matched, mode, state, matches}` (friend) — decoding into `MatchStatus` silently drops `match`. H5 never calls `/result`; **drop** |
| `start(mode, enhanced, cells)` | `POST /matching/start` | OK body `{mode, enhanced?, cells?(1–5, friend only)}` → `{status:'SEARCHING', message}`. Already-in-pool returns 200 `{status:'SEARCHING', message:'Already matching, please wait'}` **without charging** (do not show "enhanced purchased"); 400 `Not enough energy, please top up`; 400 when questionnaire for that mode incomplete; 400 `You already have an active or confirmed partner…` (romantic occupied) |
| `stop(mode)` | `POST /matching/stop?mode=` (query) | OK → `{status:'IDLE'|'MATCHED'|'RELATIONSHIP', message}`; 400 `You are not currently matching, cannot stop` |
| `connect(code)` | `POST /matching/connect {code}` | OK → `{matchId, message:'Added — start chatting!', partner}` (creates a `FRIEND_CONFIRMED` match directly) |
| `connectUser(userId)` | `POST /matching/connect-user {userId}` | exists; H5 dropped it — optional |
| `confirm(matchId)` | `POST /matching/:matchId/confirm-relationship` | OK → `{status:'WAITING'|'RELATIONSHIP_ROMANTIC'|'FRIEND_CONFIRMED', message}` |
| `dissolve(matchId, reason)` | `POST /matching/:matchId/dissolve {reason?}` | OK → `{message}` only (`status` nil). H5 sends `reason:'user_dissolved'` |
| `getPreferences(mode)` / `setPreferences` | `GET/PUT /matching/preferences` | OK; shape §3.4. PUT body must not include `enhancedModeEnabled/friendEnhancedCells/id/userId/createdAt/updatedAt` (extra keys → 400 via forbidNonWhitelisted — the server "strips" them only after validation, so they must be absent). `ageMin/ageMax` validated **18–60** (H5 "Any age" = omit both) |
| `milestones()` | `GET /matching/milestones` | OK `{state:'none'}` or `{state:'relationship', daysTogether, messageCount, postCount, sharedInterests, matchScore, startedAt}` |
| `reportFeedback(matchId,type)` | `POST /matching/feedback/events {events:[{matchId,type}]}` | OK; `type ∈ viewed|openedProfile`, ≤50 |
| (legacy, still used by H5 as fallback) | `POST /matching/dissolve {}` | no-matchId romantic dissolve (H5 `match.js:999` fallback when no matchId) — optional |

### 2.5 `Network/ChatService.swift` — endpoints OK, model WRONG
| Method | Endpoint | Notes |
|---|---|---|
| `sessions(mode:"all", limit:50)` | `GET /chat/sessions?mode=all&limit=…` | `mode ∈ romantic|friend|all`, `limit` 1–100 (H5 uses **100** so the 51st contact stays searchable). Shape §3.6 |
| `getMessages(matchId, cursor, limit)` | `GET /chat/:matchId/messages?cursor=&limit=` | ascending; `nextCursor` = last id when a full page came back, else `null`; side effect: marks partner's messages read |
| `poll(matchId, afterId)` | `GET /chat/:matchId/messages/poll?afterId=` | `{messages}`; unknown `afterId` → `{messages:[]}`; composite cursor (createdAt,id) server-side; marks read |
| `send(matchId, content, imageUrl)` | `POST /chat/:matchId/messages` | `{content?(≤2000), imageUrl?}` at least one; 400 `At least one of…`; 400/403 when session expired (48 h) or not a member. Returns the created `ChatMessage` |
| `markRead` | `PUT /chat/:matchId/messages/read` | `{markedRead:n}` |
| `unread` | `GET /chat/:matchId/unread` | `{unreadCount}` |
| `nudge` | `POST /chat/:matchId/nudge` | `{ok:true, messageId, content}`; creates a message with `kind:'nudge'` |
| `setBackground` | `PUT /chat/:matchId/background {imageUrl?|null}` | `{chatBackground}` |
| `setNudgeSuffix` | `PUT /chat/nudge-suffix {suffix}` | `{nudgeSuffix}` |

### 2.6 `Network/CoupleService.swift` — WRONG
All 13 couple routes exist (`GET /couple/:matchId`, `PUT cover`, `POST love-you`, `PUT status`, `POST craving`, `POST schedule`, `DELETE schedule/:id`, `POST anniversary`, `PATCH anniversary/:id`, `DELETE anniversary/:id`, `POST bucket`, `PATCH bucket/:id`, `DELETE bucket/:id`). **Every mutation returns the full refreshed `CoupleSpace`**, not an ack (`loveYou`, `setStatus`, `setCraving`, `addBucket`, `toggleBucket`, `addAnniversary` currently decode `GenericResponse` and throw the data away). Missing wrappers: `deleteSchedule`, `updateAnniversary(title?,date?,note?,image?,images?)`, `deleteAnniversary`, `deleteBucket` (400 for done items). Request DTOs verified: cover `{imageUrl?: string|null}`, status `{status}`, craving `{text}`, schedule `{text, startAt, endAt}` (free strings like `2026-06-21T14:00`), anniversary `{title, date}` (`YYYY-MM-DD`), bucket add `{text}`, bucket toggle `{done, note?, image?, images?}`. `love-you` is once per day (second call is a no-op returning the space).

### 2.7 `Network/EnergyService.swift` — OK
`GET /energy/balance` → `{totalEnergy, usedEnergy, availableEnergy}`; `GET /energy/packages` → `[{packageId:'pkg_30'|'pkg_60'|'pkg_100', cells:30|60|100, priceCny:30|58|88}]` (array); `POST /energy/purchase {packageId}` → `{orderId, packageId, cells, priceCny, paymentIntent:{mock:true}}`; `POST /energy/purchase/confirm {orderId, packageId, transactionId?}` → `{success:true, availableEnergy, transactionId}` (idempotent by `orderId`, mock instant); `POST /energy/claim {claimType:'registration'|'daily-checkin'|'task-complete', taskKey?}` → `{success, grantedEnergy, availableEnergy}` (400 when already claimed); `GET /energy/transactions?page=&limit=` → `{items:[{id,type:'RECHARGE'|'CONSUME'|'REFUND'|'CLAIM',amountEnergy,balanceAfter,relatedMatchId,relatedMatchMode,reason,metadata,createdAt}], total, page, limit}` (limit clamped ≤100). Costs: romantic enhanced = 3 cells; friend enhanced = `cells` (1–5); event ticket = `ceil(priceCents/100)` cells.

### 2.8 `Network/QuestionnaireService.swift` — FIELDS
`GET /questionnaire/active?type=romantic|friend` → full `QuestionnaireVersion` incl. `questions[]` (enabled only, ordered) each with `options[]` (ordered); 404 `No questionnaire available`. `GET /questionnaire/completion` → `{romantic:{completed, versionId?}, friend:{completed, versionId?}}` (H5 appends `?type=` which the server ignores). `POST /answers {questionnaireVersionId, answers:[{questionId, value}]}` → `{message, answeredCount, questionnaireVersion:int}`. **Missing:** `GET /answers/mine?versionId=` → array of `{id, userId, questionnaireVersionId, questionId, value, submittedAt, updatedAt, question:{title,type}, questionnaireVersion:{version,title}}` — H5 uses it to prefill saved answers when re-opening a questionnaire.

### 2.9 `Network/SquareService.swift` — FIELDS
| Method | Endpoint | Verdict |
|---|---|---|
| `recommend/campusWall(page,limit)` | `GET /square/v2/recommend|campus-wall?page=&limit=&search=` | OK; `limit` clamped 1–50; response §3.9. `search=` switches to search mode (H5 now uses `/search` instead) |
| `post(id)` | `GET /square/v2/posts/:id` | OK (404 for hidden/pending unless author) |
| `createPost` | `POST /square/v2/posts` | OK but DTO also has `postType:'normal'|'poll'` and `pollOptions:[2–6 strings ≤50]`; polls are campus-wall only and created `reviewStatus:'pending'`; campus-wall needs `profile.school` (400 `Please fill in your school…`) |
| `like(id)` | `POST /square/v2/posts/:id/like` | OK `{liked, message}` |
| `comment(...)` | `POST /square/v2/posts/:id/comments` | body also accepts `anonymous?: bool`; returns the shaped comment (anonymised if needed) |
| `report(id, reason)` | `POST /square/v2/posts/:id/report` | OK `{reported, reporterCount, hidden, message}` |
| `delete(id)` | `DELETE /square/v2/posts/:id` | `{deleted:true, message}` |
| **missing** | `GET /square/v2/pinned` | `{items, total}` or `{items:[], total:0, needProfileSchool:true}`; ≤50, ordered by union |
| **missing** | `GET /square/v2/search?q=&board?=recommend|campus_wall&page=&limit=` | `{items, page, limit, total, hasMore, query, isSearch:true}`; cards may carry `commentSnippet` |
| **missing** | `POST /square/v2/posts/:id/vote {optionIndex}` | `{pollOptions:[{text,votes}], myVote}`; 403 other school; 400 not approved |
| **missing** | `POST /square/v2/comments/:id/like` | `{liked, likeCount}` |
| **missing** | `GET /ads/feed?school=<School.name>&limit=3` | array `[{id, title, content, images, landingUrl, advertiserName}]` (empty for unknown school). H5 injects these as SPONSORED large cards into the recommend feed |
| **missing** | `POST /ads/events {events:[{campaignId, school, type:'impression'|'click'}]}` | ≤100 per batch; non-active silently ignored |
| **missing** | `GET /events/:id`, `POST /events/:id/purchase {paymentMethod?}`, `GET /events/tickets/mine` | §3.11 |
| **missing** | `GET /relationships/graph` | `{self, nodes:[…], edges:[…]}` (friend-hub "关系网"); see `apps/api/src/relationships/relationships.service.ts` for node fields (`msgCount`, `posts`, weight) |

### 2.10 `Network/NotificationService.swift` — OK
`GET /notifications?page=&limit=` → `{items:[{id,type,title,body,isRead,createdAt,metadata}], total, unread, page, limit}`; `GET /notifications/unread-count` → `{unreadCount}`; `PUT /notifications/read` and `PUT /notifications/:id/read` → `{success:true}`. `ReportService.create` → `POST /reports {category:'bug'|'user'|'content'|'other', content(≤2000), contact?}` → `{id, message}` (H5 uses `category:'content'` with `commentId/postId` embedded in `content` for comment reports). `UploadService.upload` → §1.5.

### 2.11 `Network/MetadataService.swift` — OK
`GET /metadata/uk/cities | uk/universities | uk/majors | mbti-types | nationalities` → `{items:[String]}`. H5 caches per path in memory. Display-side zh mapping (`META_ZH`, 234 entries in `apps/h5/src/modules/i18n.js`) translates labels while **values stay English**.

---

## 3. Models file-by-file (real JSON vs Swift)

### 3.1 `Models/Common.swift`
* `APIResponse<T: Codable>` → must be `Decodable`-only (§2.1). Add `timestamp: String?` (ignore).
* `GenericResponse {message?, status?, ok?}` — fine as a catch-all (`success`, `deleted`, `markedRead` etc. are ignored).
* `UploadResult {url, filename?}` — OK.
* `SocialLinks {wechat,qq,xiaohongshu,weibo,instagram}` — backend stores arbitrary `Record<string,string>`; OK.
* `PublicProfile` — used for match partners, chat partners (**wrong**, see §3.6), post authors (**wrong** shape), couple partner. Real "public profile" = `{userId, verificationStatus}` + fields from `SystemConfig.public_profile_fields` (default: `nickname, school, grade, age, city, interests, bio, avatarUrl, signature, tags, major, mbti, nationality, zodiac`; the batch variant used by friend `matches[].partner` defaults to that list **plus `coverUrl` and `realPhotos`**). Full profile adds `realName, socialLinks, relationshipScore, coverUrl, realPhotos`; connection adds `daysKnown:int`; privacy-hidden strangers give `{nickname, avatarUrl, hidden:true}`. → add `realName, socialLinks, relationshipScore, daysKnown, hidden`. Keep everything optional. `id` fallback `UUID()` is non-deterministic — use `userId ?? nickname ?? ""`.
* `ISODate` parses `2026-09-03T10:00:00.000Z` (all Prisma `DateTime`s, `nextRunAt`, `searchingSince`, `joinedAt`) ✔ but **not** `YYYY-MM-DD` (`Profile.birthday`, `CoupleAnniversary.date`) nor `2026-06-21T14:00` (couple schedule `startAt/endAt`, free-form strings from `datetime-local`). Add lenient parsers and keep raw strings in models.
* `AnyCodable` — decode order Bool→Int→Double→String→[…]→{…} is right for answers. `encode` drops `[String: Any]` (falls to `encodeNil`) — acceptable for answers (values are `String | [String] | Int`), but fix anyway.

### 3.2 `Models/Auth.swift` — OK (+fields)
`GET /users/me` real shape:
```json
{ "id","email","status":"ACTIVE|BANNED","verificationStatus":"unverified|pending|verified|rejected","createdAt",
  "modeStates":[{"mode":"romantic|friend","matchState":"idle|searching|matched|confirming|relationship","matchSearchingSince":null|ISO}],
  "profile": {nickname,realName,familyName,givenName,school,grade,gender,genderPref,age,city,interests[],bio,avatarUrl,socialLinks,relationshipScore,profileCompleteness,signature,coverUrl,tags[],major,mbti,nationality,realPhotos[],zodiac,wishGifts[],studentId,birthday} | null,
  "hasProfile": bool /* profile && profile.nickname */, "completedQuestionnaire": bool /* answers > 0, any mode */ }
```
`User.modeStates` note: rows are created lazily; a fresh user has `[]` → `matchState(_:)` fallback `"idle"` is right. `matchState` never carries `no_match` (that lives in `weeklyMatchNote`, surfaced only through `/matching/status.state`). `email` is present in all three sources. Add `createdAt: String?`; `UserProfile` needs `birthday`, `studentId` (see 3.3).

### 3.3 `Models/Profile.swift` — FIELDS
* `UserProfile`: add `birthday: String?` (`YYYY-MM-DD`), `studentId: String?`, `createdAt/updatedAt`, and for `GET /profiles/me` the extras `joinedAt: String?`, `connectCode: String?`, `verificationStatus: String?`. `interests/tags/realPhotos/wishGifts` are non-null arrays in DB (`[]`) but keep optional.
* `UpdateProfileRequest`: add `realName, familyName, givenName, birthday, studentId`. Validation: `age` int 16–40; `signature` ≤100; `tags` ≤10 × ≤20 chars; `wishGifts` ≤5; `realPhotos` ≤6; `gender ∈ male|female|non_binary|other`; `genderPref ∈ male|female|any`; `grade` free string (canonical values `Foundation, Year 1–4, Master's, PhD Year 1–4+`); `mbti` free string (16 canonical). Partial updates preserve unsent fields; `profileCompleteness` recomputed from merged data (required set: nickname, school, grade, gender, genderPref, age, city).
* `UserSettings/PrivacySettings`: add `searchable: Bool?`, `discoverable: Bool?` (returned; H5 hides both toggles since 2026-08-19; never write them). Make all privacy fields optional so a partial PUT can be built from the same struct.
* `ConnectCode` OK. `SendCodeResult` OK (dedupe with `AuthService.SendCodeResponse`).
* Add `SubmitVerificationRequest {studentCardUrl, schoolEmail, code}` / result `{message, id, verificationStatus}`; `SetNoteRequest {targetUserId, note?}`.

### 3.4 `Models/Matching.swift` — FIELDS
* `MatchMode.title` = `"恋人"/"朋友"` hard-coded Chinese → localize (`Romantic/Friend` ↔ `恋人/朋友`).
* `MatchState` values ✔ (`idle, searching, no_match, matched, confirming, relationship`). Real semantics (from `getFullMatchStatus`): romantic `state` derives from the active match (`MATCHED_ROMANTIC→matched`, `ROMANTIC_CONFIRMING→confirming`, `RELATIONSHIP_ROMANTIC→relationship`), else `searching`/`no_match` (`weeklyMatchNote==='no_match'`)/`idle`. Friend: `searching|no_match` while searching (matches still populated!), else `matched` if any active friend match, else the mode state.
* `MatchStatus` real keys: `mode, matchConfig:{cronExpr,description}|null, nextRunAt:ISO|null, state, searchingSince?:ISO|null, match:{…}|null, partner:{…}|null` (romantic) / `matches:[…]` (friend). `message` never present — harmless. ✔
* `RomanticMatch` ✔ (`remainingMs` number|null → `Double?` ✔; `status` is the raw `MatchStatus` enum string).
* `FriendMatch` ✔ (`status ∈ MATCHED_FRIEND|FRIEND_CONFIRMING|FRIEND_CONFIRMED`).
* `StartMatchRequest`, `DissolveRequest`, `ConnectCodeRequest`, `ConnectUserRequest`, `ConnectResult`, `MatchActionResult` ✔.
* `MatchPreferences`: GET returns Prisma row `{id, userId, mode, requireSameCity, requireSameUniversity, requireSameMajor, preferredNationalities[], preferredMbti[], preferredGender|null, ageMin|null, ageMax|null, universityStage|null ("undergraduate,master,doctor" comma list), preferredInterests[], preferredActivities[], friendRequirements|null, enhancedModeEnabled, friendEnhancedCells, matchBasis:'questionnaire'|'profile'|'both', extraMatchInfo|null, createdAt, updatedAt}` or the same keys with defaults (no id) when no row. Split into a **read** struct (adds `enhancedModeEnabled`, `friendEnhancedCells` — drives the "enhanced active · N cells" summary) and a **write** struct with exactly the `UpdateMatchPreferencesDto` keys. `extraMatchInfo/friendRequirements` ≤500.
* `Milestones` ✔ (`state:'none'` → other fields nil).
* Drop `result()`-related expectations (§2.4).

### 3.5 (no separate file) `/users/me/match-status` — legacy, ignore.

### 3.6 `Models/Chat.swift` — WRONG
Real `GET /chat/sessions` item:
```json
{ "matchId", "mode":"romantic|friend", "status":"MATCHED_ROMANTIC|ROMANTIC_CONFIRMING|RELATIONSHIP_ROMANTIC|MATCHED_FRIEND|FRIEND_CONFIRMING|FRIEND_CONFIRMED",
  "sessionType":"temp|confirmed", "remainingMs": number|null, "myConfirmed", "partnerConfirmed",
  "partner": { "id", "note": string|null, "nickname", "avatarUrl", "school", "gender", "age" },
  "lastMessage": { "id","content","imageUrl","kind","senderId","isRead","createdAt" } | null,
  "unreadCount", "chatBackground": string|null, "updatedAt" }
```
Response wrapper `{sessions, total}` ✔. Fixes: `lastMessage` → `ChatMessage?` (H5 `lastMsgText`: content, else `[Photo]` for image-only, nudge by `kind`); `partner` → new `SessionPartner` (keyed `id`, includes `note` = my alias for them, shown instead of nickname); `sessionType` comment `permanent` → `confirmed`; add `chatBackground`, `updatedAt`. Order: server returns most-recent first (by `updatedAt`).
`ChatMessage` ✔ (`content` is always a string, `""` for image-only; `kind ∈ text|nudge`; `senderId` present; `isRead` bool). `ChatMessagesResponse`, `ChatPollResponse`, `SendMessageRequest`, `NudgeResult` ✔. 48 h temp window: `remainingMs = createdAt + 48h − now` (CONFIRM_WINDOW_MS).

### 3.7 `Models/Couple.swift` — WRONG
Real `GET /couple/:matchId` (and every mutation) returns:
```json
{ "matchId", "daysTogether": int|null, "since": ISO|null,
  "partner": { "userId","nickname","avatarUrl","bio" }, "me": { "userId" },
  "cover": "" | url,   /* MY cover for this match (settings.coupleCovers[matchId]) */
  "loveYou": { "me": { "count", "sentToday": bool }, "partner": { "count" } },
  "status":  { "me": string, "partner": string },
  "craving": { "me": { "current": string, "history": [string] /*≤8 deduped*/ }, "partner": { "current": string } },
  "schedule": { "me": [ {id,text,startAt,endAt,expired:bool} ], "partner": [ … ] },
  "gifts":   { "me": [string], "partner": [string] },   /* wishGifts */
  "anniversaries": [ { "id","title","date":"YYYY-MM-DD","note","images":[url],"daysUntil":int } ],
  "bucket": [ { "id","text","done","createdBy","doneBy","doneNote","doneImages":[url] } ] }
```
Current Swift `status: String?`, `craving: String?`, `schedule: [CoupleSchedule]?`, `gifts: [String]?` are **type mismatches → `getSpace` throws every time**; `loveYou {mine,partner,total,unlocked}` decodes to all-nil; `bucket.note/images` should be `doneNote/doneImages`; `anniversaries` lacks `daysUntil`. Request structs are fine (see §2.6) except `CoupleBucketToggleRequest` should add `image?/images?` and there is no `CoupleAnniversaryUpdateRequest`.

### 3.8 `Models/Energy.swift` — OK (`EnergyTransaction` may add `relatedMatchId, relatedMatchMode, metadata`).

### 3.9 `Models/Square.swift` — FIELDS
Real card (`shapeCard` = full Prisma post + include + computed): 
```json
{ "id","board":"RECOMMEND|CAMPUS_WALL","authorType":"USER|STUDENT_UNION|TEAM|SPONSOR","authorUserId"?,"adminId"?,
  "school","coupleMatchId","title","content","images":[],"likeCount","commentCount","anonymous","isSponsored",
  "postType":"normal|poll|event","pollOptions":[{"text","votes"}]|null,"myVote":int|null /*poll only*/,
  "reviewStatus":"approved|pending|rejected","eventId"|null,
  "event": {id,title,venue,school,startAt,endAt,priceCents,capacity,ticketsSold,status:"published|closed|cancelled"} | null,
  "isHidden","deletedBy","deletedAt","deleteReason","tags":[],"pinnedOrder","createdAt","updatedAt",
  "authorUser": { "id", "profile": {nickname,avatarUrl,school} } | null,
  "admin": { "id","name","organizationName","role" } | null,
  "_count": { "likes","comments" },
  "isPinned": bool, "isMine": bool, "cardType":"large|medium|small", "sameSchool": bool,
  "anonymousAuthor": { "aliasSeed": uint32, "nickname":"Cozy Heron", "avatarUrl": null } /* anonymous USER posts only */,
  "anonymousAuthorToken": "a_xxxx" /* same */, "commentSnippet"?: string /* search only */ }
```
`metadata` and `pinnedAt` are stripped. Add to `SquareCard`: `postType, pollOptions, myVote, reviewStatus, eventId, event, admin, isPinned, anonymousAuthorToken, commentSnippet`; add `aliasSeed: UInt32?` to `AnonymousAuthor` (H5 derives zh/en alias + emoji avatar from `aliasSeed`; keep `nickname` as the English fallback). `cardType` rule: official (`STUDENT_UNION|TEAM|SPONSOR`) → large; USER on CAMPUS_WALL → medium; USER on RECOMMEND → small.
Feed wrapper ✔ + `needProfileSchool` (campus wall without school), search adds `query, isSearch`; pinned = `{items, total, needProfileSchool?}`.
`SquarePostDetail` = card + `comments` + `myLiked` + `myVote`. Comment real shape:
```json
{ "id","postId","content","imageUrl","anonymous","parentCommentId","createdAt","updatedAt",
  "userId"? /* removed when anonymous */, "user": { "id"?, "profile": {nickname, avatarUrl} } | { "profile": {…} },
  "anonymousAuthor"?: {aliasSeed,nickname,avatarUrl:null}, "anonymousAuthorToken"?: "a_…" /* only the OP's own anonymous comment */,
  "likeCount": int, "myLiked": bool, "replies": [ same ] }
```
Add `anonymous, likeCount, myLiked, anonymousAuthor, anonymousAuthorToken, postId, updatedAt`. Author-badge rule: comment is by the OP when (non-anonymous post) `comment.user.id == post.authorUserId`, or (anonymous post) `comment.anonymousAuthorToken == post.anonymousAuthorToken`.
`CreatePostRequest` + `postType?`, `pollOptions?`; `CreateCommentRequest` + `anonymous?`. `LikeResult`, `ReportRequest/Result` ✔. Add `VoteRequest {optionIndex}` / `VoteResult {pollOptions, myVote}`, `CommentLikeResult {liked, likeCount}`, `AdCard {id,title,content,images,landingUrl,advertiserName}`, `AdEvent {campaignId, school, type}`.

### 3.10 `Models/AppNotification.swift` — OK (+loosen)
Backend `type` values actually written: `match_result`, `no_match`, `match_expired`, `energy_refunded`, `like`, `comment` (also used for replies), `milestone`, `relationship_confirmed`, `relationship_dissolved`, `friend_added`, `system` (poll approved/rejected, misc). H5 icon map: like→favorite, comment→chat_bubble, match_result→auto_awesome, no_match→hourglass_empty, match_expired→hourglass_disabled, energy_refunded→bolt, system→info (fallback info). Titles are English strings (`Your match is here`, `New friend match`, `No match this round`, `You're now a couple`, `You're now friends`, `Relationship ended`, `Friendship ended`, `Match expired`, `New friend`, `New comment`, `New reply`, `New like`, `Energy refunded`, `A secret unlocked`, `Poll approved`, `Poll rejected`) — H5 localizes by exact title/pattern match at render time (`NOTIF_TITLE_ZH/BODY_ZH/BODY_PATTERNS` in `notifications.js`); iOS must do the same. `metadata` keys seen: `matchId`, `mode`, `postId`, `commentId`, `reason`, `eventId`, `ticketId` → decode as `[String: AnyCodable]?` rather than the fixed `NotificationMeta`.

### 3.11 Missing model files to add
* **Events/Tickets** (H5 has event cards, event detail w/ purchase, ticket wallet + QR): `GET /events/:id` → Event row (`id,title,content,images,school,venue,startAt,endAt,priceCents,capacity,ticketsSold,status,createdByAdminId,createdAt,updatedAt`) + `createdByAdmin:{name,role,organizationName}`, `post:{id}|null`, `remaining:int|null`, `myTickets:int`. `POST /events/:id/purchase {paymentMethod?:'wechat'|'alipay'|'stripe'}` → `{ticketId, code:"UMT-…", event:{id,title,startAt,venue}, pricePaidCents, cellsPaid}`; errors 400 `Ticket limit reached (2 per person)`, `Sold out`, `Ticket sales are closed…`, `This event has ended`, `Not enough energy…`. `GET /events/tickets/mine` → `{tickets:[{id,code,eventId,userId,pricePaidCents,status:'valid|used|cancelled',usedAt,createdAt,event:{id,title,venue,school,startAt,endAt,status,images}}]}`; QR content = `code`.
* **Answers** (`/answers/mine`) — §2.8.
* **RelationshipGraph** — §2.9.
* **Verification submit / Note** — §3.3.

---

## 4. App layer

### 4.1 `App/UnimatchaApp.swift` — trivial `@main` with `AuthViewModel` env object. OK.

### 4.2 `App/RootView.swift`
Splash shown for a fixed 1.8 s (`DispatchQueue.main.asyncAfter`) then `isLoggedIn ? OnboardingCoordinator : AuthView`. H5 boot (`core.js checkUserState`, to replicate exactly):
1. No token → auth page.
2. Token → `GET /users/me`. Failure (incl. 401) → drop token → auth page.
3. `status==='BANNED'` → banned page.
4. Start SSE.
5. `hasProfile` (server flag, fallback `profile.nickname != nil`) false → profile-setup page; else → home, `match` tab, `chat` view.
6. Questionnaire is **not** a gate; entering the romantic/friend view checks `/questionnaire/completion` for that mode and prompts to fill it (soft wall: only `idle` users are blocked from the match view; in-pool/matched users see a "re-take" banner).
Register flow: `send-code` → `register` → store token → start SSE → profile setup. Login: store token → run step 2+.

### 4.3 `App/MainTabView.swift` — OBSOLETE structure
Current: `TabView` with 5 tabs (`匹配 sparkles`, `聊天 bubble…`, `广场 square.grid`, `消息 bell + badge`, `我的 person.crop.circle`), Chinese labels, global `UITabBar.appearance()` mutation in `onAppear`.
H5 truth (`index.html #bottom-nav`, `core.js switchTab`):
* **3 tabs**, labels `Match` / `Square` / `Profile` (zh: 匹配 / 广场 / 我的), Material Symbols icons `chat_bubble` / `eco` / `person`, 10 px letter-spaced uppercase-style labels under the icon, inactive `neutral-400`, active black (light) / off-white (dark). The bar is a **floating pill** (rounded, inset from the edges, above the home indicator) that **hides on scroll-down and re-appears on scroll-up** (threshold 6 px; always shown within 40 px of top).
* Tab `match` (`#tab-match`) = the **home**: top segmented control `#home-mode-switch` with three segments `Chat | Romantic | Friend` (`#home-seg-chat/romantic/friend`), a `+` button at top-left (`#home-addfriend-btn`: search contacts / scan QR / my QR / relationship graph / dark mode / language), and a horizontally paged track `#home-track` with three panels: `#home-chat-view` (session list + notifications bell → `notifications-overlay`), `#home-match-romantic`, `#home-match-friend` (each independently vertically scrollable; swipe with rubber-band, ≥70 px snap). Default view on entering = `chat`. **Chat and Notifications are not tabs.**
* Tab `square` (`#tab-square`): three horizontally paged pages `Recommend | Campus Wall | Pinned` (pinned segment absolutely positioned to the right, only after school known), search overlay, new-post overlay, post-detail overlay. Re-tapping the tab = scroll to top + refresh current page only.
* Tab `profile` (`#tab-profile`): pull-to-reveal cover, verify/energy/tickets/settings entries.
* Full-screen SPA "pages": `page-auth`, `page-profile-setup`, `page-questionnaire`, `page-banned`, `page-home`. Overlays (sheet/full-screen): `chat-overlay`, `notifications-overlay`, `notif-detail-overlay`, `partner-profile-overlay`, `filter-overlay` (match preferences + enhanced + extra info + re-take questionnaire), `friend-hub-overlay`, `milestone-overlay`, `edit-profile-overlay`, `add-interest-overlay`, `settings-overlay`, `content-overlay` (help/safety/terms/privacy), `contact-overlay`, `verify-overlay`, `report-overlay`, `overlay-new-post`, `post-detail-overlay`, `square-search-overlay`, `q-nav-overlay`, `tickets-overlay`, `ticket-detail-overlay`, plus energy purchase and couple space as full-screen pages.
* SwiftUI mapping: `TabView` with 3 items; the Match tab hosts its own top segmented control + `TabView(.page)` or a custom pager; Chat is a segment inside Match; Notifications is a pushed/presented screen from the Chat header bell with an unread badge fed by `/notifications/unread-count` (and SSE `notification`).

### 4.4 `App/Theme.swift` — OBSOLETE palette (dark-only, wrong neon)
Current tokens: accent `#39FF6A`, bg `#0B0F0C`, surfaces `#121814/#1B241E/#0E130F`, text `#F2F7F3/#9BB0A2/#64766A`, outline `#243026`, radius 14/10, `accentGradient`, `NeonButtonStyle`, `GhostButtonStyle`, `Card`, `themedScreen()`; `AccentColor` asset = the same `#39FF6A`. None of this matches H5.

H5 truth (light-first, `index.html` Tailwind config + `main.css`; dark via `html.dark`, key `cl_theme` ∈ `light|dark`, default light, **no system-follow**):

| Semantic | Light | Dark (`html.dark`, warm-black) |
|---|---|---|
| Brand neon (CTA fill, active segment, selected chips, mine chat bubble) | `#CCFF00` (text on it **always black**) | `#CCFF00` (unchanged) |
| Neon pink (leave-pool / destructive-soft, unread dot, over-budget) | `#FF2EC4` | same |
| Page/background/surface | `#f9f9f9` (`background`, `surface`, `surface-bright`) | `#121110` |
| Card / white container (`surface-container-lowest`, `bg-white`) | `#ffffff` | `#1c1b19` |
| `surface-container-low` | `#f3f3f3` | `#23211f` |
| `surface-container` (soft-filled inputs) | `#eeeeee` | `#292724` |
| `surface-container-high` | `#e8e8e8` | `#2f2d2a` |
| `surface-container-highest` / `surface-variant` | `#e2e2e2` | `#363431` |
| `surface-dim` | `#dadada` | `#121110` |
| Translucent header (`surface/80`,`/95`) | `#f9f9f9` @ .8/.95 | `rgba(18,17,16,.85)` |
| Primary text (`on-surface`, `on-background`, black) | `#1b1b1b` / `#000000` | `#eceae6` |
| Secondary text (`on-surface-variant`, neutral-500/600) | `#474747` | `#aaa8a3` |
| Muted text (`outline`, neutral-400) | `#777777` | `#8c8a85` |
| Hairline border (`outline-variant`, neutral-100/200) | `#c6c6c6` (often `rgba(0,0,0,.08)`) | `#343230` (`rgba(255,255,255,.09)`) |
| Strong border (`border-black`) | `#000000` | `#4b4945` |
| Primary button (`.btn-cta`, "Ivory & Ink") | black block `#000`, white text, full width | same |
| Error | `#ba1a1a` / container `#ffdad6` | same |
| Chat bubble (theirs) | white/`#eeeeee` | `#292724` text `#eceae6` |
| Chat bubble (mine) | `#CCFF00` black text | same |
| Avatar fallback | neutral | `#343230` text `#ddd` |

Other design tokens: **corner radius 10 px for every Tailwind radius size** (`sm…3xl` all = 10 px; `full` = pill); fonts `Plus Jakarta Sans` (headline/body/label; falls back to PingFang SC / Noto Sans SC for CJK) → on iOS use SF Pro + `PingFang SC` or bundle Plus Jakarta Sans; `JetBrains Mono` for countdown digits/mono labels; a handwriting face (`Comic Sans MS / Chalkboard SE / STHupo`) for the match-plan card; Material Symbols Rounded icons (map to SF Symbols). Status bar: `theme-color #f9f9f9`, `viewport-fit=cover`, safe-area insets `--sat/--sab` applied per panel (top bars are 56–62 px + `--sat`). Dark mode is a manual toggle in the `+` menu and Settings; iOS should still honour `.preferredColorScheme` from the stored `cl_theme` value (`light` default) rather than the system.
→ Rewrite `Theme` as semantic `Color` assets with light/dark variants (or `Color(light:dark:)` helper), `AccentColor` = `#CCFF00`, radius 10.

### 4.5 `Info.plist`, `project.yml`, `README.md`, Assets
* `API_BASE_URL` hard-coded to `http://localhost:3001/api/v1` and `NSAllowsArbitraryLoads=true` → production must be `https://api.unimatcha.ai/api/v1` with default ATS; add `NSCameraUsageDescription` (QR scan-to-add-friend; H5 uses html5-qrcode) and localize `NSPhotoLibraryUsageDescription` (currently Chinese only: `用于上传头像与照片`).
* `project.yml`: bundle `com.unimatcha.app`, iOS 16.0, Swift 5.9, `TARGETED_DEVICE_FAMILY 1,2` (iPad too — H5 is phone-only; consider `1`), `GENERATE_INFOPLIST_FILE NO`, no schemes/configs/xcconfig. `Unimatcha.xcodeproj/` is generated by `xcodegen` and currently **untracked** (`?? apps/ios/Unimatcha.xcodeproj/`) — either commit it or `.gitignore` it; do not leave it ambiguous.
* Machine note (from CLAUDE.md 2026-09-03): Xcode 26.5 lives at `/Applications/Xcode.app` but `xcode-select` points at CLT → run builds with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild …`; Swift 6.3.1; no iOS simulator runtime downloaded yet.
* README claims "no third-party packages" ✔, "APIClient unwraps envelope + 401→logout" (401 only clears storage, no logout), "school verification surfaces devCode" (now real email in prod; devCode is dev-only).

---

## 5. Cross-cutting behaviours the new layer must implement

### 5.1 Session lifecycle (port of H5)
* Keychain token; in-memory `User` refreshed via `/users/me` on every cold start and after login/register/profile save.
* Logout (`auth.js doLogout`): remove token, stop match/chat/notification polling, stop SSE, `cleanupUserState`, close overlays, show auth.
* 401 anywhere → same as logout (H5 `api()` does this centrally and **throws** so callers stop).
* Per-user local flags: H5 keeps `cl_enhanced_<userId>` (enhanced toggle memory per mode) in localStorage; keys are user-scoped to avoid cross-account bleed on shared devices. Any iOS `UserDefaults` convenience must be keyed by userId and wiped on logout.

### 5.2 Polling cadence (H5 today)
Match status: 30 s while on a match view (only re-renders when state changes); chat messages: 5 s (30 s when SSE up), plus temp-session countdown tick 1 s; sessions list: on SSE `message`/throttled; notifications unread: 15 s (60 s when SSE up). Match polling has a fail counter → back-off.

### 5.3 `cleanupUserState` field list (what to reset on account switch)
currentUser, settings, matchStatus{romantic,friend}, homeView='chat', activeMatchMode='romantic', energy zeros, enhanced defaults {romantic:{enabled:false,cost:3}, friend:{enabled:false,cells:1}}, matchBasis='both', matchExtraInfo, matchPrefs{…}, match-plan state, all chat state (matchId, partner, messages, cursor, session meta, sessions[]), notification list/paging, questionnaire buckets (romanticAnswers/friendAnswers/currentQuestion/mode), square caches (posts, current post, pending images, tab='recommend', newPostBoard, anonymous=false), milestone data, metadata cache, filter state.

### 5.4 i18n
UI default language **English**, `cl_lang ∈ en|zh` (H5 translates DOM text nodes by dictionary; user content is exempt). iOS: standard `Localizable.strings` en/zh-Hans with in-app override (H5 reloads the page on toggle). Server strings that reach the UI (notification titles/bodies, error `message`s, match `message`s, questionnaire `title/titleEn`, option `label/labelEn`, metadata lists) are English; zh comes from client-side maps (`META_ZH`, notification title/pattern maps, question `titleEn` fallback to `title` which is **Chinese** — i.e. `title` = zh, `titleEn` = en; same for `label`/`labelEn`).

### 5.5 Date/number formats
All Prisma dates → ISO-8601 with milliseconds and `Z`. `remainingMs` numbers. Money is integer **cents** in `priceCents/pricePaidCents`; energy "cells" integer (1 cell = ¥1 = 100 cents in ticketing). Countdown target for the match reveal: `nextRunAt` from `/matching/status` (cron-derived; announced Fridays 17:00 Asia/Shanghai in prod).

---

## 6. Code-quality issues not to carry forward (consolidated)
1. Non-compiling generic constraint (`APIResponse<T: Codable>` vs `Decodable`).
2. `UserDefaults` token + user blob; non-observable auth state; 401 handled by side-effect only.
3. Error body `message` typed as `String` (server sends `string | string[]`).
4. Hard-coded Chinese strings in `APIClient` (9), `MainTabView` (5 tab labels), `Matching.swift` (`MatchMode.title`), `AuthService` (doc comment), `Info.plist` (photo permission). App default language is English with zh toggle.
5. Dark-only theme with a **different green** (`#39FF6A` vs `#CCFF00`), radius 14 vs 10, no light palette.
6. 5-tab shell vs 3-tab H5; Notifications/Chat modelled as tabs.
7. Force unwrap in multipart builder; `UUID()`-based fallback `id`s in `PublicProfile`/`QuestionOption` (unstable identity in `ForEach`).
8. Global `UITabBar.appearance()` mutation inside a SwiftUI `onAppear`.
9. Fixed-duration splash timer instead of "hide when `/users/me` resolves" (H5 splash = progress line until boot, with a 7 s watchdog).
10. Models are `let`-only structs mirroring an older API (no `pollOptions/event/isPinned`, wrong couple/session shapes); no separation between read and write shapes (`MatchPreferences`, `UserSettings`), which the `forbidNonWhitelisted` server rejects when echoed back.
11. `MatchingService.result()` decodes into the wrong type (silent data loss).
12. `queryParams` dictionary; no cache policy; no upload timeout; no image downscale before an 8 MB-capped upload.
13. `ISODate` cannot parse the two non-ISO date string formats the API uses.
14. `AnyCodable.encode` drops dictionaries.
15. `NSAllowsArbitraryLoads` + localhost base URL baked into the shipping plist.

---

## 7. Endpoint coverage matrix (H5 uses ↔ iOS has)

| Path | H5 | iOS wrapper | Status |
|---|---|---|---|
| POST /auth/register/send-code, /auth/register, /auth/login, /auth/change-password | ✔ | ✔ | OK |
| GET /users/me | ✔ | ✔ | OK |
| PUT /users/me | – | ✔ | OK (H5 uses PUT /profiles/me — identical) |
| GET/PUT /profiles/me | ✔ (PUT) | GET only | add PUT or keep /users/me |
| GET/PUT /users/me/settings | ✔ | ✔ | OK |
| GET /users/me/connect-code | ✔ | ✔ | OK |
| POST /users/me/verification/send-code | ✔ | ✔ | OK |
| POST /users/me/verification/submit | ✔ | ✗ | **add** |
| PUT /users/me/notes | ✔ | ✗ | **add** |
| GET /users/:id/public-profile | ✔ | ✔ | OK |
| GET /metadata/* | ✔ | ✔ | OK |
| GET /matching/status?mode | ✔ | ✔ | OK |
| GET /matching/result | ✗ | ✔ | drop |
| POST /matching/start, /stop?mode, /connect, /:id/confirm-relationship, /:id/dissolve, /feedback/events | ✔ | ✔ | OK |
| POST /matching/dissolve (legacy) | ✔ fallback | ✗ | optional |
| GET/PUT /matching/preferences | ✔ | ✔ | read/write split |
| GET /matching/milestones | ✔ | ✔ | OK |
| GET /chat/sessions?mode=all&limit=100 | ✔ | ✔ (limit 50) | model fix; limit 100 |
| GET /chat/:id/messages, /poll; POST messages; PUT read; GET unread; POST nudge; PUT background; PUT /chat/nudge-suffix | ✔ | ✔ | OK |
| GET /couple/:id + 12 mutations | ✔ | 8 of 13 | model rewrite + 4 wrappers |
| GET /energy/balance, /packages, /transactions; POST purchase, purchase/confirm, claim | ✔ | ✔ | OK |
| GET /questionnaire/active?type, /completion; POST /answers | ✔ | ✔ | field adds |
| GET /answers/mine?versionId | ✔ | ✗ | **add** |
| GET /square/v2/recommend, /campus-wall, /posts/:id; POST posts, like, comments, report; DELETE posts/:id | ✔ | ✔ | field adds |
| GET /square/v2/pinned, /search; POST posts/:id/vote, comments/:id/like | ✔ | ✗ | **add** |
| GET /ads/feed; POST /ads/events | ✔ | ✗ | **add** |
| GET /events/:id, /events/tickets/mine; POST /events/:id/purchase | ✔ | ✗ | **add** |
| GET /relationships/graph | ✔ | ✗ | **add** |
| GET /notifications, /unread-count; PUT read, :id/read | ✔ | ✔ | OK |
| POST /reports | ✔ | ✔ | OK |
| POST /uploads/image | ✔ | ✔ | OK |
| POST /uploads/avatar, /uploads/real-photo | ✔ | ✗ | optional (iOS can set URLs via profile PUT) |
| GET /realtime/stream?token | ✔ | ✗ | **add** SSE client |
| POST /users/me/verification/apply | ✔ (dead, 404) | ✗ | do not port |

---

## 8. Minimal corrected Swift sketches (key fixes only)

```swift
// Envelope
struct APIResponse<T: Decodable>: Decodable { let success: Bool; let data: T?; let message: String? }

// Error body: message is string | [string]
struct APIErrorBody: Decodable {
    let statusCode: Int?; let message: Message?
    enum Message: Decodable { case one(String), many([String])
        init(from d: Decoder) throws { let c = try d.singleValueContainer()
            if let s = try? c.decode(String.self) { self = .one(s) } else { self = .many(try c.decode([String].self)) } }
        var text: String { switch self { case .one(let s): return s; case .many(let a): return a.joined(separator: "\n") } }
    }
}

// Chat session (real)
struct SessionPartner: Decodable { let id: String; let note: String?; let nickname: String?; let avatarUrl: String?; let school: String?; let gender: String?; let age: Int? }
struct ChatSession: Decodable, Identifiable {
    let matchId: String; let mode: String; let status: String; let sessionType: String   // "temp" | "confirmed"
    let remainingMs: Double?; let myConfirmed: Bool; let partnerConfirmed: Bool
    let partner: SessionPartner; let lastMessage: ChatMessage?; let unreadCount: Int
    let chatBackground: String?; let updatedAt: String?
    var id: String { matchId }
}

// Couple space (real)
struct MePartner<T: Decodable>: Decodable { let me: T; let partner: T }
struct CoupleSpace: Decodable {
    struct Partner: Decodable { let userId: String; let nickname: String; let avatarUrl: String; let bio: String }
    struct Me: Decodable { let userId: String }
    struct LoveMe: Decodable { let count: Int; let sentToday: Bool }; struct LovePartner: Decodable { let count: Int }
    struct LoveYou: Decodable { let me: LoveMe; let partner: LovePartner }
    struct CravingMe: Decodable { let current: String; let history: [String] }; struct CravingPartner: Decodable { let current: String }
    struct Craving: Decodable { let me: CravingMe; let partner: CravingPartner }
    struct Schedule: Decodable, Identifiable { let id: String; let text: String; let startAt: String; let endAt: String; let expired: Bool }
    struct Anniversary: Decodable, Identifiable { let id: String; let title: String; let date: String; let note: String; let images: [String]; let daysUntil: Int }
    struct Bucket: Decodable, Identifiable { let id: String; let text: String; let done: Bool; let createdBy: String?; let doneBy: String?; let doneNote: String; let doneImages: [String] }
    let matchId: String; let daysTogether: Int?; let since: String?
    let partner: Partner; let me: Me; let cover: String
    let loveYou: LoveYou; let status: MePartner<String>; let craving: Craving
    let schedule: MePartner<[Schedule]>; let gifts: MePartner<[String]>
    let anniversaries: [Anniversary]; let bucket: [Bucket]
}
```
