# API contract map — square / events / ads / reports / discovery / leaderboard

Source of truth (read verbatim, 2026-09-03):

- `apps/api/src/main.ts`, `apps/api/src/common/{filters,interceptors,guards,decorators,dto}`
- `apps/api/src/square/{square.controller.ts,square.service.ts,dto/square.dto.ts}` (admin controller/service skipped)
- `apps/api/src/events/{events.controller.ts,events.service.ts,dto/events.dto.ts}`
- `apps/api/src/ads/{ads-public.controller.ts,ads.service.ts (getFeed/reportEvents),dto/ads.dto.ts}`
- `apps/api/src/reports/*`, `apps/api/src/discovery/*`, `apps/api/src/leaderboard/*`
- `apps/api/src/energy/energy.service.ts` (consumeInTx error), `apps/api/src/uploads/uploads.controller.ts`
- `apps/api/prisma/schema.prisma` models SquarePost / SquarePostComment / SquareCommentLike / SquarePostLike / SquarePollVote / Event / EventTicket / Report / AdCampaign / UserSuggestionDismiss / Profile / AdminUser
- H5 consumers cross-checked: `apps/h5/src/modules/{square.js,ads.js,profile.js,settings.js,i18n.js,core.js}`, `apps/h5/src/state.js`

---

## 0. Global conventions (apply to every endpoint below)

### 0.1 Base URL / prefix
- Global prefix: **`/api/v1`** (`app.setGlobalPrefix('api/v1')`). Every path in this doc is relative to it.
- H5 derives base as: localhost / 127.0.0.1 / bare IPv4 → `http(s)://<host>:3001/api/v1`; otherwise `https://api.<domain>/api/v1` where `<domain>` = hostname with leading `app.` stripped. Production: `https://api.unimatcha.ai/api/v1`.
- Uploaded images are served from `<api-origin>/uploads/<uuid>.<ext>` (NOT under `/api/v1`), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`.
- Swagger UI at `<api-origin>/api/docs`.

### 0.2 Auth
- All endpoints in this doc are **user-JWT protected** (`@UseGuards(JwtAuthGuard)` at controller level; none are `@Public`).
- Header: `Authorization: Bearer <token>` (token from `/auth/login` or `/auth/register`; payload `{sub, email, role:'user'}`).
- `req.user` = `{ id, email, status }` — controllers read `@CurrentUser('id')`.
- 401 conditions: missing/expired/invalid token; `role !== 'user'` (admin tokens rejected); user deleted (`'User not found or has been deactivated'`); user `status === 'BANNED'` (`'Your account has been banned'`). H5 on any 401: wipe token, stop polling/SSE, return to auth screen.

### 0.3 Response envelope (TransformInterceptor, every 2xx)
```json
{ "success": true, "data": <handler return>, "message": <handler return .message or undefined>, "timestamp": "ISO-8601" }
```
- `data` = the raw service return value (object OR array). If the service returns an object that itself has a `data` key, the interceptor unwraps `data.data` — none of the endpoints here do that, but write the decoder tolerant (H5 uses `unwrap = x => x?.data ?? x`).
- When the service return includes a `message` field (e.g. like/report/delete), it is BOTH inside `data` and copied to the top-level `message`.

### 0.4 Error body (HttpExceptionFilter, every non-2xx)
```json
{ "success": false, "statusCode": 400, "message": "…", "errors": null, "timestamp": "ISO", "path": "/api/v1/…" }
```
- `message` is a **string** for service-thrown exceptions, but for **DTO validation failures it is an array of strings** (class-validator messages such as `"content must be a string"`, `"property foo should not exist"`). Decode `message` as `String | [String]`.
- Unhandled exceptions → 500 `"Internal server error"`.
- 429 only exists on public/auth-code endpoints (`'Too many requests, please try again later'`); none of the endpoints in this doc are rate-limited.

### 0.5 Validation pipe
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, enableImplicitConversion: true })`.
- Consequence: **any body property not declared in the DTO → 400** (`"property X should not exist"`). Never send extra keys. Query params on the controllers below are read individually with `@Query('name')` (not DTO-validated), so unknown query params are ignored, and numeric query values are parsed by the controller (`Number(...)`).
- `@IsOptional()` fields accept `null`/`undefined` and skip validation.

### 0.6 Pagination conventions
- Offset paging: `page` (1-based, default 1) + `limit` (default 20). Square endpoints clamp `limit` to **[1, 50]**; discovery clamps to [1, 50] (suggestions [1, 30]); ads feed [1, 10].
- List responses carry `{ items, page, limit, total, hasMore }` (square) or `{ users, page, limit, total, hasMore, query }` (discovery). `hasMore = page*limit < total` (recommend feed uses `start+limit < total`).
- `cursor` query param is **accepted but ignored** on recommend/campus-wall (dead parameter).
- H5 always requests `?page=1&limit=20` for feeds and search; it never paginates further (no infinite scroll implemented). Pinned page has no paging at all.

### 0.7 Value formats
- IDs: Prisma `cuid()` strings.
- Dates: ISO-8601 strings (`2026-08-01T18:00:00.000Z`).
- Money/energy: integers in **cents**; ticket price in energy cells = `ceil(priceCents / 100)`; `pricePaidCents` is always `cells * 100`.
- Enums returned by Prisma are **UPPERCASE** (`board: "RECOMMEND" | "CAMPUS_WALL"`, `authorType: "USER" | "STUDENT_UNION" | "TEAM" | "SPONSOR"`); enums sent in request bodies are **lowercase** (`board: "recommend" | "campus_wall"`). Compare case-insensitively on the client.
- String status columns (not enums): `postType: "normal"|"poll"|"event"`, `reviewStatus: "approved"|"pending"|"rejected"`, Event `status: "published"|"closed"|"cancelled"`, Ticket `status: "valid"|"used"|"cancelled"`.

### 0.8 Image upload (used by create post / comment with image)
- `POST /uploads/image` — multipart/form-data, field name **`file`**, JWT required. Allowed MIME: image/jpeg, image/png, image/gif, image/webp (SVG rejected: `'Only JPEG, PNG, GIF, or WebP images are allowed'` 400). Max 8 MB. Missing file → 400 `'Please select an image to upload'`.
- Response `data`: `{ url: "https://api.<domain>/uploads/<uuid>.<ext>", filename: "<uuid>.<ext>" }`. Send the `url` verbatim in `images[]` / `imageUrl`.
- H5 uploads only at submit time (post publish / comment send), never when the picture is picked.

---

## 1. Square v2 — shared response shapes

### 1.1 `SquarePostCard` (items of recommend / campus-wall / pinned / search; also the return of create post)
Built as `shapePost(post)` + `cardType` + `sameSchool` + `myVote` annotation. All Prisma scalar columns of `SquarePost` are spread in **except** `metadata` (deleted) and `pinnedAt` (replaced by `isPinned`).

| field | type | notes |
|---|---|---|
| `id` | string | |
| `board` | `"RECOMMEND" \| "CAMPUS_WALL"` | uppercase |
| `authorType` | `"USER" \| "STUDENT_UNION" \| "TEAM" \| "SPONSOR"` | non-USER = official (large card) |
| `authorUserId` | string \| null | **absent (deleted) when `anonymous && authorType==='USER'`**; null for official posts |
| `authorUser` | `{ id: string, profile: { nickname: string\|null, avatarUrl: string\|null, school: string\|null } \| null } \| null` | **forced `null` for anonymous user posts**; null for official posts |
| `adminId` | string \| null | absent for anonymous user posts; set for official posts |
| `admin` | `{ id, name: string, organizationName: string\|null, role: "SUPER"\|"STUDENT_UNION"\|"TEAM"\|"SPONSOR"\|null } \| null` | official posts only |
| `school` | string \| null | school label to show top-right; for anonymous posts use ONLY this (never author profile) |
| `coupleMatchId` | string \| null | legacy, ignore |
| `title` | string \| null | |
| `content` | string | |
| `images` | string[] | absolute URLs |
| `likeCount` | int | stored counter |
| `commentCount` | int | stored counter (top-level + replies) |
| `anonymous` | bool | |
| `isSponsored` | bool | SPONSOR posts; show "Sponsored" badge |
| `postType` | `"normal" \| "poll" \| "event"` | |
| `pollOptions` | `[{ text: string, votes: int }] \| null` | only meaningful for `postType==='poll'` |
| `myVote` | int \| null | **only present on poll posts** (option index the viewer voted, null = not voted) |
| `reviewStatus` | `"approved" \| "pending" \| "rejected"` | non-approved only ever visible to the author |
| `reviewedByAdminId`, `reviewedAt`, `reviewNote` | string\|null, ISO\|null, string\|null | `reviewNote` = rejection note to show author |
| `eventId` | string \| null | |
| `event` | `EventSummary \| null` | see 1.3; present when `postType==='event'` |
| `isHidden` | bool | always false in feeds (only author sees own hidden post via detail) |
| `deletedBy`, `deletedAt`, `deleteReason` | string\|null, ISO\|null, string\|null | |
| `tags` | string[] | |
| `pinnedOrder` | int | admin ordering; ignore |
| `isPinned` | bool | derived from `pinnedAt != null`; show PINNED badge |
| `createdAt`, `updatedAt` | ISO | |
| `_count` | `{ likes: int, comments: int }` | live aggregates (Prisma include); H5 uses `likeCount/commentCount` instead |
| `isMine` | bool | viewer is the author (show delete entry) |
| `anonymousAuthor` | `{ aliasSeed: uint32, nickname: string, avatarUrl: null }` | **only on anonymous user posts** |
| `anonymousAuthorToken` | string (`"a_" + base36`) | **only on anonymous user posts**; compare against comment `anonymousAuthorToken` to mark "Author" |
| `cardType` | `"large" \| "medium" \| "small"` | feeds/search/pinned only (not on create-post return): official → large; campus wall → medium; else small |
| `sameSchool` | bool | feeds/search/pinned only: `post.school === viewer.profile.school` |
| `commentSnippet` | string (≤120 chars) | **search results only**, and only when the post itself did not match (hit was inside a comment) |

Never present on the client side: `metadata` (contains reporter ids), `pinnedAt`.

### 1.2 `SquarePostDetail` (`GET /square/v2/posts/:id`)
= `shapePost(post)` (same fields as 1.1 **minus** `cardType`, `sameSchool`, `commentSnippet`) **plus**:

| field | type |
|---|---|
| `myLiked` | bool |
| `myVote` | int \| null (poll posts only) |
| `comments` | `SquareComment[]` — top-level only (`parentCommentId == null`), ascending `createdAt`, each with `replies[]` (one level deep, ascending) |

### 1.3 `EventSummary` (embedded in post as `event`)
`{ id, title: string, venue: string|null, school: string|null, startAt: ISO, endAt: ISO|null, priceCents: int, capacity: int|null, ticketsSold: int, status: "published"|"closed"|"cancelled" }`
- Client derives: `remaining = capacity == null ? null : max(0, capacity - ticketsSold)`; `soldOut = remaining != null && remaining <= 0`; `ended = (endAt ?? startAt) < now`; `closed = status !== 'published'`; price label = `priceCents ? "<ceil(priceCents/100)> energy cell(s)" : "Free"`.

### 1.4 `SquareComment` (in post detail)
Fields come from Prisma `SquarePostComment` + include, passed through `anonymizeComments` then `shapeComments`:

| field | type | notes |
|---|---|---|
| `id` | string | |
| `postId` | string | |
| `userId` | string | **present for real-name comments; DELETED for anonymous comments** |
| `content` | string | may be `""` (image-only comment) |
| `imageUrl` | string \| null | |
| `anonymous` | bool | per-comment |
| `parentCommentId` | string \| null | |
| `createdAt`, `updatedAt` | ISO | |
| `user` | `{ profile: { nickname: string\|null, avatarUrl: string\|null } \| null }` | **no `user.id` ever**. For anonymous comments profile = `{ nickname: <english alias>, avatarUrl: null }` |
| `anonymousAuthor` | `{ aliasSeed: uint32, nickname: string, avatarUrl: null }` | anonymous comments only |
| `anonymousAuthorToken` | string | only on the **post author's own anonymous comments under an anonymous post** |
| `likeCount` | int | from `_count.likes` |
| `myLiked` | bool | |
| `replies` | `SquareComment[]` | top-level comments only; replies have `replies: []` |

Never present: `_count`, `likes` (stripped so liker ids don't leak).

### 1.5 Anonymous identity rendering (client-side, must match H5 exactly)
Backend sends only `aliasSeed` (uint32 HMAC-derived, per post — same person has the same seed within one post, different seeds across posts, cannot be reversed to a userId) plus an English `nickname` fallback. Client renders name + avatar from the seed:

```
n = UInt32(aliasSeed)
adjIndex    = n % 16
animalIndex = (n >> 8) % 16      // logical shift
emojiIndex  = (n >> 8) % 16      // same as animalIndex → same animal
bgIndex     = (n >> 16) % 16
EN name = ADJ_EN[adjIndex] + " " + ANI_EN[animalIndex]
ZH name = ADJ_ZH[adjIndex] + ANI_ZH[animalIndex]         // no space
avatar  = circle filled with BG[bgIndex], centered emoji EMOJI[emojiIndex] (~62% of box size)
```
Word lists (index-aligned; the backend's `nickname` uses the EN lists with the same formula):
- `ADJ_EN` = Curious, Quiet, Brave, Gentle, Witty, Clever, Mellow, Swift, Cozy, Bold, Sunny, Lucky, Calm, Eager, Noble, Jolly
- `ANI_EN` = Otter, Fox, Sparrow, Koala, Panda, Lynx, Heron, Robin, Wren, Bear, Finch, Hare, Seal, Crane, Marten, Quokka
- `ADJ_ZH` = 好奇的, 安静的, 勇敢的, 温柔的, 机灵的, 聪明的, 慵懒的, 敏捷的, 暖心的, 大胆的, 开朗的, 幸运的, 淡定的, 热心的, 优雅的, 欢快的
- `ANI_ZH` = 水獭, 狐狸, 麻雀, 考拉, 熊猫, 山猫, 白鹭, 知更鸟, 云雀, 小熊, 金翅雀, 野兔, 海豹, 仙鹤, 松貂, 小袋鼠
- `EMOJI` = 🦦, 🦊, 🐦, 🐨, 🐼, 🐆, 🦩, 🐤, 🕊️, 🐻, 🦜, 🐰, 🦭, 🦢, 🦡, 🦘
- `BG` = #FDE68A, #BFDBFE, #FBCFE8, #BBF7D0, #DDD6FE, #FED7AA, #A5F3FC, #E9D5FF, #FEF08A, #C7D2FE, #FECACA, #D9F99D, #99F6E4, #F5D0FE, #BAE6FD, #FDBA74

Rules the client must respect:
- Anonymous post: display name from seed, avatar from seed, school from `post.school` only. Do not show any real identity; `authorUser` is null anyway.
- Anonymous comment: name/avatar from seed; never initials of a real name.
- Author marking in the comment list: if `post.anonymous` → `comment.anonymousAuthorToken === post.anonymousAuthorToken`; else → `comment.userId === post.authorUserId` (official posts have `authorUserId == null` → nobody gets the badge). Never fall back from token to a userId.

---

## 2. Square v2 endpoints (`/square/v2/*`, all JWT)

### 2.1 `POST /square/v2/posts` — create post
Body `CreatePostDto`:

| field | type | rules |
|---|---|---|
| `board` | `"recommend" \| "campus_wall"` | **required**, `@IsEnum` |
| `title` | string | optional, ≤100 |
| `content` | string | **required**, ≤2000 (may be whitespace — H5 trims and refuses empty client-side) |
| `images` | string[] | optional (array; elements not validated) |
| `anonymous` | bool | optional, default false |
| `tags` | string[] | optional (stored, not used for ranking) |
| `postType` | `"normal" \| "poll"` | optional |
| `pollOptions` | string[] | optional; when `postType==='poll'`: 2–6 items, each string ≤50; blanks are trimmed/dropped server-side and <2 remaining → 400 `'A poll needs at least 2 options'` |

Server behaviour:
- `postType==='poll'` → board forced to `campus_wall`, `reviewStatus='pending'` (only the author can see it until approved), `pollOptions` stored as `[{text, votes:0}]`. Normal posts are `approved` immediately.
- `school` is taken from the author's `profile.school` (client cannot set it). Campus-wall post with no school → 400 `'Please fill in your school in your profile before posting to the campus wall'`.
- `authorType='USER'`.

Response `data`: `SquarePostCard` fields **without** `cardType`/`sameSchool`/`myVote` (plain `shapePost`).
Errors: 404 `'User not found'`, 400 as above, 400 validation array.
H5 payload actually sent: `{ board, content, images:[...], anonymous, title?, postType:'poll'?, pollOptions?[] }` and then switches the feed to the posted board.

### 2.2 `GET /square/v2/recommend` — recommend feed
Query: `page?` (int), `limit?` (int, clamped 1–50, default 20), `cursor?` (ignored), `search?` (string; if non-blank the endpoint returns **search results scoped to recommend board** — see 2.5 shape `SearchPage`).

Response `data`:
```
{ items: SquarePostCard[], page, limit, total, hasMore }
```
- Content: user posts on RECOMMEND (approved, not hidden) ranked by `0.5*hotness + 0.3*sameSchool + 0.2*freshness + 0.45*affinity`; official RECOMMEND posts interleaved (pinned-by-metadata ones first, then one after every 5 user cards); up to 2 "hot campus-wall" cards (same school, likeCount ≥ 10) per page. `total` = length of the whole mixed feed (≤ ~370), not a DB count. Order is stable within a day for the same user.
- Never contains event posts (those are CAMPUS_WALL) nor pending polls.
- Each poll item has `myVote`.

### 2.3 `GET /square/v2/campus-wall` — campus wall feed
Query: same as 2.2 (`search` → search scoped to campus wall).

Response `data`:
- No school on viewer's profile → `{ items: [], page, limit, total: 0, hasMore: false, needProfileSchool: true }` → client shows "Add your school to view the campus wall" state.
- Else `{ items: SquarePostCard[], page, limit, total, hasMore }` where items = CAMPUS_WALL posts with `school === mySchool`, not hidden, `reviewStatus==='approved' OR authorUserId===me` (so I see my own pending/rejected polls), **excluding pinned posts unless `postType==='event'`** (pinned notices live on the pinned page; pinned events stay on the wall at the top). Order: `pinnedAt desc nulls last, createdAt desc`. `total` is a real DB count.

### 2.4 `GET /square/v2/pinned` — pinned page (student-union notices)
No query params. Response `data`:
- No school → `{ items: [], total: 0, needProfileSchool: true }`
- Else `{ items: SquarePostCard[], total: items.length }` — CAMPUS_WALL, same school, not hidden, `pinnedAt != null`, approved; ordered by `pinnedOrder asc, pinnedAt desc`; max 50; no paging.
- Items include pinned event posts as well (they appear both here and on the wall).

### 2.5 `GET /square/v2/search` — post search
Query: `q` (required; blank → empty result), `board?` = `"recommend" | "campus_wall"` (omit = both boards), `page?`, `limit?` (1–50).

Response `data`:
```
{ query: string, posts: SearchPage }
SearchPage = { items: SquarePostCard[], page, limit, total, hasMore, query, isSearch: true, needProfileSchool?: bool }
```
- Blank `q` → `{ query: "", posts: { items: [], page: 1, limit: 20, total: 0, hasMore: false } }` (no `isSearch`).
- `q` is trimmed, whitespace-collapsed, truncated to 64 chars. Matching is case-insensitive substring on title / content / exact tag / comment content (plus trigram fuzzy when available). Ranking: title 3.0 > tag 2.6 > content 1.8 > comment 1.2, × small hotness/freshness boosts. Candidate cap 300 rows → `total` ≤ 300.
- Visibility identical to feeds (campus-wall hits only for the viewer's school; viewer with no school sees only recommend hits; `needProfileSchool` is `true` only when `board=campus_wall` AND viewer has no school).
- `commentSnippet` present only when the hit was in a comment and the post itself did not match; snippet is ≤120 chars of the earliest matching comment, no author.
- The feeds' `search=` param returns `SearchPage` directly (not wrapped in `{query, posts}`); H5 uses the dedicated `/search` endpoint and unwraps `data.posts.items`.

### 2.6 `GET /square/v2/posts/:id` — post detail
Response `data`: `SquarePostDetail` (1.2). 
Errors: 404 `'Post not found'` when the id is unknown, when the post is hidden and the viewer isn't its author, or when `reviewStatus !== 'approved'` and the viewer isn't its author.
H5 after loading: pushes `likeCount`, `commentCount`, `myLiked` back into the cached list card.

### 2.7 `POST /square/v2/posts/:id/vote` — vote / change vote on a poll
Body `VotePollDto`: `{ optionIndex: int ≥ 0 }` (required, `@IsInt @Min(0)`).
Response `data`: `{ pollOptions: [{ text, votes }], myVote: int }` — full recounted option list; client replaces `pollOptions` and `myVote` on the cached post (list + detail) and re-renders the poll block.
Semantics: one vote per user per poll, upsert (re-voting changes the choice; there is no "unvote").
Errors: 404 `'Poll not found'` (id unknown or `postType!=='poll'`); 400 `'This poll is not open for voting'` (hidden or not approved); 403 `'Only students of this school can vote'` (post has a school and viewer's profile.school differs); 400 `'Invalid option'` (index out of range / non-integer).
Client gating (H5): option buttons enabled only when `reviewStatus==='approved'`; pending shows "UNDER REVIEW" badge, rejected shows "REJECTED"; percentages = `votes/total*100` rounded; footer `"<total> vote(s)" + (myVote != null ? " · tap to change" : "")`.

### 2.8 `POST /square/v2/posts/:id/like` — toggle like
No body. Response `data`: `{ liked: true, message: "Liked" }` or `{ liked: false, message: "Like removed" }`. **No `likeCount` is returned** — client must ±1 its local count (H5 does this and syncs the same post across recommend/campus-wall/search caches).
Errors: 404 `'Post not found'` (unknown, or hidden and not mine).
Side effects: first-ever like by this user on this post notifies the author (`type:'like'`, body `"<name> liked your post"`, `metadata:{postId, actorId}`; for anonymous posts the name is the liker's per-post alias and `actorId` is an opaque token).

### 2.9 `POST /square/v2/posts/:id/comments` — comment / reply
Body `CreateCommentDto`:

| field | type | rules |
|---|---|---|
| `content` | string | **required**, ≤500; may be `""` when `imageUrl` is given (H5 allows image-only comments; server does not enforce non-empty) |
| `imageUrl` | string | optional (upload first via `/uploads/image`) |
| `parentCommentId` | string | optional; must belong to the same post else 400 `'Parent comment does not belong to this post'`; **replying to a reply is re-parented to that reply's top-level comment** (threads are exactly 2 levels) |
| `anonymous` | bool | optional, default false; **forced true** when the post is an anonymous user post and the commenter is its author |

Response `data`: the created comment: `{ id, postId, userId (absent if anonymous), content, imageUrl, anonymous, parentCommentId, createdAt, updatedAt, user: { profile: { nickname, avatarUrl } }, anonymousAuthor?, anonymousAuthorToken? }`. **No `likeCount`, `myLiked`, or `replies`** in this response — default them to 0/false/[] if inserting locally (H5 simply reloads the detail after posting).
Errors: 404 `'Post not found'` (unknown or hidden-not-mine); 400 parent mismatch; 400 validation.
Side effects: `commentCount += 1`; notifications `type:'comment'` to post author (`"<name> commented on your post"`) and to the parent comment's author (`"<name> replied to your comment"`), both with `metadata:{postId, commentId}`; `<name>` is the alias when the comment is anonymous.
H5 payload: `{ content: content || '', anonymous, imageUrl?, parentCommentId? }`; the anonymous toggle resets to off after each send and when switching posts.

### 2.10 `POST /square/v2/comments/:id/like` — toggle comment like
No body. Response `data`: `{ liked: bool, likeCount: int }` (authoritative count).
Errors: 404 `'Comment not found'` (unknown, or post hidden and not mine).

### 2.11 `POST /square/v2/posts/:id/report` — report post
Body `ReportPostDto`: `{ reason?: string ≤200 }` (body may be `{}`).
Response `data`: `{ reported: bool, reporterCount: int, hidden: bool, message: "Report submitted" | "You have already reported this post" }`.
Semantics: idempotent per (post, user); at ≥3 distinct reporters the post is auto-hidden (`hidden: true`). Runs in a Serializable transaction — concurrent reports on the same post may fail with 500 (retry once).
Errors: 404 `'Post not found'`.
H5 UX: two-step confirm (explain consequences → reason input) before calling.

### 2.12 `DELETE /square/v2/posts/:id` — delete own post
No body. Response `data`: `{ deleted: true, message: "Deleted" }`. Soft delete (`isHidden=true`, author can still open it via detail).
Errors: 404 `'Post not found'`; 403 `'You can only delete your own posts'` (also for official posts since `authorUserId` is null).

### 2.13 Comment report (no dedicated endpoint)
H5 reports a comment through the generic `POST /reports` (section 5) with `category: "content"` and
`content: "[comment] commentId=<id> postId=<postId>\nreason: <reason>\ntext: <first 300 chars>"`.

---

## 3. Events & tickets (`/events/*`, JWT)

### 3.1 `GET /events/tickets/mine` — my ticket wallet
(Declared before `:id` so the literal path wins.) No params.
Response `data`:
```
{ tickets: [ {
    id, code: "UMT-XXXXXXXXXX", eventId, userId, pricePaidCents: int, status: "valid"|"used"|"cancelled",
    usedAt: ISO|null, createdAt: ISO,
    event: { id, title, venue: string|null, school: string|null, startAt: ISO, endAt: ISO|null,
             status: "published"|"closed"|"cancelled", images: string[] }
} ] }
```
- Ordered `createdAt desc`; includes cancelled/used tickets (H5 renders them at 60% opacity with USED/CANCELLED badge; valid → neon "VALID").
- **QR code content = `code` string exactly** (`UMT-` + 10 chars from alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`); staff scan it and call the admin check-in endpoint. H5 renders QR with error-correction level M, 74px in list / large in the ticket detail sheet.
- Paid line: `pricePaidCents ? ceil(pricePaidCents/100) + " cell(s)" : hidden`.
- Apple Wallet: H5 has a hidden `/events/tickets/:id/pkpass` call behind `ENABLE_APPLE_WALLET=false`; **that endpoint does not exist on the backend** — do not implement/expose it.

### 3.2 `GET /events/:id` — event detail
Response `data`: all `Event` columns + extras:
```
{ id, title, content, images: string[], school: string|null, venue: string|null, startAt, endAt: ISO|null,
  priceCents: int, capacity: int|null, ticketsSold: int, status, createdByAdminId, createdAt, updatedAt,
  createdByAdmin: { name, role, organizationName: string|null },
  post: { id } | null,          // the linked square post
  remaining: int|null,          // capacity==null ? null : max(0, capacity - ticketsSold)
  myTickets: int }              // my non-cancelled tickets for this event
```
Errors: 404 `'Event not found'`.
H5 only calls this as a fallback when the event is not already cached from the post's `event` sub-object.

### 3.3 `POST /events/:id/purchase` — buy a ticket (energy payment)
Body `PurchaseTicketDto`: `{ paymentMethod?: "wechat"|"alipay"|"stripe" }` — optional and ignored; H5 sends `{}`.
Server flow (single transaction): status must be `published`; `(endAt ?? startAt)` must be in the future; max **2 non-cancelled tickets per user per event**; conditional `ticketsSold+1` guarded by capacity; charge `cells = priceCents>0 ? ceil(priceCents/100) : 0` energy cells from the user's balance (school ledger credited); ticket created with `pricePaidCents = cells*100`.
Response `data`:
```
{ ticketId, code: "UMT-…", event: { id, title, startAt, venue }, pricePaidCents: int, cellsPaid: int }
```
Errors (all 400 unless noted): 404 `'Event not found'`; `'Ticket sales are closed for this event'`; `'This event has ended'`; `'Ticket limit reached (2 per person)'`; `'Sold out'`; `'Not enough energy, please top up'`.
Client UX contract (H5): before calling, for paid events refresh the energy balance (`GET /energy/balance` → `availableEnergy`) and if `available < cells` show "Not enough energy — top up" and open the energy purchase screen; otherwise confirm card "Get this ticket? <cells> energy cell(s) will be spent now (you have N)…". Free events: confirm "Payment is mocked in beta — the ticket lands in My Tickets instantly." After success: toast `Ticket <code> added to My Tickets`, refresh energy bar, reload the post detail (remaining/sold update). If the error message matches /not enough energy/i → same top-up flow.

### 3.4 Event data in the square
- Event posts: `postType:'event'`, `authorType` STUDENT_UNION or TEAM, `board: CAMPUS_WALL` always, `school` set, `eventId` set, `event` sub-object (1.3). They show in campus wall (top when pinned) and pinned page; never in recommend.
- Card strip: `EVENT` badge · `M/D HH:mm` · venue · (`Sold out` | price label). Detail block: schedule range, venue, `<price> · <remaining> left · <sold> sold`, CTA `Get Ticket · <price>` disabled with label `Sales closed` / `Event ended` / `Sold out`.

---

## 4. Ads (`/ads/*`, JWT)

### 4.1 `GET /ads/feed?school=<School.name>&limit=<n>`
Query: `school` required (exact `School.name`, i.e. the user's `profile.school`); `limit` 1–10, default 3 (H5 sends 3).
Response `data`: **an array** (not `{items}`):
```
[ { id: <campaignId>, title: string, content: string, images: string[], landingUrl: string|null, advertiserName: string } ]
```
- Empty array when `school` missing/unknown, or no ACTIVE campaign for today with budget left. Random order each call (server shuffles).
- H5 tolerates array OR `{items}`/`{ads}` wrappers; the server returns an array.

### 4.2 `POST /ads/events` — batch impression/click report
Body `ReportAdEventsDto`:
```
{ events: [ { campaignId: string, school: string (≤200, School.name), type: "impression" | "click" } ] }   // 1..100 items (0 items → {accepted:0}; >100 → 400)
```
Response `data`: `{ accepted: int }` (count applied; events for non-ACTIVE / unknown campaigns / unknown schools / schools not in the campaign are silently dropped). Never throws for bad campaign ids.

### 4.3 Client semantics to replicate (from `ads.js` / `square.js`)
- Ads are fetched **only for the recommend tab**, in parallel with the feed request, and **only if the user has `profile.school`**. Campus wall / pinned / search never show ads. Fetch failure → empty list, feed still renders.
- Placement in the recommend feed: render cards in order; after the **3rd card** insert ad #1 (full width); afterwards insert the next ad after every **8 small cards**; stop when ads run out; no repeats within one render.
- Ad card = large-card look: first image (4:5), "Sponsored" badge top-left, title, 2-line italic content, `advertiserName` (fallback "Sponsor"). No like, no comment, not a post.
- Tap: enqueue `click`; if `landingUrl` → open in external browser; else show a minimal full-screen detail (all images, badge, title, content, advertiser).
- Impression: when the card is ≥50% visible, once per `campaignId` per app session (Set of seen ids), enqueue `impression`.
- Queue: in-memory, max 200; flush every 10 s and when the app goes to background; chunk into ≤100 per request; on network error or 5xx re-queue; on 4xx drop. `school` in each event = the school used for the fetch. Reset queue / seen-set / cache when the auth token changes (account switch).

---

## 5. Reports / feedback (`/reports`, JWT)

### 5.1 `POST /reports`
Body `CreateReportDto`: `{ category: "bug"|"user"|"content"|"other" (required, `@IsIn`), content: string ≤2000 (required), contact?: string }`.
Response `data`: `{ id: string, message: "Report submitted. Thank you for your feedback." }` (201).
Used by: Settings → "Report a problem" (category select defaulting to `bug`, content required client-side, optional contact), and by comment reporting (2.13). Stored with `status:'open'` for the admin "user feedback" queue; nothing is returned to the user later.

---

## 6. Discovery (`/discovery/*`, JWT) — kept on the backend; **H5 no longer calls any of these** (contact search is local over existing chat sessions; adding friends is QR/connect-code only). Old iOS code may still use them.

### 6.1 `GET /discovery/users?q=&page=&limit=`
`q` required (blank → empty result); page ≥1; limit clamped 1–50 (default 20).
Response `data`:
```
{ users: [ { id, nickname: string|null, avatarUrl: string|null, school, grade, major, city: string|null,
             tagline: string|null (first 60 chars of signature||bio), relationship: "none"|"pending"|"friend"|"romantic" } ],
  total, page, limit, hasMore, query }
```
Matches nickname (prefix > contains) / tags / interests / school / major / city; excludes self, BANNED, and users with `settings.privacy.searchable === false`. A query matching `^cl[a-z0-9]{4,}$` (a connect code, case-insensitive) puts that user first regardless of searchable.

### 6.2 `GET /discovery/suggestions?limit=`
limit clamped 1–30 (default 10).
Response `data`:
- viewer has `settings.privacy.discoverable !== true` → `{ items: [], enabled: false, reasonDisabled: "discoverable_off" }` (client should show an "enable in settings" prompt, not an empty list).
- else `{ enabled: true, items: [ <6.1 user card> + { score: number (2 dp), reasons: [ { code: "mutualFriends"|"sameSchool"|"sameMajor"|"sameGrade"|"sharedInterests"|"coEngagement", count?: int, value?: string } ] (≤2) } ] }`.
Reason copy is client-side from `code` (+`count`/`value`); `value` is the raw English school/major/grade.

### 6.3 `POST /discovery/suggestions/:userId/dismiss`
No body. Response `data`: `{ dismissed: true }`. 400 `'Invalid target'` if `:userId` is self/empty. Permanent, one-directional, idempotent (upsert).

Note: the H5 settings screen removed the `searchable`/`discoverable` toggles (2026-08-19); both keys still exist server-side (`searchable` default true, `discoverable` default false).

---

## 7. Leaderboard (`/leaderboard*`, JWT) — **deprecated, removed from H5 UI; do not build a screen for it.**
- `GET /leaderboard?type=<duration|score|streak|compatibility|shared_interests|popular|growth|empathy>&limit=20`, plus legacy `GET /leaderboard/duration`, `GET /leaderboard/score`.
- Response `data`: array of `{ rank: int, matchId, metric: number, label: string, coupleA: { nickname, avatarUrl, school }, coupleB: {…} }`. Unknown `type` → 400 `'Unsupported leaderboard type: …'`.

---

## 8. Notifications & realtime touch-points produced by this domain (for deep links)
Created through `Notification` rows (read via the notifications endpoints, outside this map) and pushed as SSE `{type:'notification'}` on `GET /realtime/stream?token=`:

| `type` | `title` | `body` | `metadata` | deep link |
|---|---|---|---|---|
| `like` | `New like` | `<name> liked your post` | `{ postId, actorId }` (actorId = userId or opaque token for anonymous posts) | open post detail |
| `comment` | `New comment` | `<name> commented on your post` | `{ postId, commentId }` | open post detail (scroll to comment) |
| `comment` | `New reply` | `<name> replied to your comment` | `{ postId, commentId }` | open post detail |

Bodies are English on the wire; H5 localises them client-side with regex patterns.

---

## 9. Feed rendering contract the H5 applies to `SquarePostCard` (so iOS matches visually)
- Card kind: `authorType !== 'USER'` → large (full width, official/sponsored badge: `Sponsored` if `isSponsored || authorType==='SPONSOR'`, else `Student Union · <org>` / `Official Team · <org>` / `Official`); `board === 'CAMPUS_WALL'` (case-insensitive) → wide (full width, shows avatar/nickname/time/content/comment count/likes); otherwise small (masonry half-width: title + avatar/nickname + like count, no time/school). Wide/large cards keep the school badge (`metaLabel(school)`); small cards drop it.
- `isPinned` → `PINNED` badge; `postType==='poll'` → poll block on card and detail; `postType==='event'` → event strip on card, purchase block in detail.
- Author display: anonymous → alias/emoji (1.5); else `authorUser.profile.nickname` → `admin.name` → `admin.organizationName` → `"User"`; avatar `authorUser.profile.avatarUrl` (never for anonymous).
- Comment count on wide cards is tappable → opens detail with the composer focused.
- Like tap: optimistic toggle + local ±1, then call 2.8; sync the same `id` across all cached lists.
- Cache the recommend / campus-wall / pinned / search lists separately; after detail load, write back `likeCount`, `commentCount`, `myLiked`.

---

## 10. Gotchas / privacy rules (read before implementing)
1. **Never** derive identity from anything but the documented fields: anonymous posts have no `authorUserId`, `adminId`, or `authorUser`; anonymous comments have no `userId` and no `user.id`. Real-name comments DO carry `userId` (needed for the Author badge on non-anonymous posts) but never `user.id`.
2. `aliasSeed` is per post: the same person gets different aliases in different posts — do not try to link them.
3. `board` comes back uppercase, is sent lowercase.
4. `myVote` exists only on poll posts; `commentSnippet` only on search hits; `cardType`/`sameSchool` never on the create-post response or detail.
5. Post like returns no count; comment like does.
6. Non-approved polls (pending/rejected) are only in the author's own campus-wall feed and detail; anyone else gets 404 on detail. Client should show the review badge and disable voting.
7. Campus wall hides pinned non-event posts; the pinned page is the only place to see pinned notices. Pinned event posts appear in both.
8. Pinned page and campus wall (and campus-wall-scoped search) require `profile.school`; check `needProfileSchool` on the response rather than pre-checking locally.
9. Validation errors return `message` as an **array**; unknown body keys are rejected (`forbidNonWhitelisted`), so DTO encoders must omit nil optionals rather than send `null` keys you don't intend (null on optional fields is accepted, but unknown keys are not).
10. Ticket purchase is not idempotent — guard against double taps client-side; energy error text `Not enough energy, please top up` is the signal to open top-up.
11. `GET /events/tickets/mine` must be routed before `GET /events/:id` (already so on server; irrelevant to client but explains the path shape).
12. Ads feed returns a bare array; `POST /ads/events` accepts at most 100 events per call.
13. `cursor` query param is dead; `limit` > 50 is silently clamped.
14. Reports on posts are idempotent per user; comment reports go through generic `/reports` and produce no per-comment state.
15. `reviewNote` (rejection note) and `reviewedByAdminId` are visible on the author's own rejected poll — show `reviewNote` to the author if present.
