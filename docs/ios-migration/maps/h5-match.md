# H5 module map — `match` (home track: Chat / Romantic match / Friend match)

Source of truth read for this map:

- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/match.js` (1847 lines, read in full)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` lines 664–722 (`#tab-match`), 878–1046 (`#filter-overlay`), 1238–1243 (`#partner-profile-overlay`), 861–875 (`#bottom-nav`), 29–100 (Tailwind token config)
- `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` — rules for `#tab-match`, `#home-track`, `.home-pane`, `.home-match-pane(.match-plan)`, `.home-mode-switch/.home-mode-seg`, all `.mp-*`, `#chat-plus-menu .cpm-*`, `.overlay`, `.bottom-sheet-transition`, `.ink-switch`, `.ink-range`, `.neon-check`, `.btn-cta`, `#toast`, `.ptr-indicator`, `#bottom-nav`, dark-mode overrides
- Helpers it depends on: `src/modules/core.js` (api, cleanupUserState, switchTab, showPage, overlays, confirmCard, promptCard, toast, attachPullToRefresh, bindSheetDragClose, btnBusy, flatEmptyIcon, safeUrl), `src/modules/i18n.js` (ZH dictionary + observer, getLang, metaLabel), `src/modules/profile.js` (gender/age controls, loadEnergyBar, openEnergyModal), `src/modules/chat.js` (loadSessions, openSessionById), `src/modules/couple.js` (renderCoupleSpace), `src/modules/questionnaire.js` (loadQuestionnaire, retakeQuestionnaire), `src/main.js` (wiring), `src/state.js`
- Backend contracts confirmed in `/Users/aimi/Downloads/unimatcha-compact/apps/api/src/matching/matching.controller.ts`, `matching.service.ts`, `dto/*.ts`, `questionnaire/questionnaire.service.ts`, `users/users.controller.ts`, `users/users.service.ts`, `profiles/profiles.service.ts`, `energy/energy.service.ts`, `matching/mode.util.ts`, `prisma/seed.ts`

Design tokens used throughout (from Tailwind config in index.html): `neon` #CCFF00, `neon-pink` #FF2EC4, `primary` #000000, `on-primary` #e2e2e2, `surface`/`background` #f9f9f9, `surface-container-lowest` #ffffff, `surface-container-low` #f3f3f3, `surface-container` #eeeeee, `surface-container-high` #e8e8e8, `on-surface` #1b1b1b, `on-surface-variant` #474747, `outline` #777777, `outline-variant` #c6c6c6. Every Tailwind radius (`rounded`, `rounded-lg`, `rounded-xl`, `rounded-2xl`…) is remapped to 10px; only explicit `rounded-full`/`rounded-[Npx]` differ. Fonts: `font-headline`/`font-body`/`font-label` = Plus Jakarta Sans (fallback PingFang SC / Noto Sans SC), `font-mono` = JetBrains Mono. Icons: Material Symbols **Rounded** (the class name is `material-symbols-outlined` but CSS forces the Rounded family, FILL 0, wght 300, opsz 24). Dark mode = `html.dark` class; base #121110, card #1c1b19, primary text #eceae6, secondary text #aaa8a3, tertiary #8c8a85, borders #343230; neon stays #CCFF00 with black text.

---

## 1. Screens & states

### 1.1 Home container `#tab-match` (the "Match" bottom tab)

Entered by `switchTab('match')` (bottom-nav first item, icon `chat_bubble`, label "Match"; also on boot after `/users/me` succeeds with a profile, after questionnaire completion, after saveProfile). `switchTab` stops match polling / chat polling / notif polling / countdown tick, shows `#tab-match` (`display:block`), then calls `switchHomeView(S.homeView || 'chat')`. Exited by tapping Square / Profile tab (`switchTab` hides all `[id^="tab-"]`, stops timers).

Layout (fixed full-screen layer, z-index 41, background #f9f9f9, **overflow hidden** — the container itself does not scroll):

1. **Top bar** — `fixed top-0 left-0 w-full z-40`, height 56px + status-bar inset (rule `.fixed.top-0.h-14 { height: calc(3.5rem + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top) }`), background `surface/80` (#f9f9f9 @ 80 %) with `backdrop-blur-xl`, no shadow, `px-2` (8px), `flex items-center gap-1` (4px).
   - Left `#home-addfriend-btn`: 40×40 circular button, icon `add` 22px black, `title="Add"`, tap → `toggleChatPlusMenu()` (same on all three views; `switchHomeView` re-asserts icon/handler each switch).
   - Center `#home-mode-switch` (segmented control): `flex`, `gap:3px`, `padding:3px`, `border:1px solid rgba(0,0,0,.08)`, pill radius, background #ffffff, height 40px, `flex-1 min-w-0 max-w-[268px] mx-auto`. Three `.home-mode-seg` buttons (`data-view` = chat | romantic | friend), each `flex:1 1 auto` (width follows label length, not equal thirds), height 100 %, `padding:0 .65rem`, pill radius, Plus Jakarta Sans 700 12px, letter-spacing .04em, color #1b1b1b, transparent background; `.active` → background #CCFF00, color #000; hover #f3f3f3; `:active` scale .98; transitions .2s. Labels "Chat" / "Romantic" / "Friend" (zh via dictionary: 聊天 / 恋人 / 朋友). Dark: container bg #1c1b19 border rgba(255,255,255,.08); seg text #eceae6; hover #292724; active stays neon/black.
   - Right: 40×40 circular button, icon `notifications_none` 22px black, `title="Notifications"`, tap → `openNotifications()` (notifications module). Child `#notif-badge` (hidden by default): absolute top 2px right 2px, min-w 16px h 16px px-1, bg neon, black 10px bold, pill.

2. **Track `#home-track`** — `display:flex; align-items:stretch; gap:12px; height:100dvh; will-change:transform`. Three `.home-pane` children, each `flex:0 0 100%; min-width:0; height:100%; overflow-y:auto; overscroll-behavior-y:none; -webkit-overflow-scrolling:touch`. The track is positioned with `transform: translateX(-i × (paneWidth + 12))` where `i` = index in `['chat','romantic','friend']` and `paneWidth` = `#tab-match.clientWidth` (fallback `window.innerWidth`, then 375). Transition `transform 0.28s cubic-bezier(0.22,1,0.36,1)` when animating (tap on segment after first entry, swipe settle); `none` during finger-drag, on first entry into the tab, on window resize, and after account switch (`resetMatchPlanState` clears the "entered" flag so the next entry snaps without animation).
   - `#home-chat-view` (Chat pane): `max-w-2xl mx-auto px-0 pb-28`, `padding-top: calc(62px + safe-area-top)` (top bar 56 + 6). Contents (`#chat-banner` hidden, `#chat-sessions-temp`, `#chat-sessions-confirmed`, `#chat-sessions-empty`) are rendered by chat.js — see the chat map. This pane is the scroll container that drives bottom-nav auto-hide (`bindNavAutoHide`: scrollTop < 40 → show; delta > 6 down → hide (nav translates off-screen + fades); delta < −6 up → show) and pull-to-refresh (see §2.4).
   - `#home-match-romantic` and `#home-match-friend` (`.home-pane.home-match-pane`), each containing one `div.match-content.w-full.flex.flex-col.items-center.justify-center`. All romantic/friend rendering targets `matchContentEl(mode)` = that inner div. Two layout modes toggled by the pane class `match-plan` (`setMatchPlanLayout(mode,on)`):
     - **Centered mode** (default; used by matched / no_match / relationship / partner-missing / questionnaire prompt): pane `display:flex; flex-direction:column; align-items:center; padding: calc(56px + safe-top) 24px 13rem` (bottom 208px so content clears the floating nav); `.match-content { margin-top:auto; margin-bottom:auto }` → short content is vertically centred, tall content top-aligns and the pane scrolls.
     - **Plan mode** (`.home-match-pane.match-plan`; used by idle / searching): pane `padding: calc(64px + safe-top) 30px calc(96px + safe-bottom)` (title sits 8px under the top bar), `align-items:stretch; justify-content:flex-start; overflow:hidden` (page never scrolls; only the summary box body scrolls); `.match-content { flex:1 1 0; min-height:0; margin:0; align-items:stretch; justify-content:flex-start }`.

3. **Bottom nav `#bottom-nav`** (shared, shown on all three tabs): floating pill centred horizontally, `bottom: calc(14px + safe-bottom)`, background rgba(255,255,255,.92) + blur 20px, border 1px rgba(0,0,0,.08), padding 6px 14px, gap 18px, no shadow; three 50×50 circular icon buttons (`chat_bubble` Match, `eco` Square, `person` Profile), icon 33px, labels hidden; active = neon #CCFF00 icon with FILL 1 / wght 400; `.nav-hide` → translateY(100 % + 24px) + opacity 0. Dark bg rgba(28,27,25,.92).

Safe-area rule of thumb for this screen: the panes are **not** siblings of the fixed top bar, so the generic `.fixed.top-0 ~ main { margin-top: env(safe-area-inset-top) }` compensation does not apply; each pane adds the inset exactly once in its own padding (documented in CSS comments; adding it anywhere else double-shifts).

### 1.2 State matrix (what each pane renders)

`renderMatchTab(data)` first stops the countdown tick and resets the pane to centered layout, then branches on `data.mode` (falls back to `S.activeMatchMode`, default 'romantic'):

| mode | `state` | renderer | layout |
|---|---|---|---|
| romantic | `idle` / unknown | `renderPlanState(container,'romantic',false)` | plan |
| romantic | `searching` | `renderPlanState(container,'romantic',true)` | plan |
| romantic | `matched` / `confirming` | matched card (§1.4); partner missing → §1.8 | centered |
| romantic | `no_match` | no-match empty card (§1.5) | centered |
| romantic | `relationship` | `renderCoupleSpace(container, matchId, partner)` (couple.js); partner missing → §1.8 | centered |
| friend | `idle` / unknown, or `matched` with empty `matches` | `renderPlanState(container,'friend',false)` | plan |
| friend | `searching` | `renderPlanState(container,'friend',true)` | plan |
| friend | `matched` with ≥1 `matches` | candidate card list (§1.6) | centered |
| friend | `no_match` with empty `matches` | no-friends empty card (§1.7) | centered |
| friend | `no_match` with non-empty `matches` | falls through to plan page idle (no dedicated card) | plan |

Additional non-state renders in the same pane: questionnaire prompt (§1.9), refill banner prepended above any state (§1.10), "Profile Unavailable" (§1.8), plan-page preheat for the non-active pane (§1.3).

### 1.3 Plan page — idle & searching (both modes)

Rendered by `renderPlanState(container, mode, searching)` into the pane's `.match-content` in plan layout. Top-to-bottom:

1. **Title** `h2.mp-title` — 26px, Plus Jakarta Sans, weight 800 (`font-extrabold`), letter-spacing −0.025em (`tracking-tight`), color on-surface #1b1b1b, `shrink-0`.
   - idle romantic: "Start Your Journey" (zh 开始你的旅程)
   - idle friend: "Find New Friends" (zh 寻找新朋友)
   - searching (both modes): "Matching in Progress" (zh 匹配进行中)
2. **Subtitle** `p.mp-sub` — body 14px, line-height 1.65, margin-top 6px, color #8a8a8a (dark #8c8a85), `min-height: 3.3em` (always reserves two lines so the green card sits at the same y in both states), `shrink-0`.
   - idle romantic: "Join this week's pool — the algorithm will watch the crowd for someone on your wavelength." (zh 加入本周匹配池，让算法在人海里为你留意那个同频的人。)
   - idle friend: "Join this week's pool to meet up to 5 friends on your wavelength." (zh 加入本周匹配池，最多认识 5 位同频的新朋友。)
   - searching romantic: "Names are revealed Friday 17:00 — someone on your wavelength is walking toward you." (zh 名字会在周五 17:00 准时揭晓——同频的人，正穿过人海向你走来。)
   - searching friend: "Names are revealed Friday 17:00 — friends on your wavelength are on the way." (zh 名单会在周五 17:00 准时揭晓——同频的朋友们，正穿过人海向你走来。)
3. **Bleeding neon countdown card** `.mp-card` (`.mp-card--alt` when searching):
   - `width: calc(100% + 44px); margin: 14px -22px 0` → the card pokes 22px past the pane's 30px side padding on each side (8px from the screen edge), `flex-shrink:0`.
   - background #CCFF00, text #000 **in both light and dark mode**; padding 14px 18px 16px; hand-drawn irregular corners: idle `border-radius: 24px 28px 22px 28px / 28px 22px 28px 24px`, searching (alt) `28px 24px 28px 22px / 22px 28px 24px 28px`.
   - `p.mp-card-label`: 10px, 800, letter-spacing .3em, rgba(0,0,0,.5). "NEXT REVEAL IN" / zh "距下轮公布" (rendered at build time per language, `data-no-i18n`).
   - **Week row** `.mp-week` (margin-top 8px, `flex; justify-content:space-between`): 7 `.mp-day` cells Mon→Sun of the **current local week** (Monday 00:00 computed from `now`), each `width:44px; padding:7px 0 6px; flex column; gap:4px; align center; position:relative`. Day name `.mp-day-name` 11px 700 rgba(0,0,0,.45) — en `M T W T F S S`, zh `一 二 三 四 五 六 日`; day-of-month `.mp-day-num` 16px 800 #1b1b1b tabular, zero-padded 2 digits. **Today** cell gets `.mp-day--today`: background #ffffff, radius 11px, name rgba(0,0,0,.55), number #000. **Reveal day** cell (only if the reveal date — see §7 countdown source — falls inside this Mon–Sun row; index = whole days between Monday-midnight and reveal-midnight) gets two absolutely positioned children: `.mp-day-badge` (top −12px, centred, background #fff, color #000, 9px 800, letter-spacing .06em, padding 2px 6px 2.5px, radius 5px, z 1) with text "REVEAL" / zh "公布日", and `.mp-day-ring` — an SVG 40×28 at top 21px centred: `<path d="M20 3 C30 2.5 37 8 37 14 C37 21.5 29 26 19 25.5 C10 25 3 21 3 14.5 C3 8 11 4 23 3.2" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" fill="none">` (a hand-drawn open ellipse around the number). If the reveal is not in this week no badge/ring is drawn anywhere.
   - **Countdown line** `.mp-cd` (margin-top 14px, `flex; align-items:baseline`, carries `data-mode` and `data-day-stamp` = today's day-of-month): four `[number][unit]` pairs. `.mp-num`: inline-block, `font-size: min(48px, 12vw)`, 800, line-height 1, letter-spacing −.02em, tabular numerals, color #000 with an 8-direction white text-shadow (2px orthogonal + 1.5px diagonal) = white outline on green. `.mp-unit`: 12px 700 rgba(0,0,0,.5), `margin: 0 10px 0 5px`, last unit no right margin. Units en `d h m s`, zh `天 时 分 秒`. Values zero-padded to 2 digits (days included). Digits are updated in place every second by `startCountdownTick` (both panes' cards tick independently by `data-mode`); at local midnight the tick re-renders that card's week row in place (compares `data-day-stamp`).
4. **Read-only summary box** `.mp-box` (`display:flex; flex-direction:column; flex:1 1 0; min-height:88px; margin-top:20px; overflow:hidden`; carries `data-plan="<mode>:<s|i>"`):
   - **Fixed head** `.mp-box-head` (`flex; align-items:center; justify-content:space-between; flex-shrink:0`):
     - left `.mp-label` 10px 800 letter-spacing .26em #9a9a9a: "MATCH PREFERENCES" / zh "匹配偏好"
     - right, idle: `button.mp-editlink` (flex column, centred, 11px 800 letter-spacing .08em, color #1b1b1b / dark #eceae6, no bg/border, `:active` scale .95): text "Edit" / zh "编辑" over an SVG 26×5 neon squiggle underline `<path d="M2 3 C7 1.6 13 3.8 18 2.6 C21 2 23.5 3 24 2.6" stroke="#CCFF00" stroke-width="2.6" stroke-linecap="round">`. Tap → `openFilterSheet(mode)`.
     - right, searching: `button.mp-lockline` (inline-flex, gap 4px, 10px 700 letter-spacing .06em, color #b0b0b0): icon `lock` 13px + "Locked while matching · leave pool to edit" / zh "匹配中锁定 · 离开后可修改". Tap → toast (see §2.9).
   - **Scrolling body** `.mp-box-scroll` (`flex:1 1 0; min-height:0; overflow-y:auto`, scrollbar hidden, `overscroll-behavior-y:contain`; searching adds `.mp-dim` = opacity .55 on the whole body):
     - 2×2 grid (`grid-cols-2 gap-x-4` = 16px column gap, `mt-0.5`), each cell `flex flex-col py-1.5` with `gap:1px` and `.mp-sep` bottom hairline `1px solid rgba(27,27,27,.07)` (dark rgba(255,255,255,.09)): label `span` 10px letter-spacing .06em color #b0b0b0 (`.mp-muted`), value `span[data-mp]` 14px weight 800 on-surface, placeholder "—" until filled.
       - romantic order: Target Gender · Age Range · University Stage · School Filter (zh 目标性别 · 年龄范围 · 学业阶段 · 校区筛选)
       - friend order: Target Gender · Age Range · Interest Priority · School Filter (zh 目标性别 · 年龄范围 · 兴趣优先 · 校区筛选)
     - `p.mp-label mt-3 mb-1`: "MATCH SETTINGS" / zh "匹配设置"
     - Enhanced row (`flex items-center justify-between gap-3.5 py-1.5 mp-sep`): left column — "Enhanced Mode" / zh "增强模式" (14px bold on-surface) + sub-line `[data-mp=enh-sub]` 11px #b0b0b0; right — display-only toggle `.mp-toggle` (40×22 pill, bg #d6d4d3, knob 17px white with `0 1px 3px rgba(0,0,0,.25)` shadow at 2.5px inset; `.on` → bg #CCFF00 and knob translateX 18px; dark off-bg #343230). **Not tappable** — editing goes through the sheet.
     - Extra-info block (`py-1.5`): "Extra Info" / zh "补充信息" (14px bold) then `div.mp-extra` (margin-top 6px, bg #f3f3f3, radius 10px, padding 10px 12px, 12px/1.6, #1b1b1b, `white-space:pre-wrap; word-break:break-word`; dark bg #23211f text #eceae6). Empty → `.mp-extra--empty` (#b0b0b0, dark #8c8a85) showing the placeholder "Anything else to help matching…" / zh "告诉算法更多关于你的事".
   - Value formatting (`fillPlanBox(mode, prefs)`; all values `data-no-i18n`, language chosen at render time):
     - gender: `male` → "Male"/"男生"; `female` → "Female"/"女生"; anything else (null/`all`) → "Any"/"不限"
     - age: `ageMin==null && ageMax==null` → "Any"/"不限"; else `${ageMin ?? 18} — ${ageMax ?? 30}` (em dash, spaces)
     - interests (friend): first 3 of `preferredInterests` joined with " · "; empty → "Not set"/"未设置"
     - stage (romantic): split `universityStage` on commas, map undergraduate→"Undergrad"/"本科", master→"Master"/"硕士", doctor→"PhD"/"博士", join " · "; empty → "Any"/"不限"
     - school: both `requireSameUniversity`+`requireSameCity` → "Same school · city"/"仅同校 · 同城"; only university → "Same school only"/"仅同校"; only city → "Same city"/"同城"; neither → "Any"/"不限"
     - extra: trimmed `extraMatchInfo` or placeholder (+ empty class)
     - enhanced toggle `.on` when `(searching && lastEnhancedRound[mode]) || S.enhanced[mode].enabled`; `cells` = friend ? clamp(1…5, `S.enhanced.friend.cells`) : 3. Sub-line: if this round was entered with enhanced (searching && `lastEnhancedRound[mode]`) → "Active this round · N cells"/"本轮已生效 · N 能量"; friend & on → "Guarantee N · N cells"/"保底 N 位 · N 能量"; friend & off → "1 cell per guaranteed friend"/"每保底 1 位朋友 1 能量"; romantic → "3 cells · refunded if no match"/"3 能量 · 未匹配自动退回".
     - If `prefs` is null (nothing cached yet) only the enhanced section is filled; the grid keeps "—" until `GET /matching/preferences` returns.
5. **Bottom CTA** `button.mp-cta` (`display:block; flex-shrink:0; width:100%; margin-top:14px; border-radius:12px; padding:17px 20px; 14px 800 letter-spacing .18em; bg #CCFF00; color #000; box-shadow 0 8px 20px rgba(204,255,0,.35)`; hover brightness .96, active scale .98, disabled opacity .5):
   - idle: "Join Matching Pool" / zh "加入匹配池" → `startMatch()`
   - searching: `.mp-cta--leave` variant — transparent bg, color #FF2EC4, border 1.5px #FF2EC4, padding 16px 20px, no shadow, hover bg rgba(255,46,196,.06): "Leave Pool" / zh "离开匹配池" → `stopMatch()`

Geometry verified by the H5 authors at 375px: title y = 64 + safe-top; idle and searching are pixel-identical except copy, card corner variant, header control, body dimming and CTA.

Same-state re-render guard: if the pane already holds a `.mp-box` whose `data-plan` equals `mode:s|i`, `renderPlanState` only restarts the tick and re-fills values (no DOM rebuild, no preference re-fetch) — this is what keeps the box scroll position and avoids an extra request on every 30 s poll.

Pre-heat: when entering any view, `prewarmMatchPanes` renders the plan page (idle or searching per cached `S.matchStatus[m].state`) into any *other* match pane that is still empty, so a horizontal swipe reveals a real page instead of a blank pane. Its preference fetch runs concurrently with the active pane's (per-mode sequence tokens).

### 1.4 Romantic — matched / confirming card

Rendered in centered layout when `state ∈ {matched, confirming}` and `data.partner.nickname` exists.

- Wrapper `div.w-full.max-w-xl.mx-auto.py-4`.
- Caption `p` (`px-2 mb-4`): headline 10px bold, color outline-variant #c6c6c6, letter-spacing .3em — "This Week's Match" / zh "本周匹配".
- Card `div.relative.border.border-outline-variant/10.overflow-hidden.rounded-[10px]`:
  - Background layer: `partner.coverUrl` (else avatar) as absolute `object-cover` image; when it is the avatar fallback add `blur-2xl scale-125`. Over it a gradient `linear-gradient(to bottom, rgba(249,249,249,.3), rgba(249,249,249,.62) 48%, rgba(249,249,249,.92) 82%)`. No image at all → solid white.
  - Content `div.relative.p-6`:
    - Centered column (`mb-6 pt-2`): avatar 112×112 (`w-28 h-28`) circle, border 4px black (`border-primary`), inner padding 4px, bg white, `mb-3`, **pulsing** (`.cl-pulse`: scale 1→1.12 & opacity 1→.55, 1.8s ease-in-out infinite). Fallback: grey circle (#eeeeee) with `person` icon 36px #777.
    - `h3` nickname 24px headline bold tracking-tight on-surface, centred, with `verified` icon (16px, black) when `partner.verificationStatus === 'verified'` (title "Campus verified").
    - `p` school[ · academic_year] 14px #777 (`data-no-i18n`, both passed through `metaLabel` for zh display names).
    - If `partner.interests || partner.tags` non-empty: caption "Shared Interests" / zh "共同兴趣" (10px letter-spacing .2em #777 mb-2) and up to 6 chips: bg black, text #e2e2e2, `px-3 py-1`, radius 10px, 10px bold letter-spacing widest, gap 8px.
    - Remaining-time block (only when `match.remainingMs != null`): `text-center mb-3 py-3` with 1px top+bottom border outline-variant/20; hint "Open the chat and both confirm within this time" (10px letter-spacing .15em #777 mb-1); then `#match-remaining-countdown` — JetBrains Mono 24px light (weight 300) letter-spacing widest, color black, initial "--:--:--", then `formatCountdown(ms)` = `HH:MM:SS`, or `Dd HH:MM:SS` when ≥ 1 day, ticking each second from a deadline computed as `Date.now() + remainingMs` at render; at 0 shows "00:00:00", stops, and reloads status.
    - `button.btn-cta` (full-width neon block, radius 10px, padding 20px 24px, 14px bold letter-spacing .1em, `shadow-lg`, `mt-2`): "Enter Chat" / zh "进入聊天" → `openConnectionChat(matchId)`.
    - Footnote `p.text-center.mt-3` 10px #c6c6c6 leading-relaxed: 'Both of you must tap "Confirm Partner" in chat within 48 hours' (zh 48 小时内双方都在聊天中点「确认为恋人」即可) + when `match.myConfirmed && !match.partnerConfirmed`: " · You have confirmed, waiting for their response" (zh dictionary has 你已确认，等待对方回应 for the standalone sentence; the concatenated form is only partially translated by the text-node matcher — see §5).
- Side effect: `reportMatchEvent(matchId,'viewed')`.
- Confirm/dissolve actions are **not** on this card — they live in the chat header (chat.js, "D rule").

### 1.5 Romantic — no_match

Centered empty card `div.w-full.text-center.px-8.py-16`:
- `flatEmptyIcon('hourglass_empty')` (muted tone): 64×64 rounded-18px box bg #efefef, icon 28px #8a8a8a, `mx-auto mb-6`.
- `h2` 18px headline extrabold tracking-tight on-surface `mb-2`: "No Match This Week" / zh "本周暂无匹配"
- `p` 14px on-surface-variant `mb-10 max-w-xs mx-auto leading-relaxed`: `data.message` if the API sent one, else "No suitable match this week. See you next Friday." (zh 本周暂无合适匹配，下周五见。)
- Column `max-w-xs gap-6`: `button.btn-cta` "Match Again" / zh "重新匹配" → `startMatch()`; text link 10px letter-spacing .15rem #777 underline offset 8px "Modify Preferences" / zh "修改偏好" → `openFilterSheet()` (mode defaults to active mode).

### 1.6 Friend — matched (candidate list)

Centered layout; `div.w-full.max-w-xl.mx-auto.py-4`:
- Caption (`px-2 mb-4`, 10px bold #c6c6c6 letter-spacing .3em): "Friend Candidates · N" (zh 朋友候选 · N) where N = `matches.length`.
- `div.grid.grid-cols-1.gap-3` of up to **5** cards (`matches.slice(0,5)`), each `renderFriendCandidateCard(c)`:
  - `div.relative.border.border-outline-variant/15.rounded-[10px].p-4.flex.flex-col.overflow-hidden`; background = partner cover (or blurred avatar) + gradient `rgba(249,249,249,.4) → .7 @55% → .94 @85%`; none → white.
  - Header row (`flex items-center gap-3 mb-3`): avatar 56×56 circle, border 2px neon, padding 2px, bg white; fallback `person` 20px. Name `h3` 14px headline bold truncate; school `p` 12px #777 truncate (`metaLabel`, `data-no-i18n`).
  - Optional bio `p` 11px on-surface-variant, 2-line clamp, `mb-3`.
  - Optional interests/tags: up to 5 outline chips `px-2.5 py-0.5` radius 10px, border on-surface/20, bg white/60, 9px bold letter-spacing widest, gap 6px, `mb-3`.
  - Status row (`flex items-center justify-between mb-3 min-h-[18px]`):
    - `status === 'FRIEND_CONFIRMED'` → neon 10px bold letter-spacing widest with `group` icon 14px: "Friends" (zh 好友)
    - else if `remainingMs != null` → `.friend-remaining` neon-pink 10px bold: `timer` icon 13px + mono `formatCountdown(remainingMs)`, ticking from `data-deadline` (= now + remainingMs) every second; at 0 shows "00:00:00" and triggers a status reload
    - else → "Pending" (zh 审核中 — the dictionary maps Pending→审核中 globally; this is the string that appears) in #777
  - `button` full width `py-3` radius 10px bg neon black 11px headline bold letter-spacing .15em: "Enter Chat" / zh "进入聊天" → `openConnectionChat(matchId)`
  - `button` full width `py-2 mt-1` 9px neon-pink underline (offset 4px) letter-spacing widest: "Cancel connection" / zh "取消连接" → `dissolveMatch(matchId)`
  - If not confirmed: footnote `p.text-center.mt-1` 9px #c6c6c6: 'Both must tap "Confirm Friend" in chat within 48 hours' (zh 48 小时内双方都点「确认为好友」即可)
- Side effects: `startFriendRemainingTick(matches)` (single interval refreshing all `.friend-remaining` nodes; if none has `remainingMs` no interval is started), `reportMatchEvent(c.matchId,'viewed')` per card (max 5).

### 1.7 Friend — no_match (no candidates)

Same shape as §1.5 with `flatEmptyIcon('group_off')`, title "No Friends This Round" / zh "本轮暂无朋友候选", body `data.message` or "No suitable friend candidates this round. Adjust your preferences or try matching again." (no zh dictionary entry — shows English in zh mode unless the API message is Chinese), "Match Again" → `startMatch()`, "Modify Preferences" → `openFilterSheet('friend')`.

### 1.8 Partner missing ("Profile Unavailable")

Used when romantic `matched/confirming/relationship` arrives without `partner.nickname`. Centered card: `flatEmptyIcon('person_off')` muted; `h2` "Profile Unavailable" / zh "资料暂不可用"; `p` message "This profile is unavailable — it may be updating or the account has changed." (no zh entry); `button.btn-cta` "Refresh" → `loadMatchTab()`.

### 1.9 Questionnaire wall (prompt card)

Shown by `promptFillQuestionnaire(mode)` when the mode's questionnaire is incomplete **and** the user is idle in that mode (see §2.1). Centered layout: `flatEmptyIcon('group' | 'auto_awesome', 'neon')` (64×64 radius 18 box bg #CCFF00, icon 28px black); `h2` "Friend Questionnaire" / "Romantic Questionnaire" (zh 朋友问卷 / 恋人问卷); `p` "A few quick questions unlock friend|romantic matching." (zh 花几分钟答题，解锁朋友|恋人匹配。) `mb-10 max-w-[15rem]`; `button.btn-cta` "Fill Out Questionnaire" / zh "填写问卷" → `goFillQuestionnaire(mode)` (sets `S.questionnaireMode`, `showPage('page-questionnaire')`, `loadQuestionnaire(mode)`).

### 1.10 Questionnaire refill banner

`injectQuestionnaireBanner(mode)` prepends (once per pane) `div.q-refill-banner`: `w-full max-w-xs mx-auto mb-4 px-4 py-3` radius 10px bg neon/15 (rgba(204,255,0,.15)), `flex items-center justify-between gap-3`: text 12px on-surface "Questionnaire updated — refill for better matches" (zh 问卷已更新，重新填写让匹配更准) + pill button `px-3 py-1.5 rounded-full` bg neon black headline 10px bold letter-spacing widest "Refill" (zh 去填写) → `goFillQuestionnaire(mode)`. Shown for users whose questionnaire is incomplete but who are not idle (in pool / matched / relationship); prepended after `loadMatchTab()` renders the real state.

### 1.11 Plus-menu popover (`#chat-plus-menu`)

Toggled by the top-left `add` button on every view (`toggleChatPlusMenu`; a second tap or backdrop tap removes it). Appended to `body`:
- `.cpm-backdrop`: fixed inset 0, z 68, rgba(0,0,0,.12); tap closes.
- `.cpm-card`: fixed, `top: calc(3.5rem + safe-top)` (flush under the top bar), `left:12px`, z 69, min-width 208px, bg #fff, radius 14px, border 1px rgba(0,0,0,.06), shadow `0 10px 32px rgba(0,0,0,.16)`, padding 6px; enters with opacity 0 → 1 and translateY(−6px) scale(.98) → identity over .18s (transform-origin top-left). Dark bg #1c1b19 border rgba(255,255,255,.07).
- Items `.cpm-item` (full-width row, `padding 11px 12px`, gap 12px, radius 10px, Plus Jakarta 13px 700 letter-spacing .02em, #1b1b1b / dark #eceae6, hover #f3f3f3 / dark #292724, active scale .98), icon 20px then label; tap closes the menu **then** runs the action:
  1. `search` "Search & discover" (zh 搜索与发现) → `openFriendHubAt('search')` (addfriend.js)
  2. `qr_code_2` "Add by QR" (zh 扫码添加) → `openFriendHubAt('qr')`
  3. `hub` "Relationship Network" (zh 关系网) → `openFriendHubAt('graph')`
  4. `dark_mode` "Dark mode" (zh 深色模式) → `toggleDarkMode()` (toasts "Dark mode on"/"Light mode on")
  5. `translate` "Language" (zh 语言) → `openLangDialog()` (i18n.js; confirming reloads the page)

### 1.12 Preference sheet `#filter-overlay` (bottom sheet)

Opened by `openFilterSheet(mode)` (summary-box "Edit", "Modify Preferences" links). Overlay: `fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]`, flex column, `items-center justify-end`; tapping the dimmed backdrop calls `closeFilterSheet()`. Inner sheet `.bottom-sheet-transition`: `w-full max-w-md bg-white rounded-t-xl (10px) overflow-hidden shadow-2xl flex flex-col`, slides up from `translateY(100%)` over .32s cubic-bezier(.22,1,.36,1). Dark: bg #1c1b19, text #eceae6, borders #343230.

- **Header** (`flex flex-col items-center pt-3 pb-4 border-b border-stone-100 bg-white`): grab handle 40×4 bg stone-200 (#e7e5e4) `mb-4`; row `relative flex justify-between items-center px-6`: left `close` icon button (#a8a29e, hover black, active scale .95) → `closeFilterSheet()`; centred absolute `h1#filter-sheet-title` headline bold tracking-tighter black — text set at open time: "Edit" / zh "编辑" (`data-no-i18n`); right `#filter-save-btn` pill `px-5 py-2` bg neon black headline 12px bold letter-spacing widest "Save" (zh 保存) → `saveFilterPrefs()`; while saving shows "Saving…"/"保存中…" and is disabled. The header is the drag handle for drag-to-close (see §2.10).
- **Body** `flex-1 overflow-y-auto max-h-[70vh] px-6 py-4 flex flex-col gap-5`, sections `space-y-7`; section headings are headline 12px extrabold letter-spacing .2em black.
  1. `#filter-romantic-section` (visible only when `S.prefMode==='romantic'`):
     - "Target Gender" (zh 目标性别): pill segmented control (`flex border border-outline-variant/60 p-1 rounded-full`), three `.gender-seg` buttons `flex-1 py-3 rounded-full` headline 12px bold letter-spacing wider: Male / Female / All (zh 男 / 女 / 不限); selected = bg #CCFF00 color #000, others transparent #1b1b1b. Tap → `selectGenderSegment(v)` sets `S.filterGender` ('male'|'female'|'all').
     - "University Stage" (zh 学业阶段): wrap of `.stage-chip` buttons `px-5 py-2.5` radius 10px border 1px outline-variant headline 12px bold letter-spacing wider: Undergraduate / Master / PhD (zh 本科 / 硕士 / 博士), values undergraduate/master/doctor; **multi-select** toggles (`toggleStage`) — selected = bg & border #CCFF00, text #000; unselected transparent, border #c6c6c6, text #1b1b1b. Empty selection = Any.
  2. `#filter-friend-section` (visible only when `S.prefMode==='friend'`):
     - "Target Gender": same segmented control with `.friend-gender-seg` (Male / Female / All) → `selectFriendGenderSegment(v)` → `S.friendGender`.
     - "Interest Priority" (zh 兴趣优先级): `#friend-priority-interests` chips rendered from the **current user's profile** interests (fallback tags; trimmed, de-duplicated) as `.friend-interest-chip` buttons (same look as stage chips); tap → `toggleFriendPriorityInterest(v)`; max 3 selected — a 4th tap toasts "Pick up to 3 priority interests" and is ignored. If the profile has no interests: grey 12px text "Add interests to your profile first, then pick up to 3 priorities here." Previously saved selections that no longer exist in the profile are dropped on open.
  3. `#filter-shared-section` (always visible; controls shared by both modes):
     - "Age Range" (zh 年龄范围) with live value `#age-range-display` (headline 18px bold tracking-tighter, e.g. "18 — 24" or "Any"). Two range sliders `.ink-range` (2px track #e2e2e2, 14px round neon thumb; disabled → opacity .3, grey thumb): "Min" (`#filter-age-min`, 18–30, default 18, label 9px letter-spacing widest stone-400) and "Max" (`#filter-age-max`, 18–30, default 24) with "18 / 30" end labels; dragging Min above Max pushes Max up, dragging Max below Min pulls Min down (`onAgeMinInput/onAgeMaxInput`). Checkbox `#filter-age-any` (`.neon-check`: 16px, radius 6, checked = neon bg with black check) + label "Any age" (zh 不限年龄) → `toggleAgeAny()` disables both sliders and shows "Any".
     - "School Filter" (zh 学校筛选): two rows `py-3.5 border-b border-stone-100` with headline 14px bold tracking-tight labels "Only Same School" (zh 仅限同校, `#filter-same-school`) and "Same City" (zh 同城优先, `#filter-same-city`), each an `.ink-switch` (48×24 pill, bg #e2e2e2, 16px white knob at 4px; checked → bg #CCFF00 and knob translateX 24px).
  4. `#filter-settings-section` (always visible; the former "match settings" drawer merged here):
     - "Enhanced Mode" (zh 增强模式) + helper 11px stone-400 "Applies the next time you join the pool" (zh 将在下次进入匹配池时生效).
     - `#romantic-enhance-item` (only in romantic mode; `border-b pb-4`): label "Romantic Enhance" (zh 恋人增强) with sub-line 12px stone-500 "3 cells · refunded if no match" (zh 3 格能量 · 未匹配到全额退回) and `#romantic-enhance-toggle` `.ink-switch` → `toggleEnhance('romantic')`.
     - `#friend-enhance-item` (only in friend mode): "Friend Enhance" (zh 朋友增强), sub "1 cell per guaranteed match · refunded if short" (zh 每保底 1 人 1 格 · 不足退回), `#friend-enhance-toggle` → `toggleEnhance('friend')`. Below it `#friend-cells-wrap` (hidden unless friend enhance is on, `mt-5`): row of labels 10px letter-spacing widest #777 "GUARANTEE: **N** friends" / "Cost: **N** cells" (N bold black), slider `#friend-cells-slider` `.ink-range` 1–5 → `updateFriendCells(v)`, end labels "1 / 5".
     - "Extra Info" (zh 补充信息): `textarea#match-extra-info` `maxlength=500 rows=4`, bg white, 1px black border, radius 10px, `px-4 py-3`, 14px medium black, placeholder "Anything else to help matching..." (zh 还有什么想让匹配知道的…), no resize.
     - Row button (`py-4 px-4 border border-black` radius 10px, hover bg neon, active scale .98): `tune` icon + "Retake Questionnaire" (zh 重新填写问卷) … `chevron_right` → `retakeQuestionnaire()` (hides the sheet, shows the questionnaire page for the active match mode, resumes saved answers).
- **Read-only state** (`applyPanelReadonly('filter-overlay', true)` when the mode is `searching`): every input/select/textarea/button inside the sheet is disabled + `opacity-50` + `pointer-events-none`, except elements whose onclick contains `close`/`hide`/`Overlay('` (the X button) or that carry `data-always-enabled="1"`. A notice is inserted right after the header: `mx-6 mt-4 mb-1 px-4 py-2.5` radius 12px bg #f3f3f3, `lock` icon 17px #777 + 11px on-surface-variant text "Matching in progress — view only. Leave the pool to make changes." / zh "匹配中：设置仅可查看。离开匹配池后可修改。". Applied immediately and again 350 ms later (after async back-fill re-renders chips); removed when reopened while not searching.

### 1.13 Enhanced-confirm card (in `startMatch`)

`confirmCard` modal: full-screen backdrop `bg-black/40 backdrop-blur-[2px]` z 120, `px-6`; card `max-w-sm` white (surface-container-lowest) radius 10px `shadow-2xl p-6`; title headline 18px extrabold tracking-tight; body 14px on-surface-variant leading-relaxed `mb-6`; two equal buttons `py-3` radius 10px 12px bold letter-spacing widest — cancel (1px outline-variant border, on-surface text) and confirm (bg neon black; `danger` → bg neon-pink white).
- en: title "Use Enhanced this round?"; body "`cost` energy cells will be spent now (you have `avail`). " + romantic "Fully refunded if no match this round." / friend "Shortfall refunded if the guarantee is not met."; confirm "Spend `cost` & join"; cancel "Join without it".
- zh: title "本轮使用增强匹配？"; body "将立即消耗 `cost` 格能量（当前 `avail` 格）。" + romantic "本轮未匹配到会全额退回。" / friend "保底不足会按缺口退回。"; confirm "消耗 `cost` 格并进入"; cancel "先不用增强".
- Resolution: confirm → true; cancel → false; backdrop tap → **null** (abort: do not join, do not touch the toggle).

### 1.14 Dissolve-confirm card (`dissolveMatch`)

`confirmCard({danger:true})`: friend — title "End this friendship?", body "You will no longer be matched as friends."; romantic — title "End this relationship?", body "This will end your relationship. Neither of you can message anymore."; confirm "End" (neon-pink), cancel "Cancel". No zh entries for these strings (they render in English; "Cancel" → 取消 via dictionary). Backdrop tap (null) is treated as cancel here (`if (!ok) return`).

### 1.15 Partner profile overlay `#partner-profile-overlay`

Opened by `viewPartnerProfile(userId, matchId)` (called from chat/couple avatars; not from the match cards themselves). Full-screen overlay z 70 bg surface, inner `max-w-[430px] mx-auto h-full flex flex-col`, `#partner-profile-content` `flex-1 overflow-y-auto`. Opens **before** the fetch (previous content may flash); on fetch error only a toast "Failed to load profile" appears and the overlay stays open (known defect — the only exit is the back button rendered by the previous content, or edge-swipe if an `arrow_back` icon exists). Rendered by `renderPartnerProfile(p)`:
- Hero `relative h-60` (240px) bg surface-container-low; cover image (`coverUrl`, else blurred avatar) `object-cover`; gradient overlay `rgba(0,0,0,.28) → transparent 38% → #f9f9f9 at bottom`; back button `.pp-back` absolute `top: calc(1rem + safe-top) left-4` 36×36 circle bg black/35 blur white `arrow_back` 20px → `hideOverlay('partner-profile-overlay')`.
- `px-6 -mt-12`: avatar 96×96 circle with 3px black ring (`p-[3px] bg-primary shadow-lg`) + 2px white ring inside; fallback `person` 30px.
- Name row (`mt-3 flex items-center gap-2 flex-wrap`): `h1` nickname 24px headline extrabold tracking-tight; `verified` icon 20px black if verified else pill "UNVERIFIED" (9px bold letter-spacing widest #777 bg #eeeeee radius 10px); note pill (10px bold letter-spacing widest on-surface-variant bg #eeeeee) when a note exists (looked up in `S.sessions[*].partner.note` for this userId); 28×28 circular outline button with `add` (no note) / `edit` (has note) icon 16px → `promptSetNote()`.
- `p.realName` 12px on-surface-variant (only present for confirmed connections); `p` school with `school` icon 16px, 14px medium on-surface-variant (`metaLabel`, `data-no-i18n`); info line 12px #777 letter-spacing wider: grade · age · city (each through `metaLabel`, empty skipped, separator "&nbsp;&nbsp;·&nbsp;&nbsp;"); if `daysKnown != null`: `calendar_month` 14px + "Known for N day(s)".
- Fact grid `px-6 mt-8 grid-cols-2 gap-3` for present values among Major / MBTI / Zodiac / Nationality: card radius 10px border outline-variant/20 bg white `p-3`, label 9px bold letter-spacing .2em #777 uppercase, value 14px bold tracking-tight truncate.
- Interests chips `px-6 mt-5 flex-wrap gap-2`: `px-3.5 py-1.5` radius 10px bg neon black 10px bold letter-spacing widest (tags are not rendered separately — `chipSection` is only invoked for interests).
- About (`px-6 mt-8`): heading "About" 12px headline bold letter-spacing .2em; bio 14px leading-relaxed on-surface-variant.
- Photo Portfolio (`px-6 mt-10`, only when `realPhotos` non-empty): heading "Photo Portfolio" (zh 照片集) + "N Photo(s)" 10px bold #777; 12-column grid `gap-2`, height 260px (or 220px if ≤1 photo): first photo spans 8 columns (12 if alone), next two stacked in 4 columns, remaining in a 3-column square grid below; each image tap opens the URL in a new tab (`window.open(this.src)`).
- Trailing spacer 24px.

Note prompt (`promptSetNote`): `promptCard` with title "Set a note", label "Note", placeholder "Leave blank to clear", prefilled with the current note; Enter or "Save" submits; cancel/backdrop → null (no-op). Toasts "Note saved" / "Note cleared" / "Failed: …"; on success `loadSessions()` refreshes the list so the chip updates.

### 1.16 Toasts

`#toast`: fixed, `top: calc(16px + safe-top)`, centred, z 999, `padding 12px 24px`, bg #000, white 14px, radius 10px, shadow `0 2px 8px rgba(0,0,0,.2)`, slide-down .3s, auto-hides after 3 s (single element; a new toast replaces the text).

---

## 2. Interactions

### 2.1 Switching views (`switchHomeView(view)`)

1. Normalise view (unknown → 'chat'); set `S.homeView`; stop match polling, countdown tick, (no-op) campus anim.
2. Update segment highlight; re-point the left button to the plus menu.
3. Animate the track to the target offset (no animation on the first entry after `switchTab('match')` or after account switch).
4. Pre-heat the other match pane(s) with a cached plan page (only if that pane is still empty).
5. `chat` → `loadSessions()` and return.
6. `romantic`/`friend` → `S.activeMatchMode = view`; `ensureQuestionnaireThenMatch(view)`:
   - `GET /questionnaire/completion?type=<mode>` → `completed = !!(res.data ?? res)[mode].completed` (tolerates 4 envelope shapes; request failure ⇒ treated as completed so the user is never locked out).
   - If the user navigated away while awaiting (`S.homeView !== mode`) → abort silently.
   - Not completed: look up `S.matchStatus[mode].state`; if unknown, fetch `GET /matching/status?mode=` once (again abort if the view changed). If state is missing or `idle` → render the questionnaire wall (§1.9) and stop. Otherwise set `S.pendingQuestionnaireBanner = mode` so the refill banner is prepended after the real state renders.
   - `await loadMatchTab()`; then inject the banner if pending.

### 2.2 Horizontal swipe between the three views (`bindHomeViewSwipe`, bound once on `#tab-match`)

- `touchstart` (passive): ignored (state preserved) if a gesture is active and a second finger lands; **not started** if any `.overlay.active` exists (chat conversation, sheet, etc.) or the plus menu is open. Records start point.
- `touchmove` (non-passive): once |dx| or |dy| exceeds 12px the gesture locks to horizontal (`|dx| > |dy|`) or vertical; horizontal sets `root.dataset.horizLock='1'` (pull-to-refresh yields) and `touch-action:none`, and every move calls `preventDefault` and translates the track by `dx` from the current offset. At the ends (no next page in that direction) the drag is damped ×0.3 (rubber band).
- `touchend`/`touchcancel` (bound on `document`, because the touched card can be replaced by innerHTML mid-gesture): unconditionally clears lock/touch-action; if the Match tab is no longer active, snap without animation; vertical gesture → animate back; horizontal with |dx| ≥ 70px and a neighbour exists → `switchHomeView(neighbour)` (index ±1, clamped to 0…2 — never skips a page); else animate back.
- Window resize re-snaps to the current view without animation.

### 2.3 Segment taps

`switchHomeView(view)` with animated snap (same curve as swipe settle).

### 2.4 Pull-to-refresh (chat pane only)

`attachPullToRefresh(#tab-match, () => loadSessions(), '#home-chat-view', { enabled: () => S.homeView === 'chat' })`. Only starts when the current view is Chat, the container scrollTop ≤ 0 and no ancestor of the touch target is an inner scroller that is scrolled (`innerScrolled`). Indicator: 40px white circle with `refresh` icon (22px #1b1b1b) starting hidden behind the top bar (`top: env(safe-area-inset-top)`, z 39), follows the finger with exponential rubber band `dist = 180 × (1 − e^(−dy/180))`, rotates the icon 360° per 70px, turns neon at ≥70px (`ptr-ready`); release ≥70px → spins, runs refresh, holds ≥600 ms, then retracts; content (`#home-chat-view`) translates with the pull. During a horizontal lock the indicator hides and content transform is left to the swipe. **Match panes have no pull-to-refresh** (deliberate).

### 2.5 Join pool (`startMatch`)

1. `mode = S.activeMatchMode`; ensure enhanced shape (rehydrate from localStorage for the current user).
2. `GET /questionnaire/completion?type=<mode>`; if not completed → show questionnaire wall and stop (failure ⇒ continue and let the server decide).
3. `enhanced = S.enhanced[mode].enabled`; friend `cells` = clamp 1…5.
4. If enhanced: `cost` = 3 (romantic) or `cells` (friend). Refresh balance (`loadEnergyBar` → `GET /energy/balance`); if `S.energy.availableEnergy < cost` → toast "Not enough energy — top up" (zh 能量不足，请先充值), open the energy purchase page (`openEnergyModal`, `#modal-energy-purchase`), stop. Otherwise show the enhanced-confirm card (§1.13): null → abort entirely; false → turn the toggle off (persist + sync sheet/summary) and continue as a normal join; true → continue enhanced.
5. Optimistic render: `lastEnhancedRound[mode] = useEnhanced`; `S.matchStatus[mode] = { mode, state:'searching' }`; `renderMatchTab` → searching plan page immediately.
6. `POST /matching/start` body `{ mode, enhanced }` (+ `cells` for friend). Response `message` matching `/already matching/i` ⇒ the server did **not** deduct: reset `lastEnhancedRound`, toast "Already in this round's pool — leave the pool first to join with Enhanced" (if enhanced was requested) or "Already in the matching pool"; do not reset the toggle. Otherwise toast "Entered pool · Enhanced (N cells)" or "Entered matching pool", refresh balance, and if enhanced was used reset the toggle to off (per-round payment semantics), persist, sync the sheet UI.
7. Error → reset `lastEnhancedRound`, toast "Failed: <message>" (e.g. server 400 "Not enough energy, please top up", "You already have an active or confirmed partner, partner matching has stopped", "Please complete the questionnaire first" style messages).
8. Always finish with `loadMatchTab()` (re-fetch status, re-render, restart polling).

### 2.6 Leave pool (`stopMatch`)

`POST /matching/stop?mode=<mode>` (no body). Success → toast "Left matching pool" and `loadMatchTab()`. Failure → toast "Failed: <message>" (server 400 "You are not currently matching, cannot stop"). No confirmation dialog. Note: in friend mode the server keeps existing friends (status may become matched/relationship rather than idle).

### 2.7 Dissolve (`dissolveMatch(matchId)`)

Confirm card (§1.14) → `POST /matching/:matchId/dissolve` with `{}` (body `reason` optional, unused) — or legacy `POST /matching/dissolve` with `{}` when no matchId. Toast "Friendship ended" / "Relationship ended" then `loadMatchTab()`; failure toast "Failed: …". Only the friend candidate card exposes this in the match module; the romantic dissolve entry lives in chat/couple UI.

### 2.8 Enter chat (`openConnectionChat(matchId)`)

`switchHomeView('chat')` (animated track move + `loadSessions()`), then `await loadSessions()` again and `openSessionById(matchId)` (chat.js opens the conversation overlay if the session is in `S.sessions`). With a falsy matchId it just switches to Chat.

### 2.9 Locked-settings toast

`matchSettingsLockedToast()`: "Leave the matching pool before changing settings" / zh "匹配中无法修改设置，请先离开匹配池". Fired by the lock line in the summary box and by `saveFilterPrefs` when the mode became `searching` while the sheet was open (the sheet is then closed).

### 2.10 Preference sheet lifecycle

- **Open** (`openFilterSheet(mode)`): `openOverlay('filter-overlay')`; set title text per language; `S.prefMode = mode || activeMatchMode`; `switchPrefMode(m)` → show/hide `#filter-romantic-section` / `#filter-friend-section`, then `loadPrefsForMode(m)`:
  - bump the sequence token `loadPrefsForMode._seq`; clear `prefsLoadFailed`;
  - synchronously: show/hide `#romantic-enhance-item` / `#friend-enhance-item`; `updateEnhanceUI(m)` (checkbox state, friend cells wrap visibility, slider value, N labels); clear the textarea, reset its `dirty`/`loadFailed` flags, attach `oninput → dirty=1`; `loadEnergyBar()`;
  - `GET /matching/preferences?mode=m`; ignore the response if a newer call superseded it; on failure set `prefsLoadFailed=true`, mark the textarea `loadFailed`, toast "Preferences failed to load" and stop (form keeps whatever it showed — it may be the *other* mode's values, hence Save is refused later);
  - on success cache into `S.matchPrefs[m]`; fill the textarea with `extraMatchInfo` unless the user already typed; back-fill romantic (`S.filterGender = preferredGender || 'all'`, `S.filterStages` = whitelisted split of `universityStage`, age-any checkbox = both null, sliders = ageMin ?? 18 / ageMax ?? 24, same-school/city switches; then `toggleAgeAny`, `updateGenderUI`, `updateStageUI`) or friend (`S.friendGender` whitelisted to male/female/all, `S.friendPrefInterests` = first 3 of `preferredInterests`, same shared controls, then `toggleAgeAny`, `updateFriendGenderUI`, `renderFriendPriorityInterests`, `updateFriendPrefUI`).
  - `applyPanelReadonly` now and after 350 ms with `isMatchPoolActive(m)` (= `S.matchStatus[m].state === 'searching'`; matched/confirming/relationship are **editable** because changes apply to the next round).
- **Close** paths, all of which must end in `closeFilterSheet()` (removes `.active`, then re-fills the active mode's summary box so the enhanced toggle/sub-line reflect the client-side state): X button, backdrop tap, drag-to-close on the header (`bindSheetDragClose('filter-overlay', closeFilterSheet)`: header follows the finger downward, release > 110px closes, else springs back), successful Save, and the "locked" bail-out in Save. `retakeQuestionnaire` uses plain `hideOverlay` (no summary sync — acceptable since it leaves the page).
- **Save** (`saveFilterPrefs(mode?)`): mode = arg or `S.prefMode`. Guards: pool active → locked toast + close; `prefsLoadFailed` → toast "Preferences failed to load — close and retry" / zh "偏好还没加载成功，请关闭后重试" and stop. Compose payload from the shared controls: `ageAny` ⇒ `ageMin=ageMax=null`, else `ageMin=min(rawMin,rawMax)`, `ageMax=max(rawMin,rawMax)` (raw defaults 18/24 when unparsable); `requireSameCity`, `requireSameUniversity` from switches.
  - friend: `{ mode:'friend', preferredInterests: S.friendPrefInterests.slice(0,3), preferredGender: friendGender==='all'||empty ? null : value, ageMin, ageMax, requireSameUniversity, requireSameCity }`
  - romantic: `{ mode:'romantic', requireSameCity, requireSameUniversity, preferredGender: filterGender==='all' ? null : value, ageMin, ageMax, universityStage: stages.join(',') || null }`
  - `extraMatchInfo` = textarea value ('' allowed) **unless** the preferences failed to load and the textarea is untouched (then omitted so a blank never overwrites server text).
  - `persistEnhanced()` (localStorage), `btnBusy('filter-save-btn', true)`, `PUT /matching/preferences`. Success: merge payload into `S.matchPrefs[m]`, toast "Preferences saved", `closeFilterSheet()`, and if the active mode is `m` and its pane shows a summary box, `fillPlanBox` in place. Failure: toast "Failed: <message>". Finally restore the button.
  - The enhanced toggle and friend cells are **never** sent here (server strips `enhancedModeEnabled`/`friendEnhancedCells` anyway); they are client state submitted only via `/matching/start`.
- **Enhanced toggle** (`toggleEnhance(mode)`): the checkbox is immediately forced back to the current state and disabled for the duration. Turning **on**: refresh balance; cost = 3 (romantic) or current friend cells; if `availableEnergy < cost` → checkbox stays off, toast "Not enough energy — top up", open energy purchase, return. Otherwise flip `S.enhanced[mode].enabled`, `updateEnhanceUI` (friend: show/hide cells wrap), `persistEnhanced`, and immediately re-fill that mode's summary box if it is on screen. Re-enable the checkbox in `finally`.
- **Friend cells slider** (`updateFriendCells(v)`): clamp 1…5, store `S.enhanced.friend.cells`, update "GUARANTEE: N friends" and "Cost: N cells", persist, and live-update the friend summary box sub-line ("Guarantee N · N cells").
- **Age sliders**: min/max linkage as described; the "Any age" checkbox disables both sliders and shows "Any".
- **Chips/segments**: instant visual toggle (inline style swap), state in `S.*` until Save.

### 2.11 Polling & tickers

- **Status polling** (`startMatchPolling`): every **30 s** `GET /matching/status?mode=<mode bound at start>`; tick is a no-op if `S.activeMatchMode` or `S.homeView` changed; on success stores into `S.matchStatus[mode]`, resets fail counter and calls `renderMatchTab` (which, for idle/searching, is a value-only refresh thanks to the same-state guard). Romantic `relationship` stops polling (terminal); friend polls forever (new candidates can be appended). After **5 consecutive failures** polling stops and toasts "Match updates paused — check your connection and retry". Started by `loadMatchTab` (romantic: any state but relationship; friend: always); stopped by `switchHomeView`, `switchTab`, 401 handling, logout/cleanup.
- **Reveal countdown tick** (`startCountdownTick`): 1 s interval stored in `S.countdownInterval` (one shared slot — the remaining-time tickers below reuse it, so only one of these tickers runs at a time); updates every `.mp-cd` on the page (both panes) via `getMatchCycleMs(mode)`, and re-renders the week row at day change.
- **48 h remaining tickers** (`startRemainingTick` romantic, `startFriendRemainingTick` friend): 1 s, same `S.countdownInterval` slot; hitting 0 stops the ticker and calls `loadMatchTab()`.
- **Load failure** (`loadMatchTab` catch): if a non-idle state is already known, keep the DOM, re-enable legacy proposal buttons, toast "Network error, please try again"; otherwise render the idle plan page (countdown still runs).

### 2.12 Behaviour events

`reportMatchEvent(matchId, type)` with session-level de-dup (`Set` of `matchId:type`; entry removed on failure so it can retry): `viewed` when a romantic matched card or friend candidate cards render; `openedProfile` when `viewPartnerProfile` is invoked with a matchId.

### 2.13 Haptics / keyboard

No haptics are used in this module (the H5 has no vibration calls here). The only keyboard interactions are the textarea (500 chars) and the note prompt (Enter submits).

---

## 3. API calls

All go through `api(path, method, body)`: base `S.API` (`https://api.<domain>/api/v1` in production, `http://<host>:3001/api/v1` locally), `Authorization: Bearer <cl_token>` (localStorage), `Content-Type: application/json`, `cache: no-store`. Responses are usually the raw controller return; the H5 always unwraps `res.data ?? res`. Non-2xx → `Error(data.message || 'API <status>')`. **401** → token removed, all polling/SSE stopped, `cleanupUserState`, overlays closed, auth page shown, error thrown.

| # | Call | Request | Response fields used | Notes |
|---|---|---|---|---|
| 1 | `GET /questionnaire/completion?type=<romantic\|friend>` | query only (server ignores `type` and returns both buckets) | `{ romantic:{completed,versionId}, friend:{completed,versionId} }` → `[mode].completed` | Used on view entry and before joining. Failure ⇒ treated as completed. |
| 2 | `GET /matching/status?mode=<mode>` | — | common: `mode`, `state`, `nextRunAt` (ISO UTC string or null), `matchConfig{cronExpr,description}` or null, `searchingSince`. Romantic: `match{ id,status,myConfirmed,partnerConfirmed,remainingMs (null unless temp),score,matchedAt,relationshipStartedAt,confirmedAt }` or null, `partner` (public profile: `userId,verificationStatus,nickname,school,grade,age,city,interests,bio,avatarUrl,signature,coverUrl,tags,major,mbti,nationality,realPhotos,zodiac` per `public_profile_fields` config) or null. Friend: `matches[{ matchId,status ('MATCHED_FRIEND'\|'FRIEND_CONFIRMING'\|'FRIEND_CONFIRMED'),score,myConfirmed,partnerConfirmed,remainingMs,matchedAt,partner }]`. | `state` values: romantic `idle\|searching\|no_match\|matched\|confirming\|relationship`; friend `idle\|searching\|no_match\|matched\|relationship` (friend `matched` requires non-empty matches; while searching the array still carries confirmed friends). H5 also tolerates a legacy `status` field. Polled every 30 s. |
| 3 | `GET /matching/preferences?mode=<mode>` | — | `preferredGender` (`'male'\|'female'\|null`), `ageMin`, `ageMax` (int or null), `universityStage` (comma string or null), `requireSameUniversity`, `requireSameCity` (bool), `preferredInterests` (string[]), `extraMatchInfo` (string or null); also returned but ignored by the UI: `matchBasis`, `enhancedModeEnabled`, `friendEnhancedCells`, `preferredActivities`, `friendRequirements`, `requireSameMajor`, `preferredNationalities`, `preferredMbti` | Called by the plan page (per-mode sequence token; concurrent for pre-heated pane) and on sheet open (global sequence token). Never-set users get a default object (all null/false/[]). |
| 4 | `PUT /matching/preferences` | body per §2.10 (romantic: mode, requireSameCity, requireSameUniversity, preferredGender, ageMin, ageMax, universityStage; friend: mode, preferredInterests, preferredGender, ageMin, ageMax, requireSameUniversity, requireSameCity; plus `extraMatchInfo` unless skipped). Validation: ageMin/ageMax int 18–60; extraMatchInfo ≤ 500; universityStage whitelisted server-side. | none (H5 merges its own payload into cache) | Server strips enhanced fields; saving also clears a `no_match` marker so the user rejoins next round. |
| 5 | `POST /matching/start` | `{ mode, enhanced:boolean, cells?:1..5 (friend only) }` | `status` ('SEARCHING'), `message` (regex `/already matching/i` detects the no-op path) | Server: requires questionnaire; if `enhanced` checks balance (400 "Not enough energy, please top up") and pre-deducts 3 (romantic) or `cells` (friend) inside the transaction; romantic in matched/confirming/relationship → 400; already searching → `{status:'SEARCHING', message:'Already matching, please wait'}` with no deduction. |
| 6 | `POST /matching/stop?mode=<mode>` | no body | none | 400 "You are not currently matching, cannot stop" if not searching. Friend: recomputes to matched/relationship if friends remain. No refund is issued on stop (refunds happen in the match job for unmatched enhanced users). |
| 7 | `POST /matching/:matchId/dissolve` | `{}` (`reason?` optional) | none | Allowed statuses: MATCHED_ROMANTIC, ROMANTIC_CONFIRMING, RELATIONSHIP_ROMANTIC, MATCHED_FRIEND, FRIEND_CONFIRMING, FRIEND_CONFIRMED; 403 if not a participant; partner gets a `relationship_dissolved` notification. |
| 8 | `POST /matching/dissolve` | `{}` | none | Legacy fallback when no matchId is known. |
| 9 | `POST /matching/feedback/events` | `{ events:[{ matchId, type:'viewed'\|'openedProfile' }] }` (≤50) | none | Server de-dups by (matchId, actor, type). Fire-and-forget. |
| 10 | `GET /energy/balance` (via profile.js `loadEnergyBar`) | — | `availableEnergy` (fallback `totalEnergy − usedEnergy`) → `S.energy` | Before enabling enhanced and before joining enhanced. |
| 11 | `GET /users/:id/public-profile` | — | viewer-aware: confirmed partner/friend or self → full profile incl. `coverUrl`, `realPhotos`, `realName`, `daysKnown`; stranger → safe fields only, or `{nickname, avatarUrl, hidden:true}` if the target hides their profile | Rendered by `renderPartnerProfile`. |
| 12 | `PUT /users/me/notes` | `{ targetUserId, note }` | `{ targetUserId, note }` | Server trims and caps at 30 chars; empty clears. |
| 13 | `GET /chat/sessions?mode=all&limit=100` (chat.js `loadSessions`) | — | `sessions[]` → `S.sessions` | Triggered by Chat view entry, enter-chat, note save. |

Server-side constants worth mirroring: romantic enhanced cost 3 cells; friend cells 1–5 (cost = cells); confirm window 48 h from `Match.createdAt`; default reveal cron `0 17 * * 5` in `Asia/Shanghai` (Friday 17:00 CST) — `nextRunAt` is computed server-side with the timezone and should be preferred.

---

## 4. Client state

In `S` (state.js) — owned or touched by this module:

- `homeView: 'chat'|'romantic'|'friend'` (default 'chat'); `activeMatchMode: 'romantic'|'friend'` (default 'romantic'); `activeTab`.
- `matchStatus: { romantic: <status object|null>, friend: <status object|null> }` — last `GET /matching/status` per mode (also optimistically set to `{mode,state:'searching'}` on join).
- `matchPrefs: { romantic, friend }` — last `GET /matching/preferences` per mode; merged with the PUT payload after save; drives the summary box instantly on re-entry.
- `enhanced: { romantic:{enabled,cost:3}, friend:{enabled,cells:1..5}, _uid }` — client-only intent (the backend deliberately does not persist it); rehydrated per user from `localStorage['cl_enhanced_<userId>']` (JSON `{romantic:{…},friend:{…}}`) and written back on every toggle/slider change/save.
- `energy: { totalEnergy, usedEnergy, availableEnergy }` — balance cache.
- Sheet scratch: `prefMode`, `filterGender ('male'|'female'|'all')`, `filterStages: string[]`, `friendGender`, `friendPrefInterests: string[] (≤3)`, `friendPrefActivities` (legacy, unused by the current sheet).
- Timers: `matchPollingId`, `matchPollFailCount`, `countdownInterval` (shared slot for reveal tick / 48 h tickers), `campusAnimTimer` (unused).
- Misc: `pendingQuestionnaireBanner`, `questionnaireMode`, `viewingProfileId`, `isSubmittingProposal` (legacy), `matchBasis`, `matchExtraInfo` (legacy, unused by the sheet), `sessions` (read for notes).
- Module-private: `lastEnhancedRound = {romantic:false, friend:false}` (this session joined the current round with enhanced → summary shows "Active this round"), `reportedMatchEvents: Set`, `prefsLoadFailed`, sequence counters `loadPlanData._seq {romantic,friend}` and `loadPrefsForMode._seq`, `switchHomeView._entered`.

localStorage keys read here: `cl_token` (auth), `cl_enhanced_<uid>`, `cl_lang` (`'en'|'zh'`, via `getLang`), `cl_theme`.

Cleanup on logout / 401 / account switch (`cleanupUserState` in core.js): stops all polling and the countdown tick; resets `matchStatus` buckets to null, `homeView='chat'`, `activeMatchMode='romantic'`, `energy` to zeros, `enhanced` to defaults (the `_uid` marker is dropped so the next user rehydrates their own localStorage entry), `matchPrefs` to nulls, `filterGender='all'`, `filterStages=[]`, `sessions=[]`, `questionnaireMode='romantic'`; calls `resetMatchPlanState()` (zero `lastEnhancedRound`, bump both plan sequence tokens and the sheet token so in-flight preference responses are discarded, clear `prefsLoadFailed`, clear the "entered" flag so the next home entry snaps without animation). `localStorage.cl_enhanced_*` is **not** deleted (it is per-user keyed).

---

## 5. i18n

Mechanism (i18n.js): language = `localStorage.cl_lang` (`'en'` default). In zh mode a `MutationObserver` walks every added text node and replaces it when the **trimmed whole text** exactly matches a key in the `ZH` dictionary (placeholders via `ZH_PLACEHOLDER`). Any element (or subtree) marked `data-no-i18n` is skipped — used for user content and for strings this module already renders in the right language. Switching language reloads the page. Consequences for this module:

- Static markup (segments, sheet labels, buttons, matched-card captions) is authored in English and translated by dictionary lookup.
- The plan page's dynamic strings (card label, week names, units, summary labels/values, edit/lock control, enhanced sub-line, placeholder), the sheet title, the read-only notice, the locked toast, the enhanced-confirm card and the save-failure toast are chosen **at render time** via `getLang()==='zh'` ternaries and marked `data-no-i18n`.
- Strings with no zh entry render in English even in zh mode (listed below).

User-visible strings (en → zh; "—" = no zh, shows English):

Top bar / views: Chat→聊天, Romantic→恋人, Friend→朋友, Add (title) —, Notifications→通知.
Plus menu: Search & discover→搜索与发现, Add by QR→扫码添加, Relationship Network→关系网, Dark mode→深色模式, Language→语言, Dark mode on / Light mode on —.
Plan page: Start Your Journey→开始你的旅程, Find New Friends→寻找新朋友, Matching in Progress→匹配进行中, the four subtitles (see §1.3), NEXT REVEAL IN→距下轮公布, REVEAL→公布日, M T W T F S S→一 二 三 四 五 六 日, d h m s→天 时 分 秒, MATCH PREFERENCES→匹配偏好, MATCH SETTINGS→匹配设置, Target Gender→目标性别, Age Range→年龄范围, University Stage→学业阶段, Interest Priority→兴趣优先, School Filter→校区筛选, Enhanced Mode→增强模式, Extra Info→补充信息, Edit→编辑, Locked while matching · leave pool to edit→匹配中锁定 · 离开后可修改, Male/Female/Any→男生/女生/不限, Not set→未设置, Undergrad/Master/PhD→本科/硕士/博士, Same school · city→仅同校 · 同城, Same school only→仅同校, Same city→同城, Anything else to help matching…→告诉算法更多关于你的事, Active this round · N cells→本轮已生效 · N 能量, Guarantee N · N cells→保底 N 位 · N 能量, 1 cell per guaranteed friend→每保底 1 位朋友 1 能量, 3 cells · refunded if no match→3 能量 · 未匹配自动退回, Join Matching Pool→加入匹配池, Leave Pool→离开匹配池.
Matched / candidates: This Week's Match→本周匹配, Shared Interests→共同兴趣, Open the chat and both confirm within this time —, Enter Chat→进入聊天, Both of you must tap "Confirm Partner" in chat within 48 hours→48 小时内双方都在聊天中点「确认为恋人」即可, · You have confirmed, waiting for their response — (only the standalone sentence has an entry), Friend Candidates→朋友候选, Friends→好友, Pending→审核中 (global dictionary side-effect), Cancel connection→取消连接, Both must tap "Confirm Friend" in chat within 48 hours→48 小时内双方都点「确认为好友」即可.
Empty states: No Match This Week→本周暂无匹配, No suitable match this week. See you next Friday.→本周暂无合适匹配，下周五见。, No Friends This Round→本轮暂无朋友候选, No suitable friend candidates this round. Adjust your preferences or try matching again. —, Match Again→重新匹配, Modify Preferences→修改偏好, Profile Unavailable→资料暂不可用, This profile is unavailable — it may be updating or the account has changed. —, Refresh —.
Questionnaire: Romantic Questionnaire→恋人问卷, Friend Questionnaire→朋友问卷, A few quick questions unlock romantic|friend matching.→花几分钟答题，解锁恋人|朋友匹配。, Fill Out Questionnaire→填写问卷, Questionnaire updated — refill for better matches→问卷已更新，重新填写让匹配更准, Refill→去填写, Retake Questionnaire→重新填写问卷.
Sheet: Edit→编辑 (runtime), Save→保存, Saving…→保存中…, Male/Female/All→男/女/不限, Undergraduate/Master/PhD→本科/硕士/博士, Interest Priority→兴趣优先级, Add interests to your profile first, then pick up to 3 priorities here. —, Pick up to 3 priority interests —, Age Range→年龄范围, Min/Max —, Any age→不限年龄, Any —, School Filter→学校筛选, Only Same School→仅限同校, Same City→同城优先, Enhanced Mode→增强模式, Applies the next time you join the pool→将在下次进入匹配池时生效, Romantic Enhance→恋人增强, 3 cells · refunded if no match→3 格能量 · 未匹配到全额退回, Friend Enhance→朋友增强, 1 cell per guaranteed match · refunded if short→每保底 1 人 1 格 · 不足退回, GUARANTEE: N friends / Cost: N cells —, Extra Info→补充信息, placeholder Anything else to help matching...→还有什么想让匹配知道的…, Matching in progress — view only. Leave the pool to make changes.→匹配中：设置仅可查看。离开匹配池后可修改。, Preferences failed to load —, Preferences failed to load — close and retry→偏好还没加载成功，请关闭后重试, Preferences saved —.
Enhanced confirm: see §1.13 (fully bilingual).
Toasts: Not enough energy — top up→能量不足，请先充值, Entered matching pool —, Entered pool · Enhanced (N cells) —, Already in the matching pool —, Already in this round's pool — leave the pool first to join with Enhanced —, Left matching pool —, Leave the matching pool before changing settings→匹配中无法修改设置，请先离开匹配池, Network error, please try again —, Match updates paused — check your connection and retry —, Failed: <server message> —, Friendship ended / Relationship ended —, Failed to load profile —, Note saved / Note cleared / No user selected —.
Dissolve card: End this friendship? / End this relationship? / You will no longer be matched as friends. / This will end your relationship. Neither of you can message anymore. / End — (Cancel→取消).
Partner profile: UNVERIFIED —, Add note / Edit note (titles) —, Known for N day(s) —, Major→专业, MBTI —, Zodiac —, Nationality→国籍, About —, Photo Portfolio→照片集, N Photo(s) —, Set a note / Note / Leave blank to clear —, Back —.
Metadata display: school / grade / city / major / nationality values pass through `metaLabel` (META_ZH table in i18n.js) for zh display while the stored value stays English.

---

## 6. Cross-module links

Calls out of match.js:
- core.js: `api`, `toast`, `confirmCard`, `promptCard`, `openOverlay/closeOverlay/hideOverlay`, `showPage`, `btnBusy`, `flatEmptyIcon`, `escapeHtml`, `safeUrl`, `switchTab` (indirect), `closeAllOverlays` (via 401).
- i18n.js: `getLang`, `metaLabel`, `toggleDarkMode`, `openLangDialog`.
- chat.js: `loadSessions`, `openSessionById`, `toggleChatPlusMenu` targets, `S.sessions` (notes).
- addfriend.js: `openFriendHubAt('search'|'qr'|'graph')`.
- profile.js: `loadEnergyBar`, `openEnergyModal`, `updateGenderUI`, `updateAgeDisplay`, `selectGenderSegment`, `onAgeMinInput/onAgeMaxInput` (sheet controls), `renderPublicProfileCard` (not used here).
- couple.js: `renderCoupleSpace(container, matchId, partner)` for romantic `relationship`.
- questionnaire.js: `loadQuestionnaire(mode)`, `retakeQuestionnaire()`.
- notifications.js: `openNotifications()` (top bar button).

Calls into match.js (window.*):
- core.js `switchTab('match')` → `switchHomeView`; `cleanupUserState` → `resetMatchPlanState`, `stopMatchPolling`, `stopCountdownTick`; 401 handler → `stopMatchPolling`, `stopCountdownTick`.
- main.js boot: `bindHomeViewSwipe()`, `attachPullToRefresh(#tab-match …)`, `bindSheetDragClose('filter-overlay', closeFilterSheet)`, `bindNavAutoHide(#home-chat-view)`.
- chat.js: `loadMatchTab()` after confirm/dissolve/expiry in a conversation; `viewPartnerProfile(userId, matchId)` from chat header avatar; `formatCountdown`, `formatRemainingShort` for temp-session badges.
- couple.js: `viewPartnerProfile`, `dissolveMatch`, `loadMatchTab`, `renderPartnerMissing`.
- questionnaire.js: after submit sets `S.homeView = questionnaireMode` then `showPage('page-home'); switchTab('match')` → lands directly on that match view.
- profile.js: `saveProfile` → `S.homeView='chat'; switchTab('match')`; settings.js reads `S.matchStatus[mode]`; `ensureEnhancedShape` exported for other modules.
- index.html inline handlers: `switchHomeView`, `toggleChatPlusMenu`, `closeFilterSheet`, `saveFilterPrefs`, `selectGenderSegment`, `toggleStage`, `selectFriendGenderSegment`, `toggleFriendPriorityInterest`, `toggleAgeAny`, `toggleEnhance`, `updateFriendCells`, `retakeQuestionnaire`, `openNotifications`.

---

## 7. Gotchas

1. **Reveal countdown source order**: `getNextRevealDate(mode)` = `S.matchStatus[mode].nextRunAt` (server, timezone-correct) → else parse `matchConfig.cronExpr` **locally in device time** (`getNextCronRun`; only supports `m h * * dow`/`*`, ignores the server timezone) → else next Friday 17:00 local (if it is Friday ≥ 17:00, next week). The week-row badge uses the same source, so both stay consistent; before status arrives the fallback is shown and corrected on the next render. iOS should use `nextRunAt` and treat the cron/Friday fallback as offline placeholders.
2. **Week row is date-based, not weekday-based**: after Friday 17:00 the reveal is next Friday, so the badge disappears for the rest of the week (index 7+ is outside 0…6). Do not mark "Friday" unconditionally.
3. **Two independent panes**: romantic and friend each own a plan page DOM (`id`s were replaced by `data-mp`/`data-mode` selectors because they coexist). Countdown tick, value fill and preference sequence tokens are all per mode; the non-active pane is pre-rendered from cache ("pre-heat") so swiping reveals content. Any equivalent iOS implementation must keep two independent view-models alive.
4. **Same-state re-render guard**: 30 s polling calls the full renderer; idle/searching only re-fill values when `data-plan` matches, preserving the summary box scroll and avoiding a preference refetch. Transitions between states (or between modes) rebuild.
5. **Enhanced mode is client intent, paid per round**: the backend refuses `enhancedModeEnabled` on the preferences endpoint; the only path is `POST /matching/start { enhanced, cells }` which pre-deducts inside the transaction. The toggle is persisted per user in `localStorage.cl_enhanced_<uid>`; it is reset to off **only after** a join that actually deducted (not on the "Already matching" no-op, not on error). Balance is re-fetched immediately before enabling the toggle and before joining because `S.energy` may be a cold 0 or stale. The confirm card distinguishes backdrop-dismiss (null → abort) from "Join without it" (false → join normally and switch the toggle off).
6. **"Already matching" detection is by regex on the message** (`/already matching/i`) because the endpoint returns 200 with `{status:'SEARCHING'}` in both cases. Preserve the server message text or expose a structured flag.
7. **Leaving the pool does not refund** (server `stopMatchForUser` never calls refund); refunds are issued by the weekly job for enhanced users who ended up unmatched. The H5 copy ("refunded if no match") reflects that — do not promise a refund on Leave.
8. **Locked while searching**: the summary box swaps Edit for a lock line, the sheet is view-only, and Save is refused if the state flipped to searching while the sheet was open. Matched/confirming/relationship remain editable (changes apply next round).
9. **Preference sheet shares controls across modes**: age sliders, any-age, same-school/city switches and the extra-info textarea are single instances back-filled per mode. If the GET fails the form may still show the other mode's values, so the whole Save is refused (`prefsLoadFailed`) and `extraMatchInfo` is omitted when untouched — otherwise a stale/blank value would be written into the wrong mode.
10. **Sequence tokens everywhere**: view switch (abort if `S.homeView` changed after each await), plan-page preference fetch (per-mode counter), sheet preference fetch (global counter), polling tick (mode bound at start). Account switch bumps all tokens so slow responses from the previous account are discarded — a real cross-account leak was fixed this way (preferences incl. extra info of user A appearing for user B).
11. **All close paths of the sheet must run `closeFilterSheet`** (X, backdrop, drag-down, save) because the enhanced toggle is client state and the summary box would otherwise show a stale value until the next 30 s poll. Toggle/slider changes also live-update the summary box immediately.
12. **Questionnaire wall is soft**: only `idle` users are blocked; users already in the pool/matched/relationship see the normal page with a refill banner (otherwise a questionnaire version bump would strand pool members who could not even leave). Completion check failure never locks the user out. `startMatch` re-checks completion before spending energy.
13. **Polling stop conditions**: romantic `relationship` is terminal (stop); friend keeps polling; 5 consecutive failures stop with a toast; every view/tab switch stops polling; the tick is a no-op if the active mode/view changed.
14. **48 h windows** come from `remainingMs` computed server-side from `Match.createdAt`; the client converts to a deadline at render and counts down; expiry triggers a status reload. Romantic and friend confirm/dissolve buttons live in the chat header, not on the match cards (except friend "Cancel connection").
15. **Friend `matched` with an empty array is rendered as idle** (plan page), and `no_match` with existing confirmed friends also falls through to the idle plan page — there is no mixed "friends + no new candidates" screen.
16. **Partner profile privacy**: cover, real photos and real name are only returned for confirmed partners/friends (server-enforced); strangers with `showProfile=false` return `{nickname, avatarUrl, hidden:true}`, which the renderer displays as a nearly empty page. The notes chip and add/edit button use `S.sessions` (must be loaded) and the PUT caps notes at 30 chars.
17. **Image URLs are sanitised** (`safeUrl`: blocks javascript:/vbscript:/file:/blob:, non-image data:) — irrelevant for native image loading but a reminder that `avatarUrl/coverUrl/realPhotos` are user-controlled strings.
18. **Plan-page bleed card** intentionally overflows the pane padding by 22px each side; the pane is `overflow:hidden` so nothing scrolls except the summary body (`overscroll-behavior: contain`, scrollbar hidden). In the H5 a pull-to-refresh guard exists so scrolling inside the box never triggers a page refresh; the match panes have no pull-to-refresh at all.
19. **Swipe semantics**: horizontal lock at 12px, 70px commit threshold, ±1 page clamped, 0.3 rubber band at the ends, gestures disabled while any overlay/plus-menu is open, settle listeners on `document`. Vertical scrolling of a pane is never hijacked once the gesture locks vertical.
20. **Dark mode**: neon card, toggles and CTAs keep neon/black; text tokens remap (#eceae6 / #aaa8a3 / #8c8a85), sheet bg #1c1b19, extra-info box #23211f, separators white 9 %. The segmented control's active state must be explicitly kept black-on-neon (CSS notes a past regression where dark rules whitened it).
21. **Legacy leftovers you can ignore**: `renderIdleMatch`, `startCampusAnim/stopCampusAnim` (no-ops), `setProposalButtonsDisabled`, `getNextFriday5pmCountdown`, `getMatchCycleCountdown`, `toggleFriendInterest/toggleFriendActivity`, `S.friendPrefActivities`, `S.matchBasis`, `S.matchExtraInfo`, `.match-anim` CSS, and the "Chat 三点" comment — none are reachable from current UI.
