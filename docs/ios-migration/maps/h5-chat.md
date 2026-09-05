# H5 module map — `chat` (sessions list + conversation overlay)

Source of truth read for this map (absolute paths):

- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/chat.js` (1090 lines, the module itself)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` — markup: `#tab-match` top bar + `#home-track` / `#home-chat-view` (lines 667–723), `#chat-overlay` (1184–1231), `#chat-image-viewer` (1233–1236), `#friend-hub-overlay` search panel (1453–1476), settings "Nudge" section (1607–1617)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` — `.chat-*`, `.session-row*`, `#home-track/.home-pane/#home-chat-view`, `.home-mode-switch/.home-mode-seg`, `#chat-plus-menu`, `.ptr-indicator`, `#toast`, safe-area rules, dark-mode overrides
- Cross-module code that the chat screens depend on: `core.js` (api/SSE/overlays/cards/toast/pull-to-refresh/swipe-back), `match.js` (home three-view switch, plus menu, `openConnectionChat`, `viewPartnerProfile`, `promptSetNote`), `addfriend.js` (contact search), `settings.js` (nudge suffix), `notifications.js` (refund banner trigger), `square.js` (`formatPostTime`), `i18n.js`
- Backend contract verified in `/Users/aimi/Downloads/unimatcha-compact/apps/api/src/chat/{chat.controller.ts,chat.service.ts,dto/chat.dto.ts}`, `matching/matching.controller.ts` + `matching.service.ts` (confirm/dissolve), `matching/mode.util.ts` (status sets), `realtime/*` (SSE), `common/interceptors/transform.interceptor.ts` (envelope), `prisma/schema.prisma` (`MatchStatus`, `Message`)

Design tokens used below (Tailwind config in `index.html` head): `neon` #CCFF00, `neon-pink` #FF2EC4, `surface` #f9f9f9 (page bg), `surface-container-lowest` #ffffff, `surface-container-low` #f3f3f3, `surface-container` #eeeeee, `on-surface` #1b1b1b, `on-surface-variant` #474747, `outline` #777777, `outline-variant` #c6c6c6. Fonts: `font-headline` = Plus Jakarta Sans (fallback PingFang SC / Noto Sans SC), `font-body` = body sans. Icons = Material Symbols Outlined (rounded axis forced globally). Corner radius convention 10px. Dark-mode palette (class `.dark` on html): page bg #121110, card #1c1b19, low #23211f, container #292724, primary text #eceae6, secondary #aaa8a3, outline #8c8a85, border #343230.

---

## 1. Screens & states

### 1.1 Chat list = the "Chat" pane of the Home (Match) tab

**Where it lives.** The bottom-nav "Match" tab (`#tab-match`, icon `chat_bubble`, label "Match") is a fixed full-screen layer (`position:fixed; inset:0; z-index:41; background:#f9f9f9; overflow:hidden`). Inside it a horizontal 3-pane track `#home-track` (flex, `gap:12px`, height 100dvh, `translateX` driven by JS) holds, in order: `#home-chat-view` (this module), `#home-match-romantic`, `#home-match-friend`. Each pane is `flex:0 0 100%`, its own vertical scroll container (`overflow-y:auto; overscroll-behavior-y:none`). The Chat pane is index 0 (track offset 0); the app opens on it by default (`S.homeView === 'chat'`).

**Top bar (shared by all 3 panes; belongs to match tab markup, but the chat list sits under it).** `fixed top-0`, height `h-14` = 56px + `env(safe-area-inset-top)` (the global rule `.fixed.top-0.h-14 { height: calc(3.5rem + inset); padding-top: inset }`), `bg-surface/80` + `backdrop-blur-xl`, no shadow, no border, `px-2` (8px), `flex items-center gap-1`, `z-40`. Children left→right:

1. `#home-addfriend-btn` — 40×40 round button, Material `add` at 22px, `text-black`; tap → plus popover (1.2).
2. `#home-mode-switch` — segmented pill, `flex-1 min-w-0 max-w-[268px] mx-auto`; container: white bg, 1px border `rgba(0,0,0,.08)`, radius 9999, height 40px, padding 3px, gap 3px. Three `.home-mode-seg` buttons `[Chat | Romantic | Friend]` (data-view `chat|romantic|friend`): `flex:1 1 auto` (width by content — "Chat" is narrower than "Romantic"), full height, `padding 0 .65rem`, radius 9999, Plus Jakarta Sans 700, 12px, letter-spacing .04em, nowrap, color #1b1b1b, transparent bg; `.active` = bg #CCFF00 + black text; press = scale(.98). Dark: container bg #1c1b19 border rgba(255,255,255,.08), text #eceae6, active stays neon/black.
3. Notifications button — 40×40 round, `notifications_none` 22px, with `#notif-badge` (min-w 16px h 16px, bg neon, black 10px bold, top-0.5 right-0.5) managed by notifications.js.

Because the top bar is fixed and translucent, each pane pads itself: `#home-chat-view { padding-top: calc(62px + var(--sat)) }` (56px bar + 6px gap + status bar), `pb-28` (112px bottom, clears the floating bottom nav), `px-0`, `max-w-2xl mx-auto`.

**Pane content, top to bottom** (`#home-chat-view`):

1. `#chat-banner` (`hidden` by default) — energy-refund banner mount. Rendered by `showRefundBanner(notif)` (see 2.11): a full-width card `px-4 py-3 rounded-[10px] bg-neon/15 border border-neon/40`, flex gap-3: `bolt` icon (neon) + 12px medium text + `close` icon (outline, 16px). Tapping the card opens the energy purchase page (`openEnergyModal`); tapping `close` hides the banner. Text: `Boost match unconfirmed after 48h — {n} energy refunded` when `metadata.refundReason === 'unconfirmed_48h'`, else `No match available this round — {n} energy refunded` (`n = metadata.energy`). English only.
2. `#chat-sessions-temp-section` → `#chat-sessions-temp` — rows for **temporary** sessions (48h candidate conversations). Hidden entirely when empty.
3. `#chat-sessions-confirmed-section` → `#chat-sessions-confirmed` — rows for **confirmed** (permanent) sessions. Hidden when empty.
4. `#chat-sessions-empty` — empty state (only when both groups are empty).

There are **no group headers**; the two groups read as one continuous list, temp rows always on top and visually distinguished by a pale neon background.

**Session row** (`.session-row`, one `<button>` per session, `w-full flex items-center text-left`, `active:opacity-70`):

- Box: `position:relative; padding:10px 17px; gap:10px`. 17px side padding is chosen so the avatar's left edge aligns with the "+" glyph in the top bar and the right column aligns with the bell glyph (8px bar padding + (40−22)/2 = 17px).
- Separator: `::after` 1px line, `left:81px` (17 + 54 avatar + 10 gap), `right:17px`, `bottom:0`, `rgba(0,0,0,.07)` (dark `rgba(255,255,255,.09)`); **not drawn on the last row of each group**.
- Temp rows add `.session-row--temp`: background `rgba(204,255,0,.15)` (dark `.12`); first temp row gets top corners radius 12, last temp row bottom corners radius 12 → the temp group reads as one pale-green rounded block. An **expired** temp row (remainingMs ≤ 0) gets `opacity-50`.
- Avatar (`.chat-avatar.chat-avatar--lg`): 54×54 circle, `object-fit:cover`, `loading=lazy`, from `partner.avatarUrl`. Fallback (`.chat-avatar--fallback`): same circle, bg #e2e2e2, color #474747, 700 weight, 14px, uppercase first character of nickname (or `·`). Dark fallback bg #343230 color #ddd.
- Text column (`flex-grow min-w-0`):
  - Line 1 (`flex items-center gap-2`): **name** = `partner.nickname || partner.name || 'Partner'`, Plus Jakarta Sans 700 15px `on-surface`, truncate; then, only if `partner.note` exists, a **note chip**: `px-1.5 py-0.5 rounded-[10px] bg-surface-container text-[10px] font-medium text-on-surface-variant truncate max-w-[45%]` showing the note text. (Nickname is always the primary name; the user's private note is the secondary tag.)
  - Line 2: preview `text-xs text-on-surface-variant truncate mt-1`: last message text truncated to 28 chars + `…`. Image-only last message → `[Photo]` / zh `[图片]`. No message yet → placeholder `Start the conversation…` / zh `开始聊天吧…` at 50% opacity.
- Right column (`flex flex-col items-end gap-1.5 flex-shrink-0`):
  - Time of `lastMessage.createdAt` via `formatPostTime` (10px, `text-outline`): `Just now` / `{n}M Ago` / `{n}H Ago` / `{n}D Ago` / locale date; zh `刚刚` / `{n} 分钟前` / `{n} 小时前` / `{n} 天前` / zh-CN date. Omitted when no last message.
  - **Countdown badge** (temp sessions only; `.session-countdown`, `text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-[10px]`): text = `formatRemainingShort(remainingMs)` → `≤0: "Expiring"`, `<60 min: "{m}m left"` (min 1), else `"{ceil(hours)}h left"`. Colors: normal `bg-neon/15 text-on-surface`; **under 1 hour** `bg-neon-pink/15 text-neon-pink`; **expired** `bg-surface-container text-outline`.
  - **Unread dot**: 8×8 circle `bg-neon-pink`, shown when `unreadCount > 0`. (No numeric count is shown on the row.)

**Ordering.** Server returns sessions by `Match.updatedAt desc` (touched on every send/nudge). Client splits: `temp = sessionType==='temp' && status not terminal && remainingMs > 0`; `confirmed = sessionType==='confirmed' && status not terminal` (terminal = EXPIRED/DISSOLVED/REJECTED, defensive — backend already excludes them). Confirmed group is then **stable-sorted with romantic (couple) sessions first**, friends after (this is the only visual mode distinction — there is no per-row mode icon; `sessionModeBadge()` in the file is dead code).

**Empty state** (`#chat-sessions-empty`): `flex flex-col items-center text-center pt-24` (96px): `flatEmptyIcon('forum')` = 64×64 box radius 18, bg #efefef, `forum` icon 28px #8a8a8a, `mb-6`; title `No conversations yet` (Plus Jakarta Sans 800 16px tracking-tight, on-surface); body `Match in Romantic or Friend mode — chats appear here once you connect.` (14px on-surface-variant, mt-2, max-w 16rem, leading-relaxed). Both strings are in the zh dictionary.

**Live countdown.** After every render, a 1s ticker decrements each temp row's badge in place (`data-remaining`), rewrites the label, switches to the pink class under 1h and to the grey/expired class + row `opacity-50` at 0. Stops itself when no temp badges remain. The expired row stays until the next `loadSessions` (which filters `remainingMs > 0`).

**Bottom nav auto-hide** is bound to this pane's scroll: scroll down > 6px hides the floating nav, scroll up > 6px or `scrollTop < 40` shows it.

**Pull-to-refresh** is attached to `#tab-match` but enabled only while `S.homeView === 'chat'`; it moves `#home-chat-view` with the finger and calls `loadSessions()`. Indicator: 40px white circle with `refresh` icon (22px, #1b1b1b), hidden behind the top bar (`top: safe-area-inset`, `z-index:39`), fades in over the first 40px, translates with rubber-band `dist = 180·(1−e^(−dy/180))`, icon rotates `dist/70·360°`; at `dist ≥ 70` icon turns neon (`.ptr-ready`); on release ≥70 → spinner (`.ptr-spinning`, 0.7s linear rotation), content held at 70px, refresh runs, minimum 600ms display, then everything springs back (0.3s cubic-bezier(.22,1,.36,1)). Pull is refused while a horizontal pane swipe is in progress (`horizLock`), when an inner element is scrolled, or when the pane is not at `scrollTop 0`.

### 1.2 Plus popover (`#chat-plus-menu`) — owned by match.js, launched from the chat top bar

Backdrop `fixed inset-0 z-68 rgba(0,0,0,.12)` (tap = close). Card `fixed`, `top: calc(3.5rem + safe-area-inset-top)` (anchored to the bar's bottom edge), `left:12px`, `z-69`, `min-width:208px`, white, radius 14, 1px border rgba(0,0,0,.06), shadow `0 10px 32px rgba(0,0,0,.16)`, padding 6px; enter animation 180ms from `opacity 0, translateY(−6px) scale(.98)` (origin top-left). Items (`.cpm-item`: flex gap 12, padding 11px 12px, radius 10, Plus Jakarta Sans 700 13px letter-spacing .02em, hover #f3f3f3, press scale .98), icon 20px:

| icon | label (en) | zh | action |
|---|---|---|---|
| `search` | Search & discover | 搜索与发现 | `openFriendHubAt('search')` (1.8) |
| `qr_code_2` | Add by QR | 扫码添加 | `openFriendHubAt('qr')` (addfriend module) |
| `hub` | Relationship Network | 关系网 | `openFriendHubAt('graph')` (addfriend module) |
| `dark_mode` | Dark mode | 深色模式 | `toggleDarkMode()` |
| `translate` | Language | 语言 | `openLangDialog()` |

Tapping an item closes the popover first, then runs the action. Dark: card #1c1b19, border rgba(255,255,255,.07), item text #eceae6, hover #292724. The same popover is used on all three home panes (the left button is always `add`).

### 1.3 Conversation overlay (`#chat-overlay`)

Full-screen `.overlay` (`fixed inset-0`, flex column, `z-50`, `bg-background` → #f9f9f9 / dark #121110, `overflow:hidden` — the overlay itself does not scroll). Shown by adding `.active` (opacity/visibility fade 0.25s). Entered from a session row, from `openConnectionChat(matchId)` (match cards "Enter Chat", QR add success, relationship graph node, contact search result), or from the legacy match-flow `openChat()`.

Top-to-bottom:

1. **Blurred wallpaper layer** `#chat-bg` — `absolute z-0`, bleeds 30px past every edge (`top/left/right/bottom:-30px`), `bg-cover bg-center`, `filter: blur(9px) brightness(.93)`, `pointer-events:none`. Only displayed when the session has `chatBackground` (the *viewer's own* per-conversation wallpaper); otherwise `display:none`.
2. **Header** — `fixed top-0 w-full z-50`, `h-16` = 64px + safe-area (padding-top = inset), `bg-surface/80 backdrop-blur-xl`, `border-b border-outline-variant/20`. Inner row `flex justify-between items-center px-6`.
   - Left cluster: `arrow_back` icon (24px, `text-on-surface`, tap → `closeChat()`), then `gap-3`: `#chat-partner-avatar` 36×36 circle (img `object-cover` or initial-letter fallback; tap → partner public profile) and a text stack: `#chat-partner-name` (Plus Jakarta Sans 700 14px tracking-tight, black / dark white; `data-no-i18n`) + `#chat-partner-location` (10px tracking-widest `text-neutral-400`; shows the partner's **school** run through `metaLabel` — zh university names in zh mode; `data-no-i18n`).
   - Right cluster `#chat-header-actions` (`flex items-center gap-2`), rendered by `renderChatHeaderActions()` from `S.chatSessionType / S.chatMode / S.chatMyConfirmed`:
     - **No session metadata** (opened via legacy match-flow path): nothing at all.
     - **temp && !myConfirmed**: neon pill `Confirm as Partner` (icon `auto_awesome`) or `Confirm as Friend` (icon `group`) — `inline-flex gap-1 px-3 py-2 rounded-[10px] bg-neon text-black font-headline text-[10px] font-bold tracking-widest active:scale-95`, icon 14px.
     - **temp && myConfirmed**: disabled outlined pill `Waiting for them…` — `px-3 py-2 rounded-[10px] border border-outline-variant/40 text-outline text-[10px] font-bold tracking-widest opacity-60`.
     - **temp or confirmed** (always appended when metadata exists): icon button `link_off` (`p-2 rounded-[10px] text-outline hover:text-neon-pink`, aria "Delete Relationship") → dissolve flow.
3. **Message stream** `#chat-messages` — `relative z-10 flex-1 overflow-y:auto`, `pt-20` (80px, clears the 64px header + gap), `pb-28` (112px, clears the composer), `px-4`, `w-full max-w-2xl mx-auto` (the `w-full` is load-bearing: without it the flex item shrinks to content and own messages stop hugging the right edge). Contents in order, built by `chatStreamHtml`:
   - **Time separator** `.chat-time-sep` — full-width centered, 10px, #b6b6b6, `margin:14px 0 10px`, letter-spacing .04em; inserted before the first rendered message and before any message whose `createdAt` is ≥ 10 minutes after the previous one. Format `formatChatStamp`: same day `HH:MM`; yesterday `Yesterday HH:MM` / zh `昨天 HH:MM`; older `M/D HH:MM` / zh `M月D日 HH:MM`. No per-message timestamps.
   - **Nudge system line** (`kind === 'nudge'`, or legacy: no `kind` and text contains "nudged", and no image) — `w-full text-center text-[11px] text-on-surface-variant py-1.5 italic`, no bubble, no avatar. Text is the server string `"{myName} nudged {partnerName}{suffix}"`.
   - **Message row** `.chat-row` — `flex items-end gap:8px margin-bottom:12px`; `.mine` → `justify-content:flex-end`. Partner rows: 36px avatar on the left (tap → avatar popover 1.4, `cursor:pointer`); own rows: 36px avatar (`S.currentUser.profile.avatarUrl`, fallback initial of own nickname / "M") on the right. Between them `.chat-col` (`max-width:72%`, column; `align-items:flex-start`, `.mine` → `flex-end`) containing, in order:
     - image (if `imageUrl`): `.chat-image` `max-width:100%; max-height:16rem; object-fit:cover; border-radius:14px; display:block; cursor:pointer` → tap opens viewer (1.5). When both image and text exist the bubble follows with `margin-top:6px`.
     - text bubble (if `content`): `.chat-bubble` `padding:10px 14px; font-size:15px; line-height:1.45; word-break:break-word`; partner: bg #f1f1f1, color #1b1b1b, radius `18px 18px 18px 6px` (small tail bottom-left); mine: bg #CCFF00, black, radius `18px 18px 6px 18px`. Dark: partner bubble #292724 / #eceae6, mine unchanged. `data-no-i18n` on every bubble.
     - **read receipt** (own rows only) `.chat-read` — 9px, #b6b6b6, `margin-top:3px`, right-aligned, text `Read` / zh `已读`; `display:none` until `isRead` is true (then `data-read="1"`). No "delivered"/"sent" states; partner rows never show receipts.
   - Rendering window: only the **last 30** messages are rendered initially; scrolling to `scrollTop ≤ 10` prepends the previous 30 (in-memory, no network) while preserving the visual scroll offset.
4. **Composer** — `fixed bottom-0 w-full z-50`, `bg-surface-container-low` (#f3f3f3), `border-t border-outline-variant/20`, `py-3 px-4`, `pb-safe` (bottom padding = safe-area-inset-bottom). Stack:
   - `#chat-dissolved-notice` (hidden unless the session is terminal): centered `text-[10px] tracking-widest text-neutral-400 font-headline mb-2`, text `This connection has ended. You can no longer send messages.` (zh in dictionary).
   - `#chat-pending-image` (hidden unless a picked image is waiting): `flex justify-start mb-2` → 80×80 relative box with the thumbnail (`object-cover rounded-[10px] border border-outline-variant/40`) and a 20px `bg-neon-pink text-white` round `close` (14px) button at `-top-1.5 -right-1.5` that discards the picked image.
   - Input row `flex items-end gap-2 max-w-2xl mx-auto`: hidden `<input type=file accept=image/*>`; **image button** 40×40 `text-neutral-500` (hover black), Material `add` with `wght 300`; **textarea** `#chat-input` `flex-1 min-w-0 text-sm font-body bg-surface-container-lowest (#fff) rounded-[18px] border-0 px-4 py-2.5 resize-none overflow-hidden rows=1`, placeholder `Type your response...` / zh `输入消息…` (placeholder text is set at render time per language, see 2.x), focus ring 1px neon (no auto-grow is implemented); **send button** 40×40 circle `bg-neon text-black` with `arrow_upward` 20px, `active:scale-95`.
   - Disabled (dissolved) state: textarea, send button and the file input are `disabled`; textarea placeholder becomes `Relationship ended — you can no longer send messages` / zh `关系已解除，无法再发送消息`; the notice line appears.

Header and composer are `fixed`, so the whole overlay root is what the edge-swipe-back gesture translates (see 2.13).

### 1.4 Partner-avatar popover (`.chat-avatar-menu`)

Created on tapping a partner avatar next to a bubble (not the header avatar). `fixed z-[130]`, `left = min(tapX, innerWidth − 190)px`, `top = tapY + 8px`; `bg-surface-container-lowest`, `border border-outline-variant/30`, `rounded-[10px]`, `shadow-2xl`, `py-1`, `text-sm`, `overflow-hidden`. Items (`w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-surface-container`, icon 18px `text-outline`):

| shown when | icon | label (en / zh) | action |
|---|---|---|---|
| confirmed sessions only | `waving_hand` | Nudge / 拍一拍 | `chatNudge()` |
| always | `edit_note` | Set note / 设置备注 | `S.viewingProfileId = partnerId; promptSetNote()` |
| confirmed sessions only | `wallpaper` | Chat background / 聊天背景 | `editChatWallpaper()` |

Any click anywhere (registered 10ms later) removes the popover; opening a new one removes any existing one.

### 1.5 Image viewer (`#chat-image-viewer`)

`.overlay z-[80] bg-black/90`, centered `<img>` `max-w-[92%] max-h-[85%] object-contain`. Tap anywhere → close. Used for chat image messages (`openChatImage(src)`).

### 1.6 Confirm card (dissolve) — generic `confirmCard`

Backdrop `fixed inset-0 z-[120] bg-black/40 backdrop-blur-[2px] px-6`, centered card `max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6`: title Plus Jakarta Sans 800 18px tracking-tight `mb-2`; body 14px on-surface-variant leading-relaxed `mb-6`; buttons row `gap-3`, each `flex-1 py-3 rounded-[10px] font-bold text-xs tracking-widest`: Cancel (border outline-variant, on-surface text) and confirm (danger → `bg-neon-pink text-white`, else `bg-neon text-black`). Tapping the backdrop resolves `null` (abort), Cancel resolves `false`. For dissolve: title `Delete this relationship?`, body `They will be notified and neither of you can send messages anymore.`, confirm `Delete` (zh 删除), cancel `Cancel` (zh 取消); title/body are English-only.

### 1.7 Prompt card (set note) — generic `promptCard`

Same backdrop/card. Title `Set a note`, small uppercase label `NOTE` (10px 700 tracking .2em outline), single-line input (`bg-surface-container-low rounded-[10px] px-3 py-2.5`, focus ring neon) prefilled with the current note, placeholder `Leave blank to clear`, buttons Cancel / Save (zh 取消 / 保存), Enter key = Save. Resolves `null` on cancel/backdrop.

### 1.8 Contact search — Friend Hub "Search & discover" panel (addfriend.js, data from this module)

`#friend-hub-overlay` `.overlay z-[60] bg-surface`; sticky header `h-16` (64px + safe-area) `bg-surface/80 blur border-b outline-variant/20 px-6 gap-4`: `arrow_back` (24px) + title `#friend-hub-title` (Plus Jakarta Sans 700 20px) = `Search & discover` (zh 搜索与发现). Content `flex-1 overflow-y-auto px-6 py-8 max-w-md mx-auto`, panel `space-y-4`:

- Search pill: `flex items-center gap-2 bg-surface-container-low rounded-full px-4 py-2.5`, `search` icon 20px outline, transparent input `text-sm`, placeholder `Search your contacts` / zh `搜索联系人`; auto-focused 50ms after opening.
- Results `#friend-search-results` (`space-y-2`): one button per session `w-full flex items-center gap-3 py-2 text-left active:opacity-70`: 36px circle (avatar `object-cover`, else `person` icon 18px outline on `bg-surface-container`), text block (name = `note || nickname || name || 'Partner'` 14px bold on-surface truncate; sub = last message text, else school via `metaLabel`, 10px outline truncate), trailing `chevron_right` (outline). Empty text (11px italic outline): `No conversations yet.` (zh 还没有会话。) when the query is empty, `No conversations matched.` (zh 没有匹配的会话。) when a query has no hits.

Search is **local only** over `S.sessions` (nickname, name, note, school, last-message text; case-insensitive substring), debounced 120ms, zero network. Empty query lists every session. If `S.sessions` is empty on open, `loadSessions()` is awaited first. Tapping a result closes the hub and calls `openConnectionChat(matchId)`.

### 1.9 Toast (`#toast`)

`fixed`, `top: calc(16px + safe-area-inset-top)`, centered, bg #000, white 14px, `padding 12px 24px`, radius 10, slide-down 0.3s, auto-hide 3s. All chat feedback messages below go through it.

### 1.10 Settings → Nudge section (settings.js; the copy shown in nudge messages)

Section header `Nudge` (12px 900 tracking .2em outline); row: static label `…nudged me` (14px on-surface-variant; zh `…拍了拍我`), text input `#settings-nudge-suffix` (maxlength 40, placeholder `on the head`, `bg-surface-container-low rounded-[10px] px-3 py-2.5`), `Save` pill (`bg-neon text-black rounded-full px-4 py-2 10px bold tracking-widest`, busy → `Saving…`/`保存中…`). Saves `PUT /chat/nudge-suffix { suffix }`. The suffix is what *other people* see appended when they nudge you.

### 1.11 Partner public profile overlay (match.js) — reached from the header avatar

`viewPartnerProfile(userId, matchId)` opens `#partner-profile-overlay` (z-70) and reports an `openedProfile` behaviour event for the match. Not part of this module; documented in the match map.

---

## 2. Interactions

### 2.1 Entering / leaving the chat list

- App start / `switchTab('match')` → `switchHomeView(S.homeView || 'chat')` → for `chat`: highlights the segment, animates the track to offset 0 (no animation on the very first entry), pre-warms the two match panes, and calls `loadSessions()`.
- Tapping a segment or swiping horizontally on `#tab-match` switches panes: track follows the finger (`dx`, damped ×0.3 at the ends = rubber band), direction decided after 12px of movement (horizontal wins if |dx| > |dy|, then vertical scroll is suppressed), release with |dx| ≥ 70px snaps to the adjacent pane (`switchHomeView`), else springs back (0.28s cubic-bezier(.22,1,.36,1)). Swipe is ignored while any `.overlay.active` exists or the plus popover is open; a second finger mid-gesture is ignored.
- Leaving the tab (`switchTab` to square/profile) stops chat polling; the list DOM stays as-is.

### 2.2 Session row tap → `openSessionById(matchId)` → `openSession(session)`

Copies session metadata into `S.chat*` (type, mode, status, myConfirmed/partnerConfirmed — explicit flags preferred, else inferred from a status containing `CONFIRMING`; matchId, partner name/id/avatar/school, `chatBackground`) then `openChat({fromSession:true})`:

1. Writes header name / school (metaLabel) / avatar; renders header actions.
2. Stops any previous polling, resets `chatPollBusy`, clears `S.chatMessages`, cursors, render window and the DOM.
3. Applies composer enable/disable from `S.chatSessionStatus`; applies wallpaper; binds the scroll-to-top handler once.
4. Opens the overlay, then `await loadChatHistory()`; if the user switched conversations meanwhile (`S.chatMatchId !== matchId`) it stops; else `markChatRead()` and `startChatPolling()`.

Expired temp rows (opacity .5) are still tappable; the backend allows viewing read-only history for EXPIRED/DISSOLVED/REJECTED matches (sending is refused).

### 2.3 Legacy `openChat()` without `fromSession` (match-flow path, still wired for "Send Message"-style entries)

Reads `S.matchStatus[S.activeMatchMode]`; if neither `partner` nor `match` exists → toast `No active connection` and abort. Seeds partner fields from the bucket, sets `chatSessionType = null` (→ **no header actions**), `chatMode = activeMatchMode`, status from `match.status`, `chatBackground = null`. Everything else identical to 2.2.

### 2.4 Close (`closeChat`)

Back arrow, edge swipe-back, or after dissolve. Stops polling, **nulls `S.chatMatchId`** (this is what makes in-flight history/poll/send responses discard themselves), removes `.active`, and if the Chat pane is the current home view → `loadSessions()` so unread dots / previews / countdowns update.

### 2.5 Sending text / image (`sendChatMessage`)

- Triggers: send button, or **Enter without Shift** in the textarea (Enter is `preventDefault`-ed so no newline accumulates; Shift+Enter inserts a newline).
- Guards in order: a send already in flight → ignore; no text (trimmed) and no pending image → ignore; no matchId → ignore; session terminal (`isChatDissolved()`) → toast `Relationship ended — you can no longer send messages`, re-apply disabled composer, abort.
- Snapshot `matchId` at entry (used for every request/render so a conversation switch during a slow upload can't misroute).
- **Optimistic clear**: textarea emptied and pending-image preview removed immediately.
- If an image is pending: toast `Uploading image…` → `uploadImageFile` → `POST /chat/{id}/messages {imageUrl}` → if still in the same chat, append the returned message (or reload history if the response has no id).
- Then if text: `POST /chat/{id}/messages {content}` → same append logic. **Image and text are two separate messages**, image first.
- Append (`appendOwnMessage`): pushes to `S.chatMessages`, appends DOM (time separator logic applies), scrolls to bottom. **Does not advance the poll cursor** (see gotchas).
- Failure: if still in the same chat, restore the draft only if the user hasn't typed anything new (text restored into an empty textarea; image preview restored if none is pending). Error mapping: message containing `has ended` / `cannot send` / `no longer` → toast `Relationship ended — you can no longer send messages`, set `S.chatSessionStatus='DISSOLVED'`, disable composer; anything else → toast `Failed to send` (`Failed to send image` on the legacy `sendChatImage` path).
- Server validation: `content` max 2000 chars; at least one of content/imageUrl; 403 `This chat has ended, you cannot send new messages` for terminal matches **or temp matches older than 48h** (even if the scheduler hasn't flipped them to EXPIRED yet).

### 2.6 Picking an image (`onChatImagePicked`)

File input (`accept=image/*`) → stores the `File` in `S.chatPendingFile`, shows the 80×80 preview from an object URL, focuses the textarea. The user may add caption text before sending. The × on the preview clears it (revokes the object URL). Upload happens only when Send is tapped.

### 2.7 Receiving messages

- **Polling** (`pollChatMessages`) every 5s while the overlay is open (`startChatPolling`), with a per-timer matchId capture so stale timers no-op. While the SSE stream is up (`S.realtimeUp`), only every 6th tick runs (= 30s fallback). Each run: skip if busy (but set `chatPollPending` so a run happens right after the current one finishes); snapshot matchId + `S.chatLastId`; `GET /chat/{id}/messages/poll?afterId=…` (no `afterId` when the conversation has no known message); discard the response if the chat changed; dedupe by id against `S.chatMessages`; advance `S.chatLastId` to the last message of the batch; append fresh ones (time separators computed against the last rendered message); auto-scroll to bottom only if the view was within 120px of the bottom; if any fresh message is from the partner and unread → `markChatRead()`. Every 3rd successful poll also runs `refreshReadReceipts()`. Errors are logged, never toasted (the interval retries).
- **SSE** (core.js `startRealtime`, opened right after login/`/users/me`): `EventSource GET /realtime/stream?token=JWT`. Frames: `{type:'ready'}` → `S.realtimeUp=true`; `{type:'message', matchId}` → if that chat is open, `pollChatMessages()` immediately; always `loadSessions()` throttled to one call per 3s (leading + trailing); `{type:'read', matchId}` → if that chat is open, `refreshReadReceipts()`; `{type:'notification'}` → notifications tick (throttled 3s); `{type:'evicted'}` (server allows 5 connections per user, evicts the oldest) → close the stream and stay on full-rate polling. `onerror` → `realtimeUp=false` (polling returns to 5s; the browser reconnects automatically; a 401 closes for good). Server sends `: ping` comments every 25s.

### 2.8 Read receipts

- Mine → partner: after history load and whenever a fresh unread partner message arrives, `PUT /chat/{id}/messages/read` (single-flight guard; failures only logged).
- Partner → mine: `refreshReadReceipts()` finds the first own message with `isRead=false`; if any, `GET /chat/{id}/messages?limit=100&cursor={id of the message before it}` and flips `isRead` + shows the `Read` label for every own message the server now reports read. Runs every 3rd poll and on SSE `read`.

### 2.9 Confirm relationship (header pill) → `confirmRelationship(matchId)`

Single-flight guard (`chatActionInFlight`) + all header buttons disabled. `POST /matching/{matchId}/confirm-relationship`. On success: `S.chatMyConfirmed = true`; if the response `status` is one of `CONFIRMED/MATCHED/RELATIONSHIP/FINAL/ACTIVE` also mark partner confirmed (see gotcha — real statuses never match this list); re-render header; toast `data.message` (server copy: `You have confirmed, waiting for the other party to confirm...` or `You've both confirmed — you're friends now!` / `You've both confirmed — your relationship is official!`; fallbacks `You are connected now` / `Confirmed. Waiting for them to confirm` are practically unused); `await loadSessions()`; `syncOpenSessionFromList(matchId)` re-derives type/mode/status/flags from the fresh list (this is what actually turns the header into the confirmed state after a double confirm); `loadMatchTab()` so the match pane updates. Failure: toast the server message (`Cannot confirm in the current status`, `Confirmation window has expired`, `You already have a partner, cannot confirm a new partner match`) or `Failed to confirm`. `finally` re-renders the header (never blindly re-enables the disabled "Waiting" pill).

### 2.10 Delete relationship (header `link_off`) → `dissolveRelationship(matchId)`

Confirm card (1.6). If confirmed: single-flight + disable header buttons; `POST /matching/{matchId}/dissolve {reason:'user_dissolved'}`; toast `Relationship deleted`; if this chat is open set `S.chatSessionStatus='DISSOLVED'` and disable the composer; remove the row from `S.sessions` and re-render the list immediately; `closeChat()`; `await loadSessions()`; `loadMatchTab()`. Failure → toast server message (`Cannot end in the current status`) or `Failed to remove connection`; header re-rendered so buttons are usable again. Works for both temp (semantically "reject") and confirmed matches, both modes. The partner receives a `relationship_dissolved` notification.

### 2.11 Energy refund banner

`notifications.js` (`maybeSurfaceRefund`, called whenever a notifications page is fetched) finds the first `energy_refunded` notification not yet surfaced in this session and calls `showRefundBanner(notif)` → banner rendered into `#chat-banner` (1.1) + `refreshEnergyBalance()` (prefers `loadEnergyBar()`, else `GET /energy/balance`). Tap banner → `openEnergyModal()`; tap × → hide. `loadSessions()` also calls `refreshEnergyBalance()` every time (the old banner-on-list-enter behaviour was removed; the balance refresh remains).

### 2.12 Header avatar tap → partner profile; bubble avatar tap → popover (1.4)

- Header avatar → `viewPartnerProfile(S.chatPartnerId, S.chatMatchId)`.
- Popover **Nudge** → `POST /chat/{id}/nudge {}` then `loadChatHistory()` (full reload, so the system line appears). Failure toast `Failed: {message}` (server: `Only confirmed chats can use Nudge`).
- Popover **Set note** → prompt card (1.7) → `PUT /users/me/notes {targetUserId, note}` → toast `Note saved` / `Note cleared` → `loadSessions()` (note chip appears on the row; list rows and the search list use it). Abort on cancel.
- Popover **Chat background** → native file picker → toast `Uploading…` → `uploadImageFile` → `PUT /chat/{id}/background {imageUrl}` → `S.chatBackground = url`, wallpaper applied at once → toast `Wallpaper set`. Failure toast `Failed: …` (server: `Only confirmed chats can set a background`). Wallpaper is per-user per-conversation (stored in the viewer's own settings; the partner never sees it). Clearing (`imageUrl:null`) is supported by the API but has no UI.

### 2.13 Gestures on the overlay

- **Edge swipe back**: touch starting within 30px of the left screen edge on the topmost active overlay that contains an `arrow_back` icon; after 10px, if horizontal, the whole overlay root translates with the finger (no fade, vertical scroll suppressed); release with dx ≥ 80px → slides out over 0.2s then `closeChat()`; else springs back 0.25s.
- Image message tap → viewer; viewer tap → close.
- Scrolling to the top of `#chat-messages` (≤10px) prepends 30 older messages while keeping the visible content anchored.
- Long-press: none in chat. Haptics: none. Pull-to-refresh: none inside the conversation (only on the list).

### 2.14 Keyboard

Enter = send (unless Shift). No auto-grow, no draft persistence across conversations (draft survives only inside one open conversation; switching conversations discards it — `openChat` doesn't clear the textarea explicitly, but the failure-restore only applies to the same matchId).

---

## 3. API calls

All calls go through `api(path, method, body)`: base `S.API` = `https://api.<domain>/api/v1` (local: `http://host:3001/api/v1`), header `Authorization: Bearer <cl_token>`, JSON, `cache:'no-store'`. Every response is wrapped by the global interceptor as `{ success, data, message?, timestamp }`; the H5 unwraps with `res?.data || res`. Any **401** → token removed, all polling/SSE stopped, `cleanupUserState()`, overlays closed, auth page shown, and the caller's promise rejects with `Unauthorized`. Non-2xx → `Error(data.message || 'API {status}')`, whose `.message` is what the toasts show.

| # | Call | When | Request | Response fields used | Notes / errors |
|---|---|---|---|---|---|
| 1 | `GET /chat/sessions?mode=all&limit=100` | entering the Chat pane; pull-to-refresh; `closeChat()` (if on Chat pane); after confirm/dissolve/note save; SSE `message` (throttled 3s); Friend Hub search open when cache empty; `openConnectionChat` | query `mode` ∈ romantic/friend/all, `limit` 1–100 (H5 uses the max 100 so every contact is searchable) | `data.sessions[]`: `matchId` (string), `mode` ('romantic'/'friend'), `status` (Prisma `MatchStatus`), `sessionType` ('temp'/'confirmed'), `remainingMs` (number ms for temp, null for confirmed = createdAt+48h−now, floored at 0), `myConfirmed`/`partnerConfirmed` (bool), `partner{ id, note, nickname, avatarUrl, school, gender, age }`, `lastMessage` (Message object or null: `{id, content, imageUrl, kind, senderId, isRead, createdAt}`), `unreadCount` (int), `chatBackground` (url or null), `updatedAt`. `total` is ignored. | Server excludes EXPIRED/DISSOLVED/REJECTED and `dissolvedAt != null`; sorted `updatedAt desc`. Failure → toast `Failed to load conversations`, previous cache kept. H5 also accepts a bare array. |
| 2 | `GET /chat/{matchId}/messages?limit=50[&cursor=id]` | `loadChatHistory()` on open and after a nudge | walks `nextCursor` (oldest→newest) up to 100 pages until `nextCursor` is null or a page is empty | `messages[]` (fields as above), `nextCursor` (last id when a page is full, else null) | **Side effect: the server marks the partner's unread messages in the returned page as read** (no SSE emit). Aborts silently if the chat changed mid-walk. Failure → toast `Failed to load messages`. 403 for non-members / non-chattable statuses; 404 unknown match. |
| 3 | `GET /chat/{matchId}/messages?limit=100[&cursor=prevId]` | `refreshReadReceipts()` (every 3rd poll; SSE `read`) | cursor = id of the message before my first unread-by-partner own message | `messages[].id/isRead` | Same read side effect. Errors logged only. |
| 4 | `GET /chat/{matchId}/messages/poll[?afterId=id]` | every 5s (30s when SSE up); on SSE `message` for the open chat; after a busy poll if pending | `afterId` = `S.chatLastId` (omitted when null) | `messages[]` (≤50, ascending by createdAt,id, strictly after the anchor; **empty if the anchor id no longer exists**) | Side effect: marks returned partner messages read on the server (the objects returned still say `isRead:false`). Errors logged only. |
| 5 | `POST /chat/{matchId}/messages` | send | body `{content}` (≤2000 chars) **or** `{imageUrl}` — separate requests for image and text | the created Message (`id, content, imageUrl, kind, senderId, isRead, createdAt`) | 400 if both empty; 403 `This chat has ended, you cannot send new messages` (terminal status, or temp match older than 48h). Server touches `Match.updatedAt` and pushes SSE `message` to the partner. |
| 6 | `PUT /chat/{matchId}/messages/read` | after history load; when a fresh unread partner message arrives via poll | none | ignored (`{markedRead}`) | Single-flight. Server emits SSE `read` to the partner **only if it actually flipped rows**. |
| 7 | `POST /chat/{matchId}/nudge` | avatar popover → Nudge | `{}` | ignored (`{ok, messageId, content}`); H5 reloads history | 403 `Only confirmed chats can use Nudge`. Creates `kind:'nudge'` message `"{me} nudged {partner}{partner's suffix}"`, touches `updatedAt`, SSE `message` to partner. |
| 8 | `PUT /chat/{matchId}/background` | avatar popover → Chat background (after upload) | `{imageUrl: string|null}` | ignored (`{chatBackground}`) | 403 `Only confirmed chats can set a background`. Stored in caller's `settings.chatBackgrounds[matchId]`. |
| 9 | `PUT /chat/nudge-suffix` | settings Nudge → Save (settings.js) | `{suffix}` (trimmed to 40 chars server-side) | ignored (`{nudgeSuffix}`) | Also mirrored into `S.currentUser.settings.nudgeSuffix`. |
| 10 | `POST /uploads/image` | image message, wallpaper | multipart `file` | `data.url` (absolute https URL) | Throws `Upload failed`/server message. |
| 11 | `POST /matching/{matchId}/confirm-relationship` | header confirm pill | none | `status` ('WAITING' \| 'RELATIONSHIP_ROMANTIC' \| 'FRIEND_CONFIRMED'), `message` | 400 `Cannot confirm in the current status` / `Confirmation window has expired` / `You already have a partner, cannot confirm a new partner match`; 403 not a member. Sends `relationship_confirmed` notifications + SSE `notification` to both when finalized. |
| 12 | `POST /matching/{matchId}/dissolve` | header link_off → confirm card | `{reason:'user_dissolved'}` | none used | 400 `Cannot end in the current status`; partner gets `relationship_dissolved` notification + SSE `notification`. |
| 13 | `PUT /users/me/notes` | avatar popover → Set note | `{targetUserId, note}` (empty note clears) | none used | Note comes back as `partner.note` in #1. |
| 14 | `GET /energy/balance` | `refreshEnergyBalance()` fallback when `loadEnergyBar` is absent | none | stored into `S.energy` | — |
| 15 | `GET /realtime/stream?token=JWT` (EventSource) | after `/users/me` succeeds at start-up and after register/login | query `token` | frames `{type:'ready'|'evicted'|'message'|'read'|'notification', matchId?}` | 401 (bad/banned) → stream closed, no reconnect. |
| 16 | `GET /chat/{matchId}/unread` | **not used by H5** (exists; existing iOS ChatService has it) | — | `{unreadCount}` | — |

Backend status vocabulary (`MatchStatus`): temp = `MATCHED_ROMANTIC`, `ROMANTIC_CONFIRMING`, `MATCHED_FRIEND`, `FRIEND_CONFIRMING`; confirmed = `RELATIONSHIP_ROMANTIC`, `FRIEND_CONFIRMED` (+ legacy `RELATIONSHIP_MODE`); terminal (read-only history, no sending, excluded from the list) = `REJECTED`, `DISSOLVED`, `EXPIRED`. Confirmation window = 48h from `Match.createdAt`.

---

## 4. Client state

Declared in `state.js` (`S`), all cleared by `cleanupUserState()` (logout, 401, anonymous start):

| field | meaning | reset on cleanup |
|---|---|---|
| `homeView` | `'chat' \| 'romantic' \| 'friend'` — current home pane (default `'chat'`) | → `'chat'` |
| `sessions` | cached `/chat/sessions` array | → `[]` |
| `chatMatchId`, `chatPartnerId`, `chatPartnerName` | open conversation identity | → null |
| `chatPartnerAvatar`, `chatPartnerSchool` (dynamic, not declared) | header avatar/school | **not cleared** (harmless: overwritten on every open) |
| `chatSessionType` ('temp'/'confirmed'/null), `chatMode`, `chatMyConfirmed`, `chatPartnerConfirmed`, `chatSessionStatus` | drives header actions + composer gate | → null/false |
| `chatBackground` (dynamic) | current wallpaper url | not cleared (reset on every open) |
| `sessionCountdownId` | 1s badge ticker interval | cleared via `stopSessionCountdown()` |
| `chatMessages` | full in-memory history (all pages) | → `[]` |
| `chatLastId` | poll cursor (`afterId`) | → null |
| `chatNextCursor` | last history cursor (informational) | → null |
| `chatRenderFrom` | index of the first rendered message (render window) | → 0 |
| `chatLoadingHistory` | re-entrancy flag for prepend | → false |
| `chatPollingId` | 5s interval id | cleared via `stopChatPolling()` |
| `chatPollBusy`, `chatPollPending` (dynamic), `chatPollTick` | poll single-flight / coalescing / receipt cadence (mod 3) | busy→false, tick→0; pending not cleared |
| `chatPendingFile` (dynamic) | picked-but-unsent image `File` | **not cleared** on cleanup (only by send/×) |
| `realtimeES`, `realtimeUp`, `rtThrottle` (dynamic, core.js) | SSE handle, "stream is up" flag, throttle slots | `stopRealtime()` closes + clears |
| `viewingProfileId` (dynamic, match.js) | target of Set note / profile view | — |
| `currentUser.id / .profile.avatarUrl / .profile.nickname` | "mine" detection (`senderId === currentUser.id`), own avatar/initial | → null |
| `energy` | refreshed after refunds | → zeros |

Module-local (not on `S`): `chatActionInFlight` (confirm/dissolve guard), `chatSendInFlight`, `markReadInFlight`.

localStorage: `cl_token` (JWT), `cl_lang` (`'zh'`/absent=en). No chat data is persisted locally — every open re-fetches the entire history.

---

## 5. i18n

Mechanism (i18n.js): language = `localStorage.cl_lang` (`getLang()`), default `en`. In zh mode a `MutationObserver` translates every **text node whose trimmed content exactly equals a dictionary key** (`ZH[...]`), plus `placeholder` attributes via `ZH_PLACEHOLDER`, on initial load and on every DOM insertion. Elements marked `data-no-i18n` (and their subtrees) are skipped — the chat module marks all user content (names, notes, previews, bubbles, times, header name/school) so a message that happens to equal a UI string is never rewritten. Strings containing numbers or user data can't be dictionary keys, so they are produced at render time with `zh ? … : …`. Switching language reloads the page (`toggleLang`), so nothing has to be re-rendered live. Attribute changes (e.g. placeholder rewrites) are **not** observed — the chat placeholder is therefore written per language directly.

Dictionary-translated UI strings this module shows (en → zh):

| en | zh |
|---|---|
| Chat / Romantic / Friend (segments) | 聊天 / 恋人 / 朋友 |
| Match / Square / Profile (bottom nav) | 匹配 / 广场 / 我的 |
| No conversations yet | 还没有会话 |
| Match in Romantic or Friend mode — chats appear here once you connect. | 去恋人或朋友模式匹配，连接成功后会话会出现在这里。 |
| Confirm as Partner / Confirm as Friend | 确认为恋人 / 确认为好友 |
| This connection has ended. You can no longer send messages. | 这段连接已结束，无法再发送消息。 |
| Type your response... (placeholder) | 输入消息… |
| Send (aria) | 发送 |
| Search & discover / Add by QR / Relationship Network / Dark mode / Language | 搜索与发现 / 扫码添加 / 关系网 / 深色模式 / 语言 |
| Search your contacts (placeholder) | 搜索联系人 |
| No conversations yet. / No conversations matched. | 还没有会话。 / 没有匹配的会话。 |
| Nudge / Set note / Chat background | 拍一拍 / 设置备注 / 聊天背景 |
| Delete / Cancel / Save | 删除 / 取消 / 保存 |
| Enter Chat (match cards) / Send Message | 进入聊天 / 发消息 |
| …nudged me / When someone nudges you, it reads: | …拍了拍我 / 别人拍你时显示为： |
| Notifications | 通知 |

Render-time bilingual branches (chat.js / square.js):

| en | zh | where |
|---|---|---|
| `[Photo]` | `[图片]` | list preview of image-only last message |
| `Start the conversation…` | `开始聊天吧…` | list preview placeholder |
| `Read` | `已读` | own-bubble receipt |
| `Yesterday HH:MM`, `M/D HH:MM` | `昨天 HH:MM`, `M月D日 HH:MM` | time separators (same-day `HH:MM` both) |
| `Just now`, `{n}M Ago`, `{n}H Ago`, `{n}D Ago`, locale date | `刚刚`, `{n} 分钟前`, `{n} 小时前`, `{n} 天前`, zh-CN date | row time |
| `Type your response...` / `Relationship ended — you can no longer send messages` | `输入消息…` / `关系已解除，无法再发送消息` | composer placeholder (normal / locked) |
| `Saving…` | `保存中…` | nudge Save busy label |

**English-only today** (no zh entry; shown verbatim in zh mode — iOS should decide whether to localize): `Partner` (row fallback name), `Waiting for them…`, `Delete Relationship` (aria), `Delete this relationship?`, `They will be notified and neither of you can send messages anymore.`, `Relationship deleted`, `Failed to remove connection`, `Failed to confirm`, `You are connected now`, `Confirmed. Waiting for them to confirm`, `No active connection`, `Failed to load conversations`, `Failed to load messages`, `Failed to send`, `Failed to send image`, `Uploading image…`, `Uploading…`, `Wallpaper set`, `Failed: {message}`, `Set a note`, `Note`, `Leave blank to clear`, `Note saved`, `Note cleared`, `No user selected`, `Expiring` / `{n}m left` / `{n}h left` (countdown badge), refund banner texts, the server-authored nudge line `"{A} nudged {B}{suffix}"`, and all server error/success messages (`You have confirmed, waiting for the other party to confirm...`, `You've both confirmed — you're friends now!`, `You've both confirmed — your relationship is official!`, `Cannot confirm in the current status`, `Confirmation window has expired`, `You already have a partner, cannot confirm a new partner match`, `Cannot end in the current status`, `This chat has ended, you cannot send new messages`, `Only confirmed chats can use Nudge`, `Only confirmed chats can set a background`). Header placeholder text `Chat Partner` / `Location` is never visible (overwritten before the overlay is shown). `Friend Candidate` / `Partner Candidate` / mode badges exist only in dead code.

Metadata display: partner school in the header and in search-result subtitles goes through `metaLabel(v)` → zh mode maps English university names (e.g. `University of Warwick` → 华威大学) for display only; the value itself stays English.

---

## 6. Cross-module links

**chat.js exposes on `window`:** `lastMsgText`, `renderSessions`, `stopSessionCountdown`, `loadSessions`, `checkRefundOnSessions`, `openSession`, `openSessionById`, `renderChatHeaderActions`, `applyChatBackground`, `editChatWallpaper`, `confirmRelationship`, `syncOpenSessionFromList`, `dissolveRelationship`, `showRefundBanner`, `refreshEnergyBalance`, `isChatDissolved`, `openChat`, `openChatPartnerProfile`, `closeChat`, `applyChatComposerState`, `loadChatHistory`, `openChatAvatarMenu`, `chatNudge`, `renderChatMessages`, `loadEarlierChatMessages`, `sendChatMessage`, `onChatImagePicked`, `clearChatPendingImage`, `sendChatImage`, `openChatImage`, `markChatRead`, `pollChatMessages`, `startChatPolling`, `stopChatPolling`, `refreshReadReceipts`.

**Calls into other modules:** `api`, `uploadImageFile`, `toast`, `confirmCard`, `openOverlay`/`closeOverlay`, `escapeHtml`, `safeUrl`, `flatEmptyIcon`, `getLang`, `metaLabel` (core/i18n); `formatPostTime` (square.js); `viewPartnerProfile`, `promptSetNote`, `loadMatchTab`, `openEnergyModal` (match/profile); `loadEnergyBar` (profile.js).

**Callers of chat.js:**
- `match.js` — `switchHomeView('chat')` → `loadSessions()`; `openConnectionChat(matchId)` (from "Enter Chat" on matched/relationship cards) → `switchHomeView('chat')` + `await loadSessions()` + `openSessionById(matchId)`; `renderPartnerProfile` / `promptSetNote` read `S.sessions` for the note; `resetMatchPlanState` is invoked from cleanup.
- `addfriend.js` — contact search over `S.sessions` (`runFriendSearch`, uses `lastMsgText`), `openChatFromSearch` → `openConnectionChat`; QR-add success and graph-node tap → `openConnectionChat`; graph closeness includes chats.
- `core.js` — SSE handlers call `pollChatMessages`, `loadSessions`, `refreshReadReceipts`; `switchTab`, 401 handler and `cleanupUserState` call `stopChatPolling`/`stopSessionCountdown`; swipe-back map `'chat-overlay' → closeChat`.
- `main.js` — Enter-to-send listener on `#chat-input`; pull-to-refresh on `#tab-match` gated to the Chat pane; nav auto-hide bound to `#home-chat-view`.
- `notifications.js` — `maybeSurfaceRefund` → `showRefundBanner`.
- `settings.js` — nudge suffix (`PUT /chat/nudge-suffix`).
- `profile.js`/`questionnaire.js` — after saving profile / finishing a questionnaire they set `S.homeView` and call `switchTab('match')`, which lands on the Chat pane.

---

## 7. Gotchas

1. **Two entry paths, two header behaviours.** Only `openSession()` (from the list / `openConnectionChat`) sets `S.chatSessionType`; the legacy `openChat()` path leaves it null and renders **no** confirm/dissolve controls and no wallpaper. iOS should always open conversations from a session object.
2. **Confirm response status check is effectively dead.** `confirmRelationship` looks for `status ∈ {CONFIRMED, MATCHED, RELATIONSHIP, FINAL, ACTIVE}` but the backend returns `WAITING`, `RELATIONSHIP_ROMANTIC` or `FRIEND_CONFIRMED`. The correct post-confirm header state comes from `loadSessions()` + `syncOpenSessionFromList()` (list says `sessionType:'confirmed'` → only `link_off` remains). Implement it that way; don't rely on the status list.
3. **Read-marking has three server-side paths.** `GET /messages` and `GET /messages/poll` both flip the partner's unread rows to read *as a side effect* (without emitting the SSE `read` event); `PUT /messages/read` emits `read` only when it still finds unread rows. Consequence: unread counts on the list drop as soon as history is fetched, and the partner's "Read" label usually appears via their periodic `refreshReadReceipts` (every 3rd poll) rather than instantly.
4. **Poll cursor must not be advanced by your own sends** — otherwise partner messages that arrived between the last poll and your send are skipped forever. Own messages are appended locally and de-duplicated by id when the next poll returns them.
5. **Poll with a deleted/unknown `afterId` returns an empty array** (server refuses to fall back to epoch-0). Keep the cursor in sync with what you actually rendered.
6. **Conversation-switch races (A9 guards).** Every async step snapshots `matchId` and discards results if `S.chatMatchId` changed; `closeChat` nulls `S.chatMatchId` so in-flight history/poll/send responses and the post-history `markChatRead`/`startChatPolling` no-op. Replicate with a per-conversation task cancellation.
7. **Busy-poll coalescing.** An SSE `message` arriving while a poll is in flight sets `chatPollPending`; the next poll starts immediately after the current one — never drop the event, because the in-flight response may predate the new message and the fallback poll is 30s away.
8. **Polling cadence**: 5s base; SSE up → every 6th tick (30s); read-receipt refresh every 3rd executed poll (15s without SSE, 90s with SSE, plus instant on SSE `read`). Session list refresh on SSE `message` is throttled leading+trailing 3s and happens regardless of which pane is visible. On `evicted` the client stops the stream and does **not** reconnect.
9. **Sending image + caption = two messages** (image first). The list preview for an image-only last message is `[Photo]`.
10. **Terminal statuses.** Sending is blocked client-side when `S.chatSessionStatus ∈ {DISSOLVED, EXPIRED, REJECTED}`; the server's 403 message (`This chat has ended…`) also locks the composer (matched by substring `has ended` / `cannot send` / `no longer`). Temp matches older than 48h are refused by the server even before the scheduler marks them EXPIRED — the countdown badge reaching `Expiring` means sending will fail.
11. **History is loaded in full** (all cursor pages, up to 100×50) and kept in memory; only the last 30 are rendered, older chunks are prepended on scroll-to-top from memory. There is no "load more from network".
12. **Time separators are computed against the previous rendered message**, including across appended batches; the gap threshold is 10 minutes; the first message of a rendered window always gets a separator.
13. **Wallpaper is private per viewer** and only settable/nudgeable on confirmed sessions (server 403 otherwise; the popover hides those items for temp sessions).
14. **Notes are private**, keyed by partner userId, surfaced as `partner.note` on sessions; the row shows nickname first and the note as a chip; the search list shows the note *instead of* the nickname.
15. **Countdown badge text differs from match.js** — chat.js has its own `formatRemainingShort` (`Expiring`/`{m}m left`/`{h}h left`, hours rounded **up**); the `window.formatRemainingShort` exported by match.js (`0m`/`3h`/`5m`) is a different function. Colour thresholds: pink under 1h, grey at 0.
16. **Row visibility rule**: temp rows need `remainingMs > 0`; expired ones fade (opacity .5) on the ticker until the next fetch removes them. Dissolved/expired/rejected sessions never come back from the API.
17. **Sorting**: server `updatedAt desc` (touched on message and nudge), then temp group first, then romantic-before-friend among confirmed — no mode icon on rows (`sessionModeBadge`, `.chat-countdown-badge`, `.chat-mode-tag` are dead code).
18. **Unread indicator is a dot, not a number**, and there is no aggregate unread badge on the bottom nav or the "Chat" segment (the bell badge is notifications only).
19. **Security**: all URLs pass `safeUrl` (rejects `javascript:`/`vbscript:`/`file:`/`blob:`/non-image `data:`), all text is HTML-escaped; user content is `data-no-i18n`. Native iOS doesn't need the escaping, but must not render arbitrary URL schemes.
20. **Dark mode specifics**: page #121110, rows' separator rgba(255,255,255,.09), temp row tint rgba(204,255,0,.12), partner bubble #292724/#eceae6, own bubble unchanged neon/black, fallback avatar #343230/#ddd, composer bg `surface-container-low` → #23211f, textarea → #1c1b19.
21. **Safe areas**: top bars are `56px/64px + inset` with the inset as padding; the chat pane pads `62px + inset`; the composer pads bottom with the bottom inset; the toast and plus popover offset by the top inset.
22. **`S.chatPendingFile` is not cleared on logout** and the draft text isn't cleared on conversation switch — minor; iOS should clear both per conversation.
23. **`remainingMs` is computed server-side at fetch time**; the client ticks it down locally; re-fetch (pull, SSE, close) resyncs.

---

## 8. Existing iOS code (apps/ios) vs this map

`/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/Network/ChatService.swift` already covers endpoints #1–#9 above with matching paths/bodies. `Models/Chat.swift` needs updating: `ChatSession.partner` should be `{id, note, nickname, avatarUrl, school, gender, age}` (not `PublicProfile`), `lastMessage` is a **Message object** (not a string), there is no `lastMessageAt` (use `lastMessage.createdAt`), `sessionType` values are `temp | confirmed` (not `permanent`), and `chatBackground: String?` + `updatedAt` are missing. `ChatViewModel` polls every 5s and loads only one page (limit 50) and marks read once — it lacks the render window, SSE-aware cadence, cursor rules (#4/#5), busy coalescing, read-receipt refresh, image sends, nudge lines, time separators, header confirm/dissolve, wallpaper and the conversation-switch guards described here. There is no SSE client in the iOS app yet (`/realtime/stream` with `?token=`).
