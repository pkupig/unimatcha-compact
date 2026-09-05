# H5 module map — `square` (Square tab, post detail, new post, search, events/tickets, ads)

Sources read in full: `apps/h5/src/modules/square.js` (2099 lines), `apps/h5/src/modules/ads.js`, tickets code in `apps/h5/src/modules/profile.js` (L1378–1580), relevant markup in `apps/h5/index.html` (L724–765 square tab, L1050–1181 new post / search / post detail, L1743–1764 tickets), `apps/h5/src/styles/main.css`, helpers in `core.js` / `i18n.js` / `state.js` / `main.js`, and the backend contracts in `apps/api/src/square/*`, `events/*`, `reports/*`, `ads/*`, `prisma/schema.prisma`.

Tailwind → px cheat sheet used below: `px-1.5`=6, `px-2.5`=10, `px-3`=12, `px-4`=16, `px-5`=20, `px-6`=24; `w-4`=16, `w-5`=20, `w-6`=24, `w-7`=28, `w-8`=32, `w-9`=36, `w-10`=40, `w-14`=56, `w-16`=64, `w-20`=80; `h-11`=44, `h-16`=64; `gap-1.5`=6, `gap-2`=8, `gap-3`=12, `gap-4`=16, `gap-8`=32; `text-xs`=12, `text-sm`=14, `text-base`=16, `text-lg`=18, `text-xl`=20, `text-2xl`=24, `text-3xl`=30; `tracking-tight`=-0.025em, `tracking-tighter`=-0.05em, `tracking-widest`=0.1em; `leading-snug`=1.375, `leading-relaxed`=1.625; `py-24`=96; `bottom-52`=208; `max-w-2xl`=672, `max-w-screen-md`=768, `max-w-lg`=512, `max-w-sm`=384. All Tailwind radii are remapped to 10px (sm..3xl all = 10px) except explicit `rounded-[Npx]` and `rounded-full`.

Design tokens (index.html tailwind config + main.css): `neon` #CCFF00, `neon-pink` #FF2EC4, `primary` #000000, `surface` #f9f9f9 (page bg), `surface-container-lowest` #ffffff (cards), `surface-container-low` #f3f3f3 (soft inputs/chips), `surface-container` #eeeeee (image placeholder), `surface-container-high` #e8e8e8, `on-surface` #1b1b1b, `on-surface-variant` #474747, `outline` #777777, `outline-variant` #c6c6c6, `text-neutral-400` #a3a3a3, `text-neutral-500` #737373. Fonts: headline/body/label = "Plus Jakarta Sans" (fallback PingFang SC), mono = "JetBrains Mono". Icons = Material Symbols (Rounded family forced in CSS; names given below verbatim). Dark mode (html.dark): page/tab bg #121110, cards #1c1b19, low #23211f, container #292724, high #2f2d2a, primary text #eceae6, secondary text #aaa8a3, outline text #8c8a85, borders #343230; `.bg-neon` keeps black text.

---

## 1. Screens & states

### 1.1 Square tab (`#tab-square`) — the root screen

Entered by tapping bottom-nav "Square" (`switchTab('square')`, icon `eco`, label "Square"). `#tab-square` is a fixed full-screen panel (`position:fixed; inset:0; z-index:41; background:#f9f9f9; overflow-y:auto`) and **is itself the vertical scroll container** (body is overflow-hidden; window never scrolls). Bottom nav auto-hides when scrolling down >6px past y≥40 and reappears on scroll up / y<40 (`bindNavAutoHide`).

Top-to-bottom:

1. **Header** — `fixed top-0 w-full z-50`, `bg-surface/80 backdrop-blur-xl`, bottom border `outline-variant/20`. Height 44px (`h-11`) **plus** `padding-top: env(safe-area-inset-top)` (global `.fixed.top-0` rule). Inner row `px-4`, content centered.
   - **Segment group `#square-tabs`** (`relative flex gap-8`): two buttons "Recommend" / "Campus Wall" (`text-xs font-bold tracking-[0.02em]`, inactive color neutral-400 #a3a3a3, active color black (`.square-seg.active{color:#000}`; dark: #eceae6), `pb-1.5`). Under them a sliding ink bar `#square-tab-ink`: absolute bottom 0, height 2px, radius 2px, neon, animates `left`/`width` 0.28s cubic-bezier(0.22,1,0.36,1); positioned by JS to the active segment's offsetLeft/offsetWidth (re-measured on enter, +300ms, on resize, after fonts ready).
   - **"Pinned" segment `#square-seg-pinned`** — absolutely positioned at `left:100%` of the group + `margin-left:16px`, `bottom:0`, **font-size 10px** (smaller than the other two), `line-height:1`, `white-space:nowrap`, `padding-bottom:9px` as a starting value that JS then corrects at runtime so its **text baseline** aligns with "Campus Wall" (`alignPinnedSegBaseline` measures both baselines with a zero-size inline-block probe and adds the delta to padding-bottom; idempotent). Hidden by default (`opacity:0; translateX(-6px); pointer-events:none`) and shown only when `#square-tabs.show-pinned` is set, i.e. when the current page is `campus_wall` or `pinned` (transition opacity .24s / transform .28s). It deliberately does **not** occupy flex space so "Recommend / Campus Wall" never shift when it appears.
   - **Search button `#square-search-btn`** — absolute `right-3` (12px), vertically centered, 36×36 round, icon `search` 21px, `active:scale-90`. Opens the search overlay.
2. **Main** — `pt-[50px] pb-24 px-1.5 max-w-2xl mx-auto`, plus `margin-top: env(safe-area-inset-top)` (global `.fixed.top-0 ~ main`). Contains the **pager**:
   - `#square-pager` (`overflow:hidden`) → `#square-track` (`flex w-full`, inline `gap:12px`, transform-driven) → three `<section>` pages in fixed order `recommend → campus_wall → pinned`: `#square-feed-recommend`, `#square-feed-campus_wall`, `#square-feed-pinned` (the last also has class `square-pinned-page`). Each page: `w-full shrink-0 grid grid-cols-2 items-start` + `.square-feed-grid { row-gap:0; column-gap:6px; grid-auto-rows:1px; align-content:start; padding-top:6px }`.
   - Track offset for page i = `-i * (pagerWidth + 12)`; `pagerWidth = #square-pager.clientWidth || window.innerWidth || 375` (must fall back when width is 0 while the tab is hidden). Snapping animation: `transform 0.28s cubic-bezier(0.22,1,0.36,1)`.
   - Each page keeps **its own vertical scroll position** (`S.squareScrollPos[tab]`), saved on leaving and restored on entering a page; all three reset to 0 every time the Square tab is (re)entered.
3. **FAB `#square-fab`** — `fixed`, default `bottom:208px; right:20px`, 56×56, `bg-neon` black icon `add` 24px, round, no shadow, `z-50`, `touch-none`, `active:scale-90`. Draggable (see §2). Hidden (`.hidden`) on the pinned page.
4. **Pull-to-refresh indicator** (appended by `attachPullToRefresh`): 40×40 white circle (dark: #23211f), icon `refresh` 22px #1b1b1b, absolutely positioned at `top: env(safe-area-inset-top)` centered horizontally, opacity 0, `z-index:39` (below the square header z-50 → it slides out from under the header).

#### Feed page states (per page)
Every state is rendered as innerHTML of that page's `<section>` (a `col-span-2 text-center py-24` block for non-content states) and **must be followed by a masonry layout pass**, otherwise on a 1px-row grid the block would occupy 1 row and be invisible.

- **Initial / loading**: no spinner. The page is simply empty (or still shows the previous content) until the request resolves. (Search page shows "Loading..." text; feeds do not.)
- **Error**: `flatEmptyIcon('cloud_off')` (64×64 rounded-18 box, bg #efefef, icon 28px #8a8a8a, `mb-6`) + title "Failed to load posts" (`font-headline text-base font-extrabold tracking-tight`) + sub "Check your connection and try again" (`text-sm on-surface-variant mt-2`) + "Retry" button (`mt-6 font-headline text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-black pb-1`) → `loadSquareTab2()` (reloads **current** tab).
- **Need school** (campus_wall & pinned only, when API returns `needProfileSchool:true`): icon `school`, "Add your school to view the campus wall", "Set your school in your profile to unlock it", button "Complete profile" → `switchTab('profile')`.
- **Empty (pinned page)**: icon `push_pin`, "Nothing pinned yet", "Your student union pins important notices here".
- **Empty (recommend / campus wall)**: icon `grid_view`, "No posts yet", "Be the first to share a moment".
- **Empty (search)**: icon `grid_view`, "No posts found", "Try a different keyword".
- **Content**: cards laid out by the masonry algorithm (§1.2).

#### Pinned page differences (`.square-pinned-page` scope)
Same card templates as the other pages, but: `.pinned-badge` is hidden (the whole page is pinned posts); font sizes are one step smaller — official large-card title 18→16px, wide-card title/author 16→13px, wide-card body 14→12px, small-card title 13→11px. FAB hidden. No pagination (API returns ≤50, ordered by the union's manual order). Requires school (same gate as campus wall).

### 1.2 Masonry layout (must be reproduced exactly for parity of visual order)

Container is a 2-column grid with 1px auto rows, `row-gap:0`, `column-gap:6px`, `padding-top:6px`. Algorithm `layoutSquareMasonry()` (runs for all three pages + search page):

```
SP = 6  (vertical gap in px)
col1 = col2 = 1                   // next free row index per column (1-based)
holes = []                        // {col, start, size} gaps left under a short column
for each card in DOM order:
  n = max(1, ceil(measuredHeight) + SP)      // rows spanned (includes the 6px gap)
  if card is full-width (col-span-2: official large / wide campus card / ad / text card / empty state):
      row = max(col1, col2)
      if row-col1 > 0: holes.push({col:1, start:col1, size:row-col1})
      if row-col2 > 0: holes.push({col:2, start:col2, size:row-col2})
      place at column "1 / -1", rowStart=row, span n;  col1 = col2 = row + n
  else (single-column small card):
      h = first hole with size >= n
      if h: place at (h.col, h.start, n); h.start += n; h.size -= n; if h.size < 30 remove hole
      else: put in the shorter column (col1 <= col2 ? 1 : 2) at that column's next row; advance it by n
```
Consequences: single cards go to the **shorter** column (not "earliest row"); a full-width card sits below both columns and the resulting hole under the shorter column is back-filled by later small cards that fit (so visual order can be slightly re-ordered — intentional). Vertical spacing between cards is always exactly 6px.

Re-layout triggers: after every render; every `<img>` load/error (and immediately if already complete); `ResizeObserver` on every card (never on the container); `window.resize`; `document.fonts.ready`; after a poll vote re-render. `scheduleMasonry` coalesces into one rAF **with a 250ms setTimeout fallback** because rAF never fires while the page is hidden.

iOS translation: use a two-column waterfall with "shorter column first" + hole backfill for full-width items, 6px gaps, 6px top padding, 6px horizontal outer padding (`px-1.5` on main).

### 1.3 Card types (recommend / campus wall / pinned / search)

Card selection (`kindOf`):
- `authorType !== 'USER'` (STUDENT_UNION / TEAM / SPONSOR) → **official large card** (full width). If it has no image → **text card** (full width).
- `board === 'CAMPUS_WALL'` (API returns uppercase; compare case-insensitively) → **wide card** (full width) regardless of which page it appears on.
- Otherwise: on the campus_wall page → wide card; on recommend/pinned/search → **small card** (half width).
- Ads (recommend page only) → **ad large card** (full width), inserted per the rule in §3.

Common pieces:
- **Author identity** `postAuthorDisplay(p)`: if `p.anonymous` → name = `aliasName(p.anonymousAuthor.aliasSeed)` (language-dependent, see §5), else fallback `anonymousAuthor.nickname` (English from server) else "Anonymous"; avatar = emoji alias avatar; `school = p.school` (**never** the author profile's school). Non-anonymous → `authorUser.profile.nickname` || `admin.name` || `admin.organizationName` || "User"; avatar `profile.avatarUrl`; school `profile.school || p.school`.
- **avatarChip(profile, fallbackName, sizeClass)**: anonymous with seed → `aliasAvatarHtml` (round, bg = seed color, emoji sized to 62% of the box, min 9px: a 16px box → 10px emoji, 32px → 20px, 40px → 25px); anonymous without seed → grey round box with `person` icon; has URL → round `object-cover` image; else black circle with white bold initials (first 2 chars uppercased).
- **Stacked couple avatars** `renderAuthorAvatars(post)`: if post has `match.userA` and `match.userB` and is not anonymous → 40×40 box with 36×36 avatar A and 24×24 avatar B (2px white ring) overlapping bottom-right. Otherwise one 40×40 avatar.
- **Like button** `postLikeButton`: `favorite` icon 14px (`text-sm`), filled + `neon-pink` when `myLiked`, count `text-xs font-bold` (`likeCount || 0`). Tap = `likePost` (stops propagation).
- **Author row** `cardAuthorRow`: `flex justify-between mt-1.5`; left = 16×16 avatar + name (`text-neutral-400 text-[11px] truncate`, `data-no-i18n`), right = like button.
- **Badges**: `.official-badge` (semi-transparent black rgba(27,27,27,.4) + blur, white, 9px, bold, 0.08em, radius 10px, padding 2×8) with text "Student Union · {org}" / "Official Team · {org}" / "Official" (org = `admin.organizationName || admin.name`; without org just the label); `.sponsored-badge` "Sponsored" (neon bg, black, 9px, 800, uppercase, 0.1em) when `isSponsored` or `authorType==='SPONSOR'`; `.pinned-badge` "PINNED" (rgba(0,0,0,.75) bg, **neon text**, 9px, 800, uppercase, nowrap) when `isPinned`. School badge `.school-badge` exists in CSS (black/40 + blur, white 9px pill, max-width 144px) but is **not rendered on cards any more** — only inside the post detail header.
- **Comment snippet line** (search results only; when API sets `commentSnippet`): `text-[11px] text-outline leading-snug mt-1 pl-2`, 2px left border `neon/60`, 2-line clamp; content = label "COMMENT" (`font-headline text-[9px] font-bold tracking-[0.15em] mr-1`, translatable) + snippet (`data-no-i18n`).
- Line clamps use `-webkit-line-clamp`.

**Small card** (`bentoSmallCard`, single column): `bg-surface-container-lowest rounded-[6px] overflow-hidden`, no border/shadow.
- Media: if first image → image `.rec-img` (`width:100%; height:auto; min-height:110px; max-height:300px; object-fit:cover`, i.e. natural aspect ratio clamped). On image error the media block is hidden.
- If no image → **highlighter text card**: `aspect-[3/4]`, background `#f6f1e7` (ivory, kept in dark mode on purpose), `p-5`, vertically centered, left-aligned text `font-headline font-extrabold tracking-tight`, `font-size: clamp(1.05rem, 5.5vw, 1.45rem)`, line-height 1.6, color `#3f3f3f`, 5-line clamp, `data-no-i18n`. Text = `title || content`. The **first segment** gets a neon highlighter: split at the first punctuation/whitespace `[。，！？…、,.!?:;\s]`, cap at 12 chars if the first char is ASCII else 6 chars; render that head with `background: linear-gradient(to top, rgba(204,255,0,.95) 32%, transparent 32%)` (a neon bar covering the lower third of the glyphs). Escape after splitting.
- Body `px-2.5 pt-2 pb-2.5`: title `font-headline text-[13px] font-bold tracking-tight leading-snug`, 2-line clamp, text = `title || content.substring(0,60)`, `data-no-i18n`; then comment snippet line (search only); then author row.

**Wide card** (`bentoWideCard`, full width, campus wall): `bg-surface-container-lowest p-4 border border-outline-variant/10 shadow-sm rounded-[6px]`.
- Header row `flex items-center gap-3 mb-4`: 40px avatar(s) (couple-stacked aware) · column with name (`font-headline text-base font-bold truncate`, `data-no-i18n`) and relative time (`text-[10px] text-neutral-400 font-medium tracking-widest`, `formatPostTime`) · pinned badge on the right.
- Image: first image only, `aspect-video` (16:9) `object-cover` `rounded-[6px] mb-2`, hidden on error.
- Title (`font-headline font-bold text-base tracking-tight mb-1`), content (`text-sm on-surface-variant leading-relaxed`, 3-line clamp), comment snippet line, 12px spacer, **poll block** (if poll), then action row `flex justify-between`: comment button (`chat_bubble` 14px + count `text-xs font-bold`, neutral-400, `active:scale-95`; tap opens detail **with composer focus**) and like button.

**Official large card** (`bentoLargeCard`, full width): `bg-surface-container-lowest rounded-[6px] overflow-hidden`.
- Image block `aspect-[4/5] bg-surface-container` with `object-cover` image (hover scale is web-only). Top-left overlay (`top-4 left-4`, `gap-1.5`): pinned badge then official/sponsored badge.
- Body `px-3 pt-2 pb-2`: title `font-headline font-bold text-lg tracking-tight`, **event strip** (if event post), author row.
- No image → **text card** `bentoTextCard`: `p-4 border outline-variant/10 shadow-sm rounded-[6px]`; header row (`mb-3`) with pinned + official badges if any; title `text-lg font-bold mb-2`; event strip; content `text-sm on-surface-variant leading-relaxed mb-2` 4-line clamp; author row.

**Ad card** (`adLargeCard` from ads.js, full width, recommend page only): identical silhouette to the official large card: `aspect-[4/5]` image with "Sponsored" badge top-left (no image → badge in a `px-3 pt-3` header row); body `px-3 pt-2 pb-3 space-y-1`: title `text-lg font-bold`, content `text-neutral-500 text-sm italic` 2-line clamp, advertiser name `text-neutral-400 text-[10px] tracking-widest` (`advertiserName || 'Sponsor'`). No like button, no author row; `data-ad-id` instead of `data-post-id`. Tap → `onAdClick` (§2).

**Event strip** (`eventStrip`, cards for `postType==='event'` with `event`): `flex items-center gap-2 flex-wrap mt-1`: chip "EVENT" (neon bg, black, 9px bold, tracking-widest, radius 8px, `px-2 py-0.5`) · `M/D HH:mm` (+ ` · venue`) in `text-[11px] on-surface-variant font-medium` · price `text-[11px] font-bold` = "Sold out" if `capacity != null && ticketsSold >= capacity`, else "Free" if `priceCents` is 0, else "{cells} energy cell(s)" / zh "{cells} 格能量" where `cells = ceil(priceCents/100)`.

**Poll block** (`pollBlock`, wide card + detail; `postType==='poll'` with `pollOptions[]`): `.poll-block` (flex column, gap 6px, `my-3`). Optional review chip above rows: pending → "UNDER REVIEW" (bg surface-container-high, on-surface-variant, 9px bold tracking-widest, radius 8); rejected → "REJECTED" (bg neon-pink/15, text neon-pink). One `.poll-opt` button per option: full width, `padding 9px 12px`, 1px border #c6c6c6, radius 10px, white bg, relative; inside a `.poll-opt-fill` absolute left bar with `width = pct%` and bg rgba(204,255,0,.28) (`transition width .4s`); label `.poll-opt-label` 13px 600 #1b1b1b ellipsized; count `.poll-opt-count` JetBrains Mono 11px #474747 showing `pct%` (empty when total 0). My choice → `.poll-opt--mine`: border 1.5px #1b1b1b and fill rgba(204,255,0,.5). Options are tappable only when `reviewStatus==='approved'` (else `disabled`). Footer line `text-[10px] text-outline tracking-widest mt-1.5`: "{total} vote(s)" + " · tap to change" when the user already voted (English only, `data-no-i18n`). `pct = round(votes/total*100)`.

### 1.4 Square search overlay (`#square-search-overlay`)

Full-screen `.overlay` (`fixed inset-0 z-50 bg-surface flex flex-col`, `overflow:hidden`; overlays fade in/out via opacity/visibility .25s). Opened by the header search button; closed by back arrow, edge swipe-back, or the "Search" flow staying open.
- **Header** (`shrink-0`, `bg-surface/80 backdrop-blur-xl`, bottom border; row `px-4 h-16 gap-3`; height becomes 64px + safe-area, padding-top safe-area): back button (`arrow_back` 24px, `active:scale-95`) → `closeSquareSearch()`; **search field pill** `flex-1 bg-surface-container-low rounded-full px-4 py-2.5` with `search` icon 19px outline-colored, `<input type=search enterkeyhint=search placeholder="Search posts">` (`text-sm`, no border), and a clear button (`close` 18px) shown only when the query is non-empty; then a neon "Search" button (`px-4 py-2.5 rounded-full bg-neon text-black font-headline text-xs font-bold tracking-widest`).
- **Main** `#square-search-results` (`flex-1 overflow-y-auto px-1.5 pt-2 pb-16 max-w-2xl mx-auto`) containing `#square-feed-search` (same grid + masonry as the feeds).
- States: **idle/guide** (first open or empty query): icon `search`, "Search the square", "Find posts by title, content or tag". **Loading**: centered "Loading..." (`text-sm on-surface-variant py-24`). **Error**: cloud_off / "Failed to load posts" / "Check your connection and try again" / "Retry" → `runSquareSearch()`. **Empty**: "No posts found" / "Try a different keyword". **Results**: cards rendered with tab='search' (small cards for recommend-board posts, wide cards for campus-wall posts, official large cards; **no ads**), with comment-snippet lines when provided.
- Input focus is requested 60ms after open. Layering: sits above the bottom nav, below the post detail overlay (both z-50; DOM order decides).

### 1.5 Post detail overlay (`#post-detail-overlay`)

Full-screen `.overlay` (`fixed inset-0 z-50 bg-surface`, `overflow:hidden`), **three-part layout**: header and footer are `position:absolute` (top:0 / bottom:0, z 2) and the scroll area `#pd-scroll` is `flex-1 overflow-y-auto max-w-screen-md mx-auto` with `padding-top: calc(4rem + safe-area-top)` and `padding-bottom: var(--pd-footer-h, 76px)` (JS writes the measured footer height into `--pd-footer-h` whenever the footer changes: reply bar shown/hidden, image preview shown/hidden, on bind). Opened via `openPostDetail(postId, focusComposer?)` from any card / comment-count button; closed via back arrow, edge swipe-back (registered in `SWIPE_BACK_CLOSE`), or 401.

**Header `#pd-header`** (`h-16` + safe-area padding → 64px+sat, `bg-surface/80 backdrop-blur-xl`, bottom border `outline-variant/20`, `px-3`, `flex justify-between gap-2`):
- Left: back button 36×36 round (`-ml-1.5` so the 24px `arrow_back` glyph sits on the 12px content margin) → `closePostDetail()`; then `#pd-header-author` (`data-no-i18n`): 32px avatar chip + column (name `font-headline font-bold text-[13px] truncate`; school `text-[10px] on-surface-variant truncate` via `metaLabel`) + official/sponsored badge if official. Cleared to empty immediately on open (so the previous post's author never flashes) and filled after load. Anonymous posts show alias name + emoji avatar here too.
- Right: "more" button `#pd-report-btn` 36×36 (`-mr-1.5`), icon `more_horiz` 22px, `text-on-surface-variant` → opens the post action menu (§2).

**Scroll content `#pd-content`** (rendered by `renderPostDetail`):
1. **Images**: none → nothing. One → full-width `object-cover` image on `bg-surface-container`. Several → horizontal snap carousel `#pd-carousel` (`flex overflow-x-auto snap-x snap-mandatory`, scrollbar hidden), each slide full width with `aspect-[4/5] object-cover`; two overlay arrow buttons 32×32 `bg-black/40` white (`chevron_left` / `chevron_right`, at `left-2`/`right-2`, vertically centered, `active:scale-90`) that scroll by one slide clamped to [0,last]; dot bar `#pd-carousel-dots` at `bottom-6` centered: one 32×2px bar per image, white for current, white/40 otherwise, updated on scroll (`round(scrollLeft/clientWidth)`).
2. **Article** `px-3 pt-5 pb-4 bg-surface-container-lowest`: title `font-headline text-3xl font-bold tracking-tighter mb-4 leading-none`; content `text-lg font-light on-surface-variant leading-relaxed whitespace-pre-wrap`; poll block (if poll); **event detail block** (if event, §1.7). Then an action row (`flex justify-between gap-4 py-3 border-t outline-variant/20 mt-6`): left group `gap-8` = like button `#pd-like-btn` (`favorite` 20px, filled + neon-pink when liked, count `text-xs font-bold font-label tracking-tighter`, `active:scale-90`) and comment button (`chat_bubble` 20px + total comment count) → `focusPdComposer()`; right = relative time `text-[10px] on-surface-variant font-label tracking-widest` (`data-no-i18n`).
3. **Comments section** `px-3 pt-5 pb-6 bg-surface` (`data-pd-comments`): heading `font-headline text-xs font-bold tracking-[0.2em] mb-6 on-surface-variant` = "Observations" + ` (N)` (`data-no-i18n`) + hint `· long-press for options` / zh `· 长按更多操作` (`font-normal tracking-normal text-outline`, only when there are comments). Threads: `space-y-7` (28px) between top-level groups, `space-y-4` (16px) inside a group (parent + its replies). Empty: `forum` icon 28px `outline-variant` + "No observations yet. Share the first one." (`text-sm text-outline mt-2`, `py-10`).
   - **Comment row** `renderPdComment` (`.pd-comment flex gap-3`, replies add `pl-11` = 44px indent, `data-comment-id`): avatar 32px (reply: 28px) — alias emoji avatar for anonymous comments (`anonymousAuthor.aliasSeed`), else image, else grey `person` placeholder; right column: name line (`font-headline font-bold text-[13px] truncate`, `data-no-i18n`; anonymous → `aliasName(seed)`, else `user.profile.nickname || user.nickname || 'User'`) + optional **Author tag** (1×1 dot `bg-primary/60` + "Author"/zh "作者", `text-[10px] text-primary/70 font-medium`) + time on the right (`text-[10px] on-surface-variant font-label tracking-widest`); content `text-sm leading-relaxed mt-1` (`data-no-i18n`, omitted if empty); optional image button `mt-2` with `max-w-[160px] max-h-[160px] rounded-[10px] object-cover` → opens full-screen image viewer; action line `flex gap-4 mt-1.5`: "Reply" (`text-[10px] font-bold tracking-widest text-outline`) and like (`favorite` 15px + count `text-[10px] font-bold`, filled+pink when `myLiked`, `active:scale-90`).
   - Author tag rule: anonymous post → comment's `anonymousAuthorToken === post.anonymousAuthorToken`; normal post → `comment.userId === post.authorUserId`. Never fall back to userId on anonymous posts.

**Footer** (`shrink-0 border-t outline-variant/20 bg-surface px-3 pt-3`, `padding-bottom: safe-area-bottom + 8px`):
- `#pd-reply-bar` (hidden by default; `flex justify-between mb-2`): label `#pd-reply-label` "Replying to {nickname}" (`text-[10px] font-bold tracking-widest on-surface-variant`) + "Cancel" (`text-[10px] font-bold tracking-widest text-outline`).
- `#pd-image-preview` (hidden by default; `mb-2`): 64×64 `rounded-[10px]` thumbnail with a 20×20 `bg-black/70` white `close` (13px) remove button at `-top-1.5 -right-1.5`.
- Composer row `flex items-center gap-1.5`: image button `#pd-image-btn` 36×36 round `bg-surface-container-low text-outline` icon `image` 19px; anonymity toggle `#pd-anon-toggle` 36×36 round, icon `visibility` when off / `visibility_off` when on, colors off = `bg-surface-container-low text-outline`, on = `bg-neon text-black`; input `#comment-input` (`flex-1 bg-surface-container-low rounded-full px-4 py-2.5 text-sm`, placeholder "Add an observation..." or "Commenting anonymously..." when anon is on; focus ring neon); send `#pd-send-btn` 36×36 round `bg-neon text-black`, icon `arrow_upward` 19px, `active:scale-95`, disabled while sending. Footer height when only the composer is shown ≈ 61px + safe area.
- Hidden `<input type=file accept=image/*>` for the comment image.

**Chrome auto-hide** (`pd-chrome-hidden` class on the overlay): on `#pd-scroll` scroll, when y<40 always show; scrolling down by >6px hides header (translateY(-100%), opacity 0, no pointer events) and footer (translateY(100%)); scrolling up >6px shows them; transition transform .26s cubic-bezier(0.22,1,0.36,1) / opacity .2s. Focusing the comment input forces chrome visible. Every open starts in the expanded state.

**Action menus** (`.pd-cm-menu`): a floating card `fixed z-[130] min-w-[148px] bg-surface-container-lowest border outline-variant/30 rounded-[12px] shadow-2xl py-1`; rows `px-4 py-2.5 flex gap-2.5` with 18px outline-colored icon + `text-sm` label (`data-no-i18n`, language-branched at render time). Any document click closes it (listener attached 10ms later).
- Post menu (from header "more"): "Share" (`ios_share`) and "Report post" (`flag`). Positioned below the more button: `left = clamp(btn.left - 100, 8, innerWidth-164)`, `top = btn.bottom + 6`.
- Comment menu (long-press / right-click on a comment row): "Share" (`ios_share`), "Like"/"Unlike" (`favorite` / `heart_minus`, depending on `myLiked`), "Report" (`flag`). Positioned at the touch point: `left = clamp(x, 8, innerWidth-164)`, `top = clamp(y+8, 8, innerHeight-150)`.

**Report flow** (both post and comment) — two shared cards from core.js:
1. `confirmCard` (dialog card `max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6` on a `bg-black/40 backdrop-blur-[2px]` backdrop, z 120; title `font-headline font-extrabold text-lg tracking-tight`, body `text-sm leading-relaxed on-surface-variant`, two equal buttons `py-3 rounded-[10px] text-xs font-bold tracking-widest`: cancel outlined, confirm = **neon-pink bg white text** because `danger:true`). Title "Report this post?" / "Report this comment?" (zh "举报这条帖子？" / "举报这条评论？"), body "Reports are reviewed by our moderators. Repeated false reports may limit your account." (zh "举报会交由管理员人工审核。恶意或重复的虚假举报可能影响你的账号。"), confirm "Continue"/"继续举报", cancel "Cancel"/"取消". Tapping the backdrop returns null (treated as cancel).
2. `promptCard` (same card with a 3-row textarea, soft `bg-surface-container-low rounded-[10px]` field): title "Report reason"/"举报原因", label (uppercase 10px outline) "Spam · Harassment · Explicit · False info" / "垃圾广告 / 骚扰辱骂 / 不适内容 / 虚假信息", placeholder "Briefly describe the issue (optional)" / "简单说明原因（可留空）", confirm "Submit report"/"提交举报", cancel "Cancel"/"取消". Cancel/backdrop → abort. Empty text → reason becomes "No reason given" / "未填写原因".
3. Toast: success "Report submitted — thanks for flagging" / "举报已提交，我们会尽快处理"; failure = server message or "Failed to report" / "举报失败，请重试".

### 1.6 New post overlay (`#overlay-new-post`)

Full-screen `.overlay` `z-[100] bg-surface-container-lowest flex flex-col overflow-hidden`. Opened by the FAB (`openNewPost`), closed by "Cancel" (`hideOverlay`) or after a successful publish. **No swipe-back** (no arrow_back present).
- **Header** `shrink-0 h-16 px-6 flex justify-between bg-surface/80 backdrop-blur-xl border-b` (+ safe-area height/padding): left "Cancel" (`on-surface-variant font-medium text-base tracking-tight`), right "Publish" (`bg-neon text-black px-6 py-2 rounded-[10px] font-headline font-bold text-sm tracking-widest`; disabled while submitting).
- **Main** `flex-1 overflow-y-auto px-6 py-6`, `space-y-6`:
  1. Read-only destination chip `#newpost-board-note` (`inline-flex gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low text-[11px] on-surface-variant`): icon `place_item` 14px + "Posting to **Recommend**" / "**Campus Wall**" (bold label `#newpost-board-label`, `text-on-surface`). Destination = the page the user was on when tapping the FAB (recommend or campus_wall; pinned page has no FAB). Not user-switchable; enabling the poll forces Campus Wall, disabling it restores the original.
  2. Title input `#post-title` — `text-2xl font-headline font-bold tracking-tight`, transparent, no border, placeholder "Title" (max 100 chars server-side).
  3. Content textarea `#post-content` — `min-h-[160px] text-base leading-relaxed`, transparent, placeholder "Capture the moment..." (max 2000 server-side).
  4. Image grid `#new-post-images` (`grid grid-cols-4 gap-3`): up to 4 thumbnails 80×80 `rounded-[10px] bg-surface-container-low` with a 20×20 black (`bg-primary`) white `close` (14px) remove button at `-top-1 -right-1`; plus an 80×80 dashed `outline-variant` add tile (`add` icon 24px light) while fewer than 4.
  5. Options card `rounded-[14px] bg-surface-container-low overflow-hidden`:
     - Row "Post anonymously" (`px-4 py-3.5`, `text-sm`) + `.ink-switch` toggle (48×24 pill, #e2e2e2 off / neon on, 16px white knob, `translateX(24px)` when on).
     - `#newpost-poll-row` (top border `outline-variant/20`; **hidden unless destination is Campus Wall**): row "Create a poll" with sub-line "Goes live after review" (`text-xs on-surface-variant mt-0.5`) + ink switch; when on, `#newpost-poll-options` (`px-4 pb-4 space-y-2.5`) shows `#poll-option-list` rows (`flex gap-2`: text input `maxlength=50` placeholder "Option N" `bg-surface-container-lowest rounded-[10px] px-3 py-2.5`, plus — only when more than 2 rows — a 32×32 round `close` (18px) remove button `text-outline active:scale-90`) and a "+ Add option" link (`text-[11px] font-bold tracking-widest on-surface-variant underline underline-offset-4`). Min 2, max 6 options.
- Hidden `<input type=file accept=image/* multiple>`.

### 1.7 Event detail block + ticket purchase (inside post detail)

For `postType==='event'` posts (created by student union / team from admin; the post carries `event {id,title,venue,school,startAt,endAt,priceCents,capacity,ticketsSold,status}`), `eventDetailBlock` renders under the content: card `mt-6 rounded-[14px] border outline-variant/30 bg-surface-container-lowest p-5`:
- Row (`gap-2 mb-3`, `data-no-i18n`): "EVENT" neon chip + school (`text-[10px] text-outline tracking-widest`, via `metaLabel`).
- Info lines (`space-y-1.5 text-sm`, `data-no-i18n`, each with an 18px outline icon): `schedule` `M/D HH:mm – M/D HH:mm`; `location_on` venue (if any); `confirmation_number` price + ` · {remaining} left` (when capacity set) + ` · {ticketsSold} sold`.
- CTA `.btn-cta` (full width, neon, black, radius 10, `padding 20px 24px`, Plus Jakarta 700 14px, letter-spacing .1em, `mt-5`, `opacity-50` + disabled when unavailable): label = "Sales closed" if `status !== 'published'`, else "Event ended" if `now > (endAt || startAt)`, else "Sold out" if remaining ≤ 0, else "Get Ticket" + ` · {price}` (price part `data-no-i18n`). Tap → `buyEventTicket(event.id)` (§2).
- Where `remaining = capacity == null ? null : max(0, capacity - ticketsSold)`.

Purchase confirmation cards (`confirmCard`, neon confirm button):
- Paid: title "Get this ticket?" / "购买这张门票？"; body "{cells} energy cell(s) will be spent now (you have {avail}). The ticket lands in My Tickets instantly." / "将消耗 {cells} 格能量（当前 {avail} 格），门票立即进入我的票夹。"; confirm "Spend {cells} & get ticket" / "消耗 {cells} 格购票"; cancel "Cancel"/"取消".
- Free: title "Get this ticket?", body "Payment is mocked in beta — the ticket lands in My Tickets instantly.", confirm "Confirm" (English only, translated by dictionary where keys exist).
- Insufficient energy: toast "Not enough energy — top up" (zh "能量不足，请先充值") and the energy purchase overlay opens (`openEnergyModal`, profile module).
- Success toast: "Ticket {code} added to My Tickets".

### 1.8 Tickets wallet (`#tickets-overlay`) and ticket detail (`#ticket-detail-overlay`) — code lives in profile.js

Entered from the Profile tab menu row "My Tickets" (icon `confirmation_number`) → `openTickets()`.

**Wallet**: `.overlay z-[60] bg-surface overflow-y-auto` with a `fixed top-0` header (`px-6 h-16`, `bg-surface/80 backdrop-blur-xl`, `arrow_back` + title "My Tickets" `font-headline text-xl font-bold tracking-tight`, 1px divider under) and `#tickets-content` (`pt-24 pb-20 px-5 max-w-lg mx-auto`).
- Loading: "Loading…" centered `text-sm on-surface-variant pt-16`.
- Error: `cloud_off` icon, "Failed to load tickets", "Retry" underline button.
- Empty: `confirmation_number` icon, "No tickets yet", "Tickets you get for campus events appear here."
- List: one **ticket stub** per ticket (`.ticket-card mb-5 rounded-[14px] bg-surface-container-lowest border outline-variant/20`, `active:scale-[0.99]`, `opacity-60` if status ≠ valid), tap → `openTicketDetail(i)`:
  - Upper half `p-5 pb-4`: title (`font-headline font-extrabold text-base tracking-tight`, `event.title || 'Event'`) + status chip (VALID = neon/black; USED / CANCELLED = surface-container-high/on-surface-variant; all `text-[9px] font-bold tracking-widest rounded-[8px] px-2 py-0.5`); line `YYYY-MM-DD HH:mm` + ` · venue` (`text-xs on-surface-variant`); paid line (only when `pricePaidCents>0`): "{cells} cell(s)" / zh "{cells} 格能量" with `cells = ceil(pricePaidCents/100)`; school (`text-[10px] text-outline tracking-widest mt-1`, `metaLabel`).
  - Tear line: two 22px circles (`.ticket-notch`, page-bg colored #f9f9f9 / dark #17171c) punched at left/right (-11px) over a `2px dashed rgba(0,0,0,.12)` divider inset 22px.
  - Lower half `p-5 pt-4 flex gap-5`: QR box `#ticket-qr-{i}` 86×86 white `p-1.5 rounded-[10px] border outline-variant/30` containing a 74×74 QR (qrcodejs, level M, text = ticket `code`); right column: "TICKET CODE" (`text-[10px] tracking-[0.2em] text-outline mb-1`), code `font-mono text-sm font-bold tracking-wider`, hint `touch_app` 13px + "Tap to open" (`text-[10px] text-outline mt-2`).

**Ticket detail** (`z-[70]`, header title "Ticket", back → `closeTicketDetail()`; `#ticket-detail-content pt-24 pb-20 px-5`): a **pass card** `max-w-sm mx-auto rounded-[20px] bg-surface-container-lowest overflow-hidden` with `box-shadow 0 18px 48px rgba(0,0,0,.18)` (`opacity-70` if used/cancelled):
- Neon head `px-6 pt-6 pb-5 text-black`: "UNIMATCHA · TICKET" (`text-[10px] font-bold tracking-[0.25em] opacity-70`), event title (`font-headline font-extrabold text-xl tracking-tight mt-1.5 leading-snug`), school (`text-[11px] mt-1 opacity-70`).
- Tear line (same notches/dashes).
- Fields row `px-6 pt-5 pb-4 flex gap-4`: "DATE"/"日期" `YYYY-MM-DD`, "TIME"/"时间" `HH:mm` (label `text-[9px] tracking-[0.2em] text-outline mb-1`, value `text-sm font-bold truncate`); optional "VENUE"/"地点" row.
- Centered `px-6 pb-6`: QR box `#ticket-detail-qr` 200×200 white `p-2.5 rounded-[14px] border` with a 180×180 QR; code `font-mono text-base font-bold tracking-[0.15em] mt-4 select-all`; caption `text-[11px] text-outline mt-1`: "Show this QR at the entrance" / "入场时出示此二维码", or "This ticket has been used" / "此票已使用" when status ≠ valid.
- "Add to Apple Wallet" black button exists in code but is gated off (`ENABLE_APPLE_WALLET=false`; backend `/events/tickets/:id/pkpass` returns 501 until certificates exist). iOS: do not ship the button unless PassKit signing is set up.

### 1.9 Shared bits reused by this module

- **Full-screen image viewer** `#chat-image-viewer` (`.overlay z-[80] bg-black/90`, centered `<img max-w-[92%] max-h-[85%] object-contain>`; tap anywhere closes). Used for comment images.
- **Toast** `#toast`: fixed top `16px + safe-area`, centered, black bg, white text, `padding 12px 24px`, z 999, 3s.
- **Ad detail overlay** (ads.js `showAdDetail`, dynamic `#ad-detail-overlay`, `z-[60] bg-surface overflow-y-auto`): sticky header `h-16 px-6` with `arrow_back` + "Sponsored" (`font-headline text-[10px] font-bold tracking-[0.15em]`) → `closeAdDetail()`; all images full width stacked; `px-6 py-8`: Sponsored badge, title `text-3xl font-bold tracking-tighter mb-4 leading-none`, content `text-lg font-light on-surface-variant whitespace-pre-wrap`, advertiser `text-neutral-400 text-[10px] tracking-widest mt-6`.

---

## 2. Interactions

### Square tab
- **Enter tab** (`switchTab('square')` → `loadSquareTab`): reposition ink (now + 300ms), set track to current tab without animation, reset all three scroll positions to 0, sync pinned segment visibility + baseline, sync FAB visibility, then **load all three pages in parallel** (recommend with ads, campus wall, pinned) so neighbouring pages already have real content when swiping.
- **Re-tap the Square nav item while already on it**: smooth-scroll `#tab-square` to top, reset the current page's stored position, reload **only the current page** (`loadSquareTab2(S.squareTab)`); the other pages keep content and position.
- **Tap a segment** (`switchSquareTab`): save the outgoing page's `scrollTop`; set `S.squareTab`; toggle `.active`; show/hide "Pinned" (must happen before positioning the ink because the group width changes); show/hide FAB; animate ink; animate track to the target offset; point `S.squarePosts` at that page's cache; **only reload if the target page has no rendered card** (`[data-post-id],[data-ad-id]` absent); restore the target page's saved `scrollTop`.
- **Horizontal swipe on the pager** (`bindSquareSwipe`, listeners on `#tab-square`, settle on `document`): ignore if a second finger joins mid-gesture or if the FAB is being dragged. Direction lock after 12px movement: horizontal if |dx|>|dy| → set `dataset.horizLock='1'` and `touch-action:none`, `preventDefault` each move so the page cannot scroll vertically. Track follows the finger: `offset(current) + dx * damp` where `damp = 0.3` (rubber band) when there is no page in that direction (first page swiping right, last page swiping left), else 1. Target page = current index ±1 clamped to [0,2] (recommend → campus_wall → pinned; never jumps two pages). On release: if |dx| ≥ 70 and target ≠ current → `switchSquareTab(target)` (same path as a tap, including the snap animation); otherwise animate back. Vertical gesture → reset lock and snap back. The PTR gesture yields while `horizLock==='1'`.
- **Pull-to-refresh** (`attachPullToRefresh(#tab-square, loadSquareTab2(currentTab), 'main')`): only starts when `scrollTop<=0` and no inner scrolled ancestor. Distance = `180*(1-exp(-dy/180))` (rubber band, asymptote 180). Indicator fades in over the first 40px, descends with the finger, icon rotates 360° per 70px, turns neon at ≥70px (`ptr-ready`); the `<main>` content translates with the finger too. Release ≥70px → indicator spins (0.7s linear loop) at 70px, content held at 70px, `loadSquareTab2()` runs for the **current** page, minimum 600ms display, then everything animates back (0.3s). Release <70 → snap back.
- **Tap card** → `openPostDetail(id)`. **Tap comment count on a wide card** → `openPostDetail(id, true)` (scrolls to comments and focuses the composer). **Tap like on a card** → `likePost(id, btn)`: POST, then set icon fill/pink + count = `res.likeCount` if provided else local ±1, and sync every cache copy (recommend/campus_wall/pinned/search lists + open detail). Failure → toast "Failed to like post". No optimistic pre-update (state changes only after the response).
- **Tap poll option** (approved polls only) → `votePollOption(postId, idx)`: POST; on success patch `pollOptions`/`myVote` into the cached post (+ detail data) and re-render **every** `[data-poll-id]` block in place, then re-run masonry. Failure toast = server message or "Vote failed". Votes can be changed by tapping another option.
- **Tap ad card** → queue a `click` event; if `landingUrl` open it externally (new tab / Safari), else show the ad detail overlay. **Ad impressions**: IntersectionObserver ≥50% visible → one `impression` per campaign per session.
- **FAB tap** → `openNewPost()`. **FAB drag**: touchstart records origin and sets `window.__fabDragging=true` (disables page swipe); movement <6px total is still a tap; beyond that the button follows the finger (`preventDefault`), clamped to x∈[8, innerWidth-w-8], y∈[headerBottom+8, innerHeight-h-8] where headerBottom is measured from `#tab-square > header` (fallback `44 + safe-area-top + 8` when the tab is hidden). On release it **snaps to the nearest side** (20px from the left or right edge, keeping y) with a 0.2s ease-out and the position is persisted to `localStorage['cl_fab_pos'] = {x,y}`; restored on next launch through the same clamp. A click right after a drag is swallowed. On resize, re-clamp (skip if the tab is hidden / rect is 0).
- **Header search button** → `openSquareSearch()`.

### Search overlay
- Typing (`oninput`) → trims, toggles the clear button, debounces 300ms → `loadSquareSearch()`. Enter key / "Search" button → immediate search + blur keyboard. Clear button → empties input, cancels debounce, shows idle state, refocuses. Back / swipe-back → `closeSquareSearch()` (blur, close overlay, point `S.squarePosts` back at the current feed page). Each search increments `S._squareSearchSeq`; stale responses are dropped. Results use the normal card interactions (like/detail/vote). Cards liked from search are patched back into the feed pages too.

### Post detail
- **Open** (`openPostDetail`): set `S.currentPostId`, reset comment anonymity (`S.pdAnon=false`), show chrome, bind scroll auto-hide once, clear header author, clear any pending comment image, sync the anon toggle UI, open overlay, `await loadPostDetail(id)`; if `focusComposer` and the post is still the current one → scroll the comments heading into view and focus the input without scrolling.
- **Close** (`closePostDetail`, back arrow / swipe-back from the left 30px edge with ≥80px travel): close overlay, `S.currentPostId=null`, cancel reply target (draft text is preserved).
- **Like post** (`likePdPost`): POST; update the detail button (fill/pink/count), caches, and patch the list card(s). Failure toast "Failed to like post".
- **Comment count button** → `focusPdComposer()`.
- **More (header)** → post action menu → **Share** (`navigator.share({title, text: content[:140], url: origin})`, fallback copy `"{title}\n{text}\n{url}"` to clipboard + toast "Copied to clipboard"/"已复制到剪贴板"; AbortError = user cancelled, silent; other errors toast "Share failed"/"分享失败") or **Report post** (two-step flow §1.5 → `POST /square/v2/posts/:id/report`).
- **Carousel**: native horizontal snap scroll + arrow buttons (clamped, smooth scroll) + dots update.
- **Reply** button on a comment (`setPdReply(commentId, topLevelId)`): the API only supports two levels, so the reply target is always resolved to the **top-level** comment id (if a reply id is passed, find its owner); the label shows the nickname of the comment actually tapped (`target.user.profile.nickname || 'User'` — note: for an anonymous comment this yields "User", not the alias); show reply bar, resync footer height, focus input. **Cancel** → hide bar, clear `S.pdReplyTo`, blur input (draft kept; it will post as a top-level comment).
- **Anonymity toggle** (`togglePdAnon`): flips `S.pdAnon`, swaps icon `visibility`↔`visibility_off`, colors, and the placeholder ("Commenting anonymously..."). Resets to off after a successful send and whenever a different post is opened. Default off.
- **Image button** → file picker; validation: must be `image/*` (toast "Only images are allowed"), ≤8MB (toast "Image too large (max 8MB)"); shows local preview and grows the footer. Upload is **deferred until send**. Remove button clears it.
- **Send comment** (`submitPdComment`, also Enter key in the input): requires text **or** image (either alone is fine) and a current post; re-entrancy guard `S.pdSending` disables the send button. Snapshot draft; upload image (`POST /uploads/image`) if any; POST comment `{content, anonymous, imageUrl?, parentCommentId?}`; on success clear input, reset anon to off, clear image, cancel reply, reload the whole detail (`loadPostDetail`). On failure restore text/image/anon from the snapshot and toast "Failed: {message|try again}".
- **Long-press a comment** (600ms, touch must stay within 10px, not on a button; also desktop right-click): light haptic (`navigator.vibrate(15)`), open comment action menu at the touch point. **Share comment**: share `{title: post title, text: comment text, url}`; clipboard fallback `"{text}\n— {title} · Unimatcha\n{url}"`. **Like/Unlike comment** (`likePdComment`): POST; update the comment tree in memory and patch the row's icon/count in place (no re-render, scroll preserved); failure toast = server message or "Failed to like". **Report comment**: two-step flow → `POST /reports` (category `content`, see §3).
- **Comment image tap** → full-screen viewer.
- **Chrome auto-hide** as described; focusing the input re-shows chrome.
- **Get Ticket** (`buyEventTicket`): find the event in `S.pdPostData.event` (fallback: any cached list, then `GET /events/:id`); `cells = ceil(priceCents/100)`. If cells>0: refresh the energy balance (`loadEnergyBar` → `GET /energy/balance`), if `availableEnergy < cells` → toast + open energy purchase overlay and stop; else paid confirm card. If free → free confirm card. Then `POST /events/:id/purchase {}`; success toast "Ticket {code} added to My Tickets", refresh energy bar (paid), reload the post detail (updates remaining/sold). Failure: if message matches `/not enough energy/i` → toast + energy overlay; else toast message or "Purchase failed". Backend also enforces max 2 tickets per person, sales closed, ended, sold out.

### New post
- **Open** (`openNewPost`): if the destination would be Campus Wall and the user has no `profile.school` → toast "Add your school in your profile first" and switch to the Profile tab instead. Otherwise reset: images [], board = current page (campus_wall or recommend), origin board remembered, anonymous off, poll off, clear title/content, poll row shown only for Campus Wall, 2 empty poll option inputs, re-render image grid, open overlay.
- **Anonymous switch** → `S.newPostAnonymous`.
- **Poll switch**: on → destination forced to "Campus Wall", options box shown (ensures 2 inputs); off → box hidden and destination restored to the original page.
- **Add option** (max 6; toast "Up to 6 options"), **remove option** (× only visible when >2; toast "At least 2 options" if attempted at 2) — removal re-renders the list with remaining values preserved and placeholders renumbered.
- **Images**: picker (multiple); total >4 → toast "Maximum 4 images" and nothing added; else read as data URLs for previews; remove buttons.
- **Publish** (`submitNewPost`): re-entrancy guard `S.isSubmittingPost` + disabled button; content required (toast "Please write something"); if poll: collect trimmed non-empty options, need ≥2 (toast "A poll needs at least 2 options"), set `postType:'poll'`, `pollOptions`, `board:'campus_wall'`. Upload each image sequentially (`POST /uploads/image`) → `images[]`. `POST /square/v2/posts`. Success toast "Posted!" or "Poll submitted — it goes live after review"; close overlay; clear form; switch the square to the board just posted to (`switchSquareTab`) which reloads only if that page is empty — **note**: because the page usually already has content, the new post appears only after the next refresh (pull-to-refresh / re-tap nav), not immediately. Failure toast "Post failed: {message}".
- Cancel = close overlay; form state is not cleared until next open (title/content persist within the session).

### Tickets
- Open wallet → `GET /events/tickets/mine`, render, generate QR codes. Tap stub → detail overlay with 180px QR. Back closes. Both overlays have `arrow_back` so edge swipe-back works (generic `hideOverlay`).

---

## 3. API calls

All calls go through `window.api(path, method, body)`: base `S.API`, `Authorization: Bearer <localStorage.cl_token>`, JSON, `cache:'no-store'`; non-OK → throws `Error(data.message || 'API {status}')`; **401 → clears token, stops polling/SSE, `cleanupUserState()`, closes all overlays, shows auth page, throws**. Responses may be either the payload or `{data: payload}` — every consumer unwraps with `unwrap(x) = x.data || x`.

| # | Call | When | Request | Response fields used | Notes |
|---|------|------|---------|----------------------|-------|
| 1 | `GET /square/v2/recommend?page=1&limit=20` | enter tab, switch to empty page, PTR, nav re-tap, after publish | query only (limit clamped 1..50 server-side) | `items[]` (card objects, below), ignores `page/limit/total/hasMore` — **H5 never paginates** (only page 1) | Race guard per tab: `S.squareReqSeqs[tab]` sequence; stale responses dropped. Runs in parallel with `GET /ads/feed`. Backend mixes: personal small cards scored (hotness/sameSchool/freshness/taste), 1 official large card after every 5 small cards (pinned-in-metadata officials first), ≤2 "hot" campus-wall cards (likeCount≥10, same school) per page. |
| 2 | `GET /square/v2/campus-wall?page=1&limit=20` | same | — | `items[]`; `needProfileSchool:true` → school gate state | Same-school hard filter; pinned posts excluded from the wall except **event** posts (which stay pinned at the top); only approved posts + the viewer's own pending/rejected polls. |
| 3 | `GET /square/v2/pinned` | same | — | `items[]`, `needProfileSchool` | No pagination; ≤50; ordered by `pinnedOrder asc, pinnedAt desc`; requires school. |
| 4 | `GET /square/v2/search?q=<q>&page=1&limit=20` | search (debounced/enter) | `q` (server trims/collapses whitespace, max 64 chars) | `posts.items[]` (cards, may carry `commentSnippet`) | Response `{query, posts:{items,page,limit,total,hasMore,query,isSearch,needProfileSchool}}`. H5 reads `unwrap(raw.posts)` then `items`. Cross-board; campus-wall results only for the viewer's school; relevance title>tag>content>comment, ×hotness×freshness. |
| 5 | `GET /square/v2/posts/:id` | open detail, after comment send, after ticket purchase | — | full post (below) + `comments[]` + `myLiked` | 404 if hidden/unapproved and not the author. Toast "Failed to load post" on error. |
| 6 | `POST /square/v2/posts/:id/like` | card like, detail like | none | `{liked:boolean, likeCount?, message}` | Server toggles; H5 uses `likeCount` when present (currently the server does **not** return it → local ±1). |
| 7 | `POST /square/v2/posts/:id/vote` | poll option tap | `{optionIndex:int}` | `{pollOptions:[{text,votes}], myVote:int}` | 403 if different school; 400 if not approved/hidden or invalid index. |
| 8 | `POST /square/v2/posts/:id/comments` | send comment | `{content:string (≤500, may be ''), anonymous:boolean, imageUrl?:string, parentCommentId?:string (top-level id)}` | ignored (detail is reloaded) | Server: reply-to-reply is re-parented to the top-level comment; anonymous post author's comments forced anonymous; notifications to post author / replied user. |
| 9 | `POST /square/v2/comments/:id/like` | comment like (row button or menu) | none | `{liked, likeCount}` | |
| 10 | `POST /square/v2/posts/:id/report` | report post | `{reason:string (≤200)}` | ignored | Server de-dupes per user; ≥3 distinct reporters auto-hides the post. |
| 11 | `POST /reports` | report comment | `{category:'content', content:"[comment] commentId=… postId=…\nreason: …\ntext: <first 300 chars>"}` (content ≤2000; optional `contact`) | ignored | No comment-specific endpoint; generic feedback route. |
| 12 | `POST /square/v2/posts` | publish | `{board:'recommend'|'campus_wall', content (≤2000), title? (≤100), images:string[] (≤4 URLs), anonymous:boolean, postType?:'poll', pollOptions?:string[] (2–6, each ≤50)}` | ignored | Campus wall without school → 400 "Please fill in your school…"; poll ⇒ board forced campus_wall, `reviewStatus:'pending'` (only the author sees it until approved). Also exists but unused by H5: `DELETE /square/v2/posts/:id` (author self-delete). |
| 13 | `POST /uploads/image` (multipart `file`) | before #8 (single) / #12 (sequential per image) | file | `data.url` or `url` | Returns absolute https URL. Deferred until send/publish. |
| 14 | `GET /ads/feed?school=<profile.school>&limit=3` | with #1 only, and only if `S.currentUser.profile.school` is set | — | array of `{id,title,content,images[],landingUrl,advertiserName}` | Failure → `[]` silently. Unknown school → `[]`. |
| 15 | `POST /ads/events` `{events:[{campaignId, school, type:'impression'|'click'}]}` | batched every 10s while the queue is non-empty, and on page hide/pagehide (`fetch keepalive`) | ≤100 per request (chunked) | — | 5xx/network → re-queue (queue cap 200); 4xx → drop. |
| 16 | `GET /events/:id` | ticket purchase fallback only (event missing from caches) | — | event incl. `priceCents`, `remaining`, `myTickets` | |
| 17 | `POST /events/:id/purchase` | Get Ticket confirm | `{}` | `{ticketId, code, event{id,title,startAt,venue}, pricePaidCents, cellsPaid}` — H5 uses `code` | Errors: "Ticket sales are closed for this event", "This event has ended", "Ticket limit reached (2 per person)", "Sold out", "Not enough energy, please top up" (energy service). Energy is debited in the same transaction. |
| 18 | `GET /energy/balance` | before a paid ticket confirm; after purchase | — | `availableEnergy` (else `totalEnergy-usedEnergy`) | profile.js. |
| 19 | `GET /events/tickets/mine` | open wallet / retry | — | `{tickets:[{id, code, status:'valid'|'used'|'cancelled', pricePaidCents, usedAt, createdAt, event:{id,title,venue,school,startAt,endAt,status,images}}]}` (newest first) | |
| 20 | `GET /events/tickets/:id/pkpass` | Apple Wallet (disabled) | — | binary | 501 until configured. |

**Card / post object fields consumed by the UI** (from `shapePost` + `shapeCard`; feeds and search return cards, detail returns the same plus comments):
`id`, `board` ('RECOMMEND'|'CAMPUS_WALL'), `authorType` ('USER'|'STUDENT_UNION'|'TEAM'|'SPONSOR'), `cardType` ('large'|'medium'|'small' — H5 ignores it and re-derives), `title?`, `content`, `images[]`, `anonymous`, `isSponsored`, `school?`, `sameSchool`, `likeCount`, `commentCount`, `createdAt`, `tags[]`, `isPinned` (bool; `pinnedAt` is stripped), `isMine`, `postType` ('normal'|'poll'|'event'), `pollOptions?` [{text,votes}], `myVote?` (int|null, only for polls), `reviewStatus` ('approved'|'pending'|'rejected'), `event?` {id,title,venue,school,startAt,endAt,priceCents,capacity,ticketsSold,status}, `authorUser?` {id, profile{nickname,avatarUrl,school}} (null when anonymous), `admin?` {id,name,organizationName,role}, `anonymousAuthor?` {aliasSeed:uint32, nickname (English alias), avatarUrl:null}, `anonymousAuthorToken?` (opaque, anonymous posts only), `authorUserId?` (absent on anonymous posts), `coupleMatchId?` + `match?{userA{profile},userB{profile}}` (legacy couple posts, stacked avatars), `commentSnippet?` (search only), `_count{likes,comments}` (ignored), `myLiked` (detail only). `metadata` is never sent.

**Comment object fields**: `id`, `content`, `imageUrl?`, `anonymous`, `parentCommentId?`, `createdAt`, `likeCount`, `myLiked`, `user{profile{nickname,avatarUrl}}` (no `user.id` ever; for anonymous comments the profile holds the English alias and null avatar), `anonymousAuthor?{aliasSeed,nickname,avatarUrl:null}` (anonymous only), `anonymousAuthorToken?` (only on the anonymous post author's own comments), `userId?` (stripped for anonymous comments), `replies[]` (same shape, one level only).

Polling: none in this module (no auto refresh). Caching: in-memory per-page lists only; nothing persisted except the FAB position.

---

## 4. Client state

In `S` (state.js, mutable global):
- `squareTab`: 'recommend' | 'campus_wall' | 'pinned' (default 'recommend').
- `squarePosts`: pointer to the list currently used for like/vote/detail sync (the active page's list, or the search results while the search page is open).
- `squarePostsByTab`: `{recommend, campus_wall, pinned, search}` → arrays of card objects (created lazily).
- `squareReqSeqs`: `{[tab]: number}` request sequence per page (created lazily; keys must be initialised to 0 — `++undefined` is NaN and would make every load look stale).
- `squareScrollPos`: `{recommend, campus_wall, pinned}` scrollTop memory (reset to 0 on tab entry).
- `squareSearchQuery`, `_squareSearchTimer` (debounce), `_squareSearchSeq`.
- Post detail: `currentPostId`, `pdPostData` (full post incl. comments), `pdReplyTo` `{id: topLevelCommentId, nickname}`, `pdAnon` (comment anonymity, default false), `pdImageFile` (pending comment image File), `pdSending` (guard). Legacy unused: `pdSortMode`, `pdPendingImgs`.
- New post: `newPostImages` [{file, preview}], `newPostBoard`, `newPostBoardOrigin`, `newPostAnonymous`, `newPostPoll`, `isSubmittingPost`.
- Tickets: `myTickets` (array from the wallet fetch; detail reads by index).
- Energy: `energy.availableEnergy` (profile module).
- Legacy: `squareSection`, `squareReqSeq` (unused by v2 code).
- ads.js module-level: event queue, seen-impression set, ads-by-id cache, ad school, session token watcher.

localStorage: `cl_fab_pos` `{x,y}` (FAB position, cross-session), `cl_lang` ('en'|'zh'), `cl_theme`, `cl_token`.

Cleanup on logout / account switch (`cleanupUserState`): resets `currentPostId, pdPostData, pdSortMode, pdReplyTo, pdPendingImgs, newPostImages, squarePosts, squareReqSeq, isSubmittingPost, squareSection, squareTab='recommend', newPostBoard='recommend', newPostAnonymous=false`. **Not** cleared (gotcha — iOS should clear them all): `squarePostsByTab`, `squareScrollPos`, `squareReqSeqs`, `squareSearchQuery`, `pdAnon`, `pdImageFile`, `pdSending`, `newPostPoll`, `myTickets`. Ads state resets itself when the stored token changes (`ensureAdSession`). Rendered feed DOM is also not cleared on logout; it is replaced on the next load.

---

## 5. i18n

Mechanism: English strings in markup/templates; when `cl_lang==='zh'` a MutationObserver translates every text node whose **trimmed whole text** exactly matches a key of the `ZH` dictionary, and translates `placeholder` attributes via `ZH_PLACEHOLDER`. Anything inside an element with `data-no-i18n` is skipped (all user content: names, titles, bodies, snippets, poll labels, times, alias avatars). Strings containing numbers/dynamic parts are produced directly in the right language at render time (`getLang()==='zh' ? … : …`) and marked `data-no-i18n`. Switching language reloads the page. `metaLabel(school)` maps English school/city/major names to Chinese for display only (values stay English).

Dictionary strings used by this module (en → zh):
- Nav/header: Square→广场; Recommend→推荐; Campus Wall→校园墙; Pinned→置顶; Search→搜索.
- Feed states: Failed to load posts→帖子加载失败; Check your connection and try again→请检查网络后重试; Retry→重试; No posts yet→还没有帖子; Be the first to share a moment→来发布第一条动态吧; Nothing pinned yet→还没有置顶内容; Your student union pins important notices here→学生会会把重要通知置顶在这里; Add your school to view the campus wall→填写学校后解锁校园墙; Set your school in your profile to unlock it→在资料中填写学校即可查看本校动态; Complete profile→去完善资料.
- Search: Search the square→搜索广场; Find posts by title, content or tag→按标题、正文或标签搜索帖子; No posts found→没有找到帖子; Try a different keyword→换个关键词试试; Loading...→加载中…; placeholder Search posts→搜索帖子; COMMENT→评论.
- Badges: PINNED→置顶; Sponsored→赞助; Student Union→学生会; Official Team→官方团队; Official→官方. (The "Student Union · Org" composite is not translated — it contains the org name.)
- Poll/event: UNDER REVIEW→审核中; REJECTED→已驳回; Free→免费; Sold out→已售罄; Sales closed→停止售票; Event ended→活动已结束; Get Ticket→购票; Not enough energy — top up→能量不足，请先充值. Render-time: "{n} 格能量" vs "{n} energy cell(s)"; "{n} vote(s) · tap to change" is **English only**; "EVENT" chip is not translated; "{remaining} left · {sold} sold" English only.
- Detail: Observations→评论; Reply→回复; No observations yet. Share the first one.→还没有评论，来抢沙发。; Cancel→取消; placeholders Add an observation...→写下你的评论…, Commenting anonymously...→正在匿名评论…. Render-time: Author/作者; "· long-press for options"/"· 长按更多操作"; menus Share/分享, Report post/举报帖子, Like/点赞, Unlike/取消点赞, Report/举报; "Replying to {name}" English only; report cards (see §1.5); share toasts Copied to clipboard/已复制到剪贴板, Share failed/分享失败; report toasts (see §1.5). "Failed to like post", "Failed to like", "Failed: …", "Only images are allowed", "Image too large (max 8MB)", "Failed to load post", "Vote failed" — English only.
- New post: Publish→发布; Cancel→取消; Posting to→发布到 (Recommend/Campus Wall labels translate via dictionary); Post anonymously→匿名发布; Create a poll→发起投票; Goes live after review→审核通过后展示; + Add option→+ 添加选项; placeholders Title→标题, Capture the moment...→记录此刻…, Option 1..6→选项 1..6; Up to 6 options→最多 6 个选项; At least 2 options→至少保留 2 个选项; A poll needs at least 2 options→投票至少需要 2 个选项. English only: "Please write something", "Maximum 4 images", "Posted!", "Poll submitted — it goes live after review", "Post failed: …", "Add your school in your profile first".
- Tickets: My Tickets→我的票夹; Ticket→门票; No tickets yet→还没有门票; Tickets you get for campus events appear here.→购买的校园活动门票会出现在这里。; Tap to open→点击查看; TICKET CODE→票码; VALID→有效; USED→已使用; CANCELLED→已作废; Show this QR at the entrance→入场时出示此二维码; Add to Apple Wallet→添加到 Apple Wallet. Render-time: DATE/日期, TIME/时间, VENUE/地点, "This ticket has been used"/"此票已使用", "{n} cells"/"{n} 格能量". English only: "Loading…", "Failed to load tickets", "Ticket {code} added to My Tickets", "UNIMATCHA · TICKET".
- Relative time `formatPostTime`: <1min "Just now"/"刚刚"; <1h "{n}M Ago"/"{n} 分钟前"; <24h "{n}H Ago"/"{n} 小时前"; <7d "{n}D Ago"/"{n} 天前"; else locale date (zh-CN vs default).
- Alias names (anonymous authors/commenters), derived from `aliasSeed` (uint32): `adj = ADJ[seed % 16]`, `animal = ANI[(seed >>> 8) % 16]`; en = "{Adj} {Animal}", zh = "{形容词}{动物}" (no space). Avatar: `emoji = EMOJI[(seed >>> 8) % 16]` (same index as the animal), `bg = BG[(seed >>> 16) % 16]`.
  - ADJ en: Curious, Quiet, Brave, Gentle, Witty, Clever, Mellow, Swift, Cozy, Bold, Sunny, Lucky, Calm, Eager, Noble, Jolly. zh: 好奇的, 安静的, 勇敢的, 温柔的, 机灵的, 聪明的, 慵懒的, 敏捷的, 暖心的, 大胆的, 开朗的, 幸运的, 淡定的, 热心的, 优雅的, 欢快的.
  - ANI en: Otter, Fox, Sparrow, Koala, Panda, Lynx, Heron, Robin, Wren, Bear, Finch, Hare, Seal, Crane, Marten, Quokka. zh: 水獭, 狐狸, 麻雀, 考拉, 熊猫, 山猫, 白鹭, 知更鸟, 云雀, 小熊, 金翅雀, 野兔, 海豹, 仙鹤, 松貂, 小袋鼠.
  - EMOJI: 🦦 🦊 🐦 🐨 🐼 🐆 🦩 🐤 🕊️ 🐻 🦜 🐰 🦭 🦢 🦡 🦘. BG: #FDE68A #BFDBFE #FBCFE8 #BBF7D0 #DDD6FE #FED7AA #A5F3FC #E9D5FF #FEF08A #C7D2FE #FECACA #D9F99D #99F6E4 #F5D0FE #BAE6FD #FDBA74.
  - The server's `anonymousAuthor.nickname` is the same English alias computed with identical tables; iOS should compute from `aliasSeed` for language switching and use `nickname` only as a fallback.

---

## 6. Cross-module links

Calls out of this module:
- core.js: `api`, `uploadImageFile`, `openOverlay/closeOverlay/hideOverlay`, `closeAllOverlays`, `switchTab('profile')`, `confirmCard`, `promptCard`, `toast`, `escapeHtml`, `safeUrl` (sanitises every image URL: blocks javascript:/vbscript:/file:/blob:/non-image data: and escapes quotes), `flatEmptyIcon`, `readFileAsDataUrl`, `attachPullToRefresh` (bound in main.js), `bindNavAutoHide` (main.js), edge swipe-back registry `SWIPE_BACK_CLOSE` (post detail → `closePostDetail`, search → `closeSquareSearch`).
- i18n.js: `getLang`, `aliasName`, `aliasAvatarHtml`, `metaLabel`, `translatePlaceholders`.
- ads.js: `fetchSquareAds`, `adLargeCard`, `observeAdImpressions` (+ its own `onAdClick`, `showAdDetail`, `closeAdDetail`, event batching).
- profile.js: `loadEnergyBar`, `openEnergyModal` (ticket purchase), and the wallet code (`openTickets`, `loadMyTickets`, `openTicketDetail`, `closeTicketDetail`, `addTicketToWallet`).
- chat.js: `openChatImage` (comment images use the chat image viewer).
- state.js `S.currentUser.profile.school` (ads targeting, campus-wall gating), `S.energy`.
- External libs: `qrcodejs` (`window.QRCode`, `CorrectLevel.M`) for ticket QR.

Calls into this module from elsewhere:
- core.js `switchTab('square')` → `loadSquareTab()` / `loadSquareTab2(S.squareTab)`; `cleanupUserState` resets square fields; 401 path closes overlays.
- main.js: PTR binding `attachPullToRefresh(#tab-square, () => loadSquareTab2(), 'main')`; Enter key on `#comment-input` → `submitPdComment`; `#post-image-input` change → `handlePostImages` (index.html also has an inline `onchange`, so the handler fires twice per selection; the first call clears `input.value`, so the second sees an empty FileList and is a no-op — iOS: bind once).
- profile.js menu row → `openTickets()`.
- notifications.js and chat.js reuse `window.formatPostTime` for relative timestamps (notifications do **not** deep-link into post detail in the current H5); `window.postAuthorDisplay` / `window.renderAuthorAvatars` are exported but have no external callers today.
- Alias `window.loadSquarePosts = loadSquareTab2` kept for back-compat.

---

## 7. Gotchas (must-know for a faithful iOS port)

1. **Anonymity is per item and privacy-critical.** Posts: `anonymous:true` ⇒ server sends `authorUser:null`, no `authorUserId`, an `anonymousAuthor{aliasSeed,nickname}` and an `anonymousAuthorToken`. School shown for anonymous posts must come from `post.school` only. Comments: each comment has its own `anonymous`; anonymous comments carry `anonymousAuthor.aliasSeed` and no `userId`. The "Author" tag on comments is decided by token equality on anonymous posts and by `userId === authorUserId` on normal posts — never mix. The anonymous post author's own comments are forced anonymous by the server. Aliases are per-post (same person = different alias on different posts) and language-dependent; the same seed must give the same animal/emoji/colour in both languages.
2. **Comment anonymity toggle resets** to off after every send and whenever another post is opened; the placeholder text must change with it ("Commenting anonymously...") — icon colour alone is not enough.
3. **Reply threading is two levels only.** Always send the top-level comment id as `parentCommentId`; the server re-parents deeper replies anyway. The reply label uses the tapped comment's nickname (which is "User" for anonymous comments in the current H5 — iOS may use the alias instead).
4. **Comment images upload only at send time**; text or image alone is enough to send; draft (text, image, anon flag) is restored on failure. Send is guarded against double-tap.
5. **Ticket pricing**: `priceCents` numerically equals energy units; user pays `ceil(priceCents/100)` cells; free when 0. Always refresh the balance before the confirm card; never charge silently; handle "Not enough energy" both before and after the request (race). Max 2 tickets per person is server-enforced. QR content = ticket `code` (format `UMT-XXXXXXXXXX`).
6. **Polls**: only on Campus Wall; creating a poll forces the destination; created posts are `pending` and visible only to the author (with an "UNDER REVIEW" chip) until approved; votes allowed only when approved and only for same-school users; a user can change their vote; `pollOptions[].votes` come precomputed.
7. **Feed rules**: H5 fetches only page 1 (limit 20) of each feed and never loads more; the pinned feed is unpaginated. Campus-wall board posts always render as the wide card even inside Recommend. Official (non-USER) posts always render as the large card. Ads only on Recommend and only when the user has a school; first ad after the 3rd card (or appended at the end if fewer than 3 posts), then one after every 8 small cards; each ad used at most once per render; impression counted at ≥50% visibility once per session; click events also queued; events flushed every 10s and on background.
8. **Pinned page**: appears only from Campus Wall (segment slides in), swipe order recommend→campus_wall→pinned with no page skipping, FAB hidden there, pinned badges hidden there, one font step smaller.
9. **Three pages keep independent scroll offsets** and all reset on entering the tab; switching pages does not refetch unless the page is empty; pull-to-refresh and nav re-tap refresh only the current page.
10. **Masonry**: 6px gaps, shorter-column placement, hole backfill under full-width items, re-layout on any size change (images, fonts, language). Text-only small card = ivory 3:4 tile with neon highlighter on the first ≤6 CJK / ≤12 Latin characters (split at punctuation/whitespace).
11. **Card content**: cards show title (or first 60 chars of content), author avatar (16px)+name, like count — no time, no school (school only in the detail header). Wide cards additionally show time, content, comment count.
12. **Like responses** may lack `likeCount` → derive locally; sync the same post across recommend / campus wall / pinned / search caches and the open detail; after loading a detail, push its authoritative like/comment counts back to the list card.
13. **Post detail chrome auto-hide** (header+footer slide away on scroll down, back on scroll up / near top / input focus). Footer bottom inset = safe-area + 8px; scroll content padded by the measured footer height.
14. **Report flow is two-step** (confirm with danger styling → optional reason) for both posts and comments; comment reports go to the generic `/reports` endpoint with a structured text body.
15. **New post gating**: Campus Wall requires `profile.school` (checked client-side before opening, and server returns 400 otherwise). Max 4 images, uploaded sequentially before creating the post. After publishing, the H5 switches to the target board but the new post only shows after a refresh unless that page was empty.
16. **Search** is a separate full-screen page; results never replace the feeds; search covers both boards; comment-snippet rows explain hits found via comments; the header search icon does not show an "active filter" state any more.
17. **Time strings and counts are English-formatted** in several places even in zh (vote line, "left/sold", "Replying to", success toasts) — decide whether to localise them properly on iOS.
18. **Alias/ad/energy secrets**: aliases cannot be reversed client-side (HMAC on server); never display `user.id`; sponsored posts show a "Sponsored" badge; official posts a "Student Union · Org"/"Official Team · Org"/"Official" badge.
19. **Safe areas**: square header = 44px + top inset; overlay headers = 64px + top inset; toast/PTR indicator start below the top inset; FAB clamp uses the header bottom + 8px; post-detail footer = bottom inset + 8px.
20. **Existing iOS code (apps/ios) is far behind**: `Square.swift` models lack `postType/pollOptions/myVote/reviewStatus/event/isPinned/anonymousAuthorToken/aliasSeed/commentSnippet`, comment `anonymous/likeCount/myLiked/anonymousAuthor`; `SquareService` has recommend/campus-wall/detail/create/like/comment/report/delete only (no pinned, search, vote, comment like, events/tickets, ads); `CreateCommentRequest` lacks `anonymous`. Views (`SquareTabView`, `PostDetailView`, `CreatePostView`) predate the three-page pager, masonry, highlighter cards, polls, events, tickets, search, per-comment anonymity, long-press menus and chrome auto-hide — treat them as scaffolding to replace, reusing only the networking/model plumbing.
