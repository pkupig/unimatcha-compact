# API contract map — matching / questionnaire / answers / energy / relationships

Source of truth (read verbatim, 2026-09-03):

- `apps/api/src/main.ts`, `apps/api/src/common/{filters,interceptors,guards,decorators}`
- `apps/api/src/matching/{matching.controller,matching.service,mode.util,match.scheduler}.ts`, `matching/dto/*`, `matching/feedback/match-feedback.service.ts`
- `apps/api/src/relationships/*`, `apps/api/src/answers/*`, `apps/api/src/questionnaire/*`, `apps/api/src/energy/*`
- `apps/api/src/profiles/profiles.service.ts` (public-profile shape used as `partner`)
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`, `apps/api/prisma/questionnaire-v2.ts`
- H5 call sites: `apps/h5/src/modules/{core,match,questionnaire,profile,chat,addfriend,milestone,settings}.js` (only to document what the client actually sends/reads)

Admin controllers (`/admin/matching/*`, `/admin/questionnaire/*`) are deliberately skipped.

---

## 0. Global transport conventions (apply to every endpoint below)

| Item | Value |
|---|---|
| Base URL | `https://api.unimatcha.ai/api/v1` in production; `http://localhost:3001/api/v1` in dev. **Global prefix is `/api/v1`** (`app.setGlobalPrefix('api/v1')`). All paths below are relative to that prefix. |
| Auth | `Authorization: Bearer <jwt>` (passport-jwt, `ExtractJwt.fromAuthHeaderAsBearerToken`). Token comes from `/auth/login` / `/auth/register`; payload `{ sub: userId, email, role: 'user' }`, default expiry `JWT_EXPIRES_IN=7d`. Every controller in this map is class-decorated `@UseGuards(JwtAuthGuard)` → **no public endpoints in this domain**. |
| 401 semantics | Missing/invalid/expired token → 401 `{ success:false, statusCode:401, message:'Unauthorized' }`. Token valid but user deleted → 401 `'User not found or has been deactivated'`; user `status='BANNED'` → 401 `'Your account has been banned'` (checked on **every** request, so a banned user is kicked immediately). H5 reaction to any 401: drop token, stop all polling/SSE, reset state, go to auth screen. iOS should do the same. |
| Content-Type | JSON bodies (`Content-Type: application/json`). H5 sends `cache: 'no-store'`; API sets no Cache-Control on JSON, so iOS should disable URLCache for API calls (H5 had "saved but reads stale" bugs from heuristic caching). |
| Success envelope | `TransformInterceptor` wraps every 2xx: `{ "success": true, "data": <handler return>, "message": <handler return>.message (usually undefined → omitted/null), "timestamp": ISO }`. Rule: if the handler's return object has a `data` key, `data` is unwrapped to that (`data.data`); otherwise `data` = whole return value. None of the handlers in this domain return a `{data:…}` object, so `data` is always the exact shapes documented below. When the service returns `{status, message}` the same `message` string is mirrored at top level. |
| Error envelope | `HttpExceptionFilter` (catch-all): `{ "success": false, "statusCode": <int>, "message": <string OR string[]>, "errors": null, "timestamp": ISO, "path": "/api/v1/…" }`. **`message` is an array of strings for validation failures** (class-validator, e.g. `["property enhancedModeEnabled should not exist", "cells must not be greater than 5"]`); a plain string for thrown Nest exceptions. Unknown exceptions → 500 `'Internal server error'`. |
| Validation | Global `ValidationPipe({ whitelist:true, transform:true, forbidNonWhitelisted:true, enableImplicitConversion:true })`. Consequences: (a) **any body/query field not declared on the DTO → 400** ("property X should not exist") — do not echo GET responses back into PUT bodies; (b) query strings are implicitly converted to the DTO type (`page=2` → number); (c) booleans in JSON bodies must be real JSON booleans (`"false"` string would implicitly convert to `true`). Endpoints that take `@Query('mode')` as a raw param (not a DTO) tolerate extra query params; `/energy/transactions` uses a query DTO and does not. |
| Rate limit | None on any endpoint in this domain. (The in-memory per-IP guard — 429 `'Too many requests, please try again later'` — only sits on `/auth/register`, `/auth/register/send-code` (30/min) and `/public/*` (10/min).) |
| IDs / dates | All ids are Prisma `cuid()` strings. All dates serialize as ISO-8601 UTC strings (Prisma `DateTime` → JSON). `remainingMs`/`nextRunAt` are computed server-side at response time. |
| Pagination | Only `/energy/transactions` paginates in this domain: `page` (1-based) / `limit` (1..100), response `{ items, total, page, limit }`. Everything else returns full arrays. |
| Swagger | `GET /api/docs` (outside the prefix) if you want to eyeball schemas. |

---

## 1. Domain model the client must understand

### 1.1 Modes
Two independent matching "modes", always lowercase strings on the wire: `'romantic'` | `'friend'`. Any query/body `mode` that is not exactly `'friend'` is normalized to `'romantic'` (`normalizeMode`). Every per-user matching entity is keyed by `(userId, mode)`:

- `UserModeState` (a.k.a. UMS) — `matchState`, `matchSearchingSince`, `weeklyMatchNote`. Lazily created on first `/matching/status` or `/matching/start` (`ensureModeState`).
- `UserMatchPreferences` — preferences per mode (see §3.8).
- Questionnaire: `QuestionnaireVersion.type` = `ROMANTIC` | `FRIEND` (uppercase enum in DB; the client passes lowercase `type=romantic|friend`).

### 1.2 `matchState` (per mode, stored on UMS) — internal values
`'idle' | 'searching' | 'matched' | 'confirming' | 'relationship'` (+ `weeklyMatchNote: 'no_match' | null` flag set on searching users who got nothing this round). This raw field is only exposed by `GET /users/me` (`modeStates[]`) and `GET /users/me/match-status` (legacy); the matching endpoints expose a *derived* `state` — see §1.4.

### 1.3 `Match.status` (Prisma enum `MatchStatus`) — the value you see in `status` fields
| status | mode | meaning |
|---|---|---|
| `MATCHED_ROMANTIC` | romantic | temp conversation, chat open, 48h countdown running, nobody confirmed yet |
| `ROMANTIC_CONFIRMING` | romantic | one side confirmed, waiting for the other (still inside 48h) |
| `RELATIONSHIP_ROMANTIC` | romantic | both confirmed → permanent couple (no TTL) |
| `MATCHED_FRIEND` | friend | temp conversation, 48h countdown |
| `FRIEND_CONFIRMING` | friend | one side confirmed |
| `FRIEND_CONFIRMED` | friend | both confirmed → permanent friend (also what QR/search "connect" creates directly) |
| `EXPIRED` | both | 48h passed without double-confirm; scheduler set it (every 10 min) |
| `DISSOLVED` | both | someone called dissolve (in temp stage = "reject", in permanent stage = "break up") |
| `REJECTED`, `PENDING_CONFIRM`, `MATCHED`, `RELATIONSHIP_MODE` | legacy | not written anymore; `RELATIONSHIP_MODE` may still appear on very old rows and is treated like `RELATIONSHIP_ROMANTIC` by graph/chat code |

Helpers: `TEMP_STATUSES = [MATCHED_ROMANTIC, ROMANTIC_CONFIRMING, MATCHED_FRIEND, FRIEND_CONFIRMING]` (show countdown + confirm button); `CONFIRMED_STATUSES = [RELATIONSHIP_ROMANTIC, FRIEND_CONFIRMED, RELATIONSHIP_MODE]`. The 48h window is `createdAt + 48h` of the Match row (`CONFIRM_WINDOW_MS`).

### 1.4 Derived `state` returned by `GET /matching/status` / `GET /matching/result`
`'idle' | 'searching' | 'no_match' | 'matched' | 'confirming' | 'relationship'`

- romantic: from the newest active Match: `MATCHED_ROMANTIC→'matched'`, `ROMANTIC_CONFIRMING→'confirming'`, `RELATIONSHIP_ROMANTIC→'relationship'`; if no active match: `'searching'` / `'no_match'` (when UMS is searching and `weeklyMatchNote==='no_match'`) / `'idle'`.
- friend: if UMS is `searching` → `'searching'` or `'no_match'` (and `matches[]` still carries existing friends); else `'matched'` if there is ≥1 active friend match, else the raw UMS value (`'idle'`, `'relationship'`, …).

Note `'confirming'` never appears for friend mode (friend state collapses to `'matched'` whenever any active match exists).

### 1.5 Weekly round
Match jobs run on a cron stored in `MatchConfig` (seed: `0 17 * * 5`, tz `Asia/Shanghai` = every Friday 17:00 Beijing time, romantic then friend). `GET /matching/status` returns `nextRunAt` (ISO UTC) computed from that cron; H5 uses it for the countdown/week strip and falls back to "next Friday 17:00" client-side if null.

### 1.6 Energy units ("cells")
- One unit of energy = one **cell** (格). `EnergyBalance.totalEnergy` (only ever increases: recharge + claims) and `usedEnergy` (CONSUME += / REFUND -=). `availableEnergy = totalEnergy - usedEnergy` (computed, never stored).
- Enhanced matching cost: **romantic = 3 cells fixed**; **friend = `cells` (1..5) = number of guaranteed friend matches**. Deducted at `/matching/start` (pre-deduction), refunded automatically by the match job if the guarantee is not met (romantic: full refund if zero matches; friend: `cells − matchesActuallyCreated` refunded). Optional 48h-expiry refund exists behind SystemConfig `energy.refundOnExpire` (default **off**).
- Cross-domain: event tickets charge `ceil(priceCents/100)` cells (1 cell ≡ 100 "cents/energy points" on the sponsor/school ledgers). Package prices: 30 cells = ¥30, 60 = ¥58, 100 = ¥88.
- Every change writes an `EnergyTransaction` row (`type: RECHARGE|CONSUME|REFUND|CLAIM`, `amountEnergy` always positive, `balanceAfter` snapshot).

### 1.7 `partner` object (public profile) — used everywhere a counterpart is shown
Built by `ProfilesService.getPublicProfile` / `getPublicProfilesByIds`: `{ userId: string, verificationStatus: 'unverified'|'pending'|'verified'|'rejected', ...fields }` where `fields` = the SystemConfig `public_profile_fields` list. **Production seed sets it to** `['nickname','school','grade','age','city','interests','bio','avatarUrl','coverUrl','tags']`, so in practice:

```json
{
  "userId": "cl…", "verificationStatus": "verified",
  "nickname": "沐晨" | null, "school": "University of Warwick" | null, "grade": "freshman" | null,
  "age": 22 | null, "city": "London" | null, "interests": ["…"], "bio": "…" | null,
  "avatarUrl": "https://…" | null, "coverUrl": "https://…" | null, "tags": ["…"]
}
```
Code fallback if the config row is missing: `nickname, school, grade, age, city, interests, bio, avatarUrl, signature, tags, major, mbti, nationality, zodiac` (single) or additionally `coverUrl, realPhotos` (batch). **Decode every field as optional.** `partner` is `null` when the other user has no Profile row. No `email`, `realName`, `studentId`, `connectCode` ever leak here.

---

## 2. Endpoint index

| # | Method | Path | Purpose |
|---|---|---|---|
| 3.1 | POST | `/matching/start` | join this round's pool (optionally enhanced; deducts energy) |
| 3.2 | POST | `/matching/stop?mode=` | leave pool |
| 3.3 | GET | `/matching/status?mode=` | full state (polled by H5 every 30 s) |
| 3.4 | GET | `/matching/result?mode=` | flattened view of the same data |
| 3.5 | GET | `/matching/milestones` | couple stats (romantic relationship only) |
| 3.6 | POST | `/matching/:matchId/confirm-relationship` | confirm (double-confirm semantics) |
| 3.7 | POST | `/matching/:matchId/dissolve` | reject (temp) / break up (permanent) |
| 3.8 | GET | `/matching/preferences?mode=` | preferences |
| 3.9 | PUT | `/matching/preferences` | save preferences (mode in body) |
| 3.10 | POST | `/matching/feedback/events` | analytics: viewed / openedProfile |
| 3.11 | POST | `/matching/connect` | add friend by connect code (QR) |
| 3.12 | POST | `/matching/connect-user` | add friend by userId |
| 3.13 | POST | `/matching/confirm`, `/matching/reject`, `/matching/proposals/:id/confirm`, `/matching/proposals/:id/reject`, `/matching/dissolve` | legacy aliases (romantic-only) |
| 4.1 | GET | `/relationships/graph` | relationship network |
| 5.1 | GET | `/questionnaire/active?type=` | active questionnaire with questions/options |
| 5.2 | GET | `/questionnaire/completion` | both modes' completion flags |
| 6.1 | POST | `/answers` | submit / re-submit answers |
| 6.2 | GET | `/answers/mine?versionId=&type=` | my saved answers |
| 7.1 | GET | `/energy/balance` | balance |
| 7.2 | GET | `/energy/packages` | top-up tiers |
| 7.3 | POST | `/energy/purchase` | create mock order |
| 7.4 | POST | `/energy/purchase/confirm` | settle mock order |
| 7.5 | POST | `/energy/claim` | free cells (registration / daily / task) |
| 7.6 | GET | `/energy/transactions?page=&limit=` | ledger |
| 8 | GET | `/users/me`, `/users/me/match-status` | cross-refs (users domain) that also carry match state |

---

## 3. Matching — `MatchingController` (`/matching`, JWT)

### 3.1 `POST /matching/start` — join the pool
Body `StartMatchDto` (all optional):
| field | type | rules |
|---|---|---|
| `mode` | `'romantic'\|'friend'` | `@IsIn`; omitted → romantic |
| `enhanced` | boolean | default false |
| `cells` | int 1..5 | only meaningful for friend+enhanced (= guaranteed friend count); romantic ignores it (cost fixed 3). Values outside 1..5 → 400 |

Server sequence (all inside one transaction after pre-checks):
1. User must exist (404 `'User not found'`) and not be BANNED (403 `'Account has been banned, cannot start matching'`).
2. **Questionnaire gate**: if an active questionnaire of that mode exists with ≥1 question and the user has **zero** answers for it → 400 `'Please complete the partner questionnaire before matching'` (friend: `'…the friend questionnaire…'`). (Note: gate is "at least one answer", weaker than `/questionnaire/completion` which requires all required questions.)
3. If `enhanced`: cost = 3 (romantic) or clamp(cells,1,5) (friend); if `availableEnergy < cost` → 400 `'Not enough energy, please top up'`.
4. If UMS already `searching` → clears `weeklyMatchNote` and returns **200** `{ status:'SEARCHING', message:'Already matching, please wait' }` — **no energy deducted, enhanced flag NOT written**. H5 detects this case by regex `/already matching/i` on `message` and shows "Already in this round's pool — leave the pool first to join with Enhanced" (and must not treat it as a successful enhanced purchase).
5. Romantic exclusivity: if UMS is `matched|confirming|relationship` → 400 `'You already have an active or confirmed partner, partner matching has stopped'`. Friend mode can (re)join while having friends.
6. CAS update UMS → `searching`, `matchSearchingSince=now`, `weeklyMatchNote=null`.
7. Upserts `UserMatchPreferences.enhancedModeEnabled = enhanced` (friend also `friendEnhancedCells = enhanced ? cost : 1`), then if enhanced calls `consumeInTx` (CONSUME ledger row, reason `"Romantic enhanced pre-deduction of 3 cells"` / `"Friend enhanced pre-deduction of N cells"`). A concurrent double-spend inside `consumeInTx` also yields 400 `'Not enough energy, please top up'`.

Response `data`:
```json
{ "status": "SEARCHING", "message": "Joined this round's matching pool, results will be announced at the next match" }
// or, enhanced:
{ "status": "SEARCHING", "message": "Joined this round's matching pool (enhanced: pre-deducted 3 cells)" }
// or, already in pool (200!):
{ "status": "SEARCHING", "message": "Already matching, please wait" }
```
Enhanced is **per round**: the match job clears `enhancedModeEnabled` after running, so each round requires a new paid `/start`. H5 flow before calling: check `/questionnaire/completion`, refresh `/energy/balance`, show a confirm card ("N cells will be spent now (you have M). Fully refunded if no match this round." / friend: "Shortfall refunded if the guarantee is not met."), then optimistic render `state:'searching'` and call start.

### 3.2 `POST /matching/stop?mode=romantic|friend` — leave the pool
No body. Query `mode` optional (default romantic).
- UMS must be `searching`, else 400 `'You are not currently matching, cannot stop'`.
- romantic → UMS `idle`, response `{ status:'IDLE', message:'Matching stopped' }`.
- friend → UMS set to idle then recomputed from existing friend matches: `relationship` if any `FRIEND_CONFIRMED`, `matched` if any temp friend, else `idle`. Response `{ status: 'IDLE'|'MATCHED'|'RELATIONSHIP', message: 'Matching stopped' | 'Stopped searching for new friends; existing friends kept' }`.
- **Energy pre-deducted for enhanced is NOT refunded on stop** (nothing in `stopMatchForUser` touches energy; the `enhancedModeEnabled` flag stays true until the next job run clears it — and since the user is no longer `searching` the job will not see them, so the cells are simply consumed). H5 UI text warns about this only implicitly.

### 3.3 `GET /matching/status?mode=romantic|friend` — full status (the main screen model)
Common fields on every response:
```ts
{
  mode: 'romantic'|'friend',
  matchConfig: { cronExpr: string, description: string|null } | null,   // enabled MatchConfig
  nextRunAt: string|null,   // ISO UTC of next cron fire (in config tz); null if no config / invalid cron
  state: 'idle'|'searching'|'no_match'|'matched'|'confirming'|'relationship',
  ...mode-specific
}
```
**Romantic** (`mode==='romantic'`) — single-partner:
```ts
// no active match:
{ ..., state: 'idle', match: null, partner: null }
{ ..., state: 'searching'|'no_match', searchingSince: string|null, match: null, partner: null }
// active match (MATCHED_ROMANTIC / ROMANTIC_CONFIRMING / RELATIONSHIP_ROMANTIC):
{ ..., state: 'matched'|'confirming'|'relationship',
  match: {
    id: string, status: MatchStatus,
    myConfirmed: boolean, partnerConfirmed: boolean,
    remainingMs: number|null,          // ms left in the 48h window (>=0) for temp statuses; null once RELATIONSHIP_ROMANTIC
    score: number|null,                // compatibility 0..100 (null for QR-connected friends; romantic always set)
    matchedAt: string,                 // Match.createdAt
    relationshipStartedAt: string|null,
    confirmedAt: string|null
  },
  partner: PublicProfile|null }
```
Only the newest active romantic match is considered (`orderBy createdAt desc`, `findFirst`).

**Friend** (`mode==='friend'`) — multi:
```ts
{ ..., state: 'searching'|'no_match', searchingSince: string|null, matches: FriendMatch[] }   // while in pool (matches still lists existing friends!)
{ ..., state: 'matched' | 'idle' | 'relationship' | ..., matches: FriendMatch[] }             // not in pool: 'matched' iff matches.length>0 else raw UMS value
FriendMatch = {
  matchId: string, status: 'MATCHED_FRIEND'|'FRIEND_CONFIRMING'|'FRIEND_CONFIRMED',
  score: number|null, myConfirmed: boolean, partnerConfirmed: boolean,
  remainingMs: number|null,   // temp only
  matchedAt: string,
  partner: PublicProfile|null
}
```
`matches` = all non-dissolved friend matches in `FRIEND_ACTIVE` statuses, newest first, includes QR/search-connected friends (`FRIEND_CONFIRMED`, `score:null`, `metadata.source='qr-connect'|'search-connect'` not exposed).

Client behaviours worth replicating (H5): poll every 30 s while not in a terminal state (romantic `relationship` stops polling; friend polls always); on friend `no_match` with existing `matches`, show the friends list plus a "match again" CTA; tick `remainingMs` locally from `Date.now()+remainingMs`.

### 3.4 `GET /matching/result?mode=` — flattened alias of status
Romantic:
```ts
{ matched: false, mode: 'romantic', status: 'NO_MATCH', state }                       // no active match
{ matched: true, mode: 'romantic', matchId, status: MatchStatus, state, myConfirmed, partnerConfirmed,
  score, matchedAt, relationshipStartedAt, confirmedAt, remainingMs, partner }         // same values as status.match/partner
```
Friend: `{ matched: boolean, mode:'friend', state, matches: FriendMatch[] }`. H5 does not use this endpoint (uses `/status`); iOS may ignore it.

### 3.5 `GET /matching/milestones` — couple stats
No params. Looks up the newest `RELATIONSHIP_ROMANTIC` match for the caller.
```ts
{ state: 'none' }
// or
{ state: 'relationship',
  daysTogether: number,        // max(1, floor((now - startedAt)/day) + 1)
  messageCount: number,        // Message rows on this match
  postCount: number,           // SquarePost.coupleMatchId == match.id
  sharedInterests: string[],   // intersection of both profiles' interests (order = mine)
  matchScore: number|null,
  startedAt: string }          // relationshipStartedAt ?? createdAt
```
H5: milestone overlay opens only when `/matching/status` state is `relationship`; renders empty state if `state!=='relationship'`.

### 3.6 `POST /matching/:matchId/confirm-relationship` — confirm (double-confirm)
No body. Works for both modes (mode derived from the Match row).
- 404 `'Match not found'`; 403 `'You do not belong to this match'`.
- Status must be temp (`MATCHED_*`/`*_CONFIRMING`) else 400 `'Cannot confirm in the current status'`.
- `now > createdAt + 48h` → 400 `'Confirmation window has expired'`.
- Romantic only: if caller already has another `RELATIONSHIP_ROMANTIC` → 400 `'You already have a partner, cannot confirm a new partner match'`.
- Already confirmed by me → 200 `{ status:'WAITING', message:'You have confirmed, waiting for the other party to confirm...' }` (idempotent).
- Otherwise sets my flag, status → `ROMANTIC_CONFIRMING`/`FRIEND_CONFIRMING`, my UMS → `confirming` (friend: not if already `relationship`). If both flags now true → status `RELATIONSHIP_ROMANTIC` (+`relationshipStartedAt`) or `FRIEND_CONFIRMED`, `confirmedAt=now`, both UMS → `relationship`, both get notification `relationship_confirmed`, SSE `notification` event to both, analytics `confirmed`.

Response `data` (H5 treats status ∈ {CONFIRMED, MATCHED, RELATIONSHIP, FINAL, ACTIVE} case-insensitively as "finalized"; effectively `'RELATIONSHIP_ROMANTIC'|'FRIEND_CONFIRMED'` vs `'WAITING'`):
```json
{ "status": "WAITING", "message": "You have confirmed, waiting for the other party to confirm..." }
{ "status": "RELATIONSHIP_ROMANTIC", "message": "You've both confirmed — your relationship is official!" }
{ "status": "FRIEND_CONFIRMED", "message": "You've both confirmed — you're friends now!" }
```
Confirm lives in the **chat header** in H5 (temp sessions only), not on the match screen.

### 3.7 `POST /matching/:matchId/dissolve` — reject / break up
Body `DissolveDto`: `{ reason?: string }` (optional; H5 chat sends `{reason:'user_dissolved'}`, match screen sends `{}`).
- 404 / 403 as above; status must be one of the six active statuses else 400 `'Cannot end in the current status'`.
- Sets `DISSOLVED`, `dissolvedBy/At/Reason`; notifies the **other** user (`relationship_dissolved`, title `'Relationship ended'`/`'Friendship ended'`, body `"<myNickname> ended your relationship/friendship."`), SSE to them; analytics `rejected` (was temp) or `dissolved` (was permanent).
- UMS: romantic → both users' romantic UMS → `idle` (unless currently `searching`); friend → recompute both (`relationship`/`matched`/`idle`).
- No energy refund on dissolve.

Response: `{ message: 'Relationship ended, you can start matching again' }` (romantic) or `{ message: 'Friendship ended' }`.

### 3.8 `GET /matching/preferences?mode=` — read preferences
Returns the raw `UserMatchPreferences` row when it exists, else a synthesized default. **Shape differs between the two cases** (row has extra `id/userId/createdAt/updatedAt`; default has no such keys) — decode all as optional:
```ts
{
  id?: string, userId?: string, createdAt?: string, updatedAt?: string,   // only when a row exists
  mode: 'romantic'|'friend',
  requireSameCity: boolean,          // default false
  requireSameUniversity: boolean,    // default false
  requireSameMajor: boolean,         // reserved, default false
  preferredNationalities: string[],  // reserved, []
  preferredMbti: string[],           // reserved, []
  preferredGender: string|null,      // 'male'|'female'|… free string; null = any
  ageMin: number|null, ageMax: number|null,   // null = any age
  universityStage: string|null,      // comma-joined subset of 'undergraduate','master','doctor'; null = any
  preferredInterests: string[],      // friend soft-boost (H5 caps at 3)
  preferredActivities: string[],     // friend soft-boost
  friendRequirements: string|null,   // friend free text (≤500)
  enhancedModeEnabled: boolean,      // READ-ONLY here (default false); true only between a paid /start and the next job run
  friendEnhancedCells: number|null,  // READ-ONLY here (default 1)
  matchBasis: string|null,           // 'questionnaire'|'profile'|'both' (default 'both')
  extraMatchInfo: string|null        // free text ≤500 shown verbatim in the H5 summary box
}
```
Side effect of a `/start` with enhanced: `enhancedModeEnabled=true` (+cells) becomes visible here until the job runs — H5 uses this to show "enhanced active this round · N cells" while `searching`.

### 3.9 `PUT /matching/preferences` — save preferences
Body `UpdateMatchPreferencesDto` — every field optional; **only these keys are accepted, anything else → 400** (this is how "enhanced fields are ignored": `enhancedModeEnabled`/`friendEnhancedCells` are not on the DTO, so sending them fails validation with `"property enhancedModeEnabled should not exist"`; likewise `id`, `userId`, `createdAt`, `updatedAt`).
| field | type | validation |
|---|---|---|
| `mode` | `'romantic'\|'friend'` | selects which row; default romantic |
| `requireSameCity` | boolean | |
| `requireSameUniversity` | boolean | |
| `requireSameMajor` | boolean | reserved |
| `preferredGender` | string | any string; send `null`? — `@IsOptional` accepts `null`/`undefined`, so `null` clears it (H5 sends `null` for "all") |
| `ageMin`, `ageMax` | int 18..60 | `null` allowed (= any); H5 sends `null,null` when "any age" is checked, else min/max ordered |
| `universityStage` | string | comma list; server whitelists `undergraduate,master,doctor`, dedupes, unknown-only → stored `null` |
| `matchBasis` | `'questionnaire'\|'profile'\|'both'` | |
| `extraMatchInfo` | string ≤500 | H5 sends `''` when cleared (stored as empty string, not null) |
| `preferredNationalities`, `preferredMbti`, `preferredInterests`, `preferredActivities` | string[] | each item string |
| `friendRequirements` | string ≤500 | |

Semantics: upsert of `(userId, mode)` with exactly the provided keys (partial update — omitted keys untouched). Side effect: clears `weeklyMatchNote='no_match'` for that mode (editing preferences = "I want to try again"). Returns the full stored row (same shape as GET with `id/userId/…`).

H5 payloads (for parity):
- romantic: `{ mode:'romantic', requireSameCity, requireSameUniversity, preferredGender: null|'male'|'female', ageMin, ageMax, universityStage: 'undergraduate,master'|null, extraMatchInfo }`
- friend: `{ mode:'friend', preferredInterests: string[≤3], preferredGender, ageMin, ageMax, requireSameUniversity, requireSameCity, extraMatchInfo }`
- H5 refuses to save while the mode is `searching`/in-pool ("locked while matching" toast) — server does not enforce this, it's a client rule.

### 3.10 `POST /matching/feedback/events` — behaviour analytics
Body `ReportMatchFeedbackEventsDto`: `{ events: [{ matchId: string, type: 'viewed'|'openedProfile' }] }`, max 50 items (`@ArrayMaxSize(50)`), other `type` values → 400 by DTO. Events whose `matchId` does not belong to the caller are silently dropped. Deduped per `(matchId, actorId, type)` — repeats are ignored server-side, so fire-and-forget is fine. Response `{ accepted: number }`.
H5 usage: `viewed` when a romantic match card / friend candidate card is rendered; `openedProfile` when opening the partner profile from chat. Client keeps an in-session Set to avoid re-sending; on failure it removes the key so it can retry.

### 3.11 `POST /matching/connect` — add friend by connect code (QR)
Body `{ code: string }` (required, `@IsString`). Trimmed; empty → 400 `'Connection code cannot be empty'`; unknown → 404 `'Invalid connection code'`; self → 400 `'You cannot add yourself'`; target BANNED → 400 `'This user is unavailable'`.
Creates/revives a `FRIEND` match with **ordered ids** (`[a,b].sort()`) directly in `FRIEND_CONFIRMED` (both confirmed, `confirmedAt=now`, `score:null`, `metadata:{source:'qr-connect'}`; a previously dissolved pair is resurrected on the same row). Both UMS(friend) → `relationship`. Target gets notification `friend_added` (`'New friend'` / `'Someone connected with you — open the chat and say hi!'`) + SSE.
Response: `{ matchId: string, message: 'Added — start chatting!', partner: PublicProfile|null }`. H5 then opens the chat for `matchId`. (Own connect code comes from `GET /users/me/connect-code` / `GET /users/me`.)

### 3.12 `POST /matching/connect-user` — add friend by userId
Body `{ userId: string }`. Same semantics/response as 3.11 with `metadata.source='search-connect'`; 404 `'User not found'` if unknown. H5 no longer calls it (people search was removed 2026-08-19) but it is live.

### 3.13 Legacy aliases (romantic single-partner semantics; keep only for compatibility)
| endpoint | behaviour |
|---|---|
| `POST /matching/confirm` | finds caller's newest `MATCHED_ROMANTIC`/`ROMANTIC_CONFIRMING` (404 `'No match pending confirmation'`) → same as 3.6 |
| `POST /matching/reject` | same lookup → dissolve with reason `'User rejected the match'` |
| `POST /matching/proposals/:proposalId/confirm` | = 3.6 with `matchId=proposalId` |
| `POST /matching/proposals/:proposalId/reject` | = 3.7 with reason `'User rejected the match'` |
| `POST /matching/dissolve` body `{reason?}` | newest active romantic match (404 `'You have no active relationship at the moment'`) → 3.7. H5 still uses this as a fallback when it has no `matchId`. |

---

## 4. Relationships — `GET /relationships/graph`
No params. Nodes = my confirmed relationships (`RELATIONSHIP_ROMANTIC`, `RELATIONSHIP_MODE`, `FRIEND_CONFIRMED`, `dissolvedAt IS NULL`).
```ts
{
  self:  { id: string, nickname: string /* 'You' fallback */, avatarUrl: string /* '' fallback */ },
  nodes: Array<{ id: string, nickname: string /* 'Friend' fallback */, avatarUrl: string, school: string, kind: 'romantic'|'friend' }>,
  edges: Array<{ a: string /* my id */, b: string /* node id */, weight: number /* 1..6 (stroke px) */, raw: number /* intimacy score, 3 dp */, msgCount: number, posts: number }>
}
```
Empty: `{ self, nodes: [], edges: [] }`. Intimacy = `log1p(msgCount) + 2·exp(−daysSinceLastMsg/14) + 1.5·log1p(postInteractions)`; anonymous comments are excluded from post interactions (privacy). H5 renders it as an SVG star graph in the add-friend panel.

---

## 5. Questionnaire — `QuestionnaireController` (`/questionnaire`, JWT)

### 5.1 `GET /questionnaire/active?type=romantic|friend`
`type` optional, default romantic (invalid → romantic). 404 `'No questionnaire available'` if that mode has no active version. Returns the Prisma `QuestionnaireVersion` with enabled questions ordered by `order`, each with options ordered by `order`:
```ts
{
  id: string, version: number /* global auto-increment, e.g. romantic v4 / friend v5 in prod */,
  type: 'ROMANTIC'|'FRIEND', title: string, description: string|null,
  isActive: true, publishedAt: string|null, createdAt: string, updatedAt: string,
  questions: Array<{
    id: string, questionnaireId: string,
    type: 'SINGLE_CHOICE'|'MULTIPLE_CHOICE'|'SCALE'|'TEXT',
    title: string /* zh */, titleEn: string|null /* en; fall back to title */,
    description: string|null,
    isRequired: boolean, isEnabled: true, order: number, group: string|null /* zh section label e.g. '价值观','沟通' */,
    code: string|null,                 // stable id e.g. 'db_distance' (null on legacy v1 questions)
    semantics: 'filter'|'similar'|'complement'|'freeform',   // filter = hard-gate only, not scored
    hardness: 'hard'|'soft',
    weight: number,                    // default 1
    target: 'self'|'partner'|'both',
    createdAt: string, updatedAt: string,
    options: Array<{ id: string, questionId: string, label: string /* zh */, labelEn: string|null, value: string /* stable snake_case, THIS is what you submit */, order: number, createdAt: string, updatedAt: string }>
  }>
}
```
`semantics/hardness/weight/target/code` are matching-engine metadata; the UI does not need them except `isRequired` (TEXT questions are optional) and `type`. SCALE and TEXT questions have `options: []`.

Rendering rules from H5 (replicate): SCALE = 5 rows `1..5` labelled *Strongly Disagree / Disagree / Neutral / Agree / Strongly Agree* (1 = strongly disagree; the version description says "量表题 1=完全不同意，5=完全同意"); SINGLE_CHOICE = radio list; MULTIPLE_CHOICE = checkbox list with hint "Select all that apply"; TEXT = textarea with "Optional — leave blank to skip" when `isRequired===false`. Show `titleEn`/`labelEn` in English UI, `title`/`label` in Chinese, falling back to Chinese.

Current production banks (seeded from `prisma/questionnaire-v2.ts`; admin can republish so do not hardcode): romantic 18 questions — `db_distance` (single, hard filter), `val_family`, `val_openness` (scale), `ser_intent` (single), `ser_pace`, `ser_exclusive`, `life_schedule`, `life_clean` (scale), `life_smoking_self` (single), `life_smoking` (single, hard), `com_expression` (scale, complement), `com_conflict` (single), `com_frequency`, `fin_style` (scale), `fin_aa` (single), `asp_shared` (multi), `asp_traits` (text, optional), `db_other` (text, optional, hard). Friend 14 — `db_distance`, `val_family`, `val_openness`, `soc_energy`, `soc_initiative` (scale, complement), `act_types` (multi), `act_style` (single), `pace_plan`, `pace_reply` (scale), `plan_stage` (single), `plan_future` (scale), `asp_shared`, `asp_traits`, `db_other`. Groups (zh): 价值观 / 恋爱观 / 生活习惯 / 沟通 / 财务观 / 社交风格 / 兴趣活动 / 人格节奏 / 生活规划 (some questions have `group:null`).

### 5.2 `GET /questionnaire/completion`
No params. Both modes at once:
```json
{ "romantic": { "completed": true, "versionId": "cl…" }, "friend": { "completed": false, "versionId": "cl…" } }
```
`completed` = answered count of **required** enabled questions on the active version ≥ required count. `versionId` is absent (key missing) when that mode has no active version (then `completed:false`). Note this is stricter than the `/matching/start` gate (which only needs ≥1 answer). H5: before entering a match mode it checks this; `completed:false` + state `idle` → shows the questionnaire prompt; if the user is already `searching`/matched it renders normally with a "refill questionnaire" banner (never blocks a user who needs to reach "leave pool"). On fetch failure H5 assumes completed.

---

## 6. Answers — `AnswersController` (`/answers`, JWT)

### 6.1 `POST /answers` — submit (upsert) answers
Body `SubmitAnswersDto`:
```json
{ "questionnaireVersionId": "cl…", "answers": [ { "questionId": "cl…", "value": <any JSON> } ] }
```
`value` is `@Allow()` (any JSON). Formats the engine understands (send exactly these):
- SCALE → **number** `1..5` (H5 sends a JS number; server scoring does `Number(value)` and ignores values outside 1..5)
- SINGLE_CHOICE → option `value` string (e.g. `"must_same_city"`)
- MULTIPLE_CHOICE → `string[]` of option values
- TEXT → string
Extra keys inside an answer item → 400 (whitelist).

Server validation order:
1. 404 `'Questionnaire version not found'`.
2. 400 `'This questionnaire version no longer accepts submissions, please use the latest version'` if not `isActive`.
3. Every enabled **required** question must be present with a non-empty value (`null`, `''`, whitespace, `[]`, or array of empties count as empty) → 400 `'The following required questions are not answered: <title, title…>'` (titles are the zh `title`).
4. Any `questionId` not belonging to that version → 400 `'Submission contains questions that do not belong to this questionnaire version'`.
5. Upsert each answer on `(userId, questionnaireVersionId, questionId)` — resubmission overwrites; partial resubmits are fine as long as all required ones are included.

Response: `{ message: 'Questionnaire submitted successfully', answeredCount: number, questionnaireVersion: number }`.
H5 drops blank entries before posting and locally checks required questions first (jumps to the first missing one).

### 6.2 `GET /answers/mine?versionId=&type=romantic|friend`
Both filters optional (`type` → filters by `questionnaireVersion.type`). Sorted `submittedAt desc`. Array of:
```ts
{ id: string, userId: string, questionnaireVersionId: string, questionId: string,
  value: any /* as submitted */, submittedAt: string, updatedAt: string,
  question: { title: string, type: QuestionType },
  questionnaireVersion: { version: number, title: string } }
```
H5 calls `/answers/mine?versionId=<active id>` when opening a questionnaire to pre-fill and jump to the first unanswered question.

---

## 7. Energy — `EnergyController` (`/energy`, JWT)

### 7.1 `GET /energy/balance`
Lazily creates the account. `{ totalEnergy: number, usedEnergy: number, availableEnergy: number }`. H5 refreshes it on app load, after purchase/claim, before enhanced start, and on `energy_refunded` notifications.

### 7.2 `GET /energy/packages`
Static: `[ { packageId:'pkg_30', cells:30, priceCny:30 }, { packageId:'pkg_60', cells:60, priceCny:58 }, { packageId:'pkg_100', cells:100, priceCny:88 } ]`.

### 7.3 `POST /energy/purchase` — create order (mock payments)
Body `{ packageId: 'pkg_30'|'pkg_60'|'pkg_100' }` (`@IsIn`). Does **not** credit anything. Response:
```json
{ "orderId": "order_<6 chars of userId>_<epoch ms>", "packageId": "pkg_30", "cells": 30, "priceCny": 30, "paymentIntent": { "mock": true } }
```

### 7.4 `POST /energy/purchase/confirm` — settle
Body `{ orderId: string, packageId: 'pkg_30'|'pkg_60'|'pkg_100', transactionId?: string }`. Mock: credits `cells` for `packageId` immediately (RECHARGE row, `metadata:{rechargeMethod:'mock', orderId, packageId, transactionId}`), idempotent on `dedupeKey='recharge:'+orderId` (re-confirming the same orderId is a no-op returning the current balance). Empty `orderId` → 400 `'Missing order number'`.
Response `{ success: true, availableEnergy: number, transactionId: string /* = transactionId ?? orderId */ }`.
H5 flow: pick package → pick payment method (UI only) → `purchase` → `confirm` → update balance. **There is no real payment; iOS must expect this to change (StoreKit) — keep the two-step shape.**

### 7.5 `POST /energy/claim` — free cells
Body `{ claimType: 'registration'|'daily-checkin'|'task-complete', taskKey?: string }`. Grants **1 cell** each. Dedupe: registration once per lifetime; daily-checkin once per server-local calendar day; task-complete per `taskKey` (missing taskKey → 400 `'task-complete requires a taskKey'`). Already claimed → 400 `'Registration energy bonus already claimed'` / `'Already claimed today'` / `'This task reward has already been claimed'`.
Response `{ success: true, grantedEnergy: 1, availableEnergy: number }`. (H5 has `claimEnergy()` defined but no UI currently calls it.)

### 7.6 `GET /energy/transactions?page=1&limit=20`
Query DTO (`page ≥1`, `limit ≥1`, server caps limit at 100; **any other query key → 400**). Newest first.
```ts
{ items: Array<{ id: string, type: 'RECHARGE'|'CONSUME'|'REFUND'|'CLAIM', amountEnergy: number /* always positive */, balanceAfter: number,
                 relatedMatchId: string|null, relatedMatchMode: 'romantic'|'friend'|null, reason: string|null,
                 metadata: object|null, createdAt: string }>,
  total: number, page: number, limit: number }
```
Reason strings you will see: `"Romantic enhanced pre-deduction of 3 cells"`, `"Friend enhanced pre-deduction of N cells"`, `"Top up N energy cells"`, `"Registration bonus: 1 energy cell"`, `"Daily check-in: 1 energy cell"`, `"Task reward"`, `"Event ticket: <title>"`, refund reasons in Chinese (`'本轮无可配对象'`, `'增强匹配本轮未配对，退还能量'`, `'增强匹配未达保证数，退还差额'`, `'增强匹配 48 小时内未确认，退还能量'`). REFUND `metadata` may contain `{ dedupeKey, eventId, ticketId }`; CONSUME for tickets has `{ scene:'event_ticket', eventId }`. H5 does not render this list today.

---

## 8. Cross-domain endpoints that also expose match state (users domain — listed for completeness)
- `GET /users/me` → includes `modeStates: Array<{ mode:'romantic'|'friend', matchState: string, matchSearchingSince: string|null }>` (raw UMS values, §1.2). H5 boot (`checkUserState`) uses `/users/me`; matching screens then call `/matching/status`.
- `GET /users/me/match-status?mode=` (legacy) → `{ mode, matchState, matchSearchingSince, matchConfig:{cronExpr,description}|null, currentMatch:{id,status}|null, isSearching: boolean }`. Not used by H5.
- `GET /users/:id/public-profile` (partner profile page) and `GET /chat/sessions` (which is where confirm/dissolve buttons live) are documented by other maps; chat sessions carry `matchId`, `mode`, `status`, `sessionType:'temp'|…` derived from the same `MatchStatus` values above.

---

## 9. Notifications produced by this domain (type → when; `metadata`)
The client should deep-link on these (`GET /notifications` is another map; SSE event `{type:'notification'}` tells you to refetch):
| `type` | title / body (English, server-side) | metadata |
|---|---|---|
| `match_result` | `'Your match is here'` / `'New friend match'` | `{ matchId, mode }` |
| `no_match` | `'No match this round'` | `{ mode }` |
| `match_expired` | `'Match expired'` — 48h without double confirm | `{ mode }` |
| `relationship_confirmed` | `"You're now a couple"` / `"You're now friends"` | `{ matchId, mode }` |
| `relationship_dissolved` | `'Relationship ended'` / `'Friendship ended'` | `{ matchId, mode }` |
| `friend_added` | `'New friend'` (target of connect) | `{ matchId, mode:'friend' }` |
| `energy_refunded` | `'Energy refunded'`, body varies by reason | `{ mode, energy:number, refundReason:'empty_pool'|'unconfirmed_48h'|'event_cancelled', matchId, …}` |
H5 localizes these client-side by regex on the English body (notifications.js) — iOS should do the same or map by `type`.

---

## 10. Server-side lifecycle the client cannot see but must design around
1. **Round execution** (cron, romantic then friend): candidates = users with UMS `searching` for that mode, `ACTIVE`, with a Profile (romantic additionally requires `gender`, `genderPref`, `age`). For each generated pair: upsert Match (`@@unique(userAId,userBId,mode)` — a previously EXPIRED/DISSOLVED pair is **reused and reset**, `createdAt` reset so the 48h restarts), both UMS → `matched`, `match_result` notifications. Romantic pairs are skipped if either user already has an active romantic match; friend pairs skipped if that pair already has an active friend match. Users who stay unmatched get `weeklyMatchNote='no_match'` (UMS stays `searching`, so they roll into next week automatically unless they stop) + `no_match` notification.
2. **Enhanced refunds** happen right after the job: empty pool / zero matches (romantic) → full cost back; friend → `cells − actual` back; each refund also creates an `energy_refunded` notification. Then `enhancedModeEnabled` is reset to false for all enhanced candidates (per-round purchase).
3. **48h expiry** sweep every 10 minutes: temp matches older than 48h → `EXPIRED`, `match_expired` notification to both, UMS recomputed (romantic `matched/confirming`→`idle`; friend by remaining friends). Chat list hides EXPIRED. Optional refund only if `energy.refundOnExpire` SystemConfig is true (default false).
4. Romantic exclusivity: while `matched/confirming/relationship`, `/start` is refused; friend mode can accumulate up to 5 new candidates per round on top of existing friends.
5. All confirm/dissolve/connect write analytics events and SSE `notification` pushes; none of that requires client action.

---

## 11. H5 behaviours to mirror (client-side rules, not enforced by API)
- Poll `/matching/status?mode=` every 30 s on the match tab (stop when romantic `relationship`); count consecutive failures and stop after N.
- Countdown to reveal = `nextRunAt` from status → fallback local cron parse → fallback next Friday 17:00; week strip highlights the reveal day only if it falls in the current week.
- Preference editor is read-only while the mode is `searching`/`no_match` (locked "while matching · leave the pool to edit"); enhanced toggle + friend cells slider (1..5) live in the same sheet but are client state only — they are submitted **only** via `/matching/start` body.
- Enhanced start requires an explicit confirm card showing cost and current balance; cancel-by-backdrop aborts entirely, "join without it" proceeds with `enhanced:false`.
- "Already matching" response (200, message regex) must not be treated as an enhanced purchase.
- Questionnaire: language-aware `titleEn/labelEn`; SCALE stored as number; blank answers dropped before POST; after submit switch home view to that mode.
- Chat header (temp sessions) hosts Confirm / Delete-relationship; `WAITING` → show "waiting for the other party" state with `myConfirmed=true`.

---

## 12. Gotchas / surprises (read before coding)
1. **`PUT /matching/preferences` rejects unknown keys with 400** — including `enhancedModeEnabled`, `friendEnhancedCells`, `id`, `userId`, `createdAt`, `updatedAt`, `mode`-less echo of the GET body. Build the PUT body from a whitelist.
2. **`GET /matching/preferences` has two shapes** (DB row vs synthesized default); `friendEnhancedCells` is nullable in the row.
3. **`POST /matching/start` returns 200 with `'Already matching, please wait'` when already in pool** — no deduction, no enhanced flag. Detect via `message`.
4. **Leaving the pool does not refund enhanced energy.**
5. Validation errors carry `message` as a **string array**; other errors a string. Decode `message` as `String | [String]`.
6. `/matching/start` questionnaire gate = "≥1 answer", `/questionnaire/completion` = "all required answered"; a user can be `completed:false` yet allowed to start (H5 gates on completion anyway).
7. `remainingMs` is computed from Match `createdAt`, which is **reset when a previously expired/dissolved pair is re-matched** — do not cache per matchId across rounds.
8. Friend `state` while in pool is `'searching'`/`'no_match'` even though `matches[]` may be non-empty — always render `matches` regardless of `state`.
9. Friend mode never yields `state:'confirming'`; per-match confirm state is in `FriendMatch.myConfirmed/partnerConfirmed/status`.
10. `partner` field list is config-driven (`public_profile_fields`); production currently returns exactly `nickname, school, grade, age, city, interests, bio, avatarUrl, coverUrl, tags` + `userId`, `verificationStatus`. Treat all as optional; `partner` can be `null`.
11. SCALE direction: **1 = strongly disagree … 5 = strongly agree** (flipped on 2026-08-30 for v2; old iOS code already used this direction).
12. `POST /answers` error for missing required questions lists Chinese titles; map to local question ids yourself before submitting to avoid showing that string.
13. `GET /answers/mine` without filters returns answers from **all** versions (including retired ones); pass `versionId` from `/questionnaire/active`.
14. `/energy/purchase/confirm` is idempotent per `orderId`; `orderId` is not stored server-side (mock) — the `packageId` you pass decides the credited amount. Real payments will replace this.
15. Daily check-in resets at the **server's** local midnight (container TZ), not the user's.
16. `/energy/transactions` is the only endpoint with a query DTO — extra query params (e.g. `mode`) → 400.
17. Notification bodies/titles are English on the wire; `energy_refunded` distinguishes scenario via `metadata.refundReason`.
18. `connect` resurrects a dissolved friendship on the same Match row (same `matchId`), and both sides end up `FRIEND_CONFIRMED` without any confirm step.
19. Every request re-validates the user; a BANNED account gets 401 (not 403) from all of these endpoints.
