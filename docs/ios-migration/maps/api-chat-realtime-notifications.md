# API contract map — chat / realtime (SSE) / notifications / couple space

Source of truth (read 2026-09-03, branch `main`):

- `apps/api/src/main.ts`, `apps/api/src/common/{filters,interceptors,guards,decorators}/*`
- `apps/api/src/chat/{chat.controller.ts,chat.service.ts,dto/chat.dto.ts}`
- `apps/api/src/realtime/{realtime.controller.ts,realtime.service.ts}`
- `apps/api/src/notifications/{notification.controller.ts,notification.service.ts}`
- `apps/api/src/couple/{couple.controller.ts,couple.service.ts}`
- `apps/api/src/matching/mode.util.ts` (status sets, 48 h window)
- `apps/api/src/auth/strategies/jwt.strategy.ts`, `apps/api/src/auth/auth.service.ts`, `auth.module.ts`
- `apps/api/src/prisma/prisma.service.ts` (`updateUserSettings`), `apps/api/prisma/schema.prisma`
- Cross-references for notification producers: `matching/matching.service.ts`, `square/square.service.ts`, `square/square-admin.service.ts`, `energy/energy.service.ts`
- H5 client behaviour (for cadence/conventions): `apps/h5/src/modules/{core.js,chat.js,notifications.js,couple.js,settings.js}`, `apps/h5/src/state.js`

Admin controllers are intentionally excluded.

---

## 0. Global transport conventions (apply to every endpoint below)

### 0.1 Base URL and prefix

- Global prefix: **`/api/v1`** (`app.setGlobalPrefix('api/v1')`). Every route in this document is relative to that prefix, e.g. `GET /chat/sessions` = `https://api.unimatcha.ai/api/v1/chat/sessions`.
- H5 derives the base as: local dev → `http://<host>:3001/api/v1`; production → `https://api.<domain-without-app.-prefix>/api/v1` (i.e. `https://api.unimatcha.ai/api/v1`). iOS should use a configurable `API_BASE_URL` with the same production default.
- Uploaded images are served **outside** the prefix at `https://api.unimatcha.ai/uploads/<uuid>.<ext>` with `Cache-Control: public, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`. The upload endpoint returns the absolute URL; store/use it verbatim.
- `helmet()` and gzip `compression` are on; compression is **disabled** for any path containing `/realtime/stream`.

### 0.2 Authentication

- Header: `Authorization: Bearer <JWT>` (passport-jwt `fromAuthHeaderAsBearerToken`).
- JWT: HS256 with `JWT_SECRET`, payload `{ sub: <userId>, email, role: 'user' }`, `expiresIn` = `JWT_EXPIRES_IN` env, default **7d**. Token is obtained from `POST /auth/login` / `POST /auth/register` (`{ user, token }`) — out of scope here.
- `JwtStrategy.validate`: rejects with **401** when `payload.role !== 'user'` (message `Unauthorized`), when the user row is gone (`User not found or has been deactivated`), or when `user.status === 'BANNED'` (`Your account has been banned`). `req.user` = `{ id, email, status }`; controllers read `@CurrentUser('id')`.
- H5 convention on **any** 401: delete token, stop all pollers + SSE, wipe user-scoped state, route to auth screen. iOS should do the same (the 401 can come from ban/deletion, not only expiry).
- The **SSE route is `@Public()`** and authenticates via `?token=` query param instead (see §2).

### 0.3 Success envelope (`TransformInterceptor`)

Every non-SSE response is wrapped:

```json
{ "success": true, "data": <controller return value>, "message": <undefined unless the return value has a top-level "message" key>, "timestamp": "2026-09-03T10:00:00.000Z" }
```

Two quirks the client decoder must know:

1. If the controller's return value has a top-level `data` key, the interceptor **unwraps** it (`data = ret.data`). None of the endpoints in this document return such an object, so for this domain `data` is always exactly the shapes listed below.
2. If the return value has a top-level `message` key it is copied to the envelope's `message` (and stays inside `data`). No endpoint here does that either.

`Date` fields are ISO-8601 strings with milliseconds and `Z` (Prisma `DateTime` → JSON). All ids are cuid strings (e.g. `clx1abc...`). `Json` columns come back as raw JSON (object/array/null).

### 0.4 Error body (`HttpExceptionFilter`, catches everything)

```json
{ "success": false, "statusCode": 400, "message": "<string or string[]>", "errors": null, "timestamp": "...", "path": "/api/v1/chat/x/messages" }
```

- `message` is a **string** for service-thrown exceptions and a **string[]** for `ValidationPipe` failures (class-validator messages such as `"limit must not be greater than 100"`, `"property foo should not exist"`).
- Unhandled errors → 500 `"Internal server error"`.
- Passport/guard failures → 401 with `message: "Unauthorized"` unless the strategy supplied a specific text (§0.2).
- `ValidationPipe` is global with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `enableImplicitConversion: true`. Consequences: for any handler parameter typed with a **DTO class**, unknown body/query keys → **400** `"property X should not exist"`. Parameters typed as plain TS interfaces / `@Query('name')` primitives are **not** validated at all (noted per endpoint).
- Rate limiting (`429`, message `Too many requests, please try again later`) exists only on `/auth/register`, `/auth/register/send-code`, `/public/*`, admin login — **no endpoint in this domain is rate-limited**.

### 0.5 Match status vocabulary (used by chat/sessions/couple)

`Match.status` (Prisma enum `MatchStatus`) and `Match.mode` (`ROMANTIC` | `FRIEND`, returned lower-cased as `'romantic' | 'friend'` by chat):

| Group | Statuses | Meaning |
|---|---|---|
| TEMP (`sessionType: 'temp'`) | `MATCHED_ROMANTIC`, `ROMANTIC_CONFIRMING`, `MATCHED_FRIEND`, `FRIEND_CONFIRMING` | chat open, 48 h countdown from `Match.createdAt`, confirm entry shown |
| CONFIRMED (`sessionType: 'confirmed'`) | `RELATIONSHIP_ROMANTIC`, `FRIEND_CONFIRMED`, `RELATIONSHIP_MODE` (legacy) | permanent; nudge/background/couple-space allowed (couple space romantic only) |
| READ-ONLY history | `DISSOLVED`, `EXPIRED`, `REJECTED` | messages readable, sending 403, **absent from session list** |
| Deprecated (never written now) | `PENDING_CONFIRM`, `MATCHED` | chat access 403 |

`CONFIRM_WINDOW_MS = 48 h`. A temp match older than 48 h is treated as expired for **sending** even before the cron flips it to `EXPIRED`.

`verifyMatchAccess(matchId, userId)` (chat) error ladder, in order:
- 404 `Match not found`
- 403 `You are not part of this match`
- 403 `This match is not currently available for chat` (only deprecated statuses)

---

## 1. Chat — `ChatController` (`@Controller('chat')`, all JWT)

### 1.1 Shared shape: `Message`

```ts
{
  id: string;            // cuid
  content: string;       // '' for image-only messages (never null); nudge text for kind 'nudge'; 'I love you' for couple love-you
  imageUrl: string | null;
  kind: 'text' | 'nudge';// DB default 'text'; only nudge() writes 'nudge'
  senderId: string;      // userId; compare with my id for bubble side
  isRead: boolean;       // read-by-recipient flag (single flag per message; only meaningful on messages the *other* side sent)
  createdAt: string;     // ISO
}
```

No `matchId`, no `updatedAt`, no sender profile — the client already knows the match/partner.

### 1.2 `GET /chat/sessions` — conversation list

Query (DTO `ConversationSessionsQueryDto`, validated, extra keys → 400):

| param | type | rules |
|---|---|---|
| `mode` | `'romantic' \| 'friend' \| 'all'` | optional, default `all` |
| `limit` | int | optional, 1..100, default 50 (service also clamps to 100) |

No `page`/`cursor` — a hard cap of 100 sessions. H5 always calls `?mode=all&limit=100` (it warns that contact #51 would otherwise be unsearchable).

Server filter: `status IN ALL_CHATTABLE` (TEMP + CONFIRMED) AND `dissolvedAt IS NULL` AND (userA = me OR userB = me) [AND mode]. Order: `Match.updatedAt DESC`. `updatedAt` is touched by send-message, nudge, confirm/dissolve — **not** by mark-read.

Response:

```ts
{
  sessions: Session[];
  total: number;   // == sessions.length (NOT a grand total)
}

Session = {
  matchId: string;
  mode: 'romantic' | 'friend';
  status: MatchStatus;                 // e.g. 'MATCHED_FRIEND'
  sessionType: 'temp' | 'confirmed';
  remainingMs: number | null;          // temp: max(0, createdAt+48h-now); confirmed: null
  myConfirmed: boolean;
  partnerConfirmed: boolean;
  partner: {
    id: string;                        // partner userId
    note: string | null;               // MY private note for this user (settings.notes[partnerId]); show instead of nickname when present
    nickname: string | null;
    avatarUrl: string | null;
    school: string | null;
    gender: string | null;             // free string from Profile ('male' | 'female' | 'non_binary' | 'other' in practice)
    age: number | null;
  };
  lastMessage: Message | null;         // newest message (any kind, any sender)
  unreadCount: number;                 // messages from partner with isRead=false
  chatBackground: string | null;       // MY background image URL for this chat (settings.chatBackgrounds[matchId])
  updatedAt: string;                   // ISO, the sort key
}
```

Empty list → `{ sessions: [], total: 0 }`.

Client notes: countdown must be driven from `remainingMs` captured at fetch time (H5 ticks a 1 s timer locally). Expired/dissolved chats simply disappear from this list; if the app still holds a `matchId` it can keep reading history (§1.3) but sends will 403.

### 1.3 `GET /chat/:matchId/messages` — history (cursor paged, oldest → newest)

Query (`@Query` primitives, **not validated**): `cursor?: string` (id of the last message of the previous page), `limit?: string` (parsed with `parseInt`; default 50; clamped to ≤100). Send integers only — a non-numeric `limit` becomes `NaN` and yields a 500.

Semantics:
- `orderBy createdAt asc`, `take limit`, Prisma `cursor: { id }` + `skip: 1` when `cursor` given. A cursor id that no longer exists yields an empty page (Prisma behaviour) — treat as end.
- **Side effect**: every message in the returned page sent by the partner with `isRead=false` is flipped to `isRead=true`. This does **not** emit an SSE `read` event (only §1.7 does), so after loading history the client should still call `PUT …/messages/read` if it wants the sender's "read" tick to light up in real time (H5 does exactly that: `loadChatHistory` → `markChatRead` → `startChatPolling`).

Response:

```ts
{ messages: Message[]; nextCursor: string | null }   // nextCursor = last id iff page was full (length === limit)
```

Because `nextCursor` is set whenever the page is full, the final page can be a full page followed by one empty page — loop until `nextCursor` is null **or** `messages` is empty. H5 walks the entire history this way (`CHAT_PAGE_SIZE = 50`, max 100 iterations) and renders only the last 30 initially.

H5 also reuses this endpoint for **read receipts**: `?limit=100&cursor=<id of message before my first unread-by-partner message>` and copies `isRead` onto local messages.

### 1.4 `GET /chat/:matchId/messages/poll` — incremental fetch

Query (`@Query` primitive, not validated): `afterId?: string`.

Semantics:
- If `afterId` given: resolve its `createdAt`; **if the anchor message does not exist → `{ messages: [] }`** (no fallback to full history). Returns messages with `(createdAt, id) > (anchor.createdAt, anchor.id)` — compound cursor, so same-millisecond siblings are neither lost nor repeated.
- If `afterId` omitted: returns the **first 50 messages of the conversation (oldest)** — only useful for a brand-new empty conversation.
- `orderBy [createdAt asc, id asc]`, `take 50` fixed. If more than 50 arrived, call again with the last returned id.
- **Side effect**: partner's unread messages in the returned batch are marked read (no SSE emit).

Response: `{ messages: Message[] }` (no cursor field).

Client contract (from H5): keep `lastId` = id of the last message you have; only advance it over messages you actually accepted for the currently open match; de-dupe by id (your own just-sent message will come back through poll too); when a batch contains a fresh partner message with `isRead=false`, call `PUT …/messages/read`. Cadence: every 5 s while the chat is open, **every 30 s when SSE is connected** (SSE `message` event triggers an immediate poll). If a poll is in flight when an SSE event arrives, flag `pending` and re-poll once it finishes.

### 1.5 `POST /chat/:matchId/messages` — send

Body (DTO `SendMessageDto`, validated, extra keys → 400):

| field | type | rules |
|---|---|---|
| `content` | string | optional, `@MaxLength(2000)`; server trims |
| `imageUrl` | string | optional; server trims; empty → null |

Errors:
- 400 `At least one of message content or image is required` (both blank after trim)
- 403 `This chat has ended, you cannot send new messages` — status in {DISSOLVED, EXPIRED, REJECTED} **or** temp status older than 48 h
- 404/403 from `verifyMatchAccess`

Response: the created `Message` (`isRead: false`, `kind: 'text'`, `content` = trimmed text or `''`).

Side effects: `Match.updatedAt = now` (session ordering); SSE `{ type: 'message', matchId }` to the **recipient only** (sender does not get an echo); behaviour event `firstMessage`/`message` logged.

No idempotency key / de-dupe on the server — the client must guard against double taps (H5 keeps an in-flight flag, optimistically clears the composer and restores the draft + pending image on failure).

Image flow: first `POST /uploads/image` (multipart field `file`; JPEG/PNG/GIF/WebP only, ≤ 8 MB; returns `{ url, filename }`; 400 `Only JPEG, PNG, GIF, or WebP images are allowed` / `Please select an image to upload`; oversize → 413 from multer), then send `{ imageUrl: url }` with no `content`. H5 uploads only at the moment of sending.

### 1.6 `GET /chat/:matchId/unread`

Response: `{ unreadCount: number }` (partner-sent, `isRead=false`). Works on read-only statuses too. H5 does not use it (session list already carries `unreadCount`).

### 1.7 `PUT /chat/:matchId/messages/read` — mark all read

No body. Flips every partner-sent unread message in the match to read.

Response: `{ markedRead: number }`.

Side effect: **only when `markedRead > 0`**, SSE `{ type: 'read', matchId }` is sent to the partner (the sender of those messages). Allowed on read-only statuses. H5 de-dupes concurrent calls with an in-flight flag.

### 1.8 `POST /chat/:matchId/nudge` — "pat"

No body. Requires a **CONFIRMED** status, else 403 `Only confirmed chats can use Nudge` (temp and read-only both rejected).

Creates a `Message` with `kind: 'nudge'`, `senderId = me`, `content = "<myNickname> nudged <partnerNickname><suffix>"` where `myNickname` falls back to `Someone`, `partnerNickname` to `them`, and `suffix` is the **partner's** `settings.nudgeSuffix` (the person being nudged decides the tail text, WeChat-style; empty by default). Touches `Match.updatedAt`; SSE `message` to partner.

Response: `{ ok: true, messageId: string, content: string }` — **not** a full `Message`; fetch it via poll (H5 does a poll after nudging). Render `kind === 'nudge'` as a centred grey system line, not a bubble. No cooldown/rate-limit server-side.

### 1.9 `PUT /chat/nudge-suffix` — my nudge suffix (Settings screen)

Body (plain interface, **not validated**): `{ suffix?: string }`. Server takes `suffix || ''` and slices to **40 chars**. Stored in `User.settings.nudgeSuffix` under a row lock.

Response: `{ nudgeSuffix: string }`.

There is no GET; H5 reads the current value from `GET /users/me/settings` (the `settings` JSON also carries `notes`, `chatBackgrounds`, `coupleCovers`, `pushEnabled`, `privacy`). Note the route literal `nudge-suffix` is declared before `:matchId/...` routes; it is unambiguous.

### 1.10 `PUT /chat/:matchId/background` — my chat wallpaper

Body (plain interface, **not validated**): `{ imageUrl?: string | null }`. Falsy (`null`, `''`, missing) → clears.

Requires CONFIRMED status else 403 `Only confirmed chats can set a background`. Per-user (each side sees their own wallpaper); stored in `settings.chatBackgrounds[matchId]`; surfaces as `Session.chatBackground`.

Response: `{ chatBackground: string | null }`.

### 1.11 Related (other controllers, needed by the chat list)

- `PUT /users/me/notes` body (DTO, validated) `{ targetUserId: string; note?: string }` → `{ targetUserId, note: string | null }`; note trimmed and sliced to **30 chars**; empty clears. Appears as `Session.partner.note`.
- `POST /matching/:matchId/confirm-relationship` and `POST /matching/:matchId/dissolve { reason }` are called from the chat header (temp sessions) — owned by the matching map; after either, reload `/chat/sessions`.

---

## 2. Realtime — `GET /realtime/stream` (SSE)

### 2.1 Connect

- `GET /realtime/stream?token=<JWT>` — `@Public()`; the JWT goes in the **query string** (EventSource cannot set headers; iOS can send the header but the server only reads `?token=`).
- Server verifies with `JWT_SECRET`; requires `payload.role === 'user'` and `payload.sub`; then re-checks the user row: missing or `status === 'BANNED'` → reject.
- Rejection: HTTP **401** with body **`{ "message": "Unauthorized" }`** — *not* the standard envelope (the route bypasses the interceptor/filter by writing the response manually). On 401 the client must **stop** (do not reconnect; refresh token / log out).
- Success: `200`, headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`; headers are flushed immediately and the first frame is sent at once.

### 2.2 Frame format

Every frame is a default-type SSE `data:` line with a JSON object, terminated by a blank line. **No `event:` names, no `id:` lines** (so `Last-Event-ID` resume is impossible — after any reconnect, refetch via REST). Heartbeat is an SSE **comment** line `: ping` every **25 s** (ignore it; use it as a liveness signal — if nothing arrives for ~60 s, assume dead and reconnect).

| frame | when | payload |
|---|---|---|
| `data: {"type":"ready"}` | immediately after connect | client flips to "SSE up" and downshifts polling |
| `data: {"type":"message","matchId":"<id>"}` | a message/nudge/love-you was created **for me** in that match | if that chat is open → poll now; also refresh session list (throttled) |
| `data: {"type":"read","matchId":"<id>"}` | partner called `PUT …/messages/read` and ≥1 message flipped | if that chat is open → refresh read receipts |
| `data: {"type":"notification"}` | a notification was created for me (no further fields) | refresh notification list/badge (throttled) |
| `data: {"type":"evicted"}` then EOF | I opened a 6th concurrent stream; the **oldest** stream gets this and is closed | **do not reconnect** from that connection; stay on full-rate polling |

Events are **invalidation signals only** — never carry the data. Always follow up with the REST call. Events are process-local and unbuffered: if I'm not connected at emit time the event is dropped (polling is the fallback).

### 2.3 Limits and lifecycle

- Max **5** open streams per user; the 6th evicts the oldest (with the `evicted` frame first).
- Server cleans up on socket `close`. Client must close the stream on logout/401 (H5 `stopRealtime`), and cancel any pending throttled refreshes so no token-less requests fire after logout.
- Native reconnect policy (no EventSource on iOS): reconnect with backoff on network error / EOF **except** after `evicted` or a 401; on every (re)connect wait for `ready` before downshifting pollers; while disconnected keep full-rate polling.
- Throttling used by H5 (recommended): `message` → session-list reload throttled 3 s leading+trailing; `notification` → notification refresh throttled 3 s leading+trailing.

### 2.4 Who emits what (so the client knows what SSE does *not* cover)

`message`: `chat.sendMessage`, `chat.nudge`, `couple.sendLoveYou` — all to the partner only.
`read`: `chat.markRead` only (not by GET messages / poll side-effect reads).
`notification`: matching results (`match_result`, `no_match`), `relationship_confirmed`, `relationship_dissolved` (to the other party), `match_expired`, `friend_added` (connect-code add), square `comment`/reply/`like`, couple `milestone`, anything routed through `NotificationService.createNotification/createManyNotifications`.
**Not** emitted (rely on polling ≤ 60 s): `energy_refunded` (written inside a shared transaction helper), admin poll review `system` notifications.

### 2.5 Poll cadence with/without SSE (H5 reference)

| poller | SSE down | SSE up |
|---|---|---|
| open chat `messages/poll` | 5 s | 30 s |
| notification list + badge (only while the notification panel is open) | 15 s | 60 s |
| session list | on view enter + on `message` events (throttled) | same |
| read receipts | every 3rd chat poll (via GET messages) | on `read` event |

---

## 3. Notifications — `NotificationController` (`@Controller('notifications')`, all JWT)

### 3.1 Shape: `Notification`

```ts
{
  id: string;
  type: string;                  // see 3.6 inventory
  title: string;                 // English, fixed enum-like strings
  body: string;                  // English sentence (may embed nicknames / numbers)
  isRead: boolean;
  createdAt: string;             // ISO
  metadata: object | null;       // per-type, see 3.6
}
```

`userId` is not returned. The server always writes **English**; H5 localises client-side by exact title match + regex on body (§3.7). iOS must do the same.

### 3.2 `GET /notifications?page=&limit=`

Query (`@Query` primitives, implicit number conversion, **no validation, no max**): `page` default 1 (`page || 1`, so `0`/NaN → 1), `limit` default 20 (`limit || 20`). Offset pagination `skip = (page-1)*limit`, ordered `createdAt desc`.

Response:

```ts
{ items: Notification[]; total: number; unread: number; page: number; limit: number }
```

`hasMore = page * limit < total` (H5 uses `NOTIF_PAGE_SIZE = 20`). H5 refresh strategy: re-fetch pages 1..N that the user already expanded, merge by id; badge from §3.3.

### 3.3 `GET /notifications/unread-count`

Response: `{ unreadCount: number }`. H5 shows `99+` above 99.

### 3.4 `PUT /notifications/read` — mark all read

No body. Response: `{ success: true }` (so the envelope is `{ success: true, data: { success: true }, … }`).

### 3.5 `PUT /notifications/:id/read` — mark one read

No body. `updateMany({ id, userId })` — **never 404**: an unknown or foreign id returns `{ success: true }` with nothing changed. Route `read` is declared before `:id/read`, so the literal wins.

H5 behaviour: tapping a row opens a detail sheet and marks that one read; no deep-link navigation from `metadata` is implemented (metadata is currently unused by the H5 UI except `energy_refunded` handling below).

### 3.6 Notification type inventory (producer → exact title / body / metadata)

| `type` | title | body | metadata | producer / recipient |
|---|---|---|---|---|
| `match_result` | `Your match is here` (romantic) / `New friend match` (friend) | `Great news! We found a match for you. Head to Chat and start the conversation!` / `We found a friend who's on your wavelength. Head to Chat and say hi!` | `{ matchId, mode }` | weekly match job, both users |
| `no_match` | `No match this round` | `We couldn't find a great match for you this round. Hang tight and check back next round!` | `{ mode }` | match job, unmatched pool members |
| `relationship_confirmed` | `You're now a couple` / `You're now friends` | `You've both confirmed — your relationship is official!` / `You've both confirmed — you're friends now!` | `{ matchId, mode }` | second confirm, both users |
| `relationship_dissolved` | `Relationship ended` / `Friendship ended` | `<nickname> ended your relationship.` / `<nickname> ended your friendship.` | `{ matchId, mode }` | dissolve, **other party only** |
| `match_expired` | `Match expired` | `This match expired because it was not confirmed by both of you within 48 hours.` | `{ mode }` (no matchId) | expiry cron, both users |
| `friend_added` | `New friend` | `Someone connected with you — open the chat and say hi!` | `{ matchId, mode: 'friend' }` | connect-code add, the scanned user |
| `energy_refunded` | `Energy refunded` | `Your enhanced match wasn't confirmed within 48 hours, so N energy cell(s) has/have been refunded.` / `The event was cancelled, so N energy …` / `No match was available this round, so N energy …` | `{ mode, energy: number, refundReason: 'unconfirmed_48h' \| 'event_cancelled' \| <other>, matchId: string \| null, dedupeKey?, …extra }` | energy refund helper |
| `comment` | `New comment` | `<actorName> commented on your post` | `{ postId, commentId }` | square comment → post author |
| `comment` | `New reply` | `<actorName> replied to your comment` | `{ postId, commentId }` | square reply → parent comment author |
| `like` | `New like` | `<actorName> liked your post` | `{ postId, actorId }` | first like per (post, actor) only |
| `system` | `Poll approved` / `Poll rejected` | `Your poll "<label>" is now live on the campus wall.` / `Your poll "<label>" was not approved.` + optional ` Reason: <note>` | `{ postId }` | admin poll review |
| `milestone` | `A secret unlocked` | `You and <nickname> have each said "I love you" 100 times. Here is to many more.` | `{ kind: 'love_you_100', matchId }` | couple love-you, both users, once per match |

Privacy: for anonymous square activity `actorName` is the per-post animal alias (never the real nickname) and `like.metadata.actorId` is an opaque HMAC token rather than a userId — **never treat `actorId` as a user id or try to open a profile from it**. The Prisma comment on `Notification.type` (`'dissolve'` etc.) is stale; the table above is what is actually written.

### 3.7 Client localisation / icon map (H5 reference, replicate on iOS)

Icons by type: `like→favorite`, `comment→chat_bubble`, `match_result→auto_awesome`, `no_match→hourglass_empty`, `match_expired→hourglass_disabled`, `energy_refunded→bolt`, everything else → `info`. "Filled" tint for `like` and `match_result`. Chinese titles/bodies: exact-match dictionary on the title strings above and regex patterns on the bodies (capture nickname / number / poll label / reason). On `energy_refunded` H5 additionally refreshes the energy balance.

---

## 4. Couple space — `CoupleController` (`@Controller('couple')`, all JWT)

### 4.1 Access rule (`assertMember`), checked by every endpoint in order

1. 404 `Relationship not found` — no such match id
2. 403 `Not a valid partner relationship` — `status ∉ { RELATIONSHIP_ROMANTIC, RELATIONSHIP_MODE }` **or** `dissolvedAt` set (friend matches are rejected here — couple space is romantic-only)
3. 403 `No access to this Couple Space` — I am neither userA nor userB

### 4.2 Shape: `CoupleSpace` — returned by **GET and by every mutation** (each write returns the fresh full space; the client should just replace its model)

```ts
{
  matchId: string;
  daysTogether: number | null;      // floor((now - since) / 1d), ≥ 0; null only if no anchor (practically never)
  since: string | null;             // ISO anchor = relationshipStartedAt ?? confirmedAt ?? createdAt
  partner: { userId: string; nickname: string /* 'Partner' fallback */; avatarUrl: string /* '' fallback */; bio: string /* '' */ };
  me: { userId: string };
  cover: string;                    // MY cover URL for this space ('' if unset) — per-user, partner has their own
  loveYou: {
    me: { count: number; sentToday: boolean };   // sentToday compares loveYouDate to the server's UTC calendar day
    partner: { count: number };
  };
  status: { me: string; partner: string };       // today's mood/status text, '' default
  craving: {
    me: { current: string; history: string[] };  // history: case-insensitive de-duped, newest first, max 8
    partner: { current: string };
  };
  schedule: {
    me: Sched[]; partner: Sched[];               // ordered startAt DESC
  };
  gifts: { me: string[]; partner: string[] };    // Profile.wishGifts (partner's gift jar is only visible here)
  anniversaries: Anniv[];                        // ordered date ASC
  bucket: Bucket[];                              // ordered createdAt ASC
}

Sched  = { id: string; text: string; startAt: string; endAt: string; expired: boolean /* endAt < now */ }
Anniv  = { id: string; title: string; date: string /* ISO */; note: string /* '' */; images: string[] /* legacy single `image` folded in */; daysUntil: number /* ceil((date-now)/1d); negative when past */ }
Bucket = { id: string; text: string; done: boolean; createdBy: string /* userId */; doneBy: string | null; doneNote: string /* '' */; doneImages: string[] /* legacy doneImage folded in */ }
```

All body DTOs below are classes → unknown keys are **400**. Every mutation response is the full `CoupleSpace`.

### 4.3 Endpoints

| # | Method & path | Body | Rules / errors | Notes |
|---|---|---|---|---|
| 1 | `GET /couple/:matchId` | — | §4.1 | aggregate read |
| 2 | `PUT /couple/:matchId/cover` | `{ imageUrl?: string \| null }` (`@IsOptional @IsString`; `null` passes) | falsy → clears | stored in `settings.coupleCovers[matchId]`, per-user |
| 3 | `POST /couple/:matchId/love-you` | none | 400 `Already sent today, come back tomorrow` (atomic per UTC day) | on success: writes a chat `Message { content: 'I love you', kind: 'text' }` from me, SSE `message` to partner; when **both** counts ≥ 100 creates one `milestone` notification per user (idempotent per match) + SSE `notification` |
| 4 | `PUT /couple/:matchId/status` | `{ status: string }` (required string; `''` allowed = clear) | — | upsert of my `CoupleMemberState.status` |
| 5 | `POST /couple/:matchId/craving` | `{ text: string }` | 400 `Content is required` if blank after trim | appends to history; `current` = newest |
| 6 | `POST /couple/:matchId/schedule` | `{ text: string; startAt: string; endAt: string }` | 400 `Content is required` / `Start and end time are required` / `Invalid time` / `End time cannot be earlier than start time` | times parsed with `new Date(str)`; H5 sends `YYYY-MM-DDTHH:mm` (no zone → interpreted in the server's zone, UTC in prod). iOS should send full ISO-8601 with offset |
| 7 | `DELETE /couple/:matchId/schedule/:id` | — | only **my own** entry; foreign/unknown id is a silent no-op | |
| 8 | `POST /couple/:matchId/anniversary` | `{ title: string; date: string }` | 400 `Title and date are required` / `Invalid date format` | `createdBy = me` |
| 9 | `PATCH /couple/:matchId/anniversary/:id` | `{ title?, date?, note?, image?, images?: string[] }` all optional strings (`images` array of strings) | 400 `Invalid date format`; either partner may edit; unknown id → silent no-op | H5 sends `{ title, date, note, images }`; `note: ''` → stored null → returned `''` |
| 10 | `DELETE /couple/:matchId/anniversary/:id` | — | either partner; silent no-op if unknown | |
| 11 | `POST /couple/:matchId/bucket` | `{ text: string }` | 400 `Content is required` if `''` (no trim) | `createdBy = me` |
| 12 | `PATCH /couple/:matchId/bucket/:id` | `{ done: boolean (required); note?; image?; images?: string[] }` | either partner | `done:true` → `doneBy = me`, `doneNote = note ?? null`, `doneImages = images.length ? images : (image ? [image] : [])`; `done:false` → clears all done fields |
| 13 | `DELETE /couple/:matchId/bucket/:id` | — | 400 `Completed plans cannot be deleted` when `done`; unknown id → returns space, no error | |

Images for cover/anniversary/bucket go through `POST /uploads/image` first (§1.5) and the returned absolute URL is sent as a string.

"End relationship" from the couple screen calls `POST /matching/:matchId/dissolve` (matching map), after which every couple endpoint returns 403 `Not a valid partner relationship`.

---

## 5. Data-model notes an implementer needs

- `Message.isRead` is a single boolean on the message row; "read receipts" for my own messages = `isRead` on messages where `senderId == me`. The server flips it in three places: GET history page, poll batch, `PUT …/read` — only the last one broadcasts a `read` SSE event.
- `Match.updatedAt` drives session ordering; loading history / marking read does not reorder.
- Per-user JSON `User.settings` holds `nudgeSuffix`, `chatBackgrounds{matchId→url}`, `coupleCovers{matchId→url}`, `notes{userId→text}` (plus `pushEnabled`, `privacy`). All writes go through a `SELECT … FOR UPDATE` read-modify-write, so partial updates from different screens never clobber each other.
- `CoupleMemberState` unique on `(matchId, userId)`; `loveYouDate` is `YYYY-MM-DD` in **UTC**.
- Couple `date` fields (`CoupleAnniversary.date`, schedule `startAt/endAt`) are `DateTime`; the API returns ISO strings even though H5 sends date-only / local-time strings.

## 6. Privacy rules the client must respect

- Session list exposes partner `gender`, `age`, `school` — fine to show in the chat header (H5 shows school) but do not surface elsewhere.
- Partner `wishGifts` and `bio` are only obtainable via the couple space (romantic, confirmed).
- Anonymous square notifications: display `actorName` from the body verbatim; `like.metadata.actorId` is not a user id.
- The SSE token is in the URL — use HTTPS only; never log the stream URL.
- `Message` carries only `senderId`; never render or cache partner identity from messages — take it from the session.
