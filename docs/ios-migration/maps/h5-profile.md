# H5 module map — `profile` (Profile tab, Profile Setup, Edit Profile, Student Verification, Energy purchase, My Tickets, Contact Us, Content pages, Partner profile)

Source of truth read for this map:
- `apps/h5/src/modules/profile.js` (1573 lines, read in full)
- `apps/h5/index.html` — `#page-profile-setup` (L363–578), `#tab-profile` (L768–852), `#partner-profile-overlay` (L1239), `#edit-profile-overlay` (L1246–1405), `#add-interest-overlay` (L1407), `#verify-overlay` (L1421–1448), `#milestone-overlay` (L1714), `#content-overlay` (L1731), `#tickets-overlay` (L1743), `#ticket-detail-overlay` (L1755), `#contact-overlay` (L1767), `#modal-energy-purchase` (L1866–1919), Tailwind config (L23–97)
- `apps/h5/src/styles/main.css` — `.overlay`, `.page`, `[id^="tab-"]`, `.btn-cta/.btn-secondary`, `.tag-chip`, `.profile-*`, `.pf-*`, `#profile-hero`, `.profile-blur-mask`, `.energy-cell`, `.ptr-indicator`, `.ticket-*`, `#toast`, safe-area rules, dark-mode token overrides
- Helpers it depends on: `core.js` (api/uploadImageFile/openOverlay/closeOverlay/hideOverlay/attachPullToRefresh/edge-swipe-back/btnBusy/codeCooldown/safeUrl/safeCssUrl/flatEmptyIcon/toast/checkUserState/switchTab/showPage/cleanupUserState), `i18n.js` (ZH dictionary, ZH_PLACEHOLDER, META_ZH, metaLabel, getLang, MutationObserver), `settings.js` (openContentPage/CONTENT_PAGES/openContactUs/openSettings), `match.js` (viewPartnerProfile/renderPartnerProfile/promptSetNote), `state.js`
- Backend contracts confirmed in `apps/api/src`: profiles, uploads, users (verification + public-profile), metadata, energy, events (tickets/mine), `common/interceptors/transform.interceptor.ts`

Existing iOS code note: `apps/ios` is a 7/13-generation client (dark neon theme). The H5 described here is the **light theme** (`#f9f9f9` background) with an optional dark mode (`html.dark`, warm-black `#121110`). Everything below describes the current H5.

---

## 0. Global design tokens used on these screens (from `index.html` Tailwind config + main.css)

| Token | Value | Notes |
|---|---|---|
| `neon` | `#CCFF00` | brand accent (CTAs, chips, energy cells, verified badge). Always **black text** on neon. |
| `neon-pink` | `#FF2EC4` | required-field asterisks, verify-code hint text |
| `primary` | `#000000` | "ink" |
| `background` / `surface` / `surface-bright` | `#f9f9f9` | page ground |
| `surface-container-lowest` | `#ffffff` | cards |
| `surface-container-low` | `#f3f3f3` | **all soft-filled inputs / selects** |
| `surface-container` | `#eeeeee` |  |
| `surface-container-high` | `#e8e8e8` | used/empty state plates |
| `surface-container-highest` | `#e2e2e2` | wizard progress track |
| `on-surface` | `#1b1b1b` | primary text |
| `on-surface-variant` | `#474747` | secondary text, labels |
| `outline` | `#777777` | tertiary text, placeholders, dashed borders |
| `outline-variant` | `#c6c6c6` | hairlines, chevrons, empty energy cell border |
| Fonts | `Plus Jakarta Sans` (headline/body/label, weights 200–800; CJK fallback PingFang SC / Noto Sans SC), `JetBrains Mono` (ticket codes only) |  |
| Icons | Material Symbols **Rounded** (`.material-symbols-outlined` class, variable font; `FILL 1` used for filled variants) |  |
| Radius | Tailwind `rounded-*` all map to **10px** (sm…3xl); `rounded-full` = pill. Explicit `rounded-[12px]`, `[14px]`, `[18px]`, `[20px]`, `[24px]` appear where noted. |  |
| Toast | `#toast`: fixed, `top: 16px + safe-area-top`, centered, black bg, white 14px text, 12×24 padding, r10, shadow, 3000 ms default, `slideDown` 0.3s. Single global toast, text-only. |  |
| Overlay | `.overlay`: fixed inset-0, flex column, z-50 by default, `opacity 0.25s` fade in/out (no slide unless a child carries `.bottom-sheet-transition`/`.slide-*`). `.active` toggles it. Overlays are **stacked DOM layers**, not a nav stack: opening never closes the one below; `closeAllOverlays()` wipes all on logout/401. |  |
| Dark mode | `html.dark`: ground `#121110`, cards `#1c1b19`, inputs `#23211f`, text `#eceae6` / `#aaa8a3` / `#8c8a85`, borders `#343230`. `.btn-secondary` in dark gets light text/border. Neon stays neon with black text. |  |
| Safe area | `viewport-fit=cover` + `apple-mobile-web-app-status-bar-style=black-translucent`: content extends under the status bar; every fixed/sticky top bar gets `padding-top: env(safe-area-inset-top)` and `h-16` bars become `4rem + inset`. `--sat`/`--sab` CSS vars mirror the insets. |  |

Response envelope: **every** API reply is `{ success, data, message?, timestamp }` (TransformInterceptor). `window.api(path, method, body)` returns the raw envelope; code reads `res.data || res`. 401 → token cleared, all polling/SSE stopped, `cleanupUserState()`, all overlays closed, jump to auth page, throws `Unauthorized`. Non-2xx → throws `Error(data.message || 'API <status>')`; toasts show `e.message` verbatim (backend messages are English).

---

## 1. Screens & states

### 1.1 Profile Setup page — `#page-profile-setup` (owned by this module; shown after register, or on login when `hasProfile` is false)

Entry: `showPage('page-profile-setup')` — from `doRegister()` (auth.js) and `checkUserState()` (core.js) when `GET /users/me` returns `hasProfile=false` (backend: `!!(profile && profile.nickname)`). `profile.js` monkey-patches `window.showPage` so that showing this page id calls `initProfileSetupPage()`.
Exit: `saveProfile()` success → `S.homeView='chat'; switchTab('match'); renderQuestionnaireCards()` (lands on the home Chat view with the two optional questionnaire cards). Back arrow in header → `showPage('page-auth')` (no confirmation; unsaved state lost, token still stored).

Layout (`.page`: fixed inset-0, `#f9f9f9`, scrolls itself):
- **Fixed header** h-16 (+safe-area), `bg-surface/80 backdrop-blur-xl`, bottom hairline `outline-variant/20`, px-6: left `arrow_back` button (p-2, -ml-2), centered title **"Profile Setup"** (bold, base 16px), right spacer w-10.
- `<main class="pt-24 pb-12 px-6 max-w-2xl mx-auto">` (content starts 96px below top; plus safe-area margin from `.fixed.top-0 ~ main`).

**State A — required-info wizard `#setup-wizard`** (4 steps, one per screen; `setupWizardStep` module-local):
- Progress row (mb-12): step label `#setup-step-num` "1 / 4" (headline 12px extrabold, tracking 0.2em, `outline` color) + 2px track (`surface-container-highest`) with neon fill `#setup-step-bar` width = `(i+1)*25%`, 300 ms transition.
- Step 0 Nickname: h2 24px extrabold "What should we call you?", sub 14px `on-surface-variant` "Your nickname is what others see." (mb-10), label 10px bold tracking 0.2em "Nickname" + pink `*`, input `#setup-nickname` (18px, soft-filled `surface-container-low`, r10, px-3 py-2.5, focus ring 1px neon, placeholder "The Scholar").
- Step 1 Real name: "Your real name" / "Only shown to confirmed partners." / label "Real name *" / 2-col grid inputs `#setup-givenname` (placeholder "Given name (名)") and `#setup-familyname` ("Family name (姓)").
- Step 2 Gender: "How do you identify?" / "Used for matching. Not shown publicly." / label "Gender *" (mb-4) / 2×2 grid of `.gender-btn` (py-4 px-4, r10, 1px `outline-variant` border, 14px label, tracking-wider): Male / Female / Non-Binary / Other → values `male|female|non_binary|other`. Selected = neon fill + black text (`data-selected="true"`); others outlined.
- Step 3 Birthday: "When were you born?" / "We show your age, never your birthday." / label "Birthday *" / native `<input type=date>` `#setup-birthday` with `min = today−40y`, `max = today−16y`.
- Footer row (mt-14, gap-4): `#setup-prev-btn` "Back" (text button, hidden on step 0) + `#setup-next-btn` `.btn-cta flex-1` (neon block, black bold 14px tracking-widest, py-5, r10) labelled "Next" (steps 0–2) / **"Continue"** (step 3).

**State B — optional details `#setup-rest`** (`space-y-16`, shown after step 3 passes; wizard hidden; page scrolled to top):
1. Avatar section (centered): `#setup-avatar` 128×128 circle, 2px **dashed** `outline-variant` border, `surface-container-lowest` bg, inside `add_a_photo` icon (30px) + "Upload" (10px bold headline). Tap → hidden `<input type=file accept=image/*>` `#avatar-file-input`. Caption below (mt-4, 12px label tracking-widest): "Your Academic Identity".
2. "Basic Info" section header (headline bold 20px + hairline to the right, `outline-variant` at 30% opacity), then `space-y-8`:
   - University / School `#setup-school`, City `#setup-city`, Major `#setup-major`, MBTI `#setup-mbti`, Nationality `#setup-nationality` — native `<select>`s styled as **underline** fields (transparent bg, bottom 1px `outline` border, focus 2px black, 18px text, py-3). Placeholders: "Select Institution" / "Select City" / "Select Major" / "Select MBTI" / "Select Nationality". Options loaded from `/metadata/*` (see §3).
   - "Looking For": 3-col `.genderpref-btn` Men / Women / Anyone → `male|female|any`; **Anyone pre-selected**.
   - "Academic Year": `#setup-grade` soft-filled select (14px medium, `surface-container-low`, r10, py-2.5 px-3 pr-8) + absolute `expand_more` icon (18px, outline color) on the right. Options = the 10 `GRADE_OPTIONS` (placeholder "Select Grade").
3. "Interests" section: `#setup-tags-list` chips (flex-wrap gap-2) rendered from `S.setupTags`; 4 preset outlined buttons (px-4 py-2, r10, 12px label tracking-widest) **Linguistics / Philosophy / Digital Art / Architecture** → `addSetupTagValue(x)`; then input row: `#setup-tag-input` (14px soft-filled, placeholder "Add new interest...", `enterkeyhint=done`, Enter → `addSetupTag()`) + neon "Add" button (px-5 py-2.5, r10, 12px bold tracking-widest).
4. "Bio" section: label "Academic Manifesto", textarea `#setup-bio` (4 rows, soft-filled, **p-6**, 14px italic placeholder "Briefly describe your academic pursuits...", `maxlength=250`, no resize), right-aligned counter "`<n>` / 250 characters" (10px tracking-widest).
5. Final: full-width neon button "Confirm Profile" (py-5, r10, extrabold 14px, **tracking 0.3em**) → `saveProfile()`; fine print (mt-6, centered 10px `outline`): "By continuing, you agree to the Academic Code of Conduct."

Chip style (`.tag-chip`, load-bearing class): inline-flex, gap 6px, r10, padding 4px 12px, 12px bold, tracking 0.08em; selected chips are inline-styled **neon bg + black text + neon border**; each has a trailing `×` (`.tag-remove`, weight 400, 70% opacity).

### 1.2 Profile tab — `#tab-profile` (bottom-nav "Profile")

Entry: bottom nav `switchTab('profile')` → `loadProfileTab()` every time (no caching of the render). Data is entirely `S.currentUser.profile` (already loaded by `/users/me`); the only network call on open is `GET /energy/balance` (fire-and-forget).
Exit: other bottom-nav tabs.

Structure (`[id^="tab-"]` = fixed inset-0, `#f9f9f9`, z-41; the tab itself does not scroll — `#profile-scroll` does):

**Layer 0 — hero `#profile-hero`** (absolute top-0, full width, z-0, `overflow:hidden`, `pointer-events:none`):
- height `--hero-base = 400px + safe-area-top`, `transition: height 0.45s cubic-bezier(.22,1,.36,1)`.
- `<img id="profile-bg">` absolute inset-0, `object-cover`, `object-position: center 30%`. Source = `profile.coverUrl`, else an 8×8 **`#d4d4d4` gray SVG placeholder** (never blank).
- `.profile-blur-mask` absolute inset-0, z-10, `backdrop-filter: blur(12px)`, mask gradient so blur strength goes **0.4 at top → 0.72 at 42% → 1.0 at bottom**; `opacity` 1 at rest, transition 0.45s; the pull gesture drives opacity toward 0 (see §2).
- No white gradient at the bottom (removed on purpose): hero bottom edge hard-meets the white panel.

**Layer 1 — scroller `#profile-scroll`** (absolute inset-0, `overflow-y:auto`, z-10, `overscroll-behavior-y: none` — **must be none, not contain**, so the native rubber-band never doubles the JS pull). Inside `#profile-menu-inner` (the element the pull-to-refresh translates):
1. `.profile-top-spacer` height `88px + safe-area-top`.
2. `<section class="profile-hero-text px-6 mb-[86px]">` — **white text with text-shadow `0 1px 6px rgba(0,0,0,.45)`** (covers are usually dark photos):
   - Row (`flex items-end gap-4`): `#profile-avatar` **92×92** circle, white bg, `ring-[3px] ring-white/90`, shadow `0 6px 20px rgba(0,0,0,.3)`; content = `<img object-cover>` of `avatarUrl`, else centered `person` icon (48px, `outline-variant`).
     Right column (`min-w-0 flex-1 pb-1.5`): name row `flex items-center gap-2`: `#profile-name` h2 **28px extrabold tracking-tight, truncated** = `profile.nickname || 'Your Name'`; then `#verify-btn` (see states below). Under it `#profile-meta` (mt-1.5) = `<span class="pf-school">` **neon `#CCFF00` 13px bold tracking .02em** = `metaLabel(profile.school || 'University')`.
   - `#profile-facts` (mt-6) rendered by `renderProfileFacts()`:
     - `.pf-primary` (14px, weight 600, white 95%, line-height 1.75): `realName · age · grade` joined by `.pf-sep` "·" (8px margins, 45% opacity). realName = `profile.realName || givenName + ' ' + familyName`; age → zh "`N` 岁" / en "`N`"; grade → `metaLabel(grade)`. Row omitted if all empty.
     - `.pf-secondary` (12px, weight 500, white 72%, mt 5px): `学号 <studentId>` / `ID <studentId>` · `已加入 N 天` / `Day N` where N = `max(1, floor((now − joinedAt)/86400000) + 1)`; joinedAt = `profile.joinedAt || currentUser.createdAt || profile.createdAt`.
     - `.pf-signature` (mt 14px, 13px, white 88%, lh 1.65, **clamped to 2 lines**) = `profile.signature`.
   - `#profile-photos-strip` — always forced `display:none` and emptied (own profile intentionally hides the photo strip).
3. **White panel**: `bg-background rounded-t-[24px] -mt-6 px-6 pt-7 pb-32 max-w-lg mx-auto relative` — overlaps the hero bottom by 24px with 24px top corners (the cover shows through the corner notches). The 86px section margin + −24px pull-up is what makes the white panel start ≈24px above the hero's bottom edge.
   Menu rows (each `w-full flex items-center justify-between py-4 border-b border-outline-variant/20`, left `flex items-center gap-4` with a 24px Material icon in `on-surface` + 14px medium tracking-wide label, right `chevron_right` in `outline-variant`):
   - `#profile-energy-section` — icon `flash_on` **filled**, label "Energy"; middle `#energy-display` (`flex items-center gap-1 flex-1 flex-wrap justify-end`) = energy cells (see below); tap → `openEnergyModal()`.
   - `confirmation_number` "My Tickets" → `openTickets()`.
   - `person_outline` "Edit Profile" → `openEditProfile()`.
   - `mail_outline` "Contact Us" → `openContactUs()` (settings.js).
   - `settings` "Settings" → `openSettings()` (settings.js, separate mapper).
   - Footer `<p>` centered mt-10, 10px `outline` tracking-widest, `data-no-i18n`: **"Unimatcha v2.4.0"**.
   - There is **no Logout row** on the Profile tab (it lives in Settings).

**Energy cells `#energy-display`** (`renderEnergyDisplay`): `.energy-cell` = 14×14 square, r3, **neon filled** = available energy; `.energy-cell--empty` = transparent with 1px `#c6c6c6` border = used energy. Max **5 cells** total: `filled = min(avail,5)`, `empty = min(max(total−avail,0), 5−filled)`; if `total > 5` append "`+N`" (10px `outline`, N = total−5); if nothing at all → a muted "0". `avail = max(0, availableEnergy)`, `total = max(avail, totalEnergy)`.

**Verify badge `#verify-btn`** (`renderVerifyButton`, driven by `S.currentUser.verificationStatus`):
- `verified` → 22×22 neon circle, black filled `check` (15px), disabled, title "Verified"/"已认证".
- `pending` → pill `bg-white/22 backdrop-blur-md text-white rounded-full px-2.5 py-1`, `hourglass_top` 13px + "Pending"/"审核中" (10px bold tracking-wider), disabled.
- anything else (`unverified`, `rejected`, missing) → same pill, `verified_user` 13px + "Verify"/"认证", tappable (`active:scale-95`) → `openVerify()`.

**Pull-to-refresh** on `#profile-scroll` (bound once via `setupBgPullReveal`, `contentSelector='#profile-menu-inner'`): standard component (see §2) plus hero growth + blur dissolve. Refresh action = `loadProfileTab()` (re-renders from state + refetches energy; it does **not** refetch `/users/me`).

### 1.3 Edit Profile overlay — `#edit-profile-overlay` (z-50, full screen, `bg-surface`, panel `max-w-[430px] mx-auto h-full flex-col overflow-hidden`)

Entry: Profile tab row → `openEditProfile()` (also aliased `openEditHomepage`). Exit: header "Cancel" → `hideOverlay` (discard, no confirm), or "Save" success → `closeEditProfile()`. **Not** registered for edge-swipe-back (header has no `arrow_back`).

Header (flex child, `h-16 shrink-0 px-6`, hairline bottom, `bg-surface/80 backdrop-blur-xl`, safe-area padded): left text button **"Cancel"** (`on-surface-variant`, medium), center title **"Edit Profile"** (headline extrabold 18px), right `#edit-save-btn` neon pill (`rounded-full px-5 py-2`, 12px bold tracking-widest, `disabled:opacity-50`) **"Save"**.
Body: `flex-1 overflow-y-auto px-6 pt-6 pb-32 space-y-9`; a 96px-high `bottom-sheet-gradient` (`rgba(249,249,249,.5)`) sits absolute at the bottom, pointer-events none.

Sections top-to-bottom:
1. **Avatar + Cover row** (`flex items-center gap-4`): `#edit-avatar` 96×96 circle (`surface-container-low`, 1px `outline-variant/40` border, overflow hidden; content = current avatar img, else `add_a_photo` 30px + "Add Photo" 9px bold) with a **28px neon camera badge** (`photo_camera` 15px) at bottom-right; tap → hidden file input `#edit-avatar-file` (`accept=image/*`). Beside it `#edit-cover-preview` `flex-1 h-24 rounded-[12px]` cover image (falls back to an 8×8 `#e5e5e5` SVG) with the same neon camera badge bottom-right (`bottom-2 right-2`); tap → hidden `#edit-cover-file`.
2. Fields (`space-y-7`), every label = 10px bold tracking-widest `on-surface-variant`, every input = soft-filled `surface-container-low`, r10, px-3 py-2.5, focus 1px neon ring:
   - **Nickname** `#edit-nickname` (16px medium).
   - **Real name** — label suffix in `outline` normal-case: "· only shown to confirmed partners"; 2-col `#edit-givenname` / `#edit-familyname` (14px, placeholders "Given name (名)" / "Family name (姓)").
   - **Bio** with right counter "`n` / 250" (10px `outline`); textarea `#edit-bio` 3 rows, `maxlength=250`, 14px.
   - **Signature** with counter "`n` / 100"; textarea `#edit-signature` 2 rows, `maxlength=100`, placeholder "A short line about you".
   - 2-col grid (`gap-x-4 gap-y-6`):
     - **Gender** `#edit-gender` select: "Select Gender" (value "") / Male / Female / Non-binary / Other (`male|female|non_binary|other`) + `expand_more` 18px absolute right.
     - **Birthday** — label row also shows `#edit-age-hint` (10px `outline`, `data-no-i18n`) = "Age N" / "N 岁" live from the date; `<input type=date>` `#edit-birthday`, min/max = today−40y / today−16y.
     - **School** `#edit-school`, **Grade** `#edit-grade`, **City** `#edit-city`, **Major** `#edit-major`, **MBTI** `#edit-mbti`, **Nationality** `#edit-nationality` — selects, same style, placeholders "Select School/Grade/City/Major/MBTI/Nationality".
     - **Student ID** `#edit-studentid` text, `maxlength=32`, placeholder "e.g. 2312345".
3. **Interests** (`space-y-6`): `#edit-tags-list` = neon chips with `×` from `S.editTags` + trailing dashed **"+ Add"** chip (`.tag-chip.add-tag`: `#777` text, 1px dashed `#777`) → `openAddInterest()`.
4. **Photo Portfolio** (`space-y-3`): `#edit-photo-grid` 3-col grid gap-2, **6 slots**: filled slot = square, r10, 1px `outline-variant/40` border, `<img object-cover>`, 20×20 `bg-primary/70` white "×" at top-1 right-1 → `removeProfilePhoto(i)`; empty slot = square, **dashed** `outline-variant` border, centered `add` icon in `outline`, hover black → `triggerProfilePhotoUpload()`.
5. **Gift jar** (`space-y-3`): five text inputs `#edit-gift-0..4`, placeholders "Gift 1"…"Gift 5" (14px).

### 1.4 Add Interest popup — `#add-interest-overlay` (z-60, dim `bg-black/40 backdrop-blur-[2px]`, centered)

Card `max-w-xs mx-6 bg-surface rounded-[10px] shadow-2xl p-6`: title row "Add Interest" (headline 16px bold) + `close` icon button (`outline`, hover black); input `#add-interest-input` (`maxlength=20`, 16px, placeholder "e.g. Photography", Enter → confirm); `.btn-cta w-full mt-6` "Add". Tap on the dim backdrop closes. Opened only from the "+ Add" chip; input focused after 60 ms.

### 1.5 Student Verification popup — `#verify-overlay` (z-60, dim backdrop, centered; card `max-w-sm mx-6 bg-surface r10 shadow-2xl p-6 max-h-[88vh] overflow-y-auto`)

Entry: `#verify-btn` when status is not `pending`/`verified` (`openVerify()` guards this again). Exit: `close` icon, backdrop tap, or successful submit.
Contents top-to-bottom:
- Title "Student Verification" (16px bold) + `close` button (mb-4).
- Label "Student ID Card"; `#verify-card-preview` `aspect-[16/10]` r10, 1px **dashed `outline`** border, `outline` text, centered `add_a_photo` (30px) + "Tap to upload" (10px bold tracking-widest); after a pick shows `hourglass_top` with `.cl-pulse` (1.8s scale/opacity pulse) while uploading, then the image (`object-cover`); tap → hidden `#verify-card-file`.
- Hint (10px `outline`, mb-5): "Upload a clear photo of your student ID — an admin will review it."
- Label "School Email"; row: `#verify-email` (`type=email`, placeholder "you@university.ac.uk", 14px soft-filled, flex-1) + `#verify-sendcode-btn` `.btn-secondary` (outlined black, 10px, px-3 py-2) **"Send code"**.
- `#verify-code-hint` (10px **neon-pink**, hidden until a code is sent) — shows backend message, or in dev "Dev mode (no email service yet): your code is 123456".
- Label "Verification Code" (mt-3); `#verify-code` text input, `inputmode=numeric`, `maxlength=6`, placeholder "6-digit code", 16px, **letter-spacing 0.3em**, mb-6.
- `.btn-cta w-full` **"Submit for review"**.

### 1.6 Partner / public profile — `#partner-profile-overlay` (z-70, full screen `bg-surface`, panel `max-w-[430px] mx-auto h-full flex-col`; `#partner-profile-content flex-1 overflow-y-auto`)

Rendered by **match.js** (`viewPartnerProfile(userId, matchId?)` → `renderPartnerProfile(p)`); profile.js explicitly does not render it. Callers: chat header avatar (`openChatPartnerProfile` → passes `S.chatPartnerId, S.chatMatchId`), addfriend.js contact rows, match cards. Opening sets `S.viewingProfileId = userId`, reports `openedProfile` behaviour event when `matchId` given (`POST /matching/feedback/events {events:[{matchId,type:'openedProfile'}]}`, deduped per session), opens the overlay **immediately (empty)**, then fetches `GET /users/:id/public-profile`.
Exit: the only close control is the in-content back button `.pp-back` (absolute `top-4 left-4`, offset by safe-area via CSS, 36×36 `bg-black/35 backdrop-blur` white circle, `arrow_back` 20px) → `hideOverlay`. Edge-swipe-back works because the panel contains `arrow_back`. **Known defect**: if the fetch fails only a toast fires; the overlay stays open blank with no back button and swipe-back also fails (no arrow in DOM) — user is stuck (documented in CLAUDE.md 8/19). iOS: always render a back control regardless of load state.

Layout top-to-bottom:
- Cover block `h-60` (240px) `surface-container-low`: `<img>` of `coverUrl`, or **avatar blurred (`blur-2xl scale-125`)** when no cover, or nothing; overlay gradient `rgba(0,0,0,.28) → transparent 38% → #f9f9f9 100%`; back button as above.
- `px-6 -mt-12`: avatar 96×96 in a **3px black ring** (`p-[3px] bg-primary` + inner `ring-2 ring-white`), fallback `person` 30px.
- Name row (mt-3, gap-2, wrap): nickname (headline extrabold 24px); then `verified` icon (black, 20px) if `verificationStatus==='verified'` else pill "UNVERIFIED" (9px bold, `surface-container`, `outline`); then note pill (10px bold, `surface-container`) if a chat-session note exists for this user; then a 28px round outlined button with `edit` (has note) / `add` (no note) → `promptSetNote()` (promptCard "Set a note" / label "Note" / placeholder "Leave blank to clear" → `PUT /users/me/notes {targetUserId, note}` → toast "Note saved"/"Note cleared" → `loadSessions()`).
- `realName` (12px `on-surface-variant`) — only present for confirmed connections (backend gates it).
- School line (14px medium, `school` icon 16px) = `metaLabel(school)`, `data-no-i18n`.
- Info line (12px `outline` tracking-wider): `grade · age · city` (each through `metaLabel`, joined by "  ·  ").
- "Known for N day(s)" with `calendar_month` 14px — only when backend sends `daysKnown` (confirmed connections).
- Fact grid (mt-8, 2-col gap-3): cards (`r10`, 1px `outline-variant/20`, white, p-3) for **Major / MBTI / Zodiac / Nationality** — label 9px bold tracking 0.2em uppercase `outline`, value 14px bold truncated. Only non-empty facts.
- Interest chips (mt-5, wrap gap-2): neon-filled chips (`px-3.5 py-1.5 r10 10px bold tracking-widest`). (`p.tags` would render as outlined chips via the same helper but the call passes only interests.)
- "About" (mt-8): heading 12px bold tracking 0.2em + bio 14px `on-surface-variant`.
- "Photo Portfolio" (mt-10) when `realPhotos` present (confirmed connections only): header + "N Photo(s)" (10px bold `outline`); 12-col grid `h-[260px]` (or 220 if ≤1 photo): first photo `col-span-8` (or 12), next two stacked `col-span-4`, remaining in a 3-col square grid; each tap opens the raw image (`window.open(this.src)`).
- 24px bottom spacer.
- Backend privacy: strangers get `STRANGER_SAFE_FIELDS` (nickname, school, grade, age, city, interests, bio, avatarUrl, signature, tags, major, mbti, nationality, zodiac) — **never coverUrl / realPhotos / realName**; if the target's `privacy.showProfile` is off the response is `{nickname, avatarUrl, hidden:true}` (H5 does not special-case `hidden`; it just renders name + avatar). Self or confirmed match (`RELATIONSHIP_ROMANTIC|RELATIONSHIP_MODE|FRIEND_CONFIRMED`, not dissolved) gets the full profile + `daysKnown`.

### 1.7 Contact Us — `#contact-overlay` (z-60, dim `bg-black/40 backdrop-blur-sm`, centered, `px-8`)

Card `max-w-sm bg-white shadow-2xl p-8 text-center rounded-[10px]`: `mail_outline` icon (black, 36px, mb-4); "Contact Us" (headline 18px bold); "Questions, feedback or partnership inquiries:" (14px `on-surface-variant`); **contact@unimatcha.ai** (14px bold, mb-8); neon block link **"Send Email"** (`mailto:contact@unimatcha.ai`, py-4, r10, 10px bold tracking 0.2em); outlined **"Close"** button (1px `outline-variant`, same typography) → `hideOverlay`. Backdrop tap does **not** close it (no onclick on the overlay root). Opened from the Profile row and from Settings.

### 1.8 Content pages — `#content-overlay` (z-60, full screen `bg-surface`, scrolls itself)

`openContentPage(key)` with key ∈ `help | safety | terms | privacy` (settings.js). Fixed header (h-16 + safe area, `bg-surface/80 blur`): `arrow_back` (left, `gap-4 px-6`) → `hideOverlay('content-overlay')`; `#content-title` headline 20px bold; 1px hairline below. Body `#content-body` `pt-24 pb-20 px-6 max-w-3xl`. Scroll reset to top on open. Content is picked **whole-page by language** (`CONTENT_PAGES_ZH[key]` when `getLang()==='zh'`, else English) — not dictionary-translated. Entry points: Settings rows (Help Center / Safety Tips / Terms of Service / Privacy Policy) and the auth page footer links (terms/privacy). Edge-swipe-back closes it (has `arrow_back`).
Titles: Help Center/帮助中心, Safety Tips/安全提示, Terms of Service/用户协议, Privacy Policy/隐私政策.
Help = intro paragraph + 8 FAQ items (`faqItem(q,a)`); Safety = intro + 8 tips; Terms = "Last updated: June 2026" + 10 numbered `docSection`s; Privacy = same + 10 sections. Full copy (EN + ZH) is in `apps/h5/src/modules/settings.js` L147–272 — copy it verbatim into the iOS bundle (the mapper for Settings should ship it; it is referenced here because the Profile → Contact/Settings flow reaches it).

### 1.9 Energy purchase page — `#modal-energy-purchase` (z-**100**, full screen `bg-surface`, scrolls itself)

Entry: Profile "Energy" row, and from match.js/chat.js/square.js "not enough energy" paths (`openEnergyModal()`). Exit: header `arrow_back` → `closeEnergyModal()`; edge-swipe-back registered (`SWIPE_BACK_CLOSE['modal-energy-purchase']`).
- Sticky header (h-16 + safe area, `bg-surface/80 blur`, hairline): back button + title **"Get Energy"** (headline 20px bold).
- `#energy-packages` 3-col grid gap-3 (`px-6 pt-6`, `max-w-lg`): `.energy-package` buttons (flex col, gap-1, py-5, 1px `outline-variant`, r10; selected → `border-2 border-black bg-neon/10`): big number (24px headline extrabold black) = cells, "cells" (10px tracking-widest `outline`), price "¥30" (12px bold, mt-1). Static fallback cards: **30 cells ¥30 (`pkg_30`) / 60 cells ¥58 (`pkg_60`) / 100 cells ¥88 (`pkg_100`)**; replaced by `GET /energy/packages` on every open (same values on the backend).
- "Payment Method" (10px label tracking-widest `outline`, mb-2) + `#payment-methods` `space-y-2`: `.pay-method` rows (py-3 px-4, r10, 1px `outline-variant`, `flex gap-3`; selected → `border-2 border-black` and the trailing neon filled `check_circle` becomes visible): `chat` "WeChat Pay" (`wechat`), `account_balance_wallet` "Alipay" (`alipay`), `credit_card` "Card (Stripe)" (`stripe`).
- `#energy-pay-btn` `.btn-cta` — disabled until both chosen; label states: "Select a package" → "Select a payment method" → "Pay ¥58 · 60 cells" → "Processing…".

### 1.10 My Tickets — `#tickets-overlay` (z-60) and Ticket detail — `#ticket-detail-overlay` (z-70)

Both full screen `bg-surface`, fixed header (arrow_back + title "My Tickets" / "Ticket"), `main pt-24 pb-20 px-5` (`max-w-lg` for the list). Edge-swipe-back closes either (they contain `arrow_back`; the list closes via generic `hideOverlay`, the detail via `closeTicketDetail`).
List states (`#tickets-content`): loading "Loading…" (centered 14px, pt-16); error = `flatEmptyIcon('cloud_off')` (64×64 r18 `#efefef` plate, 28px `#8a8a8a` icon) + "Failed to load tickets" (16px extrabold) + underlined "Retry" (10px bold tracking 0.2em, black bottom border) → `loadMyTickets()`; empty = `flatEmptyIcon('confirmation_number')` + "No tickets yet" + "Tickets you get for campus events appear here." (14px `on-surface-variant`).
Ticket card (`article.ticket-card mb-5 rounded-[14px] bg-white border outline-variant/20`, `opacity-60` unless `status==='valid'`, whole card tappable → `openTicketDetail(i)`):
- top stub `p-5 pb-4`: title (16px extrabold, `data-no-i18n`) + status badge (9px bold tracking-widest pill: **VALID** neon/black; **USED** / **CANCELLED** `surface-container-high`/`on-surface-variant`); line "YYYY-MM-DD HH:MM · venue" (12px); paid line "N cells"/"N 格能量" only when `pricePaidCents>0` (`cells = ceil(pricePaidCents/100)`); school (10px `outline` tracking-widest, `metaLabel`).
- perforation: two 22px circles in page colour (`#f9f9f9`, dark `#17171c`) at left/right −11px + dashed divider (2px dashed `rgba(0,0,0,.12)`, margin 0 22px).
- bottom stub `p-5 pt-4 flex gap-5`: QR box 86×86 (white, p-1.5, r10, 1px border) containing a **74×74 QR of `ticket.code`** (qrcodejs, EC level M); right: "TICKET CODE" (10px tracking 0.2em `outline`), code in **JetBrains Mono 14px bold tracking-wider**, "Tap to open" with `touch_app` 13px.
Detail (`#ticket-detail-content`): `.pass-card` (`max-w-sm rounded-[20px] bg-white overflow-hidden`, shadow `0 18px 48px rgba(0,0,0,.18)`, `opacity-70` if not valid): neon header (`px-6 pt-6 pb-5`, black text) with "UNIMATCHA · TICKET" (10px bold tracking .25em 70%), title (20px extrabold), school (11px 70%); perforation row; "DATE" / "TIME" columns (label 9px tracking .2em `outline`, value 14px bold) and optional "VENUE"; centered 200×200 white QR box with a **180×180 QR**; code in mono 16px bold tracking .15em (selectable); caption "Show this QR at the entrance" or "This ticket has been used" (11px `outline`). Labels are zh/en branched inline (日期/时间/地点, 入场时出示此二维码 / 此票已使用). An "Add to Apple Wallet" black button exists behind `ENABLE_APPLE_WALLET=false` (needs a signed `.pkpass` endpoint `GET /events/tickets/:id/pkpass`, 501 until configured) — **do not ship a dead Wallet button**.

### 1.11 Dead / vestigial code in profile.js (do not port)
- `openPreview/renderPreviewPage/renderPublicProfileCard`: targets `#preview-content`, which does not exist in index.html, and opens `#milestone-overlay` (the couple Milestone page). Nothing calls it.
- `selectYear` / `.segment-btn`: the setup grade button group was replaced by the `#setup-grade` select; `saveProfile` still reads the buttons as a fallback.
- `selectGenderSegment/updateGenderUI/updateAgeDisplay/onAgeMinInput/onAgeMaxInput/savePreferences`: helpers for the **match preferences bottom sheet** (`#filter-overlay`, `.gender-seg`, `#filter-age-min/max`, `#age-range-display` "18 — 24") — they live here for historical reasons; the sheet itself belongs to the match mapper. Behaviour: gender segment = `S.filterGender` (`male|female|all`) neon fill on the active pill; dual range sliders keep `min ≤ max` by pushing the other thumb; Save → `saveFilterPrefs()` (match.js).
- `openEditHomepage/closeEditHomepage/saveEditHomepage`: pure aliases of the Edit Profile functions.

---

## 2. Interactions

### Profile Setup
- Wizard **Next**: validates the current step (toasts, all English): step 0 "Please enter a nickname"; step 1 "Please enter your real name" (both given and family required); step 2 "Please select your gender"; step 3 "Please select your birthday" / age outside 16–40 → "Unimatcha is for students aged 16–40". Passing step 3 hides the wizard, shows `#setup-rest`, scrolls the page to top. **Back** only appears from step 1. Progress bar animates 300 ms.
- Re-entering setup with an existing profile pre-fills nickname/given/family/bio/birthday/gender/genderPref/grade and, if `S.setupTags` is empty, copies `profile.interests` into it. Text fields are only filled when empty (user edits survive a re-init). `initProfileSetupPage` has an in-flight guard (`setupInitInFlight`) so a double `showPage` doesn't fire duplicate metadata fetches.
- Avatar tap → system image picker → immediate upload (`/uploads/image` then `POST /uploads/avatar {url}`) → preview swapped to the image → toast "Avatar updated" / "Avatar upload failed: …". Upload happens **before** Confirm; it is persisted even if the user later abandons setup.
- Interests: preset button or typed value → `addSetupTagValue`: trims, ignores empty/duplicate, **cap 8 (silently ignored beyond)**; `×` removes; Enter in the input adds and clears. Chips are neon.
- Bio counter live (`n / 250 characters`), hard `maxlength=250`; payload additionally `substring(0,250)`.
- **Confirm Profile** (`saveProfile`): re-validates nickname, given+family ("Please enter your real name (given + family name)"), gender, birthday/age, 16–40; builds payload (§3), `PUT /profiles/me`; on success merges payload into `S.currentUser.profile`, sets `S.homeView='chat'`, `switchTab('match')`, `renderQuestionnaireCards()`; on failure toast "Save failed: <message>". No busy state on the button (double taps would double-PUT; idempotent upsert).
- Header back arrow → auth page (token is **not** cleared).

### Profile tab
- **Pull-to-refresh** (touch only; `attachPullToRefresh`): starts only when `scrollTop<=0` and no inner scrolled container; distance is rubber-banded `dist = 180·(1−e^(−dy/180))` (dy 90 → 70 = threshold, dy 400 → 160, cap 180); a 40×40 white circle `.ptr-indicator` (`refresh` icon 22px) slides out from under the status bar (`top: safe-area-top`), opacity `min(1, dist/40)`, icon rotates `dist/70·360°`, turns neon at `dist ≥ 70` (`.ptr-ready`); content (`#profile-menu-inner`) translates `dist` 1:1. **Profile-specific `onPull`**: `.profile-blur-mask` opacity = `max(0, 1 − dist/140)` (blur fully dissolves at 140px) and `#profile-hero` height = `--hero-base + dist` (cover grows 1:1 with the finger via object-cover — **no extra scale**, that was the "image runs faster than finger" bug). Release `< 70` → everything springs back (0.3s / 0.45s curves). Release `≥ 70` → indicator spins (`.ptr-spinning`, 0.7s linear), content holds at 70px, runs `loadProfileTab()`, minimum 600 ms, then reset. `touchcancel` resets. Only the content moves; the hero stays fixed behind.
- Tap Energy row → energy page; My Tickets → tickets; Edit Profile → edit overlay; Contact Us → contact card; Settings → settings overlay (settings.js).
- Verify pill tap → verification popup (only in unverified/rejected state).
- No long-press, no swipe on this tab. Bottom nav is the floating pill (see nav mapper); it is not auto-hidden by profile scrolling.

### Edit Profile
- Open pre-fills every control from `S.currentUser.profile` (nickname, studentId, given/family, 5 gifts, bio + counter, signature + counter, gender, birthday (`slice(0,10)`) + age hint, interests → `S.editTags` copy, avatar, cover, photo slots, grade select), opens the overlay, **then** loads the five metadata lists (cached in `S.metadataCache`) and fills the selects with the current value pre-selected. If a stored value isn't in the list it's inserted at the top so it stays selectable. Load failure → toast "Failed to load options. Please try again." (selects stay with just the placeholder; Save would then send `''` for those keys → **clears them server-side**; see gotchas).
- Live counters on bio/signature (`input` listeners bound once via `dataset.countBound`); birthday `change`/`input` → age hint.
- Avatar tap → picker → upload → `POST /uploads/avatar` → preview + `S.currentUser.profile.avatarUrl` updated + toast "Avatar updated". **Saved immediately, independent of Save/Cancel.**
- Cover tap → picker → upload → `PUT /profiles/me {coverUrl}` → preview + state + toast "Cover updated". Also immediate.
- Photo slot `+` → programmatic file input → guard `photoUploadBusy` (serialises uploads) → if already 6 → toast "Maximum 6 photos" → upload → `POST /uploads/real-photo {url}` → `realPhotos` from response → re-render slots. Immediate. `×` → `PUT /profiles/me {realPhotos: <list without i>}` → re-render; toast "Delete failed: …" on error. No confirmation dialog.
- Interests: "+ Add" → if already 8 → toast "Up to 8 interests" and no popup; popup Add/Enter → trim, ignore empty, dedupe, cap 8 (toast), re-render, close popup. `×` removes. Interests are only persisted on Save.
- **Save** (`saveEditProfile`): validation first — empty nickname → toast "Nickname required" (button untouched; an earlier bug left it stuck disabled); birthday set but age outside 16–40 → "Unimatcha is for students aged 16–40". Then `btnBusy('edit-save-btn', true)` (disabled + text "Saving…"/"保存中…"), `PUT /profiles/me` (§3), on success merge payload into `S.currentUser.profile`, toast "Profile saved!", close overlay, `loadProfileTab()` re-render; on failure toast "Failed: …"; `finally` restores the button label.
- **Cancel** discards in-memory edits (interest list, text fields) — but avatar/cover/photos changes already happened server-side.

### Student Verification
- Open resets: `S.verifyCardUrl=null`, preview placeholder, email/code cleared, hint hidden.
- Card picker → preview shows pulsing hourglass → upload `/uploads/image` → preview image + `S.verifyCardUrl`; failure resets placeholder + toast "Upload failed: …"; the file input value is cleared in `finally` so re-picking the same file works.
- **Send code**: empty email → toast "Enter your school email". Button → disabled + "Sending…"; `POST /users/me/verification/send-code {schoolEmail}`; success → hint shown (backend `message`, or dev-mode string with `devCode`), toast message, and `codeCooldown(btn, 60, 'Send code')`: button disabled showing "60s"…"1s" (language-neutral) then back to "Send code" (re-translated by the observer). Failure → toast "Failed: <message>" and button restored immediately. Backend rules: email must match `/(\.edu|\.ac\.)/` ("Please use a school email (must contain .edu or .ac.)"), 60 s resend cooldown ("Please wait a moment before requesting another code"), code valid 10 min, already verified → 400.
- **Submit for review**: guards in order — no card → "Upload your student ID card first"; empty email → "Enter your school email"; empty code → "Enter the verification code". `POST /users/me/verification/submit {studentCardUrl, schoolEmail, code}`; success → `S.currentUser.verificationStatus = data.verificationStatus || 'pending'`, toast backend message ("Verification materials submitted, awaiting admin review"), close, re-render badge to **Pending**. Failure → toast "Failed: <message>" (backend messages: "Incorrect verification code", "Verification code has expired, please request a new one", "Email does not match the verification code, please request a new one", "Too many incorrect attempts, please request a new code" (5 wrong tries burn the code), "Your verification application is under review, please wait", "Please upload your student card photo first").
- The badge does not poll; status only changes on the next `/users/me` (app relaunch/login) or after this submit.

### Energy purchase
- Open: clears selection, un-highlights, button "Select a package", opens overlay, then refreshes packages (`GET /energy/packages`; on failure the static cards stay). Selecting a package/method is pure UI (no order created). Both selections are ignored while `energyPurchaseBusy`.
- Pay: guards → toast "Please select a package first" / "Please select a payment method"; busy flag; button "Processing…"; `POST /energy/purchase {packageId}` → needs `orderId` else throws "No order id returned"; `POST /energy/purchase/confirm {orderId, packageId}` (no transactionId in mock) → `S.energy.availableEnergy = data.availableEnergy`; close; `loadEnergyBar()` (re-sync total/used); toast "Recharge successful". Failure → toast "Payment failed: …" and the button label recomputed. **Mock payment: no SDK, confirm succeeds instantly; the payment-method choice is not even sent.**
- `claimEnergy(claimType)` (`registration|daily-checkin|task-complete`) exists (`POST /energy/claim` → refresh → toast "Claimed successfully" / "Claim failed: …") but nothing in the H5 UI calls it.

### Tickets
- Open → overlay + `GET /events/tickets/mine`; list cached in `S.myTickets`; tap card → detail (re-renders QR at 180px). Retry link on error. Back arrows / edge swipe close.

### Global gestures relevant here
- **Edge swipe back** (core.js): touch starting within 30px of the left edge on the top-most active overlay that contains an `arrow_back`/`arrow_forward` icon; once horizontal (>10px, |dx|>|dy|) the whole overlay translates with the finger (no fade), release ≥80px → slide out 200 ms then close via the registry (`modal-energy-purchase` → `closeEnergyModal`, `milestone-overlay`, else generic `hideOverlay`), otherwise spring back 250 ms. Applies to: content pages, tickets, ticket detail, energy page, partner profile. **Does not** apply to Edit Profile (Cancel text button, no arrow), verification/contact/add-interest popups, or the Profile tab itself.
- Dim-backdrop tap closes: verify popup, add-interest popup. Not: contact card.

---

## 3. API calls (all `Authorization: Bearer <cl_token>`, JSON, `cache: no-store`; base = `https://api.<domain>/api/v1`, local `http://<host>:3001/api/v1`)

| Call | When | Request | Response fields used | Errors / notes |
|---|---|---|---|---|
| `GET /users/me` | app start / login (`checkUserState`, core.js) — **the source of everything the Profile tab shows** | — | `id, email, status ('BANNED'…), verificationStatus ('unverified'|'pending'|'verified'|'rejected'), createdAt, hasProfile, completedQuestionnaire, modeStates[], profile{nickname, realName, familyName, givenName, school, grade, gender, genderPref, age, city, interests[], bio, avatarUrl, socialLinks, relationshipScore, profileCompleteness, signature, coverUrl, tags[], major, mbti, nationality, realPhotos[], zodiac, wishGifts[], studentId, birthday}` | Profile tab never refetches this; edits are merged locally. `profile.joinedAt` is **not** in this payload (only in `GET /profiles/me`, which H5 never calls) → "Day N" uses `currentUser.createdAt`. |
| `GET /metadata/uk/universities`, `/uk/cities`, `/uk/majors`, `/mbti-types`, `/nationalities` | opening Setup rest-form / Edit Profile (5 parallel calls) | — | `data.items: string[]` (alphabetically sorted English values) | Cached per session in `S.metadataCache[path]` **only when non-empty**; failure → toast "Failed to load options. Please try again." and not cached. Cleared on logout. |
| `POST /uploads/image` (multipart, field `file`) | avatar / cover / portfolio photo / student card pick | file (JPEG/PNG/GIF/WebP only, ≤ 8 MB; SVG rejected) | `data.url` (absolute `https://api…/uploads/<uuid>.<ext>`) | Error message from server ("Only JPEG, PNG, GIF, or WebP images are allowed", "Please select an image to upload"). |
| `POST /uploads/avatar` | after avatar image upload (setup + edit) | `{url}` | — (`{message, avatarUrl}` ignored) | Upserts `profile.avatarUrl`. |
| `POST /uploads/real-photo` | portfolio slot upload | `{url}` | `data.realPhotos: string[]` (authoritative list; if already 6 the server returns the unchanged list with message "You can upload at most 6 real photos") | Client also pre-checks 6. |
| `PUT /profiles/me` | Confirm Profile (setup) | `{nickname, givenName, familyName, realName: "given family", school, grade (normalised to GRADE_OPTIONS), gender, genderPref ('any' default), age (int from birthday), birthday 'YYYY-MM-DD', bio (≤250), interests[]}` + `city/major/mbti/nationality` only when non-empty | full profile row (ignored) | DTO: all optional; `age` int 16–40; `gender` enum `male|female|non_binary|other`; `genderPref` enum `male|female|any`; `birthday` regex `^\d{4}-\d{2}-\d{2}$`; `signature` ≤100; `studentId` ≤32; `tags` ≤10×20 chars; `wishGifts` ≤5; `realPhotos` ≤6. Upsert merges (unsent keys keep stored values). Backend `profileCompleteness` recomputed from 16 fields. |
| `PUT /profiles/me` | Edit Profile Save | `{nickname, bio, signature, interests[], school, grade, city, major, mbti, nationality, studentId}` (the 7 select/text keys are **always sent, empty string clears**) + `givenName, familyName, realName` only if at least one name non-empty + `gender` only if chosen + `birthday, age` only if birthday set + `wishGifts[]` (non-empty gifts, always sent) | — | Never sends `coverUrl`/`realPhotos`/`avatarUrl` (dedicated paths). |
| `PUT /profiles/me` | cover picked | `{coverUrl}` | — | immediate |
| `PUT /profiles/me` | portfolio photo removed | `{realPhotos: [...]}` | — | immediate |
| `GET /energy/balance` | every Profile open, after purchase, after claim, plus match/chat/square callers | — | `data{totalEnergy, usedEnergy, availableEnergy}` → `S.energy` (client recomputes `available = total − used` if missing) | Failure is silent (console only); bar shows last cached value. |
| `GET /energy/packages` | every energy page open | — | `data[{packageId, cells, priceCny}]` → `S.energyPackages = [{id, cells, price:'¥N'}]` + re-render cards | Failure silent (static cards remain). Values: pkg_30 30/¥30, pkg_60 60/¥58, pkg_100 100/¥88. |
| `POST /energy/purchase` | Pay | `{packageId}` | `data.orderId` (also `packageId, cells, priceCny, paymentIntent{mock:true}`) | "Invalid top-up tier" |
| `POST /energy/purchase/confirm` | right after purchase | `{orderId, packageId}` (`transactionId` optional) | `data.availableEnergy` | Idempotent per `orderId` (`recharge:<orderId>` dedupe). "Missing order number". |
| `POST /energy/claim` | (no UI caller) | `{claimType, taskKey?}` | — | 1 cell per claim type, deduped. |
| `POST /users/me/verification/send-code` | Send code | `{schoolEmail}` | `data.message`, `data.devCode?` (dev only), `expiresInSec:600` | 400s listed in §2; 503 "Email service is not configured" in prod misconfig. Rate-limited 30/min/IP. |
| `POST /users/me/verification/submit` | Submit for review | `{studentCardUrl, schoolEmail, code}` | `data.verificationStatus` ('pending'), `data.message` | 5-attempt cap per code. |
| `GET /users/:id/public-profile` | partner profile open (match.js) | — | see §1.6 | 404 "User not found or profile not completed" → toast "Failed to load profile". |
| `PUT /users/me/notes` | note button on partner profile | `{targetUserId, note}` (empty clears) | — | then `loadSessions()`. |
| `POST /matching/feedback/events` | partner profile opened with a matchId | `{events:[{matchId, type:'openedProfile'}]}` | — | deduped per `matchId:type` per session; on failure the key is released for retry. |
| `GET /events/tickets/mine` | My Tickets open / Retry | — | `data.tickets[{id, code ('UMT-XXXXXXXXXX'), status ('valid'|'used'|'cancelled'), pricePaidCents, createdAt, event{id, title, venue, school, startAt, endAt, status, images}}]` newest first | error → retry state |

No polling, no SSE, no sequence tokens in this module. Only race guards: `setupInitInFlight`, `photoUploadBusy`, `energyPurchaseBusy`, `btnBusy` on Save, `codeCooldown` on Send code.

---

## 4. Client state

`S` (state.js) fields this module owns/uses:
- `S.currentUser` — full `/users/me` object; `profile` sub-object is **mutated in place** after every successful save/upload (`{...profile, ...payload}`) so Profile tab / Edit re-open read fresh values without refetching. `verificationStatus` updated after verification submit.
- `S.energy = {totalEnergy, usedEnergy, availableEnergy}` (default zeros) — shared with match/chat/square.
- `S.energyPackages` — constant fallback `[{id:'pkg_30',cells:30,price:'¥30'},{pkg_60,60,'¥58'},{pkg_100,100,'¥88'}]`, refreshed from API.
- `S.setupTags[]` — setup interests draft; `S.editTags[]` — edit interests draft (copy of `profile.interests` on open).
- `S.metadataCache{path: string[]}`.
- `S.verifyCardUrl` — uploaded student-card URL (dynamic field, not declared in state.js).
- `S.myTickets[]` — last ticket list (for detail lookup by index).
- `S.filterGender` (`'all'`) — preference sheet gender segment (match feature).
- `S.viewingProfileId` — set by match.js when a partner profile is open (used by the note button).
- Module-local (not on S): `setupWizardStep`, `setupInitInFlight`, `selectedEnergyPkg {packageId, cells, price}`, `selectedPayMethod`, `energyPurchaseBusy`, `photoUploadBusy`, `ENABLE_APPLE_WALLET=false`, `BLUR_REVEAL_DIST=140`, `ENERGY_MAX_CELLS=5`, `GRADE_OPTIONS`.
- DOM-bound flags: `dataset.countBound/hintBound/pullBound/ptrBound` — "bind once" guards; iOS equivalents are simply normal view lifecycles.

localStorage: `cl_token` (JWT), `cl_lang` (`'en'|'zh'`, default en), `cl_theme` (`'light'|'dark'`). Nothing profile-specific is persisted locally.

Cleanup on logout / 401 / account switch (`cleanupUserState`, core.js): `currentUser=null`, `energy` zeroed, `editTags=[]`, `setupTags=[]`, `metadataCache={}`, `filterGender='all'`, plus all chat/match/square/notification state; `closeAllOverlays()`. **Not cleared**: `S.verifyCardUrl`, `S.myTickets`, `S.energyPackages`, `S.viewingProfileId` (harmless: `openVerify` resets `verifyCardUrl`; tickets re-fetched on open). Dev-only field `hasProfile` decides Setup vs Home on launch.

---

## 5. i18n

Mechanism (i18n.js): language is `localStorage.cl_lang` (`getLang()`, default `'en'`); switching **reloads the page**. In zh mode a `MutationObserver` walks every added text node and replaces it when the **trimmed text exactly equals** a key of the `ZH` dictionary; `placeholder` attributes go through `ZH_PLACEHOLDER`. Any element subtree carrying `data-no-i18n` is skipped — used for all user content (nickname, facts, signature, ticket titles/codes) and for strings the code already branched by language. Metadata values (school/city/major/nationality/grade) are stored in English and only **displayed** through `metaLabel(v)` = `META_ZH[v] || ZH[v] || v` in zh mode (234 mappings, e.g. `University of Warwick → 华威大学`, `London → 伦敦`, `Computer Science → 计算机科学`, `Year 1 → 大一` etc. — copy `META_ZH` from `apps/h5/src/modules/i18n.js` L242–341 verbatim). Backend error messages and most toasts are English-only in both languages.

Run-time zh/en branches inside profile.js (not dictionary): facts row ("`N` 岁"/"`N`", "学号 X"/"ID X", "已加入 N 天"/"Day N"), age hint ("N 岁"/"Age N"), verify badge ("认证"/"Verify", "审核中"/"Pending", titles "已认证/Verified", "认证审核中/Verification under review", "进行学生认证/Get student verified"), ticket paid line ("N 格能量"/"N cell(s)"), ticket detail labels (日期/DATE, 时间/TIME, 地点/VENUE, 入场时出示此二维码/Show this QR at the entrance, 此票已使用/This ticket has been used, 添加到 Apple Wallet), Wallet toasts, `btnBusy` "保存中…"/"Saving…".

User-visible strings (EN → ZH; "—" = not in dictionary, stays English in zh mode):

Profile tab: Profile → 我的 (nav) · Energy → 能量 · My Tickets → 我的票夹 · Edit Profile → 编辑资料 · Contact Us → 联系我们 · Settings → 设置 · Verify → 认证 · Pending → 审核中 · "Your Name" → — · "University" → — · "Unimatcha v2.4.0" (no-i18n).
Profile Setup: Profile Setup → 完善资料 · What should we call you? → 怎么称呼你？ · Your nickname is what others see. → 昵称是别人看到的名字。 · Nickname → 昵称 · The Scholar (ph) → 你的昵称 · Your real name → 你的真实姓名 · Only shown to confirmed partners. → 仅对确认的伴侣可见。 · Real name → 真实姓名 · Given name (名) (ph) → 名 · Family name (姓) (ph) → 姓 · How do you identify? → 你的性别是？ · Used for matching. Not shown publicly. → 仅用于匹配，不公开展示。 · Gender → 性别 · Male → 男 · Female → 女 · Non-Binary → — · Other → 其他 · When were you born? → 你的生日是？ · We show your age, never your birthday. → 我们只展示年龄，不展示生日。 · Birthday → 生日 · Back → 上一步 · Next → 下一步 · Continue → 继续 · Upload → 上传 · Your Academic Identity → 你的头像 · Basic Info → 基本信息 · University / School → 学校 · City → 城市 · Major → 专业 · MBTI → — · Nationality → 国籍 · Select Institution → 选择学校 · Select City → 选择城市 · Select Major → 选择专业 · Select MBTI → 选择 MBTI · Select Nationality → 选择国籍 · Looking For → 想认识 · Men / Women / Anyone → — · Academic Year → 学业阶段 · Select Grade → 选择年级 · Interests → 兴趣 · Linguistics / Philosophy / Digital Art / Architecture → — · Add new interest... (ph) → 添加兴趣… · Add → 添加 · Bio → 个人简介 · Academic Manifesto → 关于我 · Briefly describe your academic pursuits... (ph) → — · "/ 250 characters" → — · Confirm Profile → 完成资料 · By continuing, you agree to the Academic Code of Conduct. → 继续即表示你同意社区行为准则。
Setup/Edit toasts (EN only): Please enter a nickname · Please enter your real name · Please enter your real name (given + family name) · Please select your gender · Please select your birthday · Unimatcha is for students aged 16–40 · Save failed: … · Failed to load options. Please try again. · Avatar updated · Avatar upload failed: … · Cover updated · Cover upload failed: … · Photo upload failed: … · Delete failed: … · Maximum 6 photos · Up to 8 interests · Nickname required · Profile saved! · Failed: …
Edit Profile: Cancel → 取消 · Edit Profile → 编辑资料 · Save → 保存 · Saving… → 保存中… · Add Photo → — · Nickname → 昵称 · Real name → 真实姓名 · · only shown to confirmed partners → · 仅对确认的伴侣可见 · Bio → 个人简介 · Signature → 个性签名 · A short line about you (ph) → 一句话介绍自己 · Gender → 性别 · Select Gender → 选择性别 · Male/Female/Non-binary/Other → 男/女/非二元/其他 · Birthday → 生日 · School → 学校 · Select School → 选择学校 · Grade → 年级 · Select Grade → 选择年级 · City → 城市 · Major → 专业 · MBTI → — · Nationality → 国籍 · Student ID → 学生卡号 · e.g. 2312345 (ph) → — · Interests → 兴趣 · + Add → — · Photo Portfolio → 照片集 · Gift jar → 礼物罐 · Gift 1…5 (ph) → — · Add Interest → — · e.g. Photography (ph) → 例如：摄影 · Close → 关闭.
Verification: Student Verification → 学生认证 · Student ID Card → 学生卡 · Tap to upload → 点击上传 · Upload a clear photo of your student ID — an admin will review it. → 上传清晰的学生卡照片，管理员将进行审核。 · School Email → 学校邮箱 · you@university.ac.uk (ph) → — · Send code → 发验证码 · Sending… → — · Verification Code → 验证码 · 6-digit code (ph) → 6 位验证码 · Submit for review → 提交审核 · toasts (EN): Enter your school email · Enter the verification code · Upload your student ID card first · Code sent · Failed: … · Submitted — pending review · "Dev mode (no email service yet): your code is N".
Energy: Get Energy → 获取能量 · cells → 格 · Payment Method → 支付方式 · WeChat Pay → 微信支付 · Alipay → 支付宝 · Card (Stripe) → 银行卡 (Stripe) · Select a package → 请选择套餐 · Select a payment method → 请选择支付方式 · "Pay ¥58 · 60 cells" (dynamic, EN) · Processing… → — · toasts (EN): Please select a package first · Please select a payment method · Recharge successful · Payment failed: … · Claimed successfully · Claim failed: ….
Tickets: My Tickets → 我的票夹 · Ticket → 门票 · Loading… → — · Failed to load tickets → — · Retry → 重试 · No tickets yet → 还没有门票 · Tickets you get for campus events appear here. → 购买的校园活动门票会出现在这里。 · VALID/USED/CANCELLED → 有效/已使用/已作废 · TICKET CODE → 票码 · Tap to open → 点击查看 · UNIMATCHA · TICKET (as-is) · Show this QR at the entrance → 入场时出示此二维码 · Add to Apple Wallet → 添加到 Apple Wallet · Apple Wallet is not enabled yet / Apple Wallet 尚未开通，请稍后再试 · Could not add to Wallet / 添加失败，请稍后再试.
Contact: Contact Us → 联系我们 · Questions, feedback or partnership inquiries: → 咨询、反馈或合作请联系： · contact@unimatcha.ai · Send Email → 发送邮件 · Close → 关闭.
Partner profile (match.js): UNVERIFIED → — · Add note / Edit note (titles) → — · Known for N day(s) → — · Major/MBTI/Zodiac/Nationality (uppercase labels) → 专业? (only "Major → 专业", "Nationality → 国籍" translate; MBTI/Zodiac stay) · About → — · Photo Portfolio → 照片集 · "N Photos" → — · Set a note → — · Note → — · Leave blank to clear → — · Note saved / Note cleared → — · Failed to load profile → —.
Content pages: whole-page ZH variants exist for all four (settings.js).

---

## 6. Cross-module links

Calls **out** of profile.js:
- core.js: `api`, `uploadImageFile`, `openOverlay/closeOverlay/hideOverlay`, `attachPullToRefresh`, `btnBusy`, `codeCooldown`, `toast`, `escapeHtml`, `safeUrl`, `safeCssUrl`, `flatEmptyIcon`, `switchTab('match')`, `showPage` (wrapped).
- i18n.js: `getLang`, `metaLabel`.
- match.js: `renderQuestionnaireCards()` after setup save; `saveFilterPrefs()` from `savePreferences`; `loadSessions` (via promptSetNote in match.js).
- settings.js: `openContactUs`, `openSettings`, `openContentPage` (from index.html rows).
- qrcodejs global `QRCode` for ticket QR.

Calls **into** profile.js from elsewhere:
- core.js `switchTab('profile')` → `loadProfileTab()`; `showPage('page-profile-setup')` → `initProfileSetupPage()` (via the wrapper).
- match.js / chat.js / square.js → `loadEnergyBar()` (after enhanced-mode changes, energy refunds, ticket purchase) and `openEnergyModal()` (insufficient energy CTA); match.js → `updateGenderUI()`, `updateAgeDisplay()` when the preferences sheet opens.
- index.html inline handlers: `openEnergyModal`, `openTickets`, `openEditProfile`, `saveProfile`, `addSetupTagValue`, `addSetupTag`, `handleAvatarFile(event,'setup'|'edit')`, `handleCoverFile`, `handleStudentCardFile`, `sendVerifyCode`, `submitVerification`, `closeVerify`, `openAddInterest/closeAddInterest/confirmAddInterest`, `selectEnergyPackage`, `selectPaymentMethod`, `confirmEnergyPurchase`, `closeEnergyModal`, `closeTicketDetail`, `selectGenderSegment`, `onAgeMinInput/onAgeMaxInput`, `setupWizardNext/Prev`, `selectSetupGender/GenderPref`, `removeSetupTag`, `removeEditTag`, `removeProfilePhoto`, `triggerProfilePhotoUpload`, `openTicketDetail`, `loadMyTickets`.
- match.js owns `viewPartnerProfile`/`renderPartnerProfile`; addfriend.js and chat.js call it.

---

## 7. Gotchas an iOS implementer must know

1. **Profile data is never refetched on the tab** — everything renders from the `/users/me` snapshot merged with local edits. On iOS either mirror the merge-after-save pattern or (better) refetch `GET /users/me`/`GET /profiles/me` on appear; if refetching `/profiles/me`, note it returns `joinedAt`, `connectCode`, `verificationStatus` too.
2. **Uploads are immediate, Save is not**: avatar, cover, portfolio add/remove and student card are persisted the moment the picker returns; Cancel on Edit Profile only discards text/select/interest/gift edits. Reproduce exactly or users will see "Cancel didn't undo my photo".
3. **Edit Save clears empty selects**: the seven select/text keys are always sent, empty string = clear. If the metadata lists failed to load, the selects hold only the placeholder and Save would wipe school/city/major/mbti/nationality/grade. The setup page, by contrast, only sends city/major/mbti/nationality when non-empty. Guard this in iOS (don't send keys whose option list failed to load).
4. **Grade vocabulary** is fixed: `Foundation, Year 1–4, Master's, PhD Year 1–4+`; `normalizeGrade` case-insensitively snaps stored values to it and unknown legacy values are kept selectable at the top of the list. School must equal a value from `/metadata/uk/universities` for campus-wall school matching elsewhere.
5. **Age/birthday**: birthday is the source; `age` is computed client-side (`floor` of full years, adjusting for month/day) and sent alongside; backend validates 16–40 and only stores what it's sent. Date pickers must clamp to `[today−40y, today−16y]`.
6. **Real name gating**: given/family name is required at setup but optional at edit; edit sends the name fields only when at least one is non-empty (so two empty boxes never wipe a stored real name). Display order is "Given Family". Real name is shown to the user themself and to confirmed partners only.
7. **Hero geometry** (replicate for the same feel): cover height 400pt + status-bar inset, spacer 88pt + inset, avatar 92pt with 3pt white ring, hero text block bottom margin 86pt, white panel overlaps hero by 24pt with 24pt top corners; pull grows the cover 1:1 (no scale), blur mask opacity `1 − dist/140`, rubber band `180·(1−e^(−dy/180))`, refresh threshold 70, spring 0.45s (.22,1,.36,1). Text on the hero is white with shadow because covers are usually dark; the school line is neon. The `#profile-scroll` must own the pull (`overscroll-behavior: none`) — in SwiftUI disable the native bounce or drive the effect from the scroll offset instead of a separate gesture.
8. **Energy display caps at 5 squares** (+N overflow), and the bar is on the Profile tab only; `S.energy` is shared with match (enhanced mode costs) and square (ticket purchase). `availableEnergy = total − used`.
9. **Verification badge** has 4 backend states but 3 visuals (`rejected` renders as "Verify" again). Status refreshes only via `/users/me`; admin approval will not show until relaunch. Verified badge = 22pt neon circle with filled black check, placed inline after the name, never top-right.
10. **Verification emails** must contain `.edu` or `.ac.`; 60 s cooldown enforced server-side (client mirrors with a countdown); dev builds get `devCode` in the response (never in prod). 5 wrong code attempts burn the code.
11. **Partner profile privacy**: strangers never receive cover, real photos or real name (fail-closed on the server; do not assume fields exist). `hidden:true` responses should render a minimal card (H5 doesn't special-case it). Always keep a back control visible even before data arrives (H5 traps the user on fetch failure).
12. **`data-no-i18n` / user content**: nickname, facts, signature, school (pre-translated), ticket text are never dictionary-translated; on iOS use proper localisation instead of text matching, but keep `META_ZH` for displaying English-stored metadata in Chinese.
13. **Escaping**: H5 had stored-XSS bugs from unescaped avatar/photo URLs; irrelevant in SwiftUI, but only load `http(s)` image URLs (reject `javascript:`/`data:` non-image).
14. **Energy purchase is a mock**: payment method is cosmetic; `purchase` then `confirm` back-to-back credits cells instantly; confirm is idempotent per `orderId`. When real IAP/SDK lands, the SDK callback slots between the two calls. Package prices are CNY (¥).
15. **Tickets**: QR encodes the raw `code` (`UMT-…`) — that is what check-in scanners read. Non-valid tickets are dimmed (60%/70%). Apple Wallet button is intentionally disabled (no Pass Type ID certificate yet; `GET /events/tickets/:id/pkpass` returns 501).
16. **Overlays stack**, they don't push/pop: z-order is Edit Profile (50) < Add Interest / Verify / Contact / Tickets / Content (60) < Ticket detail / Partner profile (70) < Energy (100). Logout/401 dismisses everything.
17. **Setup completion routing**: after Confirm Profile the app lands on Home → Chat view and shows the two optional questionnaire cards; questionnaires are not required to enter home (gate is per match mode). The version string in the footer is hard-coded "Unimatcha v2.4.0" (`data-no-i18n`).
18. The Profile tab **does not** show the photo portfolio strip (deliberately hidden), matching state, or a Logout row; all three were removed by product decision — don't resurrect them from the old iOS code.
