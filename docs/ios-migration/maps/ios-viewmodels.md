# iOS ViewModels layer — audit map

Scope: `apps/ios/Unimatcha/ViewModels/*.swift` (11 files, 639 lines), read together with the
`Network/*Service.swift` and `Models/*.swift` they depend on, and verified line-by-line against
the CURRENT backend under `apps/api/src` (controllers, DTOs, services, Prisma schema) and the
CURRENT H5 (`apps/h5/src/modules/*.js`, `state.js`). Nothing in the project was modified.

Absolute paths of the audited files:

- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/AuthViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/ChatSessionsViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/ChatViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/CoupleViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/EnergyViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/MatchingViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/MetadataViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/NotificationViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/ProfileViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/QuestionnaireViewModel.swift`
- `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/ViewModels/SquareViewModel.swift`

Verdict legend used below: **OK** = endpoint + fields match the live backend · **NEEDS FIELDS** =
right endpoint, model must gain/rename fields (listed) · **WRONG SHAPE** = decoding will fail at
runtime against the live backend · **OBSOLETE** = drop.

The whole layer has never compiled (lead's finding: `APIClient.request<T: Decodable>` wraps in
`APIResponse<T: Codable>` → generic-constraint mismatch, `Models/Common.swift:4` vs
`Network/APIClient.swift:51,104`). Treat every "decodes fine" statement below as "would decode
once that constraint is fixed".

---

## 0. TL;DR — what exists, what is stale, what is missing

| VM | Screens it feeds | Verdict | Biggest problem |
|---|---|---|---|
| AuthViewModel | Splash→Auth/Login/Register, RootView gate | OK | token+user in UserDefaults; 401 in APIClient never flips `isLoggedIn`; no SSE start |
| ChatSessionsViewModel | Chat tab list | **WRONG SHAPE** | `lastMessage: String?` but backend sends an object → whole list fails to decode |
| ChatViewModel | ChatView | OK endpoints, wrong behaviour | fixed 5 s poll (no SSE), cursor advanced by own message (loses partner messages), no de-dupe, no image send, no confirm/dissolve |
| CoupleViewModel | CoupleSpaceView | **WRONG SHAPE** | `CoupleSpace` model is a 7/13-era guess; `loveYou.partner`, `status`, `craving`, `schedule`, `gifts` are objects on the wire, scalars/arrays in Swift |
| EnergyViewModel | EnergyView, EnhancedSheet | OK | purchase skips the H5 "package → payment method → confirm" step; `dailyCheckIn` has no H5 counterpart |
| MatchingViewModel | MatchTabView, EnhancedSheet | OK endpoints, missing flow | no 30 s polling, no `no_match`, no questionnaire gate, no energy pre-check/confirm card, no "already in pool" detection, no plan page data |
| MetadataViewModel | ProfileSetup/Edit | OK | no zh display map (H5 `META_ZH`), singleton used as `@StateObject` |
| NotificationViewModel | Notifications tab | NEEDS FIELDS | metadata misses `refundReason/energy/kind/actorId`; no polling, no zh localisation, no paging |
| ProfileViewModel | ProfileSetup, ProfileEdit, ProfileTab | NEEDS FIELDS | Chinese grade values (backend canon is English `Year 1`…), no `birthday/realName/studentId/verificationStatus/connectCode/joinedAt`; verification submit endpoint never called anywhere in iOS |
| QuestionnaireViewModel | QuestionnaireView | NEEDS FIELDS | no `titleEn/labelEn`, no `/questionnaire/completion` gate, no `/answers/mine` prefill, `[String: Any]` answers |
| SquareViewModel | SquareTabView | NEEDS FIELDS | 2 boards only (H5 has 3-page pager + search page); no poll/event/pinned/aliasSeed/myVote fields; no vote, no ads |

Entirely absent from the iOS VM layer (H5 has them): **SSE realtime**, **tickets (票夹)**, **events
purchase**, **square pinned page + search page + poll voting**, **comment like / anonymous comment /
comment report**, **relationship graph**, **settings VM** (view calls services directly),
**student verification submit**, **nudge suffix / chat background** (services exist, no VM),
**notes (备注)**, **ads feed + event batching**, **i18n (en default / zh) + light theme + dark mode**,
**energy refund banner**, **plan page (week row / reveal countdown / read-only prefs summary)**.

---

## 1. Global facts every VM must be built on (verified against `apps/api/src`)

### 1.1 Transport envelope
- Global prefix `api/v1` (`main.ts:60`). Base URL rule (copy from H5 `state.js:10-16`): localhost /
  127.0.0.1 / bare IPv4 → `http://<host>:3001/api/v1`; otherwise `https://api.<domain>/api/v1` where
  domain = hostname with leading `app.` stripped. Production is `https://api.unimatcha.ai/api/v1`.
  iOS `Info.plist` currently hard-codes `http://localhost:3001/api/v1` and sets
  `NSAllowsArbitraryLoads=true` (`Unimatcha/Info.plist:22-28`) — must not ship.
- Success envelope (`common/interceptors/transform.interceptor.ts`):
  `{ success: true, data: <payload>, message?: string, timestamp }`. Gotcha: if a service returns an
  object that itself has a `data` key, the interceptor unwraps `data.data`; if it has `message`, it is
  lifted to the envelope AND stays in `data`. So `data` for e.g. `POST /matching/start` is
  `{status, message}` and envelope `message` duplicates it.
- Error envelope (`common/filters/http-exception.filter.ts`):
  `{ success:false, statusCode, message, errors, timestamp, path }`. **`message` is a string for
  business errors but an ARRAY of strings for class-validator failures** (ValidationPipe
  `whitelist:true, forbidNonWhitelisted:true, transform:true`, `main.ts:64-67`). The iOS
  `ErrorResponse { message: String }` (`APIClient.swift:155`) will fail to decode validation errors
  and fall back to the generic Chinese "请求失败". Decode `message` as `String | [String]`.
- `forbidNonWhitelisted:true` means any body key not declared in the DTO → 400. Every iOS request
  struct was checked against its DTO; all keys are whitelisted (see §5 table). Bodies to
  controllers with untyped `@Body()` (`PUT /chat/:id/background`, `PUT /chat/nudge-suffix`) are not
  validated.
- Backend serialises Prisma `DateTime` as ISO-8601 with milliseconds (`2026-09-03T12:00:00.000Z`);
  iOS keeps them as `String` and parses lazily via `ISODate.parse` (`Models/Common.swift:55-66`).
- Auth: `Authorization: Bearer <jwt>` (7-day token, payload `{sub, email, role:'user'}`). 401 →
  APIClient clears the stored token and throws `.unauthorized` (`APIClient.swift:90-93`) but
  **does not tell `AuthViewModel`**, so `isLoggedIn` stays `true` until the next `refresh()`. H5 on
  401 stops all pollers, SSE, countdowns, clears state and shows the auth page (`core.js:21-36`).
- Uploads: `POST /uploads/image` multipart field `file`, ≤8 MB, mimetype-derived extension →
  `{url, filename}` (`uploads.controller.ts:84-101`). URL is absolute (`https://api…/uploads/<uuid>.jpg`).
  Also `POST /uploads/avatar {url}` → `{message, avatarUrl}` and `POST /uploads/real-photo {url}` →
  `{message, realPhotos}` (max 6). H5 uses the latter two after uploading; iOS uses `PUT /users/me`.

### 1.2 Dual-mode vocabulary
- `mode` is always lowercase `'romantic' | 'friend'` on the wire (query `?mode=`, body `mode`,
  `modeStates[].mode`, `sessions[].mode`). Prisma `Match.status` values seen by clients:
  romantic `MATCHED_ROMANTIC → ROMANTIC_CONFIRMING → RELATIONSHIP_ROMANTIC` (+ legacy
  `RELATIONSHIP_MODE`), friend `MATCHED_FRIEND → FRIEND_CONFIRMING → FRIEND_CONFIRMED`, terminal
  `DISSOLVED | EXPIRED | REJECTED` (read-only chats).
- Client-facing `state` strings from `GET /matching/status`: `idle | searching | no_match | matched |
  confirming | relationship` (`matching.service.ts:271-379`). `no_match` = still in pool
  (`matchState` remains `searching`) but this round produced nothing (`weeklyMatchNote`).
- 48 h confirm window: `remainingMs` (number, ms) is present on temp matches/sessions, `null` on
  confirmed ones.

### 1.3 Realtime (SSE) — absent in iOS, mandatory to match H5 cadence
`GET /realtime/stream?token=<jwt>` (`realtime/realtime.controller.ts`, `@Public`, token in query
because EventSource cannot set headers). Responds `text/event-stream`, first frame
`data: {"type":"ready"}`, comment heartbeat `: ping` every 25 s, per-user cap 5 connections —
the oldest gets `data: {"type":"evicted"}` then EOF (client must NOT reconnect after `evicted`).
401 (bad token / BANNED) → do not reconnect. Event frames (all `data:` JSON, no `event:` name):

| type | extra | emitted by (`emitToUser` sites) | H5 reaction (`core.js:69-99`) |
|---|---|---|---|
| `message` | `matchId` | chat send, nudge, couple love-you message | if open chat == matchId → poll now; sessions list reload throttled 3 s leading+trailing |
| `read` | `matchId` | chat markRead (to sender) | if open chat == matchId → refresh read receipts |
| `notification` | – | every `Notification` create (match result, expiry, dissolve, confirm, like, comment, milestone, friend added, refund…) | notification poll tick throttled 3 s |

While SSE is up H5 drops chat polling from 5 s to every 6th tick (30 s) and notification polling
from 15 s to every 4th tick (60 s); on `onerror` it restores full cadence (`chat.js:1065-1080`,
`notifications.js:351-360`). iOS needs a `URLSession` streaming task parsing `data:` lines.

### 1.4 Client-side persistence keys (H5) → iOS equivalents
- `cl_token` JWT (H5 localStorage) → **Keychain** in iOS (currently `UserDefaults`
  `unimatcha_user_token`, `APIClient.swift:160-190`).
- `cl_lang` `'en' | 'zh'` (default **`en`**, `i18n.js:4,352`) — iOS has no i18n; UI strings are
  hard-coded Chinese.
- `cl_theme` `'light' | 'dark'` (default **`light`**, `i18n.js:3,11`) — iOS `Theme.swift` is
  dark-only neon (`App/Theme.swift:9-24`).
- `cl_enhanced_<…>` enhanced-toggle state per mode (client-only; the server strips
  `enhancedModeEnabled` on `PUT /matching/preferences`, `matching.service.ts:1195-1199`).
- H5 keeps no cached user object; iOS caches `User` JSON in UserDefaults (`unimatcha_user_info`)
  and boots from it, then refreshes.

### 1.5 Routing after auth (H5 `core.js:237-274`, iOS `OnboardingCoordinator.swift`)
no token → auth · `status === 'BANNED'` → banned page (iOS just logs out and loses the message) ·
`!hasProfile` (`hasProfile` from `/users/me` = profile row exists AND nickname set) → profile setup
· else home. **Questionnaire is NOT a gate**; it is prompted lazily when entering a match mode
(`match.js:182-221 ensureQuestionnaireThenMatch`). iOS offers an optional romantic questionnaire
right after profile setup (`OnboardingCoordinator.swift:38-53`) — acceptable, but H5 shows two
optional cards (romantic/friend) on home instead (`questionnaire.js:36-68`).

---

## 2. Per-file audit

### 2.1 `AuthViewModel.swift` (82 lines)
**Defines** `@MainActor final class AuthViewModel: ObservableObject` — `@Published isLoading,
errorMessage, isLoggedIn, currentUser: User?, codeHint, isSendingCode`. Methods
`sendRegisterCode(email:)`, `register(email:password:code:)`, `login(email:password:)`,
`refresh()`, `logout()`. Injected app-wide as `@EnvironmentObject` (`UnimatchaApp.swift`,
`RootView.swift`, every tab).

**Endpoints & assumed JSON (all verified OK)**
- `POST /auth/register/send-code {email}` (`auth.controller.ts:18`, `@Public`, IP-rate-limited
  30/min) → `{message, expiresInSec:600}` or, when SMTP not configured in non-prod,
  `{message, devCode:'123456', expiresInSec}`; prod without SMTP → 503. 60 s resend cooldown is
  server-enforced (400 "Please wait…"); H5 mirrors it with a 60 s countdown button
  (`auth.js:52 codeCooldown`). iOS shows `devCode` in `codeHint` — same as H5.
- `POST /auth/register {email,password(8–64),code(6)}` → `{user:{id,email,status,createdAt},
  token}`; 409 on duplicate email; 400 wrong code (5 attempts per code, then must resend).
  `User.status` is non-optional in iOS — present. Register user has NO `hasProfile` (thin user;
  `Models/Auth.swift` comment is right).
- `POST /auth/login {email,password}` → `{user:{id,email,status,hasProfile,profileCompleteness},
  token}`. Email is lower-cased server-side.
- `GET /users/me` → `{id,email,status,verificationStatus,createdAt, modeStates:[{mode,matchState,
  matchSearchingSince}], profile:{nickname,realName,familyName,givenName,school,grade,gender,
  genderPref,age,city,interests,bio,avatarUrl,socialLinks,relationshipScore,profileCompleteness,
  signature,coverUrl,tags,major,mbti,nationality,realPhotos,zodiac,wishGifts,studentId,birthday}|null,
  hasProfile, completedQuestionnaire}` (`users.service.ts:47-81`). iOS `User`/`ModeState`/`UserProfile`
  decode this (missing `birthday/studentId` in `UserProfile`, see §2.9).
- `POST /auth/change-password {currentPassword,password}` → `{message}` (service only; SettingsView
  calls it directly).

**Verdict: OK** (endpoints, fields, code semantics all current — this file was touched 8/31).

**Behaviour gaps vs H5**: no `startRealtime()` after login/refresh and no `stopRealtime()` on
logout (`core.js:254`, `auth.js:101-112`); BANNED handling drops the user to the auth screen with no
explanation (H5 `page-banned`); `refresh()` swallows all errors, so a 401 during refresh leaves
`isLoggedIn == true` with no token → every screen then errors with "登录已过期" instead of routing to
auth (APIClient does not publish the 401). H5 `doLogin` reads `data.token || data.access_token`
(defensive); backend sends `token`.

**Code quality (don't carry forward)**: token + full user JSON in `UserDefaults` (use Keychain for
the token, don't persist the user); Chinese literals `"请先填写邮箱"`, `"开发模式…"`, `"验证码已发送…"`;
`errorDescription` strings come from `APIError` which are all Chinese (`APIClient.swift:22-31`);
`init()` fires `Task { await refresh() }` from a non-async initialiser (fine but untestable);
no cancellation of in-flight auth on logout.

### 2.2 `ChatSessionsViewModel.swift` (19 lines)
**Defines** `@Published sessions: [ChatSession], isLoading, errorMessage`; `load()` →
`ChatService.sessions(mode:"all")` = `GET /chat/sessions?mode=all&limit=50`.

**Live shape** (`chat.service.ts:263-291`):
```
{ sessions:[{ matchId, mode:'romantic'|'friend', status:<Prisma Match.status>,
  sessionType:'temp'|'confirmed', remainingMs:number|null, myConfirmed, partnerConfirmed,
  partner:{ id, note:string|null, nickname, avatarUrl, school, gender, age },
  lastMessage:{ id, content, imageUrl, kind, senderId, isRead, createdAt } | null,
  unreadCount:number, chatBackground:string|null, updatedAt }], total }
```
Ordered by `Match.updatedAt` desc (touched on every send). `?mode=` accepts `romantic|friend|all`,
`limit` 1–100 (default 50). Read-only statuses (`DISSOLVED/EXPIRED/REJECTED`) are included so history
stays viewable.

**Verdict: WRONG SHAPE.** `Models/Chat.swift:4-17`: `lastMessage: String?` → the wire value is an
object → `typeMismatch` → **the entire sessions list fails to decode as soon as any conversation has a
message**. `lastMessageAt` does not exist on the wire (use `updatedAt` / `lastMessage.createdAt`).
`sessionType` comment says `"permanent"`; wire is `"confirmed"`. `partner` is typed `PublicProfile?`
whose `id` is computed from `userId` — the session partner object has `id`, not `userId`, so
`partner.id` returns a fresh random `UUID().uuidString` on every access (`Models/Common.swift:33`);
`note` and `gender` are dropped. Needs: `lastMessage: ChatMessage?`, `chatBackground`, `updatedAt`, a
dedicated `SessionPartner {id, note, nickname, avatarUrl, school, gender, age}`.

**Behaviour gaps vs H5** (`chat.js:108-200`): H5 requests `limit=100` (8/19: the 51st contact was
unsearchable); shows a per-row mode badge (romantic/friend × temp/confirmed) and a live `剩余Xh`
countdown for temp sessions ticking every 1 s (`startSessionCountdown`); displays `partner.note`
over nickname; unread dot; last-message preview (`[图片]` for image, nudge text for `kind==='nudge'`);
contact search filters only `S.sessions` by nickname/school/message text (no server search); list
reloads on SSE `message` (3 s throttle), after confirm/dissolve, on pull-to-refresh, and on the 30 s
fallback; energy-refund banner pinned on top when an `energy_refunded` notification arrives
(`chat.js:428-457`). None of this is in the VM.

### 2.3 `ChatViewModel.swift` (74 lines)
**Defines** `ChatViewModel(matchId:currentUserId:partnerName:)` with `@Published messages,
inputText, isSending, errorMessage`; `loadHistory()`, `sendMessage()`, `nudge()`, `startPolling()`
(5 s loop via `Task.sleep`), `stopPolling()`, private `poll()`, `lastMessageId` cursor. Owned by
`ChatView` via `StateObject(wrappedValue:)`.

**Endpoints (all exist, all field-compatible)**
- `GET /chat/:matchId/messages?limit=50[&cursor=<id>]` → `{messages:[{id,content,imageUrl,kind,
  senderId,isRead,createdAt}], nextCursor:string|null}` ascending; `cursor` = id of last item of
  previous page, `limit` ≤100. **Side effect:** marks the partner's unread messages read
  (`chat.service.ts:83-92`). iOS also calls `PUT …/messages/read` → `{markedRead:n}` (fine).
- `GET /chat/:matchId/messages/poll[?afterId=<id>]` → `{messages}` (≤50, composite
  `(createdAt,id)` cursor; unknown `afterId` → `{messages:[]}`), also marks read.
- `POST /chat/:matchId/messages {content?|imageUrl?}` (≥1 required, content ≤2000) → message
  object; 403 "This chat has ended…" for read-only or expired-temp matches. Fires SSE `message`
  to the partner and behaviour events `firstMessage/message`.
- `POST /chat/:matchId/nudge` → `{ok:true, messageId, content}` (system message `kind:'nudge'`,
  content includes the partner's custom suffix; only confirmed chats).
- Services also cover `PUT /chat/:id/background {imageUrl|null}` → `{chatBackground}` (confirmed
  chats only), `GET /chat/:id/unread` → `{unreadCount}`, `PUT /chat/nudge-suffix {suffix}` →
  `{nudgeSuffix}` — none used by the VM.

**Verdict: OK endpoints; behaviour is the 7/13 design and reintroduces bugs H5 fixed on 8/10.**
- `sendMessage` sets `lastMessageId = msg.id` (line 39). With the server's composite cursor this
  skips any partner message created *before* the own message but not yet polled → **partner
  messages permanently lost** (H5 8/10 fix "游标不被己方消息推进"). Only advance the cursor from poll
  results; de-dupe by id (`poll()` appends blindly; a send + poll race duplicates bubbles).
- No SSE: H5 polls every 5 s but only every 6th tick when SSE is up, and pulls immediately on
  `message`/`read` frames for the open match; `pollChatMessages` has a busy guard and a
  "pending" re-pull (`chat.js:1006-1063`).
- No `read` receipts refresh (`refreshReadReceipts` re-reads the tail with `limit=100`), no time
  separators (≥10 min gap → centred stamp; same-day `HH:MM` / 昨天 / date, zh+en), no "已读" under
  last own bubble, no image send (`ChatService.send(imageUrl:)` exists), no load-earlier via
  `nextCursor`, no pending-image preview, no send-failure draft restore, no send concurrency
  guard snapshotting `matchId` (H5 "A9 快照" — image could be sent to the wrong chat when the
  user switches).
- No in-chat header actions for temp sessions (H5 `renderChatHeaderActions`, `chat.js:247-275`):
  confirm → `POST /matching/:matchId/confirm-relationship` → `{status:'WAITING'|<final match
  status 'RELATIONSHIP_ROMANTIC'|'FRIEND_CONFIRMED'>, message}` (400 if window expired / wrong
  status / already have a partner); dissolve → `POST /matching/:matchId/dissolve {reason:
  'user_dissolved'}` → `{message}`. After either, H5 reloads sessions and the match tab.
- Composer must be disabled when `status ∈ {DISSOLVED,EXPIRED,REJECTED}` or temp window elapsed
  (H5 `applyChatComposerState`, `chat.js:586`).
- Partner avatar tap → partner profile (`GET /users/:id/public-profile`) + note editor
  (`PUT /users/me/notes {targetUserId, note≤30}` → `{targetUserId, note|null}`) + chat wallpaper
  (`editChatWallpaper`) — H5 `chat.js:665-700`. Reports `openedProfile` feedback event.

**Code quality**: `partnerName` only used for the title; `currentUserId` should come from the
auth VM not init; `try? await ChatService.markRead` swallows; the polling `Task` captures
`[weak self]` but `Task.sleep` cancellation only checked after sleep (fine).

### 2.4 `CoupleViewModel.swift` (50 lines)
**Defines** `CoupleViewModel(matchId:)`, `@Published space: CoupleSpace?`, `load()`,
`loveYou()`, `setStatus(_:)`, `setCraving(_:)`, `addBucket(_:)`, `toggleBucket(_:)`,
`addAnniversary(title:date:)` — each mutator re-`load()`s. Feeds `CoupleSpaceView` (a separate
pushed screen; in H5 the couple hub is rendered **inside the romantic match pane** when
`state === 'relationship'`, `match.js:623-634`, `couple.js:96-120`).

**Live shape** `GET /couple/:matchId` (`couple.service.ts:36-142`):
```
{ matchId, daysTogether:number|null, since:ISO|null,
  partner:{ userId, nickname, avatarUrl, bio }, me:{ userId }, cover:string ('' when unset),
  loveYou:{ me:{ count, sentToday:bool }, partner:{ count } },
  status:{ me:string, partner:string },
  craving:{ me:{ current:string, history:string[] (≤8, deduped) }, partner:{ current } },
  schedule:{ me:[{id,text,startAt,endAt,expired}], partner:[…] },
  gifts:{ me:string[], partner:string[] },   // = both profiles' wishGifts
  anniversaries:[{ id,title,date,note,images:[],daysUntil:int }],
  bucket:[{ id,text,done,createdBy,doneBy,doneNote,doneImages:[] }] }
```
Every mutator (`PUT cover`, `POST love-you`, `PUT status`, `POST craving`, `POST/DELETE schedule`,
`POST/PATCH/DELETE anniversary`, `POST/PATCH/DELETE bucket`) **returns the full space** again
(`couple.service.ts:153,237`; H5 `coupleApi` just re-renders from the response, `couple.js:288-300`)
— so the re-`load()` round trip in the VM is unnecessary. `love-you` is once per day (second call →
400, H5 toasts "Already sent today"); reaching 100×100 posts a `milestone` notification and a chat
message (SSE `message`).

**Verdict: WRONG SHAPE.** `Models/Couple.swift`: `LoveYouState{mine,partner:Int?,total,unlocked}`
vs wire `{me:{count,sentToday},partner:{count}}` → `partner` typeMismatch; `status: String?` vs
object; `craving: String?` vs object; `schedule: [CoupleSchedule]?` vs `{me,partner}` object;
`gifts: [String]?` vs `{me,partner}`; `CoupleBucketItem{note,images}` vs `{doneNote,doneImages,
createdBy,doneBy}` (silently empty); `CoupleAnniversary` misses `daysUntil`. Decoding
`GET /couple/:id` fails outright. Rewrite the model from the shape above.

**Missing vs H5** (`couple.js`): set/clear my cover (`PUT :id/cover {imageUrl|null}`, per-user,
stored in `settings.coupleCovers`), schedule add (`{text,startAt,endAt}`) / delete, anniversary
edit (`PATCH {title?,date?,note?,image?,images?}`) / delete / detail / "all" list, bucket complete
with note + up to N images (`PATCH {done:true,note?,images?}`), untick, delete (done items
undeletable → 400), gift jar editing (writes `wishGifts` via `PUT /profiles/me`), craving quick
picks from `history`, multi-image upload helper (`pickAndUploadImages` → `/uploads/image`),
"I love you" button disabled state from `loveYou.me.sentToday`, `daysTogether` header.
DTO whitelist: `SetStatusDto{status}`, `CravingDto{text}`, `ScheduleDto{text,startAt,endAt}`,
`AnniversaryDto{title,date}`, `AnniversaryUpdateDto{title?,date?,note?,image?,images?}`,
`BucketAddDto{text}`, `BucketToggleDto{done,note?,image?,images?}`, `CoverDto{imageUrl?}`
(`couple.controller.ts:18-58`). iOS `CoupleBucketToggleRequest{done,note}` is whitelisted; add
`images`.

### 2.5 `EnergyViewModel.swift` (48 lines)
**Defines** `@Published balance: EnergyBalance?, packages, transactions, isLoading, errorMessage,
infoMessage`; `available`, `load()` (balance+packages concurrently, errors swallowed),
`loadTransactions()`, `purchase(_:)` (purchase → confirm immediately), `dailyCheckIn()`.

**Endpoints (all verified OK, `energy/energy.controller.ts`, `energy.service.ts`)**
- `GET /energy/balance` → `{totalEnergy, usedEnergy, availableEnergy}`.
- `GET /energy/packages` → `[{packageId:'pkg_30'|'pkg_60'|'pkg_100', cells:30|60|100,
  priceCny:30|58|88}]` (a bare array, not `{items}` — iOS decodes `[EnergyPackage]` correctly).
- `POST /energy/purchase {packageId}` → `{orderId:'order_<6>_<ts>', packageId, cells, priceCny,
  paymentIntent:{mock:true}}`.
- `POST /energy/purchase/confirm {orderId, packageId, transactionId?}` → `{success:true,
  availableEnergy, transactionId}` (idempotent per orderId). H5 omits `transactionId`; iOS sends
  `"mock-<orderId>"` — both accepted.
- `POST /energy/claim {claimType:'registration'|'daily-checkin'|'task-complete', taskKey?}` →
  `{success, grantedEnergy, availableEnergy}`.
- `GET /energy/transactions?page&limit` → `{items:[{id,type:'RECHARGE'|'CONSUME'|'REFUND'|'CLAIM',
  amountEnergy,balanceAfter,relatedMatchId,relatedMatchMode,reason,metadata,createdAt}], total,
  page, limit}`. iOS drops `relatedMatchId/relatedMatchMode/metadata` (harmless).

**Verdict: OK.**

**Behaviour vs H5** (`profile.js:1159-1380`): H5's energy page is a full-screen page:
3 package rows → payment-method radio (UI only; backend ignores it for energy) → single
"Pay ¥X · N cells" button that does purchase+confirm, with a busy guard; balance bar on the
profile tab (`loadEnergyBar`) refreshed after purchase, after joining the pool, and on refund
notifications. **H5 has no check-in / claim UI** (`claimEnergy` is defined, zero call sites) —
`dailyCheckIn` is iOS-only; keep out unless product wants it. The important energy flow lives in
the match tab (§2.6): enhanced pre-check + confirm card, and the refund banner
(`energy_refunded` notification `metadata:{mode, energy, refundReason:'unconfirmed_48h'|<other>,
matchId}`; banner text `chat.js:430-437`).

**Code quality**: Chinese `infoMessage` strings; `load()` hides network errors; `async let bal =
try? await …` returns `EnergyBalance?` — OK but silent.

### 2.6 `MatchingViewModel.swift` (56 lines)
**Defines** `@Published mode: MatchMode(.romantic default), status: MatchStatus?, isLoading,
errorMessage, actionMessage`; `state` (defaults `.idle`), `load()`, `switchMode(_:)`,
`start(enhanced:cells:)`, `stop()`, `confirm(matchId:)`, `dissolve(matchId:reason:)`. Shared via
`MainTabView` to `MatchTabView` and `EnhancedSheet`. `MatchFilterView` bypasses it and calls
`MatchingService.get/setPreferences` directly.

**Endpoints & shapes (verified, `matching/matching.controller.ts`, `matching.service.ts`)**
- `GET /matching/status?mode=` → common `{mode, matchConfig:{cronExpr,description}|null,
  nextRunAt:ISO|null}` +
  - romantic: `{state, match:{id,status,myConfirmed,partnerConfirmed,remainingMs|null,score,
    matchedAt,relationshipStartedAt,confirmedAt}|null, partner:<public profile>|null,
    searchingSince?}`;
  - friend: `{state, matches:[{matchId,status,score,myConfirmed,partnerConfirmed,remainingMs|null,
    matchedAt,partner:<public profile>|null}], searchingSince?}` — includes confirmed friends even
    while `searching`; `state` = `matched` when any active friend exists.
  iOS `MatchStatus/RomanticMatch/FriendMatch` decode this (all optional except `state`, which
  has a tolerant init). `partner` shape = §2.9 public-profile (`userId`, not `id`) → iOS
  `PublicProfile` OK. Note friend partners come from `getPublicProfilesByIds` whose fallback field
  list **includes `coverUrl` and `realPhotos`** when `SystemConfig.public_profile_fields` is unset
  (`profiles.service.ts:104-108`) — do not render them for strangers.
- `POST /matching/start {mode, enhanced?:bool, cells?:1–5}` → `{status:'SEARCHING', message}`.
  Server: 400 if questionnaire for that mode incomplete; 400 "Not enough energy" if enhanced and
  balance < cost (romantic fixed 3, friend = cells); 400 if romantic already
  matched/confirming/relationship; **already in pool → returns `{status:'SEARCHING', message:
  'Already matching, please wait'}` with NO charge and NO enhanced flag written** — H5 detects
  this with `/already matching/i` and refuses to claim success or reset the toggle
  (`match.js:944-962`). iOS just shows the message and reloads.
- `POST /matching/stop?mode=` (query param — iOS passes it correctly) → `{status:'IDLE'|'MATCHED'
  |'RELATIONSHIP', message}`; 400 if not searching.
- `POST /matching/:matchId/confirm-relationship` → see §2.3. `POST /matching/:matchId/dissolve
  {reason?}` → `{message}`; also emits SSE `relationship_dissolved`-type notification to the peer.
- `GET/PUT /matching/preferences?mode=` → prefs row `{mode, requireSameCity, requireSameUniversity,
  requireSameMajor, preferredNationalities[], preferredMbti[], preferredGender|null, ageMin|null,
  ageMax|null, universityStage:'undergraduate,master'|null, preferredInterests[],
  preferredActivities[], friendRequirements|null, enhancedModeEnabled, friendEnhancedCells,
  matchBasis:'questionnaire'|'profile'|'both', extraMatchInfo|null, …timestamps}`. PUT DTO
  (`match-preferences.dto.ts`) whitelists exactly the iOS `MatchPreferences` keys; `ageMin/ageMax`
  18–60 or null; `extraMatchInfo`/`friendRequirements` ≤500; `enhancedModeEnabled`/
  `friendEnhancedCells` are stripped server-side. Saving prefs clears the `no_match` marker.
- `GET /matching/milestones` → `{state:'none'}` | `{state:'relationship', daysTogether,
  messageCount, postCount, sharedInterests[], matchScore, startedAt}` (iOS `Milestones` OK).
- `POST /matching/feedback/events {events:[{matchId,type:'viewed'|'openedProfile'}]}` (≤50) →
  ingest result; iOS `reportFeedback` OK but never called by the VM.
- `POST /matching/connect {code}` / `POST /matching/connect-user {userId}` → `{matchId, message,
  partner}` (immediately `FRIEND_CONFIRMED`). H5 only uses `/connect` (QR or typed code);
  `connect-user` is kept on the backend "because iOS uses it" (`addfriend.js:280`).

**Verdict: OK endpoints/fields; the flow is a stub.** Missing vs H5 `match.js`:
1. **Polling** — 30 s `GET /matching/status?mode=` while not (romantic ∧ relationship); friend
   mode always (`match.js:1163-1188`); 1 s ticks for `remainingMs` and the reveal countdown.
2. **State machine rendering**: `idle`/`searching` → the "plan page" (title, sub, neon countdown
   card with week row + "next reveal" from `getNextRevealDate` = next run of
   `matchConfig.cronExpr` else Friday 17:00 — the server also supplies `nextRunAt`; read-only
   preference summary box fed by `GET /matching/preferences?mode=` (2×2 grid; friend mode's 3rd
   cell = "兴趣优先"; enhanced toggle read-only + extraMatchInfo text; searching → contents dimmed,
   "🔒 匹配中锁定" instead of Edit); CTA "Join Matching Pool" / pink "Leave Pool"). `no_match` →
   "no match this round" card + Match Again (which is `POST start` again; server clears the note).
   romantic `matched|confirming` → partner card + 48 h countdown + "Open chat & both confirm"
   (`openConnectionChat`), reports `viewed`. romantic `relationship` → couple hub (§2.4) — polling
   stops. friend `matched` → up to 5 candidate cards (confirmed ones without timer), each
   reporting `viewed`.
3. **Start flow** (`match.js:888-968`): `GET /questionnaire/completion?type=<mode>` → if not
   `completed` prompt to fill (do not call start); if enhanced toggle on: refresh balance, if
   `availableEnergy < cost` → toast + open energy page; else confirm card (title/body/confirm/
   cancel; tapping the scrim = abort, "Join without it" = turn toggle off then join plain);
   optimistic `searching` render; handle "already matching"; on real success clear the toggle
   (per-round purchase) and refresh balance; remember `lastEnhancedRound[mode]` to show "本轮已生效 ·
   N 能量" in the summary box.
4. Enhanced toggle state lives client-side (`S.enhanced`, persisted `cl_enhanced_*`) and is
   validated against balance when switched on (`toggleEnhance`, `match.js:1779-1808`); friend cells
   slider 1–5 (`cost === cells`).
5. Preferences sheet (`openFilterSheet`): mode-specific form, "Any age" toggle → nulls,
   `universityStage` multi-select of `undergraduate|master|doctor`, friend gender segment
   `male|female|all`(→ null), interests/activities chips (interests come from the profile),
   enhanced section only in the sheet, "retake questionnaire" entry; save refuses if the load failed
   (stale values could belong to the other mode).
6. Home has a 3-pane track `chat | romantic | friend` with swipe + segmented control
   (`switchHomeView`, `bindHomeViewSwipe`); the "+" menu (search contacts / QR / relationship
   network / dark mode / language).
7. Partner profile overlay (`GET /users/:id/public-profile`) with note editing and `openedProfile`
   event (`match.js:1208-1338`).

**Code quality**: `MatchMode.title` returns Chinese literals (`Models/Matching.swift:8`);
`actionMessage` is the raw English server message; `switchMode` reloads without cancelling the
previous load (race: fast toggling can leave the other mode's status displayed under the new
mode — H5 buckets status per mode, `S.matchStatus.romantic/friend`).

### 2.7 `MetadataViewModel.swift` (41 lines)
**Defines** singleton `static let shared`, `@Published cities, universities, majors, mbtiTypes,
nationalities, isLoaded, errorMessage`; `loadAllIfNeeded()` fetches the five lists concurrently,
falls back to a hard-coded MBTI list on failure.

**Endpoints**: `GET /metadata/uk/cities|uk/universities|uk/majors|mbti-types|nationalities` →
`{items:string[]}` (`metadata.controller.ts:13-41`), no auth needed but the controller sits under
the global JWT guard (it's not `@Public`), so send the token. **Verdict: OK.**

**Gaps vs H5**: H5 shows Chinese labels in zh mode via a 234-entry display map `META_ZH`
(universities 78 / cities 50 / majors 67 / nationalities 39 + grade labels) while **values stay
English** (`i18n.js`, `profile.js:fillMetaSelect`); iOS needs the same map. Grade options are NOT
metadata: canonical values are `Foundation, Year 1–4, Master's, PhD Year 1–4+`
(`profiles/dto/profile.dto.ts:29-35`); H5 `normalizeGrade` maps legacy Chinese/`Freshman` values.

**Code quality**: `@MainActor` singleton used both as `@StateObject private var meta =
MetadataViewModel.shared` (ProfileSetupView) and `@ObservedObject` (ProfileEditView) — StateObject
over a shared instance is a misuse; make it an injected environment object or a plain cache actor.
`isLoaded` never resets; a failed partial load leaves empty arrays with no retry.

### 2.8 `NotificationViewModel.swift` (36 lines)
**Defines** `@Published items: [AppNotification], unread, isLoading, errorMessage`; `load()`
(page 1, limit 20), `refreshUnread()`, `markAllRead()` (rebuilds items with `isRead:true`).

**Endpoints (verified, `notifications/notification.controller.ts`, `notification.service.ts`)**
- `GET /notifications?page&limit` → `{items:[{id,type,title,body,isRead,createdAt,metadata}],
  total, unread, page, limit}` newest first.
- `GET /notifications/unread-count` → `{unreadCount}`.
- `PUT /notifications/read` → `{success:true}`; `PUT /notifications/:id/read` → `{success:true}`
  (service has it, VM doesn't expose it; H5 marks a single item read on tap).

`type` vocabulary actually written by the backend: `match_result, no_match, match_expired,
confirmed, relationship_confirmed, relationship_dissolved, friend_added, like, comment, milestone,
energy_refunded, system, exponential` (last one is a legacy typo-ish type). `metadata` variants:
`{matchId, mode}`, `{mode}`, `{postId}`, `{postId, commentId}`, `{postId, actorId}` (like; actorId is
an anonymised token), `{kind:'love_you_100', matchId}`, `{mode, energy, refundReason, matchId}`
(energy_refunded), `{claimType, taskKey}`.

**Verdict: NEEDS FIELDS** — `NotificationMeta {matchId, postId, commentId, mode}` must add
`energy:Int?`, `refundReason:String?`, `kind:String?`, `actorId:String?`. Everything else decodes.

**Behaviour gaps vs H5** (`notifications.js`): 15 s polling (60 s when SSE up) + SSE-triggered
refresh with a re-entrancy guard; badge on the header bell; "load more" paging; grouping
Today/Yesterday/Earlier; **client-side zh localisation of the server's English title/body** (16
title keys, 7 static bodies, 10 regex patterns incl. names/cells/poll titles — `NOTIF_TITLE_ZH`,
`NOTIF_BODY_ZH`, `NOTIF_BODY_PATTERNS`); detail overlay; tapping navigates by `type`/`metadata`
(post → post detail, match → match tab, refund → chat banner + balance re-sync);
`energy_refunded` surfaced as a banner atop the chat list, de-duped by notification id.

**Code quality**: rebuilding `AppNotification` via memberwise init instead of a mutable model; no
paging state; `unread` and `items` can disagree after `markRead` of a single item.

### 2.9 `ProfileViewModel.swift` (106 lines)
**Defines** `@Published profile: UserProfile?`, ~24 form fields, static option arrays
(`grades` Chinese 大一…博士四, `zodiacOptions` Chinese, `genderOptions`, `genderPrefOptions`,
`presetTags` 20 Chinese tags), `loadProfile()`, `saveProfile()` (requires nickname+school+city),
`toggleInterest`, `addTag` (≤10), `removeTag`, `uploadAvatar(_:)`, `completeness`. Used by
ProfileSetupView, ProfileEditView, ProfileTabView, OnboardingCoordinator.

**Endpoints**
- `GET /profiles/me` → full Prisma `Profile` row (`id,userId,nickname,realName,familyName,
  givenName,school,grade,gender,genderPref,age,birthday,city,interests,wishGifts,bio,avatarUrl,
  socialLinks,signature,coverUrl,tags,major,mbti,nationality,studentId,realPhotos,zodiac,
  relationshipScore,profileCompleteness,createdAt,updatedAt`) **plus `joinedAt`, `connectCode`,
  `verificationStatus`** (`profiles.service.ts:45-61`); 404 "Profile not completed" when no row.
- `PUT /users/me` (iOS) and `PUT /profiles/me` (H5) both take `CreateProfileDto` and return the
  upserted row; unsent keys are preserved; `profileCompleteness` recomputed from merged data. DTO
  constraints: `gender ∈ male|female|non_binary|other`, `genderPref ∈ male|female|any`, `age`
  16–40, `birthday` `YYYY-MM-DD`, `tags` ≤10×20 chars, `realPhotos` ≤6, `studentId` ≤32,
  `mbti` any string (16 canonical), `grade` any string (canonical English list above),
  `socialLinks` free object.
- `POST /uploads/image` (multipart) → `{url}`; iOS then PUTs `avatarUrl`.
- Services also exist for `GET /users/:id/public-profile`, `GET/PUT /users/me/settings`,
  `GET /users/me/connect-code` → `{connectCode:'CL…'}`, `POST /users/me/verification/send-code
  {schoolEmail}` → `{message, expiresInSec, devCode?}` (school email must contain `.edu` or `.ac.`,
  60 s cooldown, 400 if already verified) — all called from views, not from this VM.

**Verdict: NEEDS FIELDS.** `UserProfile` lacks `birthday`, `studentId`, `joinedAt`,
`connectCode`, `verificationStatus`, `createdAt`; `UpdateProfileRequest` lacks `birthday`,
`realName/familyName/givenName`, `studentId` (all whitelisted in the DTO). Grade values are
Chinese and would be stored verbatim — the matcher/H5 expect the English canon.

**Behaviour gaps vs H5** (`profile.js`): setup is a per-field wizard (nickname, real name, gender,
birthday → age derived, school/major/city/nationality/MBTI selects, interests with explicit Add,
bio); H5 required set = nickname, realName, gender, birthday. Profile tab shows cover with
pull-to-reveal, avatar, verify chip (`unverified|pending|verified|rejected`), energy bar, photo wall
(≤6, `POST /uploads/real-photo {url}` / `PUT realPhotos`), tags, "homepage" (signature/bio) editor,
public preview, tickets, contact us, settings, "joined N days". **Student verification** (`verify-
overlay`): upload card image → send code (60 s countdown, devCode hint) → `POST /users/me/
verification/submit {studentCardUrl, schoolEmail, code}` → `verificationStatus:'pending'`.
**The submit call does not exist anywhere in iOS** (SettingsView only sends the code) — the flow is
half-built. Public profile display must respect the stranger shape (§5) and `hidden:true` when
`privacy.showProfile` is off. (`auth.js:146-159 applyVerification → POST /users/me/verification/
apply` is dead H5 code — no such route; ignore.)

**Code quality**: Chinese option arrays and error strings; `loadProfile` swallows errors (a 404 on a
fresh account is expected and must be distinguished from network failure — OnboardingCoordinator
relies on `profile == nil`); `saveProfile` sends `wishGifts: nil` (fine) but does not send
`birthday`; `age` is edited directly (H5 derives from birthday).

### 2.10 `QuestionnaireViewModel.swift` (65 lines)
**Defines** `@Published mode, questionnaire: QuestionnaireVersion?, isLoading, isSubmitting,
isSubmitted, errorMessage, currentIndex, answers: [String: Any]`; `load(mode:)`, `setAnswer`,
typed getters, `isCurrentQuestionAnswered()` (required-gate), `currentQuestion`, `progress`,
`isLastQuestion`, `submitAnswers()` (compacts to `[AnswerItem]`).

**Endpoints (verified)**
- `GET /questionnaire/active?type=romantic|friend` → `QuestionnaireVersion` row `{id, version,
  type:'ROMANTIC'|'FRIEND', title, description, isActive, createdAt…, questions:[{id,
  questionnaireId, type:'SINGLE_CHOICE'|'MULTIPLE_CHOICE'|'SCALE'|'TEXT', title, titleEn|null,
  description, isRequired, isEnabled, order, group, code, semantics, hardness, weight, target,
  options:[{id, questionId, label, labelEn|null, value, order}]}]}` (enabled questions only, ordered;
  404 "No questionnaire available" if none active). Production today: romantic v4 (18 q) / friend v5
  (14 q), all four types in use.
- `POST /answers {questionnaireVersionId, answers:[{questionId, value}]}` → `{message,
  answeredCount, questionnaireVersion}`. `value` types: SINGLE_CHOICE → option `value` string;
  MULTIPLE_CHOICE → `string[]`; SCALE → integer **1..5 where 1 = strongly disagree, 5 = strongly
  agree** (`questionnaire.js:191-203`); TEXT → string. H5 drops blank answers (empty string/array)
  and refuses submit if any `isRequired` is blank; partial submission is allowed by the server.
- `GET /questionnaire/completion` → `{romantic:{completed, versionId?}, friend:{…}}` — iOS
  `QuestionnaireCompletion` matches; service exists, VM never calls it. H5 uses it as the gate
  before starting a match and to render the two optional home cards.
- `GET /answers/mine?versionId=` → existing answers (H5 prefill on retake, `questionnaire.js:136`);
  no iOS service.

**Verdict: NEEDS FIELDS** — add `titleEn` and `labelEn` (English UI must prefer them, fall back to
Chinese), `code/semantics/hardness/weight/target` optional passthrough. `QuestionOption.id`
(computed from `value`) is fine; `CodingKeys optionId="id"` fine.

**Behaviour gaps vs H5**: question-navigator grid (answered = green, current = ring, jump to any
question), first-unanswered resume, retake banner for in-pool users when a new version activates,
scale rendered as 5 labelled rows, after submit → home switched to that mode's pane.

**Code quality**: `@Published var answers: [String: Any]` is non-`Sendable`/non-`Equatable`
(problematic under Swift 6 strict concurrency; use an enum `AnswerValue { text, single, multi,
scale }`); `getScaleAnswer` defaults to 3 for display but never stores it, so an untouched scale
question is "unanswered" — matches H5.

### 2.11 `SquareViewModel.swift` (62 lines)
**Defines** `enum SquareBoard { recommend, campusWall }` (Chinese `title`), `@Published board,
cards: [SquareCard], isLoading, errorMessage, needProfileSchool`, private `page/hasMore`;
`switchBoard`, `reload`, `loadMore` (page-number paging, `limit 20`), `like(_:)` (± count via
`withLike` copy). Feeds `SquareTabView`; `PostDetailView`/`CreatePostView` call `SquareService`
directly.

**Endpoints (verified, `square/square.controller.ts`, `square.service.ts`)**
- `GET /square/v2/recommend?page&limit(≤50)[&cursor][&search]` → `{items, page, limit, total,
  hasMore}` (weighted mix; `search` turns it into a search result).
- `GET /square/v2/campus-wall?…` → same + `needProfileSchool:true` with empty items when the
  viewer has no school; excludes pinned posts **except event posts**.
- `GET /square/v2/pinned` → `{items, total, needProfileSchool?}` (≤50, student-union order) —
  **third pager page in H5** (`SQUARE_PAGES = ['recommend','campus_wall','pinned']`,
  `square.js:19`), segment appears only when non-empty.
- `GET /square/v2/search?q&board?&page&limit` → `{query, posts:{items, page, limit, total,
  hasMore, needProfileSchool?}}` (H5 full-screen search page; cards may carry `commentSnippet`).
- `GET /square/v2/posts/:id` → post + `comments` tree + `myLiked` (+ `myVote`).
- `POST /square/v2/posts {board:'recommend'|'campus_wall', title?≤100, content≤2000, images?,
  anonymous?, tags?, postType?:'normal'|'poll', pollOptions?:2–6×≤50}` → post. Poll posts are
  forced to campus wall and created `reviewStatus:'pending'` (author-only visible until approved).
- `POST /square/v2/posts/:id/vote {optionIndex}` → `{pollOptions:[{text,votes}], myVote}`.
- `POST /square/v2/posts/:id/like` → `{liked:bool, message}` (toggle; also notifies author).
- `POST /square/v2/posts/:id/comments {content≤500, imageUrl?, parentCommentId?, anonymous?}` →
  comment; `POST /square/v2/comments/:id/like` → `{liked, likeCount}`.
- `POST /square/v2/posts/:id/report {reason?≤200}` → `{reported, reporterCount, hidden, message}`
  (≥3 reporters auto-hides). Comment reports go through `POST /reports {category:'content',
  content}` (H5 `square.js:1280-1297`).
- `DELETE /square/v2/posts/:id` → `{deleted:true, message}` (author only, soft hide).

**Card shape** (`shapeCard`/`shapePost`, `square.service.ts:1185-1224`): the raw `SquarePost` row
(`id, board:'RECOMMEND'|'CAMPUS_WALL', authorType:'USER'|'TEAM'|'STUDENT_UNION'|'SPONSOR',
authorUserId?, adminId?, school, coupleMatchId, title, content, images[], likeCount, commentCount,
anonymous, isSponsored, postType:'normal'|'poll'|'event', pollOptions:[{text,votes}]|null,
reviewStatus, eventId, isHidden, tags[], createdAt, updatedAt`) + relations `authorUser:{id,
profile:{nickname,avatarUrl,school}}|null`, `admin:{id,name,organizationName,role}|null`,
`event:{id,title,venue,school,startAt,endAt,priceCents,capacity,ticketsSold,status}|null`,
`_count:{likes,comments}` + computed `isPinned`, `isMine`, `cardType:'large'(official)|'medium'
(campus wall)|'small'`, `sameSchool`, `myVote` (polls), `commentSnippet` (search only). Anonymous
user posts: `authorUser:null`, `authorUserId/adminId` deleted, `anonymousAuthor:{aliasSeed:uint32,
nickname:'<Adj> <Animal>', avatarUrl:null}`, `anonymousAuthorToken:'a_…'`. `metadata` is always
stripped.

**Comment shape** (`getPost` + `anonymizeComments` + `shapeComments`): `{id, postId, content,
imageUrl, anonymous, parentCommentId, createdAt, updatedAt, user:{profile:{nickname,avatarUrl}}
(no id), anonymousAuthor?:{aliasSeed,nickname}, anonymousAuthorToken? (only the OP's own anonymous
comments), likeCount, myLiked, replies:[…same, one level]}`. Mark "作者" when
`comment.anonymousAuthorToken === post.anonymousAuthorToken` (anonymous OP) or `user` matches
`post.authorUserId` (normal posts; H5 compares via the author key, `square.js:1519-1531`).

**Verdict: NEEDS FIELDS.** `SquareCard` misses `postType, pollOptions, myVote, event, admin,
isPinned, reviewStatus, coupleMatchId, anonymousAuthorToken, commentSnippet`; `AnonymousAuthor`
misses `aliasSeed` (needed to render the zh/en alias + emoji avatar identically to H5 — 16 adjectives
× 16 animals, same index in both languages; **never** derive an avatar from the nickname initial);
`SquareComment` misses `anonymous, anonymousAuthor, anonymousAuthorToken, likeCount, myLiked`;
`CreateCommentRequest` misses `anonymous`; `CreatePostRequest` misses `postType, pollOptions`.
`SquarePostDetail` should just be `SquareCard + comments + myLiked + myVote`.

**Behaviour gaps vs H5** (`square.js`): 3-page horizontal track with finger-follow swipe, per-page
scroll position memory, tab re-tap = scroll-to-top + refresh current page, pull-to-refresh, masonry
(2-col, official/campus-wall cards span both), pinned badge, official badge, SPONSORED large cards
from `GET /ads/feed?school=<mySchool>&limit=3` with impression/click batching
`POST /ads/events {events:[{campaignId, school, type:'impression'|'click'}]}` (flush every 10 s /
on background, ≤100 per batch, `ads.js`), poll voting UI (bars with %, one vote, changeable),
event strip (time/venue/price "N 格能量" or Free, remaining) + buy ticket flow (`GET /events/:id` →
`{…event, remaining, myTickets}`; balance check; confirm card; `POST /events/:id/purchase {}` →
`{ticketId, code, event:{id,title,startAt,venue}, pricePaidCents, cellsPaid}`; 400 if energy short /
sold out / limit), text-card highlighter, `needProfileSchool` → prompt to set school, FAB to post
(hidden on pinned page), new-post modal (board chip, title/content/images ≤N, anonymous toggle,
poll toggle only on campus wall with 2–6 removable options), post detail (three-part layout,
scroll-hides chrome, image carousel, author header, like/comment/date row, comments grouped with
one-level replies, long-press → action card share/like/report, comment composer with image +
anonymous toggle whose placeholder changes, "more" menu share/report/delete-own), like sync across
the three feed caches + search cache.

**Code quality**: `withLike` re-constructs `SquareCard` through a 17-argument memberwise init
(brittle — every new field breaks it; make cards `var`); `like()` ignores server `liked`
truthiness only for the delta (fine) but never records `myLiked`; page-number paging is what H5
uses too (cursor unused); `SquareBoard.title` Chinese.

---

## 3. Cross-cutting gaps the VM layer must gain (H5 parity checklist)

1. **Realtime**: an `RealtimeClient` actor (SSE parser) driving `ChatSessions`, `Chat`,
   `Notification` VMs; poll cadences exactly as §1.3; start on login/boot, stop on logout/401.
2. **Energy confirm flow** on `MatchingViewModel.start` (§2.6 item 3) + enhanced toggle/cells
   state + `lastEnhancedRound` + refund banner from `energy_refunded` notifications.
3. **Square v2 pager**: three pages + search page + poll vote + event strip/ticket purchase + ads.
4. **Tickets VM**: `GET /events/tickets/mine` → `{tickets:[{id, code:'UMT-…', eventId, userId,
   pricePaidCents, status:'valid'|'used'|'cancelled', usedAt, createdAt, event:{id,title,venue,
   school,startAt,endAt,status,images}}]}`; H5 renders cards (title, time · venue, school, status
   badge, "实付 N 格" when `pricePaidCents>0` = `ceil(pricePaidCents/100)` cells, QR of `code`, mono
   code) + detail overlay (`profile.js:1382-1540`). Check-in scanning is admin-only.
5. **Couple VM/model rewrite** (§2.4) and hosting the hub inside the romantic pane.
6. **Discovery**: H5 deliberately dropped `/discovery/*`, `/users/search`, `connect-user` from the
   UI (8/19 product decision: contacts-only search; add friends only via QR / connect code
   `POST /matching/connect {code}`; relationship network `GET /relationships/graph`). The
   `privacy.searchable/discoverable` toggles were removed from the UI (keys still exist server-side,
   don't send them). Don't port `MatchingService.connectUser` or `/users/search`.
7. **Settings VM** (currently none; `SettingsView` calls services directly): `GET/PUT
   /users/me/settings` → `{pushEnabled, privacy:{showProfile, showOnline, showMoments, searchable,
   discoverable}}`; PUT merges only provided known keys — H5 PUTs a single key per toggle
   (`{privacy:{showOnline:false}}`) and exposes exactly `pushEnabled, privacy.showProfile,
   privacy.showOnline, privacy.showMoments` (`index.html toggleSetting(...)`). Plus nudge suffix
   (`PUT /chat/nudge-suffix {suffix}` → `{nudgeSuffix}`), language, dark mode, content pages
   (help/safety/terms/privacy, zh+en), contact us (`contact@unimatcha.ai`), report a problem
   (`POST /reports {category:'bug'|'user'|'content'|'other', content≤2000, contact?}` → `{id,
   message}`), change password, "love mode" jump, logout, version. iOS `PrivacySettings` has 3
   non-optional keys — decoding the 5-key response works; keep it to those 3.
8. **Notifications**: polling, paging, zh localisation, navigation by type, single mark-read.
9. **Student verification**: complete the submit step (§2.9).
10. **i18n + theme**: `en` default, `zh` toggle; light default + dark mode; no Chinese literals in
    VMs — move all copy into a string table keyed like H5's dictionary.
11. **Metadata zh display map** and canonical grade values.
12. **Feedback events** `viewed` (match cards rendered) / `openedProfile` (partner profile opened),
    de-duped per session.

---

## 4. H5 shared state (`state.js`) → suggested iOS ownership

| H5 `S.*` | Meaning | iOS owner |
|---|---|---|
| `currentUser` | `/users/me` payload | AuthViewModel |
| `userSettings` | settings cache | new SettingsViewModel |
| `homeView` `'chat'|'romantic'|'friend'`, `activeMatchMode` | 3-pane home | MatchingViewModel (`homeView`, `mode`) |
| `matchStatus.{romantic,friend}` | status per mode (both cached) | MatchingViewModel (dictionary keyed by mode, not a single `status`) |
| `matchPrefs.{romantic,friend}` | prefs cache for summary box | MatchingViewModel |
| `energy`, `enhanced.{romantic:{enabled,cost:3}, friend:{enabled,cells}}`, `energyPackages` | energy + toggles | EnergyViewModel (+ persisted toggles) |
| `sessions`, `chatMatchId/PartnerId/PartnerName`, `chatSessionType/Mode/MyConfirmed/PartnerConfirmed/SessionStatus`, `chatMessages`, `chatLastId`, `chatNextCursor`, `chatPollBusy/Tick` | chat | ChatSessionsViewModel + ChatViewModel |
| `realtimeES`, `realtimeUp`, `rtThrottle` | SSE | RealtimeClient |
| `notifList/Page/HasMore`, `notifPollingId` | notifications | NotificationViewModel |
| `squareTab`, `squarePostsByTab`, `squareScrollPos`, `squareReqSeqs`, `newPostBoard/Anonymous/Images`, `currentPostId`, `pdPostData`, `pdReplyTo`, `pdPendingImgs` | square | SquareViewModel + PostDetailViewModel + NewPostViewModel |
| `romanticAnswers/friendAnswers`, `questionnaireMode`, `questionnaire`, `currentQuestion` | questionnaire | QuestionnaireViewModel (bucket answers per mode) |
| `coupleSpace`, `coupleMatchId` | couple | CoupleViewModel |
| `verifyCardUrl` | verification | ProfileViewModel / VerificationViewModel |
| `metadataCache`, `editTags`, `setupTags` | profile forms | ProfileViewModel + MetadataViewModel |
| `milestoneData` | milestones overlay | MatchingViewModel |

`cleanupUserState()` (`core.js:133-235`) resets all of the above and every timer/SSE on logout or
401 — the iOS equivalent must reset every VM (the current app keeps `@StateObject`s alive in
`MainTabView` across logins because `RootView` only swaps the tree on `isLoggedIn`).

---

## 5. Verified endpoint/shape quick table (what iOS request structs send vs DTO whitelist)

| iOS request type | Endpoint | DTO keys allowed | Status |
|---|---|---|---|
| `AuthService.Body{email}` | POST /auth/register/send-code | email | OK |
| `{email,password,code}` | POST /auth/register | email,password,code | OK |
| `{email,password}` | POST /auth/login | email,password | OK |
| `{currentPassword,password}` | POST /auth/change-password | same | OK |
| `UpdateProfileRequest` | PUT /users/me (=PUT /profiles/me) | CreateProfileDto (+birthday, realName, familyName, givenName, studentId missing on iOS) | OK / add fields |
| `UserSettings{pushEnabled,privacy{3}}` | PUT /users/me/settings | pushEnabled, privacy(object) | OK |
| `{schoolEmail}` | POST /users/me/verification/send-code | schoolEmail | OK |
| — (missing) | POST /users/me/verification/submit | studentCardUrl, schoolEmail, code | **absent** |
| — (missing) | PUT /users/me/notes | targetUserId, note? | absent |
| `StartMatchRequest{mode,enhanced?,cells?}` | POST /matching/start | mode?, enhanced?, cells?(1–5) | OK |
| query `mode` | POST /matching/stop | — | OK |
| `DissolveRequest{reason?}` | POST /matching/:id/dissolve | reason? | OK |
| `ConnectCodeRequest{code}` | POST /matching/connect | code | OK |
| `ConnectUserRequest{userId}` | POST /matching/connect-user | userId | OK but H5 dropped it |
| `MatchPreferences` (all keys) | PUT /matching/preferences | all present; enhanced keys stripped | OK |
| `{events:[{matchId,type}]}` | POST /matching/feedback/events | events[] ≤50 | OK |
| `SendMessageRequest{content?,imageUrl?}` | POST /chat/:id/messages | content?, imageUrl? | OK |
| `{imageUrl?}` | PUT /chat/:id/background | untyped body | OK |
| `{suffix}` | PUT /chat/nudge-suffix | untyped body | OK |
| Couple requests | /couple/* | see §2.4 | OK (add `images`) |
| `PurchaseRequest{packageId}` | POST /energy/purchase | packageId ∈ pkg_30/60/100 | OK |
| `PurchaseConfirmRequest` | POST /energy/purchase/confirm | orderId, packageId, transactionId? | OK |
| `ClaimRequest{claimType,taskKey?}` | POST /energy/claim | same | OK (no H5 UI) |
| `SubmitAnswersRequest` | POST /answers | questionnaireVersionId, answers[{questionId,value}] | OK |
| `CreatePostRequest` | POST /square/v2/posts | + postType?, pollOptions? missing on iOS | OK / add |
| `CreateCommentRequest` | POST /square/v2/posts/:id/comments | + anonymous? missing | OK / add |
| `ReportRequest{reason?}` | POST /square/v2/posts/:id/report | reason? | OK |
| `ReportService{category,content,contact?}` | POST /reports | category ∈ bug/user/content/other | OK |
| — (missing) | POST /square/v2/posts/:id/vote | optionIndex | absent |
| — (missing) | POST /square/v2/comments/:id/like | — | absent |
| — (missing) | GET /square/v2/pinned, GET /square/v2/search | — | absent |
| — (missing) | GET /events/:id, POST /events/:id/purchase, GET /events/tickets/mine | paymentMethod? | absent |
| — (missing) | GET /ads/feed, POST /ads/events | events[{campaignId,school,type}] | absent |
| — (missing) | GET /relationships/graph | — | absent |
| — (missing) | GET /realtime/stream?token= | — | absent |
| — (missing) | GET /answers/mine?versionId= | — | absent |

Public-profile shape for reference (`users.service.ts:87-125`, `profiles.service.ts:63-160`):
stranger → `{userId, verificationStatus, nickname, school, grade, age, city, interests, bio,
avatarUrl, signature, tags, major, mbti, nationality, zodiac}` (never coverUrl/realPhotos/realName;
or `{nickname, avatarUrl, hidden:true}` when `privacy.showProfile` is off); self or confirmed
partner/friend → full profile incl. `realName, socialLinks, coverUrl, realPhotos, relationshipScore,
daysKnown`. iOS `PublicProfile` lacks `hidden`, `socialLinks`, `realName`, `daysKnown`.

---

## 6. Code-quality items to leave behind (all files)
- Token/user persistence in `UserDefaults` → Keychain for the token; no cached user.
- APIClient 401 must publish a logout event to the auth VM (H5 tears everything down).
- `ErrorResponse.message` must accept `String | [String]`.
- All UI copy is hard-coded Chinese in VMs/models (`MatchMode.title`, `SquareBoard.title`,
  grades/zodiac/tags/errors/info) while H5 defaults to English with a zh dictionary.
- Dark-only `Theme` vs H5 light default + dark toggle.
- Force unwrap `s.data(using: .utf8)!` in multipart builder; `UUID().uuidString` fallback ids in
  `PublicProfile.id`/`QuestionOption.id` (non-stable identity breaks SwiftUI diffing).
- `[String: Any]` published state; 17-arg memberwise copies (`SquareCard.withLike`).
- `MetadataViewModel.shared` used as `@StateObject`.
- Fixed 5 s chat poll with cursor bug; no de-dupe; re-`load()` after each couple mutation although
  the server returns the new space.
- iOS 16 deployment target (`project.yml`) — `NavigationStack`, `scrollContentBackground`,
  `.onChange(of:)` single-param are all iOS 16 APIs; fine for a 16+ target, but note Xcode 26 /
  Swift 6.3 will warn on the two-param `onChange` deprecation and on non-Sendable published state.
- `Info.plist` ships `NSAllowsArbitraryLoads` and a localhost base URL.
