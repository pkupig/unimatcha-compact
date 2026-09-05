# H5 module map — `couple` (Couple Space) + `milestone` (Milestone overlay)

Source of truth read for this map:

- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/couple.js` (624 lines)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/milestone.js` (144 lines)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` (`#tab-match` / `#home-match-romantic` lines 668-722, `#milestone-overlay` lines 1713-1727, tailwind tokens lines 29-100)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` (`.home-pane`/`.home-match-pane` 596-626, `.btn-cta` 224-241, `.btn-tag` 264-285, `.bookmark-item` 1245-1246, `.milestone-bg` 318-328, `.overlay` 8-9, `#toast` 531-551, dark-mode block 193-220)
- Shared helpers in `apps/h5/src/modules/core.js` (`api`, `uploadImageFile`, `confirmCard`, `promptCard`, `toast`, `safeUrl`, `safeCssUrl`, `openOverlay/hideOverlay`, edge-swipe-back 600-700, `cleanupUserState` 215-235)
- Entry point in `apps/h5/src/modules/match.js` (`renderRomanticMatchTab` 618-632, `dissolveMatch` 983-1015, `loadMatchTab` 309-340, polling 1148-1188, `switchHomeView` 40-80)
- Backend contract: `apps/api/src/couple/couple.controller.ts`, `couple.service.ts`, `apps/api/src/matching/matching.service.ts` (`getMilestones` 1260-1300), `prisma/schema.prisma` couple models 287-359.

Design rule stated at the top of `couple.js`: **no emoji anywhere in the Couple Space; Material Symbols only.**

---

## 0. Where the module lives (entry context an iOS engineer needs)

The Couple Space is **not an overlay**. It is the content of the **Romantic pane of the Match tab** once the romantic match has reached state `relationship`.

Match tab structure (`#tab-match`, `index.html` 668-722):

- Fixed top bar, height 56px (`h-14`) + safe-area top, `bg-surface/80` + backdrop-blur. Left: round 40px `add` icon button (opens the "plus" popup menu). Center: pill segmented control **Chat | Romantic | Friend** (max-width 268px). Right: round 40px `notifications_none` button with neon badge.
- Below it, a horizontal track (`#home-track`, 3 panes, 12px gap, 100dvh tall) that slides with finger; panes = Chat list / Romantic match pane / Friend match pane. **Each pane is its own vertical scroll container** (`overflow-y:auto`, `overscroll-behavior-y:none`).
- Romantic pane: `<main id="home-match-romantic" class="home-pane home-match-pane"><div class="match-content w-full flex flex-col items-center justify-center"></div></main>`.
- `.home-match-pane` = flex column, `align-items:center`, padding `calc(56px + safe-area-top) 24px 13rem` (24px side gutters, 208px bottom padding so the CTA clears the floating bottom nav). `.match-content` gets `margin-top:auto; margin-bottom:auto` → short content is vertically centred, tall content top-aligns and scrolls (the Couple Space is always tall → top-aligned + scrolls).
- Floating bottom nav pill (`#bottom-nav`): fixed, centred, `bottom: 14px + safe-area-bottom`, white 92% blur, 1px border black/8, three icon-only items (Match / Square / Profile). It does **not** auto-hide on the romantic pane (auto-hide is bound to the Chat pane only).

Entry flow (match.js): user taps **Romantic** (or swipes to it) → `switchHomeView('romantic')` → stops polling/countdown → `ensureQuestionnaireThenMatch('romantic')` (GET `/questionnaire/completion?type=romantic`; incomplete questionnaire does NOT block a user already in `relationship`) → `loadMatchTab()` → GET `/matching/status?mode=romantic` → `renderMatchTab(status)` → `setMatchPlanLayout('romantic', false)` (centred layout, not the "plan page" layout) → `renderRomanticMatchTab` → if `state === 'relationship'`:
  - if `!partner || !partner.nickname` → renders "Profile Unavailable" card instead (`renderPartnerMissing`, `person_off` flat icon, "This profile is unavailable — it may be updating or the account has changed.", `Refresh` CTA → `loadMatchTab()`).
  - else `window.renderCoupleSpace(container, matchId, data.partner)` where `matchId = data.match?.id || data.matchId`.
- In `relationship` state the 30 s status polling is **stopped** (terminal state). The Couple Space is re-fetched only on: entering the view, every successful write (server returns the full space), `Retry`, and after "End Relationship" (`loadMatchTab()`).

Exit: swipe/tap to another pane or tab; or "End Relationship" → back to idle plan page.

---

## 1. Screens & states

### 1.1 Couple Space hub (`renderCoupleSpace` → `loadCoupleSpace` → `renderCoupleHub`)

Root wrapper: `<div class="w-full max-w-xl mx-auto py-4">` (full width inside the 24px pane gutters, 16px vertical padding). Sections stack top-to-bottom with `mb-5` (20px).

#### State A — Loading
`Loading your space…` — centred, `text-outline` (#777), 14px, `py-10`.

#### State B — Load failed
`Couldn't load your space.` + inline underlined `Retry` button (→ `loadCoupleSpace()`), same centred grey style.

#### State C — Hub (top → bottom)

**(1) Hero / cover card**
- Container: `relative rounded-[10px] overflow-hidden p-6 mb-5 text-white`, whole card is a tap target for **Edit cover** (`onclick="coupleEditCover(event)"`; ignored when the tap lands on a `button`/`a`, i.e. the status cell).
- Background: if `space.cover` → `linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.6))` over the image (`cover`, `center`); else solid **#2e1a3a** (dark plum). Text is always white regardless of light/dark theme.
- Top-right: `edit` icon, 18px, `text-white/55`, absolute `top-3 right-3`, non-interactive hint.
- Row (gap 16px): partner avatar **56×56** circle, `ring-2 ring-neon` (#CCFF00), fallback `bg-surface-container` with `person` icon `text-outline`. Right column (min-w-0): eyebrow `IN A RELATIONSHIP` 10px, tracking 0.2em, bold, `text-neon`; title `You & {nickname}` font-headline extrabold 20px, tracking-tight, single-line truncate.
- Partner bio (only if non-empty): 12px `text-white/70`, `mt-3`, relaxed leading, **clamped to 2 lines**.
- Days row (only if `daysTogether != null`): `mt-4 flex items-end gap-2`: number 48px font-headline extrabold leading-none `text-neon`; label `DAY TOGETHER` (when exactly 1) / `DAYS TOGETHER` 12px tracking-widest `text-white/70`, `mb-1`.
- Status grid: `grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/15`.
  - Left cell = **button** (→ Today's status popup): label `YOU · TODAY` 9px bold tracking-widest `text-neon` `mb-0.5`; value 14px flex gap-1: if `status.me` → preset icon (16px) + text, white; else `Set your status` `text-white/50 italic`.
  - Right cell = static: label `{NICKNAME} · TODAY` (nickname upper-cased) 9px bold `text-white/60`; value: icon + text white, or `No update` `text-white/40 italic`.
  - Preset icon lookup (`statusIcon`): case-insensitive match of the stored string against the 8 presets → Material icon; non-preset custom text has no icon.

**(2) Anniversaries section** (`section('Anniversaries', …)`)
- Section header row (`flex justify-between mb-3`): title `ANNIVERSARIES` — h2 font-headline extrabold 11px tracking 0.2em uppercase `text-on-surface`. Right cluster (`gap-1`): if there is ≥1 anniversary a `list` icon button (20px, `title="View all"`) → All anniversaries popup; always an `add` icon button (20px) → New anniversary popup. Both `text-on-surface`.
- Body: empty → `No anniversaries yet.` 14px `text-outline italic`. Else a 1-column grid, gap 12px, showing **at most 3 cards**: the 2 nearest upcoming (`daysUntil >= 0`, ascending) + the 1 most recent past (`daysUntil < 0`, sorted descending i.e. most recent first). Full list only via "View all".
- Card (full-width button → Anniversary detail popup): `bg-surface-container-lowest` (#fff) `border border-outline-variant/25 rounded-[12px] p-3 flex items-center gap-3 active:scale-[0.99]`.
  - Left "tear-off calendar" tile: width 56px (`w-14`), `rounded-[10px] overflow-hidden border border-outline-variant/30 bg-white`. Month band: future → `bg-neon text-black`, past → `bg-surface-container text-outline`; 9px bold tracking-widest centred `py-0.5`, text = 3-letter month upper-case (`toLocaleString('en',{month:'short'})`). Below: day `DD` (2-digit padded) font-headline 20px extrabold leading-none `text-on-surface` in `py-1`; year 8px `text-outline mt-0.5`. Invalid date → `--`.
  - Optional thumbnail (if `images[0]`): 44×44 `rounded-[8px] overflow-hidden bg-surface-container`, `object-cover`; if `images.length > 1` a badge bottom-right `px-1 bg-black/65 text-white text-[9px] font-bold rounded-tl-[6px]` with the count. Image load error hides the tile.
  - Text column (flex-1 min-w-0): title 14px bold `text-on-surface` truncate; sub-line 10px `text-outline tracking-wider mt-0.5` = countdown label + (`note` non-empty ? ` · note` : ``). Countdown label rules: `daysUntil > 0` → `{n} day to go` / `{n} days to go`; `=== 0` → `Today`; `< 0` → `{n} day ago` / `{n} days ago`.
  - Trailing `chevron_right` 18px `text-outline-variant`.
- Date parsing for the tile: `String(a.date).slice(0,10) + 'T00:00:00'` (local midnight).

**(3) Craving today section** (`section('Craving today', '', …)`, no header button)
- 2-column grid gap 12px. Cell style: `bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-3`.
- Left (me): header row `justify-between mb-1`: `YOU` 9px bold tracking-widest `text-outline` + `edit` icon button 15px `text-outline` (→ Craving prompt). Value 14px: `craving.me.current` in `text-on-surface`, else `Tap edit` `text-outline italic`. Below, quick-pick chips (`flex flex-wrap gap-1 mt-2`) = history entries **excluding the current one, max 5**: chip `px-2 py-0.5 rounded-[10px] bg-surface-container text-[10px] text-on-surface-variant`, tap → re-posts that text.
- Right (partner): `{NICKNAME}` label `mb-1`; value = `craving.partner.current` or `No update` italic.

**(4) "What I'm up to" section** (schedule; `section("What I'm up to", '', …)`)
- Same 2-column grid / cell style.
- Left (me): header row `mb-2`: `YOU` + `add` icon button 16px `text-outline` (→ Add schedule popup). List: empty → `Add what you're up to` 11px `text-outline italic`. If **more than 4** entries, the column becomes `max-h-64` (256px) with inner vertical scroll (`pr-1`).
- Right (partner): `{NICKNAME}` label `mb-2`; list or `No update` italic. Partner entries never show a delete button.
- Entry (`schedEntry`): `rounded-[10px] border p-2 mb-2`; active → `border-neon bg-neon/10`; expired → `border-outline-variant/20 bg-surface-container`. Row 1 (`flex items-start justify-between gap-1`): text 12px bold (`text-on-surface`; expired → `line-through text-outline`) + for **own, non-expired** entries a `close` icon button 14px `text-outline` (→ delete, no confirm). Row 2: 10px tracking-wider `mt-0.5` (`text-on-surface-variant`; expired → `text-outline`): `{start} – {end}` + (expired ? ` · record` : ``). Time format (`fmtTime`): device locale `toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})`, e.g. `Sep 3, 02:00 PM – Sep 3, 06:00 PM`.
- `expired` comes from the server (`endAt < now`).

**(5) Plans & checklist section** (bucket list; `section('Plans & checklist', addBtn, …)`)
- Header: `PLANS & CHECKLIST` + `add` icon button 20px (→ Add-to-checklist prompt).
- Body wrapped in `p-1`. Empty → `Nothing planned yet.` 14px `text-outline italic`.
- Item row `.bookmark-item`: `flex items-center gap-3 py-2.5 pl-3 pr-2 mb-2 (last:mb-0) bg-surface-container-lowest rounded-r-[10px]`, plus CSS: **left border 4px solid #CCFF00**, `box-shadow 0 1px 2px rgba(0,0,0,.04)`; dark → bg #1c1b19.
  - Checkbox button 20×20 `rounded-[6px] border`: done → `bg-neon border-neon` with `check` icon 16px black; not done → `border-outline`, empty. Tap → `coupleTickBucket(id, done)`.
  - Text button (flex-1, left-aligned; **not tappable unless done**): 14px, done → `line-through text-outline`, else `text-on-surface`. If done and it has a note or images → trailing `photo` icon 14px `text-outline`. Tap (done only) → View-completed popup.
  - Not done → trailing `close` icon button 18px `text-outline` (→ delete with confirm). **Done items have no delete affordance** (server also refuses).

**(6) Gift jar row** (`mb-5`)
- Full-width button `bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-4 flex items-center justify-between active:scale-[0.99]` → Gift jar popup.
- Left: `redeem` icon `text-on-surface` + column: `Gift jar` 14px bold `text-on-surface`; `See what {nickname} wants` 10px `text-outline`. Right: `chevron_right` `text-outline`.

**(7) Actions**
- Primary CTA `.btn-cta` (block, full width, padding 20px 24px, radius 10px, Plus Jakarta Sans 700 14px, letter-spacing .1em, `shadow-lg`):
  - not sent today → `bg-neon text-black`, label **`Send I love you`**;
  - sent today → `bg-surface-container text-outline`, `disabled` (opacity .5), label **`Sent today — see you tomorrow`**.
- Secondary link: **`End Relationship`** — full width, `py-2 mt-3`, 10px, `text-neon-pink` (#FF2EC4), medium weight, underline offset 4, tracking-widest → `dissolveMatch(space.matchId)`.

### 1.2 Popups (all built by `couplePopup(innerHtml)` unless noted)

Generic container: backdrop `fixed inset-0 z-[120] flex items-center justify-center px-6 bg-black/40 backdrop-blur-[2px]`; **tap on backdrop dismisses**. Card `w-full max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6 max-h-[85vh] overflow-y-auto`. Popups are appended to `<body>` and can stack (each at z-120). Typography: title `font-headline font-extrabold text-lg` (18px). Field style (`fld`): `w-full bg-surface-container-low rounded-[10px] border-0 px-3 py-2.5 focus:ring-1 focus:ring-neon`. Button tiers: primary `py-3 rounded-[10px] bg-neon text-black text-xs font-bold tracking-widest`; secondary `border border-outline-variant text-on-surface` same metrics; "destructive-ish" `border border-outline` (darker border) — note deletes here are NOT pink; pink appears only in `confirmCard(danger)`.

| # | Popup | Opened from | Content (top → bottom) | Actions |
|---|---|---|---|---|
| P1 | **Couple cover** (`coupleEditCover`) | tap hero card background | Title `Couple cover` (mb-1); body 14px `text-on-surface-variant` (mb-5): `Set your own cover for this space — your partner sets theirs separately.`; stacked buttons gap-3 | `Choose photo` (primary) → single image picker → toast `Uploading…` → upload → close popup → `PUT /cover {imageUrl}`; upload failure → toast `Upload failed` (popup stays). `Remove` (border-outline; **only shown when a cover exists**) → close → `PUT /cover {imageUrl:null}`. `Cancel` (secondary) |
| P2 | **Today's status** (`coupleEditStatus`) | hero "YOU · TODAY" cell | Title `Today's status` (mb-4); **4-column grid gap-2 (mb-5) of 8 preset chips**: each `flex flex-col items-center gap-1 p-2 rounded-[10px] border active:scale-95` — selected (current status equals label) `border-neon bg-neon/10`, else `border-outline-variant/30`; icon 22px `text-on-surface` + label 10px bold. Presets in order: Happy `sentiment_very_satisfied`, Loved `favorite`, Excited `celebration`, Tired `bedtime`, Sad `sentiment_dissatisfied`, Awkward `sentiment_stressed`, Anxious `sentiment_worried`, Angry `mood_bad`. Then label `OR WRITE YOUR OWN` (9px bold tracking-widest `text-outline` mb-1); text input placeholder `Custom status…`, pre-filled with the current status **only if it is not a preset**; buttons row gap-3 (no top margin) | Tap a preset → popup closes immediately, `PUT /status {status: '<Label>'}`. `Save` → `PUT /status {status: trimmed input}` (empty string allowed → clears status). `Cancel` |
| P3 | **Craving** (`promptCard`) | craving `edit` icon | Shared `promptCard`: title `Craving today`; label `WHAT DO YOU WANT TO EAT?` (10px bold tracking .2em uppercase `text-outline`); single-line input placeholder `e.g. Ramen`; buttons `Cancel` / `Save`; Enter key = Save; input auto-focused after 30 ms | Save with non-empty trimmed text → `POST /craving {text}`; cancel/empty → nothing |
| P4 | **What are you up to?** (`openAddSchedule`) | schedule `add` icon | Title; text input placeholder `e.g. Library then gym` (mb-4); label `START` + `datetime-local` input (mb-4); label `END` + `datetime-local` (mb-6); `Cancel` / `Add` | Validation: any of the 3 empty → toast `Fill in activity and times`, popup stays. Else close → `POST /schedule {text, startAt, endAt}` with the raw `YYYY-MM-DDTHH:mm` strings |
| P5 | **New anniversary** (`openAddAnniversary`) | anniversaries `add` icon | Title `New anniversary`; title input placeholder `e.g. First date` (mb-4); label `DATE` + `date` input (mb-6); `Cancel` / `Add` | Empty title or date → toast `Title and date required`. Else close → `POST /anniversary {title, date:'YYYY-MM-DD'}` |
| P6 | **Anniversary** detail (`openAnniversaryDetail(id)`) | tap anniversary card, or a row in "All anniversaries" | Title `Anniversary`; title input (pre-filled, mb-4); `DATE` + date input pre-filled with `date.slice(0,10)` (mb-4); textarea rows=2 placeholder `Add a note (optional)` pre-filled (`resize-none mb-3`); `#cp-anni-preview` **removable thumb strip** (mb-3); link-style button `add_a_photo` 16px + `Add photos` (11px bold tracking-widest underline, mb-5); row gap-3: `Delete` (`px-4 py-3 border border-outline`) + `Save` (flex-1 primary); below, `Close` full-width `mt-3` 10px `text-outline tracking-widest` | `Add photos` → multi-image picker → sequential uploads → new URLs appended to local array + strip re-rendered. Thumb `×` → removes from local array only. `Delete` → `confirmCard{title:'Delete anniversary?', confirmLabel:'Delete', danger}` → close → `DELETE /anniversary/:id`. `Save` → validation `Title and date required` → close → `PATCH /anniversary/:id {title, date, note, images}` (**image removals persist only on Save**) |
| P7 | **All anniversaries** (`openAnniversaryAll`) | `list` icon in section header | Title `All anniversaries` (mb-3); rows sorted by date ascending: full-width button `flex justify-between gap-3 py-2.5 border-b border-outline-variant/15 (last:border-0)`: left title 14px bold truncate + `YYYY-MM-DD` 10px `text-outline`; right 12px bold (`text-on-surface` if `daysUntil>=0`, else `text-outline`): `{n}d` / `Today` / `{n}d ago`. Empty → `No anniversaries.` italic. `Close` full-width `mt-5` | Row tap → closes every `.cp-all-pop` popup then opens P6 for that id |
| P8 | **Gift jar** (`openGiftJar`) | Gift jar row | Title `Gift jar` (mb-1); `{NICKNAME} WANTS` 10px bold tracking-widest `text-outline` (mb-3); chips `flex flex-wrap gap-2`: `px-3 py-1.5 rounded-[10px] bg-surface-container text-sm text-on-surface`; empty → `They haven't added any gifts yet.` italic; `Close` `mt-6` | read-only. Data = `space.gifts.partner` (partner's profile `wishGifts`, ≤5, edited in Edit Profile "Gift 1…5"). **Own gifts are never shown in the space** |
| P9 | **Add to checklist** (`promptCard`) | bucket `add` icon | promptCard title `Add to checklist`, label `PLAN`, placeholder `e.g. Watch the sunrise together` | non-empty → `POST /bucket {text}` |
| P10 | **Mark done** (`openCompleteBucket`) | tap unchecked checkbox | Title `Mark done` (mb-1); the item text 14px `text-on-surface-variant` (mb-4); textarea rows=2 placeholder `Add a note (optional)`; `#cp-bk-preview` thumb strip (mb-3); `Add photos` link button (mb-5); `Cancel` / `Done` | `Done` → close → `PATCH /bucket/:id {done:true, note, images}` |
| P11 | **Completed record** (`coupleViewBucket`) | tap text of a **done** item | Title = item text; `COMPLETED` 10px bold tracking-widest `text-outline` (mb-3); read-only gallery `grid-cols-3 gap-2 mb-3`, each image `h-24` (96px) cover `rounded-[10px] border`; note 14px relaxed `text-on-surface` or `No note added.` italic; `Close` `mt-6` | read-only; images are not zoomable |
| C1 | confirm **Mark as not done?** | tap checked checkbox | `confirmCard{title:'Mark as not done?', confirmLabel:'Yes'}` (neon confirm) | yes → `PATCH /bucket/:id {done:false}` (server clears note+images) |
| C2 | confirm **Delete this plan?** | `×` on an undone item | `confirmCard{…, confirmLabel:'Delete', danger}` (pink confirm) | → `DELETE /bucket/:id` |
| C3 | confirm **End this relationship?** | `End Relationship` link | `confirmCard{title:'End this relationship?', body:'This will end your relationship. Neither of you can message anymore.', confirmLabel:'End', danger}` | → `POST /matching/:matchId/dissolve {}` → toast `Relationship ended` → `loadMatchTab()` |

Shared `confirmCard` look: card `max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6`; title 18px extrabold (mb-2); body 14px `text-on-surface-variant` (mb-6); buttons `Cancel` (border outline-variant) + confirm (`danger` → `bg-neon-pink text-white`, else `bg-neon text-black`), both `flex-1 py-3 text-xs font-bold tracking-widest`. Backdrop tap resolves `null` (treated as cancel by all couple call sites).

Removable thumb strip (`renderThumbStrip`): `flex flex-wrap gap-2`; each cell `relative w-20 h-20` (80×80): image `object-cover rounded-[10px] border border-outline-variant/40` (hidden on load error); `×` button absolute `-top-1.5 -right-1.5`, 20×20 round `bg-black/70 text-white`, `close` icon 13px.

Toast (`#toast`): fixed, `top: 16px + safe-area-top`, horizontally centred, black bg, white 14px text, `padding 12px 24px`, radius 10px, z-999, slide-down animation, auto-hides after 3 s. Single-instance (new text replaces the old).

### 1.3 Milestone overlay (`#milestone-overlay`, `milestone.js`)

- Full-screen `.overlay` (`fixed inset-0 z-50 bg-surface overflow-y-auto`; opens by adding `.active`: opacity/visibility fade 0.25 s). **The overlay element itself is the scroll container.**
- Background layer `.milestone-bg`: fixed full-screen, `/splash_bg.png` (campus photo, in `apps/h5/public`) `cover center`, `filter: grayscale(1) contrast(1.4) brightness(.95)`, opacity 0.28, non-interactive, z 0.
- Fixed nav: `h-16` (64px + safe-area-top), `px-6`, `bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20`, z-50. Left `arrow_back` icon (`text-on-surface`, tap → `hideOverlay('milestone-overlay')`). Centre title **`Milestone`** — Plus Jakarta Sans bold 14px tracking-tight, absolutely centred. Right 24px spacer.
- `#milestone-content`: `pt-24 pb-32 px-6 max-w-2xl mx-auto relative overflow-hidden` + `margin-top: safe-area-top` (global `.fixed.top-0 ~ main` rule).
- Left-edge swipe-back closes it (registered in `core.js` `SWIPE_BACK_CLOSE`; enabled because the nav contains `arrow_back`).

States of `#milestone-content`:

- **Loading**: `Loading...` centred, `pt-24`, 14px `text-on-surface-variant tracking-widest`.
- **Empty** (`data` null or `state !== 'relationship'`): centred column `pt-20 px-6`: 80×80 circle `border border-outline-variant` with `auto_awesome` icon `text-outline text-3xl` (mb-10); h2 `No Milestones Yet` font-headline 18px extrabold tracking .2em (mb-3); p `Milestones unlock once you and your match enter relationship mode. Find your match to start the journey.` 14px `text-on-surface-variant max-w-xs`; button `Go To Matching` `mt-10 px-10 py-4 rounded-[10px] bg-neon text-black` font-headline 10px bold tracking .2em → `hideOverlay('milestone-overlay'); switchTab('match')`.
- **Data** (`renderMilestone`):
  - Decorative ring: absolute `top-40 -right-20 w-64 h-64 border-[0.5px] border-outline-variant rounded-full opacity-15`.
  - **Connection** section (`flex flex-col items-center mb-16`): two avatars 96×96 (`w-24`) `rounded-full border border-primary p-1 bg-surface shadow-sm`, gap 48px; fallback `person` icon (`text-outline text-2xl`) in a `bg-surface-container` circle; between them, absolutely centred, an SVG 48×24 sine-wave path (`M0 12C6 12 6 6 12 6C18 6 18 18 24 18C30 18 30 6 36 6C42 6 42 12 48 12`, stroke `currentColor` at `text-primary/60`, width 1.5, round caps). `mt-8` centred: eyebrow `Together Since {Month D, YYYY}` (en-US long month; fallback `Active Connection`) font-headline 12px tracking .2em bold `text-on-surface-variant`; h2 `{myName} & {partnerName}` font-headline 30px extrabold tracking-tighter `mt-1`.
  - **Stats grid** `grid-cols-2 gap-4 mb-20`: two cards (`bg-surface-container-lowest/80 backdrop-blur-sm p-6 flex flex-col justify-between h-32 border border-outline-variant/10 rounded-[10px]`): label font-label 10px tracking-widest `text-on-surface-variant` (`Messages` / `Days Matched`), value font-headline 24px weight 900. Third card `col-span-2 bg-primary text-on-primary p-6 flex items-center justify-between rounded-[10px]`: `Moments Shared` 10px + value 30px weight 900. Numbers formatted `toLocaleString('en-US')`.
  - **Timeline** `mb-20`: h3 `The Story So Far` font-headline 12px tracking .3em bold centred `mb-12`; items `space-y-16`; each `pl-8 relative` with an 8×8 `bg-primary` dot at `left:-4.5px top:4px`; eyebrow font-label 10px tracking-widest `text-on-surface-variant mb-1`; h4 font-headline 18px extrabold tracking-tight `mb-2`; body 14px `text-on-surface-variant leading-relaxed`. Four fixed items: (`{since}` or `The Beginning`, `First Match`, `Two trajectories intersected within the campus matching archive.`); (`The Correspondence`, `{msgs} Messages Exchanged`, `An ongoing conversation, growing one inquiry at a time.`); (`The Couple Square`, `{posts} Moments Archived`, `Shared fragments published to your private gallery.`); (`Today`, `Day {days}`, `The story continues — still being written.`).
  - **Shared interests** card `mb-20 bg-surface-container-low/90 backdrop-blur-sm p-8 border border-outline-variant/20 rounded-[10px]`: h3 `Shared Interests ({n})` font-headline 10px tracking .3em bold `mb-8 border-b border-outline-variant pb-4`; chips `.btn-tag` (inline-flex, transparent, 1px #777 border, radius 10px, padding 4px 12px, 12px, tracking .08em) or `No shared interests yet — keep exploring together.` 14px italic.
  - **Footer** centred: quote `"In the silence between words, we found a language composed of ink and shared curiosity."` font-body italic 11px `text-on-surface-variant px-12 leading-relaxed bg-surface/40 backdrop-blur-[2px] inline-block`; `mt-4` row of three 4×4 `bg-primary` squares gap-1.

**Entry points — there are none that are live.** `window.openMilestones` (milestone.js) and `window.openLoveMode` (settings.js: checks `S.matchStatus[mode].state === 'relationship'`, fetching `/matching/status?mode=` if the bucket is empty, then `loadMilestone()` + `openOverlay`; otherwise toast `Unlocks when you're matched`) are defined but **no markup or module calls them**. `profile.js openPreview()` also opens `milestone-overlay` but writes into a non-existent `#preview-content` and is itself uncalled. Treat the milestone overlay as a designed-but-unwired screen; if iOS ships it, pick an entry (e.g. a row in Couple Space or Profile) as a product decision.

---

## 2. Interactions (complete list)

Couple Space hub:

1. **Tap hero card (any non-button area)** → P1 Couple cover. Buttons inside the card (status cell) do not trigger it (`closest('button, a')` guard).
2. **Tap "YOU · TODAY" cell** → P2 Today's status. Partner cell is inert.
3. **Tap preset chip in P2** → instant save + close. **Save** → custom text (may be empty = clear). **Cancel** / backdrop → nothing.
4. **Tap craving `edit`** → P3 prompt → save. **Tap history chip** → immediate `POST /craving` with that text (chip's text passed through `encodeURIComponent`/`decodeURIComponent` in the inline handler — pure transport, nothing user-visible).
5. **Tap schedule `add`** → P4; validation toast if incomplete. **Tap `×` on own active schedule** → immediate delete, **no confirmation**. Expired entries and partner entries have no `×`.
6. **Tap anniversaries `add`** → P5. **Tap `list`** → P7. **Tap card** → P6. In P6: `Add photos` (multi-select, sequential upload, partial-failure toast), thumb `×` (local only), `Delete` (confirm, pink), `Save` (validates title+date), `Close`.
7. **Tap bucket `add`** → P9. **Tap unchecked box** → P10 (note + photos optional; `Done` commits). **Tap checked box** → C1 (`Yes` → un-done, wipes record). **Tap text of done item** → P11. **Tap `×` on undone item** → C2 → delete. Undone item text is not tappable (`pointer-events:none`).
8. **Tap Gift jar row** → P8.
9. **Tap `Send I love you`** → guarded by module-level `loveYouInFlight` + button `disabled` while in flight; success → whole hub re-rendered from response (button becomes the disabled "Sent today" state) + toast `Sent I love you`; failure → toast with server message (`Already sent today, come back tomorrow`) or fallback `Already sent today`; `finally` re-enables the button if the old one is still in the DOM.
10. **Tap `End Relationship`** → C3 → dissolve → toast `Relationship ended` → match tab reloads (idle plan page). Failure → toast `Failed: {message}`.
11. **Every write** (`coupleApi`): no optimistic update; on success the server returns the **entire space** and the hub is re-rendered via `innerHTML` (popups already closed before the call); on error toast `Failed: {message}` (or `Failed: try again`). No sequence tokens / dedup beyond love-you.
12. **Retry** link in the error state → `loadCoupleSpace()`.
13. **Horizontal swipe** anywhere on the pane → switches Chat/Romantic/Friend view (track follows finger, ≥70px snap, rubber-band at ends) — owned by match.js, but the Couple Space must not swallow horizontal drags. Vertical scroll is the pane's own. **No pull-to-refresh** on the romantic pane (PTR is enabled only on the Chat view).
14. **Keyboard**: promptCard single-line inputs submit on Enter; P2/P4/P5/P6/P10 inputs do not (explicit buttons). All inputs are plain HTML (`text`, `date`, `datetime-local`, `textarea`) with native pickers.
15. Haptics: none. Animations: `active:scale-*` press feedback only.

Milestone overlay: `arrow_back` tap or left-edge swipe (≥80px, horizontal lock after 10px) closes; `Go To Matching` closes and switches to the Match tab. Content is static once loaded (no refresh gesture).

---

## 3. API calls

All go through `window.api(path, method, body)` → `fetch(S.API + path)` with `Authorization: Bearer <cl_token>`, `Content-Type: application/json`, `cache: 'no-store'`. Every response is wrapped `{ success, data, message?, timestamp }` and the module unwraps `res.data || res`. Non-2xx → `Error(data.message || 'API <status>')`; 401 → global logout (token removed, pollers/SSE stopped, `cleanupUserState`, overlays closed, auth page).

### 3.1 `GET /couple/:matchId` (`loadCoupleSpace`, and returned by every write)

`matchId` = `S.coupleMatchId` (from `/matching/status?mode=romantic` → `match.id`). Response `data` (all fields used by the UI unless noted):

```
matchId: string
daysTogether: number | null        // floor((now - anchor)/86400000), anchor = relationshipStartedAt || confirmedAt || createdAt  (day 0 on confirm day)
since: ISO string                  // anchor (NOT used by UI)
partner: { userId, nickname ('Partner' if missing), avatarUrl (''), bio ('') }
me: { userId }                     // not used
cover: string                      // '' when none; MY cover for this match (per-user, stored in user.settings.coupleCovers[matchId])
loveYou: { me: { count: number, sentToday: boolean }, partner: { count: number } }   // counts not shown; sentToday drives CTA
status: { me: string, partner: string }            // '' when unset
craving: { me: { current: string, history: string[] /* ≤8, deduped case-insensitively, newest first, includes current */ },
           partner: { current: string } }
schedule: { me: Entry[], partner: Entry[] }        // ordered startAt DESC; Entry = { id, text, startAt ISO, endAt ISO, expired: boolean }
gifts: { me: string[], partner: string[] }         // profile.wishGifts of each side; only partner shown
anniversaries: [{ id, title, date ISO, note: string, images: string[], daysUntil: number /* ceil((date - now)/day) */ }]  // ordered date ASC
bucket: [{ id, text, done, createdBy, doneBy, doneNote: string, doneImages: string[] }]  // ordered createdAt ASC
```

Errors: 404 `Relationship not found`; 403 `Not a valid partner relationship` (match status not `RELATIONSHIP_ROMANTIC`/`RELATIONSHIP_MODE`, or dissolved); 403 `No access to this Couple Space`. Friend matches are never valid here.

### 3.2 Writes (all return the full space above; all `assertMember` → same 403/404)

| Call | Body | Notes / server validation |
|---|---|---|
| `PUT /couple/:id/cover` | `{ imageUrl: string \| null }` | null clears. Per-user; partner unaffected. Row-locked settings update. |
| `POST /couple/:id/love-you` | `{}` | Atomic once-per-day (`loveYouDate` compared to **server UTC `YYYY-MM-DD`**). 400 `Already sent today, come back tomorrow` on repeat. Side effects: creates a chat `Message{content:'I love you', senderId:me}` in the match's conversation and pushes SSE `message` to the partner; when **both** counts reach ≥100 creates one `milestone` notification per user (title `A secret unlocked`, body `You and {name} have each said "I love you" 100 times. Here is to many more.`, metadata `{kind:'love_you_100', matchId}`, idempotent) + SSE `notification`. |
| `PUT /couple/:id/status` | `{ status: string }` | Empty string allowed (clears). Stored verbatim (presets are English labels). |
| `POST /couple/:id/craving` | `{ text: string }` | 400 `Content is required` if blank; every post appends to history (newest = current). |
| `POST /couple/:id/schedule` | `{ text, startAt, endAt }` (strings) | 400 `Content is required` / `Start and end time are required` / `Invalid time` / `End time cannot be earlier than start time`. Server does `new Date(str)`; H5 sends `datetime-local` values with **no timezone** (parsed as server-local = UTC in the container) — see Gotchas. |
| `DELETE /couple/:id/schedule/:sid` | — | Only own entries are deleted (`where userId`); deleting someone else's silently no-ops. |
| `POST /couple/:id/anniversary` | `{ title, date: 'YYYY-MM-DD' }` | 400 `Title and date are required` / `Invalid date format`. |
| `PATCH /couple/:id/anniversary/:aid` | `{ title, date, note, images: string[] }` (H5 always sends all four; each optional server-side; legacy `image` also accepted) | Either partner may edit. |
| `DELETE /couple/:id/anniversary/:aid` | — | Either partner may delete. |
| `POST /couple/:id/bucket` | `{ text }` | 400 `Content is required`. |
| `PATCH /couple/:id/bucket/:bid` | `{ done: true, note, images: string[] }` or `{ done: false }` | done→ sets `doneBy`, `doneNote`, `doneImages`; un-done clears all three. |
| `DELETE /couple/:id/bucket/:bid` | — | 400 `Completed plans cannot be deleted` if `done`. |

### 3.3 Uploads

`POST /uploads/image` — `multipart/form-data`, field `file`, Bearer header, response `{ data: { url } }` (absolute https URL). Used by P1 (single) and P6/P10 (multi, uploaded **sequentially**, one failure skipped). Files are uploaded at pick time, before the popup is saved — cancelling the popup leaves orphaned uploads on the server.

### 3.4 Milestone overlay

- `GET /matching/milestones` → `{ state: 'none' }` or `{ state: 'relationship', daysTogether /* max(1, floor(...)+1) */, messageCount, postCount /* SquarePost rows with coupleMatchId — nothing in the current app creates these, so effectively 0 */, sharedInterests: string[] /* intersection of both profiles' interests */, matchScore /* unused */, startedAt ISO }`. Any error → treated as empty.
- `GET /matching/status` (no `mode`; best-effort, only when `!S.matchStatus`) — see bug in Gotchas; the intended use is `partner.nickname` / `partner.avatarUrl` for the header. iOS should read partner from `/matching/status?mode=romantic` → `data.partner` (public profile: `nickname`, `avatarUrl`, plus whatever `public_profile_fields` allows).
- Own name/avatar: `S.currentUser.profile.nickname` / `.avatarUrl` (from `GET /users/me`).

### 3.5 Dissolve (owned by match.js, invoked from here)

`POST /matching/:matchId/dissolve {}` (fallback `POST /matching/dissolve {}` when no id). Then `GET /matching/status?mode=romantic` via `loadMatchTab()`.

Polling / caching: none inside the module. `S.coupleSpace` is only a render cache. Match-status polling (30 s) is stopped while in `relationship`.

---

## 4. Client state

In `state.js`/`S` (all set ad-hoc by `couple.js`; not declared in `state.js` except `milestoneData`):

| Field | Set where | Used for |
|---|---|---|
| `S.coupleMatchId` | `renderCoupleSpace` | path segment for every `/couple/*` call |
| `S.couplePartner` | `renderCoupleSpace` (from `/matching/status` partner) | **never read** — hub uses `space.partner` from the API |
| `S.coupleContainer` | `renderCoupleSpace` | DOM host; fallback `#home-match-romantic .match-content` |
| `S.coupleSpace` | every load/write | source for popups (current status, anniversaries, bucket, gifts, cover presence) |
| `S.milestoneData` | `loadMilestone` | cached milestone payload (only consumer is the render itself) |
| module var `loveYouInFlight` | `coupleSendLoveYou` | double-submit guard |

Cleanup: `cleanupUserState()` (core.js) resets `S.milestoneData = null` only. **`coupleMatchId` / `coupleSpace` / `coupleContainer` / `couplePartner` are NOT cleared on logout or account switch** — harmless in H5 because nothing renders them without a fresh `renderCoupleSpace`, but iOS should scope this state to the session.

localStorage: nothing module-specific (`cl_token`, `cl_lang`, `cl_theme` are global).

---

## 5. i18n

Mechanism: in `zh` mode (`localStorage.cl_lang === 'zh'`) a `MutationObserver` rewrites every newly-inserted **text node whose trimmed content exactly equals a dictionary key** (`ZH` in `i18n.js`); subtrees under `data-no-i18n` are skipped; `placeholder` attributes are translated via a separate `ZH_PLACEHOLDER` map. `couple.js`/`milestone.js` contain **no `data-no-i18n` and no zh branches** — everything depends on exact-match dictionary hits, so any string with dynamic parts (`You & Mia`, `3 days to go`, `Shared Interests (2)`) stays English in zh mode.

Dictionary hits that exist (en → zh):

| en | zh |
|---|---|
| Anniversaries | 纪念日 |
| Craving today | 今天想吃 |
| What I'm up to | 近期安排 |
| Plans & checklist | 计划清单 |
| Gift jar | 礼物罐 |
| End Relationship | 解除关系 |
| Send I love you | 发送我爱你 |
| Sent today — see you tomorrow | 今天已发送 · 明天再来 |
| No anniversaries yet. | 还没有纪念日 |
| Nothing planned yet. | 还没有计划 |
| No update | 暂无更新 |
| Tap edit | 点击编辑 |
| Add what you're up to | 添加你的安排 |
| Today's status | 今日状态 |
| Save / Cancel / Delete / Remove / Add / Close / Done | 保存 / 取消 / 删除 / 移除 / 添加 / 关闭 / 完成 |
| Retry | 重试 |
| Loading... (milestone) | 加载中… |
| View all (title attr — never visible on touch) | 查看全部 |
| Add anniversary / Add plan (orphan keys, not rendered) | 添加纪念日 / 添加计划 |
| Notification `A secret unlocked` | 解锁了一个小秘密 |
| Notification body `You and {n} have each said "I love you" 100 times. Here is to many more.` | 你和 {n} 已互道 100 次「我爱你」，愿未来更多。 |

Strings that are **English-only in H5 even in zh mode** (iOS must localize itself or accept parity): `IN A RELATIONSHIP`, `You & {name}`, `DAY(S) TOGETHER`, `YOU · TODAY`, `{NAME} · TODAY`, `Set your status`, `Loading your space…`, `Couldn't load your space.`, `YOU`, `{n} day(s) to go` / `Today` / `{n} day(s) ago`, ` · note`, ` · record`, `See what {name} wants`, `{NAME} WANTS`, `They haven't added any gifts yet.`, `Couple cover`, `Set your own cover for this space — your partner sets theirs separately.`, `Choose photo`, `OR WRITE YOUR OWN`, `Custom status…`, preset labels `Happy/Loved/Excited/Tired/Sad/Awkward/Anxious/Angry`, `What do you want to eat?`, `e.g. Ramen`, `What are you up to?`, `e.g. Library then gym`, `START`, `END`, `Fill in activity and times`, `New anniversary`, `e.g. First date`, `DATE`, `Title and date required`, `Anniversary`, `Add a note (optional)`, `Add photos`, `All anniversaries`, `No anniversaries.`, `{n}d` / `{n}d ago`, `Add to checklist`, `Plan`, `e.g. Watch the sunrise together`, `Mark done`, `COMPLETED`, `No note added.`, `Mark as not done?`, `Yes`, `Delete this plan?`, `Delete anniversary?`, `Uploading…`, `Upload failed`, `Uploaded {x} of {y} ({z} failed)`, `Sent I love you`, `Already sent today`, `Failed: {msg}`, `Failed: try again`, `End this relationship?`, `This will end your relationship. Neither of you can message anymore.`, `End`, `Relationship ended`, and the entire Milestone overlay copy (`Milestone`, `Together Since …`, `Active Connection`, `Messages`, `Days Matched`, `Moments Shared`, `The Story So Far`, `The Beginning`, `First Match`, `The Correspondence`, `{n} Messages Exchanged`, `The Couple Square`, `{n} Moments Archived`, `Today`, `Day {n}`, the three timeline bodies, `Shared Interests ({n})`, `No shared interests yet — keep exploring together.`, the footer quote, `No Milestones Yet`, `Milestones unlock once you and your match enter relationship mode. Find your match to start the journey.`, `Go To Matching`, `Unlocks when you're matched`).

Status presets are stored as the English label string (`'Happy'`), so the partner's client shows whatever string was saved; the icon is derived client-side by case-insensitive label match. Custom statuses are free text.

Date/time formatting is device-locale (`toLocaleString([], …)`) for schedule times; anniversaries use English month abbreviations (`'en'`) and `YYYY-MM-DD`; milestone "Together Since" uses `en-US` long form.

---

## 6. Cross-module links

Called into:
- `match.js → window.renderCoupleSpace(container, matchId, partner)` — the only live entry (romantic `relationship` state).
- `core.js SWIPE_BACK_CLOSE['milestone-overlay']` — edge-swipe closes the milestone overlay.
- `core.js cleanupUserState` — resets `S.milestoneData`.
- `settings.js openLoveMode` / `milestone.js openMilestones` / `profile.js openPreview` — all reference `milestone-overlay`; **none are wired to UI**.

Calls out:
- `window.api`, `window.uploadImageFile`, `window.toast`, `window.promptCard`, `window.confirmCard`, `window.escapeHtml`, `window.safeUrl`, `window.safeCssUrl` (core.js).
- `window.dissolveMatch(matchId)` (match.js) — confirmation + `POST /matching/:id/dissolve` + `loadMatchTab()`.
- `window.openOverlay/hideOverlay`, `window.switchTab('match')` (core.js) — milestone overlay.

Indirect couplings:
- **Chat**: love-you inserts a real message `I love you` from me into the couple's conversation (chat list preview/unread + SSE); chat.js renders it as a normal bubble (no special styling).
- **Notifications**: `milestone` type notification (`A secret unlocked`) surfaces in the Notifications panel; localized there by regex.
- **Profile edit**: `wishGifts` (5 inputs "Gift 1…5", `PUT /profiles/me`) is the source of the partner's Gift jar; `bio`/`avatarUrl`/`nickname` feed the hero card.
- **Match status**: `daysTogether`, `matchId`, `partner` all originate from `/matching/status?mode=romantic`.

---

## 7. Gotchas

1. **Milestone overlay is unreachable in production H5** (no caller) and has a real bug: `milestone.js` reads `S.matchStatus?.partner` / `S.matchStatus.match`, but `S.matchStatus` is bucketed `{romantic, friend}` since the dual-mode refactor → partner is always `undefined` → header always renders `You & Partner` with a blank partner avatar, and the `if (!S.matchStatus)` fetch never fires. Use `S.matchStatus.romantic.partner` (or a fresh `/matching/status?mode=romantic`).
2. **`daysTogether` differs between the two endpoints**: Couple Space = `floor` (0 on the confirmation day); Milestones = `floor + 1` clamped to ≥1 (1 on the confirmation day). Do not compute locally; show what each endpoint returns.
3. **"Sent today" is server-UTC**, not local midnight (`new Date().toISOString().slice(0,10)`). Never derive `sentToday` client-side; trust the flag and the 400 message.
4. **Schedule times lose timezone**: H5 posts `datetime-local` strings (`2026-09-03T14:00`) which the server parses as its own local time (UTC in Docker) → a UK user's 14:00 is stored as 14:00 UTC and rendered back at 15:00 BST. iOS should send full ISO-8601 with offset (`Date` accepts it) to be correct, accepting that it will then differ from H5's off-by-offset behaviour — or replicate the H5 payload for strict parity.
5. `daysUntil` for anniversaries is computed server-side with `ceil` against a UTC-midnight date; the calendar tile parses the same date as **local** midnight. Labels (`Today`, `n days to go`) come from the server number; do not recompute from the tile date.
6. **Every write re-renders the whole hub from the server response** (no optimistic UI, no partial patch). Scroll position of the pane is generally preserved because the container node persists; height changes may clamp it.
7. **Done checklist items cannot be deleted** (no `×`, and the server returns 400). Un-ticking wipes the note and photos permanently (confirmation `Mark as not done?`).
8. **Anniversary photo removal is local until Save**; photos are uploaded immediately when picked (orphans on cancel). Multi-upload is sequential and reports partial failure with an exact count.
9. **Deleting a schedule entry has no confirmation**; deleting an anniversary or plan does (pink `danger` confirm).
10. Quick-craving chips = history minus the current value, max 5 of the server's 8; tapping one re-posts it (becomes current, moves to top).
11. Status presets save instantly on tap (no Save press); the custom input is pre-filled only when the current status is not a preset; saving an empty custom string clears the status.
12. **Cover is per user per match** (`settings.coupleCovers[matchId]`): my cover and my partner's cover are independent; the popup body says so.
13. Gift jar shows **only the partner's** wishes; the user's own list is deliberately hidden here (it is visible to the partner). Privacy rule: `wishGifts` "仅伴侣可见" (partner-only).
14. Hero card is fixed dark-on-dark styling (white text, neon accents) in both light and dark themes; everything else follows theme tokens. Dark-mode token map (main.css): surface #121110, container-lowest #1c1b19, container-low #23211f, container #292724, on-surface #eceae6, on-surface-variant #aaa8a3, outline #8c8a85, borders #343230; `.bookmark-item` bg #1c1b19.
15. **Known dark-mode defect to NOT replicate**: the bucket checkbox's `check` icon carries `text-black` on the child span, and `.dark .text-black` forces it to #eceae6 → near-invisible on the neon box. Render the check black on neon in dark mode too.
16. XSS hygiene the backend relies on clients for: all user strings are HTML-escaped; image URLs pass `safeUrl` (rejects `javascript:`/`vbscript:`/`file:`/`blob:`/non-image `data:`), cover URL passes `safeCssUrl` (strips quotes/parens/backslashes). iOS: only load `http(s)` URLs into image views.
17. Questionnaire-refill banner race: when the romantic questionnaire is incomplete but the user is in `relationship`, match.js prepends a neon banner (`Questionnaire updated — refill for better matches` + `Refill`) to the container **after** `loadMatchTab` resolves, but `renderCoupleSpace` is not awaited and its later `innerHTML` replace wipes the banner. Net effect in H5: the banner usually does not appear on the Couple Space. iOS may choose to show it above the hub deliberately.
18. **No energy cost** anywhere in this module. No anonymity/alias rendering (partner is always identified by nickname). No polling; SSE from love-you only affects the Chat tab.
19. Hub relies on `.home-match-pane` bottom padding (13rem) so the CTA/`End Relationship` clear the floating bottom nav; the pane, not the page, scrolls.
20. `S.couplePartner` is dead state; the hub's partner data (`nickname`, `avatarUrl`, `bio`) comes exclusively from the `/couple/:id` response. School/verification are not shown in the Couple Space.
21. Existing `apps/ios` couple code (`Models/Couple.swift`, `Network/CoupleService.swift`, `ViewModels/CoupleViewModel.swift`, `Views/Couple/CoupleSpaceView.swift`) is from an older contract and does not match the current API: it models `status`/`craving` as flat strings, `gifts` as `[String]`, `loveYou` as `{mine, partner, total, unlocked}`, lacks `cover`-per-user semantics, schedule add/delete, anniversary PATCH/DELETE with `note`/`images`, bucket DELETE, `doneImages`, `daysUntil`, `expired`, `sentToday`; its copy is Chinese-only (`情侣空间`) and it pushes as a NavigationStack screen rather than living inside the Match tab. Reuse the service skeleton, rewrite models/views against §3.1.
