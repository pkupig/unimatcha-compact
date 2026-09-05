# API contract map — domain `auth-users-profiles`

Source of truth (read 2026-09-03, git `main` @ 0615f54):

- `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- `apps/api/src/common/{filters/http-exception.filter.ts, interceptors/transform.interceptor.ts, guards/jwt-auth.guard.ts, decorators/*}`
- `apps/api/src/auth/{auth.controller.ts, auth.service.ts, dto/auth.dto.ts, strategies/jwt.strategy.ts}`
- `apps/api/src/public/public-rate-limit.guard.ts`, `apps/api/src/mail/mail.service.ts`
- `apps/api/src/users/{users.controller.ts, users.service.ts}` (admin controller/service skipped — admin-only)
- `apps/api/src/profiles/{profiles.controller.ts, profiles.service.ts, dto/profile.dto.ts}`
- `apps/api/src/uploads/uploads.controller.ts`
- `apps/api/src/metadata/{metadata.controller.ts, metadata.service.ts, seed/*.json}`
- `apps/api/src/discovery/discovery.service.ts` (only for the `/users/search` response shape)
- `apps/api/src/prisma/prisma.service.ts`, `apps/api/prisma/schema.prisma` (User, Profile, EmailVerificationCode, UserModeState, SystemConfig, Match, MatchConfig, Answer), `apps/api/prisma/seed.ts` (public_profile_fields)
- H5 call sites (to record what the current client actually sends/reads): `apps/h5/src/state.js`, `apps/h5/src/modules/{core.js, auth.js, profile.js, settings.js, match.js, addfriend.js}`, `apps/h5/index.html`

Everything below is derived from those files; nothing is guessed. Where the H5 client behaviour matters for a 1:1 port it is called out in a "H5 behaviour" block.

---

## 0. Global conventions (apply to EVERY endpoint)

### 0.1 Base URL / prefix

- Global prefix: **`/api/v1`** (`app.setGlobalPrefix('api/v1')`).
- Production API host: `https://api.unimatcha.ai` → base `https://api.unimatcha.ai/api/v1`.
  H5 derives it as `https://api.<hostname without "app.">/api/v1`; on `localhost` / `127.0.0.1` / bare IP it uses `http://<host>:3001/api/v1`. The existing iOS app already carries `API_BASE_URL` in Info.plist — keep that pattern.
- **Uploaded files are NOT under the prefix**: they are served at `https://api.unimatcha.ai/uploads/<uuid>.<ext>` (Express static, headers `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`). The upload endpoint returns the absolute URL; just load it.
- Swagger UI: `/api/docs` (not behind auth).

### 0.2 Success envelope (TransformInterceptor, global)

Every 2xx response body is:

```json
{ "success": true, "data": <handler return value>, "message": <string|absent>, "timestamp": "2026-09-03T10:00:00.000Z" }
```

- `data` is exactly the object the handler returned (unless that object itself has a `data` key, in which case `data.data` is unwrapped — **no endpoint in this domain does that**).
- `message` at the top level is copied from `data.message` when present; it is **not removed from `data`**, so e.g. send-code responses have `message` in both places.
- When decoding in Swift: `struct Envelope<T: Decodable> { let success: Bool; let data: T; let message: String?; let timestamp: String }`.

### 0.3 Error body (HttpExceptionFilter, global — catches everything)

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Incorrect verification code",   // string OR array of strings (see below)
  "errors": null,
  "timestamp": "2026-09-03T10:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

- **`message` is `[String]` for DTO validation failures** (class-validator via global `ValidationPipe`) — e.g. `["Please enter a valid email address", "property foo should not exist"]`. For every other error it is a plain string. Decode as `enum StringOrArray`. The H5 does `data.message || 'API 500'` (an array stringifies with commas).
- `errors` is always `null` in practice.
- Unhandled exceptions → 500 `"Internal server error"`.

### 0.4 Global ValidationPipe rules (affect every JSON body / query)

`whitelist: true, forbidNonWhitelisted: true, transform: true, enableImplicitConversion: true`:

- **Any key not declared in the DTO → 400** with message `"property <key> should not exist"`. Never echo back objects you received (e.g. don't PUT `/profiles/me` with `id`, `userId`, `profileCompleteness`, `createdAt`…). Send only the fields listed per endpoint.
- Query params are implicitly converted (e.g. `"20"` → `20`).
- Optional fields: omit the key entirely to leave the stored value untouched. Sending `null` for an `@IsOptional` field passes validation but is then **written to the DB as NULL** (the key is present in the body) — i.e. `null` clears, it does not mean "unchanged". The H5 never sends null; it omits keys or sends `""`.

### 0.5 Authentication

- Header: `Authorization: Bearer <jwt>`.
- JWT is HS256 signed with `JWT_SECRET`; payload `{ sub: <userId>, email, role: "user", iat, exp }`; lifetime `JWT_EXPIRES_IN` (compose default **7d**). **There is no refresh endpoint** — after expiry every call is 401 and the user must log in again.
- Same token is also used for SSE: `GET /api/v1/realtime/stream?token=<jwt>` (query param, because EventSource can't set headers — realtime domain, mentioned here only because it's the same token).
- Guarded routes use `@UseGuards(JwtAuthGuard)` per controller (there is **no global APP_GUARD**). `JwtStrategy.validate` rejects with **401** when: token missing/invalid/expired (`"Unauthorized"`), `role !== 'user'` (admin tokens are rejected on user routes), user row missing (`"User not found or has been deactivated"`), or `user.status === 'BANNED'` (`"Your account has been banned"`).
- Public (no token) endpoints in this domain: `POST /auth/register/send-code`, `POST /auth/register`, `POST /auth/login`. Everything else needs the token.

**H5 behaviour on 401 (mirror this):** remove stored token (`localStorage.cl_token`), stop match/chat/notification polling + SSE + countdown ticker, wipe all user-scoped state, close all overlays, show the auth page, and throw so the caller's catch runs. On iOS: delete Keychain token, cancel background tasks, reset stores, pop to login.

### 0.6 Rate limiting

- `POST /auth/register/send-code` and `POST /auth/register`: in-memory per-IP bucket, **30 requests / 60 s** (`AuthCodeRateLimitGuard`). Over limit → **429** `"Too many requests, please try again later"` (standard error body). No `Retry-After` header.
- Nothing else in this domain is rate limited at HTTP level; abuse protection for codes is per-code (5 attempts) + 60 s resend cooldown (see endpoints).

### 0.7 HTTP status codes

- GET / PUT → 200. POST → **201** by default (Nest), except those explicitly `@HttpCode(200)`: `/auth/register/send-code`, `/auth/login`, `/auth/change-password`. So `POST /auth/register`, all `POST /users/me/verification/*`, all `POST /uploads/*` return **201**. Treat any 2xx as success.

### 0.8 Content types

- JSON bodies: `Content-Type: application/json`. H5 also sends `cache: 'no-store'` (browser concern only).
- `POST /uploads/image` is `multipart/form-data` with a single file part named **`file`**.

---

## 1. Data model reference (Prisma) — what backs the responses

### 1.1 `User` (`users`)

| column | type | notes |
|---|---|---|
| id | String (cuid) | |
| email | String, unique | stored trimmed+lowercased for accounts registered since 2026-08-31; older rows may have original casing |
| passwordHash | String | bcrypt cost 12 — never returned |
| status | enum `ACTIVE` \| `BANNED` | |
| verificationStatus | String | `"unverified"` \| `"pending"` \| `"verified"` \| `"rejected"` (plain string, default `unverified`) |
| studentCardUrl | String? | student-card photo URL (admin review) — never returned to the user |
| schoolEmail | String? | set on send-code, confirmed on submit — not returned |
| verifyCode / verifyCodeExpiresAt / verifyCodeAttempts | | transient student-verification code — never returned |
| connectCode | String?, unique | `"CL" + 8 uppercase base36 chars`, lazily generated |
| settings | Json? | `{ pushEnabled, privacy:{…}, notes:{[userId]:string}, chatBackgrounds:{[matchId]:url}, coupleCovers:{[matchId]:url}, nudgeSuffix:string }` — sibling keys are owned by chat/couple domains |
| createdAt / updatedAt | DateTime | `createdAt` is exposed as `joinedAt` |

### 1.2 `Profile` (`profiles`) — 1:1 with User, cascade delete

| column | type | validation on write (CreateProfileDto) | visibility |
|---|---|---|---|
| id | String | — (server) | self only |
| userId | String | — | self (and `userId` is echoed in public-profile) |
| nickname | String? | `@IsString` | public |
| realName | String? | `@IsString` | self + confirmed connections only |
| familyName / givenName | String? | `@IsString` | self only (`/users/me`, `/profiles/me`) |
| school | String? | `@IsString` (free text; H5 uses metadata list) | public |
| grade | String? | `@IsString` — **not enum-enforced**; canonical values in §6.2 | public |
| gender | String? | `@IsEnum` `male` \| `female` \| `non_binary` \| `other` — **empty string is rejected (400)** | self only |
| genderPref | String? | `@IsEnum` `male` \| `female` \| `any` | self only |
| age | Int? | `@IsInt @Min(16) @Max(40)` | public |
| birthday | String? | regex `^\d{4}-\d{2}-\d{2}$` (message `birthday must be YYYY-MM-DD`) | self only |
| city | String? | `@IsString` | public |
| interests | String[] | `@IsArray @IsString({each})` | public |
| bio | String? (Text) | `@IsString` (H5 caps at 250 chars client-side; server has no cap) | public |
| avatarUrl | String? | `@IsString` (any string; server does not validate URL) | public |
| socialLinks | Json? | `@IsObject` `Record<string,string>` e.g. `{wechat, qq, xiaohongshu, weibo, instagram}` | self + confirmed connections |
| signature | String? (Text) | `@IsString @MaxLength(100)` | self + connections (not in seeded stranger list) |
| coverUrl | String? | `@IsString` | self + confirmed connections (stripped for strangers) |
| tags | String[] | `@IsArray @IsString({each}) @ArrayMaxSize(10) @MaxLength(20, {each})` | public |
| major | String? | `@IsString` | self + connections (not in seeded stranger list) |
| mbti | String? | `@IsString` — not enum-enforced (list in §6.3) | self + connections |
| nationality | String? | `@IsString` | self + connections |
| studentId | String? | `@IsString @MaxLength(32)` | **self only** |
| realPhotos | String[] | `@IsArray @IsString({each}) @ArrayMaxSize(6)` | self + confirmed connections |
| zodiac | String? | `@IsString` | self + connections |
| wishGifts | String[] | `@IsArray @IsString({each}) @ArrayMaxSize(5)` | self only (in `/users/me` and `/profiles/me`; not in any public projection) |
| extraData | Json? | — | self (`/profiles/me` only) |
| relationshipScore | Float (default 0) | — | self + connections |
| profileCompleteness | Int 0..100 | — (server computed) | self |
| createdAt / updatedAt | DateTime | — | self (`/profiles/me`) |

**profileCompleteness** = `round(filled / 16 * 100)` over the 16 fields `nickname, school, grade, gender, genderPref, age, city, interests, bio, avatarUrl, signature, tags, major, mbti, nationality, zodiac` (array counts if non-empty; strings if non-empty). Computed on the merge of *existing row + incoming body*, so partial updates never lower it artificially.

### 1.3 `EmailVerificationCode` (`email_verification_codes`)

`{ email, purpose:'register', code (6 digits), expiresAt, attempts }`, unique on `(email, purpose)`. One live code per email; re-send replaces the code and resets `attempts` to 0.

### 1.4 `UserModeState` (`user_mode_states`) — surfaced in `/users/me.modeStates`

`{ mode: "romantic"|"friend", matchState: "idle"|"searching"|"matched"|"confirming"|"relationship"|"no_match", matchSearchingSince: DateTime? }`, unique `(userId, mode)`. Rows are created lazily by the matching domain — a fresh user has **zero** entries.

### 1.5 `SystemConfig` key `public_profile_fields`

Seeded (and **re-applied on every container start** via `update`) as:
`["nickname","school","grade","age","city","interests","bio","avatarUrl","coverUrl","tags"]`.
It drives the stranger projection of `GET /users/:id/public-profile` (§3.10). If the row were missing, code falls back to `STRANGER_SAFE_FIELDS` = `nickname, school, grade, age, city, interests, bio, avatarUrl, signature, tags, major, mbti, nationality, zodiac`. In production the seeded list wins → strangers do NOT get signature/major/mbti/nationality/zodiac.

---

## 2. Auth endpoints (`/api/v1/auth/*`)

### 2.1 `POST /auth/register/send-code` — public, 200, rate-limited 30/min/IP

Body (`RegisterSendCodeDto`):

| field | type | rule |
|---|---|---|
| email | string | `@IsEmail` → `"Please enter a valid email address"` |

Server normalises `trim().toLowerCase()`.

Responses:

- **200** (SMTP configured — this is production):
  `{ "message": "Verification code sent to your email", "expiresInSec": 600 }`
- **200** (dev, no SMTP, `NODE_ENV != production`):
  `{ "message": "Verification code sent (dev mode: no email service configured, code shown below)", "devCode": "483920", "expiresInSec": 600 }`
- **409** `"This email is already registered"` (checked before anything else — email enumeration is accepted by design, same message as register).
- **400** `"Please wait a moment before requesting another code"` — 60 s resend cooldown measured from the previous code's *issue time* (`expiresAt − 10 min`).
- **503** `"Email service is not configured"` (production with MAIL_* missing) / `"Failed to send verification email, please try again later"` (SMTP failure). In both 503 cases the code row is deleted so the user can retry immediately (no cooldown lock-out).
- **429** rate limit.

Semantics: 6-digit code `randomInt(100000, 1000000)`, valid 10 min. Resend after cooldown issues a new code and resets attempts.

**H5 behaviour:** button "Send code" → disabled + label `"Sending…"` → on success toast "Code sent" / hint line under the code field (`devCode` shown verbatim in dev, otherwise "Code sent to your email, valid for 10 minutes"), then button shows a **60 s countdown `"59s"…"1s"`** (language-neutral) and returns to "Send code". On failure button re-enabled immediately, toast `"Failed to send: <message>"`.

### 2.2 `POST /auth/register` — public, **201**, rate-limited 30/min/IP

Body (`RegisterDto`):

| field | type | rule / message |
|---|---|---|
| email | string | `@IsEmail` `"Please enter a valid email address"` |
| password | string | `@MinLength(8)` `"Password must be at least 8 characters"`, `@MaxLength(64)` (default message `password must be shorter than or equal to 64 characters`) |
| code | string | `@Length(6,6)` `"Please enter the 6-digit verification code"` |

Order of server checks (each is a 4xx):

1. **409** `"This email is already registered"`.
2. **400** `"Please request an email verification code first"` (no code row for this email).
3. **400** `"Verification code has expired, please request a new one"`.
4. Atomically claims one attempt slot (`attempts < 5`); none left → **400** `"Too many incorrect attempts, please request a new code"`. **Every register call consumes a slot, even a correct one**, so 5 wrong tries kill the code and the user must re-send.
5. **400** `"Incorrect verification code"`.
6. Creates the user (bcrypt 12); a concurrent duplicate → **409** same message.
7. Deletes the code row (one-time use).

**201** response:

```json
{
  "user": { "id": "clx…", "email": "a@b.ac.uk", "status": "ACTIVE", "createdAt": "2026-09-03T…Z" },
  "token": "<jwt>"
}
```

No Profile row exists yet → the client must route to profile setup. Token is immediately usable.

**H5 behaviour:** client-side pre-checks before calling: all fields non-empty, password ≥ 8, password == confirm (toasts `"Password must be at least 8 characters"`, `"Passwords do not match"`). On success: store token, `S.currentUser = data.user`, start SSE, `showPage('page-profile-setup')`. On failure toast `"Registration failed: <message>"`.

### 2.3 `POST /auth/login` — public, 200

Body (`LoginDto`): `{ email: string (@IsEmail), password: string (@IsString) }`.

- Lookup exact email, then lowercase fallback (legacy accounts).
- Password is checked **before** ban status (no enumeration via ban message).

**200** response:

```json
{
  "user": {
    "id": "clx…",
    "email": "a@b.ac.uk",
    "status": "ACTIVE",
    "hasProfile": true,               // Profile ROW exists (not "nickname set" — see surprise S3)
    "profileCompleteness": 62         // 0 when no profile
  },
  "token": "<jwt>"
}
```

- **401** `"Incorrect email or password"` (wrong email or wrong password — same text).
- **401** `"Your account has been banned, please contact support"`.

**H5 behaviour:** stores `data.token`, sets `S.currentUser = data.user`, then immediately calls `checkUserState()` (§5.1) which re-fetches `/users/me` and decides the landing page — i.e. the login response's `hasProfile` is **not** used for routing.

### 2.4 `POST /auth/change-password` — JWT, 200

Body (`ChangePasswordDto`): `{ currentPassword: string, password: string (8..64) }`.

- **200** `{ "message": "Password updated" }`
- **400** `"Current password is incorrect"` / `"Password must be at least 8 characters"`
- **401** `"User not found"`

Existing tokens stay valid after a change (no revocation).

**H5 behaviour:** two sequential prompt cards ("Current password" → Next, "New password" → Change); client rejects empty current or new < 8 chars; toast `"Password changed"`.

### 2.5 Logout

**No server endpoint.** H5 logout = confirm card ("Log out of Unimatcha?" / "Log Out", destructive) → stop pollers → delete token → wipe state → auth page.

### 2.6 Not in this domain but under `/auth`

`POST /admin/auth/login`, `GET /admin/auth/invite-info`, `POST /admin/auth/register-sponsor`, `GET /admin/auth/me` — admin console only (different JWT secret, `role:'admin'`). Ignore for the iOS app.

---

## 3. Users endpoints (`/api/v1/users/*`) — all JWT

### 3.1 `GET /users/me` — the app's identity/bootstrap call

**200** response (exact select):

```jsonc
{
  "id": "clx…",
  "email": "a@b.ac.uk",
  "status": "ACTIVE",                       // "ACTIVE" | "BANNED" (BANNED never reaches here — 401 first, see S2)
  "verificationStatus": "unverified",       // "unverified" | "pending" | "verified" | "rejected"
  "createdAt": "2026-09-03T…Z",
  "modeStates": [                           // 0..2 entries; absent mode == "idle"
    { "mode": "romantic", "matchState": "searching", "matchSearchingSince": "2026-09-01T…Z" },
    { "mode": "friend",   "matchState": "idle",      "matchSearchingSince": null }
  ],
  "profile": null | {                       // null until PUT /profiles/me or POST /uploads/avatar creates a row
    "nickname": "晓月", "realName": "Xiaoyue Zhang", "familyName": "Zhang", "givenName": "Xiaoyue",
    "school": "University of Warwick", "grade": "Year 2", "gender": "female",
    "genderPref": "any", "age": 21, "city": "Coventry", "interests": ["Music"],
    "bio": "…", "avatarUrl": "https://api.unimatcha.ai/uploads/….jpg", "socialLinks": null,
    "relationshipScore": 0, "profileCompleteness": 62,
    "signature": "…", "coverUrl": null, "tags": ["猫奴"],
    "major": "Computer Science", "mbti": "INFP", "nationality": "Chinese",
    "realPhotos": [], "zodiac": null,
    "wishGifts": [], "studentId": null, "birthday": "2004-06-01"
  },
  "hasProfile": true,                       // profile != null && profile.nickname truthy
  "completedQuestionnaire": false           // any Answer row for this user (any questionnaire/mode)
}
```

Not included: `settings`, `connectCode`, `schoolEmail`, `studentCardUrl`, profile `id/userId/extraData/createdAt/updatedAt`.
**404** `"User not found"` (token valid but row gone — practically unreachable because the JWT strategy already 401s).

### 3.2 `PUT /users/me` — alias of `PUT /profiles/me`

Same DTO, same service call, same response (full Profile row). See §4.2. H5 uses `/profiles/me`.

### 3.3 `GET /users/me/match-status` — legacy (romantic mode only)

Not called by the H5 (it uses `/matching/status?mode=`). Documented for completeness:

```jsonc
{
  "mode": "romantic",
  "matchState": "idle",                        // from UserModeState, default "idle"
  "matchSearchingSince": null,
  "matchConfig": { "cronExpr": "0 17 * * 5", "description": "…" } | null,
  "currentMatch": { "id": "clx…", "status": "MATCHED_ROMANTIC" } | null,   // latest non-terminal romantic Match
  "isSearching": false
}
```

### 3.4 `GET /users/me/settings`

**200** — stored settings merged with defaults (unknown/non-boolean values replaced by defaults):

```json
{
  "pushEnabled": true,
  "privacy": {
    "showProfile": true,
    "showOnline": true,
    "showMoments": true,
    "searchable": true,
    "discoverable": false
  }
}
```

`DEFAULT_SETTINGS` and meaning:

| key | default | effect |
|---|---|---|
| `pushEnabled` | `true` | Stored only. **No backend consumer** (no push infrastructure exists; Web Push is a backlog item). Client-side preference. |
| `privacy.showProfile` | `true` | `false` → strangers calling `GET /users/:id/public-profile` get only `{nickname, avatarUrl, hidden:true}`. Confirmed connections and self are unaffected. |
| `privacy.showOnline` | `true` | Stored only — **nothing reads it** server-side. |
| `privacy.showMoments` | `true` | Stored only — **nothing reads it** server-side. |
| `privacy.searchable` | `true` | `false` → excluded from `/discovery/users` and `/users/search` results (except exact connect-code hits, which bypass it). **Removed from the H5 settings UI on 2026-08-19** (product decision); backend still honours it. |
| `privacy.discoverable` | `false` | Both viewer and candidate must be `true` to appear in `/discovery/suggestions` ("people you may know"). **Removed from H5 UI** as well; backend still honours it. |

**H5 settings page shows exactly four toggles:** `pushEnabled`, `privacy.showProfile`, `privacy.showOnline`, `privacy.showMoments`. Do not render searchable/discoverable.

### 3.5 `PUT /users/me/settings` — partial update

Body (`UpdateSettingsDto`):

| field | type | rule |
|---|---|---|
| pushEnabled | boolean? | `@IsBoolean` |
| privacy | object? | `@IsObject`; **only** the 5 known keys are merged and **only boolean values** are honoured; other keys silently ignored |

Any other top-level key → 400 (`forbidNonWhitelisted`).

**200** response: the full merged settings object (same shape as GET) reflecting the update. Sibling keys (`notes`, `chatBackgrounds`, `coupleCovers`, `nudgeSuffix`) are preserved (row-locked read-modify-write).

**H5 behaviour:** on opening Settings: GET, then render toggles from the snapshot (only if no toggle PUT is in flight). Tapping a toggle: optimistic flip → `PUT` with **only that one key** (`{pushEnabled:false}` or `{privacy:{showOnline:false}}`) → ignore the echo (keeps optimistic state so concurrent toggles aren't clobbered) → on failure revert just that key and toast `"Failed to save setting"`. Re-taps while a PUT for the same key is in flight are ignored. Missing keys are treated as `true` client-side.

### 3.6 `POST /users/me/verification/send-code` — 201

Body (`SendCodeDto`): `{ schoolEmail: string }` (`@IsString`; real validation is in the service).

Service checks in order:

1. **400** `"You have already been verified"` (status `verified`).
2. email normalised `trim().toLowerCase()`; regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` else **400** `"Invalid email format"`.
3. must contain `.edu` or `.ac.` (substring test `/(\.edu|\.ac\.)/`) else **400** `"Please use a school email (must contain .edu or .ac.)"`.
4. 60 s resend cooldown → **400** `"Please wait a moment before requesting another code"`.
5. Stores `verifyCode` (6 digits, 10 min), resets `verifyCodeAttempts=0`, **stores `schoolEmail` immediately**.
6. SMTP configured → sends; failure → code cleared + **503** `"Failed to send verification email, please try again later"`. Production without SMTP → code cleared + **503** `"Email service is not configured"`.

**201** responses:
- `{ "message": "Verification code sent to your school email", "expiresInSec": 600 }`
- dev: `{ "message": "Verification code sent (dev mode: no email service connected, code shown below)", "devCode": "123456", "expiresInSec": 600 }`

Note: sending is allowed in `pending` and `rejected` states (only `verified` is blocked here); the `pending` block happens at submit.

### 3.7 `POST /users/me/verification/submit` — 201

Body (`SubmitVerificationDto`) — all three `@IsString` **required**:

| field | meaning |
|---|---|
| studentCardUrl | URL returned by `POST /uploads/image` (student card photo) |
| schoolEmail | must equal the email the code was sent to (normalised) |
| code | the 6-digit code |

Checks in order (all **400** unless stated):

1. `"You have already been verified"`
2. `"Your verification application is under review, please wait"` (status `pending`)
3. `"Please upload your student card photo first"` (empty studentCardUrl)
4. `"Please request an email verification code first"` (no code stored)
5. `"Verification code has expired, please request a new one"`
6. `"Email does not match the verification code, please request a new one"` (schoolEmail ≠ stored)
7. atomic attempt claim (`verifyCodeAttempts < 5`) → `"Too many incorrect attempts, please request a new code"` (every submit consumes a slot)
8. re-check email against fresh snapshot (same message as 6)
9. `"Incorrect verification code"`

**201** response:

```json
{ "message": "Verification materials submitted, awaiting admin review", "id": "clx…", "verificationStatus": "pending" }
```

State machine: `unverified` / `rejected` —submit→ `pending` —admin (`PATCH /admin/users/:id/verification` with `unverified|pending|verified|rejected`)→ `verified` | `rejected` | `unverified`. A `rejected` user may resubmit. There is **no endpoint to fetch review outcome**; the client learns it from `GET /users/me.verificationStatus` on next load.

**H5 behaviour (profile header badge + "verify" sheet):**
- Badge from `currentUser.verificationStatus`: `verified` → 22 px neon-green filled circle with check icon, disabled; `pending` → frosted pill hourglass icon + "Pending"/"审核中", disabled; else (`unverified`/`rejected`) → frosted pill `verified_user` icon + "Verify"/"认证", tappable → opens verify sheet.
- Verify sheet: (1) student-card photo tile "Tap to upload" → picks image → `POST /uploads/image` → preview; (2) school-email field + "Send code" button (`Sending…` → 60 s countdown `Ns` → "Send code"; hint line shows `devCode` in dev or the server `message`); (3) code field; Submit requires card URL, email, code (toasts `"Upload your student ID card first"`, `"Enter your school email"`, `"Enter the verification code"`). On 201: set `verificationStatus = response.verificationStatus || 'pending'`, toast the message, close sheet, re-render badge. Opening the sheet resets all three inputs and the preview.
- The partner-profile view shows a neon `verified` icon when `verificationStatus === 'verified'`, otherwise a small grey "UNVERIFIED" pill.

### 3.8 `GET /users/me/connect-code`

**200** `{ "connectCode": "CL7Q2M9XKD" }` — `"CL"` + 8 uppercase `[0-9A-Z]`. Generated on first call, stable afterwards (unique; up to 5 retries on collision → **400** `"Failed to generate connection code, please try again"`).
Encode it into the QR shown in "Add by QR"; the other side redeems it via the chat domain (`POST /chat/connect` or similar — see chat map). Also returned as `connectCode` in `GET /profiles/me`.

### 3.9 `PUT /users/me/notes` — private nickname ("备注") for another user

Body (`SetNoteDto`): `{ targetUserId: string (required), note?: string }`.
Server: `note.trim().slice(0, 30)`; empty → deletes the note.

**200** `{ "targetUserId": "clx…", "note": "Alice from lab" | null }`.
**400** `"Missing targetUserId"`.

Notes live in `User.settings.notes[targetUserId]` and are surfaced by the chat domain as `session.partner.note` (chat list shows note instead of nickname; partner profile shows note as a small pill next to the nickname). Only the author sees them.

**H5 behaviour:** on partner profile, "+"/"edit" round button next to the name → prompt card "Set a note" (placeholder "Leave blank to clear", prefilled with current note from the session list) → PUT → toast `"Note saved"` / `"Note cleared"` → reload chat sessions.

### 3.10 `GET /users/:id/public-profile`

Three projections depending on viewer relationship (`:id` may be the viewer's own id):

**(A) Self, or a confirmed connection** — a non-dissolved `Match` between the two with status `RELATIONSHIP_ROMANTIC` | `RELATIONSHIP_MODE` | `FRIEND_CONFIRMED` (**temporary 48 h matches do NOT count**):

```jsonc
{
  "userId": "clx…",
  "verificationStatus": "verified",
  "nickname": "…", "realName": "Xiaoyue Zhang" | null,
  "school": "…", "grade": "Year 2", "age": 21, "city": "…",
  "interests": ["…"], "bio": "…", "avatarUrl": "…",
  "socialLinks": { "wechat": "…" } | null,
  "relationshipScore": 0,
  "signature": "…", "coverUrl": "…" | null, "tags": ["…"],
  "major": "…", "mbti": "…", "nationality": "…",
  "realPhotos": ["…"], "zodiac": "…",
  "daysKnown": 12            // ONLY for connections (not self): floor((now − anchor)/1d), anchor = relationshipStartedAt ?? confirmedAt ?? createdAt
}
```

**(B) Stranger with `privacy.showProfile == true`** — `userId`, `verificationStatus`, plus the `public_profile_fields` list, then `coverUrl`, `realPhotos`, `realName` are force-deleted. With the seeded config this is exactly:

```json
{ "userId": "…", "verificationStatus": "…", "nickname": "…", "school": "…", "grade": "…", "age": 21, "city": "…", "interests": [], "bio": "…", "avatarUrl": "…", "tags": [] }
```

(no signature/major/mbti/nationality/zodiac/socialLinks/coverUrl/realPhotos/realName/daysKnown — the client must render those sections conditionally.)

**(C) Stranger with `privacy.showProfile == false`:**

```json
{ "nickname": "…", "avatarUrl": "…", "hidden": true }
```

**404** `"User not found or profile not completed"` when the target has no Profile row.

**H5 behaviour (partner profile full-screen overlay):** cover hero (falls back to blurred avatar when `coverUrl` missing), avatar ring, nickname + verified icon / "UNVERIFIED" pill + note pill + note button, `realName` line if present, school line (localised via META_ZH), info line `grade · age · city` (empty parts omitted), `Known for N day(s)` when `daysKnown != null`, 2-column facts grid for Major/MBTI/Zodiac/Nationality (only present ones), interest chips, "About" (bio), "Photo Portfolio" (first photo large + 2 side + 3-col grid for the rest). Opening it also fires `POST /matching/feedback/events {events:[{matchId,type:'openedProfile'}]}` when opened from a match (matching domain). H5 does not special-case `hidden:true` (it just renders name+avatar with everything else empty) — iOS should show a "profile hidden" state.

### 3.11 `GET /users/search?q=` — legacy compatibility shell

Delegates to `DiscoveryService.searchUsers(viewer, q, {limit:20})` and returns **only** `{ users: [...] }`:

```jsonc
{
  "users": [
    {
      "id": "clx…", "nickname": "…", "avatarUrl": "…", "school": "…", "grade": "…", "major": "…", "city": "…",
      "tagline": "first 60 chars of signature, else bio" | null,
      "relationship": "none" | "pending" | "friend" | "romantic"     // deepest active Match with viewer
    }
  ]
}
```

Query `q` is required (`?q=`); empty → `{users:[]}`. Matches nickname (prefix > contains) / tags / interests (exact) / school / major / city (contains); an exact connect-code (`CL…`, case-insensitive) pins that user first and bypasses `searchable`. Excludes self, banned users and users with `privacy.searchable === false`. Max 20, no pagination on this shell (`/discovery/users` has `page`/`limit`/`total`/`hasMore`).
**The H5 no longer calls this** (2026-08-19: chat search filters local sessions only; "find people" was removed). Keep out of the iOS UI unless product reverses that.

---

## 4. Profiles endpoints (`/api/v1/profiles/*`) — JWT

### 4.1 `GET /profiles/me`

**200**: the **entire Profile row** (all columns of §1.2 including `id, userId, extraData, relationshipScore, profileCompleteness, createdAt, updatedAt`) **plus**:

```jsonc
{
  …profile columns…,
  "joinedAt": "2026-07-01T…Z",        // User.createdAt (fallback profile.createdAt) — "member for N days"
  "connectCode": "CL…" | null,        // null until GET /users/me/connect-code has been called once
  "verificationStatus": "unverified"
}
```

**404** `"Profile not completed"` when no row exists (new user). The H5 never calls this (it reads `profile` from `/users/me`); iOS can use either.

### 4.2 `PUT /profiles/me` (== `PUT /users/me`) — create/update, 200

Body: `CreateProfileDto` — every field optional (§1.2 has the per-field validation). Semantics:

- **Upsert**: creates the row if missing, else updates **only the keys present** in the body. Omitted keys keep their stored value.
- Strings: sending `""` **clears** the value (stored as empty string). Exception: `gender` / `genderPref` are enums → `""` is a 400 (`gender must be one of the following values: male, female, non_binary, other`). Omit them instead.
- Arrays (`interests`, `tags`, `realPhotos`, `wishGifts`): the array **replaces** the stored array wholesale (send the complete new list; `[]` clears).
- `socialLinks`: replaces the whole JSON object.
- `age`: integer 16..40 (`age must not be less than 16` / `…greater than 40`). `birthday`: `YYYY-MM-DD` string; the server does **not** derive age from birthday — the client computes and sends both.
- Unknown keys → 400 `"property X should not exist"`.

**200** response: the full Profile row after the write (same columns as §4.1 minus `joinedAt/connectCode/verificationStatus`), with freshly computed `profileCompleteness`.

**H5 behaviour — Profile Setup (first run after register)**, `saveProfile()`:

Wizard step 1–4 (one field per screen, progress bar 25/50/75/100 %, "Back"/"Next"): nickname → given name + family name → gender (male/female/non_binary/other segment) → birthday (date picker limited to ages 16–40). Then a single long form: avatar circle (upload immediately, §5.3), selects school / city / major / MBTI / nationality (from `/metadata/*`, §5.5), grade select (§6.2), interest chips (+ explicit "Add" button), bio textarea max 250.
Client-side required: nickname (`"Please enter a nickname"`), given+family (`"Please enter your real name (given + family name)"`), gender (`"Please select your gender"`), birthday (`"Please select your birthday"`), age in 16–40 (`"Unimatcha is for students aged 16–40"`). Payload sent:

```jsonc
{
  "nickname", "givenName", "familyName",
  "realName": "<givenName> <familyName>",        // client-synthesised, given name first
  "school", "grade",                              // grade normalised to the canonical list (§6.2)
  "gender", "genderPref": "<selected or 'any'>",
  "age": <computed from birthday>, "birthday": "YYYY-MM-DD",
  "bio": "<≤250 chars or ''>",
  "interests": [...],
  // only when non-empty:
  "city", "major", "mbti", "nationality"
}
```

After success: merge payload into local profile, go Home → Match tab → Chat view, and render the two optional questionnaire cards (questionnaire is NOT a gate).

**H5 behaviour — Edit Profile sheet**, `saveEditProfile()`: fields nickname (required, `"Nickname required"`), given/family name, bio (≤250), signature (≤100), gender select, birthday, school/grade/city/major/MBTI/nationality selects, student ID (≤32), interest chips, 6-slot photo grid, 5 gift inputs. Payload rules ("A18" semantics — replicate exactly):

- always: `nickname`, `bio`, `signature` (`""` allowed → clears), `interests` (full list), `wishGifts` (full list of non-empty inputs, `[]` clears);
- `school, grade, city, major, mbti, nationality, studentId`: included **whenever the control is rendered**, even when empty (`""` clears);
- `givenName, familyName, realName`: included only if at least one name field is non-empty (so leaving both blank does not wipe the stored real name);
- `gender`: included only if non-empty; `birthday` + `age`: included only if birthday set and age in 16–40 (else toast and abort);
- `coverUrl`, `realPhotos`, `avatarUrl` are **never** in this payload (own save paths, §5.3/5.4).

Cover: after upload → `PUT /profiles/me { "coverUrl": url }` only. Real photo removal → `PUT /profiles/me { "realPhotos": [remaining…] }`.

---

## 5. Uploads & metadata (`/api/v1/uploads/*`, `/api/v1/metadata/*`) — JWT

### 5.1 `POST /uploads/image` — 201, `multipart/form-data`, part name **`file`**

- Allowed MIME (checked on the part's declared `Content-Type`, case-insensitive): `image/jpeg` → `.jpg`, `image/png` → `.png`, `image/gif` → `.gif`, `image/webp` → `.webp`. Anything else (SVG, HEIC/HEIF, BMP, `application/octet-stream`) → **400** `"Only JPEG, PNG, GIF, or WebP images are allowed"`.
  → **iOS must transcode HEIC/HEIF (default camera format) to JPEG and set the part's Content-Type explicitly.**
- Max size **8 MB** → over → **413** `"File too large"` (Nest multer transform).
- No part → **400** `"Please select an image to upload"`.
- Stored as `<uuid v4><ext>` in `/uploads`; the original filename is ignored.

**201** response:

```json
{ "url": "https://api.unimatcha.ai/uploads/3f1c…-….jpg", "filename": "3f1c…-….jpg" }
```

`url` host = the API host as seen through the proxy (`X-Forwarded-Proto` honoured → https in production). Use the returned `url` verbatim in later calls (avatar, cover, realPhotos, student card, posts, chat images). There is **no delete endpoint** — orphaned files stay.

**H5 helper `uploadImageFile(file)`**: `FormData.append('file', file)` + Bearer header, returns `data.url`; throws `Error(message || 'Upload failed')`.

### 5.2 `POST /uploads/avatar` — 201

Body `{ url: string }` (`@IsString`; the server does not verify the URL).
**201** `{ "message": "Avatar updated", "avatarUrl": "<url>" }`.
Upserts the Profile row — **creates a Profile with only `avatarUrl` if none exists** (see S3).

### 5.3 H5 avatar flow (setup and edit)

pick image → `POST /uploads/image` → `POST /uploads/avatar {url}` → update local `profile.avatarUrl` → toast `"Avatar updated"`. On failure toast `"Avatar upload failed: <message>"`.

### 5.4 `POST /uploads/real-photo` — 201

Body `{ url: string, caption?: string }` — `caption` is accepted but **ignored** (not stored).
- **201** `{ "message": "Real photo added", "realPhotos": ["…", "<url>"] }` (appends).
- When already 6 photos: **201** (not an error!) `{ "message": "You can upload at most 6 real photos", "realPhotos": [...6 existing] }` — the client must compare or pre-check the count. H5 pre-checks locally (`"Maximum 6 photos"`) and serialises uploads (one in flight at a time; a second tap is ignored).
- Removal: `PUT /profiles/me { realPhotos: [...] }` (no dedicated delete).

Real photos are visible to self and confirmed connections only (§3.10). The user's own profile tab hides the portfolio strip; it is edited in the Edit Profile sheet (3-column grid, 6 slots, "+" tiles, "×" on filled).

### 5.5 Metadata lists — `GET /metadata/...` — 200 `{ "items": string[] }`

| path | count | order | content |
|---|---|---|---|
| `/metadata/uk/cities` | 50 | alphabetical (`localeCompare`) | UK cities (§6.4) |
| `/metadata/uk/universities` | 78 | alphabetical | UK universities (§6.5) |
| `/metadata/uk/majors` | 67 | alphabetical | majors (§6.6) |
| `/metadata/mbti-types` | 16 | fixed | `INTJ, INTP, ENTJ, ENTP, INFJ, INFP, ENFJ, ENFP, ISTJ, ISFJ, ESTJ, ESFJ, ISTP, ISFP, ESTP, ESFP` |
| `/metadata/nationalities` | 40 | fixed | §6.7 |

Values are **stored in English exactly as listed**; Chinese display is a client-side map (`META_ZH` in `apps/h5/src/modules/i18n.js`, 234 entries: universities/cities/majors/nationalities + grades) — the API never returns Chinese labels. The JSON seed files are `apps/api/src/metadata/seed/*.json`; if they failed to load the endpoint returns `{items: []}` (200), so treat an empty list as an error state, not "no data" (H5 only caches non-empty results and surfaces the error).

**H5 behaviour:** `fetchMetadata(path)` caches per session; selects show a placeholder option first and, if the stored value is not in the list (legacy values), inject it at the top so it stays selectable.

---

## 6. Enumerations & canonical value lists the client must own

### 6.1 Enums

- `User.status`: `ACTIVE` | `BANNED`
- `verificationStatus`: `unverified` | `pending` | `verified` | `rejected`
- `gender`: `male` | `female` | `non_binary` | `other` (UI labels EN: Male/Female/Non-binary/Other; ZH: 男/女/非二元/其他)
- `genderPref`: `male` | `female` | `any`
- `modeStates[].mode`: `romantic` | `friend`; `matchState`: `idle` | `searching` | `matched` | `confirming` | `relationship` | `no_match`
- `relationship` (search): `none` | `pending` | `friend` | `romantic`
- Match statuses relevant to "confirmed connection": `RELATIONSHIP_ROMANTIC`, `RELATIONSHIP_MODE` (legacy), `FRIEND_CONFIRMED`

### 6.2 Grade (`grade`) — canonical values (server `GRADE_VALUES`, not enforced; H5 `GRADE_OPTIONS`)

`Foundation`, `Year 1`, `Year 2`, `Year 3`, `Year 4`, `Master's`, `PhD Year 1`, `PhD Year 2`, `PhD Year 3`, `PhD Year 4+`
ZH labels: 预科, 大一, 大二, 大三, 大四, 硕士, 博士一年级, 博士二年级, 博士三年级, 博士四年级及以上.
Legacy stored values (`Freshman`, `Undergraduate`, `Postgraduate`, `Doctorate`, old Chinese strings) are not migrated — keep them selectable if returned. H5 normalises case-insensitively to the canonical spelling before saving.

### 6.3 MBTI — 16 values as in §5.5 (server does not validate; H5 uses the list).

### 6.4 UK cities (50, API returns them sorted A→Z)

London, Manchester, Birmingham, Leeds, Glasgow, Liverpool, Bristol, Sheffield, Edinburgh, Cardiff, Newcastle upon Tyne, Nottingham, Leicester, Southampton, Oxford, Cambridge, Brighton, Bath, York, Durham, Coventry, Exeter, Reading, Plymouth, Aberdeen, Swansea, Belfast, Derby, Wolverhampton, Norwich, Milton Keynes, Luton, Huddersfield, Bradford, Preston, Portsmouth, Blackpool, Middlesbrough, Sunderland, Stoke-on-Trent, Peterborough, Bournemouth, Colchester, Southend-on-Sea, Ipswich, Northampton, Warrington, Gloucester, Worcester, Salisbury

### 6.5 UK universities (78, sorted A→Z by API)

University of Oxford, University of Cambridge, Imperial College London, University College London, London School of Economics, University of Edinburgh, King's College London, University of Manchester, University of Bristol, University of Warwick, University of Glasgow, Durham University, University of Leeds, University of Nottingham, University of Birmingham, University of Southampton, University of York, University of Leicester, Newcastle University, University of Sheffield, Cardiff University, University of Liverpool, University of Exeter, Queen's University Belfast, University of Bath, Loughborough University, Lancaster University, University of Surrey, University of Reading, Brunel University London, City, University of London, Royal Holloway, University of London, University of East Anglia, University of Kent, University of Essex, University of Sussex, Swansea University, University of Aberdeen, Heriot-Watt University, University of Stirling, University of Strathclyde, Queen Mary University of London, SOAS University of London, University of Westminster, Goldsmiths, University of London, Birkbeck, University of London, Middlesex University, University of Hertfordshire, University of Greenwich, Kingston University, Oxford Brookes University, University of Lincoln, University of Hull, Keele University, Aston University, Bangor University, University of Ulster, University of the West of England, Northumbria University, Coventry University, De Montfort University, University of Derby, University of Central Lancashire, Manchester Metropolitan University, Sheffield Hallam University, Leeds Beckett University, Birmingham City University, Nottingham Trent University, Edinburgh Napier University, Glasgow Caledonian University, Robert Gordon University, University of Portsmouth, University of Brighton, Anglia Ruskin University, University of Bedfordshire, University of the Arts London, Liverpool John Moores University, London Metropolitan University

### 6.6 Majors (67, sorted A→Z by API)

Computer Science, Software Engineering, Data Science, Artificial Intelligence, Cybersecurity, Information Technology, Mathematics, Statistics, Physics, Chemistry, Biology, Biochemistry, Neuroscience, Environmental Science, Medicine (MBBS), Dentistry, Pharmacy, Nursing, Psychology, Law (LLB), Business Administration, Economics, Finance, Accounting, Marketing, Management, Human Resource Management, International Business, Civil Engineering, Mechanical Engineering, Electrical and Electronic Engineering, Chemical Engineering, Aerospace Engineering, Architecture, Urban Planning, History, English Literature, Linguistics, Philosophy, Sociology, Political Science, International Relations, Anthropology, Geography, Art and Design, Graphic Design, Fashion Design, Film and Television Studies, Music, Drama and Theatre, Education, Social Work, Journalism, Media Studies, Sport Science, Nutrition, Public Health, Biomedical Science, Genetics, Marine Biology, Ecology, Astrophysics, Materials Science, Robotics, Game Design, Digital Marketing, Supply Chain Management

### 6.7 Nationalities (40, fixed order as returned)

British, Chinese, Indian, American, Canadian, Australian, German, French, Italian, Spanish, Portuguese, Polish, Romanian, Ukrainian, Turkish, Nigerian, Ghanaian, Pakistani, Bangladeshi, Sri Lankan, Nepalese, Malaysian, Singaporean, Hong Kongese, Taiwanese, Japanese, Korean, Vietnamese, Thai, Indonesian, Brazilian, Mexican, Colombian, Argentinian, Egyptian, Saudi Arabian, Iranian, Iraqi, Israeli, Other

---

## 7. App bootstrap / routing logic the H5 implements on top of this domain

### 7.1 `checkUserState()` (runs on launch, after login, on resume)

```
token absent            → wipe state, close overlays, show Auth page
GET /users/me fails     → delete token, show Auth page (any error incl. 401/network)
user.status == BANNED   → show "banned" page          (unreachable in practice — S2)
!hasProfile             → show Profile Setup           (hasProfile = server flag, fallback profile?.nickname)
else                    → start SSE, show Home → Match tab (Chat view)
```

`completedQuestionnaire` is **not** a gate; questionnaires are prompted per mode inside the Match tab (matching domain).

### 7.2 Local state to keep (mirror of `S`)

`currentUser` (= `/users/me` payload, mutated locally after profile saves so Edit Profile pre-fills without a refetch), `userSettings` (= `/users/me/settings`), `metadataCache[path]`, `verifyCardUrl` (transient), `setupTags` / `editTags` (interest chips being edited), `viewingProfileId` (for the note button). All are wiped on logout / 401 / account switch (`cleanupUserState`).

### 7.3 Language

All strings from this domain are English on the wire (server messages, metadata values). The H5 localises UI chrome client-side (EN/ZH) and maps metadata values with `META_ZH`; server `message`s are shown raw in toasts. Never translate user content (nicknames, bios, tags).

---

## 8. Privacy rules the client must respect

1. **Stranger vs connection projection** is decided server-side (§3.10) — but the client must not cache a *connection* projection and show it after dissolution; refetch on open.
2. `realName`, `familyName`, `givenName`, `studentId`, `wishGifts`, `birthday`, `gender`, `genderPref`, `socialLinks`, `extraData`, `settings`, `schoolEmail`, `studentCardUrl`, `connectCode` are **self-only** (or, for `realName`/`socialLinks`/`realPhotos`/`coverUrl`, connection-only). Never display them from any other source.
3. Notes (`settings.notes`) are private to their author — show only in the author's own UI.
4. `hidden: true` public profile → show name + avatar only, with a "profile is private" state.
5. Temporary (48 h) matches see the **stranger** projection; do not assume cover/real photos are present on match cards.
6. Anonymous-alias rules (aliasSeed, no `userId` on anonymous comments) belong to the square domain; nothing in this domain returns aliases.

---

## 9. Swift decoding hints (optional)

- `Envelope<T>`: `{success, data:T, message?, timestamp}`; `APIError`: `{success:false, statusCode, message: StringOrArray, errors: Never?, timestamp, path}`.
- `Profile` DTO: make **every** field optional; arrays default `[]`. `socialLinks: [String:String]?`, `extraData: JSONValue?`.
- `MeResponse`: `{id, email, status, verificationStatus, createdAt, modeStates:[ModeState], profile: Profile?, hasProfile:Bool, completedQuestionnaire:Bool}`.
- `PublicProfile`: single struct with all-optional fields + `hidden: Bool?` + `daysKnown: Int?` covers all three projections.
- `Settings`: `{pushEnabled:Bool, privacy: Privacy{showProfile, showOnline, showMoments, searchable, discoverable}}`.
- `ProfileUpdate` request: use a dictionary / `Encodable` with `encodeIfPresent` so omitted keys are truly absent (do not encode `nil` as `null` for `gender`).
- Dates are ISO-8601 with milliseconds (`2026-09-03T10:00:00.000Z`) — use `.iso8601` with fractional seconds; `birthday` is a plain `YYYY-MM-DD` string.

---

## 10. Endpoint index (this domain)

| # | Method | Path (after `/api/v1`) | Auth | Status | Section |
|---|---|---|---|---|---|
| 1 | POST | `/auth/register/send-code` | public (+30/min IP) | 200 | 2.1 |
| 2 | POST | `/auth/register` | public (+30/min IP) | 201 | 2.2 |
| 3 | POST | `/auth/login` | public | 200 | 2.3 |
| 4 | POST | `/auth/change-password` | JWT | 200 | 2.4 |
| 5 | GET | `/users/me` | JWT | 200 | 3.1 |
| 6 | PUT | `/users/me` | JWT | 200 | 3.2 / 4.2 |
| 7 | GET | `/users/me/match-status` | JWT | 200 | 3.3 (legacy) |
| 8 | GET | `/users/me/settings` | JWT | 200 | 3.4 |
| 9 | PUT | `/users/me/settings` | JWT | 200 | 3.5 |
| 10 | POST | `/users/me/verification/send-code` | JWT | 201 | 3.6 |
| 11 | POST | `/users/me/verification/submit` | JWT | 201 | 3.7 |
| 12 | GET | `/users/me/connect-code` | JWT | 200 | 3.8 |
| 13 | PUT | `/users/me/notes` | JWT | 200 | 3.9 |
| 14 | GET | `/users/search?q=` | JWT | 200 | 3.11 (legacy) |
| 15 | GET | `/users/:id/public-profile` | JWT | 200 | 3.10 |
| 16 | GET | `/profiles/me` | JWT | 200 | 4.1 |
| 17 | PUT | `/profiles/me` | JWT | 200 | 4.2 |
| 18 | POST | `/uploads/image` (multipart `file`) | JWT | 201 | 5.1 |
| 19 | POST | `/uploads/avatar` | JWT | 201 | 5.2 |
| 20 | POST | `/uploads/real-photo` | JWT | 201 | 5.4 |
| 21 | GET | `/metadata/uk/cities` | JWT | 200 | 5.5 |
| 22 | GET | `/metadata/uk/universities` | JWT | 200 | 5.5 |
| 23 | GET | `/metadata/uk/majors` | JWT | 200 | 5.5 |
| 24 | GET | `/metadata/mbti-types` | JWT | 200 | 5.5 |
| 25 | GET | `/metadata/nationalities` | JWT | 200 | 5.5 |

Static: `GET https://api.<domain>/uploads/<file>` (no prefix, no auth).

---

## 11. Surprises / gotchas (S-list)

- **S1 — `message` can be an array.** Validation failures return `message: string[]`; everything else a string. Decode both.
- **S2 — Banned users never see the banned page.** `JwtStrategy` 401s any `BANNED` user, so `GET /users/me` never returns `status:'BANNED'`; the H5's `page-banned` branch is dead. The only banned signal is the login 401 text `"Your account has been banned, please contact support"`. Show a banned message from the login error, not from `/users/me`.
- **S3 — Two different `hasProfile` definitions.** `/auth/login.user.hasProfile` = Profile row exists; `/users/me.hasProfile` = row exists **and nickname set**. `POST /uploads/avatar` upserts a row with only `avatarUrl`, so uploading an avatar before finishing setup makes login say `hasProfile:true` while `/users/me` still says `false`. Route on `/users/me` (as the H5 does).
- **S4 — Every register/submit attempt consumes one of 5 slots**, correct or not (slot is claimed before comparison). After 5 submits with a stale code the user must request a new code (which resets attempts). Cooldown for re-send is 60 s from *issue* time, not from the last failed attempt.
- **S5 — Sending a student-verification code immediately overwrites `schoolEmail`** on the user, and the submitted `schoolEmail` must equal exactly the last one a code was sent to (normalised lowercase). Changing the email field after sending → `"Email does not match…"` — re-send.
- **S6 — School-email check is a substring test** for `.edu` or `.ac.` (e.g. `x@warwick.ac.uk` ✓, `x@stanford.edu` ✓, `x@gmail.com` ✗). Do the same pre-check client-side to give instant feedback.
- **S7 — Uploads reject HEIC and SVG.** Only JPEG/PNG/GIF/WebP by declared MIME; 8 MB cap → 413. iOS must transcode camera HEIC to JPEG and set the multipart part's Content-Type. No delete endpoint.
- **S8 — `/uploads/real-photo` at the 6-photo cap returns 201 with an explanatory `message`**, not an error. Compare the returned `realPhotos` length or pre-check locally.
- **S9 — Empty string vs omit on `PUT /profiles/me`.** `""` clears string fields; omitting keeps them; `gender`/`genderPref` reject `""` (enum). Arrays are replaced wholesale. Unknown keys are 400 — never send the whole `/users/me.profile` back.
- **S10 — `age` is not derived from `birthday` server-side.** The client computes age from birthday (H5 `ageFromBirthday`: calendar-year diff minus one if birthday not yet reached this year) and sends both; matching filters on `age`.
- **S11 — `realName` is client-synthesised** as `"<givenName> <familyName>"` (given first); the server stores whatever it gets. Send all three together.
- **S12 — Stranger projection is narrower than the code fallback suggests.** The seeded `public_profile_fields` (re-applied on every deploy) excludes signature/major/mbti/nationality/zodiac; `coverUrl`/`realPhotos`/`realName` are always stripped for strangers. Temporary 48 h matches count as strangers. `daysKnown` appears only for confirmed connections.
- **S13 — `privacy.showOnline`, `privacy.showMoments`, `pushEnabled` are write-only** (no backend reader). `searchable`/`discoverable` are still enforced server-side but were removed from the H5 settings UI on 2026-08-19 — don't render them.
- **S14 — Settings PUT must send only the changed key(s)**; the response is the full merged object but the H5 deliberately ignores it to avoid clobbering concurrent optimistic toggles.
- **S15 — No token refresh, no logout endpoint, no revocation** on password change. 7-day JWT; on 401 anywhere → local logout.
- **S16 — `POST` endpoints in `/users` and `/uploads` return 201**, while `/auth/register/send-code`, `/auth/login`, `/auth/change-password` return 200. Don't branch on exact 200.
- **S17 — `/users/me` does not include `connectCode` or `settings`**; get the code from `GET /users/me/connect-code` (or `GET /profiles/me` after it has been generated once) and settings from `GET /users/me/settings`. `settings.notes` are never returned directly — they arrive as `partner.note` on chat sessions.
- **S18 — `modeStates` can be empty** for new users (rows are created lazily by matching); treat a missing mode as `idle`.
- **S19 — Dead H5 code:** `auth.js` still defines `applyVerification()` calling `POST /users/me/verification/apply`, which **does not exist** (would 404). It is unreferenced in the UI; do not port it.
- **S20 — Metadata endpoints require a JWT** even though the lists are static, and return `{items: []}` with 200 if the seed files fail to load. The H5 treats empty as an error and does not cache it.
- **S21 — `GET /users/search` and `GET /users/me/match-status` exist but are unused by the current H5** (legacy shells). The current per-mode match status is `GET /matching/status?mode=` (matching domain).
- **S22 — Email normalisation:** register/send-code lowercases; login tries exact then lowercase. Always send trimmed input; the server handles case.
- **S23 — Dev-only `devCode`:** appears in send-code responses only when `NODE_ENV != production` and SMTP is unconfigured. Production never returns it (503 instead if mail is broken). The H5 displays it in a hint line when present — harmless to support, but never rely on it.
