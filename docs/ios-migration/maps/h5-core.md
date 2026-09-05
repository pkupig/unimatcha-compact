# H5 module map — `core` (app plumbing, navigation shell, shared UI primitives)

Source of truth read for this map:
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/core.js` (789 lines, read in full)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/state.js` (shared `S` object, read in full)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/main.js` (bootstrap wiring, read in full)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` — `<head>` (Tailwind tokens, boot watchdog, version-drift script), `#splash`, `#page-banned`, `#page-home`, `#tab-match` shell, `#bottom-nav`, `#toast`, `#chat-image-viewer`, `#modal-energy-purchase`, `#energy-display`
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` (read in full; rules quoted below)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/i18n.js` (mechanism + dictionary keys used by core UI)
- Sibling module code that core's CSS styles or that core delegates to: `match.js` (switchHomeView / bindHomeViewSwipe / toggleChatPlusMenu), `chat.js` (openChatImage, startChatPolling), `notifications.js` (startNotifPolling), `profile.js` (energy bar), `ads.js` (whole file), `auth.js` (login/register/logout entry points)
- Backend contract for what core talks to: `apps/api/src/realtime/*`, `apps/api/src/common/interceptors/transform.interceptor.ts`, `apps/api/src/common/filters/http-exception.filter.ts`, `apps/api/src/users/users.service.ts#findById`, `apps/api/src/uploads/uploads.controller.ts`, `apps/api/src/main.ts`

Everything below is what the code actually does today (2026-09-03 working tree), not what comments wish it did.

---

## 0. Design tokens the whole app shares (defined in `index.html` Tailwind config + `main.css`)

Light palette (Tailwind `colors` extension):

| token | hex | used for |
|---|---|---|
| `neon` | `#CCFF00` | brand accent: active nav icon, active segment, CTA fill, energy cells, PTR-ready icon |
| `neon-pink` | `#FF2EC4` | danger / leave actions (confirm-card `danger`, Log Out button, Leave Pool) |
| `background` / `surface` / `surface-bright` | `#f9f9f9` | page + tab backgrounds (also hard-coded in `.page`, `[id^="tab-"]`, `#splash`) |
| `surface-container-lowest` | `#ffffff` | cards (confirm/prompt card, plus-menu card) |
| `surface-container-low` | `#f3f3f3` | soft-filled inputs (prompt field) |
| `surface-container` / `-high` / `-highest` | `#eeeeee` / `#e8e8e8` / `#e2e2e2` | |
| `on-surface` / `on-background` | `#1b1b1b` | primary text |
| `on-surface-variant` | `#474747` | secondary text |
| `outline` | `#777777` | tertiary text / labels |
| `outline-variant` | `#c6c6c6` | hairline borders, empty energy cell border |
| `primary` | `#000000` | headline text, black buttons |
| `error` | `#ba1a1a` | (rarely used) |

Dark mode (`html.dark`, persisted in `localStorage.cl_theme`; warm-black, R≥G≥B): base `#121110`; card `#1c1b19`; container-low `#23211f`; container `#292724`; high `#2f2d2a`; highest `#363431`; primary text `#eceae6`; secondary `#aaa8a3`; tertiary `#8c8a85`; borders `#343230`; translucent bars `rgba(18,17,16,.85)`. Neon buttons keep black text in dark mode.

Typography: `Plus Jakarta Sans` everywhere (weights 200–800; CJK falls back to PingFang SC / Noto Sans SC); `JetBrains Mono` only for ticket codes / countdown numbers. Icons: **Material Symbols Rounded**, default `FILL 0, wght 300, GRAD 0, opsz 24`, 24px (class name in markup is `.material-symbols-outlined` but the font family is forced to Rounded via `!important`). Corner radius: every Tailwind radius token (`sm`…`3xl`) = **10px**; `full` = 9999px. Scrollbars are globally hidden.

Safe areas: `:root { --sat: env(safe-area-inset-top); --sab: env(safe-area-inset-bottom) }`. Status bar is `black-translucent` (content extends under it), so every top bar adds `--sat` (rules in §1.10).

Layering (z-index) from bottom to top: `.page` 40 → tab panels `[id^="tab-"]` 41 → `.overlay` 50 (some 60/70/80/100, table in §1.9) → plus-menu backdrop 68 / card 69 → confirm/prompt card backdrop 120 → `#toast` 999 → `#splash` 9999.

---

## 1. Screens & states this module renders / owns

### 1.1 Splash (`#splash`)
- **Entered**: app launch (it is in the DOM from the first paint). **Exited**: `hideSplash()` — called automatically 3000 ms after `DOMContentLoaded` (main.js) or by tapping **Skip**. Hide = add class `.hide` (opacity 1→0 over 0.6 s, pointer-events none), then after 600 ms `display:none` and `checkUserState()` runs (§3.3) which decides the first real screen.
- **Layout** (fixed, full screen, z 9999, bg `#f9f9f9` / dark `#121110`, flex column centered):
  - Top-right **Skip** button: `position:absolute; top: calc(2rem + safe-area-top); right: 32px`; text `Skip`, 10px, bold, `tracking 0.3em`, uppercase, color `outline #777` (hover → primary). (No zh translation exists — shows "Skip" in both languages.)
  - Center block (`.splash-in` entrance: fade + translateY 14px→0 over 0.7 s cubic-bezier(0.22,1,0.36,1)):
    - App icon `/icons/icon-192.png`, 76×76, radius 22, margin-bottom 32px, gentle bob animation (`translateY 0 → -6px → 0`, 2.6 s ease-in-out infinite).
    - `UNIMATCHA` — 34px, extrabold (800), `tracking 0.18em`, color primary `#000`, marked `data-no-i18n`.
    - Tagline, margin-top 16px, 13px, color `#474747`, `tracking-wide`: en "One thoughtful match, every week." / zh "每周一次，用心匹配。"
  - Bottom block (`bottom: 64px`, column, gap 20px): progress bar 120×3, radius 2, track `#e6e6e6` (dark `#343230`), fill = 40% width neon block sliding `translateX(-110%) → 320%` over 1.4 s linear-ish ease-in-out, infinite; below it `BETA` 9px bold uppercase `tracking 0.35em` color outline, `data-no-i18n`.
- **Boot watchdog** (inline `<script>` in `<head>`, web-only): if any `<script>`/`<link>` fails to load, or `window.__appBooted` is still falsy 7 s after start, reload once with `?r=<ts>` (guard `sessionStorage.cl_boot_retry`); on a second failure it tries to show `#splash-fallback` — **that element does not exist anywhere in index.html**, so the user is left on a frozen splash. iOS does not need this, but do not copy the "log out on any startup error" behavior described in §3.3.

### 1.2 Banned page (`#page-banned`)
- **Entered**: `checkUserState()` when `GET /users/me` returns `status === 'BANNED'`. **Exited**: only via **Log Out** → `doLogout()` (auth.js).
- **Layout** (`.page`: fixed inset-0, flex column, bg `#f9f9f9`): centered `main` (px 24 / py 48), inner max-width 420px, vertical stack gap 32px, text centered:
  - Circle 80×80, `border: 2px solid outline #777`, icon `block` 36px color `#474747`.
  - Title "Account Suspended" — 24px (text-2xl), extrabold, `tracking-tighter`, primary.
  - Body "Your account has been disabled for violating the community guidelines. If you believe this is a mistake, please contact support." — 14px, `#474747`, `leading-relaxed`, max-width 320px.
  - Button full width: transparent bg, text + 2px border `neon-pink`, padding-y 20px, radius 10, 10px bold `tracking 0.3em` "Log Out" (zh "退出登录"); hover fills pink with black text; `active:scale-95`.
  - Footer (py 32 px 24): "© 2026 Unimatcha. All Rights Reserved." 9px medium `tracking 0.1em` color `#c6c6c6`.
- Title/body have **no zh dictionary entries** (English only in both languages).

### 1.3 Home shell: `#page-home` + tab panels + `#bottom-nav`
- `#page-home` is an **empty base layer** (`.page`, fixed inset-0 z 40). The three tab panels `#tab-match`, `#tab-square`, `#tab-profile` are siblings, each `position:fixed; inset:0; z-index:41; background:#f9f9f9; overflow-y:auto; overscroll-behavior-y:none` (dark bg `#121110`). `showPage(id)` hides every panel (`display:none`) and shows the bottom nav only when `id === 'page-home'`; `switchTab(tab)` shows exactly one panel (`display:block`).
- `#tab-match` is special: `overflow:hidden` (it hosts a horizontal track, see §1.4); `#tab-square` and `#tab-profile` scroll themselves (`body` is `overflow-hidden`; **window never scrolls**).
- **Bottom nav `#bottom-nav`** (floating pill, hidden by default `display:none`; `switchTab` sets `display:flex`):
  - Position: fixed, horizontally centered (`left:50%; translateX(-50%)`), `bottom: calc(14px + safe-area-bottom)`, width auto.
  - Style: `border-radius 9999px; background rgba(255,255,255,.92); backdrop-blur 20px; border 1px rgba(0,0,0,.08); padding 6px 14px; gap 18px; no shadow`. Dark: bg `rgba(28,27,25,.92)`, border `rgba(255,255,255,.08)`.
  - Three items (`.nav-item`, `data-tab`): each a **50×50 circular hit area**, icon only (label text exists in DOM but `display:none`): `chat_bubble` → Match, `eco` → Square, `person` → Profile. Icon size **33px**. Inactive color `#a3a3a3`; active color **`#CCFF00`** with `FILL 1, wght 400` (filled glyph), no background.
  - Hidden state `.nav-hide`: `translateY(calc(100% + 24px))` + `opacity 0`, transition 0.3 s cubic-bezier(0.22,1,0.36,1) (auto-hide behavior §2.4).
  - Labels (hidden, but translated): Match/Square/Profile → 匹配/广场/我的.

### 1.4 Match-tab shell: top bar + three-view horizontal track (`#tab-match`)
The *contents* of the three views (chat list, romantic plan page, friend plan page) belong to the chat/match mappers; core owns the shell geometry and the `switchTab('match') → switchHomeView(S.homeView)` entry.
- **Top bar**: `fixed top-0`, height **56px + safe-area-top**, z 40, `bg surface/80 + backdrop-blur-xl`, `padding-x 8px`, flex, gap 4px, no border/shadow.
  - Left: 40×40 round button `#home-addfriend-btn`, icon `add` 22px black → `toggleChatPlusMenu()` (§1.7). (`switchHomeView` re-asserts the icon to `add` and the handler on every view switch — same button in all three views.)
  - Center: segmented control `#home-mode-switch` — `flex:1; max-width 268px; margin auto; height 40px; padding 3px; gap 3px; bg #fff; border 1px rgba(0,0,0,.08); radius 9999`. Segments `.home-mode-seg` (`data-view` chat/romantic/friend): `flex 1 1 auto` (width by content, not equal thirds), `padding 0 .65rem`, 12px bold `tracking .04em`, `#1b1b1b`, radius 9999; `.active` = neon bg + black text; hover `#f3f3f3`; press `scale(.98)`. Labels Chat / Romantic / Friend → 聊天 / 恋人 / 朋友. Dark: pill bg `#1c1b19`, border white 8%, text `#eceae6`, active still neon/black.
  - Right: 40×40 round button icon `notifications_none` 22px → `openNotifications()`; badge `#notif-badge` (hidden until count>0): absolute top 2px right 2px, `min-w 16px h 16px px 4px`, neon bg, black 10px bold, rounded-full (owned by notifications.js).
- **Track `#home-track`**: `display:flex; gap:12px; height:100dvh; will-change:transform`; three `.home-pane` children `flex: 0 0 100%; height 100%; overflow-y:auto; overscroll-behavior-y:none; -webkit-overflow-scrolling:touch`. Track offset for view i = `-i * (paneWidth + 12)`; animated `transform 0.28s cubic-bezier(0.22,1,0.36,1)` (no animation on first entry). Swipe gesture in §2.3.
  - `#home-chat-view`: `padding-top: calc(62px + --sat)` (56 bar + 6 gap), `padding-bottom 7rem`.
  - `#home-match-romantic` / `#home-match-friend` (`.home-match-pane`): `padding: calc(56px + --sat) 24px 13rem; display flex column; align-items center`; inner `.match-content` uses `margin-top/bottom:auto` (vertically centered when short, top-aligned + scrollable when tall). Plan-page variant `.match-plan` overrides padding to `calc(64px + --sat) 30px calc(96px + --sab)` and `overflow:hidden` (match mapper).

### 1.5 Toast (`#toast`)
- `toast(msg, duration=3000)`: sets `textContent`, adds `.show`, removes it after `duration`.
- Style: fixed, `top: calc(16px + safe-area-top)`, centered horizontally, z 999, `padding 12px 24px`, bg `#000`, text `#fff` 14px, radius 10, shadow `0 2px 8px rgba(0,0,0,.2)`; entrance `slideDown` 0.3 s ease-out (opacity 0 → 1, translateY -20 → 0). No exit animation.
- One singleton element; a second toast while the first is showing just replaces the text — and the **first toast's timer still fires**, hiding the second one early. (iOS: use a proper queue or restart the timer.)
- Toast text goes through the i18n observer: it is translated **only if the entire message equals a dictionary key**.

### 1.6 Confirm card & prompt card (`confirmCard`, `promptCard`)
Dynamically appended to `<body>`; not `.overlay`, so `closeAllOverlays()` does **not** remove them.
- **Backdrop**: fixed inset-0, z 120, flex center, `padding-x 24px`, `bg rgba(0,0,0,.4)`, `backdrop-blur 2px`. Tapping the backdrop resolves **`null`** (abort), distinct from Cancel (`false`) — callers (e.g. enhanced-match confirm) use this to "do nothing" vs "explicit no".
- **Card**: `width 100%; max-width 384px; bg #fff (dark #1c1b19); radius 10; shadow-2xl; padding 24px`, `role=dialog`.
- **confirmCard({title='Are you sure?', body='', confirmLabel='Confirm', cancelLabel='Cancel', danger=false})** → `Promise<true|false|null>`:
  - Title: headline font, extrabold, 18px, `tracking-tight`, on-surface, margin-bottom 8px.
  - Body (optional): 14px, `leading-relaxed`, on-surface-variant, margin-bottom 24px (a 24px spacer if no body).
  - Buttons row, gap 12px, both `flex-1; padding-y 12px; radius 10; 12px bold tracking-widest; active:scale(.98)`: Cancel = 1px `outline-variant` border, on-surface text; OK = neon bg black text, or `danger` → `neon-pink` bg **white** text.
  - All strings are HTML-escaped; the defaults are English and **not in the zh dictionary** — callers pass their own localized strings (they typically branch on `getLang()`).
- **promptCard({title='Enter a value', label='', placeholder='', value='', confirmLabel='Save', cancelLabel='Cancel', multiline=false})** → `Promise<string|null>`:
  - Title margin-bottom 12px; optional label 10px bold `tracking .2em` uppercase outline, mb 8px.
  - Field: `width 100%; bg #f3f3f3 (surface-container-low); radius 10; border 0; padding 12px 10px; focus ring 1px neon`; textarea `rows=3`, `resize:none` when `multiline`.
  - Buttons as above (OK always neon), margin-top 24px. `Enter` submits when single-line. Field auto-focused after 30 ms. Initial `value` is set via the DOM property (not markup) so quotes are safe.
  - Cancel and backdrop both resolve `null`; OK resolves the raw string (not trimmed).

### 1.7 Plus menu (`#chat-plus-menu`) — created by `match.js#toggleChatPlusMenu`, styled by core CSS
- **Entered**: tap the top-left `add` button in any of the three home views. **Exited**: tap backdrop, tap the button again, or tap an item (menu removes itself, then runs the action).
- Backdrop: fixed inset-0, z 68, `rgba(0,0,0,.12)`.
- Card: fixed, `top: calc(3.5rem + safe-area-top)` (i.e. flush under the 56px bar), `left 12px`, z 69, `min-width 208px`, bg `#fff` (dark `#1c1b19`), radius 14, border 1px `rgba(0,0,0,.06)`, shadow `0 10px 32px rgba(0,0,0,.16)`, padding 6px; entrance from `opacity 0, translateY(-6px) scale(.98)` to identity over 0.18 s (transform-origin top-left).
- Items (`.cpm-item`): full-width rows, `padding 11px 12px`, gap 12px, radius 10, 13px bold `tracking .02em`, `#1b1b1b` (dark `#eceae6`), hover `#f3f3f3`, press `scale(.98)`; icon 20px. In order:
  1. `search` — "Search & discover" / 搜索与发现 → `openFriendHubAt('search')`
  2. `qr_code_2` — "Add by QR" / 扫码添加 → `openFriendHubAt('qr')`
  3. `hub` — "Relationship Network" / 关系网 → `openFriendHubAt('graph')`
  4. `dark_mode` — "Dark mode" / 深色模式 → `toggleDarkMode()` (toasts "Dark mode on" / "Light mode on", English only)
  5. `translate` — "Language" / 语言 → `openLangDialog()` (i18n.js; choosing reloads the page)
- While the menu is open, the home three-view swipe is disabled (match.js checks for `#chat-plus-menu`). It is **not** removed by `closeAllOverlays()` / 401 / logout.

### 1.8 Image viewer (`#chat-image-viewer`)
- `.overlay`, z 80, `bg rgba(0,0,0,.9)`, flex centered; single `<img#chat-image-viewer-img>` `max-width 92%; max-height 85%; object-fit contain`. Tapping anywhere → `closeOverlay('chat-image-viewer')`.
- Opened by `openChatImage(url)` (chat.js) from chat image bubbles and from comment images in post detail (square.js passes the already-sanitized `img.src`). No zoom/pan, no arrow icon → not swipe-back-able.

### 1.9 Overlay model (`openOverlay` / `closeOverlay` / `hideOverlay` / `closeAllOverlays`)
- `.overlay`: `display:flex; flex-direction:column; position:fixed; inset:0; z-index:50; overflow-y:auto; opacity:0; visibility:hidden; pointer-events:none; transition: opacity .25s ease, visibility .25s`. `.active` → visible. Variants inside an overlay: `.bottom-sheet-transition` (translateY 100%→0, 0.32 s cubic-bezier(0.22,1,0.36,1)) for bottom sheets; `.slide-left` / `.slide-right` for side panels (translateX ∓100%→0, 0.32 s).
- `openOverlay(id)` adds `.active`; `closeOverlay(id)` / `hideOverlay(id)` (alias) removes it; `closeAllOverlays()` removes `.active` from every `.overlay` (used on 401, logout, logged-out launch, banned).
- Static overlays and their z-index (for "top-most" resolution in swipe-back): `filter-overlay` 50 (bottom sheet), `overlay-new-post` 100, `square-search-overlay` 50, `post-detail-overlay` 50, `chat-overlay` 50, `chat-image-viewer` 80, `partner-profile-overlay` 70, `edit-profile-overlay` 50, `add-interest-overlay` 60, `verify-overlay` 60, `friend-hub-overlay` 60, `notifications-overlay` 50, `notif-detail-overlay` 60, `settings-overlay` 50, `milestone-overlay` 50, `content-overlay` 60, `tickets-overlay` 60, `ticket-detail-overlay` 70, `contact-overlay` 60, `report-overlay` 60, `questionnaire-cards` 60, `q-nav-overlay` 70 (bottom sheet), `modal-energy-purchase` 100. Dynamic non-`.overlay` layers: `#ad-detail-overlay` (ads.js, z 60), confirm/prompt cards (z 120), plus-menu (68/69).

### 1.10 Safe-area rules core depends on (main.css)
- `.fixed.top-0, .sticky.top-0, .overlay > * > header.shrink-0, .overlay > header.shrink-0 { padding-top: safe-area-top }`; when those carry `h-14`/`h-16` the height becomes `calc(3.5rem|4rem + safe-area-top)`.
- `.fixed.top-0 ~ main { margin-top: safe-area-top }` (content after a fixed bar is pushed down once). Panes inside `#home-track` are *not* siblings of the bar, so they add `--sat` in their own padding (§1.4) — never both.
- `#splash-skip` top `2rem + sat`; `#toast` top `16px + sat`; `.ptr-indicator` top `sat`; `#chat-plus-menu .cpm-card` top `3.5rem + sat`; `#bottom-nav` bottom `14px + sab`; helpers `.pt-safe` / `.pb-safe`.
- Bottom sheets must **not** use `top-0` on their header (would get a phantom safe-area band).

### 1.11 Pull-to-refresh indicator (`.ptr-indicator`, injected by `attachPullToRefresh`)
- Appended as the last child of the scroll container: `position:absolute; top: safe-area-top; left:50%; 40×40; radius full; bg #fff (dark #23211f); no shadow; z 39` (below the 40/50 top bars so it slides out from beneath them); initial `translateX(-50%) translateY(0)`, `opacity 0`, `pointer-events none`. Icon `refresh` 22px `#1b1b1b` (dark `#eceae6`); `.ptr-ready` → icon neon; `.ptr-spinning` → icon neon + `rotate 360° / 0.7s linear infinite`.

### 1.12 Energy bar (`#energy-display`, rendered by `profile.js#renderEnergyDisplay`, cells styled by core CSS)
- Lives in the Profile tab row "Energy": row button full width, `padding-y 16px`, bottom hairline `outline-variant/20`; left icon `flash_on` (FILL 1) + label "Energy"/能量 14px medium tracking-wide; middle `#energy-display` flex-1 right-aligned wrap gap 4px; right `chevron_right` (outline-variant). Tap → `openEnergyModal()`.
- Cells: `.energy-cell` 14×14, radius 3, neon solid = **available** energy; `.energy-cell--empty` transparent with 1px `#c6c6c6` border = **used** energy. Max **5** cells drawn (filled first, then empties up to 5); if `total > 5` append `+N` (N = total − 5) in 10px outline text; if nothing to draw show `0` in 10px outline.
- Data: `S.energy = {totalEnergy, usedEnergy, availableEnergy}` from `GET /energy/balance` (`loadEnergyBar`, called on Profile open, after purchase/claim/refund, and by match/square/chat before energy-costing actions). Missing `availableEnergy` → computed `total − used`. Load failure is silent (keeps last value).
- The purchase page `#modal-energy-purchase` (full-screen overlay z 100; sticky 64px header with `arrow_back` + "Get Energy"/获取能量; 3 package cards 30/¥30, 60/¥58, 100/¥88 refreshed from `GET /energy/packages`; payment rows WeChat Pay / Alipay / Card (Stripe) with `check_circle` neon check; CTA `.btn-cta` states "Select a package" → "Select a payment method" → "Pay ¥X · N cells" → "Processing…"; `POST /energy/purchase` then `POST /energy/purchase/confirm`) is profile.js territory — see the profile map for details.

### 1.13 Ads injection hooks (ads.js — core-adjacent plumbing)
- `fetchSquareAds()`: only when `S.currentUser.profile.school` is set; `GET /ads/feed?school=<school>&limit=3` → array (or `{items}`/`{ads}`); failures return `[]` silently. Cards (`adLargeCard`) are rendered into the recommend feed by square.js (never on Campus Wall).
- Impressions: `IntersectionObserver` threshold 0.5, one impression per campaign per session. Clicks: whole card → `click` event, then `landingUrl` opens externally (`noopener`) or an in-app detail layer `#ad-detail-overlay` (fixed inset-0 z 60, sticky 64px header `arrow_back` + "Sponsored" 10px bold tracking .15em; images full width; body with `Sponsored` badge, title 30px bold, content 18px light pre-wrap, advertiser 10px). This layer is **not** an `.overlay` (no swipe-back, not closed by `closeAllOverlays`).
- Events batched in memory and `POST /ads/events {events:[{campaignId, school, type:'impression'|'click'}]}` every 10 s via `fetch(..., {keepalive:true})` with Bearer header, ≤100 per request (backend DTO limit), queue cap 200; 5xx/network → re-queued, 4xx dropped; flushed on `visibilitychange:hidden` and `pagehide`.
- Account switch is detected by comparing `localStorage.cl_token` on every call (`ensureAdSession`): token change wipes queue, impression set, ad cache, timer, observer. iOS: reset ad session state on logout/login.

---

## 2. Interactions

### 2.1 Navigation primitives
- **`showPage(id)`**: remove `.active` from all `.page`; `display:none` every `[id^="tab-"]`; add `.active` to `#id`; bottom nav `display` = `flex` if `id==='page-home'` else `none`. Pages: `page-auth`, `page-banned`, `page-profile-setup`, `page-questionnaire`, `page-home`.
- **`switchTab(tab)`** (`'match'|'square'|'profile'`), bound to bottom-nav buttons (inline `onclick`):
  1. `reTap = (S.activeTab === tab)`.
  2. Stop background timers: `stopMatchPolling()`, `stopChatPolling()`, `stopNotifPolling()`, `stopCountdownTick()` (all provided by other modules; called unguarded — they must exist).
  3. `S.activeTab = tab`; force `page-home` active; show bottom nav; toggle `.active` on the nav item with matching `data-tab`; hide all tab panels; `display:block` the target.
  4. Load: `match` → `switchHomeView(S.homeView || 'chat')` (match.js: re-highlights segments, snaps the track, then loads chat sessions or checks questionnaire completion + loads match state). `square` → first time / normal: `loadSquareTab()`; **re-tap** → smooth-scroll `#tab-square` to top, zero `S.squareScrollPos[S.squareTab]`, and `loadSquareTab2(S.squareTab)` (refresh **only the current feed page**; the other pages keep content & scroll). `profile` → `loadProfileTab()`.
  - There is no re-tap behavior for match/profile.
- **`checkUserState()`** (launch/login router) — see §3.3 for the API; UI outcomes: no token → `cleanupUserState()`, `closeAllOverlays()`, `showPage('page-auth')`; BANNED → `closeAllOverlays()`, `showPage('page-banned')`; no profile (`hasProfile` false, fallback `!!profile.nickname`) → `showPage('page-profile-setup')`; else `showPage('page-home')` + `switchTab('match')`. Questionnaire completion is **not** a gate (it is checked lazily when entering romantic/friend views). On success it also calls `startRealtime()`.

### 2.2 Bottom nav auto-hide (`bindNavAutoHide(container)`)
- Bound (main.js) to `#home-chat-view`, `#tab-square`, `#tab-profile` scroll events (passive). Per container: `dy = scrollTop − last`; if `scrollTop < 40` → always show; else `dy > 6` → add `.nav-hide`; `dy < −6` → remove. Idempotent via `data-nav-hide-bound`. (Match panes don't hide the nav.)

### 2.3 Home three-view swipe (match.js `bindHomeViewSwipe`, documented here because core's `switchTab` and PTR interlock with it)
- On `#tab-match`: touchstart ignored if any `.overlay.active` or `#chat-plus-menu` exists, or a second finger lands mid-gesture. Direction decided after 12px movement; horizontal → `root.dataset.horizLock='1'` (PTR reads this and hides its indicator), `touch-action:none`, `preventDefault` on move (non-passive). Track follows the finger 1:1 (`homeTrackOffset(current) + dx`), damped ×0.3 at either end (rubber band). Release (bound on `document` for touchend/touchcancel): `|dx| ≥ 70` and a neighbor exists → `switchHomeView(neighbor)` (same 0.28 s snap animation as tapping a segment); otherwise snap back. Target is always `current index ± 1` clamped (never skips a page).

### 2.4 Pull-to-refresh (`attachPullToRefresh(container, onRefresh, contentSelector?, opts?)`)
- Bound once per container (`data-ptr-bound`). Instances: `#tab-match` → `loadSessions()`, movers `#home-chat-view`, `opts.enabled = () => S.homeView === 'chat'` (**only the Chat view refreshes; match panes have no PTR**); `#tab-square` → `loadSquareTab2()` (current feed), movers `main`; profile scroll (profile.js) with `opts.onPull(dist)` to fade the cover blur (1 → 0 across 0–140px) and stretch the hero height.
- Start (touchstart, passive): skip if refreshing or `enabled()` false; arm only when `container.scrollTop <= 0` **and** no ancestor of the touch target between target and container is "inner-scrolled" (`scrollTop > 0 && scrollHeight > clientHeight`) — protects nested scrollers like the match plan summary box.
- Move (passive): if `container.dataset.horizLock === '1'` → hide indicator, zero distance, do nothing (horizontal swipe owns the transform). If `dy <= 0` or container/inner scrolled → reset. Else `dist = 180 · (1 − e^(−dy/180))` (dy 90 → 70, 200 → 122, 400 → 160, ∞ → 180); indicator opacity `min(1, dist/40)`; indicator and movers `translateY(dist)` with **no** transition; icon rotates `dist/70 · 360°`; `.ptr-ready` when `dist ≥ 70`; `onPull(dist)`.
- End: `dist < 70` → animated reset (0.3 s cubic-bezier(0.22,1,0.36,1)). Else `refreshing=true`, `.ptr-spinning`, hold indicator + content at 70px, `onPull(70)`, `await onRefresh()` (errors swallowed — loaders toast themselves), then wait so the spinner shows **≥ 600 ms** total, then reset. `touchcancel` → reset.
- Movers get `transition: transform .3s cubic-bezier(.22,1,.36,1)` on reset and `none` while dragging.

### 2.5 Bottom-sheet drag-to-close (`bindSheetDragClose(overlayId, onClose?)`)
- Finds `#overlayId .bottom-sheet-transition header`; only the header/grab area drags. Sheet follows finger downward (`translateY(max(0,dy))`, transition none). On release: clear inline styles; if `dy > 110` → `onClose()` (or `hideOverlay(overlayId)`), else it snaps back via CSS. Bound only for `filter-overlay` with `closeFilterSheet` (which also syncs the plan-page summary box).

### 2.6 Edge swipe-back (global, `bindEdgeSwipeBack` IIFE)
- Start: first touch with `clientX ≤ 30` (left edge). Target = the **top-most active `.overlay`** (max computed z-index among `.overlay.active` with an id) **if it contains a Material icon whose text is `arrow_back` or `arrow_forward`**; if no overlay is active and `#page-questionnaire` is active → target the questionnaire page. Anything else → no gesture (e.g. bottom sheets, image viewer, `#ad-detail-overlay`, auth pages).
- Move (non-passive): direction locks after 10px; horizontal → `touch-action:none` on the panel and `preventDefault` (kills vertical scroll); only `dx > 0` translates the **whole overlay root** `translateX(dx)` (no fade, header + content move together).
- End/cancel: `dx ≥ 80` → animate to `translateX(100vw)` over 0.2 s ease-out, then clear inline styles and close via `SWIPE_BACK_CLOSE[id]`: `chat-overlay→closeChat()`, `friend-hub-overlay→closeFriendHub()`, `notifications-overlay→closeNotifications()`, `post-detail-overlay→closePostDetail()`, `milestone-overlay→closeOverlay('milestone-overlay')`, `modal-energy-purchase→closeEnergyModal()`, `square-search-overlay→closeSquareSearch()`, questionnaire → `showPage('page-home'); switchTab('match')`, any other overlay → `hideOverlay(id)`. Else snap back over 0.25 s cubic-bezier(0.22,1,0.36,1) and clear styles after 280 ms.
- Second finger mid-gesture is ignored (state preserved); `touchcancel` and re-entry always clear inline `transition/transform/opacity/touchAction` so an overlay can never get stuck offset.
- Overlays that statically contain a back arrow today: `square-search-overlay`, `post-detail-overlay`, `chat-overlay`, `friend-hub-overlay`, `notifications-overlay`, `notif-detail-overlay`, `settings-overlay`, `milestone-overlay`, `content-overlay`, `tickets-overlay`, `ticket-detail-overlay`, `modal-energy-purchase`; `partner-profile-overlay` gets one when match.js renders `.pp-back`. iOS: use the standard interactive pop gesture on exactly these screens.

### 2.7 Small helpers
- **`btnBusy(id, busy)`**: `busy=true` → store current label in `data-label`, `disabled=true`, text "Saving…" / "保存中…" (by `getLang()`); `false` → restore. Used by profile/match/settings save buttons. Caveat noted in project log: match.js `applyPanelReadonly` has a 350 ms timer that can flip `disabled` back — don't rely on the visual state as a guard.
- **`codeCooldown(btn, seconds, idleLabel)`**: disables the button and shows `"<N>s"` counting down every second (language-neutral), then re-enables with `idleLabel` (which the zh observer re-translates). Used by register and student-verification "Send code" buttons (60 s).
- **`flatEmptyIcon(icon, tone='muted'|'neon')`**: 64×64 rounded-18 square, centered, margin-bottom 24px; muted = bg `#efefef` icon `#8a8a8a`; neon = bg `#CCFF00` icon `#000`; icon 28px. Hard-coded colors (**not dark-mode aware**). Used by all empty states.
- **`escapeHtml(t)`**: text → HTML entities (does **not** escape quotes — never use for attributes).
- **`safeUrl(u)`** (for `src`/`href`): trim; strip chars U+0000–U+0020 before scheme check; reject `javascript:`, `vbscript:`, `file:`, `blob:` and any `data:` that isn't `data:image/`; then entity-escape `& < > " ' \``. **`safeCssUrl(u)`** (for CSS `url()`): same scheme rules, then strip `" ' ( ) \ < >` and whitespace. iOS rule: only load `http(s)` and `data:image/*` URLs from user-controlled fields (avatarUrl, coverUrl, post images, realPhotos, chat images).
- **`readFileAsDataUrl(file, cb)`**: FileReader → data URL (local preview before upload).
- **`uploadImageFile(file)`**: §3.2.

---

## 3. API calls

### 3.1 Base URL, headers, envelope, errors (`api(path, method='GET', body=null)`)
- Base `S.API` (state.js): if host is `localhost`, `127.0.0.1` or a bare IPv4 → `${protocol}//${host}:3001/api/v1`; otherwise `https://api.<host with leading "app." removed>/api/v1` (prod: `https://api.unimatcha.ai/api/v1`). All backend routes carry the global prefix `/api/v1` except static `/uploads/*`.
- Request: `Content-Type: application/json` always (even GET), `Authorization: Bearer <localStorage.cl_token>` when present, `cache: 'no-store'` (the API sends no Cache-Control; without this Safari heuristically cached GETs and "save succeeded but reopen shows old value"). Body JSON-stringified when provided. Method is positional (`api(path, 'PUT', body)`).
- **Success envelope** (global `TransformInterceptor`): `{ success:true, data:<payload>, message?:string, timestamp:ISO }` — if a handler returns `{data, message}` those are lifted, otherwise the whole return value becomes `data`. `api()` returns this raw envelope; every caller does `const d = res.data || res`.
- **Error body** (global `HttpExceptionFilter`): `{ success:false, statusCode, message, errors|null, timestamp, path }`. `api()` throws `Error(message || 'API <status>')` — note `message` can be a string **array** from class-validator (stringifies as comma-joined).
- **401 handling** (inside `api()` only, not `uploadImageFile`): remove `cl_token`; `stopMatchPolling`, `stopRealtime`, `stopChatPolling`, `stopNotifPolling`, `stopCountdownTick`; `cleanupUserState()`; `closeAllOverlays()`; `showPage('page-auth')`; then `throw Error('Unauthorized')` so the caller's `catch` runs (callers must tolerate this — some will still toast "… failed: Unauthorized"). The JWT strategy also returns 401 for deactivated users (`'User not found or has been deactivated'`) and banned users (`'Your account has been banned'`), so a ban mid-session surfaces as a logout, not the banned page.
- No retry, no timeout, no request de-dup at this layer (modules add their own sequence tokens).

### 3.2 `POST /uploads/image` (`uploadImageFile(file)`)
- `multipart/form-data`, field name `file`; only `Authorization` header (no Content-Type). Limits: 8 MB; MIME must be `image/jpeg|png|gif|webp` (SVG explicitly rejected: `"Only JPEG, PNG, GIF, or WebP images are allowed"`; empty: `"Please select an image to upload"`). Stored name is `uuid + ext-from-mime`.
- Response `data: { url, filename }`; helper returns `data.data?.url || data.url` (absolute `https://api.<domain>/uploads/<uuid>.<ext>`, https because API trusts the proxy). Non-OK → `Error(body.message || 'Upload failed')`; **401 here does not trigger the logout flow**.
- Callers: profile (avatar/cover/photos), chat (image messages), square (post & comment images), couple. Uploaded files are served with 1-year immutable cache.

### 3.3 `GET /users/me` (`checkUserState()`)
- Called at launch (after splash) and after login. Response `data`: `{ id, email, status ('ACTIVE'|'BANNED'|…), verificationStatus, createdAt, modeStates:[{mode, matchState, matchSearchingSince}], profile:{nickname, realName, familyName, givenName, school, grade, gender, genderPref, age, city, interests[], bio, avatarUrl, socialLinks, relationshipScore, profileCompleteness, signature, coverUrl, tags[], major, mbti, nationality, realPhotos[], zodiac, wishGifts[], studentId, birthday} | null, hasProfile:boolean, completedQuestionnaire:boolean }`.
- Fields core uses: `status`, `hasProfile` (fallback `profile.nickname`). Whole object stored as `S.currentUser` (ads.js reads `profile.school`; many modules read `profile.*`).
- **Any** thrown error (network failure included, not just 401) → token removed + auth page. iOS should distinguish transport errors from 401 and keep the session on transient failures.

### 3.4 `GET /realtime/stream?token=<jwt>` — SSE (`startRealtime` / `stopRealtime`)
- Opened after `/users/me` succeeds (`checkUserState`) and right after registration (`auth.js doRegister`). Token must be in the **query string** (EventSource can't set headers; the route is `@Public()` and verifies the JWT manually: role must be `user`, user must exist and not be BANNED, else `401 {message:'Unauthorized'}` — the browser then stays CLOSED, no reconnect).
- Server frames (all `data: <json>\n\n`):
  - `{"type":"ready"}` — first frame; client sets `S.realtimeUp=true`.
  - `{"type":"message","matchId"}` — new chat message or nudge / couple "I love you" for that match (recipient only, never echoed to sender).
  - `{"type":"read","matchId"}` — the partner marked my messages read.
  - `{"type":"notification"}` — any new notification (matching results, confirmations, dissolutions, likes, comments, milestones, friend requests…). No payload beyond the type.
  - `{"type":"evicted"}` — server enforces **max 5 connections per user**; the oldest gets this frame then EOF. Client must close and **not** reconnect (stay on full-rate polling), otherwise 6+ tabs create a ~3 s eviction loop.
  - Comment heartbeat `: ping\n\n` every 25 s (keep read timeouts > 25 s).
- Client reaction:
  - `message`: if `S.chatMatchId === matchId` → `pollChatMessages()` immediately; and `loadSessions()` throttled (key `realtimeSess`, 3 s leading+trailing).
  - `read`: if same open chat → `refreshReadReceipts()`.
  - `notification`: `notifPollTick()` (refresh list + unread badge) throttled (key `realtimeNotif`, 3 s leading+trailing).
  - `onopen` → `realtimeUp=true`; `onerror` → `realtimeUp=false` (EventSource auto-reconnects with its default ~3 s backoff; polling returns to full rate meanwhile).
- **Throttle semantics** (`throttleWithTrailing`): first call in a 3 s window runs immediately; further calls schedule exactly one trailing run at the window end (so the last state is never stale). `stopRealtime()` closes the stream, clears `realtimeUp`, and cancels pending trailing timers (prevents token-less requests after logout).
- **Polling downshift while `S.realtimeUp`** (other modules, but driven by this flag): chat polling interval stays 5 s but only every 6th tick runs (effective 30 s); notification polling 15 s runs every 4th tick (60 s). When SSE is down the full rate resumes automatically. Events are invalidation-only — all data is still fetched via REST.
- Not covered by SSE (accepted 60 s fallback): energy refund notifications from deep transaction helpers.

### 3.5 Web-only self-healing (index.html) — for awareness
- Version drift: 2.5 s after load, and on `visibilitychange→visible` if > 30 min since last check, `fetch(location.pathname + '?vchk=' + now, {cache:'no-store'})`, extract `assets/index-*.js` hash, reload once per session (`sessionStorage.cl_ver_retry`) if it differs from the running bundle. nginx serves `index.html`/`manifest` with `no-store`, `/assets/` immutable 1 y. No iOS equivalent required.

### 3.6 Energy / ads endpoints touched by core-adjacent code (owned elsewhere, listed for completeness)
- `GET /energy/balance` → `{totalEnergy, usedEnergy, availableEnergy}` (§1.12). `GET /energy/packages` → `[{packageId, cells, priceCny}]`. `POST /energy/purchase {packageId}` → `{orderId}`; `POST /energy/purchase/confirm {orderId, packageId}`.
- `GET /ads/feed?school&limit=3`; `POST /ads/events {events[]}` (§1.13).

---

## 4. Client state

### 4.1 `S` fields core reads/writes (state.js declares most; core adds `realtimeES`, `realtimeUp`, `rtThrottle` dynamically)
- `S.API` (derived base URL), `S.currentUser`, `S.activeTab` (`'match'|'square'|'profile'`, default `'match'`), `S.homeView` (`'chat'|'romantic'|'friend'`, default `'chat'`), `S.activeMatchMode`, `S.matchStatus {romantic, friend}`, `S.squareTab` / `S.squareScrollPos` (re-tap refresh), `S.realtimeES` (EventSource), `S.realtimeUp` (bool, read by chat/notification pollers), `S.rtThrottle {key:{last, timer}}`.
- Everything else in `S` is owned by other modules but **reset here** (below).

### 4.2 localStorage / sessionStorage
- `cl_token` — JWT (set by login/register; read by `api()`, `uploadImageFile`, `startRealtime`, ads.js; removed on 401/logout/launch failure).
- `cl_lang` — `'en'` (default) | `'zh'` (i18n.js; changing it reloads the page).
- `cl_theme` — `'light'` (default) | `'dark'` (i18n.js; toggles `html.dark`).
- `sessionStorage.cl_boot_retry`, `cl_ver_retry` — web watchdog guards.
- Ads session token snapshot lives in ads.js module memory, keyed off `cl_token`.

### 4.3 `cleanupUserState()` — runs on logout, 401, launch without token
Order: `stopMatchPolling`, `stopChatPolling`, `stopNotifPolling`, `stopCountdownTick`, `stopRealtime`, `stopSessionCountdown`; then resets: `currentUser=null`, `userSettings=null`, `matchStatus={romantic:null,friend:null}`, `homeView='chat'`, `activeMatchMode='romantic'`, `isSubmittingProposal=false`, `energy={0,0,0}`, `enhanced={romantic:{enabled:false,cost:3}, friend:{enabled:false,cells:1}}`, `matchBasis='both'`, `matchExtraInfo=''`, `matchPrefs={romantic:null,friend:null}`, `resetMatchPlanState()` (match.js: clears last-enhanced-round marker + invalidates in-flight preference responses), `matchPollingId=null`, `matchPollFailCount=0`, chat (`chatMatchId/PartnerId/PartnerName=null`, `chatMessages=[]`, `chatPollingId=null`, `chatLastId=null`, `chatNextCursor=null`, `chatRenderFrom=0`, `chatLoadingHistory=false`, `chatPollBusy=false`, `chatPollTick=0`, `sessions=[]`, `chatSessionType/chatMode/chatSessionStatus=null`, `chatMyConfirmed/chatPartnerConfirmed=false`, `sessionCountdownId=null`), `countdownInterval=null`, notifications (`notifPollingId=null`, `notifList=[]`, `notifPage=1`, `notifHasMore=false`, `notifLoadingMore=false`), questionnaire (`questionnaire=null`, `answers={}`, `romanticAnswers={}`, `friendAnswers={}`, `questionnaireMode='romantic'`, `currentQuestion=0`), square (`currentPostId=null`, `pdPostData=null`, `pdSortMode='time'`, `pdReplyTo=null`, `pdPendingImgs=[]`, `newPostImages=[]`, `squarePosts=[]`, `squareReqSeq=0`, `isSubmittingPost=false`, `squareTab='recommend'`, `newPostBoard='recommend'`, `newPostAnonymous=false`), profile (`editTags=[]`, `setupTags=[]`), UI (`activeTab='match'`, `squareSection='recommended'`, `milestoneData=null`, `metadataCache={}`, `filterGender='all'`, `filterStages=[]`).
- **Not reset** (potential cross-account bleed to keep in mind): `friendPrefInterests`, `friendPrefActivities`, `friendGender`, `prefMode`, `squareSearchQuery`, `squareScrollPos`, `energyPackages`, `campusAnimTimer`, `notifRefreshBusy`; DOM leftovers: an open plus-menu, confirm/prompt cards, `#ad-detail-overlay`, `#notif-badge` text, `#energy-display` cells, the questionnaire/segment highlight — they survive until re-rendered.

---

## 5. i18n

### 5.1 Mechanism (i18n.js)
- Single dictionary `ZH` (English key → Chinese) + `ZH_PLACEHOLDER` for input placeholders. When `cl_lang === 'zh'`, `startI18n()` walks the whole body once and installs a `MutationObserver` (childList+subtree) that translates every **added** text node whose **trimmed text exactly equals** a key. Attribute changes are not observed (call `window.translatePlaceholders(root)` after rewriting placeholders).
- Any element with `data-no-i18n` (or inside one) is skipped — this is how user content (nicknames, post text, chat bubbles, aliases, numbers like `Unimatcha v2.4.0`) avoids being mistranslated. Short generic words are deliberately **not** in the dictionary (e.g. "Title", "Today") for the same reason.
- Runtime branches use `window.getLang() === 'zh'` (e.g. `btnBusy`, confirm-card callers, `aliasName`, `metaLabel` for school/city/major display names).
- Language switch reloads the page (`toggleLang` / `openLangDialog` — the latter is a small dialog: max-w 320, radius 16, buttons "取消/Cancel" + "确定/Confirm").
- Consequence for iOS: ship a proper string table; the keys below are the exact English source strings.

### 5.2 Strings owned/rendered by this module and its shell (en → zh; "—" = no zh entry, English shows in both)
- Splash: `UNIMATCHA` (never translated); "One thoughtful match, every week." → 每周一次，用心匹配。; `Skip` → —; `BETA` (never translated).
- Bottom nav: Match → 匹配; Square → 广场; Profile → 我的.
- Home segments: Chat → 聊天; Romantic → 恋人; Friend → 朋友. Button `title` tooltips `Add` / `Notifications` are attributes, so the text-node observer never translates them (irrelevant on touch anyway).
- Plus menu: "Search & discover" → 搜索与发现; "Add by QR" → 扫码添加; "Relationship Network" → 关系网; "Dark mode" → 深色模式; "Language" → 语言; toasts "Dark mode on" / "Light mode on" → —.
- Banned page: "Account Suspended" → —; body sentence → —; "Log Out" → 退出登录; "© 2026 Unimatcha. All Rights Reserved." → —.
- Confirm/prompt defaults: "Are you sure?" → —; "Confirm" → — (only the language dialog has inline 确定); "Cancel" → 取消; "Save" → 保存; "Enter a value" → —. Logout confirm (auth.js): title "Log out of Unimatcha?" (—), OK "Log Out" (退出登录), danger style.
- Busy/cooldown: "Saving…" ↔ "保存中…" (runtime branch); cooldown shows `"59s"…"1s"` in both languages.
- Errors surfaced from core: `Unauthorized` (—), `Upload failed` (—), `API <status>` (—). Dictionary has `Retry` → 重试, "Failed to load" → 加载失败, "Loading..." → 加载中…, "Check your connection and try again" → 请检查网络后重试 for modules that use them.
- Energy row/page (profile-owned but core-styled): Energy → 能量; "Get Energy" → 获取能量; `cells` → 格; "Payment Method" → 支付方式; "WeChat Pay" → 微信支付; Alipay → 支付宝; "Card (Stripe)" → 银行卡 (Stripe); "Select a package" → 请选择套餐; "Select a payment method" → 请选择支付方式; "Pay ¥X · N cells" / "Processing…" → — (dynamic, English).
- Ads: `Sponsored` → — (badge text, uppercase).

---

## 6. Cross-module links

### 6.1 What core exposes on `window` and who uses it (call counts from grep)
- `api` — every module (addfriend 3, ads 1 via fetch, auth 5, chat 13, couple 3, match 15, milestone 2, notifications 3, profile 17, questionnaire 4, settings 5, square 13).
- `uploadImageFile` — chat 3, couple 2, profile 4, square 2.
- `showPage` — auth 2, match 1, questionnaire 3, index.html inline 2 (profile-setup back → `page-auth`; questionnaire back → `page-home` + `switchTab('match')`).
- `switchTab` — match 1, milestone 1, profile 2, questionnaire 2, square 2, index.html nav buttons 3 + questionnaire back.
- `openOverlay` / `closeOverlay` / `hideOverlay` — all overlay owners (profile 7/7, settings 5/1/1, notifications 2/2, square 2/2, questionnaire 2/2/2, addfriend 2/1, chat 2/1, match 2/1/1, milestone 1/0/1) + 11 inline `hideOverlay(...)` close buttons in index.html.
- `confirmCard` — auth 2 (logout, …), chat 1, couple 4, match 2, questionnaire 1, square 3. `promptCard` — auth 2, couple 2, match 1, square 1.
- `toast` — everywhere (profile 43, square 26, match 23, chat 18, auth 16, couple 11, settings 7, questionnaire 4, addfriend 3, notifications 2, i18n 1).
- `escapeHtml` (square 24, profile 16, match 13, chat 12, …), `safeUrl` (square 9, match 7, profile 6, couple 4, chat 3, ads 2, addfriend 1, milestone 1), `safeCssUrl` (couple 1, profile 1), `readFileAsDataUrl` (square 2), `flatEmptyIcon` (square 6, match 4, notifications 2, profile 2, chat 1), `btnBusy` (profile 3, match 2, settings 2), `codeCooldown` (auth 1, profile 1), `attachPullToRefresh` (profile 1 + main.js 2), `bindNavAutoHide` / `bindSheetDragClose` (main.js only), `cleanupUserState` / `closeAllOverlays` / `checkUserState` (auth.js), `startRealtime` (auth.js register path), `stopRealtime` (core only), `hideSplash` (main.js timer + Skip button).

### 6.2 What core calls into (must exist on `window` in the iOS equivalent)
- match.js: `switchHomeView`, `stopMatchPolling`, `stopCountdownTick`, `resetMatchPlanState`, `closeFilterSheet` (via main.js), `bindHomeViewSwipe` (main.js), `toggleChatPlusMenu` (button).
- chat.js: `loadSessions`, `pollChatMessages`, `refreshReadReceipts`, `stopChatPolling`, `stopSessionCountdown`, `closeChat`, `sendChatMessage` (Enter key in main.js).
- notifications.js: `notifPollTick`, `stopNotifPolling`, `closeNotifications`.
- square.js: `loadSquareTab`, `loadSquareTab2`, `closePostDetail`, `closeSquareSearch`, `handlePostImages`, `submitPdComment` (Enter key).
- profile.js: `loadProfileTab`, `closeEnergyModal`, `renderSetupTags` (main.js).
- addfriend.js: `closeFriendHub`. i18n.js: `getLang`.
- auth.js entry points into core: `doLogin` → `api('/auth/login','POST',{email,password})` → store token → `checkUserState()`; `doRegister` → store token → `startRealtime()` → `showPage('page-profile-setup')`; `doLogout` → `confirmCard` → stop pollers → remove token → `cleanupUserState()` → `closeAllOverlays()` → `showPage('page-auth')`.

### 6.3 Boot sequence (main.js `DOMContentLoaded`)
1. `setTimeout(hideSplash, 3000)`.
2. Bio counters for setup/edit profile; Enter-to-send on `#chat-input` (preventDefault, no Shift) and `#comment-input`; `#post-image-input` change → `handlePostImages`.
3. `renderSetupTags()`.
4. `attachPullToRefresh(#tab-match, loadSessions, '#home-chat-view', {enabled: homeView==='chat'})`; `attachPullToRefresh(#tab-square, loadSquareTab2, 'main')`.
5. `bindHomeViewSwipe()`; `bindSheetDragClose('filter-overlay', closeFilterSheet)`; `bindNavAutoHide` for `home-chat-view`, `tab-square`, `tab-profile`.
6. `window.__appBooted = true` (set at module evaluation, before this handler).

---

## 7. Gotchas an iOS implementer must know

1. **Envelope everywhere**: every JSON response is `{success, data, message?, timestamp}`; decode `data`. Errors are `{success:false, statusCode, message(string|string[]), errors, path}`.
2. **401 = hard logout** in the web app, but a **network error during `/users/me` at launch also logs the user out** (token deleted). Do not replicate; treat only 401 as session loss. A ban mid-session comes back as 401 (`Your account has been banned`), and only the launch-time `/users/me` (status `BANNED`) routes to the Banned screen.
3. **Onboarding gate is profile-only**: `hasProfile` (nickname present) decides setup vs home; questionnaire completion is checked when entering romantic/friend views, not at launch.
4. **SSE contract**: token in the query string (backend accepts nothing else today); frames `ready | evicted | message{matchId} | read{matchId} | notification`; `: ping` comments every 25 s; server caps 5 streams per user and evicts the oldest with an `evicted` frame — on `evicted` **close and never auto-reconnect** (stay on polling). Reconnect (≈3 s backoff) only on transport errors; never on HTTP 401. Events carry no data: always re-fetch via REST (`GET` chat messages / sessions / notifications). Keep polling as a fallback and downshift it to 30 s (chat) / 60 s (notifications) while the stream is up; return to 5 s / 15 s when it drops. Debounce `loadSessions` and notification refresh with a 3 s leading+trailing throttle; cancel pending trailing work on logout.
5. **`cache: 'no-store'`** is load-bearing on web because the API sends no Cache-Control; on iOS use `.reloadIgnoringLocalCacheData` (or disable URLCache) for authenticated GETs.
6. **Uploads**: multipart field `file`, 8 MB, jpeg/png/gif/webp only (SVG rejected for XSS reasons), returned URL is absolute https and immutable-cached; the helper's 401 path does *not* log out.
7. **URL hygiene**: user-supplied image URLs must be validated like `safeUrl` (allow only `http(s)`, protocol-relative, and `data:image/*`); never build markup/attributes from them unescaped. `escapeHtml` does not escape quotes — that was the source of a real stored-XSS bug.
8. **Navigation shell**: only one tab panel is visible at a time; `switchTab` stops *all* pollers first, so each tab restarts its own polling on load. Re-tapping **Square** scrolls to top and refreshes only the current feed page; re-tapping Match/Profile does nothing special. Bottom nav is hidden on every non-home page and auto-hides on scroll (dy > 6 hides once past 40px; dy < −6 or < 40px shows).
9. **Home three views** are one horizontal track with a 12px gutter; segment tap and swipe share the same 0.28 s snap; swipe commits at 70px, always to the adjacent view, rubber-bands ×0.3 at the ends, and is disabled while any overlay or the plus-menu is open. Vertical scrolling happens per pane, and each pane pads the status-bar inset itself.
10. **Pull-to-refresh** exists only on Chat list, Square feed, and Profile (Profile additionally stretches the cover/un-blurs it). Arm only at `scrollTop <= 0` with no nested scrolled ancestor; exponential damping to 180px; commit at 70px; hold content at 70px during refresh; spinner ≥ 600 ms; hidden while a horizontal swipe is in progress.
11. **Swipe-back** (left edge ≤ 30px, commit ≥ 80px, no fade) applies only to full-screen layers that show a back arrow (list in §2.6) and to the questionnaire page; bottom sheets close by dragging their header > 110px instead. Overlay layering uses explicit z-indexes (§1.9); the top-most active one is the swipe target.
12. **Confirm card returns tri-state** (`true` / `false` / `null` on backdrop tap); callers like the enhanced-match confirm treat `null` as "abort, don't fall back". Prompt card returns `null` for both cancel and backdrop.
13. **Toast** is a single element with overlapping timers (second toast may vanish early); message translation only on exact dictionary match; danger/success variants don't exist (always black on white text).
14. **Theming**: dark mode is a `.dark` class with hard-coded warm-black palette (§0); several core visuals are *not* dark-aware (`flatEmptyIcon` hard-coded colors, `.energy-cell--empty` border `#c6c6c6`, toast always black/white); the confirm/prompt cards *are* dark-aware because they use mapped `bg-surface-container-lowest` / `border-outline-variant` classes. Bottom nav and top bars are translucent + blurred.
15. **Safe areas**: every top bar = base height (56/64px) + inset; toast/PTR/plus-menu/splash Skip are offset by the inset; bottom nav sits 14px above the home indicator. Never add the inset twice (panes inside the home track already include it).
16. **cleanupUserState is the account-switch firewall** — anything cached per user (energy, enhance toggles, match prefs, chat cursors, notification pages, questionnaire answers, square compose state, filters) must be zeroed on logout/401; the list in §4.3 is exhaustive today and the "not reset" list is a known gap. Ads must also reset per account.
17. **Plus-menu, confirm/prompt cards and the ad detail layer are not overlays** — they are not closed by `closeAllOverlays()` (logout/401) and don't block swipe-back the same way; on iOS give them the same dismissal semantics as sheets.
18. **Splash timing**: shown ≥ 3 s (or until Skip), 0.6 s fade, then routing. The web watchdog's fallback UI element is missing — an iOS launch should instead show a retry when `/users/me` fails on transport.
19. **Language switch reloads the whole app** on web; on iOS just re-render, but note aliases (`aliasName`) and metadata labels (`metaLabel`) are chosen at render time from the current language, and dynamic strings such as "Saving…"/"保存中…", "Ns" countdown, "Pay ¥X · N cells" are computed, not dictionary-driven.
20. The Profile tab shows a static version string `Unimatcha v2.4.0` (`data-no-i18n`); PWA manifest name "Unimatcha", theme color `#f9f9f9`, standalone display — the iOS app icon/launch assets are `/public/icons/icon-512.png` and `apple-touch-icon.png`.
