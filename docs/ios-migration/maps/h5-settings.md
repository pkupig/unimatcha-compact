# H5 module map — `settings` (Settings overlay, content pages, contact, report, language/dark-mode, change-password, logout)

Sources read in full: `apps/h5/src/modules/settings.js` (365 lines), the related markup in `apps/h5/index.html` (lines 331–335, 839–852, 1539–1712, 1731–1741, 1767–1807), `apps/h5/src/styles/main.css` (overlay / safe-area / dark / toast rules), plus the helpers this module leans on in `core.js` (api, overlays, confirmCard/promptCard, toast, btnBusy, swipe-back, cleanupUserState), `i18n.js` (dark mode, language dialog, dictionary), `auth.js` (doLogout, showChangePassword), and the backend contracts in `apps/api/src/{users,chat,auth,reports,prisma}`.

Design tokens used below (Tailwind config in `index.html`):

| token | light | dark (`html.dark`) |
|---|---|---|
| `neon` | `#CCFF00` | same (text on it forced `#000`) |
| `neon-pink` | `#FF2EC4` | same |
| `primary` | `#000000` | — |
| `surface` / `background` | `#f9f9f9` | `#121110` |
| `surface/80` (blurred headers) | rgba(249,249,249,.8) | rgba(18,17,16,.85) |
| `surface-container-lowest` / `bg-white` | `#ffffff` | `#1c1b19` |
| `surface-container-low` | `#f3f3f3` | `#23211f` |
| `surface-container-high` | `#e8e8e8` | `#2f2d2a` |
| `on-surface` | `#1b1b1b` | `#eceae6` |
| `on-surface-variant` | `#474747` | `#aaa8a3` |
| `outline` | `#777777` | `#8c8a85` |
| `outline-variant` | `#c6c6c6` | text `#8c8a85`; borders `#343230`; **backgrounds not overridden** |
| font `headline`/`body`/`label` | Plus Jakarta Sans → PingFang SC → Noto Sans SC | |
| border radius: every Tailwind radius alias (`rounded`, `-lg`, `-xl`, `-2xl`…) is **10px**; only explicit `rounded-full`, `rounded-[12px]`, `rounded-[16px]` differ. |

Material Symbols Outlined are used for all icons; default glyph size 24px, weight 300, FILL 0 unless stated.

---

## 1. Screens & states

### 1.1 Entry points into this module

| Where | Control | Calls |
|---|---|---|
| Profile tab (`#page-home` → profile panel) | row **Settings** (icon `settings`, chevron_right) | `openSettings()` |
| Profile tab | row **Contact Us** (icon `mail_outline`, chevron_right) | `openContactUs()` |
| Auth page footer (logged-out!) | links **Terms of Service** / **Privacy Policy** (`text-[10px]` bold tracking-widest, separated by `/`) | `openContentPage('terms'|'privacy')` |
| Chat view "+" popover (match.js `toggleChatPlusMenu`) | items **Dark mode** (icon `dark_mode`), **Language** (icon `translate`) | `toggleDarkMode()`, `openLangDialog()` |

Profile rows are `<button class="flex items-center justify-between py-4 border-b border-outline-variant/20 group">` with `gap-4` between icon and 14px medium tracking-wide label, chevron in `text-outline-variant`.

### 1.2 Settings overlay — `#settings-overlay`

**Container.** `.overlay fixed inset-0 z-50 bg-surface overflow-y-auto`, flex column. Overlays are always in the DOM; `.active` toggles `opacity 0→1 / visibility` with a 0.25 s ease fade (no slide). The overlay itself is the vertical scroll container.

**Enter:** `openSettings()` → sets email text, re-renders toggles from cached state, adds `.active`, fires `GET /users/me/settings`, prefills nudge input from `S.currentUser.settings.nudgeSuffix` (see gotcha 7.1 — this is effectively always empty on first open).
**Exit:** back arrow → `hideOverlay('settings-overlay')` (just removes `.active`); edge swipe-back (§2.9); `closeAllOverlays()` on logout/401.

**Header** (`<header class="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl">`):
- Safe area: `.fixed.top-0` gets `padding-top: env(safe-area-inset-top)`; the sibling `<main>` gets `margin-top: env(safe-area-inset-top)` (rule `.fixed.top-0 ~ main`). So header height = safe-top + 64 px + 1 px divider.
- Inner row: `px-6` (24 px) `h-16` (64 px), `flex justify-between items-center`. Left cluster `flex items-center` containing: `arrow_back` icon (24 px, `text-on-surface`, tap = close, `active:scale-95`) immediately followed — **no gap** — by `<h1>` "Settings" (`font-headline text-xl` 20 px bold `tracking-tight`, `text-on-surface`). Nothing on the right.
- Under the row: 1 px divider `bg-outline-variant/20`.

**Main** (`<main class="pt-24 pb-20 px-5">`): top padding 96 px (+ safe-top margin), bottom 80 px, horizontal 20 px. Scrolls with the overlay. Content top-to-bottom, each `<section class="mb-10">` (40 px gap), each section header `<h3 class="font-headline text-xs font-black tracking-[0.2em] text-outline">` (12 px, black weight, +0.2em letterspacing, `#777`, NOT uppercase-transformed — text is written in title case) with `mb-3`.

Row anatomy (shared): `flex items-center justify-between py-4` (16 px vertical padding, no horizontal padding — flush with the 20 px page gutter), followed by a 1 px `bg-outline-variant/20` divider `<div>`. Tappable rows add `cursor-pointer hover:bg-surface-container-low transition-colors` (hover only — no pressed state on touch). Label: `text-on-surface text-sm font-medium tracking-wide` (14 px). Rows that carry an icon: `<div class="flex items-center">` with the 24 px Material icon (`text-on-surface`) and the label **with no gap between them** (unlike the profile page rows which use `gap-4`). Right accessory when navigational: `chevron_right` icon in `text-outline` (`group-hover:text-primary`).

1. **Section "Account"**
   - Row **Email** — two-line: label "Email" + value line `#settings-email` (`text-on-surface-variant text-sm`, `data-no-i18n`, placeholder markup text `user@university.edu`, replaced at open with `S.currentUser.email` or fallback `user@example.edu`). Has `cursor-pointer hover:` classes but **no onclick — inert**. No chevron. Divider.
   - Row **Password** — label only (an empty second line was removed; the dictionary still holds the old subtitle "Tap to change password"), chevron_right, `onclick="showChangePassword()"`. Divider.
2. **Section "Preferences"**
   - Row **Language** — icon `translate` + label, chevron_right, `onclick="openLangDialog()"`. (No current-language value shown.) Divider.
   - Row **Dark mode** — icon `dark_mode` + label; right accessory is the icon `contrast` (in `text-outline`) **not a switch** — it does not reflect state; `onclick="toggleDarkMode()"`. Divider.
   - Row **Push Notifications** — label; right: **toggle** `data-key="pushEnabled"` (§1.2.1). Divider.
3. **Section "Nudge"** (`space-y-2`)
   - One horizontal row `flex items-center gap-2`: static text "…nudged me" (`text-sm text-on-surface-variant shrink-0`), then `<input id="settings-nudge-suffix" type="text" maxlength="40" placeholder="on the head">` — `flex-1 min-w-0 bg-surface-container-low rounded-[10px] border-0 px-3 py-2.5 text-sm text-on-surface`, focus = 1 px neon ring, no outline — then button `#nudge-save-btn` "Save": `bg-neon text-black rounded-full px-4 py-2 font-headline text-[10px] font-bold tracking-widest active:scale-95 disabled:opacity-50 shrink-0`.
   - Busy state via `btnBusy`: button disabled + label swapped to "Saving…" / "保存中…", restored afterwards.
4. **Section "Privacy"** — three toggle rows, each label-only + toggle + divider:
   - **Show my profile** → key `privacy.showProfile`
   - **Show online status** → key `privacy.showOnline`
   - **Show my moments** → key `privacy.showMoments`
   (Their old subtitles — "Allow others to view your profile", "Let your match see when you are active", "Display your moments to others", "Match results, messages and likes" — remain in the zh dictionary but are no longer rendered.)
5. **Section "Support"** — icon rows with chevron_right + divider:
   - `help_outline` **Help Center** → `openContentPage('help')`
   - `shield` **Safety Tips** → `openContentPage('safety')`
   - `flag` **Report a Problem** → `openReportProblem()`
   - `gavel` **Terms of Service** → `openContentPage('terms')`
   - `policy` **Privacy Policy** → `openContentPage('privacy')`
   (There is no separate "Legal" header even though a `Legal` dictionary key exists.)
6. **Actions** (`<section class="mt-20 space-y-8">`, 80 px above):
   - Button **Log Out**: `w-full border-2 border-neon-pink text-neon-pink py-5 rounded-[10px] font-headline font-bold text-sm tracking-widest` (hover fills pink with black text) → `doLogout()`.
   - Centered `<p class="text-[10px] text-outline tracking-[0.3em]" data-no-i18n>Unimatcha v2.4.0</p>` with `pt-8 pb-12`. Version string is hard-coded (also printed at the bottom of the profile tab).

There is **no Delete Account** control anywhere in the app; the Help Center FAQ tells users to email `contact@unimatcha.ai` from their registered address.

#### 1.2.1 Toggle switch (`.setting-toggle`)
- Track 40 × 20 (`w-10 h-5`), `rounded-full`, `relative`, `transition-colors`. Knob is a child `absolute top-0.5 w-4 h-4 rounded-full transition-all` (16 px, 2 px inset).
- ON: track `bg-neon` (#CCFF00), knob `right-0.5 bg-white`.
- OFF: track `bg-surface-container-high` (#e8e8e8 / dark #2f2d2a), knob `left-0.5 bg-outline-variant` (#c6c6c6 in both themes — not dark-overridden).
- `renderSettingsToggles()` rewrites the classes of every `.setting-toggle[data-key]` from `getSettingValue(key)`; called at open, after optimistic flip, after fetch, and after PUT completes/fails.

### 1.3 Language dialog (built in `i18n.js#openLangDialog`, opened from the Language row and from the chat "+" menu)
- Backdrop: `fixed inset-0 z-[999] bg-black/40 backdrop-blur-[2px] flex items-center justify-center px-8`. Appended to `<body>` on demand, removed on close.
- Card: `w-full max-w-xs bg-surface rounded-[16px] shadow-2xl p-6`, marked `data-no-i18n` (its copy is hand-bilingual).
- Title `<h3 class="font-headline font-extrabold text-lg tracking-tight text-on-surface mb-4">`: "Language / 语言" when current UI is en, "语言 / Language" when zh.
- Two option buttons (`space-y-2 mb-6`): `w-full flex items-center justify-between px-4 py-3.5 rounded-[12px] border transition-all`; label `font-headline font-bold text-sm` — fixed texts **"中文"** and **"English"** (never translated); trailing `check_circle` icon (FILL 1, 20 px, `text-neon`) visible only on the selected option (`opacity-0` otherwise). Selected: `border-neon bg-neon/10`; unselected: `border-outline-variant/50`.
- Footer `flex gap-3`: **Cancel** (`flex-1 py-3 rounded-full border border-outline-variant font-headline text-xs font-bold tracking-widest text-on-surface-variant active:scale-95`) and **Confirm** (`flex-1 py-3 rounded-full bg-neon text-black …`). Labels "取消"/"确定" in zh UI, "Cancel"/"Confirm" in en UI.
- Initial selection = current language (`localStorage.cl_lang`, default `en`).

### 1.4 Change-password flow (two sequential prompt cards from `core.js#promptCard`, driven by `auth.js#showChangePassword`)
Card chrome (shared by confirm/prompt cards): backdrop `fixed inset-0 z-[120] bg-black/40 backdrop-blur-[2px] flex items-center justify-center px-6`; card `w-full max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6`, `role=dialog`; title `font-headline font-extrabold text-lg tracking-tight text-on-surface` (`mb-3` in prompt, `mb-2` in confirm); optional label `text-[10px] font-bold tracking-[0.2em] text-outline uppercase mb-2`; input `w-full bg-surface-container-low rounded-[10px] border-0 px-3 py-2.5` with neon focus ring; buttons row `flex gap-3 mt-6`: Cancel `flex-1 py-3 rounded-[10px] border border-outline-variant text-on-surface font-bold text-xs tracking-widest active:scale-[0.98]`, OK `flex-1 py-3 rounded-[10px] bg-neon text-black …`. Input auto-focuses after 30 ms; Enter submits.
1. Card A — title "Change password", label "CURRENT PASSWORD", placeholder "Enter your current password", OK label "Next", cancel "Cancel".
2. Card B — title "Change password", label "NEW PASSWORD", placeholder "At least 8 characters", OK label "Change".
- **The input is `type="text"` — passwords are shown unmasked.** iOS should use SecureField.
- Cancel or tapping the backdrop on either card aborts silently (returns null).

### 1.5 Logout confirm card (`core.js#confirmCard`, from `auth.js#doLogout`)
Same card chrome. Title "Log out of Unimatcha?", no body (an empty `mb-6` spacer), Cancel "Cancel", OK "Log Out" rendered **danger** style: `bg-neon-pink text-white`. Backdrop tap = abort (null), Cancel = false — both do nothing.

### 1.6 Content page overlay — `#content-overlay` (Help Center / Safety Tips / Terms of Service / Privacy Policy)
- `.overlay fixed inset-0 z-[60] bg-surface overflow-y-auto` — sits above Settings (z-50) so it stacks; also usable from the logged-out auth page.
- Header identical to Settings' but the left cluster is `flex items-center gap-4` (16 px between `arrow_back` and title), title `#content-title` set per page. Divider 1 px.
- `<main id="content-body" class="pt-24 pb-20 px-6 max-w-3xl mx-auto w-full">` — innerHTML replaced per page; `scrollTop` reset to 0 on every open.
- Content building blocks:
  - Intro paragraph: `text-sm text-on-surface-variant leading-relaxed mb-6` (Help, Safety only).
  - `faqItem(q, a)`: `<div class="py-5 border-b border-outline-variant/20">` question `font-headline text-sm font-bold tracking-tight mb-2`, answer `text-sm text-on-surface-variant leading-relaxed`.
  - `lastUpdated`: `text-[10px] text-outline tracking-[0.2em] mb-8` — "Last updated: June 2026" / "最近更新：2026 年 6 月" (Terms, Privacy only).
  - `docSection(h, body)`: `<section class="mb-8">` heading `font-headline text-xs font-black tracking-[0.2em] mb-3 text-on-surface`, body `text-sm text-on-surface-variant leading-relaxed`.
- Page = `(zh && CONTENT_PAGES_ZH[key]) || CONTENT_PAGES[key]` — whole-page language swap chosen at open time. Full copy is in §5.4.

### 1.7 Contact Us modal — `#contact-overlay`
- `.overlay fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm items-center justify-center px-8` (centered modal, dim + blur backdrop).
- Card `w-full max-w-sm bg-white shadow-2xl p-8 text-center rounded-[10px]` (dark: `#1c1b19`).
  - Icon `mail_outline` `text-primary text-4xl` (36 px) `mb-4`
  - `<h2 class="font-headline text-lg font-bold tracking-tight mb-3">` "Contact Us"
  - `<p class="text-sm text-on-surface-variant mb-1">` "Questions, feedback or partnership inquiries:"
  - `<p class="text-sm font-bold mb-8">` "contact@unimatcha.ai"
  - `<a href="mailto:contact@unimatcha.ai">` styled `block w-full bg-neon text-black py-4 rounded-[10px] font-headline text-[10px] font-bold tracking-[0.2em] active:scale-[0.98] mb-3` — "Send Email"
  - Button "Close": `w-full border border-outline-variant py-4 rounded-[10px] font-headline text-[10px] font-bold tracking-[0.2em] hover:bg-surface-container-low` → `hideOverlay('contact-overlay')`.
- No backdrop-tap-to-close, no swipe-back (no arrow icon).

### 1.8 Report a Problem modal — `#report-overlay`
- `.overlay fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm items-center justify-center px-6`.
- Card `w-full max-w-md bg-white shadow-2xl p-8 max-h-[85vh] overflow-y-auto rounded-[10px]` (card scrolls internally if tall).
  - Header `flex items-center justify-between mb-6`: `<h2 class="font-headline text-lg font-bold tracking-tight">` "Report a Problem" + close button (`close` icon, `text-stone-400 hover:text-black`) → `hideOverlay('report-overlay')`.
  - Form `space-y-6`, each field `space-y-2` with label `font-label text-[10px] tracking-widest text-outline`:
    - **Category** — `<select id="report-category">` `w-full border border-outline-variant rounded-[10px] bg-transparent py-3 px-3 text-sm focus:border-primary`; options (value → label): `bug` "App bug", `user` "Report a user", `content` "Inappropriate content", `other` "Other". Default `bug`.
    - **Description** — `<textarea id="report-content" rows="4" placeholder="Tell us what happened...">` same border style, `resize-none`. No client max length (server caps 2000).
    - **Contact (optional)** — `<input id="report-contact" type="text" placeholder="Email or phone for follow-up">`.
    - Submit `#report-submit`: `w-full bg-neon text-black py-4 rounded-[10px] font-headline text-[10px] font-bold tracking-[0.2em] active:scale-[0.98] disabled:opacity-50` — "Submit Report".
- Opening (`openReportProblem`) always resets: category→`bug`, description→"", contact→"".
- No backdrop-tap-to-close, no swipe-back.

### 1.9 Toast (`#toast`, `core.js#toast(msg, 3000)`)
Fixed, top `16px + safe-area-inset-top`, horizontally centered, `z-index 999`, `padding 12px 24px`, black background, white 14 px text, radius 10, shadow `0 2px 8px rgba(0,0,0,.2)`, `slideDown 0.3s` entrance, auto-hides after 3 s (a new toast replaces the text; the hide timer of the previous one still fires). Same look in dark mode.

### 1.10 Love Mode / Milestone (`openLoveMode` — **dead code**)
`settings.js` still exports `openLoveMode()` (checks `S.matchStatus[mode].state === 'relationship'`, lazily fetches `GET /matching/status?mode=`, then `loadMilestone()` + opens `#milestone-overlay`, else toast "Unlocks when you're matched"). **No caller exists anywhere in `src/` or `index.html`.** Do not build UI for it from this module; the milestone overlay belongs to `milestone.js`/`couple.js` mappers.

---

## 2. Interactions

### 2.1 Open / close Settings
- Open: `openSettings()` order matters: (1) write email, (2) `renderSettingsToggles()` from whatever `S.userSettings` holds (defaults → all ON when null), (3) add `.active`, (4) fire `loadUserSettings()` (async), (5) prefill nudge input. Toggles therefore flash "all on" then settle on server values if they differ.
- Close: back arrow / swipe-back → remove `.active`. Nothing is saved on close (all settings save immediately on change; the nudge suffix needs its own Save).

### 2.2 Toggle a setting (`toggleSetting(key)`, keys `pushEnabled`, `privacy.showProfile`, `privacy.showOnline`, `privacy.showMoments`)
1. If `S.userSettings` is null, seed it with a deep copy of `DEFAULT_SETTINGS` (`{pushEnabled:true, privacy:{showProfile:true, showOnline:true, showMoments:true}}`).
2. **Race guard B28:** if `settingSaving[key]` is true, ignore the tap (no queueing of conflicting writes for the same key). Other keys can still be toggled concurrently.
3. `next = !getSettingValue(key)`; `getSettingValue` returns the stored boolean or `true` when missing/non-boolean (`SETTING_FALLBACKS` is empty now).
4. **Optimistic**: apply locally, re-render all toggles, mark saving.
5. `PUT /users/me/settings` with a **single-key payload**: `{pushEnabled: next}` or `{privacy: {showOnline: next}}`.
6. Success: keep the optimistic local value; **the PUT response is deliberately ignored** (it only echoes this key and would clobber other in-flight optimistic flips).
7. Failure: revert only this key, toast "Failed to save setting".
8. `finally`: clear saving flag; re-render.
- No haptics, no confirmation.

### 2.3 Settings fetch vs. in-flight toggle (`loadUserSettings`, guard B29)
`GET /users/me/settings` is fired on every open. When it resolves, the snapshot is adopted into `S.userSettings` **only if no toggle PUT is in flight** (`!Object.values(settingSaving).some(Boolean)`); otherwise the fetch result is dropped and only a re-render happens. Fetch failure is swallowed (keep defaults/cached).

### 2.4 Nudge suffix
- Input free text, `maxlength=40` (server also slices to 40; **no trimming on either side**).
- Save: `btnBusy('nudge-save-btn', true)` → `PUT /chat/nudge-suffix {suffix}` → on success update `S.currentUser.settings.nudgeSuffix` locally + toast "Saved"; on failure toast `"Failed: " + (e.message || 'try again')`; always `btnBusy(false)`.
- Semantics: the backend composes the nudge system message as `` `${myNickname} nudged ${yourNickname}${suffix}` `` — **no separator is inserted**, so a suffix "on the head" renders "Alice nudged Bobon the head"; the user must type the leading space themselves. Chat renders that string verbatim as a centered italic 11 px system line (`kind:'nudge'`).
- Empty string is a valid save (clears the suffix).

### 2.5 Language
- Row tap → dialog (§1.3). Tapping an option only updates the selection highlight. **Confirm** with a *changed* selection: persist `localStorage.cl_lang`, then `window.location.reload()` (whole SPA reboots; all overlays close; user lands back at the home/match tab after splash). Confirm with the same selection or Cancel/backdrop: just dismiss.
- `toggleLang()` (no confirm, flips and reloads) still exists but is not wired to the Settings UI.

### 2.6 Dark mode
- Row tap → `toggleDarkMode()`: flips `localStorage.cl_theme` between `light`/`dark` (default `light`), toggles the `dark` class on `<html>` immediately (no reload), toast "Dark mode on" / "Light mode on" (English only, never translated). The row shows no state indicator (`contrast` icon is static).
- Theme is applied at boot from localStorage; it is device-level and survives logout.

### 2.7 Change password (§1.4)
- Card A cancel → abort. Card B cancel → abort. Values are `trim()`med.
- Client validation before any request: empty current → toast "Enter your current password"; new password shorter than 8 → toast "Password must be at least 8 characters".
- `POST /auth/change-password {currentPassword, password}` → toast "Password changed". Error → toast server message (`Current password is incorrect`, `Password must be at least 8 characters`, MaxLength 64 validation message) or fallback "Failed to change password".
- No re-login, token unchanged.

### 2.8 Report a problem (§1.8)
- Submit: read category (fallback `other`), description `.trim()`, contact `.trim()`. Empty description → toast "Please describe the problem", no request.
- Disable submit button; `POST /reports {category, content, contact?}` (contact omitted when blank). Success → toast "Report submitted. Thank you!" and hide overlay (fields are not cleared until next open, which resets them anyway). Error → toast `e.message || 'Failed to submit report'`. Button re-enabled either way.

### 2.9 Edge swipe-back (global, `core.js`)
- Touch starts at `clientX ≤ 30`; the **topmost active overlay by z-index** becomes the target only if it contains an `arrow_back`/`arrow_forward` icon (`hasBackButton`). Settings and Content overlays qualify; Contact/Report modals (only a `close` icon) and the language/card dialogs (not `.overlay`) do **not**.
- Once the gesture locks horizontal (|dx|>10 and |dx|>|dy|), vertical scroll is suppressed and the whole overlay root translates with the finger (no fade). Release with `dx ≥ 80` → animate off-screen right 0.2 s, then `hideOverlay(id)` (no special close handler registered for these ids). Otherwise spring back 0.25 s.
- Because Content (z-60) stacks above Settings (z-50), a swipe closes Content first, revealing Settings.

### 2.10 Logout (`doLogout`)
Confirm card (§1.5) → on true: stop match/chat/notification polling and countdown tick; remove `localStorage.cl_token`; `cleanupUserState()` (also stops SSE realtime, nulls `currentUser`, `userSettings`, match/chat/notification state — see §4); `closeAllOverlays()`; `showPage('page-auth')`. `cl_theme` and `cl_lang` are **not** cleared.

### 2.11 Contact Us
Only two actions: `mailto:contact@unimatcha.ai` link (opens Mail) and Close.

---

## 3. API calls

All go through `core.js#api(path, method, body)`: base `S.API`, header `Authorization: Bearer <localStorage.cl_token>`, JSON body, `cache: 'no-store'`. Non-OK → throws `Error(data.message || 'API <status>')`. **401 anywhere → global forced logout** (token removed, polling/SSE stopped, state wiped, all overlays closed, auth page shown). Responses are enveloped `{success, data, timestamp}`; callers unwrap with `data.data || data`.

| # | Call | Request | Response fields used | Errors / notes |
|---|---|---|---|---|
| 1 | `GET /users/me/settings` | — | `pushEnabled: boolean`, `privacy: {showProfile, showOnline, showMoments, searchable, discoverable}` (all booleans, merged with server defaults; UI reads only the first three privacy keys) | Called on every `openSettings`. Swallowed on error. Result dropped if any toggle PUT is in flight (B29). No polling, no caching. |
| 2 | `PUT /users/me/settings` | exactly one of `{pushEnabled: bool}` or `{privacy: {<key>: bool}}` — the toggled key only | none (echo `{pushEnabled, privacy}` ignored on purpose) | Server merges only known keys under a `SELECT … FOR UPDATE` row lock and preserves sibling keys (`nudgeSuffix`, `notes`, `chatBackgrounds`, `coupleCovers`). Failure → revert key + toast. Per-key in-flight dedup (B28). |
| 3 | `PUT /chat/nudge-suffix` | `{suffix: string}` (≤40 chars, raw input value) | none (`{nudgeSuffix}` echo ignored; local `S.currentUser.settings.nudgeSuffix` updated from the input) | Server `.slice(0,40)`, no trim. Failure toast "Failed: …". |
| 4 | `POST /auth/change-password` | `{currentPassword: string, password: string}` (both trimmed; client enforces `password.length ≥ 8`) | none (`{message:'Password updated'}`) | 400 `Current password is incorrect`; 400 `Password must be at least 8 characters`; 400 if `password` > 64 chars (class-validator message). Toast shows server message. |
| 5 | `POST /reports` | `{category: 'bug'|'user'|'content'|'other', content: string (≤2000), contact?: string}` | none (`{id, message}`) | 400 on unknown category / content > 2000 (message toasted). Submit button disabled during request. |
| 6 | `GET /matching/status?mode=<romantic|friend>` | query `mode` from `S.activeMatchMode` | `state` (`'relationship'` unlocks) | Only from dead `openLoveMode`. |

Not exposed by any endpoint the module calls: the **current nudge suffix** (see 7.1). No delete-account endpoint is used.

---

## 4. Client state

`state.js` (`S`):
- `S.currentUser` — from `GET /users/me` at boot or login/register response; fields used here: `email`, `settings?.nudgeSuffix` (only present after an in-session save — the server never returns `settings` on `/users/me` or auth responses).
- `S.userSettings` — `null` until `loadUserSettings` succeeds or a toggle seeds defaults; shape `{pushEnabled, privacy:{…}}`. When null, every toggle renders ON.
- `S.activeMatchMode`, `S.matchStatus{romantic,friend}` — read by dead `openLoveMode` only.

Module-private: `settingSaving: {[key]: boolean}` — per-key in-flight map (not reset on logout, but it only ever holds transient flags).

`localStorage`:
- `cl_token` — JWT; removed on logout/401.
- `cl_theme` — `'light' | 'dark'` (missing = light). Device-level, persists across accounts.
- `cl_lang` — `'en' | 'zh'` (missing = en). Device-level, persists across accounts; changing it reloads the page.

Cleanup on logout / account switch (`core.js#cleanupUserState`): `S.currentUser = null`, `S.userSettings = null`, match/chat/notification/energy/enhanced/prefs state reset, all pollers + SSE stopped. Overlays closed by `closeAllOverlays()`. DOM leftovers (email text, nudge input value, report form values) are **not** cleared until the next `openSettings`/`openReportProblem` rewrites them — an iOS port should reset view state on logout rather than rely on re-open.

---

## 5. i18n

### 5.1 Mechanism
- Default language **English**; the markup is authored in English. When `cl_lang === 'zh'`, `i18n.js` walks every text node once at boot and then watches the DOM with a `MutationObserver` (childList+subtree), replacing any text node whose trimmed value exactly equals a key in the `ZH` dictionary. Placeholders are translated separately through `ZH_PLACEHOLDER`.
- Anything inside an element with `data-no-i18n` is skipped (user content). In this module: `#settings-email`, the version line, the language dialog card, nudge system messages in chat.
- Toasts and card dialogs are injected as text/innerHTML, so they get translated **only if the exact string is a dictionary key** — most toasts in this module are not (see table).
- Content pages do **not** use the dictionary: `openContentPage` picks `CONTENT_PAGES_ZH` vs `CONTENT_PAGES` wholesale via `window.getLang()`.
- `btnBusy` picks "保存中…" vs "Saving…" via `getLang()`.
- Switching language reloads the page; there is no live re-render.

### 5.2 Settings overlay strings (en → zh; "—" = no zh entry, stays English in zh mode)

| en | zh |
|---|---|
| Settings | 设置 |
| Account | 账号 |
| Email | 邮箱 |
| Password | 密码 |
| (unused subtitle) Tap to change password | 点击修改密码 |
| Preferences | 偏好 |
| Language | 语言 |
| Dark mode | 深色模式 |
| Push Notifications | 推送通知 |
| (unused subtitle) Match results, messages and likes | 匹配结果、消息与点赞 |
| Nudge | 拍一拍 |
| …nudged me | …拍了拍我 |
| (unused) When someone nudges you, it reads: | 别人拍你时显示为： |
| placeholder "on the head" | — (no placeholder mapping; stays English) |
| Save | 保存 |
| Saving… (busy label) | 保存中… |
| Privacy | 隐私 |
| Show my profile | 公开我的资料 |
| (unused subtitle) Allow others to view your profile | 允许他人查看你的资料 |
| Show online status | 显示在线状态 |
| (unused subtitle) Let your match see when you are active | 让匹配对象看到你的在线状态 |
| Show my moments | 公开我的动态 |
| (unused subtitle) Display your moments to others | 向他人展示你的动态 |
| Support | 支持 |
| Help Center | 帮助中心 |
| Safety Tips | 安全提示 |
| Report a Problem | 问题反馈 |
| (unused header) Legal | 法律条款 |
| Terms of Service | 用户协议 |
| Privacy Policy | 隐私政策 |
| Log Out | 退出登录 |
| Unimatcha v2.4.0 | (data-no-i18n, unchanged) |
| Contact Us (profile row + modal title) | 联系我们 |

### 5.3 Dialog / toast / modal strings

| Context | en | zh |
|---|---|---|
| Logout card title | Log out of Unimatcha? | — |
| Logout card buttons | Cancel / Log Out | 取消 / 退出登录 |
| Dark mode toasts | Dark mode on / Light mode on | — (dictionary has no entry; comment in code notes they're English) |
| Language dialog title | Language / 语言 | 语言 / Language |
| Language options | 中文 · English | (same, fixed) |
| Language dialog buttons | Cancel / Confirm | 取消 / 确定 |
| Change-password card A | title "Change password", label "Current password", placeholder "Enter your current password", OK "Next" | title —, label —, placeholder 输入当前密码, OK — ; Cancel 取消 |
| Change-password card B | label "New password", placeholder "At least 8 characters", OK "Change" | —, 至少 8 位, — |
| Password toasts | Enter your current password · Password must be at least 8 characters · Password changed · Failed to change password · Current password is incorrect (server) | — (all English) |
| Nudge toasts | Saved · Failed: <msg> / try again | — |
| Toggle failure toast | Failed to save setting | — |
| Contact modal | Contact Us · Questions, feedback or partnership inquiries: · contact@unimatcha.ai · Send Email · Close | 联系我们 · 咨询、反馈或合作请联系： · (same) · 发送邮件 · 关闭 |
| Report modal labels | Report a Problem · Category · Description · Contact (optional) · Submit Report | 问题反馈 · 类别 · 描述 · 联系方式（选填） · 提交反馈 |
| Report categories | App bug · Report a user · Inappropriate content · Other | 应用问题 · 举报用户 · 不当内容 · 其他 |
| Report placeholders | Tell us what happened... · Email or phone for follow-up | 告诉我们发生了什么… · 便于回访的邮箱或电话 |
| Report toasts | Please describe the problem · Report submitted. Thank you! · Failed to submit report | — |
| Love-mode toast (dead) | Unlocks when you're matched | — |

### 5.4 Content pages — full copy (ship verbatim)

**help — "Help Center" / "帮助中心"**
Intro (en): "Answers to the questions we hear most often. Still stuck? Reach us via Contact Us or Report a Problem in Settings."
Intro (zh): "这里汇总了最常见的问题。仍有疑问？可在设置中通过「联系我们」或「问题反馈」找到我们。"

| # | en Q | en A | zh Q | zh A |
|---|---|---|---|---|
| 1 | How does weekly matching work? | Once you join the matching pool, our system pairs you with one carefully selected student per matching round based on your questionnaire answers, profile and preferences. Quality over quantity — you receive one proposal at a time, not an endless swipe deck. | 每周匹配是怎么运作的？ | 加入匹配池后，系统会根据你的问卷答案、资料与偏好，每轮为你精心匹配一位同学。重质不重量——一次只推一位，不做无限滑动。 |
| 2 | Why have I not received a match yet? | Matches are released on a schedule, and a round may pass without a suitable candidate if the pool in your area is small or your filters are strict. Try widening your age range or disabling the same-school / same-city filters, and make sure your profile and questionnaire are complete. | 为什么我还没有收到匹配？ | 匹配按轮次定期公布；如果你所在地区的匹配池较小或筛选条件较严，某一轮可能没有合适人选。可以尝试放宽年龄范围、关闭同校/同城筛选，并确保资料和问卷填写完整。 |
| 3 | How do I confirm or decline a match proposal? | When a proposal arrives, open the Match tab to view your candidate’s profile. You have 48 hours to confirm or pass. If you pass or the timer expires, you return to the pool for the next round. | 如何确认或跳过匹配对象？ | 收到匹配后，打开匹配页查看对方资料。你有 48 小时决定确认或跳过；跳过或超时后会自动回到匹配池，等待下一轮。 |
| 4 | What happens when both of us confirm? | You enter relationship mode: a private chat opens and you unlock the couple square to share moments together. | 双方都确认后会发生什么？ | 你们将进入关系模式：开启专属聊天，并解锁情侣空间，一起记录你们的点滴。 |
| 5 | How do I edit my profile or matching preferences? | Go to Profile → Edit Profile to update your photos, bio and interests. Matching preferences (gender, age range, school filters) live behind the filter icon on the Match tab. | 如何修改资料或匹配偏好？ | 前往「我的」→「编辑资料」更新照片、简介和兴趣。匹配偏好（性别、年龄范围、学校筛选）在匹配页的设置入口里调整。 |
| 6 | How do I end a connection? | Open your partner’s profile from the Match tab and choose Unmatch. This is permanent: the chat closes and both of you return to the matching pool. | 如何解除连接？ | 在匹配页打开对方资料并选择解除。此操作不可撤销：聊天将关闭，双方都会回到匹配池。 |
| 7 | How do I verify my student status? | Register with your university email address. Additional campus verification options are rolling out — verified profiles get a badge and priority in matching. | 如何完成学生认证？ | 使用大学邮箱注册即可。更多校园认证方式陆续开放——认证用户会获得标识，并在匹配中享有优先。 |
| 8 | How do I delete my account? | Contact us at contact@unimatcha.ai from your registered email and we will remove your account and data in line with our Privacy Policy. | 如何注销账号？ | 用注册邮箱发送邮件至 contact@unimatcha.ai，我们会按照隐私政策删除你的账号与数据。 |

**safety — "Safety Tips" / "安全提示"**
Intro (en): "Your safety matters more than any match. Keep these guidelines in mind when connecting with someone new."
Intro (zh): "你的安全比任何匹配都重要。与新朋友建立联系时，请记住以下几点。"

| # | en title | en body | zh title | zh body |
|---|---|---|---|---|
| 1 | Keep conversations in the app | Chat within Unimatcha until you trust the other person. Moving to other platforms too early makes it harder for us to help if something goes wrong. | 把聊天留在应用内 | 在建立信任之前，请在 Unimatcha 内沟通。过早转移到其他平台，出现问题时我们将难以协助。 |
| 2 | Take your time before meeting | There is no rush. Video call or chat for a while first, and be wary of anyone pressuring you to meet immediately. | 别急着见面 | 不用着急。先视频或多聊一段时间；对催促你立刻见面的人保持警惕。 |
| 3 | Meet in public places | For first dates, choose busy campus spots, cafes or public venues during the day. Avoid private residences until you know each other well. | 选择公共场所见面 | 初次见面选择白天的校园人多处、咖啡馆等公共场所，熟悉之前避免前往私人住所。 |
| 4 | Tell a friend your plans | Share who you are meeting, where and when with a friend or flatmate, and check in with them during the date. | 告诉朋友你的行程 | 把见面对象、地点和时间告诉朋友或室友，并在见面期间保持联系。 |
| 5 | Arrange your own transport | Get to and from the date independently so you can leave whenever you want. | 自行安排交通 | 独立往返约会地点，想离开时随时可以离开。 |
| 6 | Never send money or financial details | No genuine match will ask you for money, gift cards, bank details or cryptocurrency. Treat any such request as a scam and report it immediately. | 绝不转账或透露财务信息 | 真正的匹配对象不会向你要钱、礼品卡、银行卡信息或加密货币。遇到此类请求一律视为诈骗并立即举报。 |
| 7 | Trust your instincts | If something feels off — inconsistent stories, refusal to video call, guilt-tripping — it probably is. You never owe anyone a meeting or a reply. | 相信直觉 | 如果感觉不对劲——说辞前后矛盾、拒绝视频、道德绑架——那多半就是有问题。你不欠任何人一次见面或一条回复。 |
| 8 | Report and block | Use Report a Problem in Settings to flag suspicious or abusive behaviour. Reports are confidential and reviewed by our team. | 举报与屏蔽 | 通过设置中的「问题反馈」举报可疑或骚扰行为。举报完全保密，由我们的团队审核处理。 |

**terms — "Terms of Service" / "用户协议"** (leads with "Last updated: June 2026" / "最近更新：2026 年 6 月")

| # | en heading | en body | zh heading | zh body |
|---|---|---|---|---|
| 1 | 1. Acceptance of Terms | By creating an account or using Unimatcha (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. We may update these Terms from time to time; continued use after changes take effect constitutes acceptance of the revised Terms. | 1. 协议接受 | 创建账号或使用 Unimatcha（下称"本服务"）即表示你同意受本协议约束；如不同意，请勿使用本服务。我们可能不时更新协议内容，更新生效后继续使用即视为接受修订条款。 |
| 2 | 2. Eligibility | The Service is intended for currently enrolled university students aged 18 or over. You must register with a valid university email address and provide truthful information about yourself. You may maintain only one account, and you may not use the Service if you have previously been removed for violating these Terms. | 2. 使用资格 | 本服务面向年满 18 周岁的在校大学生。你须使用有效的大学邮箱注册，并提供真实信息。每人仅可持有一个账号；曾因违反协议被移除者不得再次使用。 |
| 3 | 3. Your Account | You are responsible for safeguarding your login credentials and for all activity under your account. Notify us immediately at contact@unimatcha.ai if you suspect unauthorised access. We are not liable for losses arising from your failure to protect your account. | 3. 你的账号 | 你须妥善保管登录凭据，并对账号下的所有活动负责。如怀疑账号被盗用，请立即联系 contact@unimatcha.ai。因未妥善保管账号造成的损失，我们不承担责任。 |
| 4 | 4. Acceptable Use | You agree not to: impersonate any person or misrepresent your identity, age or student status; harass, threaten, defame or abuse other users; post content that is unlawful, hateful, sexually explicit or infringes the rights of others; solicit money or commercial services from other users; use bots, scrapers or other automated means to access the Service; or attempt to interfere with the proper functioning of the Service. | 4. 行为规范 | 你同意不：冒充他人或虚报身份、年龄、学生身份；骚扰、威胁、诽谤或辱骂其他用户；发布违法、仇恨、色情或侵权内容；向其他用户募集钱款或推销商业服务；使用机器人、爬虫等自动化手段访问本服务；或干扰本服务的正常运行。 |
| 5 | 5. User Content | You retain ownership of the photos, posts and messages you submit, but you grant Unimatcha a non-exclusive, worldwide, royalty-free licence to host, display and distribute that content within the Service for the purpose of operating its features. You represent that you have all rights necessary to share the content you upload, and that it does not violate any law or third-party right. | 5. 用户内容 | 你上传的照片、帖子与消息归你所有，但你授予 Unimatcha 一项非独占、全球性、免版税的许可，允许我们为运营产品功能而托管、展示与分发这些内容。你保证对所上传内容拥有全部必要权利，且内容不违反法律或侵犯第三方权利。 |
| 6 | 6. Matching | Match proposals are generated algorithmically based on your questionnaire answers, profile and preferences. We do not guarantee any particular number, frequency or quality of matches, nor any outcome from a match. Decisions to confirm, decline or unmatch are entirely yours. | 6. 匹配机制 | 匹配结果由算法根据你的问卷答案、资料与偏好生成。我们不保证匹配的数量、频率或质量，也不保证任何匹配结果。确认、跳过或解除均由你自行决定。 |
| 7 | 7. Safety | We do not conduct criminal background checks on users. You are solely responsible for your interactions with other users, both online and offline. Always exercise caution and review our Safety Tips before meeting anyone in person. | 7. 安全 | 我们不对用户进行犯罪背景调查。你须对线上线下与其他用户的互动自行负责。见面前请务必谨慎，并阅读我们的安全提示。 |
| 8 | 8. Termination | We may suspend or terminate your account at our discretion if we reasonably believe you have violated these Terms, applicable law or the spirit of the community. You may stop using the Service and request account deletion at any time. | 8. 终止 | 如我们有合理理由认为你违反了本协议、适用法律或社区精神，可暂停或终止你的账号。你可以随时停止使用本服务并申请注销账号。 |
| 9 | 9. Disclaimers and Liability | The Service is provided "as is" without warranties of any kind, express or implied. To the maximum extent permitted by law, Unimatcha shall not be liable for any indirect, incidental or consequential damages arising from your use of the Service, including interactions with other users. | 9. 免责声明与责任限制 | 本服务按"现状"提供，不作任何明示或默示的保证。在法律允许的最大范围内，Unimatcha 不对因使用本服务（包括与其他用户的互动）产生的间接、附带或后果性损害承担责任。 |
| 10 | 10. Contact | Questions about these Terms? Email us at contact@unimatcha.ai. | 10. 联系我们 | 对本协议有任何疑问，请发送邮件至 contact@unimatcha.ai。 |

**privacy — "Privacy Policy" / "隐私政策"** (leads with the same "Last updated" line)

| # | en heading | en body | zh heading | zh body |
|---|---|---|---|---|
| 1 | 1. Introduction | This Privacy Policy explains how Unimatcha ("we", "us") collects, uses and protects your personal information when you use our matching service. We are committed to handling your data responsibly and transparently. | 1. 引言 | 本隐私政策说明 Unimatcha（下称"我们"）在你使用匹配服务时如何收集、使用和保护你的个人信息。我们承诺以负责、透明的方式处理你的数据。 |
| 2 | 2. Information We Collect | Account information: your university email address and password (stored as a salted hash). Profile information: nickname, age, gender, school, degree stage, photos, bio, interests and other details you choose to add. Questionnaire answers: your responses used to compute match compatibility. Usage data: messages you send within the app, posts and comments in the square, likes, and basic interaction logs. Technical data: device type, IP address and approximate region, used for security and service operation. | 2. 我们收集的信息 | 账号信息：大学邮箱与密码（以加盐哈希存储）。资料信息：昵称、年龄、性别、学校、学业阶段、照片、简介、兴趣等你选择填写的内容。问卷答案：用于计算匹配契合度。使用数据：应用内消息、广场帖子与评论、点赞及基础交互日志。技术数据：设备类型、IP 地址与大致地区，用于安全与服务运行。 |
| 3 | 3. How We Use Your Information | We use your data to: operate the matching algorithm and propose compatible partners; display your profile to your match candidates and, where you allow it, to other users; deliver chat, square and notification features; respond to your support requests and reports; keep the Service safe by detecting fraud, spam and abusive behaviour; and improve the Service through aggregated, de-identified analytics. | 3. 信息的使用方式 | 我们使用你的数据来：运行匹配算法并推荐合适的对象；向匹配候选人（及你允许的其他用户）展示你的资料；提供聊天、广场与通知功能；响应你的支持请求与举报；通过识别欺诈、垃圾信息与滥用行为保障服务安全；以及通过聚合、去标识化的分析改进服务。 |
| 4 | 4. What Other Users See | Your profile (photos, nickname, school, interests) is visible to users you are matched with, and to other users where features such as the square apply. You can control visibility through the privacy toggles in Settings: Show my profile, Show online status and Show my moments. Your email address and questionnaire answers are never shown to other users. | 4. 其他用户可见的内容 | 你的资料（照片、昵称、学校、兴趣）对匹配对象可见，并在广场等场景对其他用户可见。你可以在设置的隐私开关中控制可见性：公开我的资料、显示在线状态、公开我的动态。你的邮箱和问卷答案绝不会向其他用户展示。 |
| 5 | 5. Sharing | We do not sell your personal data. We share data only with service providers who process it on our behalf (such as hosting and image storage) under confidentiality obligations, or when required by law, or to protect the rights and safety of our users. | 5. 数据共享 | 我们不出售你的个人数据。仅在以下情况共享：受保密义务约束、代表我们处理数据的服务商（如托管与图片存储）；法律要求；或为保护用户的权利与安全。 |
| 6 | 6. Data Retention | We keep your data while your account is active. If you delete your account, we remove or anonymise your personal data within 30 days, except where we must retain limited records to comply with legal obligations or resolve disputes. | 6. 数据保留 | 账号存续期间我们保留你的数据。注销账号后，我们将在 30 天内删除或匿名化你的个人数据，法律要求保留或争议处理所需的少量记录除外。 |
| 7 | 7. Security | We protect your data with encryption in transit, hashed passwords, access controls and regular reviews. No system is perfectly secure, so please use a strong, unique password and report any suspected breach to us immediately. | 7. 数据安全 | 我们通过传输加密、密码哈希、访问控制与定期审查保护你的数据。没有绝对安全的系统，请使用高强度的唯一密码，并在怀疑账号异常时立即联系我们。 |
| 8 | 8. Your Rights | Depending on your jurisdiction, you may have the right to access, correct, export or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us from your registered email address. | 8. 你的权利 | 依据你所在司法辖区的法律，你可能有权访问、更正、导出或删除个人数据，并反对或限制某些处理。行使这些权利请用注册邮箱联系我们。 |
| 9 | 9. Changes to This Policy | We may update this Policy as the Service evolves. Material changes will be announced in the app before they take effect. | 9. 政策更新 | 随着服务演进，我们可能更新本政策。重大变更会在生效前于应用内公告。 |
| 10 | 10. Contact | For privacy questions or requests, email contact@unimatcha.ai. | 10. 联系我们 | 隐私相关问题或请求，请发送邮件至 contact@unimatcha.ai。 |

---

## 6. Cross-module links

**settings.js exports (window.*) and who calls them**

| Function | Called from |
|---|---|
| `openSettings` | profile tab row (index.html) |
| `closeSettings` | nobody (header uses `hideOverlay` directly) |
| `saveNudgeSuffix` | nudge Save button |
| `loadUserSettings`, `renderSettingsToggles`, `toggleSetting` | settings overlay only |
| `openContentPage(key)` | settings Support rows; auth page footer links (Terms/Privacy) |
| `openContactUs` | profile tab row |
| `openReportProblem`, `submitReport` | settings Support row; report modal |
| `openLoveMode` | **no callers** (dead) |

**settings.js depends on**

| Module | Symbols |
|---|---|
| `state.js` | `S.currentUser`, `S.userSettings`, `S.activeMatchMode`, `S.matchStatus` |
| `core.js` | `api`, `openOverlay`, `closeOverlay`, `hideOverlay`, `toast`, `btnBusy`, (indirectly) swipe-back, `cleanupUserState`, `closeAllOverlays` |
| `i18n.js` | `getLang` (content page language), `toggleDarkMode`, `openLangDialog`, `toggleLang`, dictionary/observer |
| `auth.js` | `doLogout`, `showChangePassword` → `submitChangePassword` |
| `milestone.js` | `loadMilestone` (dead path) |
| `chat.js` | consumes the nudge suffix indirectly (server composes the nudge message) |

**Other modules that reach into this area:** `match.js` chat "+" popover → `toggleDarkMode`/`openLangDialog`; `core.js` 401 handler and `auth.js#doLogout` close the overlays and null `S.userSettings`.

---

## 7. Gotchas

1. **The saved nudge suffix is never shown back.** `openSettings` prefills from `S.currentUser.settings.nudgeSuffix`, but `GET /users/me` (`usersService.findById`) selects no `settings`, the login/register responses don't include it, and `GET /users/me/settings` returns only `{pushEnabled, privacy}`. So the field is blank on every fresh launch and only echoes a value saved during the current session. An iOS port that wants to display the current suffix needs a backend change (e.g. include `nudgeSuffix` in `/users/me/settings`) — flag this rather than silently replicating the bug.
2. **Nudge suffix concatenation has no separator**: server message is `` `${me} nudged ${you}${suffix}` ``; the placeholder "on the head" misleads — users must type a leading space. Chat renders the raw string (`data-no-i18n`, centered italic).
3. **Change-password inputs are unmasked** (`promptCard` uses `type="text"`). Use SecureField on iOS; keep the two-step flow (current → new), the 8-char client check, and the server's 64-char cap.
4. **Backend privacy keys `searchable` and `discoverable` still exist and are enforced server-side** (`searchable` defaults true, `discoverable` defaults false), but the UI deliberately has no switches for them (the find-people / people-you-may-know features were removed). `PUT /users/me/settings` must send **only the toggled key** — never the whole object — so stored values for those hidden keys are never overwritten. Unknown privacy keys are ignored by the server.
5. **Optimistic toggles with two race guards:** per-key in-flight dedup (ignore taps while that key's PUT is pending), and "drop the GET snapshot if any PUT is pending". The PUT echo is intentionally discarded. Keep both when porting.
6. `S.userSettings === null` renders every toggle ON (fallback `true`). Because the GET is fired *after* the overlay opens, toggles can visibly flip from ON to the real value ~100 ms later. iOS could keep the last-known snapshot or show a loading state.
7. **Dark mode and language are device-level** (`localStorage.cl_theme`, `cl_lang`) — not per account, not synced to the server, and not cleared on logout. Language change = full page reload in H5; dark mode applies instantly with a toast. The Dark mode row shows no on/off indicator (static `contrast` icon).
8. **Dictionary-based i18n means many toasts/dialogs stay English in zh mode** (see §5.3 "—" cells): logout title, dark-mode toasts, all password/nudge/report/toggle result toasts. The change-password *placeholders* do translate (they're in `ZH_PLACEHOLDER`) while their titles/labels don't. Decide whether to preserve or fix; §5 gives exact copy either way.
9. **No delete-account flow** in-app; the Help Center FAQ #8 and Privacy §6/§8 route deletion to `contact@unimatcha.ai`.
10. **Email row looks tappable (`cursor-pointer hover:bg-…`) but does nothing.**
11. **Layout quirks worth normalising on iOS:** Settings header has no gap between back arrow and title (Content overlay header has 16 px); icon rows in Settings have 0 gap between icon and label whereas profile rows use 16 px. Toggle track 40×20 with a 16 px knob inset 2 px.
12. **Overlay stacking:** Settings z-50; Content/Contact/Report z-60; card dialogs z-120; language dialog z-999; toast z-999. Content overlay is reachable while logged out (auth-page footer), so it must not depend on user state.
13. **Swipe-back** applies to Settings and Content (they contain `arrow_back`), not to the Contact/Report modals or the card dialogs. Threshold: start ≤30 px from left edge, release ≥80 px; panel follows the finger without fading.
14. **Safe area:** header uses `padding-top: env(safe-area-inset-top)` on the fixed header and an equal `margin-top` on `<main>`; the main's own `pt-24` (96 px) is additional. Toast sits at 16 px + safe-top.
15. **Report modal** resets fields on every open (category `bug`), disables the button during submit, and closes on success; description is required, contact optional; server rejects >2000 chars with a toasted validation message.
16. `openLoveMode` is dead code but documents a real dual-mode pitfall: `S.matchStatus` is a `{romantic, friend}` bucket, and `/matching/status` must always be called with `?mode=`.
17. Version string "Unimatcha v2.4.0" is hard-coded in two places (settings footer, profile footer) — iOS should read from the bundle instead.
