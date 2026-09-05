# H5 module map — `questionnaire` (dual-mode questionnaire v2)

Source of truth read for this map:

- `apps/h5/src/modules/questionnaire.js` (402 lines, whole file)
- `apps/h5/index.html` — `#page-questionnaire` (lines 580–660), `#questionnaire-cards` (1810–1848), `#q-nav-overlay` (1851–1862), the "Retake Questionnaire" row inside `#filter-overlay` (1036–1043)
- `apps/h5/src/styles/main.css` — `.page/.overlay` base, safe-area rules, `.q-card--done`, `#toast`, `.bottom-sheet-transition`, dark-mode block
- `apps/h5/src/modules/core.js` (showPage / switchTab / api / confirmCard / toast / cleanupUserState / swipe-back), `match.js` (gating), `profile.js` (cards entry), `i18n.js` (dictionary + mechanism), `state.js`
- Backend contract: `apps/api/src/questionnaire/*`, `apps/api/src/answers/*`, `prisma/schema.prisma`, `prisma/questionnaire-v2.ts` (the live v2 question bank), `common/interceptors/transform.interceptor.ts`
- Existing iOS: `apps/ios/Unimatcha/{Models/Questionnaire.swift, Network/QuestionnaireService.swift, ViewModels/QuestionnaireViewModel.swift, Views/Onboarding/QuestionnaireView.swift, Views/Onboarding/OnboardingCoordinator.swift}`

Design tokens used below (Tailwind config in `index.html`): `neon #CCFF00`, `neon-pink #FF2EC4`, `primary #000`, `surface #f9f9f9`, `surface-container-lowest #fff`, `surface-container-low #f3f3f3`, `surface-container-high #e8e8e8`, `surface-container-highest #e2e2e2`, `on-surface #1b1b1b`, `on-surface-variant #474747`, `outline #777`, `outline-variant #c6c6c6`, `stone-200 #e7e5e4`. Every Tailwind radius key (`rounded`, `rounded-sm`…`rounded-3xl`) is remapped to **10px**; only `rounded-full` stays a circle. Font family `headline`/`body` = Plus Jakarta Sans → PingFang SC fallback (iOS: SF Pro / PingFang SC is the faithful equivalent). Material Symbols Outlined for every icon.

---

## 1. Screens & states

The module owns three pieces of UI plus the toasts it fires. Two more pieces (the "fill questionnaire" prompt card and the "refill" banner) live in `match.js` but are the main way users reach this module, so they are described here too.

### 1.1 Questionnaire Cards overlay — `#questionnaire-cards`

Purpose: the "G rule" (§6.3) two-card chooser. Both questionnaires are **optional**; each gates only its own match mode.

Entered: **only** from `profile.js saveProfile()` right after first profile setup: `S.homeView='chat'; switchTab('match'); renderQuestionnaireCards()` → the overlay appears on top of the home Chat view. It is *not* shown on normal login (`checkUserState` goes straight to home). No other caller exists.

Exited: "Maybe Later" → `closeOverlay`. "Start/Retake" → pre-start confirm card (1.2) → on confirm `closeOverlay` + open the questionnaire page. Also closed by global `closeAllOverlays()` (logout/401).

Layout (centered modal):

- Backdrop: `fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm`, flex column, `items-center justify-center px-6`. Fade in/out 0.25s (`.overlay` opacity/visibility transition). Tapping the backdrop does **nothing** (no handler).
- Card: `w-full max-w-md`, `bg-white` (dark `#1c1b19`), `shadow-2xl`, radius 10px, `overflow-hidden`.
  - Header `px-6 pt-7 pb-4 text-center`:
    - h2 "Complete Your Match Profile" — headline 20px extrabold, tracking-tight, black.
    - p "Complete a questionnaire to unlock that mode." — 12px, on-surface-variant, tracking-wide, leading-relaxed, `mt-2`.
  - Body `px-6 pb-6 space-y-3` (12px gap): two identical rows `#q-card-romantic` / `#q-card-friend`, class `q-card`:
    - Row: `flex items-center justify-between gap-4`, `border border-black` (1px; dark `#4b4945`), radius 10px, `p-4`.
    - Left `flex items-center gap-3 min-w-0`: icon 22px (`auto_awesome` for romantic, `group` for friend) + title headline 14px bold tracking-tight black: "Romantic Questionnaire" / "Friend Questionnaire".
    - Right `flex items-center gap-2 shrink-0`: `.q-card-check` icon `check_circle` 24px, `hidden` unless completed (**renders in inherited text color, not neon** — see gotchas); then `.q-card-fill` button `bg-neon text-black px-4 py-2` radius 10px, headline 11px bold tracking-widest, `active:scale-95`; text "Start" (not completed) or "Retake" (completed).
  - Footer `px-6 pb-7`: full-width button "Maybe Later" — `border border-outline-variant py-3.5` radius 10px, headline 10px bold tracking `.2em`, on-surface-variant, hover bg surface-container-low.

States:
- On open both cards are reset to neutral (check hidden, "Start") *before* the completion request, so a slow response never shows the previous account's ticks.
- After `GET /questionnaire/completion`: per mode `completed` → show check + "Retake"; else "Start".
- Completion fetch failure: silently keeps both as "Start" (console.error only, no toast).

### 1.2 Pre-start confirm card (generic `confirmCard`)

Shown only on the **cards-overlay path** (`startQuestionnaire(mode)`), before the page opens. Other entry points (match prompt card, refill banner, preferences "Retake Questionnaire") skip it.

- Backdrop `fixed inset-0 z-[120] flex items-center justify-center px-6 bg-black/40 backdrop-blur-[2px]` (appended to body).
- Dialog `w-full max-w-sm bg-surface-container-lowest` (#fff) radius 10px `shadow-2xl p-6`, `role=dialog`.
  - h3 title: headline 18px extrabold tracking-tight on-surface, `mb-2`.
  - body p: body 14px leading-relaxed on-surface-variant, `mb-6`.
  - Button row `flex gap-3`: cancel `flex-1 py-3` radius 10px `border border-outline-variant` on-surface bold 12px tracking-widest; confirm `flex-1 py-3` radius 10px `bg-neon text-black` bold 12px tracking-widest. `active:scale-[0.98]`.
- Copy is chosen at render time by language (see §5). Cancel → `false`, backdrop tap → `null`; both keep the user on the cards overlay (`if (!ok) return`).

### 1.3 Questionnaire page — `#page-questionnaire`

A full-screen `.page` (`position:fixed; inset:0; z-index:40; background:#f9f9f9` (dark `#121110`); `display:flex; flex-direction:column; overflow-y:auto`). **The page element itself is the vertical scroll container**; header and footer are `fixed` over it. The bottom tab bar is hidden while any non-home page is active (`showPage` sets `#bottom-nav display:none`).

Entered by (all call `showPage('page-questionnaire')` then `loadQuestionnaire(mode)`):
1. `startQuestionnaire(mode)` — cards overlay → confirm card → page.
2. `goFillQuestionnaire(mode)` (match.js) — from the "Fill Out Questionnaire" prompt card or the "Refill" banner on the romantic/friend match view.
3. `retakeQuestionnaire(mode?)` — from the preferences edit sheet (`#filter-overlay`) row "Retake Questionnaire"; hides that sheet first; mode defaults to `S.activeMatchMode || 'romantic'`.

Exited by:
- Header back arrow → `showPage('page-home'); switchTab('match')` — returns to home on whatever `S.homeView` currently is (the match-mode view if you came from there, Chat if you came from the post-setup cards). Answers typed so far stay in memory (not saved to server).
- Left-edge swipe back (core.js global gesture): touch starts within 30px of the left edge, gesture locks horizontal when |dx|>10 and |dx|>|dy|, the page root translates with the finger (no fade), release with dx ≥ 80px → animate out 200ms then same exit as the back arrow; else spring back 250ms. The questionnaire page is special-cased in that gesture (it is a `.page`, not an overlay).
- Successful submit → `S.homeView = S.questionnaireMode; showPage('page-home'); switchTab('match')` → lands on that mode's match view (which re-checks completion and then loads the match tab).

#### Header (fixed top)

`fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 flex justify-between items-center px-6 h-16`. Safe-area rule: `padding-top:env(safe-area-inset-top)` and `height: calc(4rem + inset)` (the `.fixed.top-0.h-16` rule), and the following `<main>` gets `margin-top: env(safe-area-inset-top)`.

- Left: icon button `p-2` (hover bg surface-container-low), icon `arrow_back` on-surface → exit.
- Right: icon button `p-2`, icon `grid_view` on-surface, `title="Questions"` → `openQNav()` (1.4).

#### Main (scrolls with the page)

`flex-grow pt-20 pb-24 px-6 max-w-2xl mx-auto w-full` (80px top padding + safe-area margin; 96px bottom padding clears the fixed footer).

1. **Step indicator block** (`mb-12` = 48px below):
   - `#q-mode-badge`: `inline-flex items-center gap-1.5 mb-4 px-3 py-1` radius 10px, `bg-neon text-black`, headline 10px bold tracking `.15em`. Content = Material icon 14px + label: romantic → `auto_awesome` + "Romantic"; friend → `group` + "Friend". Set by `loadQuestionnaire` before the fetch.
   - Row `flex justify-between items-end mb-4`: left "Assessment Progress" (headline 12px bold tracking `.2em`, on-surface-variant); right counter headline 18px extrabold: `#q-progress-num` + "/" (outline-variant colored, `mx-1`) + `#q-total`. Both numbers are **zero-padded to 2 digits** ("03 / 18").
   - Track `h-[2px] w-full bg-surface-container-highest`; fill `#q-progress-bar h-full bg-primary` (black), `width = (index+1)/total*100%`, `transition-all 500ms`. Progress is **position-based**, not answered-count based.
2. **Question section** (`space-y-8` = 32px between blocks):
   - Relative wrapper with watermark `#q-watermark`: `absolute -top-10 -left-4` (−40px, −16px), 48px headline **black weight (900)**, color surface-container-highest at `opacity-20`, `select-none`, text `Q.NN` (zero-padded).
   - `#q-text` h1: 20px (md: 24px) headline bold, tracking-tight, on-surface, `relative z-10 leading-snug`. Text = zh ? `q.title` : (`q.titleEn || q.title`), falling back to `q.text || q.question` (legacy keys, never present on v2). **Not** wrapped in `data-no-i18n`.
   - `#q-options` (`space-y-4` = 16px between children) — rebuilt wholesale on every render (`innerHTML`). Four renderings:

   **SCALE** — five rows, values 1..5 top-to-bottom, labels in this order: `Strongly Disagree`, `Disagree`, `Neutral`, `Agree`, `Strongly Agree` (1 = strongly disagree … 5 = strongly agree; this direction was flipped when v2 shipped and matches the backend contract and the old iOS scale). Row = `<label>`: `group flex items-center justify-between px-4 py-3 border-b` (1px bottom border), selected → `border-neon bg-neon/10`, unselected → `border-outline-variant/30`; `hover:bg-surface-container-low`, `active:scale-[0.99]`, `transition-all 200ms`. Left text body 16px medium (translated via dictionary in zh). Right indicator `w-6 h-6 rounded-full border-2`: selected → `border-outline bg-neon` (solid neon disc, **no check glyph**), unselected → `border-outline` only. Tap → `answerScale(qId, val)`.

   **SINGLE_CHOICE / MULTIPLE_CHOICE** — optional hint line for multi only: `<p class="text-[11px] text-outline mb-2">Select all that apply</p>`. Then one row per `q.options[]` (server order): same row styling as SCALE; label text = zh ? (`o.label || o.text || val`) : (`o.labelEn || o.label || o.text || val`), body 16px medium, wrapped in `data-no-i18n` (server content must not be dictionary-translated). Indicator `w-6 h-6 border-2`, shape `rounded-full` (single) or `rounded-[6px]` (multi); selected → `border-outline bg-neon text-black` **with a `check` icon 16px inside**; unselected → `border-outline`. The option value is stored on the row as `data-value` (HTML-escaped, quotes → `&quot;`) and read back on tap (`answerChoiceEl(this)`), never spliced into an inline JS string. Value = `String(o.value || o.id || '')`.

   **TEXT** — if `q.isRequired === false`: `<p class="text-[11px] text-outline mb-2">Optional — leave blank to skip</p>`. Then a `<textarea rows=4>`: `w-full bg-surface-container-low` (#f3f3f3) radius 10px, no border, `px-3 py-2.5`, `focus:ring-1 focus:ring-neon`, placeholder "Your answer..." (zh "写下你的回答…"), prefilled (escaped) with the stored answer. `oninput` → `answerText(qId, value)` (no re-render). Multi-line, unlimited length (no maxlength client or server side).

   Loading/empty/error: there is **no loading state**. Before the first fetch resolves the static placeholder markup from `index.html` is visible ("03/12", the sentence "I usually take the initiative in social conversations.", five radio rows) — and on re-entry the *previous* render stays visible until the new one lands. If the fetch fails the page stays like that and a toast "Failed to load questionnaire" shows. iOS should implement real loading / error / "no questionnaire" states (the old iOS view already has all three).

#### Footer (fixed bottom)

`fixed bottom-0 w-full bg-surface-container-lowest` (#fff; dark `#1c1b19`) `border-t border-surface-container-high px-6 py-6 z-50`. **No safe-area-bottom padding** (the 24px vertical padding is all there is). Inner `max-w-2xl mx-auto flex items-center justify-between`:

- `#q-prev-btn` "Previous": `flex items-center gap-2 px-6 py-3`, headline 14px bold tracking-widest, on-surface-variant, leading icon `arrow_back` at 14px, `active:scale-95`. On question 1 it is `visibility:hidden` (still occupies its slot so "Next" stays right-aligned).
- `#q-next-btn`: `flex items-center gap-4 bg-neon text-black px-10 py-4` radius 10px, headline extrabold tracking `.2em`, `hover:opacity-90 active:scale-95`. Content: not last → "Next" + `arrow_forward` icon (24px default); last question → "Submit" + `check` icon. `disabled` while a submit is in flight (no dedicated disabled styling — visually unchanged).

#### Dark mode (class `.dark` on root)

Page bg `#121110`; header bg `rgba(18,17,16,.85)`; footer/white surfaces `#1c1b19`; `surface-container-low` inputs `#23211f`; `surface-container-highest` `#363431`; text on-surface `#eceae6`, on-surface-variant `#aaa8a3`, outline `#8c8a85`; outline-variant borders `#343230`; `border-black` → `#4b4945`; anything on `bg-neon` keeps black text (`.dark .bg-neon{color:#000!important}`). Nav-grid current ring is white in dark.

### 1.4 Question navigation grid — `#q-nav-overlay` (bottom sheet)

Entered: header `grid_view` button → `openQNav()` (no-op if no questionnaire loaded). Exited: tap on a number → `jumpToQuestion(i)`; tap the dimmed backdrop (`event.target === overlay`) → `hideOverlay`.

- Backdrop `fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]`, flex column `items-center justify-end` → sheet pinned to the bottom.
- Sheet `relative z-[70] w-full max-w-md mx-auto bg-surface` (#f9f9f9) `rounded-t-2xl` (=10px top corners) `shadow-2xl`, class `bottom-sheet-transition`: `translateY(100%) → 0` over 0.32s `cubic-bezier(0.22,1,0.36,1)` when `.active`.
  - Header `flex flex-col items-center pt-3 pb-2`: grabber `w-10 h-1 bg-stone-200 rounded-full mb-3`; legend row `flex items-center gap-4 text-[11px] text-on-surface-variant pb-1`: [12px neon square, rounded] "Answered" · [12px square with 1px outline-variant border] "Unanswered".
  - Grid `#q-nav-grid`: `px-5 pb-8 pt-2 grid grid-cols-8 gap-2 max-h-[46vh] overflow-y-auto` (no safe-area bottom padding). One button per question: `w-9 h-9` (36px) radius 10px, headline 12px bold, centered number **1-based, not zero-padded**, `active:scale-90 transition-transform`. Answered → `bg-neon text-black`; unanswered → `border border-outline-variant text-on-surface-variant`; current index additionally `ring-2 ring-black` (dark: `ring-white`). "Answered" uses the same blank rule as resume/submit (see §2.5).
- The grid is rebuilt from `currentAnswers()` on every open, so it reflects live TEXT typing (bucket is updated on each input event).

### 1.5 Toasts (global `#toast`)

Black pill (`background:#000; color:#fff; font-size:14px; padding:12px 24px; border-radius:10px; box-shadow 0 2px 8px rgba(0,0,0,.2)`), `position:fixed; top: calc(16px + safe-area-inset-top); left:50%` centered, `z-index:999`, `slideDown` 0.3s (from −20px/opacity 0), auto-hides after 3000ms. Text is set via `textContent` (single line, no wrap styling).

### 1.6 Match-side gating UI (owned by `match.js`, shown in the romantic/friend match pane)

Described because it is the primary funnel into this module; the match-page mapper owns its exact geometry.

- **Prompt card** (`promptFillQuestionnaire(mode)`): rendered *instead of* the match plan when the mode's questionnaire is not completed **and** the user's match state for that mode is `idle`/unknown. `div.w-full.text-center.px-8.py-16` → `flatEmptyIcon(icon,'neon')` = 64×64 box radius 18px `bg #CCFF00`, black icon 28px (`auto_awesome` / `group`), `mx-auto mb-6`; h2 headline 18px extrabold tracking-tight "Romantic Questionnaire"/"Friend Questionnaire" `mb-2`; p body 14px on-surface-variant `max-w-[15rem] mx-auto mb-10 leading-relaxed` "A few quick questions unlock romantic|friend matching."; button `.btn-cta bg-neon text-black` (full width, radius 10px) "Fill Out Questionnaire" → `goFillQuestionnaire(mode)`.
- **Refill banner** (`injectQuestionnaireBanner(mode)`): for users who are *not* idle (in pool / matched / in relationship) when completion is false (typically because admin published a new version). Prepended to the pane content: `w-full max-w-xs mx-auto mb-4 px-4 py-3` radius 10px `bg-neon/15 flex items-center justify-between gap-3`; text 12px on-surface "Questionnaire updated — refill for better matches"; pill button `px-3 py-1.5 rounded-full bg-neon text-black` headline 10px bold tracking-widest "Refill" → `goFillQuestionnaire(mode)`. De-duplicated per pane.
- **Preferences edit sheet row** (`#filter-overlay`, bottom section): full-width row `py-4 px-4 border border-black` radius 10px, `hover:bg-neon active:scale-[0.98]`; left `tune` icon + headline 14px bold tracking-tight "Retake Questionnaire"; right `chevron_right`. → `retakeQuestionnaire()`.

---

## 2. Interactions

### 2.1 Cards overlay
- "Start" / "Retake" (per card) → `startQuestionnaire(mode)`: shows the pre-start confirm card (§1.2). Confirm → close cards overlay, `showPage('page-questionnaire')`, `loadQuestionnaire(mode)`. Cancel / backdrop → stay on the cards overlay.
- "Maybe Later" → close overlay; user is left on home (Chat view). Nothing is persisted; the overlay is not re-shown later (the match-mode gate takes over).
- Backdrop tap: no effect.

### 2.2 Page load (`loadQuestionnaire(mode)`)
1. `S.questionnaireMode = mode === 'friend' ? 'friend' : 'romantic'`; set the mode badge immediately.
2. `GET /questionnaire/active?type=<mode>` → `S.questionnaire = version`.
3. **Resume rule "A19"**: if the fetched version id equals the previously loaded `S.questionnaire.id` *and* this mode's in-memory bucket is non-empty → keep the bucket; if `S.currentQuestion` is null or ≥ length, set it to the first unanswered index; render and return. (Navigating away and back mid-assessment resumes at the same question.)
4. Otherwise (first load, or a different version, or a different mode was loaded in between): **reset this mode's bucket to `{}`**, `S.currentQuestion = 0`, then `GET /answers/mine?versionId=<id>`; copy each `{questionId, value}` into the bucket; `S.currentQuestion = firstUnansweredIndex` (first question whose answer is blank; if none, the **last** question). Fetch failure → start fresh silently.
5. `renderQuestion()` if there is at least one question. Any failure of step 2 → console error + toast "Failed to load questionnaire" (page keeps stale content).

### 2.3 Answering
- SCALE row tap → `answers[qId] = <int 1..5>`; re-render (row highlights).
- SINGLE row tap → `answers[qId] = <option.value string>`; re-render. Tapping the selected row again keeps it selected (no deselect).
- MULTI row tap → toggle value in `answers[qId]` array (creates `[]` on first use; `splice` on deselect, `push` on select → **array order = selection order**); re-render. Fully deselecting leaves `[]`, which counts as blank.
- TEXT input → `answers[qId] = raw string` on every input event (no trim, no re-render). Before any navigation (`next/prev/jump/submit`) `flushCurrentTextAnswer()` re-reads the textarea into the bucket to cover pending IME composition.
- No per-question validation: the user may press Next on an unanswered question (unlike the old iOS view, which disabled Next until answered). Required-ness is only enforced at submit.

### 2.4 Navigation
- "Next" → flush text; if not last, `S.currentQuestion++` and render; if last → `submitAnswers()`.
- "Previous" → flush text; `S.currentQuestion--` if > 0 (button is invisible at 0 anyway).
- Grid number → flush text; `S.currentQuestion = i`; hide sheet; render.
- Header back / swipe back → leave page without saving (in-memory answers retained for later resume).
- No keyboard-specific handling; the textarea grows with `rows=4` fixed height and page scrolls.

### 2.5 "Blank" answer rule (shared by resume, nav-grid coloring and submit)
`undefined | null | '' | []` ⇒ blank. Anything else (including `0`, whitespace-only text, arrays with items) ⇒ answered. Note the server additionally trims strings and treats `[ '' ]` as empty (§3.4).

### 2.6 Submit (`submitAnswers`)
1. Re-entrancy guard `isSubmitting` (module-local) — double taps are ignored.
2. Flush text. Client-side required check: first question with `isRequired && blank` → jump to it, render, toast `Please answer required question: <localized title>`; abort.
3. Disable `#q-next-btn`, build payload from the bucket **dropping blank entries** (so a cleared TEXT / emptied MULTI is not sent as an answer), `POST /answers`.
4. Success → toast `Assessment complete! <answeredCount> questions answered` (or `Assessment complete!` if the count is not a number) → `S.homeView = S.questionnaireMode` → `showPage('page-home')` → `switchTab('match')` (which calls `switchHomeView(S.homeView)` → `ensureQuestionnaireThenMatch(mode)` → completion now true → match plan renders).
5. Failure → toast `Submit failed: <server message>`; stay on the page. `finally` re-enables the button and clears the guard.
6. No optimistic update, no local persistence of the submission; the in-memory bucket is left as-is (it is overwritten from the server on the next load).

### 2.7 Haptics / confirmations
None in this module (no vibration calls, no confirm on leaving with unsaved answers). The only confirmation is the pre-start card on the cards-overlay path.

---

## 3. API calls

All calls go through `window.api(path, method, body)`: base URL `S.API`, header `Authorization: Bearer <localStorage.cl_token>`, `Content-Type: application/json`, `cache: 'no-store'`. Every success response is wrapped by the Nest `TransformInterceptor` as `{ success: true, data: <payload>, message?: string, timestamp: ISO }`; H5 unwraps with `res.data || res`. Non-2xx: body `{ statusCode, message, ... }` → H5 throws `Error(message)`; **401 anywhere** → token removed, all polling stopped, `cleanupUserState()`, all overlays closed, auth page shown. No polling, caching, sequence tokens or dedup in this module (each entry re-fetches).

### 3.1 `GET /questionnaire/active?type=romantic|friend`
- Query `type` from `S.questionnaireMode`; backend normalizes anything other than `'friend'` to romantic.
- Backend: the single `isActive` version of that type, `questions` filtered `isEnabled=true` ordered by `order asc`, each with `options` ordered `order asc`. 404 `No questionnaire available` if no active version.
- `data` = `QuestionnaireVersion { id, version:int, type:'ROMANTIC'|'FRIEND', title, description?, isActive, publishedAt?, createdAt, updatedAt, questions: Question[] }`.
  `Question { id, questionnaireId, type:'SINGLE_CHOICE'|'MULTIPLE_CHOICE'|'SCALE'|'TEXT', title (zh), titleEn?, description?, isRequired:bool, isEnabled:bool, order:int, group?:string (zh category), code?:string, semantics, hardness, weight:float, target, createdAt, updatedAt, options: Option[] }`.
  `Option { id, questionId, label (zh), labelEn?, value (stable snake_case), order, createdAt, updatedAt }`.
- Fields the UI uses: `id` (as `questionnaireVersionId`), `questions[].id/type/title/titleEn/isRequired/options[].value/label/labelEn` (+ legacy fallbacks `o.id`, `o.text`, `q.text`, `q.question` that never occur on v2). `description`, `group`, `code`, `weight` etc. are ignored by the UI.
- Live production content: romantic v2 = 18 questions, friend v2 = 14 (see Appendix A). Type mix across both: SCALE ×16, SINGLE_CHOICE ×9, MULTIPLE_CHOICE ×3, TEXT ×4; only the 4 TEXT questions are `isRequired=false`.

### 3.2 `GET /answers/mine?versionId=<id>`
- Called right after 3.1 on a fresh/different version load. `versionId` URL-encoded from `S.questionnaire.id`. (Backend also accepts `?type=romantic|friend` — unused by H5.)
- `data` = `Answer[]` ordered `submittedAt desc`: `{ id, userId, questionnaireVersionId, questionId, value: Json, submittedAt, updatedAt, question:{title,type}, questionnaireVersion:{version,title} }`.
- UI uses `questionId` (also tolerates `question_id`) and `value`. Value types as stored: single → string; multi → string[]; scale → number; text → string.
- Failure → non-fatal, start fresh.

### 3.3 `GET /questionnaire/completion`
- Used by `renderQuestionnaireCards()` (no query) and by `match.js` (`?type=<mode>` — the backend **ignores** `type` and always returns both buckets; H5 defensively unwraps `d[mode] ?? d`).
- `data` = `{ romantic: { completed: bool, versionId?: string }, friend: { completed: bool, versionId?: string } }`. `completed` = (# of the user's answers to *required, enabled* questions of the active version) ≥ (# required questions). A type with no active version → `{completed:false}` without `versionId`.
- Uses only `completed`.

### 3.4 `POST /answers`
- Body: `{ questionnaireVersionId: string (S.questionnaire.id), answers: [ { questionId: string, value: string | string[] | number } ] }` — blank entries omitted; `value` is `@Allow()` (any JSON).
- Backend validation, in order: 404 `Questionnaire version not found`; 400 `This questionnaire version no longer accepts submissions, please use the latest version` (version no longer active — e.g. admin published a newer one while the user was answering); 400 `The following required questions are not answered: <zh titles joined by ", ">` (required = enabled+isRequired; empty = null/undefined, trimmed empty string, empty array or array of empties); 400 `Submission contains questions that do not belong to this questionnaire version`.
- Persistence: per-question **upsert** keyed `(userId, versionId, questionId)`. Answers not present in the payload are **left untouched** (there is no delete — a user cannot un-answer an optional question by clearing it; it just is not re-sent).
- `data` = `{ message:'Questionnaire submitted successfully', answeredCount: <rows upserted = payload length>, questionnaireVersion: <int> }`. UI uses `answeredCount` for the toast only.

### 3.5 Related calls owned by `match.js` (context for the gate)
`GET /questionnaire/completion?type=` and, only when not completed, `GET /matching/status?mode=` to decide prompt-card vs banner. Completion fetch error ⇒ **fail-open** (user is let into the match view); `startMatch()` re-checks completion before charging energy and shows the prompt card if false.

---

## 4. Client state

`state.js` fields touched (all in-memory only; nothing questionnaire-related in `localStorage`):

| Field | Meaning |
|---|---|
| `S.questionnaire` | The last loaded `QuestionnaireVersion` object — **single slot shared by both modes**. |
| `S.questionnaireMode` | `'romantic' \| 'friend'` — bucket selector for `currentAnswers()`. Default `'romantic'`. |
| `S.romanticAnswers`, `S.friendAnswers` | `{ [questionId]: value }` buckets, one per mode. |
| `S.currentQuestion` | 0-based index into `S.questionnaire.questions` — **shared by both modes**. Default 0. |
| `S.answers` | Legacy single bucket; only reset, never read. |
| `S.homeView` | Written on submit success (`= questionnaireMode`) so home lands on that mode. |
| `S.activeMatchMode` | Read by `retakeQuestionnaire()` as the default mode. |
| `S.pendingQuestionnaireBanner` | match.js-owned flag for the refill banner. |
| module-local `isSubmitting` | Submit re-entrancy guard (not on `S`). |

Cleanup: `cleanupUserState()` (called on logout, account switch, 401, and the logged-out branch of `checkUserState`) resets `S.questionnaire=null; S.answers={}; S.romanticAnswers={}; S.friendAnswers={}; S.questionnaireMode='romantic'; S.currentQuestion=0`. `isSubmitting` is not reset by cleanup (a 401 mid-submit lands in the `finally` anyway).

Language: `localStorage.cl_lang` (`'zh'` or absent = `'en'`), read via `window.getLang()`; toggling language reloads the whole SPA (all in-memory answers are lost — the toggle is not reachable from the questionnaire page itself).

---

## 5. i18n

Mechanism: the app is authored in English. In `zh` mode a `MutationObserver` rewrites every text node whose trimmed content **exactly** matches a key of the global `ZH` dictionary (and `placeholder` attributes via `ZH_PLACEHOLDER`); subtrees with `data-no-i18n` are skipped (used here for option labels, which come from the server). Some strings are instead branched at render time with `getLang()==='zh'` (question titles, option labels, the confirm card). Toasts are set via `textContent` and only translate on exact dictionary match — the questionnaire toasts have **no dictionary entries and therefore stay English in zh mode** (iOS should localize them properly).

Server-provided content: zh → `question.title` / `option.label`; en → `question.titleEn || title` / `option.labelEn || label`. Both are guaranteed present for v2 (Appendix A), but keep the fallback.

User-visible strings (en → zh):

Cards overlay
- Complete Your Match Profile → 完善匹配资料
- Complete a questionnaire to unlock that mode. → 完成问卷即可解锁对应模式的匹配。
- Romantic Questionnaire → 恋人问卷 · Friend Questionnaire → 朋友问卷
- Start → 开始 · Retake → 重新填写 · Maybe Later → 稍后再说

Pre-start confirm card (render-time branch)
- en: title "Before you start"; body "The questions ahead are direct and personal — be ready. No offence is intended: honest answers simply make your matches better. Everything you answer is strictly confidential and never shown to anyone. Go with your first instinct."; confirm "I'm ready"; cancel "Maybe later"
- zh: title "开始前，先说一句"; body "接下来的问题会比较犀利、直接，请先做好心理准备。这些问题绝无任何冒犯之意，只是为了更真实地了解你、给你更精准的匹配。你的所有作答都会严格保密、不会公开给任何人。凭第一反应、如实作答就好。"; confirm "我准备好了"; cancel "再想想"

Questionnaire page
- Mode badge: Romantic → 恋人 · Friend → 朋友
- Assessment Progress → 答题进度
- Q.NN watermark and "NN / TT" counter (numeric, untranslated)
- Scale labels: Strongly Disagree → 非常不同意 · Disagree → 不同意 · Neutral → 中立 · Agree → 同意 · Strongly Agree → 非常同意
- Select all that apply → 可多选
- Optional — leave blank to skip → 选填，可留空跳过
- Placeholder Your answer... → 写下你的回答…
- Previous → 上一题 · Next → **下一步** (global key; note it is not "下一题") · Submit → 提交
- Header button tooltip "Questions" (attribute, untranslated)

Navigation sheet
- Answered → 已答 · Unanswered → 未答

Toasts (English only in H5)
- Failed to load questionnaire
- Please answer required question: {localized question title}
- Assessment complete! {N} questions answered · Assessment complete!
- Submit failed: {server message}

Match-side entry points (match.js)
- Fill Out Questionnaire → 填写问卷
- A few quick questions unlock romantic matching. → 花几分钟答题，解锁恋人匹配。
- A few quick questions unlock friend matching. → 花几分钟答题，解锁朋友匹配。
- Questionnaire updated — refill for better matches → 问卷已更新，重新填写让匹配更准 · Refill → 去填写
- Retake Questionnaire → 重新填写问卷

Server error messages are English (e.g. "The following required questions are not answered: …" followed by **Chinese** question titles regardless of language).

---

## 6. Cross-module links

Calls out of this module (all `window.*` globals from `core.js` unless noted):
- `openOverlay(id)` / `closeOverlay(id)` / `hideOverlay(id)` — toggle `.active` on `.overlay` elements.
- `showPage('page-questionnaire' | 'page-home')` — hides all `.page`s and tab panels, hides bottom nav unless home.
- `switchTab('match')` — activates home + bottom nav + `#tab-match`, then `switchHomeView(S.homeView)` (match.js) → for romantic/friend runs `ensureQuestionnaireThenMatch`.
- `confirmCard({title, body, confirmLabel, cancelLabel})` → Promise<true|false|null>.
- `toast(msg)`, `escapeHtml(s)`, `getLang()` (i18n.js), `api(path, method, body)`.

Calls into this module:
- `profile.js saveProfile()` → `renderQuestionnaireCards()` (post-setup).
- `match.js goFillQuestionnaire(mode)` (prompt card / refill banner) → sets `S.questionnaireMode`, `showPage`, `loadQuestionnaire(mode)`.
- `index.html #filter-overlay` "Retake Questionnaire" → `retakeQuestionnaire()`.
- `index.html` inline handlers: `startQuestionnaire('romantic'|'friend')`, `dismissQuestionnaireCards()`, `openQNav()`, `prevQuestion()`, `nextQuestion()`, `jumpToQuestion(i)`, `answerScale(id,val)`, `answerChoiceEl(el)`, `answerText(id,val)`.
- `core.js cleanupUserState()` resets the state fields; the global swipe-back gesture special-cases `#page-questionnaire`.
- `window.currentAnswers` is exported but has no external callers.

Backend modules: `questionnaire` (user endpoints), `answers`; completion is also consulted by `matching` (`/matching/start` rejects users whose questionnaire for that mode is incomplete — the H5 pre-check in `startMatch()` exists to avoid charging energy first).

---

## 7. Gotchas

1. **Scale direction is 1 = Strongly Disagree … 5 = Strongly Agree**, rows listed top-to-bottom in that order. It was flipped when v2 shipped; do not copy the pre-v2 H5 order. The old iOS `ScaleInput` already uses this direction, but its `getScaleAnswer` defaults to 3 when unanswered → visually pre-selects "3". H5 shows nothing selected until the user taps. Fix on iOS.
2. **Answer value contract**: single choice stores `option.value` (stable snake_case, e.g. `must_same_city`), multi stores an array of those values in selection order, scale stores an integer 1–5, text stores the raw string. The matching hard-gates compare `value` strings — never send labels or option ids.
3. **Blank rule** (`undefined/null/''/[]`) drives three things: resume index, nav-grid coloring, and which entries are POSTed. Server is stricter (trims strings, `['']` is empty). Currently no required TEXT question exists, so whitespace-only answers cannot fail server-side today; still trim on iOS.
4. **Submit never deletes**: entries are upserted per question; blank entries are simply not sent, so a previously submitted optional TEXT answer cannot be cleared from the server via this UI.
5. **Single `S.questionnaire` slot + shared `S.currentQuestion`**: opening the *other* mode's questionnaire (or any different version id) resets the current mode's in-memory bucket on the next load and re-hydrates it from `/answers/mine`. Unsubmitted in-progress answers for mode A are lost if the user opens mode B in between. Same-version re-entry resumes at the same index; index is clamped to `firstUnansweredIndex` if out of range.
6. **Retake lands on the last question** when every question already has a saved answer (`firstUnansweredIndex` clamps to `length-1`), showing "Submit" immediately; the user is expected to jump around with the grid or "Previous". Resume with partially saved answers lands on the first unanswered one.
7. **No loading/empty/error screens** in H5 — stale placeholder markup shows until data arrives; load failure = toast only. iOS should keep its proper states. Also an "empty questions" version simply renders nothing.
8. **Cards overlay appears only once**, right after first profile setup, on top of the home Chat view; it is never re-shown on login. If the completion fetch fails both cards show "Start". The `.q-card--done { .q-card-check{color:#CCFF00} }` CSS is dead code (JS never adds the class) — the completed check icon is black (dark: `#eceae6`), not neon. Decide deliberately on iOS (either is defensible; neon matches the intent).
9. **Pre-start confirm card** ("questions are direct…confidential") only on the cards path. Match-view prompt/banner and the preferences "Retake" go straight to the page.
10. **Completion semantics**: `completed` only counts *required* questions of the *active* version. Publishing a new version resets everyone to incomplete → the match view shows the prompt card for idle users and the refill banner for everyone else (they keep full access). Answers to old versions are kept but never count again. A type with no active version can never be completed (and `/questionnaire/active` 404s).
11. **Submit failure modes worth surfacing nicely on iOS**: 400 "no longer accepts submissions" (version rotated mid-fill → reload the questionnaire), 400 missing required (server lists Chinese titles), 400 foreign question ids (would only happen with a stale cached version).
12. **Privacy**: answers are private to the user (never rendered to others; only feed the matcher). No anonymity/alias concerns, no energy cost anywhere in this module.
13. **Progress bar = position** ((index+1)/total), not completion; counter and watermark are zero-padded ("03 / 18", "Q.03"); grid numbers are plain.
14. **"Previous" is `visibility:hidden` on question 1** (keeps layout); "Next" becomes "Submit" + check icon on the last question; button is disabled (no visual change) only during the in-flight POST; double-tap guarded.
15. **Text flush before navigation** covers IME composition; the nav grid does not flush but reads the bucket, which is updated on every input event.
16. **Safe areas**: header adds the top inset to its height; footer and the nav sheet have **no** bottom inset (H5 quirk) — use proper bottom safe area on iOS.
17. **Back / swipe-back does not save** and shows no "discard?" prompt; answers stay in memory for later resume (same version only).
18. **`/questionnaire/completion` ignores `?type`** and always returns both modes; one call suffices for both cards.
19. **Language rendering**: question/option text is chosen at render time by language (`titleEn/labelEn` with zh fallback) and option labels are marked `data-no-i18n`; UI chrome uses the global dictionary; H5 toasts stay English in zh — ship localized toast copy on iOS.
20. **Existing iOS code reuse**: `Questionnaire.swift` models decode fine but lack `titleEn`, `labelEn`, `code/semantics/hardness/weight/target`; `QuestionOption` needs `labelEn`. `QuestionnaireService` already has `active/completion/submit`; add `GET /answers/mine?versionId=`. `QuestionnaireViewModel` needs: two answer buckets keyed by mode, resume from saved answers, blank-rule, required-only validation at submit (H5 does **not** gate "Next" per question), drop-blank payload, `answeredCount` toast. `QuestionnaireView` is the old dark neon/Chinese-only design — rebuild to the light design above (badge, progress line, watermark, list-row options, fixed footer, nav grid sheet). `OnboardingCoordinator` currently pushes the romantic questionnaire directly after profile setup; H5 instead shows the two-card chooser overlay on top of the home Chat tab.

---

## Appendix A — Live v2 question bank (production: romantic v4 = 18 q, friend v5 = 14 q; source `apps/api/prisma/questionnaire-v2.ts`)

Useful as fixtures / for previews. Order below is the server order. `req` = isRequired. Titles: zh / en. Options: `value` — zh / en.

Shared head (both modes, first 3):
1. `db_distance` SINGLE_CHOICE req — 对异地 / 距离的态度 / Your stance on distance — `must_same_city` 必须同城 / Must be in the same city; `ok_short_distance` 可接受短期异地 / Short-term distance is OK; `any` 都行 / Either is fine
2. `val_family` SCALE req — 比起事业发展，我更把家庭与亲密关系放在优先位置 / I put family and close relationships ahead of career growth
3. `val_openness` SCALE req — 我乐于和背景、文化差异很大的人深入相处 / I enjoy getting close to people from very different backgrounds

Romantic middle (4–15):
4. `ser_intent` SINGLE — 你想找的关系是 / What kind of relationship are you looking for? — `serious_longterm` 认真长期的关系 / A serious long-term relationship; `see_how_it_goes` 先了解，看发展 / Get to know each other and see; `casual` 轻松随意 / Something casual
5. `ser_pace` SCALE — 我希望关系确定得快一些，而不是慢慢来 / I prefer things to get serious quickly rather than slowly
6. `ser_exclusive` SCALE — 我非常看重关系中的忠诚与排他 / Loyalty and exclusivity matter a great deal to me
7. `life_schedule` SCALE — 我是夜猫子，经常凌晨才睡 / I am a night owl and often stay up past midnight
8. `life_clean` SCALE — 我会把自己的空间保持得整洁有序 / I keep my space clean and organised
9. `life_smoking_self` SINGLE — 你吸烟吗？ / Do you smoke? — `no` 不吸烟 / No; `occasionally` 偶尔 / Occasionally; `regularly` 经常 / Regularly
10. `life_smoking` SINGLE — 如果对方吸烟，你… / If your partner smokes, you… — `never` 绝对不能接受 / Absolutely cannot accept; `tolerate` 不喜欢但能接受 / Dislike it but can tolerate; `fine` 无所谓 / Do not mind
11. `com_expression` SCALE — 和人相处时，我更多是健谈的一方，而不是倾听的一方 / In conversations I tend to talk more than I listen
12. `com_conflict` SINGLE — 发生矛盾时你会 / When conflict happens, you usually… — `talk_now` 当场说清楚 / Talk it out right away; `cool_down_first` 先冷静再谈 / Cool down first, then talk; `avoid` 回避不谈 / Avoid the topic
13. `com_frequency` SCALE — 我希望和对方保持高频联系，而不是彼此留很多空间 / I prefer frequent contact over lots of personal space
14. `fin_style` SCALE — 消费上我更倾向享受当下，而不是精打细算 / I would rather enjoy the moment than budget carefully
15. `fin_aa` SINGLE — 约会花费你倾向 / On date expenses you prefer… — `aa` AA 制 / Split the bill; `take_turns` 轮流请 / Take turns treating; `whoever_convenient` 谁方便谁来 / Whoever finds it convenient

Friend middle (4–11):
4. `soc_energy` SCALE — 聚会里我通常是活跃气氛的那个，而不是安静待着的 / At gatherings I am usually the lively one, not the quiet one
5. `soc_initiative` SCALE — 我更喜欢自己张罗组织活动，而不是参加别人组织的 / I prefer organising activities myself over joining ones others plan
6. `act_types` MULTIPLE_CHOICE — 你常参加的活动（可多选） / Activities you often do (multiple) — `sports` 运动 / Sports; `gaming` 游戏 / Gaming; `music` 音乐 / Music; `movies` 影视 / Movies & TV; `food` 美食 / Food; `travel` 旅行 / Travel; `reading` 读书 / Reading; `photography` 摄影 / Photography; `boardgames` 桌游 / Board games; `camping` 露营 / Camping
7. `act_style` SINGLE — 更喜欢的相处方式 / Preferred way to hang out — `go_out` 一起出门玩 / Going out together; `online` 线上开黑 / 聊天 / Online gaming / chatting; `both_ok` 都可以 / Both work for me
8. `pace_plan` SCALE — 做事我计划性很强，而不是随性来 / I plan things carefully rather than go with the flow
9. `pace_reply` SCALE — 我习惯尽快回消息，基本不让人久等 / I reply to messages quickly and rarely keep people waiting
10. `plan_stage` SINGLE — 你当前阶段的重心 / Your main focus right now — `study` 学业科研 / Study & research; `career` 实习求职 / Internships & job hunting; `social` 社团玩乐 / Clubs & having fun; `startup` 创业搞钱 / Startups & making money
11. `plan_future` SCALE — 毕业后我更倾向留在国外发展，而不是回国 / After graduation I lean towards staying abroad rather than going home

Shared tail (both modes, last 3):
- `asp_shared` MULTIPLE_CHOICE req — 希望和对方有共同的…（可多选） / What would you like to have in common? (multiple) — `sports` 运动 / Sports; `gaming` 游戏 / Gaming; `music` 音乐 / Music; `movies` 影视 / Movies & TV; `food` 美食 / Food; `travel` 旅行 / Travel; `reading` 读书 / Reading; `photography` 摄影 / Photography; `pets` 宠物 / Pets
- `asp_traits` TEXT **optional** — 一句话形容你想认识的人 / Describe the person you hope to meet, in one sentence
- `db_other` TEXT **optional** — 还有什么是你完全无法接受的？ / Anything else you absolutely cannot accept?

All SCALE/SINGLE/MULTI questions are required; only the two TEXT questions per mode are optional (so `completed` = 16/18 romantic, 12/14 friend answered). `group` values (zh only, unused by UI): 价值观 / 恋爱观 / 生活习惯 / 沟通 / 财务观 / 社交风格 / 兴趣活动 / 人格节奏 / 生活规划.

## Appendix B — Data model (Prisma)

- `QuestionnaireVersion { id cuid, version int @unique (global counter across both types), type ROMANTIC|FRIEND, title, description?, isActive, publishedAt? }` — at most one active per type (enforced in `publishVersion`).
- `Question { id, questionnaireId, type, title, titleEn?, description?, isRequired=true, isEnabled=true, order, group?, code?, semantics='similar', hardness='soft', weight=1, target='self' }`.
- `QuestionOption { id, questionId, label, labelEn?, value, order }`.
- `Answer { id, userId, questionnaireVersionId, questionId, value Json, submittedAt, updatedAt; @@unique(userId, questionnaireVersionId, questionId) }`.
