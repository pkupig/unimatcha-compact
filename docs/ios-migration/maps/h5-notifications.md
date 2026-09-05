# H5 module map — `notifications` (通知中心)

Source of truth read for this map:
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/notifications.js` (377 lines, read fully)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` lines 670–690 (bell + badge in home top bar), 1504–1536 (two overlays), 183 (toast root), 699 (`#chat-banner`)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` (`.overlay`, `.notif-*`, safe-area rules, dark tokens, toast)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/state.js`, `src/modules/core.js` (api/overlay/SSE/cleanup/swipe-back/flatEmptyIcon/toast/escapeHtml), `src/modules/square.js` (`formatPostTime`), `src/modules/chat.js` (`showRefundBanner`), `src/modules/i18n.js` (dictionary + observer), `src/modules/auth.js` (logout)
- Backend contract: `apps/api/src/notifications/notification.{controller,service}.ts`, `apps/api/src/common/interceptors/transform.interceptor.ts`, `apps/api/prisma/schema.prisma` (`model Notification`), and every notification-creation site in `matching.service.ts`, `energy.service.ts`, `square.service.ts`, `square-admin.service.ts`, `couple.service.ts`
- Existing iOS: `apps/ios/Unimatcha/{Models/AppNotification.swift, Network/NotificationService.swift, ViewModels/NotificationViewModel.swift, Views/Notifications/NotificationsView.swift, App/MainTabView.swift}`

Design tokens referenced below (Tailwind config in `index.html`): `surface`/`background` `#f9f9f9`, `on-surface` `#1b1b1b`, `on-surface-variant` `#474747`, `primary` `#000000`, `neon` `#CCFF00`, `neon-pink` `#FF2EC4`, `outline` `#777777`, `outline-variant` `#c6c6c6`, `surface-container-low` `#f3f3f3`, `neutral-400` `#a3a3a3`. Font family for `font-headline/body/label` is **Plus Jakarta Sans** (fallback PingFang SC / Noto Sans SC). Icons are **Material Symbols Rounded**, weight 300, FILL 0 unless stated. All Tailwind radii collapse to 10px except explicit `rounded-[Npx]` / `rounded-full`.

Dark mode (`html.dark`, toggled from settings, stored in `localStorage.cl_theme`): `bg-surface` → `#121110`; `bg-surface/80` → `rgba(18,17,16,.85)`; `text-on-surface`/`text-black` → `#eceae6`; `text-on-surface-variant` → `#aaa8a3`; `text-neutral-400` → `#8c8a85`; `bg-surface-container-low` → `#23211f`; `.notif-icon-plate` → bg `#292724` / fg `#eceae6`; `bg-neon` keeps black text. **`text-primary` (#000) has NO dark override** — see Gotcha 3.

---

## 1. Screens & states

The module owns three UI surfaces: (A) the **bell + unread badge** in the home top bar, (B) the **Notifications list overlay**, (C) the **Notification detail overlay**. It also drives (D) an **energy-refund banner** that is rendered by `chat.js` into the Chat list (side effect of loading notifications).

### A. Bell button + unread badge (entry point)

- Location: right end of the **home tab (`#tab-match`) fixed top bar** (`fixed top-0`, `h-14` = 56px + safe-area top, `px-2`, `bg-surface/80 backdrop-blur-xl`, `z-40`). The bar is: `[+ add button 40×40] [segmented Chat / Romantic / Friend, max-w 268px, centered] [bell 40×40]`. The bell is present in all three home views (Chat / Romantic / Friend). Square and Profile tabs have no bell. There is exactly one entry point in the whole app (`onclick="openNotifications()"`, `title="Notifications"`).
- Button: `w-10 h-10` (40×40) `rounded-full`, `flex items-center justify-center`, `active:scale-95` (200ms), hover bg `surface-container-low`. Icon: Material `notifications_none`, 22px, `text-black` (dark → `#eceae6`).
- Badge `#notif-badge`: absolutely positioned `top-0.5 right-0.5` (2px inset from the button's top-right), `min-w-[16px] h-4` (16px tall), `px-1` (4px), `bg-neon` (#CCFF00), `text-black`, `text-[10px] font-bold leading-4 text-center rounded-full`. Hidden (Tailwind `hidden`) when count is 0 or user is logged out. Text = count, capped as `"99+"` when > 99.
- The badge value comes from `GET /notifications/unread-count` (NOT from the list response's `unread`). See §3 for when it refreshes (rarely — Gotcha 2).

### B. Notifications list overlay — `#notifications-overlay`

- Kind: **full-screen page overlay** (`.overlay fixed inset-0 z-50 bg-surface`). Enter/exit animation is a plain **fade** (`.overlay` = `opacity 0 → 1`, `visibility`, 0.25s ease). No slide (the `.slide-right` class exists in CSS but is not applied to this overlay anymore; the HTML comment says "原为右侧滑出卡片" — it was formerly a right side-sheet, now full screen).
- Entered by: bell tap → `openNotifications()`.
- Exited by: header back button, edge-swipe-back (see §2), or (theoretically) tapping the overlay root itself (`onclick="if(event.target===this)closeNotifications()"` — unreachable in practice because the inner column fills 100%).
- Structure (top → bottom):
  1. Inner column `div.relative.z-50.h-full.w-full.bg-surface.overflow-y-auto.flex.flex-col` — **this inner div is the scroll container**, the header is sticky inside it.
  2. `header.sticky.top-0.w-full.z-50.bg-surface/80.backdrop-blur-xl.border-b.border-outline-variant/20` (1px bottom hairline, `#c6c6c6` @ 20%). Safe-area: the global rule `.sticky.top-0 { padding-top: env(safe-area-inset-top) }` applies to the header (the `h-16` is on the inner row, not the header, so the height-add rule does not fire) → header total height = **safe-top + 64px**, content row is 64px.
     - Row: `flex items-center gap-4 px-6 h-16` (gap 16px, horizontal padding 24px, height 64px).
     - Back button: plain button, `active:scale-95`, hover opacity .7; icon Material `arrow_back` at `!text-2xl` (24px), `text-on-surface`, `data-icon="arrow_back"` (attribute unused by JS; the swipe-back detector matches on the icon **text** `arrow_back`).
     - Title `h1`: "Notifications" — `font-headline text-xl (20px) font-bold tracking-tight text-on-surface`, left-aligned right after the back arrow.
  3. `main#notifications-content`: `flex-1 w-full max-w-3xl mx-auto px-6 pt-6 pb-16` (padding 24px sides, 24px top, 64px bottom). Content is one of the states below. There is **no loading indicator** — on first open the area is blank until the fetch resolves; on subsequent opens the previous DOM stays visible until fresh data replaces it (Gotcha 12).

#### B1. Empty state (no notifications)
Centered column `flex flex-col items-center text-center pt-24` (96px top padding):
- `flatEmptyIcon('notifications')`: 64×64 box, `rounded-[18px]`, bg `#efefef`, icon color `#8a8a8a`, Material `notifications` at 28px, `mb-6` (24px below).
- Title `p`: "No notifications" — `font-headline text-base (16px) font-extrabold tracking-tight text-on-surface`.
- Sub `p`: "You're all caught up" — `font-body text-sm (14px) text-on-surface-variant mt-2` (8px).

#### B2. Error state (fetch failed AND nothing rendered yet)
Same layout as B1 with icon `cloud_off`; title "Failed to load"; sub "Check your connection and try again". If a poll refresh fails while content exists, the existing list is kept and nothing is shown (console error only). No retry button (tapping nothing; user must close/reopen).

#### B3. List state
Sections in order: **Today**, **Yesterday**, **Earlier** — each only rendered if non-empty. Grouping rule: `diff = (now − createdAt) / 86 400 000` days; `diff < 1` → Today, `< 2` → Yesterday, else Earlier. **Rolling 24-hour windows, not calendar days** (an item from 23h ago at 01:00 is "Today").

- Section `section.mb-10` (40px bottom margin):
  - Label `h3.notif-section-label`: `font-headline text-[11px] font-bold tracking-[0.2em] mb-4 text-neutral-400` (11px, 0.2em letter-spacing, 16px below, `#a3a3a3`; dark `#8c8a85`). Text: "Today" / "Yesterday" / "Earlier" (translated by the global dictionary in zh).
  - Items container `div.space-y-7` → **28px vertical gap between rows**.
- Row `div.notif-item[.unread].relative.flex.items-start.gap-4.group.cursor-pointer` (16px gap between icon column and text column), `onclick="openNotificationDetail('<id>')"`. CSS: `.notif-item { transition: opacity .3s }`; **read rows render at opacity 0.6** (`.notif-item:not(.unread) { opacity: .6 }`), unread at 1.0.
  - Icon column `div.relative.shrink-0`:
    - Plate `div.notif-icon-plate.w-11.h-11.rounded-[12px]` (44×44, radius 12, bg `#f1f1f1`, fg `#1b1b1b`; dark bg `#292724` fg `#eceae6`), centered Material icon at `text-[20px]`. Icon by `type` (table in §3.5); **FILL 1 (solid) only for `like` and `match_result`**, all others outlined.
    - Unread dot `div.notif-dot.absolute.-top-0.5.-right-0.5.w-2.h-2.rounded-full.bg-neon` — 8×8 neon dot whose center sits at the plate's top-right corner (offset −2px,−2px). Shown only when the row has `.unread` (CSS `display:none` otherwise).
  - Text column `div.flex-grow.space-y-0.5.pt-0.5.min-w-0` (2px top padding, 2px between children):
    - Head row `div.flex.justify-between.items-start.gap-3` (12px gap):
      - Title `h4` — `font-headline text-[15px] font-bold text-primary leading-snug` (15px bold, **#000**), `data-no-i18n`, HTML-escaped, localized by the module (§5).
      - Timestamp `span` — `font-label text-[10px] text-on-surface-variant tracking-tighter whitespace-nowrap pt-0.5`, `data-no-i18n`, text from `formatPostTime(createdAt)` (relative, §3.6). Right-aligned by `justify-between`.
    - Body `p` — `font-body text-sm (14px) text-on-surface-variant leading-relaxed`, **clamped to 2 lines** (`-webkit-line-clamp: 2`, overflow hidden), `data-no-i18n`, escaped + localized.
- "Load More" footer (only when `S.notifHasMore`): `div.flex.justify-center.pt-2.pb-8` containing `button#notif-load-more`: `px-8 py-3 rounded-full bg-surface-container-low text-on-surface-variant font-headline text-[10px] font-bold tracking-[0.2em] hover:text-primary active:scale-95 transition-all`. Label "Load More"; while fetching → `disabled` + label "Loading..." (button is replaced by a fresh render on success; on failure it is re-enabled with "Load More").

### C. Notification detail overlay — `#notif-detail-overlay`

- Kind: full-screen overlay `z-[60]` (stacks **above** the list overlay, which stays open and keeps polling underneath). Same fade-in, same chrome as B (sticky header, back arrow, `border-b outline-variant/20`), title `h1` = "Notification" (zh: 通知详情).
- Entered by: tapping any list row → `openNotificationDetail(id)` (looks the item up in `S.notifList`; if not found, no-op).
- Exited by: back button (`hideOverlay('notif-detail-overlay')`) or edge swipe-back (falls back to the same `hideOverlay` since the overlay id is not in `SWIPE_BACK_CLOSE`, but `hasBackButton` finds the `arrow_back` icon so swipe is allowed). `closeNotificationDetail()` exists on `window` but nothing references it.
- `main#notif-detail-content`: `flex-1 w-full max-w-3xl mx-auto px-6 pt-8 pb-16` (24px sides, **32px** top, 64px bottom). Content is an `article.space-y-10` (40px between blocks):
  1. Meta row `div.flex.items-center.gap-6` (24px gap): plate `div.notif-icon-plate.w-12.h-12.rounded-[14px]` (48×48, radius 14, same colors as list), Material icon at default 24px (FILL 1 for like/match_result); then timestamp `span` `font-label text-[10px] text-on-surface-variant tracking-tighter whitespace-nowrap` (same `formatPostTime`), `data-no-i18n`.
  2. Title `h2` — `font-headline text-3xl (30px) font-bold tracking-tighter leading-none text-primary` (#000; no dark override), `data-no-i18n`.
  3. Body `p` — `font-body text-lg (18px) text-on-surface-variant leading-relaxed whitespace-pre-wrap` (full text, newlines preserved), `data-no-i18n`.
- No actions on the detail page: no deep link to the post/match, no delete, no share. It is a read-only text page. Opening it is what marks the notification read.

### D. Energy-refund banner (rendered by `chat.js`, triggered by this module)

- When a fresh list load or poll refresh (while the panel is open) contains an `energy_refunded` notification (the **first/newest one** in the merged list) whose `id` differs from the module-level `lastRefundNotifId`, the module calls `window.showRefundBanner(notif)`.
- `showRefundBanner` (chat.js 439) renders into `#chat-banner` (a `hidden` div at the very top of the Chat list pane `#home-chat-view`, `index.html:699`) and un-hides it: `div.flex.items-center.gap-3.px-4.py-3.rounded-[10px].bg-neon/15.border.border-neon/40.cursor-pointer` → Material `bolt` icon in neon, text `p.flex-grow.text-[12px].font-medium.text-on-surface`, and a trailing Material `close` icon (`text-outline text-base`) that hides the banner (stopPropagation). Tapping the banner body → `openEnergyModal()` (energy purchase page, profile.js).
- Text (English only, never localized): `metadata.refundReason === 'unconfirmed_48h'` → `"Boost match unconfirmed after 48h — {n} energy refunded"`; anything else (including `event_cancelled`) → `"No match available this round — {n} energy refunded"`, with `n = Number(metadata.energy) || 0`.
- Side effect: `refreshEnergyBalance()` → `window.loadEnergyBar()` if defined (re-renders the profile energy bar) else direct `GET /energy/balance`.
- Note the `index.html` comment on `#chat-banner` says the banner was deprecated in favor of the notification center ("已改为只在通知中心告知，保留节点以兼容旧调用"), but the code path is still live — it will show. See Gotcha 6.

### Toast (shared)
`#toast`: fixed, `top: calc(16px + safe-area-top)`, centered horizontally, `padding 12px 24px`, bg `#000`, fg `#fff`, radius 10px, 14px text, `slideDown` 0.3s, auto-hides after 3000ms. Used here only for the two failure messages in §2.

---

## 2. Interactions

| # | Gesture / trigger | Handler | Behaviour |
|---|---|---|---|
| 1 | Tap bell (home top bar) | `openNotifications()` | `openOverlay('notifications-overlay')` (fade in) → **reset pagination** (`S.notifList=[]`, `notifPage=1`, `notifHasMore=false`, `notifLoadingMore=false`) → `loadNotifications()` (page 1) → `refreshUnreadBadge()` → `startNotifPolling()`. No haptic. Previous DOM content is not cleared until data arrives. |
| 2 | Tap back arrow (list header) | `closeNotifications()` | `stopNotifPolling()` then `closeOverlay('notifications-overlay')`. List DOM is left as-is (stale but hidden). |
| 3 | Edge swipe back on list overlay | core.js `bindEdgeSwipeBack` | Touch must start at `clientX ≤ 30`; direction locks after 10px (`|dx| > |dy|` → horizontal, then `touch-action:none` + preventDefault, vertical scroll suppressed); panel translates with finger (`translateX(dx)`, no fade); on release `dx ≥ 80` → animate to `translateX(100vw)` 200ms ease-out then `closeNotifications()`; else spring back 250ms `cubic-bezier(0.22,1,0.36,1)`. Multi-touch / touchcancel resets. Only allowed because the overlay contains an `arrow_back` icon. |
| 4 | Tap a row | `openNotificationDetail(id)` | Find item in `S.notifList`; render detail into `#notif-detail-content`; call `markNotificationRead(id)` (fire-and-forget); **optimistically** remove `.unread` from the row (`document.querySelector('.notif-item[onclick*="<id>"]')`) so the dot vanishes and the row fades to 0.6 opacity immediately; `openOverlay('notif-detail-overlay')`. |
| 5 | `markNotificationRead(id, el?)` | — | `PUT /notifications/:id/read`. On success: `el.classList.remove('unread')` (el is `undefined` from the row-tap path, so no-op), set `isRead=true` on the item in `S.notifList` (so the next poll re-render doesn't resurrect the unread style), `refreshUnreadBadge()`. On failure: console error + toast **"Failed to mark notification as read"** and `el.classList.add('unread')` (again no-op when el undefined → the row stays visually read even though the server didn't record it; next poll will restore unread from server truth). |
| 6 | Tap back arrow (detail) / edge swipe on detail | `hideOverlay('notif-detail-overlay')` | Detail fades out; list overlay is still open underneath with polling running. |
| 7 | Tap "Load More" | `loadMoreNotifications()` | Guards: return if `S.notifLoadingMore` or `!S.notifHasMore`. Set busy; button `disabled` + text "Loading...". Fetch `notifPage + 1`; **dedupe by id** against the current list (`Set` of ids) before concat; `notifPage += 1`; `notifHasMore` from response; full re-render (`renderNotifications()` replaces `innerHTML`). On failure: toast **"Failed to load more notifications"**, re-enable button with "Load More". `finally` clears busy. |
| 8 | Poll tick (while overlay open) | `notifPollTick()` = `refreshNotifications()` + `refreshUnreadBadge()` | `setInterval` every **15 000 ms**; when SSE is connected (`S.realtimeUp`) only every 4th tick runs (**60 s** fallback). `refreshNotifications`: skip if `S.notifLoadingMore` or `S.notifRefreshBusy` (re-entrancy guard, set in `try/finally`); re-fetch **every page 1..notifPage sequentially**, merge with id-dedupe, replace `S.notifList`, `notifHasMore` = last page's flag, `maybeSurfaceRefund(merged)`, full re-render. Errors: console only, content kept. Note the full re-render resets nothing visible except that it rebuilds DOM (scroll position of the inner scroll container is kept by the browser since the container itself isn't replaced). |
| 9 | Backdrop tap on overlay root | inline `onclick` | Closes (`closeNotifications()` / `hideOverlay`) only when `event.target === overlay` — never true because the inner column covers it. Treat as non-existent. |
| 10 | Logout / 401 / tab switch | see §4 | `stopNotifPolling()` is called by `auth.doLogout`, `api()` 401 branch, `cleanupUserState`, and **`switchTab()` (bottom nav)** — bottom nav is hidden behind the z-50 overlay so in practice a tab switch can't happen while the panel is open. |
| 11 | App start | `DOMContentLoaded` | `refreshUnreadBadge()` once (no-op if no `cl_token`). |
| 12 | SSE `notification` event | core.js → `window.notifPollTick?.()` | **Intended**: throttled (3 s leading+trailing, key `realtimeNotif`) list+badge refresh. **Actual**: `notifPollTick` is never assigned to `window`, so this is a silent no-op in the H5 (Gotcha 1). |

Not present (do not invent): pull-to-refresh on the list, swipe-to-delete, long-press, mark-all-read button, per-type filters, deep links into post/match/chat from a notification, confirmation dialogs, haptics, "new notification" toasts/banners while the panel is closed.

Disabled states: only the Load More button (`disabled` + "Loading...").
Race guards: `notifLoadingMore` (load-more vs poll), `notifRefreshBusy` (poll vs poll, SSE storms), id-dedupe on merge, `lastRefundNotifId` banner dedupe.
Optimistic updates: read-state on row tap (before PUT resolves).

---

## 3. API calls

All go through `window.api(path, method, body)`: base `S.API` = `https://api.<domain>/api/v1` (local: `http://<host>:3001/api/v1`), header `Authorization: Bearer <localStorage.cl_token>`, `Content-Type: application/json`, **`cache: 'no-store'`**. Non-2xx → throws `Error(data.message || 'API <status>')`. **401 → global logout flow**: token removed, all polling stopped (match/realtime/chat/notif/countdown), `cleanupUserState()`, `closeAllOverlays()`, navigate to auth page, then throw.

Every response is wrapped by the global `TransformInterceptor`: `{ success: true, data: <payload>, message?: string, timestamp: ISO }`. The module unwraps with `data.data || data`.

### 3.1 `GET /notifications?page={page}&limit=20`
- Query: `page` (int, 1-based; from `S.notifPage(+1)` or loop index), `limit` = `NOTIF_PAGE_SIZE` = **20** (constant).
- Backend: `findMany({ where:{userId}, orderBy:{createdAt:'desc'}, skip:(page−1)*limit, take:limit })` + total count + unread count.
- Response `data`: `{ items: Notification[], total: number, unread: number, page: number, limit: number }`. The client also tolerates a bare array (then `hasMore=false`).
- `Notification` item (Prisma `select`): `id: string (cuid)`, `type: string`, `title: string`, `body: string`, `isRead: boolean`, `createdAt: ISO string`, `metadata: object|null`.
- Fields USED by the UI: `id` (row key, mark-read, dedupe), `type` (icon + refund detection), `title`, `body` (fallbacks `message`/`content` are coded but never produced), `isRead` (`.unread` class), `createdAt` (fallback `created_at`; grouping + relative time), `metadata.energy` + `metadata.refundReason` (refund banner only). `total` → `hasMore = page * 20 < total`. **`unread` from this response is ignored** (badge uses 3.2). `page`/`limit` ignored.
- Called by: `loadNotifications()` (open; page 1), `loadMoreNotifications()` (page n+1), `refreshNotifications()` (pages 1..n, sequential awaits, every poll tick).
- Errors: open/first load → error state only if list empty; load-more → toast; poll → silent.

### 3.2 `GET /notifications/unread-count`
- No params. Skipped entirely (badge hidden) when `localStorage.cl_token` is absent.
- Response `data`: `{ unreadCount: number }` → badge text (`"99+"` cap), hidden when 0.
- Called by: DOMContentLoaded, `openNotifications`, every poll tick while open, after successful mark-read. Errors: console only (badge unchanged).

### 3.3 `PUT /notifications/{id}/read`
- No body. Backend `updateMany({ where:{ id, userId }, data:{ isRead:true } })` — scoped to the caller, silently no-ops on foreign ids. Response `data`: `{ success: true }` (unused).
- Called when a row is tapped (detail opened). Error → toast "Failed to mark notification as read".

### 3.4 `PUT /notifications/read` (mark ALL read)
- Exists on the backend (`markRead(userId)` with no id) and in the old iOS `NotificationService.markAllRead()`, but **the H5 never calls it and has no UI for it**. For a 1:1 port, omit the "全部已读" toolbar button of the old iOS view (or keep it as an intentional divergence — flag it).

### 3.5 Notification catalogue (server-emitted; English is canonical, stored as-is)

Icon column = Material Symbols Rounded name used by H5 (`NOTIF_ICONS`, fallback `info`). Suggested SF Symbol in parentheses is my mapping proposal, not from source.

| `type` | Icon (FILL) | `title` | `body` | `metadata` | Emitted by |
|---|---|---|---|---|---|
| `match_result` | `auto_awesome` (**filled**) (sparkles) | `Your match is here` (romantic) / `New friend match` (friend) | `Great news! We found a match for you. Head to Chat and start the conversation!` / `We found a friend who's on your wavelength. Head to Chat and say hi!` | `{ matchId, mode }` | weekly match job (both users) |
| `no_match` | `hourglass_empty` (hourglass) | `No match this round` | `We couldn't find a great match for you this round. Hang tight and check back next round!` | `{ mode }` | weekly match job (unmatched searching users) |
| `relationship_confirmed` | `info` (fallback) | `You're now a couple` / `You're now friends` | `You've both confirmed — your relationship is official!` / `You've both confirmed — you're friends now!` | `{ matchId, mode }` | second confirm (both users) |
| `relationship_dissolved` | `info` (fallback) | `Relationship ended` / `Friendship ended` | `{nickname} ended your relationship.` / `{nickname} ended your friendship.` | `{ matchId, mode }` | dissolve (partner only) |
| `match_expired` | `hourglass_disabled` (hourglass + slash) | `Match expired` | `This match expired because it was not confirmed by both of you within 48 hours.` | `{ mode }` | 48h expiry job (both users) |
| `friend_added` | `info` (fallback) | `New friend` | `Someone connected with you — open the chat and say hi!` | `{ matchId, mode:'friend' }` | add-by-connect-code (target only) |
| `energy_refunded` | `bolt` (bolt) | `Energy refunded` | `Your enhanced match wasn't confirmed within 48 hours, so {n} energy cell(s) has/have been refunded.` (reason `unconfirmed_48h`) / `The event was cancelled, so {n} energy cell(s) has/have been refunded.` (`event_cancelled`) / `No match was available this round, so {n} energy cell(s) has/have been refunded.` (default = empty pool). Singular `1 energy cell has`, plural `N energy cells have`. | `{ mode, energy: n, refundReason, matchId, ...extra }` | energy refund (match job / expiry / event cancel) |
| `comment` | `chat_bubble` (bubble.left) | `New comment` / `New reply` | `{name} commented on your post` / `{name} replied to your comment` | `{ postId, commentId }` | square comment (post author / parent-comment author; never self; never both for same user) |
| `like` | `favorite` (**filled**) (heart.fill) | `New like` | `{name} liked your post` | `{ postId, actorId }` | square like — **only the first like ever by that actor on that post** (server dedupes via metadata) |
| `milestone` | `info` (fallback) | `A secret unlocked` | `You and {name} have each said "I love you" 100 times. Here is to many more.` | `{ kind:'love_you_100', matchId }` | couple space (both users, once per match) |
| `system` | `info` | `Poll approved` / `Poll rejected` | `Your poll "{label}" is now live on the campus wall.` / `Your poll "{label}" was not approved.` + optional ` Reason: {note}` | `{ postId }` | admin poll review |

`{name}` privacy rule: for **anonymous** posts/comments the server substitutes the per-post **anonymous alias** (an English animal name such as "Cozy Heron", generated from an HMAC seed, same alias as shown inside that post) and `metadata.actorId` is an opaque HMAC token, not a user id. The client must never resolve `actorId`/names to profiles. The alias in a notification is always the English form even in zh mode (H5 keeps it verbatim inside the zh pattern).

### 3.6 Relative timestamp — `formatPostTime(iso)` (square.js, shared)
`diff = now − createdAt`: `< 60 s` → `Just now` / `刚刚`; `< 1 h` → `{m}M Ago` / `{m} 分钟前`; `< 24 h` → `{h}H Ago` / `{h} 小时前`; `< 7 d` → `{d}D Ago` / `{d} 天前`; else `toLocaleDateString('zh-CN')` in zh or the device default locale in en (e.g. `9/3/2026`). Note the English forms have **no space** (`5M Ago`, `3H Ago`, `2D Ago`) and the zh forms do.

### 3.7 Polling / caching summary
- No client cache beyond `S.notifList` for the duration of an open panel; every open starts from page 1.
- Poll interval 15 s (60 s effective when SSE is up) **only while the list overlay is open**. Nothing polls in the background.
- SSE channel (`GET /realtime/stream?token=`) delivers `{type:'notification'}` after every server-side notification insert (all creation sites emit it after commit). H5 intends a 3 s leading+trailing throttle → refresh; wiring is broken (Gotcha 1). iOS should implement the intent.

---

## 4. Client state

`state.js` (`S.*`), all reset by `cleanupUserState()` (core.js) which is invoked on logout (`auth.doLogout`), on any 401, and on `checkUserState()` when no token:
- `S.notifPollingId: number|null` — `setInterval` id (cleared by `stopNotifPolling`).
- `S.notifList: Notification[]` — currently loaded/merged pages (page 1..notifPage), newest first.
- `S.notifPage: number` — highest page loaded (starts 1).
- `S.notifHasMore: boolean` — whether "Load More" is shown.
- `S.notifLoadingMore: boolean` — load-more in flight (also blocks poll refresh).
- `S.notifRefreshBusy: boolean` — **not declared in state.js**, set dynamically by `refreshNotifications`; not reset by cleanup (harmless: always cleared in `finally`).
- `S.realtimeUp: boolean` — set by core.js SSE (`onopen`/`ready` → true; `onerror`/`stopRealtime` → false); read here to drop the poll to 60 s.

Module-scoped (not on `S`): `lastRefundNotifId: string|null` — refund-banner dedupe. **Never reset on logout**, so it persists across account switches within one page session (only matters if the same notification id recurs, which cannot happen across users; but it also means the banner for an already-seen refund won't re-show after re-login on the same page load).

`localStorage`: `cl_token` (gates badge fetch + all API calls), `cl_lang` (`'zh'`/`'en'`, default `'en'`), `cl_theme` (`'dark'`/`'light'`). Nothing notification-specific is persisted (no last-seen id, no local read cache).

Lifecycle: `openNotifications` resets the four paging fields; `closeNotifications` stops polling but leaves `S.notifList` populated (stale, harmless — reset on next open); `switchTab` (bottom nav) also calls `stopNotifPolling`.

---

## 5. i18n

Mechanism: the UI is authored in English. In zh mode (`localStorage.cl_lang === 'zh'`), `i18n.js` translates **whole trimmed text nodes** that exactly match a dictionary key, at boot and via a `MutationObserver` on added nodes; anything inside an element with `data-no-i18n` is skipped. Language switch **reloads the page**. Because notification titles/bodies/timestamps are user-ish content that could collide with dictionary keys, the module marks them `data-no-i18n` and localizes them itself at render time with `localizeNotif(n)` (exact-match title map, exact-match body map, then regex patterns; anything unmatched stays English).

### 5.1 Chrome strings (global dictionary, `i18n.js`)
| en | zh |
|---|---|
| Notifications (list title, bell tooltip) | 通知 |
| Notification (detail title) | 通知详情 |
| No notifications | 暂无通知 |
| You're all caught up | 都看完啦 |
| Failed to load | 加载失败 |
| Check your connection and try again | 请检查网络后重试 |
| Loading... | 加载中… |
| Load More | 加载更多 |
| Today | 今天 |
| Yesterday | 昨天 |
| Earlier | 更早 |
| Failed to load more notifications (toast) | **no zh entry — stays English** |
| Failed to mark notification as read (toast) | **no zh entry — stays English** |
| (settings page, not this module) Push Notifications | 推送通知 |

### 5.2 Title map `NOTIF_TITLE_ZH` (exact match; else English)
| en | zh |
|---|---|
| Your match is here | 你的匹配来了 |
| New friend match | 新朋友匹配 |
| No match this round | 本轮未匹配到 |
| You're now a couple | 你们在一起了 |
| You're now friends | 你们成为朋友了 |
| Relationship ended | 恋爱关系已结束 |
| Friendship ended | 朋友关系已解除 |
| Match expired | 匹配已过期 |
| New friend | 新朋友 |
| New comment | 新评论 |
| New reply | 新回复 |
| New like | 新点赞 |
| Energy refunded | 能量已退还 |
| A secret unlocked | 解锁了一个小秘密 |
| Poll approved | 投票已通过 |
| Poll rejected | 投票未通过 |

### 5.3 Static body map `NOTIF_BODY_ZH` (exact match)
| en | zh |
|---|---|
| Great news! We found a match for you. Head to Chat and start the conversation! | 好消息！为你找到了匹配对象，去聊天页开启对话吧！ |
| We found a friend who's on your wavelength. Head to Chat and say hi! | 为你找到了一位同频的朋友，去聊天页打个招呼吧！ |
| We couldn't find a great match for you this round. Hang tight and check back next round! | 本轮暂时没有找到合适的匹配，下一轮再来看看吧！ |
| You've both confirmed — your relationship is official! | 你们都已确认——恋爱关系正式确立！ |
| You've both confirmed — you're friends now! | 你们都已确认——现在是朋友啦！ |
| This match expired because it was not confirmed by both of you within 48 hours. | 双方未在 48 小时内确认，本次匹配已过期。 |
| Someone connected with you — open the chat and say hi! | 有人和你建立了连接——打开聊天打个招呼吧！ |

### 5.4 Dynamic body patterns `NOTIF_BODY_PATTERNS` (first regex that matches wins; `^…$` anchored)
| en regex | zh output |
|---|---|
| `^(.+) liked your post$` | `{1} 赞了你的帖子` |
| `^(.+) commented on your post$` | `{1} 评论了你的帖子` |
| `^(.+) replied to your comment$` | `{1} 回复了你的评论` |
| `^(.+) ended your friendship\.$` | `{1} 解除了你们的朋友关系。` |
| `^(.+) ended your relationship\.$` | `{1} 结束了你们的恋爱关系。` |
| `^Your enhanced match wasn't confirmed within 48 hours, so (\d+) energy cells? (?:has\|have) been refunded\.$` | `增强匹配 48 小时内未确认，已退还 {1} 格能量。` |
| `^No match was available this round, so (\d+) energy cells? (?:has\|have) been refunded\.$` | `本轮未匹配到对象，已退还 {1} 格能量。` |
| `^Your poll "(.+)" is now live on the campus wall\.$` | `你的投票「{1}」已在校园墙上线。` |
| `^Your poll "(.+)" was not approved\.(?: Reason: (.+))?$` | `你的投票「{1}」未通过审核。` + (`原因：{2}` if present) |
| `^You and (.+) have each said "I love you" 100 times\. Here is to many more\.$` | `你和 {1} 已互道 100 次「我爱你」，愿未来更多。` |

Not covered (renders English in zh): the `event_cancelled` refund body (`The event was cancelled, so … refunded.`). iOS may add `活动已取消，已退还 {n} 格能量。` as an improvement — flag as divergence.

### 5.5 Other zh/en render-time branches
- Relative time (`formatPostTime`) branches on `getLang()` — see §3.6.
- Refund banner text (chat.js) is English-only.
- The poll-reject "Reason:" note and all `{name}` captures are passed through verbatim (aliases stay English).

Fonts: zh text falls back from Plus Jakarta Sans to PingFang SC — on iOS use the system font for CJK.

---

## 6. Cross-module links

Outbound (this module calls):
- `core.js`: `window.openOverlay(id)` / `closeOverlay(id)` / `hideOverlay(id)` (add/remove `.active`), `window.api(...)`, `window.flatEmptyIcon(icon)`, `window.escapeHtml`, `window.toast(msg)`.
- `square.js`: `window.formatPostTime(iso)`.
- `i18n.js`: `window.getLang()`.
- `chat.js`: `window.showRefundBanner(notif)` → which calls `profile.js` `window.openEnergyModal()` on tap and `window.loadEnergyBar()` / `GET /energy/balance` to resync energy.
- Reads `S.realtimeUp` (set by core.js SSE).

Inbound (who calls this module):
- `index.html` bell `onclick="openNotifications()"`; list header back `closeNotifications()`; detail header back `hideOverlay('notif-detail-overlay')`; rows `openNotificationDetail(id)`; Load More `loadMoreNotifications()`.
- `core.js` `SWIPE_BACK_CLOSE['notifications-overlay'] → closeNotifications()`; edge swipe on the detail overlay → generic `hideOverlay`.
- `core.js` `api()` 401 branch, `cleanupUserState()`, `switchTab()`; `auth.js` `doLogout()` → `stopNotifPolling()`.
- `core.js` SSE `onmessage` `type==='notification'` → `window.notifPollTick?.()` (dead: not exported).
- `document` `DOMContentLoaded` → `refreshUnreadBadge()`.
- Nobody else calls `refreshUnreadBadge` (verified by grep): chat/match/square never bump the bell badge.

Existing iOS code to reuse/upgrade: `AppNotification`/`NotificationsResponse`/`UnreadCount` models already match the contract (add `refundReason`, `energy`, `actorId`, `kind` to `NotificationMeta`, or decode metadata as `[String: AnyCodable]`); `NotificationService.list/unreadCount/markRead` map 1:1 to §3.1–3.3 (`APIClient` already unwraps the `{success,data}` envelope). `NotificationViewModel`/`NotificationsView` must be restructured: old app mounts it as a **tab** with mark-all-read and 3-line bodies, dark pink/neon-green theme; the H5 is a **light-theme full-screen page pushed from the home header bell** with day sections, 2-line bodies, a separate detail page, pagination and polling.

---

## 7. Gotchas

1. **SSE → notifications is broken in H5 (silent no-op).** `core.js` calls `window.notifPollTick?.()` on every `{type:'notification'}` SSE frame, but `notifications.js` never assigns `window.notifPollTick` (only the bare function exists). Net effect: while the panel is open, updates arrive only via the 15 s / 60 s poll; while closed, nothing at all. The 8/31 devlog claims the wiring was done — it wasn't. **iOS should implement the intended behaviour**: on SSE `notification` frame → throttle 3 s leading+trailing → refresh the unread badge always, and re-fetch the loaded pages if the list is showing.
2. **The bell badge is effectively static.** `refreshUnreadBadge` runs only at page load, on panel open, on each poll tick while the panel is open, and after a successful mark-read. Chat/match/square events never touch it, and (per 1) SSE doesn't either. On iOS, refresh the badge on: app launch, foreground, SSE notification frame, and panel close.
3. **Dark-mode title colour bug.** List title `h4` and detail `h2` use `text-primary` (`#000000`), and `main.css` has no `.dark .text-primary` override, so in dark mode titles render black on `#121110`. On iOS use the on-surface token (`#1b1b1b` light / `#eceae6` dark) for titles instead of copying `primary`.
4. **Day grouping is rolling 24 h**, not calendar-day: `Today` = < 24 h old, `Yesterday` = 24–48 h, `Earlier` = older. Keep this to match H5 (or consciously diverge to calendar days).
5. **Read state is optimistic and one-way.** Tapping a row instantly removes the dot and dims the row to 60 % opacity; the PUT runs in the background; on failure only a toast appears (the row is NOT restored because the `el` argument is undefined on this path). Server truth reasserts on the next poll re-render. `isRead` is patched into `S.notifList` on success so poll re-renders don't flicker.
6. **Refund banner quirks.** (a) It is triggered by *any* `energy_refunded` item present in the merged list — even old/read ones — the first time the panel is opened in a page session (module var dedupe, not "new since last seen"). (b) It renders in the Chat list, not in the notification centre, despite the HTML comment saying the banner was retired. (c) `refundReason === 'event_cancelled'` falls into the "No match available this round" copy — wrong text. (d) It is English-only. (e) It also triggers an energy-balance refetch. Decide explicitly whether to port (a)–(d) or drop the banner; if porting, at least fix (c).
7. **Anonymity in like/comment notifications.** `{name}` may be the per-post anonymous alias and `metadata.actorId` may be an HMAC token — never look up a profile from it, never display anything but the server-provided body. Aliases are English animal names even in zh.
8. **Icon fallbacks.** Only 7 types have icons; `relationship_confirmed`, `relationship_dissolved`, `friend_added`, `milestone` all fall back to `info`. Only `like` and `match_result` use the filled glyph. Plate sizes differ: 44 px / radius 12 in list, 48 px / radius 14 in detail.
9. **No mark-all-read, no deep links, no pull-to-refresh, no loading spinner** in H5. The old iOS view had mark-all-read and `.refreshable` — remove for 1:1, or document as intentional extras. `metadata.postId/matchId` are never used for navigation in H5.
10. **Pagination details**: page size 20; `hasMore = page*20 < total`; load-more dedupes by id (items can shift between pages as new ones arrive); poll refresh re-fetches *all* loaded pages sequentially (N requests per tick for N pages) and rebuilds the list; a load-more in flight suppresses the poll and vice versa.
11. **Polling only while open**, 15 s, degraded to 60 s while SSE is connected (tick counter `% 4`). Stop on close, logout, 401.
12. **Blank/stale content on open.** `openNotifications` resets `S.notifList` but does not clear the DOM, and there is no spinner: first open shows an empty white area until the response arrives; later opens briefly show the previous session's rows. On iOS show a lightweight loading state (or keep the last list) — do not replicate the flash.
13. **Every open resets to page 1** (pagination/expanded pages are not remembered between opens).
14. **Body clamp**: 2 lines in the list (`-webkit-line-clamp:2`), full text with preserved newlines in detail (`whitespace-pre-wrap`). Notification bodies are single-line today but poll rejection reasons could be long.
15. **Layering**: list overlay `z-50` is above the bottom nav and the home top bar; detail overlay `z-[60]` sits above the list; closing detail reveals the list still polling. Overlay transitions are fade-only (0.25 s); the swipe-back gesture adds a horizontal follow-finger translate with no fade.
16. **Safe area**: header gets `padding-top: env(safe-area-inset-top)` + 64 px content row; the scroll container is the inner column (header sticky), content padding 24/24/24/64 (list) and 24/32/24/64 (detail); `max-w-3xl` centring is irrelevant on phones.
17. **Text-node i18n hazard** (why everything user-facing is `data-no-i18n`): the global dictionary would otherwise mistranslate a title that happens to equal a UI key. On iOS just use explicit localisation and never run notification text through a generic dictionary.
18. **Toast copy is not localised** for the two failure toasts (no zh entries) — decide whether to add zh on iOS (`加载更多失败` / `标记已读失败` are not in source; if you add them, mark as divergence).
19. The Settings page "Push Notifications" toggle (`pushEnabled`, settings.js) is a server-backed user setting unrelated to this module — it does not gate in-app notifications or the badge.
