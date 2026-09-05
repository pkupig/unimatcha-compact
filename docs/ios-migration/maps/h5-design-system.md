# Unimatcha H5 — Design Token + Layout Skeleton Map (for iOS/SwiftUI rebuild)

Sources read in full (absolute paths):
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` (1268 lines — all custom CSS)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` (1924 lines — `<head>` with Tailwind config, full page/tab/overlay skeleton)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/vite.config.js` (no Tailwind build; **Tailwind is the Play CDN** `https://cdn.tailwindcss.com?plugins=forms,container-queries`, config inline in index.html; there is NO tailwind.config.js)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/public/manifest.webmanifest`, `public/loaders.html`
- Spot-reads of `src/modules/core.js` (toast, confirm/prompt cards, flatEmptyIcon, pull-to-refresh, nav auto-hide, swipe-back, sheet drag-close), `src/modules/i18n.js` (theme/lang/alias avatars), `src/modules/match.js` (mp-* markup, home swipe, plus menu), `src/modules/square.js` (cards, masonry, highlighter), `src/modules/chat.js` (session row/bubbles/header actions), `src/modules/notifications.js`, `src/modules/profile.js` (energy cells, hero facts, tickets, energy packages), `src/modules/settings.js`, `src/modules/questionnaire.js`, `src/modules/addfriend.js`, `src/modules/ads.js`, `src/main.js`, `src/state.js`.

Everything below is expressed as concrete pixel/hex values so it can be re-encoded as a SwiftUI theme (`Theme.swift`) without opening the JS.

---

## 0. One-paragraph identity

"Ivory & Ink" + neon. Light theme is an off-white page (`#f9f9f9`) with near-black text (`#1b1b1b`), ONE accent (**neon green `#CCFF00`** — always with black text/icon on it) and ONE danger/leave accent (**neon pink `#FF2EC4`**, always as outline/text, never a filled block except the "danger" confirm button). Warm-black dark theme (`#121110`). Almost no shadows, no card borders in feeds, 10px radius default, `Plus Jakarta Sans` everywhere, Material Symbols **Rounded** icons at weight 300, uppercase micro-labels with wide tracking (0.1–0.3em) as the main "editorial" device. Buttons press with `scale(0.98)`/`scale(0.95)`. Motion easing is one spring-ish curve `cubic-bezier(0.22, 1, 0.36, 1)`.

---

## 1. Color tokens

### 1.1 Tailwind theme colors (inline `tailwind.config` in index.html) — light palette

Any markup class `bg-X`, `text-X`, `border-X`, `ring-X`, `placeholder:text-X` resolves through this table.

| Token name | Hex | Where it is actually used |
|---|---|---|
| `neon` | `#CCFF00` | primary accent: CTA fills, active segment, active nav icon, switches on, progress fills, badges |
| `neon-pink` | `#FF2EC4` | leave/logout/danger outline buttons, liked heart, unread dot, required `*`, urgent countdown, error hints |
| `background` | `#f9f9f9` | page/body/tab ground, profile menu block |
| `surface` | `#f9f9f9` | full-page overlay ground; `bg-surface/80` = glass top bars |
| `surface-bright` | `#f9f9f9` | (alias) |
| `surface-dim` | `#dadada` | unused in markup (dark-mode rule references it) |
| `surface-container-lowest` | `#ffffff` | cards (feed cards, tickets, question option rows, questionnaire footer, chat input textarea, confirm cards) |
| `surface-container-low` | `#f3f3f3` | **soft-fill input background**, hover rows, icon buttons in comment bar, new-post options card, chat input bar |
| `surface-container` | `#eeeeee` | image placeholder behind feed images, note tag chip, expired countdown badge, anonymous person placeholder |
| `surface-container-high` | `#e8e8e8` | settings toggle OFF track, "UNDER REVIEW" chip, questionnaire footer border |
| `surface-container-highest` | `#e2e2e2` | progress-bar tracks, watermark text (`Q.03`) |
| `on-surface` | `#1b1b1b` | primary text |
| `on-background` | `#1b1b1b` | (alias, unused) |
| `on-surface-variant` | `#474747` | secondary text (subtitles, previews, labels) |
| `outline` | `#777777` | tertiary/muted text, icons in inputs, hints, timestamps, "cells", version line |
| `outline-variant` | `#c6c6c6` | borders (`/20` for hairlines), placeholders (`placeholder:text-outline-variant`), disabled chevrons |
| `primary` | `#000000` | pure-black text/borders (titles on auth, active auth tab underline, questionnaire progress fill, avatar ring on match card) |
| `primary-container` | `#3b3b3b` | hover state of neon buttons (`hover:bg-primary-container`) — desktop only |
| `primary-fixed` | `#5e5e5e` | unused |
| `primary-fixed-dim` | `#474747` | unused |
| `on-primary` | `#e2e2e2` | unused |
| `on-primary-container` / `on-primary-fixed` | `#ffffff` | unused |
| `on-primary-fixed-variant` | `#e2e2e2` | unused |
| `inverse-primary` | `#c6c6c6` | unused |
| `secondary` | `#5f5e5e` | unused |
| `secondary-container` | `#d6d4d3` | unused in markup (same hex as `.mp-toggle` off track) |
| `secondary-fixed` | `#c8c6c6`, `secondary-fixed-dim` `#acabab`, `on-secondary` `#ffffff`, `on-secondary-fixed` `#1b1c1c`, `on-secondary-fixed-variant` `#3b3b3b`, `on-secondary-container` `#1b1c1c` | unused |
| `tertiary` `#3a3c3c`, `tertiary-container` `#737575`, `tertiary-fixed` `#5d5f5f`, `tertiary-fixed-dim` `#454747`, `on-tertiary` `#e2e2e2`, `on-tertiary-container` `#ffffff`, `on-tertiary-fixed` `#ffffff`, `on-tertiary-fixed-variant` `#e2e2e2` | unused |
| `error` | `#ba1a1a`, `error-container` `#ffdad6`, `on-error` `#ffffff`, `on-error-container` `#410002` | unused (errors use neon-pink) |
| `inverse-surface` | `#303030`, `inverse-on-surface` `#f1f1f1`, `surface-tint` `#5e5e5e`, `surface-variant` `#e2e2e2` | unused |

### 1.2 Tailwind default palette colors the markup relies on

| Class | Value |
|---|---|
| `text-neutral-400` / `.nav-item` | `#a3a3a3` (square tab inactive, card author name, chat location, chat time) |
| `text-neutral-500` | `#737373` (chat "+" button, ad body) |
| `text-black`, `border-black`, `bg-black` | `#000000` |
| `text-white`, `bg-white`, `ring-white/90` | `#ffffff` (ring at 90%) |
| `bg-stone-50` (hover) | `#fafaf9` |
| `border-stone-100`, `bg-stone-100` | `#f5f5f4` (filter sheet header border + toggle-row dividers) |
| `bg-stone-200` | `#e7e5e4` (bottom-sheet grab handle) |
| `text-stone-400` | `#a8a29e` (filter sheet close X, min/max labels, hints) |
| `text-stone-500` | `#78716c` (enhance sub-copy) |
| `bg-black/40` | `rgba(0,0,0,.40)` (modal backdrops) |
| `bg-black/70` | `rgba(0,0,0,.70)` (remove-image X on comment thumb) |
| `bg-black/80` | `rgba(0,0,0,.80)` (QR scanner box) |
| `bg-black/90` | `rgba(0,0,0,.90)` (image viewer) |
| `bg-neon/10` | `rgba(204,255,0,.10)` (selected energy package, selected language row) |
| `bg-neon/15` | `rgba(204,255,0,.15)` (temp-session countdown badge) |
| `bg-neon-pink/15` | `rgba(255,46,196,.15)` (urgent countdown, REJECTED chip) |
| `border-neon/60` | `rgba(204,255,0,.6)` (comment-snippet left rule) |
| `border-outline-variant/10` | `rgba(198,198,198,.10)` (wide/text card border) |
| `border-outline-variant/20` | `rgba(198,198,198,.20)` (**standard hairline**: top bars, list rows, dividers) |
| `border-outline-variant/30` | `.30` (menus, graph box, QR box) |
| `border-outline-variant/40` | `.40` (avatar border, waiting button) |
| `border-outline-variant/50` | `.50` (language rows) |
| `border-outline-variant/60` | `.60` (pill segmented control frame) |
| `bg-surface/80` | `rgba(249,249,249,.80)` (glass top bars, with `backdrop-blur-xl` = 24px) |
| `bg-surface/95` | `.95` (dark-mode rule only) |

### 1.3 Hard-coded hex used in main.css / JS (not Tailwind tokens)

| Hex | Role |
|---|---|
| `#f3f3f3` | `.academic-input` bg, `.mp-extra` bg, hover on segments/plus-menu rows |
| `#f1f1f1` | chat bubble (theirs), `.notif-icon-plate` bg |
| `#efefef` | `flatEmptyIcon` muted box bg |
| `#e2e2e2` | `.ink-range` track, `.ink-switch` OFF track, chat avatar fallback bg, `.chat-countdown-badge.is-expired` bg |
| `#e6e6e6` | splash progress track |
| `#c6c6c6` | `.energy-cell--empty` border, `.poll-opt` border, unselected stage chip border |
| `#d6d4d3` | `.mp-toggle` OFF track |
| `#b6b6b6` | chat read receipt + time separator |
| `#b0b0b0` | `.mp-muted`, `.mp-lockline`, `.mp-extra--empty` |
| `#9a9a9a` | `.mp-label` (MATCH PREFERENCES / MATCH SETTINGS) |
| `#8a8a8a` | `.mp-sub` subtitle, `flatEmptyIcon` muted icon color |
| `#777777` | `.btn-tag` border, `.tag-chip.add-tag`, `.chat-mode-tag`, disabled range thumb |
| `#474747` | chat avatar fallback text, `.enhance-cost`, `.poll-opt-count` |
| `#3f3f3f` | text-card headline color |
| `#f6f1e7` | **text-card ivory background** |
| `#1b1b1b` | body text, official-badge base (`rgba(27,27,27,.4)`) |
| `rgba(0,0,0,.08)` | `#bottom-nav` border, `.home-mode-switch` border |
| `rgba(0,0,0,.07)` | `.session-row::after` separator, `.mp-sep` = `rgba(27,27,27,.07)` |
| `rgba(0,0,0,.12)` | chat plus-menu backdrop, `.ticket-divider` dashed |
| `rgba(0,0,0,.06)` | plus-menu card border |
| `rgba(0,0,0,.4)` | `.school-badge` bg |
| `rgba(0,0,0,.75)` | `.pinned-badge` bg |
| `rgba(0,0,0,.35)` / `.6` | legacy `.feed-image-overlay` / `.feed-like-badge` (unused by current cards) |
| `rgba(204,255,0,.28)` / `.5` | poll fill bar (normal / my vote) |
| `rgba(204,255,0,.35)` | `.mp-cta` glow shadow |
| `rgba(204,255,0,.15)` / `.12` | temp session row bg (light/dark) |
| `rgba(255,46,196,.06)` | `.mp-cta--leave` hover bg |
| `rgba(249,249,249,.3/.62/.92)` | gradient scrim over match-card cover photo |
| `rgba(249,249,249,.5)` | `.bottom-sheet-gradient` (edit-profile bottom fade) |
| `rgba(255,255,255,.92)` | bottom nav pill bg |
| `rgba(255,255,255,.95/.72/.88)` | profile hero text tiers (`.pf-primary/.pf-secondary/.pf-signature`) |

Anonymous-avatar pastel palette (`ALIAS_BG`, i18n.js; index = `(seed>>>16) % 16`): `#FDE68A #BFDBFE #FBCFE8 #BBF7D0 #DDD6FE #FED7AA #A5F3FC #E9D5FF #FEF08A #C7D2FE #FECACA #D9F99D #99F6E4 #F5D0FE #BAE6FD #FDBA74`. Emoji list (`ALIAS_EMOJI`, index = `(seed>>>8) % 16`): 🦦 🦊 🐦 🐨 🐼 🐆 🦩 🐤 🕊️ 🐻 🦜 🐰 🦭 🦢 🦡 🦘.

### 1.4 Dark palette (`html.dark`, warm black, R≥G≥B)

Dark mode = class on `<html>`, persisted in `localStorage.cl_theme` (`'light'|'dark'`, default light), toggled from Settings row or the Chat "+" menu, with a toast "Dark mode on/Light mode on". Neon green and pink are NOT changed in dark mode.

| Role | Light | Dark |
|---|---|---|
| Ground (`background`, `surface`, page, tab, splash, `bg-neutral-50/stone-50/gray-50`) | `#f9f9f9` | `#121110` |
| Card (`surface-container-lowest`, `bg-white`, `bg-neutral-100`, `bg-stone-100`, plus-menu card, poll option, bookmark item) | `#ffffff` | `#1c1b19` |
| `surface-container-low` (inputs, ptr disc, `.academic-input`, `.mp-extra`) | `#f3f3f3` | `#23211f` |
| `surface-container` (chat bubble theirs, notif plate, plus-menu hover) | `#eeeeee` | `#292724` |
| `surface-container-high` | `#e8e8e8` | `#2f2d2a` |
| `surface-container-highest` | `#e2e2e2` | `#363431` |
| Glass bar `bg-surface/80`,`/95` | `rgba(249,249,249,.8)` | `rgba(18,17,16,.85)` |
| Text primary (`on-surface`, `text-black`, `neutral-900/800/700`, inputs, `.mp-editlink`, `.poll-opt-label`, `.cpm-item`, `.btn-secondary`) | `#1b1b1b` / `#000` | `#eceae6` |
| Text secondary (`on-surface-variant`, `neutral-600/500`, `.poll-opt-count`) | `#474747` | `#aaa8a3` |
| Text tertiary (`outline`, `outline-variant`, `neutral-400`, `stone-400`, `.mp-sub`, `.mp-extra--empty`) | `#777` / `#c6c6c6` | `#8c8a85` |
| Borders (`outline-variant`, `outline`, `stone-100`, `neutral-100/200`, poll option) | `#c6c6c6` / `#f5f5f4` | `#343230` |
| `border-black` | `#000` | `#4b4945` |
| `.btn-secondary` border | `#000` | `rgba(255,255,255,.28)`; hover bg `#eceae6` text `#121110` |
| Bottom nav pill | `rgba(255,255,255,.92)` + border `rgba(0,0,0,.08)` | `rgba(28,27,25,.92)` + border `rgba(255,255,255,.08)` |
| `.home-mode-switch` | `#fff` + `rgba(0,0,0,.08)` | `#1c1b19` + `rgba(255,255,255,.08)`; segments text `#eceae6`; hover `#292724`; **active stays neon+black** |
| `.square-seg.active` | `#000` | `#eceae6` (`!important`) |
| Chat bubble mine | neon/black | neon/black (unchanged) |
| Chat avatar fallback | `#e2e2e2`/`#474747` | `#343230`/`#ddd` |
| Session separator | `rgba(0,0,0,.07)` | `rgba(255,255,255,.09)` |
| `.mp-sep` | `rgba(27,27,27,.07)` | `rgba(255,255,255,.09)` |
| `.mp-toggle` off | `#d6d4d3` | `#343230` |
| `.mp-card` | neon/black | **neon/black (kept — brand focus)** |
| Ticket notch fill | `#f9f9f9` | `#17171c` (**note: not the warm `#121110` — visible mismatch bug in dark**) |
| Ticket divider | `rgba(0,0,0,.12)` dashed | `rgba(255,255,255,.12)` |
| Splash bar track | `#e6e6e6` | `#343230` |
| `.dark .bg-neon` | — | forces `color:#000` (neon fills keep black text) |
| Toast | `#000` bg / `#fff` text | **unchanged** (black-on-near-black; only the 0 2px 8px shadow separates it) |
| Text-card ivory `#f6f1e7` | — | **unchanged** (intentional accent) |
| Q-nav current ring | `ring-black` | `ring-white` (`dark:ring-white`) |

---

## 2. Typography

### 2.1 Families
- **UI/body/headline/label/display**: `'Plus Jakarta Sans'` (Google Fonts variable, wght 200–800, italic too) → fallback `-apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', sans-serif`. There is one family for everything; Tailwind `font-headline/font-body/font-label/font-display` are all the same stack. **iOS**: bundle Plus Jakarta Sans (weights 300/500/600/700/800); CJK falls back to PingFang SC automatically.
- **Mono**: `'JetBrains Mono'` (400 only) — ticket code, connect code, `.chat-countdown-badge`, `.enhance-cost`, `.poll-opt-count`, `.monospace-timer`.
- **Icons**: `Material Symbols Rounded` variable (opsz 20–48, wght 100–700, FILL 0/1, GRAD −50–200). Global default axis: `FILL 0, wght 300, GRAD 0, opsz 24`, size 24px, forced via `.material-symbols-outlined { font-family:'Material Symbols Rounded' !important; ...}`. Filled variants (`FILL 1`) used for: active bottom-nav icon (wght 400), profile Energy bolt, like/match_result notifications, liked heart, payment check_circle, language check_circle, verified check.
- `.font-cute` (Comic Sans/Chalkboard SE… 500) is defined but **no longer used** (text cards retired it).

### 2.2 Size scale (Tailwind defaults + arbitrary values used)

| Class | px / line-height | Typical use |
|---|---|---|
| `text-[7px]`,`[8px]` | 7/8 | initials in 16px/24px avatar chips |
| `text-[9px]` | 9 | badges (`school/official/sponsored/pinned` = 0.5625rem), BETA, footer ©, min/max labels, chat read receipt |
| `text-[10px]` | 10 | **micro-label tier**: form labels, section headers, timestamps, pill buttons in headers, nav labels (hidden), hints |
| `text-[11px]` | 11 | card author name, comment snippet, sub-copy, poll count |
| `text-xs` | 12 / 16 | segments, chips, buttons in sheets, session preview, price |
| `text-[13px]` | 13 | small-card title, plus-menu items, poll label, pf-school/signature |
| `text-sm` | 14 / 20 | body copy, list rows, inputs, `.btn-cta`, toast, `.mp-cta` |
| `text-[15px]` | 15 | session name, notification title, chat bubble |
| `text-base` | 16 / 24 | inputs (auth), wide-card title, modal titles, empty-state title |
| `text-lg` | 18 / 28 | card titles (large/text card), overlay modal titles, confirm card, question options, age display |
| `text-xl` | 20 / 28 | overlay page titles (Notifications, Settings, Friends…), question text, section h2 |
| `text-2xl` | 24 / 32 | new-post title input, wizard step titles, energy package number, banned title, match name |
| `text-3xl` | 30 / 36 | auth headline "Welcome Back", notification detail title |
| `text-4xl` | 36 / 40 | contact icon, banned icon, match placeholder person icon |
| `text-5xl` | 48 / 1 | questionnaire watermark `Q.03` |
| `text-[26px]` (`.mp-title`) | 26 | match plan title |
| `text-[28px]` | 28 | profile name |
| `text-[34px]` | 34 | splash wordmark |
| `min(48px,12vw)` (`.mp-num`) | ≤48 | countdown digits |
| `clamp(1.05rem,5.5vw,1.45rem)` | 16.8–23.2 | text-card headline |

### 2.3 Weights
`font-light` 300 (add icon in new post, ad body), `font-medium` 500, `font-semibold` 600 (pf-primary, poll label), `font-bold` 700 (default for labels/buttons), `font-extrabold` 800 (titles, CTAs), `font-black` 900 (settings section headers, watermark — **font only ships up to 800, renders as 800**).

### 2.4 Tracking (letter-spacing)
`tracking-tighter` −0.05em (big headlines), `tracking-tight` −0.025em (titles), `tracking-wide` .025em (list-row labels), `tracking-wider` .05em (chips/segments), `tracking-widest` .1em (**default for uppercase micro-labels & buttons**), arbitrary: `[0.02em]` (square segs), `[0.04em]` (home segs, time sep), `[0.06em]` (mp cells), `[0.08em]` (`.btn-tag`, `.tag-chip`, badges, mp-editlink), `[0.15em]` (auth labels, q-mode badge), `[0.18em]` (splash wordmark, `.mp-cta`), `[0.2em]` (section headers, wizard step, primary CTAs in modals), `[0.26em]` (`.mp-label`), `[0.3em]` (splash Skip, "Confirm Profile", "This Week's Match", `.mp-card-label`, version), `[0.35em]` (BETA). Countdown digits −0.02em.

### 2.5 Line heights
`leading-none` 1, `leading-tight` 1.25, `leading-snug` 1.375, `leading-relaxed` 1.625 (body paragraphs), chat bubble 1.45, `.mp-sub` 1.65, `.pf-primary/.pf-secondary` 1.75, `.mp-extra` 1.6, text-card 1.6.

### 2.6 Canonical type styles (reuse these names in Swift)
- **PageTitle** (overlay header): 20px / 700 / tracking −0.025em / on-surface.
- **SheetTitle** (bottom sheet header): 16px-ish default (`font-headline font-bold tracking-tighter text-black`, no size class → 16px).
- **SectionLabel**: 12px / 800 / +0.2em / uppercase-ish (`text-xs font-extrabold tracking-[0.2em] text-black` in filter sheet; `text-xs font-black tracking-[0.2em] text-outline` in settings).
- **MicroLabel** (form labels): 10px / 700 / +0.1em (widest) / on-surface-variant (or `+0.15em` outline on auth, `+0.2em` on setup).
- **RowLabel** (settings/profile rows): 14px / 500 / +0.025em / on-surface.
- **Body**: 14px / 400 / 1.625 / on-surface-variant.
- **Hero headline**: 30px / 800 / −0.05em / primary.
- **CardTitle**: 18px / 700 / −0.025em; small-card 13px / 700 / leading-snug / 2-line clamp.
- **Badge**: 9px / 700–800 / +0.08–0.1em / uppercase.

---

## 3. Radius, shadow, blur, spacing

### 3.1 Radius
Tailwind config **overrides every `rounded-*` step to 10px** (`sm, DEFAULT, md, lg, xl, 2xl, 3xl` → `10px`; `none` 0; `full` 9999px). So `rounded-t-xl` (filter sheet) and `rounded-t-2xl` (q-nav sheet) are **10px**, not 12/16. Explicit arbitrary radii in use:

| Value | Where |
|---|---|
| 3px | `.energy-cell` |
| 5px | `.mp-day-badge` |
| 6px | `rounded-[6px]` all feed cards, `.neon-check` box |
| 8px | `rounded-[8px]` EVENT chip, UNDER REVIEW/REJECTED chips |
| 10px | default everything: buttons, inputs, chips, modals, badges, bubbles' small corner is 6 |
| 11px | `.mp-day--today` |
| 12px | `rounded-[12px]` notif icon plate, `.mp-cta`, edit cover, language rows, pd action menu, temp session group corners |
| 14px | `rounded-[14px]` plus-menu card, new-post options card, ticket card, notif detail plate, chat image |
| 16px | `rounded-[16px]` language dialog card |
| 18px | `rounded-[18px]` chat input textarea, empty-state icon box, chat bubbles (with 6px "tail" corner) |
| 20px | `rounded-[20px]` ticket pass card |
| 22px | `rounded-[22px]` splash logo |
| 24px | `rounded-t-[24px]` profile menu block |
| 24/28/22/28 ÷ 28/22/28/24 | `.mp-card` hand-drawn ellipse corners (alt = mirrored) |
| full | avatars, nav pill, segmented pills, header pill buttons (Save), search pills, switches, status orb |

### 3.2 Shadows (few, deliberate)
| Where | Value |
|---|---|
| `shadow-sm` (wide/text feed cards) | `0 1px 2px 0 rgba(0,0,0,.05)` |
| `.feed-card`, `.bookmark-item` | `0 1px 2px rgba(0,0,0,.05/.04)` |
| `shadow-2xl` (all modal cards, sheets, action menus) | `0 25px 50px -12px rgba(0,0,0,.25)` |
| `#toast` | `0 2px 8px rgba(0,0,0,.2)` |
| plus-menu card | `0 10px 32px rgba(0,0,0,.16)` |
| `.mp-cta` | `0 8px 20px rgba(204,255,0,.35)` (neon glow) |
| `.mp-toggle` knob | `0 1px 3px rgba(0,0,0,.25)` |
| profile avatar | `0 6px 20px rgba(0,0,0,.3)` + ring 3px white/90 |
| `.pass-card` | `0 18px 48px rgba(0,0,0,.18)` |
| profile hero text | `text-shadow 0 1px 6px rgba(0,0,0,.45)` |
| `.mp-num` | 8-direction white 2px/1.5px text-shadow outline |
| bottom nav, FAB, top bars | **none** |

### 3.3 Blur
`backdrop-blur-xl` 24px (all glass top bars `bg-surface/80`), bottom nav 20px, `.glass-header` 24px, modal backdrops `backdrop-blur-[2px]` (sheets, add-interest, verify, confirm cards, lang dialog) or `backdrop-blur-sm` 4px (contact, report, questionnaire cards), `.school-badge/.official-badge` 4px, profile blur mask 12px, chat bg `blur(9px) brightness(.93)`, match card cover fallback `blur-2xl` (40px) + `scale-125`.

### 3.4 Spacing rhythm (Tailwind 4px scale)
- **Page gutter**: `px-6` = 24px (auth, setup, questionnaire, all overlay bodies, profile menu, filter sheet, settings uses `px-5` = 20px, tickets `px-5`). Square feed: `px-1.5` = 6px. Post detail: `px-3` = 12px. Chat messages `px-4` = 16px. Match plan pane 30px (card bleeds to 8px from edge).
- **List row**: `py-4` = 16px with 1px hairline (`border-outline-variant/20`) between; icon→label gap `gap-4` 16px. Settings sections `mb-10` 40px, header `mb-3` 12px.
- **Form field stack**: `space-y-8` 32px (auth), `space-y-7` 28px (edit profile), label→input `mb-2` 8px; wizard title→sub `mb-2`, sub→field `mb-10`.
- **Sections in setup**: `space-y-16` 64px; section heading `space-y-10` 40px.
- **Modal card padding**: `p-6` 24px (default) / `p-8` 32px (contact/report).
- **Header inner gap**: back→title `gap-4` 16px (`px-6`); square/post-detail headers use `px-3/px-4` and 36px circular tap targets.
- **Feed**: 6px gaps both axes; 12px page gap between horizontally-swiped pages.
- **Chat**: row `mb` 12px, avatar↔bubble 8px, time separators `14px 0 10px`.
- **Empty state**: icon box `mb-6` 24px, title→sub `mt-2`, retry `mt-6`; container `pt-24`/`py-24`.

---

## 4. Motion

- **Master easing**: `cubic-bezier(0.22, 1, 0.36, 1)` ("snappy spring"). Durations: overlay fade `0.25s ease` (opacity+visibility); bottom-sheet slide `0.32s` spring; side sheets `.slide-left/.slide-right` `0.32s` spring (defined; currently no overlay uses them); square ink underline `0.28s`; pinned seg `0.24s/0.28s`; post-detail chrome hide `0.26s` spring + opacity `0.2s`; bottom nav hide `0.3s` spring; profile hero height / blur mask `0.45s` spring; poll fill `0.4s` spring; plus-menu in `0.18s` (`translateY(-6px) scale(.98)` → identity, origin top-left); PTR snap `0.3s` spring; swipe-back commit `0.2s ease-out` to `translateX(100vw)`, cancel `0.25s` spring.
- **Press feedback**: `active:scale-95` (icon buttons, pills) / `active:scale-[0.98]` (wide buttons, cards) / `active:scale-90` (small circular icons) / `active:scale-[0.99]` (list cards, poll opts) / `active:opacity-70` (session rows); durations `duration-150/200` (0.15/0.2s).
- **Hover** (desktop only, ignore on iOS): neon buttons `filter: brightness(.95/.96)` or `hover:bg-primary-container`; outlined → black fill; segments `#f3f3f3`.
- **Keyframes**: `orbPulse` 2.4s (scaleY 1→.72, opacity .4→.28), `orbGlow` 2.2s box-shadow 2px→7px; `slideDown` toast 0.3s (from `translateY(-20px)` opacity 0); `ptr-spin` 0.7s linear; `splash-in` 0.7s spring (from `translateY(14px)`); `splash-logo` 2.6s float ±6px; `splash-bar` 1.4s sweep (`translateX(-110%)→320%`, 40% wide fill); `cl-pulse` 1.8s (scale 1→1.12, opacity 1→.55) on match-card avatar ring; `group-hover:scale-105 duration-700` on large-card images (desktop).
- **Splash**: shown 3s (`setTimeout(hideSplash, 3000)` in main.js), then `opacity 0` over 0.6s, then `display:none` → `checkUserState()`.
- **Overlay open/close**: pure fade (0.25s) for full-page overlays; bottom sheets fade backdrop + slide sheet.

---

## 5. Safe areas & status bar

- `viewport-fit=cover`, `apple-mobile-web-app-status-bar-style: black-translucent` → content extends under the status bar; `theme-color #f9f9f9`.
- CSS vars: `--sat: env(safe-area-inset-top)`, `--sab: env(safe-area-inset-bottom)`.
- Top bars get `padding-top: sat` via the class-selector rule `.fixed.top-0, .sticky.top-0, .overlay > header.shrink-0, .overlay > * > header.shrink-0`; bars with fixed heights are re-declared: `h-14` → `calc(3.5rem + sat)` = **56 + sat**, `h-16` → **64 + sat**. Square's header has no h-class → `44 (h-11 inner) + sat`.
- Content after a `fixed` top bar gets `margin-top: sat` (`.fixed.top-0 ~ main`); content after `sticky` bars does not (sticky is in flow).
- Elements NOT covered by the class rule and fixed individually: `#splash-skip` top `32 + sat`; `#partner-profile-content .pp-back` top `16 + sat`; `.ptr-indicator` top `sat`; `#toast` top `16 + sat`; `#chat-plus-menu .cpm-card` top `56 + sat`; `#profile-hero` height `400 + sat`; `.profile-top-spacer` `88 + sat`; `#home-chat-view` padding-top `62 + sat`; `.home-match-pane` padding-top `56 + sat` (plan state `64 + sat`); `#pd-scroll` padding-top `64 + sat`; square FAB drag min-top = header bottom + 8.
- Bottom: `#bottom-nav` bottom `14 + sab`; `.pb-safe` = `sab` (chat input bar); `#post-detail-overlay > footer` padding-bottom `sab + 8`; `.home-match-pane.match-plan` padding-bottom `96 + sab`.
- **Bottom sheets must NOT carry `top-0`** (the rule would inject a status-bar-high white band above the grab handle).

---

## 6. Z-index ladder (what covers what)

| z | Element |
|---|---|
| 0 | `.milestone-bg`, `#chat-bg`, `#profile-hero` |
| 10 | `#profile-scroll`, `.profile-blur-mask` |
| 39 | `.ptr-indicator` (slides out from **under** the top bar) |
| 40 | `.page` layers; match-tab top bar (`z-40`) |
| 41 | `[id^="tab-"]` panels |
| 50 | most overlays (`.overlay` default), square header, square FAB, `#bottom-nav`, page top bars (`z-50`) |
| 60 | add-interest, verify, friend-hub, notif-detail, content, tickets, contact, report, questionnaire-cards |
| 68 / 69 | chat plus-menu backdrop / card |
| 70 | partner-profile, ticket-detail, q-nav sheet |
| 80 | chat image viewer |
| 100 | new-post overlay, energy purchase |
| 120 | `appCardBackdrop` (confirm/prompt cards) |
| 130 | `.pd-cm-menu` (post-detail action menu) |
| 999 | `#toast`, language dialog |
| 9999 | `#splash` |

DOM order matters for equal z: `#bottom-nav` comes after the three tabs (covers them) and before overlays; `#square-search-overlay` sits above nav but below `#post-detail-overlay` (both z-50, later in DOM wins).

---

## 7. Page skeleton

### 7.1 `.page` layers (fixed, full-screen, `display:none` unless `.active`; bg `#f9f9f9`, column flex, `overflow-y:auto`)

| id | Purpose | Top bar | Body |
|---|---|---|---|
| `#splash` (not a `.page`; z-9999) | Boot splash 3s | absolute Skip top-right (10px/700/+0.3em/uppercase/outline) | centered: 76px logo (`/icons/icon-192.png`, r22, float anim) `mb-8`; wordmark "UNIMATCHA" 34/800/+0.18em/primary; tagline 13px on-surface-variant "One thoughtful match, every week." `mt-4`. Bottom (`bottom-16`): 120×3 progress track `#e6e6e6` with sweeping 40% neon fill, `gap-5`, "BETA" 9/700/+0.35em/outline. Bg `#f9f9f9`. (`splash-fallback` element referenced by the boot watchdog **does not exist in the DOM**.) |
| `#page-auth` | Sign in / Register | none | `main` centered `px-6 py-12`; `login_bg.png` bottom, `h-64`, `opacity-10`; `.auth-container` max-w 420. Tab switcher: two 12px/700/+0.2em buttons `space-x-12`, active = `border-b-2 border-primary text-primary`, inactive `border-transparent text-on-surface-variant`, `mb-16`. Form `space-y-12`: title 30/800/−0.05em + sub 14px; fields `space-y-8`: label 10/700/+0.15em/outline `mb-1`, row = 24px icon (`mail`/`lock`/`pin`, outline, turns primary on focus-within) + soft-fill input 16px (`bg-surface-container-low rounded-[10px] px-3 py-2.5`, focus ring 1px neon). Register has "Send code" `btn-secondary text-[10px] px-3 py-2` beside the code field + hint 10px. "Forgot Password?" 10/700/widest/outline right-aligned. CTA `.btn-cta`. Footer `py-8`: Terms / Privacy 10/700/widest on-surface-variant, © line 9/500/+0.1em outline-variant. |
| `#page-banned` | Suspended | none | centered `space-y-8`: 80px circle `border-2 border-outline` with `block` icon 36px; title 24/800/−0.05em; body 14px relaxed max-w-xs; **Log Out** = full-width transparent, `border-2 border-neon-pink text-neon-pink py-5 rounded-[10px] 10px/700/+0.3em`, hover fills pink w/ black text. |
| `#page-profile-setup` | Onboarding | fixed h-16 glass (`bg-surface/80 backdrop-blur-xl border-b outline-variant/20 px-6`): back arrow (`p-2 -ml-2`), centered title 16/700/tight, right spacer `w-10` | `main pt-24 pb-12 px-6 max-w-2xl`. **Wizard** (`#setup-wizard`): step counter "1 / 4" 12/800/+0.2em/outline + 2px track `bg-surface-container-highest` with neon fill (`w:25%`, 0.3s) `mb-12`; each step: h2 24/800/tight `mb-2`, p 14px on-surface-variant `mb-10`, label 10/700/+0.2em on-surface-variant (+ pink `*`) `mb-2`, soft-fill input at **18px** (`text-lg`); gender = 2×2 grid `gap-2` buttons `py-4 px-4 rounded-[10px] border border-outline-variant text-sm tracking-wider` (selected → `bg-neon text-black`); birthday `type=date` soft-fill. Footer row `mt-14 gap-4`: Back (text 12/700/widest on-surface-variant, hidden on step 1) + Next `.btn-cta flex-1`. **Rest** (`#setup-rest`, `space-y-16`): avatar circle 128px dashed `border-2 border-outline-variant` on white with `add_a_photo` 30px + "Upload" 10px; section heads = h2 20/700/tight + hairline (`h-px bg-outline-variant opacity-30 ml-6 flex-grow`); **selects here are still UNDERLINE style** (`border-b border-outline`, `py-3 text-lg`, focus `border-b-2 border-primary`) except Grade which is soft-fill with `expand_more` 18px chevron; Looking-For = 3-col `py-3` outline buttons (Anyone preselected neon); interest suggestion chips `px-4 py-2 rounded-[10px] border outline-variant 12px widest`; tag input soft-fill 14px + **Add** neon `px-5 py-2.5 rounded-[10px] 12/700/widest`; bio textarea `p-6 text-sm italic placeholder:text-outline` + counter 10px right; **Confirm Profile** neon `py-5 rounded-[10px] 14/800/+0.3em`; consent line 10px outline centered. |
| `#page-questionnaire` | Questionnaire | fixed h-16 glass with border: back (`p-2`) left, `grid_view` right | `main pt-20 pb-24 px-6 max-w-2xl`; mode badge `inline-flex gap-1.5 px-3 py-1 rounded-[10px] bg-neon text-black 10/700/+0.15em` + 14px `auto_awesome`/`group` icon `mb-4`; "Assessment Progress" 12/700/+0.2em on-surface-variant vs `03 / 12` 18/800 (slash in outline-variant); 2px track `bg-surface-container-highest` with **black** fill (`bg-primary`, 0.5s); watermark `Q.03` 48px/900 `text-surface-container-highest opacity-20` at `-top-10 -left-4`; question 20/700/tight/snug; options `space-y-4`: each `label p-6 bg-white border-b-2 border-transparent` (hover primary), text 18/500, radio 20px `border-2 border-outline rounded-full`. **Footer fixed bottom** `bg-white border-t border-surface-container-high px-6 py-6`: Previous (14/700/widest on-surface-variant + `arrow_back` 14px) / Next (`bg-neon text-black px-10 py-4 rounded-[10px] 800 +0.2em` + `arrow_forward`). Swipe-back from left edge returns home. |
| `#page-home` | Empty base layer; real content is the three `tab-*` panels | — | — |

### 7.2 Tab panels (`[id^="tab-"]`: fixed inset-0 z-41, bg `#f9f9f9`, `overflow-y:auto`, `overscroll-behavior-y:none`; only one `display:block` at a time; `#page-home` active underneath; bottom nav shown only here)

**`#tab-match`** (= Home; `overflow:hidden`, hosts a horizontal track)
- Top bar: `fixed top-0 z-40 bg-surface/80 backdrop-blur-xl h-14 px-2 flex items-center gap-1`, **no border** → 56 + sat tall. Left: 40px circle button `add` icon 22px black (opens Chat "+" menu). Center: `#home-mode-switch` (`.home-mode-switch flex-1 min-w-0 max-w-[268px] mx-auto`) — see §8.6. Right: 40px circle `notifications_none` 22px + `#notif-badge` (absolute top-0.5 right-0.5, `min-w-[16px] h-4 px-1 bg-neon text-black 10/700 rounded-full`).
- `#home-track`: flex row, `gap 12px`, height `100dvh`, translated by JS; three `.home-pane` (`flex 0 0 100%`, each own vertical scroll, `-webkit-overflow-scrolling:touch`):
  - `#home-chat-view` — `padding-top: 62 + sat`, `pb-28` (112px), `max-w-2xl`; children `#chat-banner`(hidden), `#chat-sessions-temp`, `#chat-sessions-confirmed`, `#chat-sessions-empty`.
  - `#home-match-romantic`, `#home-match-friend` — `.home-match-pane`: column flex, `align-items:center`, padding `calc(56px + sat) 24px 13rem`; inner `.match-content` (`w-full flex flex-col items-center justify-center`, auto vertical margins → centered but scroll-safe). When idle/searching the pane gets `.match-plan` (see §9).
- Horizontal swipe: track follows finger (`dx`), rubber-band ×0.3 at ends, ≥70px release snaps to neighbour, else springs back; tapping a segment animates the same track. Pull-to-refresh only when Chat view active (movers = `#home-chat-view`). Nav auto-hide bound to `#home-chat-view` scroll.

**`#tab-square`**
- Header `fixed top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20`; inner row `h-11` (44px) `px-4` centered → total 44 + sat. `#square-tabs` (`relative flex gap-8`): two `.square-seg` buttons "Recommend" / "Campus Wall" — `text-xs font-bold tracking-[0.02em] text-neutral-400 pb-1.5`, active → `#000`; `#square-tab-ink` = 2px×width neon bar, `border-radius 2px`, bottom 0, animates left/width 0.28s. `#square-seg-pinned` "Pinned": absolute `left:100%; margin-left:16px; bottom:0; font-size:10px; padding-bottom:9px` (baseline-aligned by JS), hidden (`opacity 0, translateX(-6px)`) unless `#square-tabs.show-pinned`. Right: `#square-search-btn` absolute `right-3` 36px circle, `search` icon 21px.
- `main pt-[50px] pb-24 px-1.5 max-w-2xl` (+ `margin-top: sat`); `#square-pager` overflow hidden → `#square-track` flex `gap:12px` with three `section.square-feed-grid` pages (`w-full shrink-0 grid grid-cols-2 grid-flow-row-dense items-start`): `#square-feed-recommend`, `#square-feed-campus_wall`, `#square-feed-pinned` (`.square-pinned-page`).
- `#square-fab`: `fixed bottom-52 (208px) right-5 (20px) w-14 h-14 bg-neon text-black rounded-full`, `add` 24px, no shadow, `active:scale-90`, `touch-none`; **draggable** (position persisted `localStorage.cl_fab_pos`, clamped 8px from edges and ≥ header bottom + 8), hidden on Pinned page.
- Swipe between pages: same physics as home (0.3 rubber band, 70px snap, 12px gap). Pull-to-refresh movers = `main`. Re-tapping the Square nav item scrolls to top and reloads only the current page; each page keeps its own scroll offset.

**`#tab-profile`**
- No top bar. `#profile-hero` absolute top-0 full width, height `400 + sat`, `overflow:hidden`, `pointer-events:none`: `#profile-bg` cover image (`object-[center_30%]`, default grey SVG) + `.profile-blur-mask` (12px backdrop blur, mask gradient `rgba(0,0,0,.4) 0% → .72 42% → black 100%` i.e. more blur toward bottom; opacity 1→0 as user pulls down 0→140px, 0.45s spring back).
- `#profile-scroll` absolute inset-0 `overflow-y:auto z-10`: `.profile-top-spacer` (`88 + sat`), then `section.profile-hero-text px-6 mb-[86px]` (white text + `0 1px 6px rgba(0,0,0,.45)` shadow): row `items-end gap-4` = `#profile-avatar` 92px circle white bg, `ring-[3px] ring-white/90`, shadow `0 6px 20px rgba(0,0,0,.3)` + name block (`#profile-name` 28/800/tight truncate + `#verify-btn` + `#profile-meta` mt-1.5); `#profile-facts mt-6` (`.pf-primary` 14/600/1.75 white .95 with `.pf-sep` "·" (margin 0 8px, opacity .45); `.pf-secondary` 12/500/1.75 white .72 `mt 5`; `.pf-signature` 13/1.65 white .88 `mt 14` 2-line clamp; `.pf-school` 13/700/+0.02em **neon**). Then the menu block: `bg-background rounded-t-[24px] -mt-6 px-6 pt-7 pb-32 max-w-lg` — rows `py-4 border-b border-outline-variant/20 gap-4`: 24px icon on-surface + 14/500/wide label + `chevron_right` in outline-variant. Rows: Energy (`flash_on` FILL 1, `#energy-display` cells right-aligned), My Tickets (`confirmation_number`), Edit Profile (`person_outline`), Contact Us (`mail_outline`), Settings (`settings`). Footer "Unimatcha v2.4.0" 10/500/widest outline centered `mt-10`.
- Pull-down stretches hero height 1:1 with finger (rubber-banded, max 180) and fades the blur mask.

### 7.3 Bottom navigation `#bottom-nav`
- Floating pill: `position:fixed; left:50%; transform:translateX(-50%); bottom: 14px + sab; padding 6px 14px; gap 18px; border-radius 9999px; background rgba(255,255,255,.92); backdrop-filter blur(20px); border 1px solid rgba(0,0,0,.08); box-shadow none`. Height = 62px (50 + 12), width ≈ 214px.
- Items (`.nav-item`): 50×50 circles, icon-only (`Match`=`chat_bubble`, `Square`=`eco`, `Profile`=`person`; labels present in DOM but `display:none`), icon size **33px**, inactive color `#a3a3a3` (wght 300, FILL 0), active = **neon `#CCFF00` icon, FILL 1, wght 400, no background**, `font-weight:700` (irrelevant for icon).
- Visible only on `page-home` (`display:flex`), hidden on other pages and never inside overlays (overlays sit above it anyway).
- **Auto-hide**: bound to scroll of `#home-chat-view`, `#tab-square`, `#tab-profile`: `scrollTop < 40` → always shown; `dy > 6` → `.nav-hide` (`translateX(-50%) translateY(calc(100% + 24px)); opacity 0`, 0.3s spring); `dy < -6` → shown.
- Dark: bg `rgba(28,27,25,.92)`, border `rgba(255,255,255,.08)`.

### 7.4 Top-bar variants (summary)
| Variant | Height | Styling | Used by |
|---|---|---|---|
| Home bar | 56 + sat | glass, no border, `px-2`, 40px round icon buttons, pill segmented centered | `#tab-match` |
| Square bar | 44 + sat | glass + hairline, centered tabs, 36px search button right | `#tab-square` |
| Overlay page bar (left-aligned) | 64 + sat | glass + hairline (or 1px div), `px-6 gap-4`: `arrow_back` 24px + title 20/700/tight | notifications, notif-detail, settings, content, tickets, ticket-detail, friend-hub, energy purchase, milestone (title centered 14px there) |
| Overlay page bar (Cancel / Title / Save) | 64 + sat | `px-6 justify-between`: "Cancel" text (16px or default, 500, on-surface-variant) — centered title 18/800/tight — Save neon pill (`rounded-full px-5 py-2 12/700/widest`, `disabled:opacity-50`) | edit-profile; new-post (Cancel / **Publish** `px-6 py-2 rounded-[10px]`) |
| Chat bar | 64 + sat | glass + hairline `px-6`: `arrow_back` + 36px partner avatar + name 14/700 + location 10px widest neutral-400; right `#chat-header-actions` | chat |
| Post-detail bar | 64 + sat | `px-3`, 36px round back (`-ml-1.5`), author (avatar+name+school) in header, `more_horiz` 22px right; hides on scroll | post-detail |
| Search bar | 64 + sat | `px-4 gap-3`: back 24px + search pill (`bg-surface-container-low rounded-full px-4 py-2.5`, `search` 19px outline, input 14px, clear `close` 18px) + **Search** neon `rounded-full px-4 py-2.5 12/700/widest` | square-search |
| Bottom-sheet header | auto | centered grab handle `w-10 h-1 bg-stone-200` (`mb-4`; q-nav `rounded-full mb-3`), then row `px-6`: close X (stone-400) — absolutely-centered title — Save pill; `border-b border-stone-100 bg-white`, `pt-3 pb-4` | filter sheet |

---

## 8. Component library

### 8.1 Buttons
| Name | Spec |
|---|---|
| `.btn-cta` (primary, full width) | `display:block; width:100%; bg #CCFF00; color #000; radius 10px; padding 20px 24px; 14px/700; letter-spacing .1em; transition bg .2s/transform .15s`; hover brightness .95; `active:scale(.98)`; `disabled:opacity .5`. Used: Sign In/Register/Next, Add Interest, Submit verification, energy Pay, Refresh in match error. |
| Neon block variants (markup) | `bg-neon text-black py-5 rounded-[10px] 14/800/+0.3em` (Confirm Profile); `py-4 rounded-[10px] 10/700/+0.2em` (Send Email, Submit Report); `px-10 py-4 rounded-[10px] 800 +0.2em` (questionnaire Next); `px-4 py-2 rounded-[10px] 11/700/widest` (Start on questionnaire cards); `px-6 py-2 rounded-[10px] 14/700/widest` (Publish); `px-5 rounded-[10px] 12/700/widest` (Add code / Add interest inline); chat confirm `px-3 py-2 rounded-[10px] 10/700/widest` w/ 14px icon. |
| Neon pill (header Save) | `bg-neon text-black rounded-full px-5 py-2 font-headline text-xs font-bold tracking-widest active:scale-95 disabled:opacity-50` (`px-4 … text-[10px]` for Nudge save; `px-4 py-2.5` Search). |
| `.btn-secondary` (outlined black) | inline-flex centered; transparent; `color #000; border 1px #000; radius 10; padding 12px 24px; 12px/700; ls .1em`; hover black fill/white text; `disabled .5`. Small variant in markup adds `text-[10px] px-3 py-2`. Dark: text `#eceae6`, border white/28%. |
| `.btn-danger` / pink outline | transparent, `color #FF2EC4; border 1px #FF2EC4; radius 10; padding 12 24; 12/700/.1em`; hover pink fill + black text. Markup versions: **Log Out** `border-2 border-neon-pink text-neon-pink py-5 rounded-[10px] 14/700/widest` (settings) or `10/700/+0.3em` (banned); **Leave Pool** = `.mp-cta--leave` (see §9). Confirm-card danger OK = `bg-neon-pink text-white`. |
| Outlined neutral (secondary action in modals) | `w-full border border-outline-variant py-4 (or py-3.5/py-3) rounded-[10px] 10/700/+0.2em` ("Close", "Maybe Later" in on-surface-variant, confirm-card Cancel `12/700/widest text-on-surface`). |
| Text buttons | `font-headline text-[10px] font-bold tracking-widest text-outline hover:text-primary` (Forgot password, Cancel reply); 12px/widest on-surface-variant (Back, Previous 14px). |
| Link-underline button | "Retry": `text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-black pb-1`; "+ Add option": `text-[11px] font-bold tracking-widest text-on-surface-variant underline underline-offset-4`. |
| Icon buttons | 40px circle (home bar, chat input), 36px circle (post-detail header/footer, square search), `active:scale-90/95`, hover `bg-surface-container-low`. Comment-bar icons: `bg-surface-container-low text-outline` 36px with 19px icon; send = `bg-neon text-black` 36px `arrow_upward` 19px (chat: 40px, 20px). |
| `.btn-tag` | outlined chip button: `border 1px #777; radius 10; padding 4px 12px; 12px; ls .08em`; `.filled` = black bg white text. |
| Row-button (Retake questionnaire) | `w-full flex justify-between py-4 px-4 border border-black rounded-[10px] hover:bg-neon` with `tune` + 14/700/tight + `chevron_right`. |

### 8.2 Inputs ("soft-fill" is the app-wide style)
- **Soft-fill input** (canonical): `w-full bg-surface-container-low (#f3f3f3) rounded-[10px] border-0 px-3 py-2.5 focus:ring-1 focus:ring-neon focus:outline-none`, text 16px (auth/nickname), 14px (edit profile, verify), 18px (wizard); `placeholder:text-outline-variant` (`#c6c6c6`) or `placeholder:text-outline`. `.academic-input` is the CSS twin (`bg #f3f3f3; radius 10; padding 12px 14.4px; focus box-shadow 0 0 0 1px #CCFF00`). Dark bg `#23211f`.
- **Textarea**: same, `resize-none`, `rows 2–4`, `leading-relaxed`; counters `10px font-medium text-outline` "0 / 250".
- **Select (soft-fill)**: `appearance-none text-sm font-medium bg-surface-container-low rounded-[10px] py-2.5 px-3 pr-8 truncate` + absolute `expand_more` 18px outline at `right-2`.
- **Select (underline, setup page only)**: `bg-transparent border-b border-outline px-0 py-3 text-lg focus:border-b-2 focus:border-primary`.
- **Search pill**: `flex items-center gap-2 bg-surface-container-low rounded-full px-4 py-2.5` with `search` 19–20px outline + borderless 14px input.
- **Chat composer**: textarea `bg-surface-container-lowest (#fff) rounded-[18px] px-4 py-2.5 text-sm` inside bar `bg-surface-container-low border-t outline-variant/20 py-3 px-4 pb-safe`.
- **Comment composer**: input `bg-surface-container-low rounded-full px-4 py-2.5 text-sm`.
- **New-post editor**: borderless transparent title (24/700/tight) and body (16px, `min-h 160`), `placeholder:text-outline-variant`.
- **Outlined inputs (report modal only)**: `border border-outline-variant rounded-[10px] bg-transparent py-3 px-3 text-sm focus:border-primary`.
- **Extra-info textarea (filter sheet)**: `bg-white border border-black rounded-[10px] px-4 py-3 text-sm font-medium placeholder:text-stone-400`.
- Code inputs: `tracking-[0.3em]` (verify), `uppercase tracking-widest` (connect code).
- Dashed drop zones: `border border-dashed border-outline-variant rounded-[10px] text-outline` (80px image add; 128px avatar circle `border-2`; verify card `aspect-[16/10]` with `add_a_photo` 30px + "Tap to upload" 10/700/widest).

### 8.3 Toggles, sliders, checkboxes
- **`.ink-switch`** (checkbox-backed): 48×24 pill, track `#e2e2e2` → `#CCFF00` when checked (0.3s), knob 16px white at `4px` inset, translates 24px. Used in filter sheet, new-post options.
- **Settings toggle** (`.setting-toggle` div): `w-10 h-5` (40×20) `rounded-full`, ON `bg-neon` + knob `w-4 h-4 bg-white right-0.5 top-0.5`; OFF `bg-surface-container-high (#e8e8e8)` + knob `bg-outline-variant left-0.5`.
- **`.mp-toggle`** (read-only display): 40×22, track `#d6d4d3` / `.on` neon, knob 17px white with `0 1px 3px rgba(0,0,0,.25)` shadow, 2.5px inset, translates 18px.
- **`.ink-range`**: 2px track `#e2e2e2`, square ends, 14px round neon thumb (disabled: opacity .3, thumb `#777`).
- **`.neon-check`**: Tailwind-forms checkbox 16px (`w-4 h-4`), `border-radius 6px`, checked = neon fill + neon border + **black** check glyph (custom SVG). Age "Any age" row: check + 10/widest/outline label, `gap-3`.
- Radio (questionnaire): 20px `border-2 border-outline rounded-full`, `text-primary` (black dot when checked, Tailwind forms).

### 8.4 Chips
| Chip | Spec |
|---|---|
| `.tag-chip` (interest tags, profile) | inline-flex `gap 6px`, transparent, `border 1px transparent`, radius 10, `padding 4px 12px`, 12px/700/.08em, color inherit; `.tag-remove` ×(opacity .7); `.add-tag` variant `#777` dashed border. |
| Stage chip (`.stage-chip`) | `px-5 py-2.5 rounded-[10px] border border-outline-variant 12/700/wider`; selected (inline style) `bg #CCFF00; color #000; border #CCFF00`; unselected `transparent/#1b1b1b/#c6c6c6`. |
| Suggestion chips (setup) | `px-4 py-2 rounded-[10px] border border-outline-variant 12px tracking-widest hover:border-primary`. |
| Gender buttons (setup) | `py-4 px-4` (or `py-3`) `rounded-[10px] border border-outline-variant text-sm tracking-wider`; selected `bg-neon text-black`. |
| Board note chip (new post) | `inline-flex gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low text-[11px] text-on-surface-variant` + `place_item` 14px; board name bold on-surface. |
| Note tag (session row) | `px-1.5 py-0.5 rounded-[10px] bg-surface-container 10/500 on-surface-variant`. |
| Q-mode badge | `px-3 py-1 rounded-[10px] bg-neon text-black 10/700/+0.15em` + 14px icon. |
| EVENT chip | `px-2 py-0.5 rounded-[8px] bg-neon text-black 9/700/widest`. |
| UNDER REVIEW / REJECTED | `px-2 py-0.5 rounded-[8px] 9/700/widest`; review `bg-surface-container-high text-on-surface-variant`; rejected `bg-neon-pink/15 text-neon-pink`. |
| Language option row | `w-full flex justify-between px-4 py-3.5 rounded-[12px] border`; selected `border-neon bg-neon/10` + neon filled `check_circle` 20px; else `border-outline-variant/50`. |
| Q-nav cell | 36×36 `rounded-[10px] 12/700`; answered `bg-neon text-black`; unanswered `border border-outline-variant text-on-surface-variant`; current `ring-2 ring-black` (white in dark). |

### 8.5 Badges (`inline-flex items-center gap-1 padding 2px 8px radius 10 font 9px line-height 1.4`)
| Class | Look |
|---|---|
| `.school-badge` | `rgba(0,0,0,.4)` + blur 4px, white, 700/.08em, `max-width 9rem`, ellipsis; `--neon` variant neon/black. |
| `.official-badge` | `rgba(27,27,27,.4)` + blur, white, 700/.08em ("Student Union · Org", "Official Team", "Official"). |
| `.sponsored-badge` | neon bg, black, 800/.1em uppercase "Sponsored". |
| `.pinned-badge` | `rgba(0,0,0,.75)` bg, **neon text**, 800/.1em uppercase "PINNED" (hidden on Pinned page). |
| `.chat-countdown-badge` | black/white, JetBrains Mono 10px −0.02em; `.is-urgent` pink bg black text; `.is-expired` `#e2e2e2`/`#777`. |
| Session countdown (`.session-countdown`, markup) | `10/700/widest px-2 py-0.5 rounded-[10px]`; normal `bg-neon/15 text-on-surface`; <1h `bg-neon-pink/15 text-neon-pink`; expired `bg-surface-container text-outline`. |
| `.chat-mode-tag` | 10/700/.04em `#777` with tiny icon. |
| `#notif-badge` | neon circle, `min-w 16 h-4 px-1 10/700` black, top-right of bell. |
| Unread dots | 8px `bg-neon-pink` (session row); 8px `bg-neon` at plate top-right (notification). |
| Verified check (`#verify-btn` verified state) | 22px neon circle, `check` 15px FILL 1 black; (pending/unverified render text variants). |

### 8.6 Segmented controls
- **Home mode switch** (`.home-mode-switch` > `.home-mode-seg` ×3: Chat / Romantic / Friend): container `flex gap 3px padding 3px; border 1px rgba(0,0,0,.08); radius 9999; bg #fff; height 40px; max-width 268px`; segments `flex 1 1 auto` (width by content), `padding 0 10.4px; radius 9999; 12px/700/.04em; color #1b1b1b; line-height 1`; `.active` = `bg #CCFF00; color #000`; hover `#f3f3f3`; `active:scale(.98)`. Dark: container `#1c1b19`/white 8% border, text `#eceae6`, active unchanged.
- **Square tabs**: text-only with sliding 2px neon underline (see §7.2).
- **Pill segmented (sheets)**: frame `flex border border-outline-variant/60 p-1 rounded-full`; segments `flex-1 py-3 (or py-2) rounded-full 12/700/wider text-black`; selected `bg #CCFF00 color #000` (inline style / class), hover `stone-50`. Used: Target Gender (romantic/friend), My QR / Scan (`.af-seg`, unselected `text-on-surface`).
- **Auth tabs**: underline style (`border-b-2 border-primary`).

### 8.7 Avatars
- `.chat-avatar` 36px circle `object-fit cover`; `--lg` 54px (session list); `--fallback` = `#e2e2e2` bg, `#474747` 14/700 uppercase initial (dark `#343230`/`#ddd`).
- Chat header partner avatar 36px; post-detail header author; feed `avatarChip`: `<img>` circle or fallback **black circle with white initials** (2 chars, `text-[7px]`…`text-[10px]`), sizes `w-4` 16 (card author row), `w-6` 24, `w-9` 36, `w-10` 40 (wide card / couple stack: 36 + 24 overlapped at `-bottom-1 -right-1` with `border-2 border-white`).
- **Anonymous** avatar: pastel circle (`ALIAS_BG[(seed>>>16)%16]`) + animal emoji (`ALIAS_EMOJI[(seed>>>8)%16]`), emoji font-size = `round(containerPx × 0.62)`, min 9. Alias name from seed, language-dependent.
- Profile hero avatar 92px; edit-profile avatar 96px (`border border-outline-variant/40`, camera badge 28px neon `photo_camera` 15px at bottom-right); match card avatar 112px with `border-4 border-primary p-1` and `cl-pulse`.

### 8.8 Energy cells
`.energy-cell` 14×14, `border-radius 3px`, neon fill; `--empty` transparent with `1px solid #c6c6c6`. Rendered in `#energy-display` (`flex gap-1 justify-end flex-wrap`): filled = available (max 5), empty = used, overflow `+N` `10px text-outline ml-1`.

### 8.9 Status orb (`.status-orb`)
9px dot, color `var(--orb, #FF2EC4)`, halo `::after` inset −3px opacity .3 pulsing (`orbPulse` 2.4s; `--matching` 1.6s; `--established` adds `orbGlow` box-shadow); `--idle` opacity .5, static halo .22.

### 8.10 Toast
`#toast`: fixed, `top: 16px + sat`, horizontally centered, `padding 12px 24px; bg #000; color #fff; radius 10; font 14px; shadow 0 2px 8px rgba(0,0,0,.2); z 999`; `.show` → `slideDown 0.3s ease-out` (from −20px, opacity 0). `toast(msg, duration=3000)` — text only, no icon, no dark variant.

### 8.11 Confirm / prompt cards (replace native alerts)
Backdrop `fixed inset-0 z-[120] flex items-center justify-center px-6 bg-black/40 backdrop-blur-[2px]`. Card `w-full max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6`: title 18/800/tight `mb-2`; body 14px relaxed on-surface-variant `mb-6`; buttons row `gap-3`, each `flex-1 py-3 rounded-[10px] 12/700/widest active:scale(.98)`: Cancel outlined `border-outline-variant text-on-surface`; OK `bg-neon text-black` or (danger) `bg-neon-pink text-white`. Tapping backdrop resolves `null` (abort ≠ cancel). Prompt variant adds optional uppercase label 10/700/+0.2em outline + soft-fill input/textarea, `mt-6` buttons, autofocus.

### 8.12 Language dialog (dynamic)
Backdrop `z-[999] bg-black/40 blur 2px px-8`; card `max-w-xs bg-surface rounded-[16px] shadow-2xl p-6`; title 18/800/tight ("语言 / Language"); two option rows (see chips); footer `flex gap-3`: Cancel outlined **rounded-full** `py-3 12/700/widest text-on-surface-variant`, Confirm neon rounded-full. Selecting a new language **reloads the page** (`localStorage.cl_lang`).

### 8.13 Chat "+" menu (`#chat-plus-menu`, dynamic)
Backdrop `rgba(0,0,0,.12)` z-68; card fixed `top: 56 + sat; left 12px; min-width 208px; bg #fff; radius 14; border 1px rgba(0,0,0,.06); shadow 0 10px 32px rgba(0,0,0,.16); padding 6px`; items `flex gap 12px; padding 11px 12px; radius 10; 13px/700/.02em #1b1b1b` + 20px icon; hover `#f3f3f3`; enter anim 0.18s from `translateY(-6px) scale(.98)`. Items in order: `search` "Search & discover", `qr_code_2` "Add by QR", `hub` "Relationship Network", `dark_mode` "Dark mode", `translate` "Language".

### 8.14 Post-detail action menu (`.pd-cm-menu`, dynamic)
`fixed z-[130] min-w-[148px] bg-surface-container-lowest border border-outline-variant/30 rounded-[12px] shadow-2xl py-1`, anchored under the `more_horiz` button (`top = button bottom + 6`, left clamped); rows `px-4 py-2.5 flex gap-2.5 active:bg-surface-container`: 18px outline icon + 14px on-surface text (`ios_share` Share / `flag` Report post). Comment long-press (600ms, move >10px cancels) opens a similar card (Share / Like / Report).

### 8.15 Empty / error / loading states
- `flatEmptyIcon(icon, tone)`: 64×64 `rounded-[18px]` box centered `mx-auto mb-6`, muted = `bg #efefef` icon `#8a8a8a`; neon = `bg #CCFF00` icon `#000`; icon 28px.
- Block pattern: `text-center pt-24` (or `py-24`, `pt-16`) → icon box → title `font-headline text-base font-extrabold tracking-tight text-on-surface` → sub `text-sm text-on-surface-variant mt-2 (max-w-[16rem]) leading-relaxed` → optional Retry underline button `mt-6` or `.btn-cta` in `max-w-xs`.
- Icons used: `forum` (no chats), `search`, `cloud_off` (load failed), `school` (campus wall empty), `push_pin`, `grid_view`, `notifications`, `confirmation_number` (no tickets), `person_off`, `hourglass_empty`, `group_off`, `auto_awesome`/`group` (neon tone: questionnaire prompt).
- Loading: plain text `Loading…` `text-sm text-on-surface-variant` centered (`py-24` in feeds, `pt-16` tickets); no skeletons/spinners anywhere except PTR.

### 8.16 Pull-to-refresh (`attachPullToRefresh`)
Indicator `.ptr-indicator`: 40px white disc, no shadow, `top: sat`, centered, z-39 (emerges from under the top bar), `refresh` icon 22px `#1b1b1b`, opacity ramps `dist/40`; rotates `dist/70 × 360°`; content translates with finger. Damping `dist = 180·(1 − e^(−dy/180))` (70 reached at dy≈90, cap 180). Threshold **70px** → `.ptr-ready` (icon neon); release → `.ptr-spinning` (0.7s linear spin, neon), content held at 70px, min 600ms, then springs back 0.3s. Skipped when an inner scroller (e.g. `.mp-box-scroll`) is scrolled, or during horizontal swipe. Dark: disc `#23211f`, icon `#eceae6`.

### 8.17 Swipe-back gesture
Edge start `clientX ≤ 30`, horizontal lock after 10px, panel (whole overlay root) follows `translateX(dx)` (no fade); release `≥ 80px` → slide out 0.2s and close via `SWIPE_BACK_CLOSE[id]` (chat, friend-hub, notifications, post-detail, milestone, energy purchase, square-search) or `hideOverlay`; else spring back 0.25s. Only overlays containing an `arrow_back`/`arrow_forward` icon qualify; also the questionnaire page (→ home).

### 8.18 Bottom-sheet drag-to-close (`bindSheetDragClose`)
Header of `.bottom-sheet-transition` follows finger downward; release `> 110px` closes (filter sheet uses `closeFilterSheet()`), else snaps back. Only bound to `#filter-overlay`.

### 8.19 Cards (Square) — see §10 for grid
| Card | Spec |
|---|---|
| Small (`bentoSmallCard`, recommend user posts) | `bg-surface-container-lowest rounded-[6px] overflow-hidden`; media = image `.rec-img` (`w-full h-auto min-h 110 max-h 300 object-cover`) on `bg-surface-container`; or **text card**: `aspect-[3/4] p-5 flex items-center bg #f6f1e7` with headline 800/tight `clamp(1.05rem,5.5vw,1.45rem)` lh 1.6 color `#3f3f3f`, 5-line clamp, first segment highlighted (see §10.2). Body `px-2.5 pb-2.5 pt-2`: title 13/700/tight/snug 2-line clamp → comment snippet → author row. |
| Author row (`cardAuthorRow`) | `flex justify-between mt-1.5`: 16px avatar + name `11px text-neutral-400 truncate`; like button = `favorite` 14px (`text-neon-pink` FILL 1 when liked) + count `12/700`. |
| Comment snippet | `text-[11px] text-outline leading-snug mt-1 pl-2 border-l-2 border-neon/60` 2-line clamp; "COMMENT" label `9/700/+0.15em mr-1`. |
| Large official (`bentoLargeCard`, col-span-2) | `bg-white rounded-[6px] overflow-hidden`; image `aspect-[4/5] object-cover bg-surface-container`, badges (`pinned` + `official/sponsored`) absolute `top-4 left-4 gap-1.5`; body `px-3 pt-2 pb-2`: title 18/700/tight, event strip, author row. Falls back to text card if no image. |
| Text (`bentoTextCard`, col-span-2) | `bg-white p-4 border border-outline-variant/10 shadow-sm rounded-[6px]`; header badges row `mb-3`; title 18/700/tight `mb-2`; event strip; content 14px on-surface-variant relaxed 4-line clamp `mb-2`; author row. |
| Wide campus-wall (`bentoWideCard`, col-span-2) | same shell as text card; header `flex gap-3 mb-4`: 40px avatar + name 16/700 truncate …; full-width image; content; like + comment counts; date at right of that row. |
| Ad (`adLargeCard`, col-span-2) | shell like large card; image `aspect-[4/5]` + `.sponsored-badge` at `top-4 left-4`; body `px-3 pt-2 pb-3 space-y-1`: title 18/700, content `14px italic text-neutral-500` 2-line clamp, advertiser `10px text-neutral-400 tracking-widest`. |
| Event strip | `flex gap-2 mt-1`: EVENT chip + `11px on-surface-variant font-medium` time·venue + `11/700` price / "Sold out". |
| Poll block (`.poll-block`) | column gap 6; `.poll-opt` full-width `padding 9px 12px; border 1px #c6c6c6; radius 10; bg #fff; text-left`; fill bar `.poll-opt-fill` absolute left `rgba(204,255,0,.28)` (mine `.5`), width % 0.4s; `--mine` border `1.5px #1b1b1b`; label 13/600 `#1b1b1b` ellipsis; count JetBrains Mono 11px `#474747`. |
| Pinned page overrides | `.text-lg`→16px, `.text-base`→13px, `.text-sm`→12px, `.text-[13px]`→11px; `.pinned-badge` hidden. |

### 8.20 Chat components
- Session row (`.session-row`): button `w-full flex items-center text-left; padding 10px 17px; gap 10px`; 54px avatar; name `15/700 on-surface truncate` (+ note tag); preview `text-xs on-surface-variant truncate mt-1` (placeholder "Start the conversation…" at 50% opacity); right column `items-end gap-1.5`: time `10px text-outline`, countdown badge, unread dot. Separator `::after` 1px `rgba(0,0,0,.07)` from x=81 to right−17; last row none. Temp rows `bg rgba(204,255,0,.15)` with 12px rounded top/bottom corners of the group; expired rows `opacity-50`; press `opacity-70`.
- Bubbles: `.chat-row flex items-end gap 8 mb 12` (`.mine` right-aligned); avatar 36; `.chat-col max-width 72%`; `.chat-bubble padding 10px 14px; 15px/1.45; bg #f1f1f1; color #1b1b1b; radius 18 18 18 6`; `.mine` neon/black radius `18 18 6 18`; `.chat-image max-h 16rem radius 14`, `+ .chat-bubble mt 6`; `.chat-read 9px #b6b6b6 mt 3 right`; `.chat-time-sep` centered `10px #b6b6b6 margin 14 0 10 ls .04em` inserted when ≥10 min gap (HH:MM / 昨天 / date).
- Header actions: Confirm (neon 10/700/widest `px-3 py-2 rounded-[10px]` + 14px `auto_awesome`/`group`), Waiting (`border border-outline-variant/40 text-outline opacity-60`), dissolve `link_off` 18px `p-2 rounded-[10px] text-outline hover:text-neon-pink`.
- Composer bar: `fixed bottom-0 bg-surface-container-low border-t outline-variant/20 py-3 px-4 pb-safe`; dissolved notice `10px widest neutral-400` centered; pending image 80px thumb `rounded-[10px] border outline-variant/40` + 20px pink `close` badge; add button 40px `neutral-500`; textarea; send 40px neon circle.
- Chat background: optional cover image `blur(9px) brightness(.93)` bleeding 30px beyond edges.

### 8.21 Notifications
List item: `flex items-start gap-4`; plate `.notif-icon-plate w-11 h-11 rounded-[12px] bg #f1f1f1 color #1b1b1b` with 20px icon (FILL 1 for like/match_result); unread neon dot 8px at `-top-0.5 -right-0.5`; text col `pt-0.5 space-y-0.5`: title `15/700 text-primary leading-snug` + time `10px on-surface-variant tracking-tighter`; body `14px on-surface-variant relaxed` 2-line clamp. Read items `opacity .6`. Sections (Today/Yesterday/Earlier) `mb-10` with `11px` labels. Detail: plate 48px `rounded-[14px]`, title 30/700/tighter/none, body 18px relaxed pre-wrap, `space-y-10`.

### 8.22 Tickets
`.ticket-card`: `mb-5 rounded-[14px] bg-white border border-outline-variant/20 active:scale(.99)` (non-valid `opacity-60`); top `p-5 pb-4`: title 16/800/tight + status badge; time·venue 12px on-surface-variant; school 10px widest outline. Perforation: 22px circles (`.ticket-notch`, bg `#f9f9f9`, at `left/right −11px`) + `.ticket-divider` 2px dashed `rgba(0,0,0,.12)` inset 22px. Bottom `p-5 pt-4 flex gap-5`: 86px white QR box `p-1.5 rounded-[10px] border outline-variant/30` (QR 74px) + "TICKET CODE" 10/+0.2em outline, code `font-mono 14/700 tracking-wider`, "Tap to open" 10px with `touch_app` 13px. Pass card (detail): `max-w-sm rounded-[20px] bg-white shadow 0 18px 48px rgba(0,0,0,.18)`.

### 8.23 Match result card (matched state, romantic)
`max-w-xl py-4`; eyebrow "This Week's Match" `10/700/+0.3em text-outline-variant px-2 mb-4`; card `border border-outline-variant/10 rounded-[10px] overflow-hidden` with cover image (or blurred avatar `blur-2xl scale-125`) under gradient `rgba(249,249,249,.3)→.62@48%→.92@82%`; inner `p-6`: avatar 112px `rounded-full border-4 border-primary p-1 bg-white cl-pulse`; name 24/700/tight + `verified` 16px; school·year 14px outline; …

### 8.24 Couple space / milestone
`.bookmark-item`: `border-left 4px solid #CCFF00; shadow 0 1px 2px rgba(0,0,0,.04)` (dark bg `#1c1b19`). `.milestone-bg`: fixed `splash_bg.png` cover, `grayscale(1) contrast(1.4) brightness(.95)`, opacity .28. `.match-anim` 252px box / iframe `/loaders.html` 240px (SVG goo-blob loader, ink `#0a0a0a`, `v=2` two merging circles 2.4s / `v=20` five-ball ring) — **currently unused** (idle/searching use the countdown card).

---

## 9. Match plan page (`.home-match-pane.match-plan` — idle & searching, romantic & friend)

Layout (pane): column, `padding: calc(64px + sat) 30px calc(96px + sab)`, `align-items stretch`, `overflow hidden` (page never scrolls; only the summary box scrolls). `.match-content` `flex 1 1 0; min-height 0; margin 0`.

1. **Title** `.mp-title`: 26px / 800 / tracking −0.025em / on-surface. Idle: "Start Your Journey" (romantic) / "Find New Friends" (friend); searching: "Matching in Progress".
2. **Sub** `.mp-sub`: 14px / 1.65 / `#8a8a8a` (dark `#8c8a85`), `mt-1.5` (6px), `min-height 3.3em` (always 2 lines tall so the card never moves).
3. **Green countdown card** `.mp-card` (`--alt` mirrored corners when searching): `width calc(100% + 44px); margin 14px −22px 0` (bleeds to 8px from screen edge); `bg #CCFF00; color #000; padding 14px 18px 16px; border-radius 24px 28px 22px 28px / 28px 22px 28px 24px` (alt: `28 24 28 22 / 22 28 24 28`). Same in dark mode.
   - `.mp-card-label`: 10px / 800 / +0.3em / `rgba(0,0,0,.5)` — "NEXT REVEAL IN" / "距下轮公布".
   - `.mp-week` (`mt 8`, `space-between`): 7 `.mp-day` cells `width 44; padding 7px 0 6px; gap 4; column`; `.mp-day-name` 11/700 `rgba(0,0,0,.45)` (M T W T F S S / 一…日); `.mp-day-num` 16/800 `#1b1b1b` tabular (2-digit date). Today: `.mp-day--today` white bg `radius 11`, name `.55`, num `#000`. Reveal day (only if in current Mon–Sun week): `.mp-day-badge` "REVEAL"/"公布日" absolute `top −12px` centered, white bg, black 9/800/+0.06em, `padding 2px 6px 2.5px`, radius 5; plus `.mp-day-ring` hand-drawn white ellipse SVG 40×28 (`stroke #fff 2.8 round`) at `top 21px` centered.
   - `.mp-cd` (`mt 14`, baseline row): 4× `.mp-num` (`00`, `font-size min(48px,12vw)`, 800, lh 1, −0.02em, tabular, black with 8-direction 2px/1.5px **white outline** text-shadow) each followed by `.mp-unit` (`d h m s` / 天时分秒; 12/700 `rgba(0,0,0,.5)`; `margin 0 10px 0 5px`, last `margin-right 0`). Ticks every second; week row re-renders on day change.
4. **Summary box** `.mp-box`: `flex column; flex 1 1 0; min-height 88; margin-top 20; overflow hidden`.
   - `.mp-box-head` (fixed): `.mp-label` "MATCH PREFERENCES" (10/800/+0.26em `#9a9a9a`) left; right = idle: `.mp-editlink` "Edit" (column, 11/800/+0.08em on-surface, with a 26×5 neon squiggle SVG underline `stroke #CCFF00 2.6`, `active:scale(.95)`) / searching: `.mp-lockline` (`lock` 13px + "Locked while matching · leave pool to edit", 10/700/+0.06em `#b0b0b0`, tap → toast).
   - `.mp-box-scroll` (scrolls, hidden scrollbar; `.mp-dim` opacity .55 when searching): 2×2 grid `gap-x-4 mt-0.5` of cells (`.mp-sep` bottom hairline `rgba(27,27,27,.07)`, `py-1.5`, gap 1px): label 10px/+0.06em `#b0b0b0` (`.mp-muted`) over value 14/800 on-surface — Target Gender, Age Range, University Stage (romantic) **or** Interest Priority (friend), School Filter. Then `.mp-label` "MATCH SETTINGS" `mt-3 mb-1`; Enhanced Mode row (`flex justify-between gap-3.5 py-1.5 .mp-sep`): 14/700 title + 11px muted sub ("3 cells · refunded if no match" / "1 cell per guaranteed friend" / "Guarantee N · N cells" / "Active this round · N cells") + `.mp-toggle` (read-only); Extra Info: 14/700 title + `.mp-extra` box `mt-1.5` (`bg #f3f3f3; radius 10; padding 10px 12px; 12px/1.6; pre-wrap`; empty → `#b0b0b0` placeholder "Anything else to help matching…").
5. **CTA** `.mp-cta`: `mt 14; width 100%; radius 12; padding 17px 20px; 14px/800/+0.18em; bg neon; color #000; shadow 0 8px 20px rgba(204,255,0,.35)` — "Join Matching Pool"; searching → `.mp-cta--leave`: transparent, `color #FF2EC4; border 1.5px #FF2EC4; padding 16px 20px; no shadow` — "Leave Pool".

Verified geometry at 375pt: title top 64 + sat; both states identical (26px title / 46px sub block / card width 359).

---

## 10. Square masonry grid & text-card highlighter

### 10.1 Grid (`.square-feed-grid`)
`display grid; grid-template-columns 2; column-gap 6px (0.375rem); row-gap 0; grid-auto-rows 1px; align-content start; padding-top 6px`. JS (`layoutSquareMasonry`) places every card explicitly: `span = ceil(cardHeight) + 6` (SP = 6 → 6px vertical gap), single cards go to the **shorter column**, `col-span-2` cards (wide/official/text/ad) sit below the taller column and any hole left in the shorter column is back-filled by later single cards that fit (holes < 30px discarded). Re-layout on resize, font load, image load (ResizeObserver per card) and after render. Page horizontal padding 6px (`px-1.5`), pages separated by 12px in the swipe track. **iOS**: implement as two-column shortest-column masonry with full-width rows; 6px gutters everywhere.

### 10.2 Text-card highlighter (`highlightMarkHtml`)
Takes the first segment of title/content up to the first punctuation/space (`。，！？…、,.!?:;` or whitespace), capped at **6 chars if first char is CJK (code ≥128) else 12**, wraps it in a span with `background: linear-gradient(to top, rgba(204,255,0,.95) 32%, transparent 32%)` → a neon marker bar covering the bottom ~1/3 of the glyphs. Rest of text plain. Card bg `#f6f1e7`, text `#3f3f3f` 800.

---

## 11. Overlay catalogue (`.overlay`: fixed inset-0, column flex, `opacity 0 / visibility hidden / pointer-events none`, `.active` fades in 0.25s)

| id | Type | z | Ground | Header | Body / Footer | Close paths |
|---|---|---|---|---|---|---|
| `#filter-overlay` (Edit preferences) | **Bottom sheet** | 50 | `bg-black/40 blur 2px`, `justify-end` | sheet `max-w-md bg-white rounded-t-xl(=10px) shadow-2xl .bottom-sheet-transition`; header: handle `w-10 h-1 bg-stone-200 mb-4`, row `px-6`: `close` (stone-400) / centered title "Edit" (`#filter-sheet-title`) / Save neon pill; `border-b stone-100 pt-3 pb-4` | scroll `max-h-[70vh] px-6 py-4 gap-5`: `#filter-romantic-section` (Target Gender pill seg; University Stage chips), `#filter-friend-section` (Target Gender; Interest Priority chips from profile), `#filter-shared-section` (Age Range 18–30 w/ display `18 — 24` 18/700/tighter, two `.ink-range` sliders labelled Min/Max 9px, "Any age" check; School Filter rows "Only Same School"/"Same City" with `.ink-switch`, `py-3.5 border-b stone-100`), `#filter-settings-section` (Enhanced Mode: hint 11px stone-400; Romantic Enhance switch row 14px + 12px stone-500 sub; Friend Enhance switch + `#friend-cells-slider` 1–5 with GUARANTEE/Cost 10px labels; Extra Info textarea (border-black); Retake Questionnaire row-button) | X, Save, tap backdrop, drag header >110px (all via `closeFilterSheet`) |
| `#overlay-new-post` | Full page | 100 | `bg-surface-container-lowest` (#fff) | `shrink-0 h-16 px-6 glass+hairline`: Cancel / **Publish** | `main flex-1 px-6 py-6 space-y-6`: board chip, title input 24px, body textarea, image grid (`grid-cols-4 gap-3`, 80px dashed add), options card `rounded-[14px] bg-surface-container-low` (Post anonymously switch; Create a poll switch + "Goes live after review" 12px sub; poll option inputs + "+ Add option"), poll row only on campus wall | Cancel, Publish |
| `#square-search-overlay` | Full page (`overflow hidden`) | 50 | `bg-surface` | `shrink-0 h-16 px-4` search bar | `main flex-1 overflow-y-auto px-1.5 pt-2 pb-16` → `#square-feed-search` masonry | back, swipe-back |
| `#post-detail-overlay` | Full page, 3-part, `overflow hidden` | 50 | `bg-surface` | `#pd-header` absolute top `h-16 px-3` (hides on scroll down) | `#pd-scroll` (padding-top 64+sat, bottom `var(--pd-footer-h,76px)`) → `#pd-content`; **footer** absolute bottom `border-t px-3 pt-3 pb sab+8`: reply bar (10px widest label + Cancel), image preview (64px thumb + black/70 X), row `gap-1.5`: image btn, anon btn (36px `bg-surface-container-low text-outline`), input pill, send neon 36px | back, swipe-back |
| `#chat-overlay` | Full page | 50 | `bg-background`, optional `#chat-bg` | fixed h-16 chat bar | `#chat-messages pt-20 pb-28 px-4 flex-1 overflow-y-auto`; fixed composer bar | back, swipe-back (`closeChat`) |
| `#chat-image-viewer` | Lightbox | 80 | `bg-black/90` | — | img `max-w-[92%] max-h-[85%] object-contain` | tap anywhere |
| `#partner-profile-overlay` | Full page | 70 | `bg-surface`, inner `max-w-[430px]` | none (JS renders cover + absolute `.pp-back` at 16+sat) | `#partner-profile-content flex-1 overflow-y-auto` | back key |
| `#edit-profile-overlay` | Full page | 50 | `bg-surface`, inner `max-w-[430px]` | `h-16 px-6 shrink-0 glass+hairline`: Cancel / "Edit Profile" 18/800 / Save pill | scroll `px-6 pt-6 pb-32 space-y-9`: avatar 96 + cover `h-24 rounded-[12px]` (both with 28px neon camera badge); fields (Nickname 16px; Real name 2-col 14px; Bio 3 rows + `0 / 250`; Signature 2 rows `/ 100`; 2-col grid `gap-x-4 gap-y-6`: Gender select, Birthday date + age hint, School, Grade, City, Major, MBTI, Nationality selects, Student ID); Interests `#edit-tags-list`; Photo Portfolio `grid-cols-3 gap-2`; Gift jar 5 inputs; bottom fade `h-24 .bottom-sheet-gradient` | Cancel, Save |
| `#add-interest-overlay` | Centered card | 60 | `bg-black/40 blur 2px` | card `max-w-xs mx-6 bg-surface rounded-[10px] shadow-2xl p-6`: title 16/700 + `close` | input (max 20) + `.btn-cta mt-6` "Add" | X, backdrop, Add |
| `#verify-overlay` | Centered card (scrollable `max-h-[88vh]`) | 60 | same | `max-w-sm`: "Student Verification" + X | Student ID Card dashed upload `aspect-[16/10]`; hint 10px outline; School Email + Send code (`btn-secondary` small) + pink hint; Verification Code input (+0.3em); `.btn-cta` "Submit for review" | X, backdrop |
| `#friend-hub-overlay` | Full page | 60 | `bg-surface` | sticky h-16 `px-6 gap-4`: back + `#friend-hub-title` ("Friends"/panel name) | `px-6 py-8 max-w-md`: panels `graph` (300px box `rounded-[10px] border outline-variant/30 bg-white` + 10px caption), `search` (pill + results `space-y-2`), `qr` (My QR / Scan pill seg `py-2`; 180px white QR box; "YOUR CODE" 10px widest outline; code `font-mono 14/700 widest select-all`; scanner `aspect-square bg-black/80 rounded-[10px]`; camera error pink 10px; code input uppercase + Add neon) | back, swipe-back |
| `#notifications-overlay` | Full page | 50 | `bg-surface` | sticky h-16: back + "Notifications" | `#notifications-content max-w-3xl px-6 pt-6 pb-16` | back, swipe-back, tap outside content |
| `#notif-detail-overlay` | Full page | 60 | `bg-surface` | sticky h-16: back + "Notification" | `px-6 pt-8 pb-16` | back |
| `#settings-overlay` | Full page (`overflow-y-auto`) | 50 | `bg-surface` | fixed h-16 (no border class; 1px `bg-outline-variant/20` div below): back + "Settings" | `main pt-24 pb-20 px-5`: sections Account (Email row w/ 14px sub; Password →), Preferences (Language `translate` →; Dark mode `dark_mode` … `contrast` icon; Push Notifications toggle), Nudge (inline "…nudged me" + input + Save 10px pill), Privacy (Show my profile / online status / moments toggles), Support (Help Center `help_outline`, Safety Tips `shield`, Report a Problem `flag`, Terms `gavel`, Privacy `policy`); Actions `mt-20 space-y-8`: **Log Out** pink outline; version 10px +0.3em | back |
| `#milestone-overlay` | Full page | 50 | `bg-surface` + `.milestone-bg` | fixed `nav h-16 px-6` glass+hairline: back, centered "Milestone" 14/700, spacer | `#milestone-content pt-24 pb-32 px-6 max-w-2xl` | back, swipe-back |
| `#content-overlay` (Help/Safety/Terms/Privacy) | Full page | 60 | `bg-surface` | fixed h-16 + 1px div: back + `#content-title` | `#content-body pt-24 pb-20 px-6 max-w-3xl` (FAQ items `py-5 border-b outline-variant/20`, q 14/700, a 14px on-surface-variant) | back |
| `#tickets-overlay` | Full page | 60 | `bg-surface` | fixed h-16 + 1px div: back + "My Tickets" | `#tickets-content pt-24 pb-20 px-5 max-w-lg` | back |
| `#ticket-detail-overlay` | Full page | 70 | `bg-surface` | fixed h-16 + 1px div: back + "Ticket" | `pt-24 pb-20 px-5` (pass card) | back (`closeTicketDetail`) |
| `#contact-overlay` | Centered card | 60 | `bg-black/40 blur 4px px-8` | card `max-w-sm bg-white shadow-2xl p-8 text-center rounded-[10px]` | `mail_outline` 36px primary `mb-4`; "Contact Us" 18/700 `mb-3`; 14px on-surface-variant; `contact@unimatcha.ai` 14/700 `mb-8`; Send Email neon `py-4 10/700/+0.2em mb-3`; Close outlined | Close |
| `#report-overlay` | Centered card (scroll `max-h-[85vh]`) | 60 | `bg-black/40 blur 4px px-6` | card `max-w-md bg-white shadow-2xl p-8 rounded-[10px]`: "Report a Problem" 18/700 + X (stone-400) | `space-y-6`: Category select, Description textarea (4 rows), Contact input — all outlined style; labels 10px widest outline; Submit neon `py-4 10/700/+0.2em disabled:opacity-50` | X |
| `#questionnaire-cards` | Centered card | 60 | `bg-black/40 blur 4px px-6` | card `max-w-md bg-white shadow-2xl rounded-[10px]`; header `px-6 pt-7 pb-4 text-center`: 20/800 "Complete Your Match Profile" + 12px sub | `px-6 pb-6 space-y-3`: `.q-card` rows `border border-black rounded-[10px] p-4` (22px icon + 14/700 name; right: neon `check_circle` 24px when `--done` + Start neon); `px-6 pb-7`: Maybe Later outlined `py-3.5` | Maybe Later |
| `#q-nav-overlay` | **Bottom sheet** | 70 | `bg-black/40 blur 2px justify-end` | sheet `max-w-md bg-surface rounded-t-2xl(=10px) shadow-2xl`; header `pt-3 pb-2`: handle `rounded-full mb-3`, legend 11px (neon square = Answered, outlined = Unanswered) | `#q-nav-grid px-5 pb-8 pt-2 grid-cols-8 gap-2 max-h-[46vh]` | backdrop tap, cell tap |
| `#modal-energy-purchase` | Full page | 100 | `bg-surface` | sticky h-16: back + "Get Energy" | `px-6 pt-6 pb-2 max-w-lg`: 3 package cards (`py-5 border outline-variant rounded-[10px]`; 24/800 cells number; "cells" 10px widest outline; ¥ price 12/700; selected `border-2 border-black bg-neon/10`); `px-6 pt-5 pb-10`: "Payment Method" 10px widest outline; rows `py-3 px-4 rounded-[10px] border` (20px icon `chat`/`account_balance_wallet`/`credit_card`, 12/700/widest label, neon `check_circle` FILL 1 shown when selected, selected `border-2 border-black`); `#energy-pay-btn .btn-cta` disabled until both chosen ("Select a package" → "Pay ¥X · N cells") | back, swipe-back |

Dynamic (created in JS, not in index.html): `#chat-plus-menu` (§8.13), `.pd-cm-menu` + comment action card (§8.14), `confirmCard`/`promptCard` (§8.11), language dialog (§8.12), `#ad-detail-overlay` (full page: sticky h-16 glass bar with back + "Sponsored" 10px/+0.15em, images full-width, `px-6 py-8`: sponsored badge, title 30/700/tighter, body 18px light relaxed, advertiser 10px), enhanced-mode confirm card (match.js, uses `confirmCard` pattern), `#toast`.

---

## 12. Tailwind utility → concrete value cheat sheet (only classes that appear in the skeleton/templates)

Sizes: `w-4/h-4` 16 · `w-5` 20 · `w-6` 24 · `w-7` 28 · `w-9/h-9` 36 · `w-10/h-10` 40 · `w-11/h-11` 44 · `w-12` 48 · `w-14/h-14` 56 · `w-16/h-16` 64 · `w-20/h-20` 80 · `w-24/h-24` 96 · `w-28` 112 · `w-32` 128 · `h-1` 4 · `h-[1px]/h-px` 1 · `h-[2px]` 2 · `h-64` 256 · `h-96` 384.
Spacing: `0.5`=2 · `1`=4 · `1.5`=6 · `2`=8 · `2.5`=10 · `3`=12 · `3.5`=14 · `4`=16 · `5`=20 · `6`=24 · `7`=28 · `8`=32 · `9`=36 · `10`=40 · `12`=48 · `14`=56 · `16`=64 · `20`=80 · `24`=96 · `28`=112 · `32`=128 · `52`=208.
Max widths: `max-w-xs` 320 · `sm` 384 · `md` 448 · `lg` 512 · `2xl` 672 · `3xl` 768 · `screen-md` 768 · `[430px]` · `[268px]` · `[16rem]` 256 · `[92%]`.
Aspect: `aspect-[3/4]`, `[4/5]`, `[16/10]`, `aspect-square`.
Opacity: `opacity-10/20/30/50/60/70` · `opacity-[0.03]`.
Ring: `ring-1 ring-neon` (focus, 1px `#CCFF00`), `ring-2 ring-black`, `ring-[3px] ring-white/90`.
Border: `border` 1px · `border-2` · `border-b-2` · `border-dashed` · `border-t/b`.
Grid: `grid-cols-2/3/4/8`, `col-span-2`, `grid-flow-row-dense`.
Position helpers: `-ml-1.5/-mr-1.5` −6 · `-ml-2` −8 · `-mt-6` −24 · `-top-0.5/-right-0.5` −2 · `-top-1.5/-right-1.5` −6 · `-bottom-1/-right-1` −4 · `-top-10` −40 · `-left-4` −16 · `top-8` 32 · `right-8` 32 · `bottom-16` 64 · `bottom-52` 208 · `right-5` 20 · `right-3` 12 · `left-4/top-4` 16.
`truncate` = single-line ellipsis; `select-all`; `touch-none`; `pointer-events-none`; `object-cover`, `object-contain`, `object-[center_30%]`, `object-bottom`.

---

## 13. Persistence keys & runtime facts relevant to design
- `localStorage.cl_theme` (`light|dark`), `cl_lang` (`en|zh`, first visit default `en`; switching reloads), `cl_fab_pos` (`{x,y}`), `cl_token`; sessionStorage boot-retry flags.
- API base: `https://api.<domain>/api/v1` (production), `http://host:3001/api/v1` local.
- i18n is a DOM-text dictionary; user content is marked `data-no-i18n`. Chinese strings for the plan page and alias names are generated in JS (see `renderPlanBox`/`fillPlanBox`/`aliasName`).
- Icons (Material Symbol names) used in the skeleton: `add, notifications_none, search, close, arrow_back, arrow_forward, arrow_upward, more_horiz, image, visibility_off, chat_bubble, eco, person, flash_on, confirmation_number, person_outline, mail_outline, settings, chevron_right, expand_more, translate, dark_mode, contrast, help_outline, shield, flag, gavel, policy, tune, grid_view, auto_awesome, group, check_circle, check, verified, favorite, lock, mail, pin, add_a_photo, photo_camera, place_item, qr_code_2, hub, ios_share, link_off, refresh, block, touch_app, chat, account_balance_wallet, credit_card, forum, cloud_off, school, push_pin, notifications, person_off, hourglass_empty, group_off`.

---

## 14. Gotchas / surprises for the iOS implementer
1. **All `rounded-*` steps are 10px** by config (sm…3xl). Only `rounded-full` and explicit `rounded-[Npx]` differ. Bottom sheets therefore have 10px top corners, not 12/16.
2. **Feed cards are 6px radius, no border, no shadow** (small/large/ad); only wide/text cards have a 10%-alpha 1px border + `shadow-sm`. Feed gutter is 6px (page padding 6px, column gap 6px, row gap 6px).
3. **Bottom nav is icon-only**: 33px icons in 50px circles inside a 62px-tall floating pill with 1px 8%-black border, no shadow, no active background — active = neon filled icon. It auto-hides on scroll-down (>6px delta, never when scrollTop<40).
4. **Neon always pairs with black** text/icons (also in dark mode via `.dark .bg-neon{color:#000}`); pink is outline/text only (except the danger confirm button).
5. **Dark mode is warm-black** (`#121110 / #1c1b19 / #23211f / #292724 / #2f2d2a / #363431`, text `#eceae6 / #aaa8a3 / #8c8a85`, border `#343230`). Green card, text-card ivory and toast are NOT re-themed. Ticket notch uses stale `#17171c`.
6. **Three top-bar heights**: Home 56+sat (no hairline), Square 44+sat, every overlay 64+sat. Content offset under a fixed bar is `pt-24` (96) + sat for overlays, `pt-[50px]` + sat for Square, 62+sat for the chat list.
7. **Home is a horizontal 3-pane track** (Chat / Romantic / Friend) with the pill segmented control in the top bar; Square is a 3-page track (Recommend / Campus Wall / Pinned) with ink underline; both share physics: follow finger, 0.3× rubber band at ends, 70px release threshold, 12px inter-page gap, spring `cubic-bezier(.22,1,.36,1)`.
8. **Match plan page never scrolls**; only the preferences summary box scrolls, and its header (label + Edit/Locked) is pinned. Title is fixed at 26px and the subtitle box is always 2 lines tall so the green card position is identical in idle and searching.
9. **Green countdown card bleeds** 22px past the 30px content gutter (8px from screen edge) and has irregular "hand-drawn" corner radii that mirror between idle and searching. Digits are black with a white outline (text-shadow) on neon.
10. **Profile has no top bar**; a 400+sat hero image sits under a blur mask that clears as you pull down; the content sheet overlaps the hero by 24px with 24px top radius; hero text is white with shadow, school line is neon.
11. **Soft-fill inputs everywhere** (`#f3f3f3`, 10px radius, no border, 1px neon focus ring) — except: setup-page selects (underline), report modal (outlined `#c6c6c6`), extra-info textarea (outlined black), chat textarea (white, 18px radius).
12. **Empty states** are always: 64px `#efefef` rounded-18 icon tile (28px icon `#8a8a8a`) → 16px extrabold title → 14px grey sub; "action" variants use a neon tile. Loading is a plain grey "Loading…" line — no spinners.
13. **Toast** is a black pill at top (16+sat), 14px white text, slides down 0.3s, auto-hides after 3s; it is the only feedback primitive (no snackbars/alerts). Confirmations are custom cards (neon OK / pink danger), tapping the backdrop = abort (`null`) distinct from Cancel.
14. **Font weight 900 is requested (`font-black`) but the font only ships to 800.**
15. **Material Symbols Rounded, weight 300, FILL 0** is the global icon style; FILL 1 is used sparingly (active nav, energy bolt, liked heart, verified check, selected check_circle, like/match notifications). In SF Symbols terms: use `.light` weight outlines, `.fill` variants only for those cases.
16. `splash-fallback` is referenced by the boot watchdog but doesn't exist in the DOM; `.font-cute`, `.feed-card`, `.slide-left/.slide-right`, `.match-anim`, `.academic-*`, `.tonal-shift`, `.bottom-sheet-gradient`(used once) and `loaders.html` are legacy/unused — do not port.
17. Overlay page bars come in two flavours that look different: **left-aligned back+title** (most pages) vs **Cancel / centered title / neon Save pill** (edit flows). The milestone bar centers a 14px title with a spacer.
18. The **Square "Pinned" tab** is a 10px baseline-aligned label hanging 16px to the right of "Campus Wall", fading in only when pinned posts exist; on that page all card text sizes step down one notch and the FAB and PINNED badges are hidden.
19. Chat list rows use a **54px avatar** while bubbles use 36px; separators start at x=81 (17+54+10) so they never run under the avatar; temp (48h) sessions get a translucent neon background band with 12px corners and a countdown pill that turns pink under 1h.
20. Safe-area handling is CSS-class-driven (`.fixed.top-0` etc.) with several id-scoped exceptions — on iOS simply use `safeAreaInsets` and the height tables above; do not port the CSS heuristics.
