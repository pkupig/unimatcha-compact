# H5 module map — `addfriend` (Friend Hub: contact search / QR add / relationship graph) + `ads` (square sponsored cards + impression/click batching)

Sources read in full:
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/addfriend.js` (307 lines)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/ads.js` (198 lines)
- Markup: `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` lines 108–110 (QR libs), 668–676 (home top bar `add` button), 1450–1500 (`#friend-hub-overlay`), 751–757 (square feed grids)
- Styles: `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` lines 8–9 (`.overlay`), 425–465 (safe-area header rules), 531–551 (`#toast`), 193–216 (dark tokens), 825 (`.square-feed-grid`), 877–890 (`.sponsored-badge`), 1031–1068 (`#chat-plus-menu`)
- Adjacent code the module depends on: `match.js` (`toggleChatPlusMenu` 146–178, `openConnectionChat` 853–864, `viewPartnerProfile` 1208–1220), `chat.js` (`lastMsgText` 47–54, `loadSessions` 180–197, `openSessionById` 239–243), `core.js` (`api` 6–42, `cleanupUserState` 133–215, overlay helpers 336–349, `toast` 444–452, swipe-back 606–712, `safeUrl` 733–747), `square.js` (`loadSquareTab2` 407–459, `renderSquareFeed` 481–561), `i18n.js` (dictionary + observer), `state.js`
- Backend contracts: `apps/api/src/users/users.controller.ts` + `users.service.ts` (`getOrCreateConnectCode`), `matching/matching.controller.ts` + `matching.service.ts` (`connectByCode` / `connectByUserId` 1356–1426), `relationships/relationships.{controller,service}.ts`, `ads/ads-public.controller.ts`, `ads/ads.service.ts` (`getFeed` 916–970, `reportEvents` 974–1105), `ads/dto/ads.dto.ts`, `common/interceptors/transform.interceptor.ts`
- Existing iOS: `apps/ios/Unimatcha/Views/Profile/ConnectCodeView.swift`, `Network/MatchingService.swift`, `Network/ProfileService.swift`, `Models/Matching.swift`, `Models/Profile.swift`

Design tokens used below (Tailwind config in `index.html`): `neon` #CCFF00, `neon-pink` #FF2EC4, `surface` #f9f9f9, `surface-container-lowest` #ffffff, `surface-container-low` #f3f3f3, `surface-container` #eeeeee, `on-surface` #1b1b1b, `on-surface-variant` #474747, `outline` #777777, `outline-variant` #c6c6c6, `neutral-500` #737373, `neutral-400` #a3a3a3. Font family everywhere: **Plus Jakarta Sans** (CJK fallback PingFang SC); `font-mono` = JetBrains Mono. Icons: **Material Symbols Rounded** (names given verbatim). Dark mode remaps (from `main.css`): surface → #121110, container-lowest/white → #1c1b19, container-low → #23211f, container → #292724, on-surface/text-black → #eceae6, on-surface-variant/neutral-500 → #aaa8a3, outline/neutral-400 → #8c8a85, borders → #343230; `.bg-neon` keeps black text.

---

## 1. Screens & states

### 1.0 Entry point — home top-bar "+" popover (owned by `match.js`, but it is the ONLY entrance to this module)

- Where: Home (`#tab-match`) fixed top bar, `h-14` (56 px + safe-area-inset-top), z-40, `bg-surface/80 backdrop-blur-xl`. Left-most button `#home-addfriend-btn`: 40×40 round, icon `add` 22 px black, `active:scale-95`. Present on all three home views (Chat / Romantic / Friend) since the 2026-09-01 redesign (the old `tune` settings button is gone).
- Tap → `toggleChatPlusMenu()` builds a floating card `#chat-plus-menu` appended to `body`:
  - Backdrop: fixed inset-0, z-68, `rgba(0,0,0,.12)`; tapping it closes the menu.
  - Card: fixed, `top: calc(3.5rem + safe-area-inset-top)` (i.e. flush under the top bar), `left: 12px`, z-69, `min-width 208px`, white, radius 14, border 1px `rgba(0,0,0,.06)`, shadow `0 10px 32px rgba(0,0,0,.16)`, padding 6. Entrance: opacity 0→1, `translateY(-6px) scale(.98)`→identity, 180 ms, ease-out; transform-origin top-left. Dark: bg #1c1b19, border `rgba(255,255,255,.07)`.
  - Items (each `display:flex; gap 12px; padding 11px 12px; radius 10; 13px/700, letter-spacing .02em, color #1b1b1b`; hover bg #f3f3f3; active `scale(.98)`), icon 20 px, in this order:
    1. `search` — "Search & discover" → `openFriendHubAt('search')`
    2. `qr_code_2` — "Add by QR" → `openFriendHubAt('qr')`
    3. `hub` — "Relationship Network" → `openFriendHubAt('graph')`
    4. `dark_mode` — "Dark mode" → `toggleDarkMode()` (not this module)
    5. `translate` — "Language" → `openLangDialog()` (not this module)
  - Tapping an item first removes the menu, then runs the action.
  - While the menu exists, the home three-view horizontal swipe is suppressed (`match.js` checks `#chat-plus-menu`).

### 1.1 Friend Hub overlay — `#friend-hub-overlay` (one full-screen page, three interchangeable panels)

Shell (identical to Settings / Ticket-wallet full-screen overlays):
- `.overlay fixed inset-0 z-[60] bg-surface` — full-screen (covers home top bar and bottom nav). `.overlay` = flex column, opacity/visibility transition 0.25 s; `.active` shows it. Contents: `div.relative.h-full.w-full.bg-surface.flex.flex-col`.
- **Header** (`sticky top-0`, so it gets `padding-top: env(safe-area-inset-top)` from the global rule): `bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20`. Inner row `h-16` (64 px) `px-6 gap-4`:
  - Back button: icon `arrow_back` 24 px, `text-on-surface`, `active:scale-95`, tap → `friendHubBack()` (= close overlay).
  - `h1#friend-hub-title`: font-headline, 20 px (`text-xl`), bold, `tracking-tight`, `text-on-surface`. Text set per panel: graph → "Relationship Network", search → "Search & discover", qr → "Add by QR" (legacy `menu` → "Chats"; any unknown view → "Friends").
- **Body**: `flex-1 overflow-y-auto px-6 py-8 w-full max-w-md mx-auto` — this is the only scroll container. Three panel `div`s, each `space-y-4`; exactly one is unhidden.
- Left-edge swipe-back is enabled for this overlay (see §2.1).
- The overlay has no bottom nav and no footer; the home page underneath stays mounted.

There is no "menu" panel any more: `#friend-hub-menu` does not exist in `index.html`; `openFriendHub()` / `friendHubShow('menu')` would show an empty page titled "Chats". Nothing calls it today — treat `openFriendHubAt(view)` as the sole entry.

#### 1.1.a Panel "Relationship Network" — `#friend-hub-panel-graph`
Top-to-bottom:
1. Graph box `#friend-graph`: `w-full`, radius 10, border 1px `outline-variant/30`, bg `surface-container-lowest` (white; dark #1c1b19), `overflow-hidden`, flex centered, `min-height: 300px`.
   - **Loading state** (initial and on every panel entry): text "Loading…" (U+2026), `text-outline` 14 px, centered.
   - **Error state**: "Couldn't load network." same style.
   - **Empty state** (no nodes): `div.py-12` centered `text-outline` 14 px "No connections yet — add a friend below."
   - **Graph state**: inline `<svg viewBox="0 0 320 320" width="100%">` (so it scales to the box width; 375 px screen → box ≈ 327 px wide, square). Geometry in viewBox units:
     - Center `(160,160)`; ring radius `R = 112`; self avatar radius `26`; friend node radius `20`.
     - Node *i* of *n* placed at angle `θ = i/n·2π − π/2` (start at 12 o'clock, clockwise): `(160 + 112cosθ, 160 + 112sinθ)`.
     - Draw order: all edge lines, then friend nodes, then self (self on top).
     - **Edge**: `<line>` from center to node; `stroke-width = edge.weight` (server gives 1…6); color `#FF2EC4` (neon-pink) if that node's `kind === 'romantic'`, else `#000000`; `stroke-linecap: round`; `opacity 0.7`.
     - **Friend node**: if `avatarUrl` → image clipped to a circle of r 20 (`preserveAspectRatio xMidYMid slice`) with a `#000` 1.5 px ring; else a `#ececec` disc with `#000` 1.5 px ring and the uppercase first character of `nickname` (or `?`) centered, Plus Jakarta Sans 700, font-size `r·0.8` = 16, fill `#1b1b1b`.
     - **Node label**: `nickname` truncated to 10 chars, 9 px / 600, fill `#1b1b1b`, `text-anchor: middle`. Placed **below** the node (`y + 20 + 12`) when the node is in the lower half (`y > 160`), otherwise **above** (`y − 20 − 6`).
     - **Self node**: same avatar renderer with r 26 at center using `self.avatarUrl` (fallback initial "Y" from the literal "You"); label "You" at `y = 160 + 26 + 12`, 9 px / 700, fill `#000`.
     - Whole node group is tappable (`cursor:pointer`) → see §2.3.
2. Caption `<p>`: 10 px, `text-outline`, `tracking-wider`, `leading-relaxed`: "Line thickness shows closeness (chats + post interaction). Tap a node to open the chat."

Dark-mode caveat: the SVG hardcodes `#000` / `#1b1b1b` / `#ececec`, while the box background turns #1c1b19 → black edges and dark labels become nearly invisible in dark mode on H5. iOS should use semantic colors (primary label / separator) instead of copying the hex.

#### 1.1.b Panel "Search & discover" — `#friend-hub-panel-search`
1. Search pill: `flex items-center gap-2 bg-surface-container-low rounded-full px-4 py-2.5` containing icon `search` 20 px `text-outline` and `input#friend-search-input` (`flex-1 bg-transparent`, 14 px, `text-on-surface`, placeholder "Search your contacts" → zh "搜索联系人", no ring). Auto-focused 50 ms after the panel opens; value cleared on every entry.
2. Results `#friend-search-results` (`space-y-2`): a vertical list of full-width rows (`button.w-full flex items-center gap-3 py-2 text-left active:opacity-70`):
   - Avatar: 36×36 circle, bg `surface-container` (#eee), `overflow-hidden`; `<img object-cover>` from `partner.avatarUrl || partner.avatar`, else icon `person` 18 px `text-outline`.
   - Text column (`min-w-0 flex-1`): name 14 px bold `text-on-surface` truncated — `partner.note || partner.nickname || partner.name || 'Partner'` (the user's private note wins over the nickname); subtitle 10 px `text-outline` truncated — last message text (`lastMsgText`: `content`, or `[Photo]` for image-only, else empty) or, if none, `metaLabel(partner.school)` (school name, zh-mapped in Chinese).
   - Trailing icon `chevron_right`, `text-outline`.
   - Empty list: `<p class="text-[11px] text-outline italic px-1 pb-1">` — "No conversations matched." when a term is typed, "No conversations yet." when the term is empty.
   - With an empty term the list shows **all** sessions (temp + confirmed), in the order returned by `/chat/sessions`.

#### 1.1.c Panel "Add by QR" — `#friend-hub-panel-qr`
1. Segmented control: outer `flex border border-outline-variant/60 p-1 rounded-full`; two equal buttons `.af-seg` (`flex-1 py-2 rounded-full font-headline 12px bold tracking-wider transition-colors`): "My QR" (`#af-seg-qr`) and "Scan" (`#af-seg-scan`). Active = `bg-neon text-black`; inactive = transparent, `text-on-surface`. Default on entry: **My QR**.
2. **My QR view** `#af-view-qr` (column, items centered):
   - QR box `#addfriend-qr`: 180×180, white bg (dark: #1c1b19 box, QR itself stays black-on-white canvas), radius 10, border 1px `outline-variant/40`, centered, `overflow-hidden`. QR rendered by qrcodejs at **176×176**, dark `#000000`, light `#ffffff`, payload = the raw connect code string (e.g. `CL3F9A2K7Q`, no URL scheme). Fallback when the QR lib is missing: icon `qr_code_2` 48 px `text-outline`. Box is emptied (blank) while loading.
   - Label "YOUR CODE": `mt-3`, 10 px, `tracking-widest`, `text-outline` (zh "你的编号").
   - Code `#addfriend-mycode`: `font-mono` (JetBrains Mono), 14 px, bold, `tracking-widest`, `text-on-surface`, `select-all` (one tap selects all for copy). Shows "—" until loaded; "unavailable" on error.
   - Hint: `mt-3`, 10 px, `text-outline`, centered, `leading-relaxed`: "Scan to connect instantly." (zh "扫一扫，立即互加。")
3. **Scan view** `#af-view-scan` (hidden by default):
   - Camera viewport `#addfriend-reader`: `w-full aspect-square bg-black/80 rounded-[10px] overflow-hidden mb-2`. html5-qrcode draws the live rear-camera preview inside it with a 200×200 scan box (`qrbox: 200`, `fps: 10`, `facingMode: 'environment'`).
   - Camera error line `#addfriend-cam-error` (hidden unless the camera fails): 10 px, `text-neon-pink`, `mb-2`: "Camera unavailable — enter the code manually below."
   - Hint: 10 px `text-outline` centered `mb-2`: "Point at your friend's QR — or enter their code:" (zh "对准好友的二维码，或输入 TA 的编号：")
   - Input row `flex gap-2 items-stretch`: `input#addfriend-code-input` (`flex-1 min-w-0 bg-surface-container-low rounded-[10px] border-0 px-3 py-2.5 text-sm uppercase tracking-widest`, focus ring 1 px neon, placeholder "CLXXXXXXXX", Enter submits) + button "Add" (`shrink-0 px-5 rounded-[10px] bg-neon text-black font-headline 12px bold tracking-widest active:scale-95`; zh "添加"). Deliberately not the `.btn-cta` full-width class (it would overflow the row — recorded in a comment).

### 1.2 Sponsored card inside the Square "Recommend" feed (`ads.js` → rendered by `square.js`)

- Container: `#square-feed-recommend` — CSS grid, 2 columns, `column-gap: 0.375rem` (6 px), `row-gap 0`, masonry via `grid-auto-rows: 1px` + JS row-span (6 px vertical gap). The ad card is wrapped in `<div class="col-span-2">` → always **full width** (both columns), inserted between post cards.
- `adLargeCard(ad)` → `<article data-ad-id>`: `bg-surface-container-lowest` (white), radius **6 px**, `overflow-hidden`, whole card tappable, `group` hover scale on image (no-op on touch).
  - Media block: `relative aspect-[4/5] bg-surface-container` (#eee placeholder) with `<img object-cover>` of `images[0]` (`safeUrl`-sanitised; hidden on load error). Badge overlaid at `top-4 left-4` (16 px inset).
  - `.sponsored-badge`: inline-flex, padding `2px 8px`, bg `#CCFF00`, color `#000`, radius 10, Plus Jakarta Sans **800**, **9 px** (0.5625 rem), letter-spacing 0.1 em, **uppercase**, line-height 1.4. Text "Sponsored" (zh dictionary → "赞助").
  - No-image fallback (server requires ≥1 image, so rare): badge alone in a `px-3 pt-3` row, no media block.
  - Body `px-3 pt-2 pb-3 space-y-1`:
    - Title `h3` (only if `title`): font-headline **18 px** bold `tracking-tight` (color inherits on-surface).
    - Content `p`: `text-neutral-500` (#737373) 14 px **italic**, clamped to **2 lines** (`-webkit-line-clamp: 2`).
    - Advertiser `p`: `text-neutral-400` (#a3a3a3) 10 px `tracking-widest`: `advertiserName || 'Sponsor'`.
  - No like / comment counts, no author avatar row, no school badge, no time. It is visually the same "large card" silhouette as the official/union `bentoLargeCard` (image 4:5 on top, title below), but with the neon Sponsored badge instead of the translucent-black Official badge and the advertiser line instead of the author row.
- Placement algorithm (`renderSquareFeed`, recommend tab only): walk posts in order; after appending each post `cardCount++`; while ads remain: the **first** ad is inserted right after the **3rd card** (any kind); each **subsequent** ad after **8 small cards** counted since the previous ad (small = plain user recommend posts; official large / campus-wall wide cards do not advance the 8-counter). If the feed had < 3 cards and no ad was placed, one ad is appended at the end. At most `limit=3` ads per render, in the (server-shuffled) fetch order, never repeated within a render. Campus wall, Pinned and Search feeds get **zero** ads.

### 1.3 Ad detail overlay — `#ad-detail-overlay` (only for ads without `landingUrl`)

- Created dynamically on `body`, removed on close. `fixed inset-0 z-[60] bg-surface overflow-y-auto` (page itself scrolls).
- Header: `sticky top-0 z-10 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 flex items-center px-6 h-16` (+ safe-area padding via the `.sticky.top-0` rule → total height `4rem + inset`). Single back button = icon `arrow_back` 24 px `text-on-surface` + label "Sponsored" (font-headline bold, 10 px, letter-spacing 0.15 em, `mt-0.5`). Tap → `closeAdDetail()`.
- Main `w-full max-w-screen-md mx-auto pb-16`:
  1. Every image in `ad.images`, stacked, `w-full object-cover` (natural aspect), hidden on error.
  2. `div.px-6.py-8`: Sponsored badge (`mb-4`) → title `h2` font-headline **30 px** bold `tracking-tighter leading-none mb-4` (if any) → content `p` `text-on-surface-variant` (#474747) **18 px** `font-light leading-relaxed whitespace-pre-wrap` → advertiser `p` 10 px `text-neutral-400 tracking-widest mt-6`.
- It is **not** a `.overlay` element: no swipe-back, not affected by `closeAllOverlays()`; opening another ad detail first removes any existing one.

### 1.4 Toast (shared component used for all feedback here)
`#toast`: fixed, `top: calc(16px + safe-area-inset-top)`, horizontally centered, z-999, padding 12×24, bg `#000`, white 14 px text, radius 10, shadow; slide-down 0.3 s; auto-hides after 3000 ms; single instance (new toast overwrites text).

---

## 2. Interactions

### 2.1 Overlay-level
- **Open** (`openFriendHubAt(view)`): sets `S.friendHubDirect = true`, adds `.active` to `#friend-hub-overlay`, clears `#friend-search-input` and `#friend-search-results`, then `friendHubShow(view)`.
- **`friendHubShow(view)`**: writes `S.friendHubView`; toggles the three panels' `hidden`; sets the title; **if view ≠ 'qr' → stops the camera scanner**; view-specific side effects: graph → `loadFriendGraph()`; qr → `switchAddFriendView('qr')` + `renderMyQR()`; search → clear input, focus after 50 ms, and list sessions (fetching them first if `S.sessions` is empty).
- **Back button** → `friendHubBack()` → `closeFriendHub()` = stop scanner + remove `.active`. One step, always closes (no intermediate menu).
- **Edge swipe-back** (global, `core.js`): touchstart within 30 px of the left edge on the top-most `.overlay.active` that contains an `arrow_back` icon; once |dx|>10 and horizontal, the whole overlay translates with the finger (`translateX(dx)`, no fade), vertical scroll is cancelled; release with `dx ≥ 80` → animate off-screen 200 ms then `closeFriendHub()`; otherwise spring back 250 ms. Multi-touch / touchcancel resets inline styles unconditionally.
- 401 from any API call → `closeAllOverlays()` removes `.active` from this overlay (scanner is **not** explicitly stopped in that path — see §7).
- No pull-to-refresh, no haptics, no confirmation dialogs anywhere in this module.

### 2.2 Search panel
- Typing → `onFriendSearchInput()` debounced **120 ms** → `runFriendSearch(q)`: pure in-memory filter of `S.sessions` (no network while typing). Match = case-insensitive substring of `term` in the concatenation of `partner.nickname`, `partner.name`, `partner.note`, `partner.school`, and the last message text. Empty term → all sessions.
- Tap row → `openChatFromSearch(matchId)`: close hub → `openConnectionChat(matchId)` (match.js: `switchHomeView('chat')`, `await loadSessions()`, `openSessionById(matchId)` → opens the chat overlay). Fallback `openSessionById` if `openConnectionChat` is missing.
- There is intentionally **no "find people" / "people you may know"** section any more and no add-friend action here (product decision 2026-08-19: search only existing contacts; adding friends lives only in "Add by QR").

### 2.3 Graph panel
- On entry → `loadFriendGraph()`: shows "Loading…", GET `/relationships/graph`, renders SVG; failure → "Couldn't load network." (no toast). Re-fetched on every entry (no cache).
- Tap a friend node → `openConnectionChatFromGraph(userId)`: look up `S.sessions` for a session whose `partner.userId || partner.id` equals the node id; **close the hub first**; if a session with `matchId` exists → `openConnectionChat(matchId)`; else → `viewPartnerProfile(userId)` (opens the full-screen partner profile overlay and fetches `/users/:id/public-profile`). Self node is not tappable.
- No pan/zoom, no drag, no long-press.

### 2.4 QR panel
- **Segment tap** `switchAddFriendView('qr'|'scan')`: toggles the two views and re-styles segments; entering **scan** → `startAfScan()`; entering **qr** → `stopAfScan()`.
- **`renderMyQR()`** (on panel entry): blanks the QR box, GET `/users/me/connect-code`; on success sets the code text and draws the QR; on failure sets code text "unavailable" and toasts "Failed to load your code". No retry button (re-enter the panel to retry).
- **`startAfScan()`**: if `Html5Qrcode` global is missing → show the camera-error line and stop. Otherwise stop any existing scanner, create one on `#addfriend-reader`, `start({facingMode:'environment'}, {fps:10, qrbox:200}, onDecode, noop)`; success hides the error line; any failure (permission denied, no camera, insecure context) → show the error line, scanner = null. The manual-code input is always available below regardless.
- **Decode callback** → `connectWithCode(decodedText)` (fires as soon as a QR is recognised; no confirmation).
- **Manual entry**: Enter key in the input or tap "Add" → `submitConnectCode()` → `connectWithCode(inputValue)`. Input is visually uppercase (`uppercase` CSS) but the value is sent as typed, only trimmed — the server does an exact-match lookup on `connectCode`, and generated codes are uppercase, so the iOS client should uppercase before sending.
- **`connectWithCode(code)`**:
  1. `trim`; return if empty or if `afConnecting` (re-entrancy guard — html5-qrcode keeps firing decode callbacks every frame while the code is in view, so this guard is what prevents duplicate POSTs).
  2. `afConnecting = true`; **await `stopAfScan()`** (camera is released before the request).
  3. `POST /matching/connect {code}`; unwrap `data`; if no `matchId` → throw `Error(message || 'Connect failed')`.
  4. Success → toast `message || 'Connected!'` (server message is "Added — start chatting!") → `closeAddFriend()` (closes the hub) → `openConnectionChat(matchId)` (switches home to Chat view, reloads sessions, opens that conversation).
  5. Failure → toast `'Failed: ' + (e.message || 'try again')` (e.g. "Failed: Invalid connection code", "Failed: You cannot add yourself", "Failed: This user is unavailable"). The hub stays open, **but the camera has already been stopped** — the scan view shows a black box until the user taps the "Scan" segment again (or "My QR" then "Scan"). The input keeps its text.
  6. `finally afConnecting = false`.
- No disabled/busy visual on the "Add" button during the request (only the logical guard).
- Leaving the panel / closing the hub / switching to "My QR" always stops and clears the scanner.

### 2.5 Sponsored card (square)
- **Impression**: counted when the card becomes ≥ 50 % visible in the viewport (IntersectionObserver `threshold: 0.5`), **once per campaign id per app session** (`seenImpressions` set). The observer is (re)attached after every recommend-feed render (previous observations disconnected first) and only observes cards whose id is not already in the seen set. Scrolling past the same card again, or re-rendering after pull-to-refresh, does not re-count.
- **Tap anywhere on the card** → `onAdClick(id)`: look up in `adsById` (ads from the latest fetch; unknown id = no-op) → queue a `click` event (always, even if the same card is tapped repeatedly — no click dedupe) → if `landingUrl` → `window.open(url, '_blank', 'noopener')` (opens the system browser / new tab); else → `showAdDetail(ad)`.
- Ad detail: back button → remove overlay. No share/report/like.
- Ads never open the normal post detail; long-press does nothing.

### 2.6 Event batching lifecycle (`ads.js`)
- `queueAdEvent(campaignId, type)`: no-op unless `campaignId` and `adSchool` (the school string captured at fetch time) are set. Queue is capped at **200** entries (oldest dropped). On first enqueue a **10 s** `setInterval(flushAdEvents)` starts (it keeps running for the rest of the session; an empty flush is a no-op).
- `flushAdEvents()`: takes everything off the queue, POSTs in chunks of **100** (`{events:[…]}`), `fetch` with `keepalive: true` and `Authorization: Bearer <cl_token>` (not `sendBeacon`, because that cannot carry the auth header). Result handling per chunk: **5xx → put the chunk back** on the queue; **4xx → drop** (retrying would fail again); **network error → put back**. Response body is ignored.
- Also flushed immediately on `document.visibilitychange → 'hidden'` and on `pagehide` (iOS Safari backgrounding). iOS equivalent: flush on `scenePhase` → `.background`/`.inactive` (and on app termination best-effort).
- `ensureAdSession()` (called at fetch / enqueue / flush): compares `localStorage.cl_token` with the token seen last time; if it changed (login as a different account without reload), it **discards** the pending queue, clears the seen-impression set, ad cache, school and timer, and disconnects the observer. (Unsent events of the previous account are lost, by design — better than attributing them to the new account.)

---

## 3. API calls

All calls go through `window.api(path, method, body)` (`core.js`) unless noted: base `S.API` = `https://api.<host>/api/v1` in production (`http://<host>:3001/api/v1` on localhost), `Content-Type: application/json`, `Authorization: Bearer <localStorage.cl_token>`, `cache: 'no-store'`. Every success response is wrapped by the global `TransformInterceptor` as `{ success: true, data: <payload>, message?: string, timestamp }` — the H5 code always unwraps with `res?.data || res`. Non-2xx → `Error(body.message || 'API <status>')`; **401 → token removed, all polling stopped, state cleaned, all overlays closed, auth page shown, error thrown.**

| # | Call | Request | Response fields USED by UI | Errors / notes |
|---|------|---------|----------------------------|----------------|
| 1 | `GET /users/me/connect-code` | none | `data.connectCode: string` | Lazily generated on first request: `'CL' + 8 random base-36 chars, uppercased` (10 chars total, e.g. `CL3F9A2K7Q`), persisted on `User.connectCode` (unique) and **stable forever** (never rotated). Up to 5 collision retries then `400 "Failed to generate connection code, please try again"`. Failure → code text "unavailable" + toast "Failed to load your code". Fetched on every entry to the QR panel (no cache). |
| 2 | `POST /matching/connect` | body `{ code: string }` (trimmed scanned/typed text) | `data.matchId: string` (required — missing ⇒ treated as failure), `data.message: string` (toast) | Server: `400 "Connection code cannot be empty"`, `404 "Invalid connection code"`, `400 "You cannot add yourself"`, `404 "User not found"`, `400 "This user is unavailable"` (target BANNED). Success is **idempotent**: upserts the FRIEND `Match` for the sorted pair → status `FRIEND_CONFIRMED`, both sides confirmed, `confirmedAt=now`, and **clears `dissolvedAt/dissolvedBy/dissolveReason`** (re-adding a previously dissolved friend revives the same match id); both users' friend-mode `UserModeState.matchState` set to `'relationship'`; target gets a `friend_added` notification ("New friend" / "Someone connected with you — open the chat and say hi!", metadata `{matchId, mode:'friend'}`) and an SSE `notification` frame. Response also carries `partner` (public profile, may be `null`) — unused by H5, used by the old iOS view. **No energy cost.** Re-entrancy guarded by `afConnecting`. |
| 3 | `GET /relationships/graph` | none | `data.self.avatarUrl`; `data.nodes[]: { id, nickname, avatarUrl, kind: 'romantic'\|'friend' }` (also returns `school`, unused); `data.edges[]: { b: nodeId, weight: 1..6 }` (also `a`, `raw`, `msgCount`, `posts`, unused) | Only active relationships: `dissolvedAt == null` and status in `RELATIONSHIP_ROMANTIC \| RELATIONSHIP_MODE \| FRIEND_CONFIRMED` (temp/pending matches excluded). Empty → `{ self, nodes: [], edges: [] }`. Closeness: `raw = ln(1+msgCount) + 2·e^(−daysSinceLastMessage/14) + 1.5·ln(1+postInteractions)`, where post interactions = likes (×1) + **non-anonymous** comments (×2) in either direction between the pair; `weight = 1 + round(raw / maxRaw · 5)`. Failure → "Couldn't load network." (no toast). |
| 4 | `GET /chat/sessions?mode=all&limit=100` (via `window.loadSessions`, chat.js) | none | `data.sessions[]` (or bare array) → cached as `S.sessions`; each `{ matchId, sessionType, mode, status, partner: { id, note, nickname, avatarUrl, school, gender, age }, lastMessage: { content, imageUrl, createdAt } \| null, unreadCount, … }` | Called by the search panel only when `S.sessions` is empty. `limit=100` is the server max — contacts beyond 100 are unsearchable (documented trade-off). Failure → toast "Failed to load conversations" and `S.sessions` kept. |
| 5 | `GET /users/:id/public-profile` (via `viewPartnerProfile`, match.js) | path `userId` from graph node | rendered by `renderPartnerProfile` (other module) | Only when a graph node has no cached session (e.g. romantic relationship whose chat row is absent). Failure → toast "Failed to load profile" while the profile overlay is already open (known trap: user is left on a blank page — see CLAUDE.md 2026-08-19). |
| 6 | `GET /ads/feed?school=<encodeURIComponent(S.currentUser.profile.school)>&limit=3` | query: `school` = the user's profile school **name** (exact `School.name`), `limit` 3 (server clamps 1–10, default 3) | `data: Ad[]` where `Ad = { id, title, content, images: string[], landingUrl: string\|null, advertiserName: string }` (`advertiserName = advertiser.organizationName ?? advertiser.name`). UI uses all six. H5 also tolerates `{items}`/`{ads}` wrappers and filters out entries without `id`. | Skipped entirely when the profile has no school. Server: unknown school → `[]`; candidates = `ACTIVE` campaigns with `startDate ≤ now`, `endDate ≥ today`, a placement at this school, and (for CPM/CPC) `spendCents < budgetCents`; Fisher-Yates shuffled, first `limit`. **Any error → `[]` silently** (console only) — ads must never break the feed. Called in `Promise.all` with the recommend feed on every recommend load (initial, tab switch when empty, pull-to-refresh, bottom-nav re-tap); result is not cached across loads. |
| 7 | `POST /ads/events` — **raw `fetch`, not `window.api`** (needs `keepalive`) | body `{ events: [{ campaignId: string, school: string, type: 'impression'\|'click' }] }`, ≤ 100 per request (client chunks), header `Authorization: Bearer <cl_token>` | ignored (`{ accepted: n }`) | DTO: `ArrayMaxSize(100)`, `school` ≤ 200 chars, `type` in enum — violating = 400 (client drops the chunk). Server aggregates per campaign+school+type into `AdDailyStat` (UTC day), recomputes spend (CPM: `floor(impressions·cpm/1000)`, CPC: `clicks·cpc`, BUYOUT: unchanged), silently ignores unknown schools / non-ACTIVE campaigns / schools not in the campaign's placements; budget exhaustion → campaign COMPLETED + settlement. Client: 10 s interval + on hide/pagehide; 5xx/network → requeue; 4xx → drop; queue cap 200. |

Polling: none in this module. Sequence tokens: none (the graph and QR code are simple await-and-render; a stale response after closing the hub just writes into hidden DOM).

---

## 4. Client state

`state.js` (`S`) fields touched:
- `S.sessions` (owned by chat.js; read for contact search and graph→chat lookup; reset to `[]` in `cleanupUserState`).
- `S.currentUser.profile.school` (read by ads for targeting and event tagging; `S.currentUser` nulled on cleanup).
- `S.API` (base URL, used by the raw `fetch` in `flushAdEvents`).
- `S.friendHubDirect` (boolean, write-only now — its consumer, the intermediate menu, was removed) and `S.friendHubView` (`'menu'|'graph'|'search'|'qr'`). Both are **added dynamically** (not declared in `state.js`) and **not reset** by `cleanupUserState` — harmless because every entry rewrites them.

Module-private state (`addfriend.js`): `afScanner` (html5-qrcode instance or null), `afConnecting` (request guard), `friendSearchTimer` (debounce handle). None survives a page reload; none is cleared on logout (a logout while scanning relies on `closeAllOverlays()` hiding the overlay — the camera stream is only stopped when the hub is closed through `closeFriendHub`, on panel switch, or on the next `startAfScan`).

Module-private state (`ads.js`): `adQueue` (≤200 pending events), `flushTimer`, `adObserver`, `seenImpressions: Set<campaignId>` (per app session), `adsById`, `adSchool`, `adSessionToken`. Reset lazily by `ensureAdSession()` when `localStorage.cl_token` changes — **not** wired into `cleanupUserState`. Nothing is persisted (impression dedupe is per in-memory session; a reload re-counts).

localStorage read: `cl_token` (auth), `cl_lang` (language), `cl_theme` (dark mode). Nothing written by this module.

Recommended iOS mapping: an `@Observable FriendHubStore` (code, graph, scanner state, connecting flag) + a process-wide `AdTracker` actor (queue, seen set, timer, flush on background) keyed to the auth token / user id so account switches reset it.

---

## 5. i18n

Mechanism: English is the source markup. When `localStorage.cl_lang === 'zh'` a `MutationObserver` rewrites every text node whose **trimmed text exactly equals** a key of the `ZH` dictionary (`i18n.js`), and input placeholders via `ZH_PLACEHOLDER`. Subtrees marked `data-no-i18n` are skipped (used for user content elsewhere). Language toggle reloads the page. There are **no render-time zh/en branches in these two modules** — everything relies on the dictionary, so any string not in it stays English in Chinese mode.

User-visible strings (en → zh as shipped by H5; "— (not in dictionary)" = shown in English in both languages; a suggested zh is given in brackets for iOS parity decisions):

Popover (match.js):
- "Search & discover" → 搜索与发现
- "Add by QR" → 扫码添加
- "Relationship Network" → 关系网
- "Dark mode" → 深色模式 · "Language" → 语言

Friend Hub titles: "Friends" → 好友 · "Chats" → 聊天 · plus the three above.

Graph panel:
- "Loading…" — (not in dictionary; note the dictionary has `'Loading...'` with three ASCII dots → 加载中…, but this string uses U+2026 so it does NOT match) [suggest 加载中…]
- "Couldn't load network." — (not in dictionary) [suggest 关系网加载失败]
- "No connections yet — add a friend below." — (not in dictionary) [suggest 还没有好友——去扫码添加吧]
- "Line thickness shows closeness (chats + post interaction). Tap a node to open the chat." — (not in dictionary) [suggest 线条粗细代表亲密度（聊天 + 帖子互动）。点头像打开对话。]
- "You" (self label inside SVG) — (not in dictionary) [suggest 我]

Search panel:
- placeholder "Search your contacts" → 搜索联系人
- "No conversations matched." → 没有匹配的会话。
- "No conversations yet." → 还没有会话。
- fallback name "Partner" — (not in dictionary); "[Photo]" last-message placeholder — English here (chat list localises it to "[图片]" but this row does not) [suggest [图片]]
- School subtitle goes through `metaLabel()` → Chinese university names in zh (e.g. "University of Warwick" → 华威大学).

QR panel:
- "My QR" → 我的二维码 · "Scan" → 扫一扫
- "YOUR CODE" → 你的编号
- "Scan to connect instantly." → 扫一扫，立即互加。
- "Camera unavailable — enter the code manually below." — (not in dictionary) [suggest 无法使用摄像头，请在下方手动输入编号]
- "Point at your friend's QR — or enter their code:" → 对准好友的二维码，或输入 TA 的编号：
- placeholder "CLXXXXXXXX" — literal, both languages
- "Add" → 添加
- "—" / "unavailable" — (not in dictionary) [suggest 不可用]
- toast "Failed to load your code" — (not in dictionary) [suggest 编号加载失败]
- toast success: server message "Added — start chatting!" (fallback "Connected!") — English from server [suggest 已添加，开始聊天吧！]
- toast failure: "Failed: " + server message ("Invalid connection code" / "You cannot add yourself" / "This user is unavailable" / "Connection code cannot be empty" / "Connect failed" / "try again") — English [suggest 添加失败：无效的编号 / 不能添加自己 / 该用户不可用]

Ads:
- badge "Sponsored" → 赞助 (uppercase transform is CSS; zh shows 赞助)
- detail header label "Sponsored" → 赞助
- advertiser fallback "Sponsor" — (not in dictionary) [suggest 赞助方]
- Title/content/advertiserName are advertiser content — must never be translated (H5 does not mark them `data-no-i18n`, a latent mistranslation risk that iOS avoids by construction).

Contact rows: nickname/note/school/last message are user content and are also not wrapped in `data-no-i18n` in `renderChatSearchResults` (only `escapeHtml`'d) — iOS: never localise these.

---

## 6. Cross-module links

Calls OUT of `addfriend.js`:
- `core.js`: `window.openOverlay(id)`, `window.closeOverlay(id)`, `window.toast(msg)`, `window.api(...)`, `window.escapeHtml`, `window.safeUrl` (avatar URLs in rows are sanitised; note the SVG `<image href>` in the graph uses only `escapeHtml`, not `safeUrl`).
- `chat.js`: `window.loadSessions()` (when `S.sessions` is empty on search entry), `window.openSessionById(matchId)` (fallback), `window.lastMsgText(lastMessage)`.
- `match.js`: `window.openConnectionChat(matchId)` (after connect success, on search row tap, on graph node tap with a cached session), `window.viewPartnerProfile(userId)` (graph node without a session).
- `i18n.js`: `window.metaLabel(school)`.
- Third-party globals: `window.QRCode` (qrcodejs 1.0.0 from cdnjs), `window.Html5Qrcode` (html5-qrcode 2.3.8 from unpkg).

Calls INTO `addfriend.js` (all via `window.*` globals; the module has no ES exports):
- `match.js` `toggleChatPlusMenu` → `openFriendHubAt('search'|'qr'|'graph')` — the only live entry point.
- `core.js` `SWIPE_BACK_CLOSE['friend-hub-overlay']` → `closeFriendHub()`.
- `core.js` `closeAllOverlays()` hides the overlay by class (no function call).
- Inline `onclick`/`oninput`/`onkeydown` in `index.html`: `friendHubBack`, `switchAddFriendView`, `submitConnectCode`, `onFriendSearchInput`; generated markup: `openChatFromSearch`, `openConnectionChatFromGraph`.
- Legacy aliases kept but unreferenced: `openFriendHub`, `openAddFriend`, `closeAddFriend`, `friendHubShow`, `loadFriendGraph`, `runFriendSearch`.

`ads.js`:
- ES exports consumed by `square.js`: `fetchSquareAds()` (in `loadSquareTab2`, recommend tab only, parallel with the feed), `adLargeCard(ad)` (in `renderSquareFeed`), `observeAdImpressions(container)` (after render when `ads.length`).
- Globals for inline handlers: `window.onAdClick`, `window.closeAdDetail`.
- Reads `S.currentUser`, `S.API`, `localStorage.cl_token`; uses `window.api`, `window.escapeHtml`, `window.safeUrl`. Registers `document visibilitychange` and `window pagehide` listeners at import time.
- `square.js` treats `[data-ad-id]` like `[data-post-id]` when deciding whether a feed "has content" (line 154) and the masonry layout measures ad cards like any other card.

Related backend endpoints intentionally NOT used by H5 but still live (the old iOS app uses one): `POST /matching/connect-user {userId}` (same semantics as connect-by-code, by user id), `GET /discovery/*`, `GET /users/search?q=`.

---

## 7. Gotchas

1. **Entry is only the "+" popover.** There is no "Friends" tab, no list-of-features page; the old `menu` view is dead code (its DOM node was removed). iOS should model the hub as three destinations reachable from the popover (or a menu) — not a single screen with a landing list.
2. **The scanner is stopped before the connect request and not restarted on failure.** After "Failed: Invalid connection code" the user sees a black square; they must tap "Scan" again. Decide deliberately on iOS (probably auto-resume scanning after the error toast, with a short cooldown so the same wrong code is not re-fired every frame).
3. **Continuous decode + re-entrancy guard.** html5-qrcode fires the callback repeatedly while a code is in frame; the only thing preventing N POSTs is `afConnecting`. On iOS pause the AVCapture metadata output on first hit.
4. **Connect is idempotent and revives dissolved friendships** (server clears `dissolvedAt`). Scanning an existing friend just returns the existing `matchId` and opens that chat; no "already friends" error. Adding yourself → 400.
5. **No energy cost, no confirmation step, both sides auto-confirmed.** The scanned user gets a `friend_added` notification with generic text ("Someone connected with you…") — the notification does not name the adder.
6. **Connect codes are permanent** (never rotated, no revoke endpoint). The QR payload is the bare code (`CL` + 8 base-36 uppercase chars), not a URL — an iOS scanner should accept the bare string and also be tolerant of whitespace; uppercase before sending (server lookup is exact-match).
7. **Graph privacy rules** (server-enforced, but the UI must not undermine them): anonymous comments are excluded from closeness; only non-dissolved confirmed/romantic relationships appear; the graph never exposes `matchId` (the client maps node → chat through its own session cache). Romantic nodes are drawn with **neon-pink** edges — this reveals relationship type on-screen; keep that colour semantic.
8. **Node tap fallback**: if the node's user has no row in `S.sessions` (e.g. sessions not loaded yet, or > 100 contacts), the tap opens the **public profile** instead of the chat. iOS should load sessions before rendering the graph to avoid this surprise.
9. **Contact search is offline** and limited to the cached session list (≤ 100). The name shown prefers the user's private **note** over the nickname; the subtitle is the last message (image-only → "[Photo]") else the school. Search matches note/nickname/name/school/last-message text.
10. **Dark mode colours in the SVG are hardcoded** (black edges, #1b1b1b labels, #ececec fallback discs) on a #1c1b19 box — nearly invisible on H5 in dark mode. Use dynamic colours on iOS.
11. **Ad impression semantics**: ≥ 50 % visible, once per campaign per app session, regardless of how many times the card is rendered/scrolled; NOT persisted. Clicks are counted on every tap (no dedupe). Events carry the **school string captured at fetch time** (`adSchool`), not the live profile value, so a mid-session school change cannot mis-attribute.
12. **Batching contract**: ≤ 100 events per request (a bigger batch is rejected with 400 and would lose billable clicks — that is why the client chunks); 10 s cadence; flush on background; 5xx/network → retry, 4xx → drop; queue cap 200. Must send the user JWT (endpoint is `JwtAuthGuard`-protected) — that is why H5 uses `fetch keepalive` rather than `sendBeacon`.
13. **Ads fail open**: any feed error yields `[]` and the recommend feed renders normally. Never block the feed on ads; never show an error for ads.
14. **Ads only on Recommend, only with a school**, and the whole recommend feed is a single page (`page=1&limit=20`, no infinite scroll) → ads are re-fetched (and re-shuffled server-side) on every feed reload / pull-to-refresh / bottom-nav re-tap.
15. **Placement rule** (first ad after the 3rd card, then every 8 *small* cards; ≥ 1 ad guaranteed even for tiny feeds) lives in `square.js`, so whoever maps the square must reproduce it; ads are full-width cards in the 2-column masonry.
16. **Ad tap with `landingUrl` opens an external browser** (`window.open … noopener`) — on iOS use `SFSafariViewController`/`openURL`; a click event is queued *before* the navigation, so it survives the app going to background only because of the visibility-change flush — replicate that ordering.
17. **Ad detail overlay is outside the overlay system**: not closed by the global 401 handler, no swipe-back, no z-order registration. On iOS simply present it as a pushed screen and dismiss it with the rest of the navigation stack on logout.
18. **Account switch handling is lazy and lossy** for ads (`ensureAdSession` on token change drops the queue) and absent for the hub (`friendHubView/Direct` never reset). On iOS reset the ad tracker explicitly on logout/login and flush before switching if you want to preserve the previous user's events.
19. **`connectWithCode` unwraps `res.data || res` and requires `matchId`** — a 2xx without `matchId` is treated as failure with the server `message`. Keep that check.
20. **Third-party libs**: qrcodejs draws with dark `#000000` / light `#ffffff` at 176 px inside a 180 px white box; html5-qrcode uses rear camera, 10 fps, 200 px scan box; a missing/failed camera degrades to manual entry with a pink error line — the manual input is always present, not a separate mode.
21. **Existing iOS code to reuse**: `ProfileService.getConnectCode()` (`GET /users/me/connect-code` → `ConnectCode { connectCode }`), `MatchingService.connect(code:)` (`POST /matching/connect` → `ConnectResult { matchId, message?, partner? }`), and the CoreImage QR generator in `ConnectCodeView.swift` are contract-correct. That view is otherwise obsolete (dark neon theme, Chinese-only copy, no scanner, no segmented My QR/Scan, no graph, navigation pushed from the Profile tab instead of the home "+" popover). Nothing in the iOS app implements `/relationships/graph`, `/ads/feed`, `/ads/events`, or the sponsored card; `Square.swift`'s `isSponsored` flag is a different, legacy concept (a post attribute), not the ads feed.
