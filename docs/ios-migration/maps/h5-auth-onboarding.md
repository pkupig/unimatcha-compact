# H5 module map — `auth-onboarding` (splash → auth → banned → profile setup → home routing)

Source of truth (all paths absolute):

| Concern | File |
|---|---|
| Login / register / send-code / logout / change-password / verification-apply / auth tab switch | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/auth.js` (206 lines) |
| Boot, `api()` helper, 401 handling, SSE start/stop, `cleanupUserState`, `checkUserState`, `showPage`, `switchTab`, `hideSplash`, `toast`, `confirmCard`, `promptCard`, `codeCooldown`, edge swipe-back | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/core.js` |
| Profile setup wizard + optional form + `saveProfile` + avatar upload + metadata dropdowns | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/profile.js` lines 1–407 and the `showPage` hook at 1567–1573 |
| Shared state object `S` | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/state.js` |
| Module import order + DOMContentLoaded bootstrap | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/main.js` |
| Markup (splash `#splash`, `#page-auth`, `#page-banned`, `#page-profile-setup`, `#questionnaire-cards`, `#content-overlay`, `#toast`) | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` lines 196–600, 1731–1741, 184 |
| Custom CSS (`.page`, `#splash*`, `.auth-form`, `.auth-container`, `.btn-cta`, `.btn-secondary`, `.tag-chip`, `#toast`, safe-area rules, dark overrides) | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/styles/main.css` |
| Bilingual dictionary + MutationObserver translator + `getLang` | `/Users/aimi/Downloads/unimatcha-compact/apps/h5/src/modules/i18n.js` |
| Backend contracts referenced | `/Users/aimi/Downloads/unimatcha-compact/apps/api/src/auth/{auth.controller,auth.service}.ts`, `auth/dto/auth.dto.ts`, `users/users.service.ts` (`findById`), `profiles/{profiles.controller,profiles.service}.ts`, `profiles/dto/profile.dto.ts`, `uploads/uploads.controller.ts`, `metadata/metadata.controller.ts`, `common/interceptors/transform.interceptor.ts`, `common/filters/http-exception.filter.ts`, `public/public-rate-limit.guard.ts`, `auth/strategies/jwt.strategy.ts` |

---

## 0. Design tokens used by this module (from `index.html` Tailwind config + `main.css`)

Light theme is the default; dark mode is an `html.dark` class toggled from Settings (stored in `localStorage.cl_theme`).

| Token | Light | Dark override (`.dark` rules in main.css) |
|---|---|---|
| `background` / `surface` / `.page` bg | `#f9f9f9` | `#121110` |
| `surface-container-lowest` (cards, avatar placeholder) | `#ffffff` | `#1c1b19` |
| `surface-container-low` (all text inputs, selects) | `#f3f3f3` | `#23211f` |
| `surface-container-highest` (wizard progress track) | `#e2e2e2` | `#363431` |
| `on-surface` (primary text) / `primary` | `#1b1b1b` / `#000000` | `#eceae6` |
| `on-surface-variant` (secondary text) | `#474747` | `#aaa8a3` |
| `outline` (labels, icons) / `outline-variant` (borders, placeholders) | `#777777` / `#c6c6c6` | `#8c8a85` / borders `#343230` |
| `neon` (brand accent, CTA fill, progress fill, selected segment) | `#CCFF00` (text on it always black, even in dark) | same |
| `neon-pink` (danger: required asterisk, Log Out on banned page, danger confirm button) | `#FF2EC4` | same |
| Input text color in dark | — | `#eceae6` |

Typography: everything is **Plus Jakarta Sans** (fallback PingFang SC / Noto Sans SC / system). Weights used here: 800 (extrabold) for titles, 700 for labels/buttons, 400 body. Letter-spacing is a big part of the look: labels use `tracking-[0.15em]`–`[0.2em]`, CTA `tracking-[0.3em]` or `0.1em`, tab labels `0.2em`.

Corner radius: **10px everywhere** (Tailwind `rounded-*` of every size is remapped to 10px; only `rounded-full` is a circle).

Icons: Google **Material Symbols Rounded**, weight 300, FILL 0, optical size 24, default 24px. The CSS class is still named `material-symbols-outlined` but the font family is forced to Rounded. Icon names used in this module: `mail`, `lock`, `pin`, `block`, `arrow_back`, `add_a_photo`, `expand_more`, `auto_awesome`, `group`, `check_circle`.

Buttons (main.css):
- `.btn-cta` — full-width block, bg `#CCFF00`, black text, no border, radius 10, padding `20px 24px` (py-5), font 700 / 14px / tracking 0.1em; `:active` scale 0.98; `:disabled` opacity 0.5.
- `.btn-secondary` — inline-flex, transparent bg, 1px black border, black text, radius 10, padding `12px 24px`, font 700 / 12px / tracking 0.1em; `:disabled` opacity 0.5. Dark: text `#eceae6`, border `rgba(255,255,255,.28)`. (The register "Send code" button overrides padding to `px-3 py-2` and font to 10px.)

Safe area (`main.css`): `:root{--sat: env(safe-area-inset-top); --sab: env(safe-area-inset-bottom)}`. Rules that affect this module: `.fixed.top-0 { padding-top: env(safe-area-inset-top) }`, `.fixed.top-0.h-16 { height: calc(4rem + safe-top) }`, `.fixed.top-0 ~ main { margin-top: safe-top }`, `#splash-skip { top: calc(2rem + safe-top) }`, `#toast { top: calc(16px + safe-top) }`. iOS meta is `apple-mobile-web-app-status-bar-style=black-translucent` + `viewport-fit=cover`, i.e. content extends under the status bar and each fixed header compensates itself.

Page container (`.page`): `position:fixed; inset:0; z-index:40; display:flex; flex-direction:column; background:#f9f9f9; min-height:100vh; overflow-y:auto`. Only the page with class `active` is `display:flex`. `body` is `overflow:hidden` — **each page scrolls internally**, never the window.

---

## 1. Screens & states

### 1.1 Splash (`#splash`)

- **Entered**: on every cold load (it is in the static HTML, above everything, `z-index:9999`). Not user-triggerable later.
- **Exited**: `hideSplash()` — called by (a) a 3000 ms timer set in `main.js` `DOMContentLoaded`, or (b) tapping **Skip**. `hideSplash` adds class `.hide` (opacity → 0 over 0.6 s, `pointer-events:none`), then after 600 ms sets `display:none` **and calls `checkUserState()`** — the splash is what kicks off routing.
- **Layout** (full-screen, bg `background`, flex column centered):
  - Top-right **Skip** button: absolute `top: calc(2rem + safe-top)`, `right: 2rem`, text 10px bold uppercase `tracking-[0.3em]`, color `outline` (`#777`). Text "Skip" (no zh entry → shows "Skip" in both languages).
  - Center brand block (`.splash-in`: 0.7 s ease-out fade+rise 14px):
    - App icon `/icons/icon-192.png` rendered 76×76, radius 22px, margin-bottom 32px, `.splash-logo` floats up/down 6px over 2.6 s loop.
    - `UNIMATCHA` — 34px, weight 800, `tracking-[0.18em]`, color primary (black), `data-no-i18n`.
    - Tagline 13px, `on-surface-variant`, `tracking-wide`, margin-top 16px: "One thoughtful match, every week." / zh "每周一次，用心匹配。"
  - Bottom block (absolute `bottom: 4rem`, centered, gap 20px): progress line `.splash-bar` 120×3px radius 2 bg `#e6e6e6` (dark `#343230`) with a 40%-wide `#CCFF00` fill sliding left→right on a 1.4 s loop (indeterminate); below it `BETA` 9px bold uppercase `tracking-[0.35em]` color outline, `data-no-i18n`.
- **Boot watchdog** (inline script in `<head>`, web-only; iOS does not need it): if a JS/CSS asset fails or `window.__appBooted` is not set within 7 s, reload once (`sessionStorage.cl_boot_retry`); version-drift check compares the served `index.html` bundle hash. `main.js` sets `window.__appBooted = true` on import. (`showFallback()` references `#splash-fallback`, which does not exist in the markup — a no-op.)

### 1.2 Auth page (`#page-auth`) — Sign In / Register

- **Entered**: `showPage('page-auth')` from: `checkUserState()` when there is no token or `/users/me` fails; `api()` on any HTTP 401; `doLogout()`; the Profile Setup header back arrow (`onclick="showPage('page-auth')"` — note this does **not** clear the token; see Gotchas).
- **Exited**: successful `doLogin()` → `checkUserState()`; successful `doRegister()` → `showPage('page-profile-setup')`.
- **Structure** (page is a flex column):
  - `<main>` `flex-grow`, flex centered, `px-6 py-12`, `relative overflow-hidden`.
    - Decorative background: absolute bottom, full width, height 256px (`h-64`), `opacity-10`, `pointer-events:none`, `<img src="/login_bg.png">` (asset at `/Users/aimi/Downloads/unimatcha-compact/apps/h5/public/login_bg.png`, 706×1600 PNG, a minimalist campus-library line sketch) with `object-cover object-bottom`.
    - `.auth-container` (max-width 420px, full width, above the sketch):
      - **Tab switcher** `<nav>`: centered row, `space-x-12` (48px gap), `mb-16` (64px below). Two text buttons, 12px bold `tracking-[0.2em]`, `pb-2`, 2px bottom border. Active: text `primary` + border `primary`. Inactive: text `on-surface-variant`, border transparent, hover → primary. Labels: **Sign In** (登录) / **Register** (注册). Default active = Sign In.
      - **Sign In form** `#signin-form.auth-form.active` (`space-y-12` = 48px between blocks). `.auth-form{display:none}` / `.auth-form.active{display:block}`:
        1. Header centered, `space-y-2`: `h2` "Welcome Back" (欢迎回来) 30px (`text-3xl`) weight 800 `tracking-tighter` primary; `p` "Enter your academic credentials" (输入你的账号信息) 14px on-surface-variant tracking-wide.
        2. Fields block `space-y-8` (32px):
           - Field pattern (used by every auth input): `label` 10px bold `tracking-[0.15em]` color outline, `mb-1`; row `flex items-center space-x-3`: leading icon (`material-symbols-outlined`, color outline, turns primary when the group has focus) + `input` full width, 16px body text, bg `surface-container-low`, radius 10, no border, `px-3 py-2.5`, placeholder color outline-variant, focus ring 1px neon.
           - "Email Address" (邮箱地址), icon `mail`, `#login-email`, `type=email`, placeholder `student@campus.edu`.
           - "Password" (密码), icon `lock`, `#login-password`, `type=password`, placeholder `••••••••`.
           - Right-aligned text button "Forgot Password?" (忘记密码？) 10px bold tracking-widest outline color — **has no handler; dead button** (nothing in any module handles it).
           - `.btn-cta` "Sign In" (登录) → `doLogin()`.
      - **Register form** `#register-form.auth-form` (hidden by default), same `space-y-12`:
        1. Header: "Join Unimatcha" (加入 Unimatcha) / "Create your academic profile" (创建你的账号).
        2. Fields `space-y-8`:
           - "Email Address" `#register-email` (`mail`, `type=email`, placeholder `student@campus.edu`).
           - "Verification Code" (验证码), icon `pin`: row = `#register-code` input (`type=text inputmode=numeric maxlength=6 autocomplete=one-time-code`, placeholder "6-digit code" / zh "6 位验证码") + `#register-sendcode-btn` (`.btn-secondary text-[10px] px-3 py-2 whitespace-nowrap shrink-0`) label "Send code" (发验证码). Below the row: `#register-code-hint` `<p>` 10px on-surface-variant `mt-1.5`, hidden until a code is sent (see 2.2 for its text).
           - "Password" `#register-password` (`lock`, password, `••••••••`).
           - "Confirm Password" (确认密码) `#register-password-confirm` (`lock`, password).
           - `.btn-cta` "Register" (注册) → `doRegister()`.
  - `<footer>` full width, `py-8 px-6`, flex column centered, `space-y-4`, z-20:
    - Row: link "Terms of Service" (用户协议) · `/` · "Privacy Policy" (隐私政策) — 10px bold tracking-widest on-surface-variant; each opens `openContentPage('terms'|'privacy')` (settings.js) → `#content-overlay` full-screen overlay (z-60, bg surface, fixed 64px header with `arrow_back` + title, scrollable body, bilingual content chosen by `getLang()`).
    - `© 2026 Unimatcha. All Rights Reserved.` 9px `tracking-[0.1em]` outline-variant.
- **State notes**: no loading indicator/disabled state on Sign In / Register buttons (double-tap sends two requests). Inputs are never cleared on logout or tab switch (values persist for the session, including the password field). The code hint is not cleared when switching tabs.

### 1.3 Banned page (`#page-banned`)

- **Entered**: `checkUserState()` when `/users/me` returns `status === 'BANNED'` (also calls `closeAllOverlays()` first). Note login itself returns 401 for banned users ("Your account has been banned, please contact support"), and the JWT strategy rejects banned tokens with 401 — so in practice this page shows when a user was banned while holding a token and the `/users/me` call still succeeded; a subsequent 401 from any call will bounce to auth anyway.
- **Layout**: same shell as auth (main flex-grow centered `px-6 py-12`, `.auth-container`), centered column `space-y-8`:
  - 80×80 circle, 2px border `outline`, centered icon `block` at `text-4xl` (36px) color on-surface-variant.
  - `space-y-3`: `h2` "Account Suspended" 24px weight 800 tracking-tighter primary; `p` 14px on-surface-variant leading-relaxed `max-w-xs`: "Your account has been disabled for violating the community guidelines. If you believe this is a mistake, please contact support." (**no zh translation exists** — shown in English in both languages).
  - Button full width, transparent bg, 2px `neon-pink` border, `neon-pink` text, `py-5`, radius 10, 10px bold `tracking-[0.3em]`, hover fills pink with black text, active scale 0.95: "Log Out" (退出登录) → `doLogout()`.
  - Footer with only the © line.

### 1.4 Profile Setup page (`#page-profile-setup`)

- **Entered**: `showPage('page-profile-setup')` from `doRegister()` success, or from `checkUserState()` when `hasProfile` is false. A wrapper installed by profile.js (`setTimeout(…,0)` after load) makes `showPage` call `initProfileSetupPage()` whenever the id is `page-profile-setup` (see 2.4 for what init does).
- **Exited**: `saveProfile()` success → `S.homeView='chat'; switchTab('match'); renderQuestionnaireCards()` (home + the two-card questionnaire overlay); header back arrow → `showPage('page-auth')`.
- **Header**: `fixed top-0` full width z-50, `h-16` (64px + safe-top), `px-6`, `bg-surface/80 backdrop-blur-xl`, bottom border `outline-variant/20`. Left: back button (`p-2 -ml-2`, icon `arrow_back` on-surface) → auth page. Center: title "Profile Setup" (完善资料) 16px bold tracking-tight. Right: 40px spacer for symmetry.
- **Main**: `pt-24 pb-12 px-6 max-w-2xl mx-auto` (+ safe-top margin from the `.fixed.top-0 ~ main` rule). Two mutually exclusive blocks:

**(a) Required-field wizard `#setup-wizard`** (visible first; 4 steps, one field per screen)

- Progress row `mb-12 flex items-center gap-4`: `#setup-step-num` "1 / 4" (12px weight 800 `tracking-[0.2em]` outline) + track `flex-1 h-[2px] bg-surface-container-highest` with `#setup-step-bar` fill `bg-neon`, width = `(step+1)*25%`, `transition 300ms`.
- Each `.setup-step[data-step=N]` (only the current one is not `hidden`): `h2` 24px weight 800 tracking-tight `mb-2`; `p` 14px on-surface-variant `mb-10`; field `label` 10px bold `tracking-[0.2em]` on-surface-variant `mb-2` with a `neon-pink` `*`; input(s) 18px body text (`text-lg`), bg surface-container-low, radius 10, `px-3 py-2.5`, focus ring neon.
  - Step 0 — "What should we call you?" / "Your nickname is what others see." / label "Nickname" / `#setup-nickname` placeholder "The Scholar" (zh placeholder "你的昵称").
  - Step 1 — "Your real name" / "Only shown to confirmed partners." / label "Real name" / 2-col grid gap-4: `#setup-givenname` placeholder "Given name (名)" (zh "名"), `#setup-familyname` "Family name (姓)" (zh "姓").
  - Step 2 — "How do you identify?" / "Used for matching. Not shown publicly." / label "Gender" (`mb-4`) / 2×2 grid gap-2 of `.gender-btn` (`py-4 px-4`, radius 10, 1px outline-variant border, 14px `tracking-wider`, hover bg neon): `data-gender` = `male` "Male", `female` "Female", `non_binary` "Non-Binary", `other` "Other". Selected style = `bg-neon text-black` no border, `data-selected="true"`.
  - Step 3 — "When were you born?" / "We show your age, never your birthday." / label "Birthday" / `#setup-birthday` native `type=date`, `min` = today − 40 years, `max` = today − 16 years (set by `fillSetupBirthday`), `appearance-none cursor-pointer`.
- Nav row `mt-14 flex items-center gap-4`: `#setup-prev-btn` "Back" (hidden on step 0; text button `px-6 py-4` 12px bold tracking-widest on-surface-variant) + `#setup-next-btn` `.btn-cta flex-1` label "Next" on steps 0–2, "Continue" on step 3.

**(b) Optional details form `#setup-rest`** (`hidden` until the wizard finishes; `space-y-16` = 64px between sections). Wizard block gets `hidden` and the page scrolls to top.

1. **Avatar** section (column centered): `#setup-avatar` 128×128 circle, 2px dashed `outline-variant` border, bg surface-container-lowest, hover border primary; inside: icon `add_a_photo` at `text-3xl` (30px) + "Upload" 10px bold tracking-tighter, both on-surface-variant. Tap → hidden `<input type=file accept="image/*" id="avatar-file-input">`. Caption `mt-4` 12px tracking-widest on-surface-variant: "Your Academic Identity" (你的头像).
2. **Basic Info** section (`space-y-10`): section header row = `h2` 20px bold tracking-tight + a hairline (`h-px bg-outline-variant opacity-30 flex-grow ml-6`) baseline-aligned. Fields `space-y-8`, each with the 10px `tracking-[0.2em]` label:
   - "University / School" `#setup-school` — `<select>`: **underline style** (transparent bg, only a 1px bottom border `outline`, focus 2px primary), `py-3 px-0`, 18px, `appearance-none`. First option = placeholder "Select Institution" (选择学校), value "".
   - "City" `#setup-city` (placeholder "Select City" 选择城市), "Major" `#setup-major` ("Select Major" 选择专业), "MBTI" `#setup-mbti` ("Select MBTI" 选择 MBTI), "Nationality" `#setup-nationality` ("Select Nationality" 选择国籍) — same underline select.
   - "Looking For" (想认识) label `mb-4`: 3-col grid gap-2 of `.genderpref-btn` (`py-3 px-4`): `male` "Men", `female` "Women", `any` "Anyone" — **"Anyone" is pre-selected** (`bg-neon text-black`, `data-selected="true"`).
   - "Academic Year" (学业阶段) label `mb-4`: `#setup-grade` `<select>` in the **filled** style (bg surface-container-low, radius 10, `py-2.5 px-3 pr-8`, 14px medium, truncate) with an absolutely positioned `expand_more` icon (18px, right 8px, outline color). Options injected from `GRADE_OPTIONS` = `Foundation, Year 1, Year 2, Year 3, Year 4, Master's, PhD Year 1, PhD Year 2, PhD Year 3, PhD Year 4+` (placeholder "Select Grade" 选择年级).
3. **Interests** section (`space-y-10`): header "Interests" (兴趣); `#setup-tags-list` flex-wrap gap-2 of selected chips (`.tag-chip` inline-flex, radius 10, padding `4px 12px`, 12px bold `tracking-[0.08em]`, inline style bg `#CCFF00` / text black / border `#CCFF00`; trailing `×` `.tag-remove` weight 400 opacity .7 → `removeSetupTag(i)`); suggestion row of 4 outlined chip buttons (`px-4 py-2` radius 10 border outline-variant 12px tracking-widest): "Linguistics", "Philosophy", "Digital Art", "Architecture" → `addSetupTagValue(label)`; input row `flex items-end gap-3`: `#setup-tag-input` (filled style, 14px, placeholder "Add new interest..." zh "添加兴趣…", `enterkeyhint=done`, Enter → `addSetupTag()`) + "Add" (添加) button (`px-5 py-2.5` bg neon black 12px bold tracking-widest).
4. **Bio** section: header "Bio" (个人简介); label "Academic Manifesto" (关于我); `#setup-bio` textarea `rows=4 maxlength=250`, bg surface-container-low, radius 10, `p-6`, 14px leading-relaxed **italic**, placeholder (outline color) "Briefly describe your academic pursuits..." (no zh placeholder entry); counter right-aligned 10px tracking-widest on-surface-variant: `<span id="setup-bio-count">0</span> / 250 characters` (live-updated).
5. **Final** section `pt-8 pb-12`: full-width button bg neon black text `py-5` radius 10 weight 800 14px `tracking-[0.3em]` "Confirm Profile" (完成资料) → `saveProfile()`; below, centered 10px outline tracking-widest: "By continuing, you agree to the Academic Code of Conduct." (继续即表示你同意社区行为准则。)

No fixed footer; the whole page scrolls (`.page` overflow-y auto). Keyboard: web-native; no special handling.

### 1.5 Post-setup overlay: `#questionnaire-cards` (rendered by questionnaire.js, opened by this module's `saveProfile`)

Centered modal over `bg-black/40 backdrop-blur-sm`, z-60, `px-6`: white card `max-w-md` radius 10. Header centered `px-6 pt-7 pb-4`: "Complete Your Match Profile" (完善匹配资料) 20px 800; sub 12px "Complete a questionnaire to unlock that mode." (完成问卷即可解锁对应模式的匹配。). Two rows (`border border-black` radius 10 `p-4`, `space-y-3`): icon `auto_awesome` + "Romantic Questionnaire" (恋人问卷) / icon `group` + "Friend Questionnaire" (朋友问卷); right side: hidden `check_circle` (shown when completed) + button `bg-neon` 11px bold tracking-widest "Start" (开始) or "Retake" (重新填写) → `startQuestionnaire(mode)`. Bottom full-width outlined button "Maybe Later" (稍后再说) 10px `tracking-[0.2em]` → closes. Completion comes from `GET /questionnaire/completion` (`{romantic:{completed}, friend:{completed}}`); both cards reset to un-ticked before the fetch. Both questionnaires are **optional** (G rule).

### 1.6 Shared primitives this module relies on (core.js)

- **Toast** `#toast`: fixed, `top: calc(16px + safe-top)`, horizontally centered, z-999, black bg, white 14px text, padding `12px 24px`, radius 10, shadow; shown for 3000 ms with a 0.3 s slide-down. Single instance (a new toast replaces the text and restarts the timer). All validation feedback in this module is toast-only (no inline field errors).
- **confirmCard** `{title, body?, confirmLabel, cancelLabel='Cancel', danger}` → `Promise<true|false|null>`: full-screen backdrop `bg-black/40 backdrop-blur-[2px]` z-120, card `max-w-sm` bg surface-container-lowest radius 10 shadow `p-6`; title 18px 800; optional body 14px; two equal buttons `py-3` radius 10 12px bold tracking-widest — cancel outlined (`border-outline-variant`), confirm `bg-neon text-black` or, when `danger`, `bg-neon-pink text-white`. Tapping the backdrop resolves `null` (treated as cancel by this module).
- **promptCard** `{title, label, placeholder, value, confirmLabel='Save', cancelLabel='Cancel', multiline}` → `Promise<string|null>`: same card with a filled input (`bg-surface-container-low` radius 10), label 10px uppercase `tracking-[0.2em]`; Enter submits when single-line; auto-focus after 30 ms.
- **codeCooldown(btn, seconds, idleLabel)**: disables the button, shows `"60s"`, `"59s"` … every second, re-enables and restores `idleLabel` at 0. Re-invoking clears any prior timer on that button.

### 1.7 Boot sequence / routing state machine

```
cold load
  ├─ index.html inline watchdog (web only)
  ├─ main.js imports: styles, state, core, i18n, auth, questionnaire, profile, match, couple, addfriend, chat, square, notifications, settings, milestone
  ├─ i18n.js at import: applyTheme(localStorage.cl_theme || 'light'); if cl_lang==='zh' translate DOM + start MutationObserver
  ├─ DOMContentLoaded (main.js): setTimeout(hideSplash, 3000); bind bio counters, chat Enter key, pull-to-refresh, home swipe, nav auto-hide; renderSetupTags()
  └─ hideSplash() (timer or Skip) → 600 ms → checkUserState()

checkUserState():
  token = localStorage.cl_token
  ├─ no token → cleanupUserState(); closeAllOverlays(); showPage('page-auth')
  └─ token → GET /users/me
       ├─ throws (any error incl. 401) → localStorage.removeItem('cl_token'); showPage('page-auth')
       ├─ u.status === 'BANNED' → closeAllOverlays(); showPage('page-banned')   (no SSE, token kept)
       └─ else startRealtime();  hasProfile = u.hasProfile ?? !!(u.profile && u.profile.nickname)
            ├─ !hasProfile → showPage('page-profile-setup')   (→ initProfileSetupPage via hook)
            └─ hasProfile  → showPage('page-home'); switchTab('match')  → switchHomeView(S.homeView||'chat')

Questionnaire is NOT a boot gate. The "questionnaire wall" lives in match.js:
  switchHomeView('romantic'|'friend') → ensureQuestionnaireThenMatch(mode):
      GET /questionnaire/completion?type=mode → completed?
        ├─ yes → loadMatchTab()
        └─ no  → state = S.matchStatus[mode].state ?? GET /matching/status?mode=mode
                 ├─ state missing or 'idle' → promptFillQuestionnaire(mode)  (full-pane card: neon icon box, title
                 │      "Romantic/Friend Questionnaire", "A few quick questions unlock … matching.", CTA
                 │      "Fill Out Questionnaire" → goFillQuestionnaire(mode) → showPage('page-questionnaire'))
                 └─ searching/matched/relationship → loadMatchTab() then prepend banner
                        "Questionnaire updated — refill for better matches" + "Refill" button
      (completion endpoint failure → treated as completed; never locks the user out)
  Also re-checked in startMatch() before charging energy.

register success → startRealtime(); showPage('page-profile-setup')   (skips /users/me)
login success    → checkUserState()                                    (/users/me decides)
saveProfile ok   → S.homeView='chat'; switchTab('match'); renderQuestionnaireCards()
```

`showPage(id)`: removes `.active` from all `.page`, sets every `[id^="tab-"]` panel `display:none`, activates the target, and shows `#bottom-nav` only when `id === 'page-home'`. `switchTab(tab)` stops match/chat/notif polling and the countdown, activates `page-home`, shows the bottom nav, sets the active nav item, shows `#tab-<tab>`, and for `match` calls `switchHomeView(S.homeView || 'chat')`.

---

## 2. Interactions

### 2.1 Splash
- Tap **Skip** → `hideSplash()` immediately. The 3 s timer still fires afterwards and calls `hideSplash()` again → **`checkUserState()` runs twice** (two `/users/me` requests, two `showPage` calls). Harmless in H5 because the setup page guards re-init (`setupInitInFlight`) and `showPage` is idempotent; iOS should simply route once.

### 2.2 Auth page
- **Tab switch** `switchAuthTab('signin'|'register', event)`: `preventDefault`, hides all `.auth-form`, resets both tab buttons to the inactive class string, shows the chosen form and applies the active class string. Pure UI; no state cleared.
- **Sign In** (`doLogin`): reads `#login-email` and `#login-password` (both `trim()`med). Validation: both non-empty else toast `Please fill all fields` (English only). `POST /auth/login`. Success: `localStorage.cl_token = data.token || data.access_token`; `S.currentUser = data.user || data` (the light login user: `{id,email,status,hasProfile,profileCompleteness}`); `checkUserState()` (which re-fetches `/users/me` and routes). Failure: toast `Login failed: <server message>` (e.g. `Incorrect email or password`, `Your account has been banned, please contact support`). No busy state; Enter key is not bound (forms have no submit handler; buttons are `type=button`).
- **Send code** (`sendRegisterCode`): reads `#register-email` trimmed. Empty → toast (zh `请先填写邮箱` / en `Enter your email first`) and return. If the button is already `disabled` (cooldown or in-flight) → return (race guard). Sets button `disabled` + text `发送中…` / `Sending…`. `POST /auth/register/send-code {email}`. Success: unhide `#register-code-hint` with `data-no-i18n` and text — if response has `devCode`: zh `开发模式（未接邮件服务）：验证码 ${devCode}` / en `Dev mode (no email service yet): your code is ${devCode}`; else zh `验证码已发送到你的邮箱，10 分钟内有效` / en `Code sent to your email, valid for 10 minutes`. Toast `验证码已发送` / `Code sent`. Then `codeCooldown(btn, 60, 'Send code')` — 60 s countdown showing `Ns` (language-neutral), then label restored to `Send code` (the zh MutationObserver re-translates it to `发验证码` because setting `textContent` inserts a new text node). Failure: re-enable button, restore `Send code`, toast `发送失败：` / `Failed to send: ` + server message (`This email is already registered` 409, `Please wait a moment before requesting another code` 400 when < 60 s since last issue, `Please enter a valid email address` 400, `Email service is not configured` 503 in production without SMTP, `Too many requests, please try again later` 429).
- **Register** (`doRegister`): reads email, `#register-code`, `#register-password`, `#register-password-confirm` (all trimmed). Validation order, each a toast: all four non-empty (`Please fill all fields`); code matches `/^\d{6}$/` (zh `请输入 6 位邮箱验证码` / en `Enter the 6-digit email verification code`); password length ≥ 8 (`Password must be at least 8 characters`); password === confirm (`Passwords do not match`). `POST /auth/register {email, password, code}`. Success: store token, `S.currentUser = data.user` (`{id,email,status,createdAt}` — no `hasProfile`), `startRealtime()`, `showPage('page-profile-setup')`. Failure: toast `Registration failed: <message>` (`Please request an email verification code first`, `Verification code has expired, please request a new one`, `Too many incorrect attempts, please request a new code` (after 5 wrong tries), `Incorrect verification code`, `This email is already registered`, DTO messages). No busy guard: double tap can fire two registers (second returns 409).
- **Forgot Password?** — no-op.
- **Terms / Privacy** links → content overlay (back arrow closes; edge swipe-back also works because the overlay contains `arrow_back`).

### 2.3 Banned page
- **Log Out** → `doLogout()`: `confirmCard({title:'Log out of Unimatcha?', confirmLabel:'Log Out', danger:true})` (pink confirm). On confirm: stop match/chat/notif polling and countdown, `localStorage.removeItem('cl_token')`, `cleanupUserState()` (which also stops SSE and session countdown), `closeAllOverlays()`, `showPage('page-auth')`. The same `doLogout` is used from Settings (this module owns it).

### 2.4 Profile Setup
- **On enter** (`initProfileSetupPage`, via the `showPage` hook): `setupWizardReset()` (show wizard, hide rest, go to step 0). Guard `setupInitInFlight` prevents concurrent double-init. Pre-fill from `S.currentUser.profile` (only when the input is still empty, so re-entering keeps typed drafts): `S.setupTags` ← `profile.interests` (if setupTags empty), `renderSetupTags()`; nickname, givenName, familyName, bio (+ counter bound once via `dataset.countBound`); birthday (`fillSetupBirthday` sets min/max and fills `profile.birthday`); gender / genderPref buttons re-selected if present; grade select filled from `GRADE_OPTIONS` with `normalizeGrade(profile.grade)` selected (`normalizeGrade` = case-insensitive match into the canonical list, else raw value kept; `fillMetaSelect` prepends any current value not in the list so legacy values stay selectable). Then **five metadata fetches in parallel** (`uk/universities`, `uk/cities`, `uk/majors`, `mbti-types`, `nationalities`) → fill the five underline selects, keeping the currently selected value or the profile value. Any fetch failure → toast `Failed to load options. Please try again.` (the cache only stores non-empty successful results, so a later open retries).
- **Wizard Next** (`setupWizardNext`): validates current step → step 0: nickname non-empty (`Please enter a nickname`); step 1: both names non-empty (`Please enter your real name`); step 2: a gender selected (`Please select your gender`); step 3: birthday set (`Please select your birthday`) and computed age within 16–40 inclusive (`Unimatcha is for students aged 16–40`; `ageFromBirthday` = calendar age, birthday parsed as local `YYYY-MM-DDT00:00:00`). Steps 0–2 advance (`setupWizardGo`: toggles `.hidden`, updates `"N / 4"`, bar width, Back visibility, Next→Continue label). Step 3 → hide wizard, show `#setup-rest`, scroll page to top.
- **Wizard Back** (`setupWizardPrev`): step − 1 when > 0. There is no way back from `#setup-rest` to the wizard except leaving the page (values persist in the hidden inputs and are still submitted).
- **Gender / Looking-for buttons** (`selectSetupGender` / `selectSetupGenderPref` → `selectSetupSegment`): single-select within the group; rewrites class strings (selected = `bg-neon text-black`, others outlined) and sets `data-selected`.
- **Avatar**: tap circle → file picker (`accept=image/*`) → `handleAvatarFile(event,'setup')`: `uploadImageFile(file)` (multipart `POST /uploads/image`, field `file`, ≤ 8 MB, image MIME only) → `POST /uploads/avatar {url}` → `S.currentUser.profile.avatarUrl = url`; circle content replaced by `<img>` (`object-cover rounded-full`, URL passed through `safeUrl`); toast `Avatar updated`. Failure toast `Avatar upload failed: <msg>`. Upload happens immediately (not deferred to Confirm) and persists even if the user never confirms the profile.
- **Interests**: `addSetupTagValue(tag)` trims, ignores empty / duplicate / when already 8 tags (**cap 8**, silently ignored); `addSetupTag()` reads the input then clears it; `removeSetupTag(i)` splices. Enter in the input calls `addSetupTag` (with `preventDefault`).
- **Bio**: live counter (`main.js` binds `input` → `#setup-bio-count`; `initProfileSetupPage` binds a second identical listener once — counter simply updates twice). `maxlength=250` enforced by the browser; `saveProfile` also `substring(0,250)`.
- **Confirm Profile** (`saveProfile`): re-validates (order): nickname (`Please enter a nickname`), given+family (`Please enter your real name (given + family name)`), gender (`Please select your gender`), birthday + computable age (`Please select your birthday`), age 16–40 (`Unimatcha is for students aged 16–40`). Builds payload (see 3.6) and `PUT /profiles/me`. Success: merge payload into `S.currentUser.profile` (so Edit Profile shows the new values without a refetch), `S.homeView='chat'`, `switchTab('match')`, `renderQuestionnaireCards()`. Failure: toast `Save failed: <msg>`. No busy guard on this button. **Note**: `S.currentUser.hasProfile` is not updated locally; only the profile object is merged — fine because routing after this point never re-reads `hasProfile` until the next cold boot.
- **Header back arrow** → `showPage('page-auth')` while still logged in (token and `S.currentUser` kept, SSE stays open). Next cold boot routes back to setup. On the auth page the user can log in as someone else: `doLogin` overwrites the token but **does not call `cleanupUserState`** — `checkUserState` overwrites `S.currentUser`, but other user-scoped caches (e.g. `S.setupTags`, `S.metadataCache`) survive. iOS should treat "back from setup" as logout or keep the session explicitly.
- **Edge swipe-back**: `.page`s are not overlays; the global edge-swipe handler only targets open overlays with a back arrow or `#page-questionnaire`. So neither the setup page nor auth page supports swipe-back (only the content overlay opened from the footer does).

### 2.5 Other functions owned by auth.js (used from Settings / Profile screens)
- `applyVerification()`: `confirmCard({title:'Apply for identity verification?', confirmLabel:'Apply'})` → `POST /users/me/verification/apply` → toast `Verification applied!` / `Failed: <msg>`. **This endpoint no longer exists on the backend** (`users.controller.ts` only has `me/verification/send-code` and `me/verification/submit`); it is legacy dead code — do not port.
- `showChangePassword()`: two chained `promptCard`s — `{title:'Change password', label:'Current password', placeholder:'Enter your current password', confirmLabel:'Next'}` then `{title:'Change password', label:'New password', placeholder:'At least 8 characters', confirmLabel:'Change'}`; cancel (null) at either step aborts. `submitChangePassword(current, pw)`: `Enter your current password` if empty; `Password must be at least 8 characters`; `POST /auth/change-password {currentPassword, password}` → toast `Password changed` / server message (`Current password is incorrect`). Placeholders have zh entries (`输入当前密码`, `至少 8 位`); titles/labels do not.

---

## 3. API calls

All requests go through `api(path, method, body)` in core.js: base `S.API` (`http(s)://<host>:3001/api/v1` on localhost/IP, otherwise `https://api.<domain-with-app.-stripped>/api/v1` → production `https://api.unimatcha.ai/api/v1`), header `Content-Type: application/json`, `Authorization: Bearer <cl_token>` when present, `cache: 'no-store'`. **Response envelope** (TransformInterceptor): `{success:true, data:<payload>, message?, timestamp}` — every caller unwraps with `res.data || res`. **Error envelope** (HttpExceptionFilter): `{success:false, statusCode, message, errors, timestamp, path}`; `api()` throws `Error(message || 'API <status>')`. **Any 401** → remove token, stop match/realtime/chat/notif polling + countdown, `cleanupUserState()`, `closeAllOverlays()`, `showPage('page-auth')`, then throws `Unauthorized` (callers' catch blocks still run — e.g. `doLogin` would toast `Login failed: Unauthorized` on a 401 from login; in practice that's the wrong-password path, whose message is lost because 401 is intercepted generically: **the toast for a wrong password is `Login failed: Unauthorized`**, not the server text). JWT lifetime: 7 days (`JWT_EXPIRES_IN` default `7d`), payload `{sub, email, role:'user'}`; the strategy re-validates the user on every request and 401s if deleted or BANNED.

| # | Call | Body / query | Response fields used | Notes |
|---|---|---|---|---|
| 3.1 | `POST /auth/login` | `{email:string, password:string}` from the two inputs (trimmed) | `token` (fallback `access_token`), `user{id,email,status,hasProfile,profileCompleteness}` | Public. Backend tries exact email then lowercase. 401 on bad credentials or BANNED (message differs but H5 loses it). |
| 3.2 | `POST /auth/register/send-code` | `{email}` | `devCode?` (only when SMTP unconfigured **and** `NODE_ENV!=='production'`), `message`, `expiresInSec:600` | Public, rate-limited 30/min/IP (60 s window, `429 Too many requests, please try again later`). Email normalised `trim().toLowerCase()`. 409 if registered; 400 if re-requested within 60 s of the previous issue; 503 in prod without SMTP. Code: 6 digits, 10 min TTL, 5 wrong attempts max. |
| 3.3 | `POST /auth/register` | `{email, password (8–64), code (exactly 6 chars)}` | `token`, `user{id,email,status,createdAt}` | Public, same 30/min limit. Code consumed on success. Concurrent duplicate → 409. |
| 3.4 | `GET /users/me` | — | `status` ('ACTIVE'/'BANNED'), `hasProfile`, `profile{nickname, realName, familyName, givenName, school, grade, gender, genderPref, age, city, interests[], bio, avatarUrl, socialLinks, relationshipScore, profileCompleteness, signature, coverUrl, tags[], major, mbti, nationality, realPhotos[], zodiac, wishGifts[], studentId, birthday}`, plus `id, email, verificationStatus, createdAt, modeStates[{mode, matchState, matchSearchingSince}], completedQuestionnaire` | Called by `checkUserState` on every boot/login. `hasProfile = !!(profile && profile.nickname)` server-side; H5 recomputes the same fallback. Whole object cached as `S.currentUser`. |
| 3.5 | `GET /metadata/uk/universities`, `/uk/cities`, `/uk/majors`, `/mbti-types`, `/nationalities` | — | `items: string[]` | Auth required. Cached per path in `S.metadataCache` for the session (only non-empty results cached; cleared by `cleanupUserState`). Fetched in parallel on setup-page enter. |
| 3.6 | `PUT /profiles/me` | `{nickname, givenName, familyName, realName: "given family", school (may be ""), grade (normalised; may be ""), gender ('male'\|'female'\|'non_binary'\|'other'), genderPref ('male'\|'female'\|'any', default 'any'), age:int (computed from birthday), birthday:'YYYY-MM-DD', bio (≤250, may be ""), interests:string[]}` + only-if-non-empty `city, major, mbti, nationality` | full `Profile` row (not read by H5) | Backend `CreateProfileDto`: all fields optional; `age` int 16–40; `birthday` regex `^\d{4}-\d{2}-\d{2}$`; upsert merges with existing row and recomputes `profileCompleteness`. `school`/`grade` are sent even when empty strings (overwrites any previous value with ""). |
| 3.7 | `POST /uploads/image` | multipart `file` | `url` (absolute, host-derived), `filename` | 8 MB limit, image MIME whitelist; extension derived from MIME server-side. Raw `fetch`, not `api()` (no 401 handling → error text `Upload failed`). |
| 3.8 | `POST /uploads/avatar` | `{url}` | `avatarUrl`, `message` | Upserts `profile.avatarUrl` immediately. |
| 3.9 | `GET /realtime/stream?token=<jwt>` | query token | SSE frames `{type:'ready'\|'evicted'\|'message'\|'read'\|'notification', matchId?}` | Opened by `startRealtime()` right after `/users/me` (non-banned) and after register. Max 5 connections per user; 25 s heartbeat. Only a "something changed" signal; data is re-fetched via REST. |
| 3.10 | `POST /auth/change-password` | `{currentPassword, password}` | `message` | From Settings via `showChangePassword`. |
| 3.11 | `POST /users/me/verification/apply` | — | — | **Dead**: route no longer exists (404). Skip. |
| 3.12 | `GET /questionnaire/completion` (no type) | — | `romantic.completed`, `friend.completed` | Used by the post-setup cards overlay. Per-mode variant `?type=romantic|friend` is used by the match-mode gate. |

No polling in this module. Dedup/sequence tokens: `setupInitInFlight` (setup init), `btn.disabled` check (send-code), `btn.__cdTimer` (cooldown). Metadata cache is the only cache.

---

## 4. Client state

### 4.1 Persistent storage (web `localStorage` / `sessionStorage`)

| Key | Set by | Meaning | Cleared |
|---|---|---|---|
| `cl_token` | `doLogin`, `doRegister` | JWT (7 d) | `doLogout`, `api()` on 401, `checkUserState` on `/users/me` failure |
| `cl_lang` | i18n language dialog | `'zh'` or `'en'` (default en); switching **reloads the whole page** | never |
| `cl_theme` | Settings dark-mode toggle | `'dark'`/`'light'` | never |
| `cl_enhanced_<userId>` | match.js `ensureEnhancedShape` | per-user enhanced-mode toggle cache `{romantic:{enabled,cost}, friend:{enabled,cells}}` | never (keyed by user id) |
| `cl_boot_retry`, `cl_ver_retry` (sessionStorage) | index.html watchdog | reload-once flags | on successful boot / on hash match |

iOS equivalent: keep the token in Keychain (existing `TokenStorage` uses UserDefaults — upgrade), language + theme in UserDefaults. There is **no cached user object** in H5 (always refetched at boot); the existing iOS `TokenStorage.saveUser` cache is optional.

### 4.2 `S` (state.js) — full declared field list

| Field | Default | Meaning / owner |
|---|---|---|
| `currentUser` | `null` | `/users/me` payload (or the light login/register user until `checkUserState` runs). `.profile` is mutated locally by `saveProfile` and `handleAvatarFile`. |
| `userSettings` | `null` | `/users/me/settings` cache (settings.js) |
| `activeTab` | `'match'` | bottom nav tab: `match` \| `square` \| `profile` |
| `API` | computed | base URL (see §3) |
| `currentQuestion` | `0` | questionnaire cursor |
| `answers` | `{}` | legacy single answer bucket (still reset) |
| `questionnaire` | `null` | loaded questionnaire |
| `homeView` | `'chat'` | home top switch: `chat` \| `romantic` \| `friend` |
| `activeMatchMode` | `'romantic'` | mode whose match pane is active |
| `matchStatus` | `{romantic:null, friend:null}` | per-mode `/matching/status` cache |
| `sessions` | `[]` | chat session list |
| `romanticAnswers` / `friendAnswers` | `{}` | per-mode questionnaire answers |
| `questionnaireMode` | `'romantic'` | which questionnaire is being filled |
| `friendPrefInterests` / `friendPrefActivities` | `[]` | friend preference multi-selects |
| `friendGender` | `'all'` | friend preferred gender |
| `prefMode` | `'romantic'` | preferences sheet tab |
| `matchPrefs` | `{romantic:null, friend:null}` | `/matching/preferences` cache |
| `energy` | `{totalEnergy:0, usedEnergy:0, availableEnergy:0}` | `/energy/balance` cache |
| `enhanced` | `{romantic:{enabled:false,cost:3}, friend:{enabled:false,cells:1}}` | enhance toggles (also `_uid` marker added at runtime) |
| `energyPackages` | 3 constant packages (`pkg_30` ¥30/30, `pkg_60` ¥58/60, `pkg_100` ¥88/100) | recharge fallback list |
| `matchPollingId` / `matchPollFailCount` | `null` / `0` | match polling |
| `isSubmittingProposal` | `false` | confirm guard |
| `matchBasis` | `'both'` | legacy basis |
| `matchExtraInfo` | `''` | legacy extra info |
| `chatMatchId` / `chatPartnerId` / `chatPartnerName` | `null` | open conversation |
| `chatSessionType` / `chatMode` / `chatMyConfirmed` / `chatPartnerConfirmed` / `chatSessionStatus` | `null`/`false` | open conversation meta |
| `sessionCountdownId` | `null` | temp-session countdown timer |
| `chatMessages`, `chatPollingId`, `chatLastId`, `chatNextCursor`, `chatRenderFrom`, `chatLoadingHistory`, `chatPollBusy`, `chatPollTick` | `[]`, nulls, `0`, `false` | chat internals |
| `countdownInterval` | `null` | reveal countdown timer |
| `campusAnimTimer` | `null` | match idle animation timer |
| `notifPollingId`, `notifList`, `notifPage`, `notifHasMore`, `notifLoadingMore` | `null`, `[]`, `1`, `false`, `false` | notifications |
| `currentPostId`, `pdPostData`, `pdSortMode`, `pdReplyTo`, `pdPendingImgs`, `newPostImages` | nulls / `'time'` / `[]` | post detail + composer |
| `squarePosts`, `squareReqSeq`, `isSubmittingPost`, `squareSection`, `squareSearchQuery` | `[]`, `0`, `false`, `'recommended'`, `''` | square |
| `squareTab` / `newPostBoard` / `newPostAnonymous` | `'recommend'` / `'recommend'` / `false` | square v2 |
| `milestoneData` | `null` | couple milestones |
| `editTags` | `[]` | Edit Profile interest draft |
| `setupTags` | `[]` | **Profile Setup interest draft (this module)** |
| `metadataCache` | `{}` | `/metadata/*` cache (this module) |
| `filterGender` / `filterStages` | `'all'` / `[]` | preference filters |

Runtime-added fields (not declared, but relied on): `realtimeES`, `realtimeUp`, `rtThrottle` (SSE, core.js), `pendingQuestionnaireBanner` (match.js), `squareScrollPos`, `squarePostsByTab`, `squareReqSeqs`, `_squareSearchSeq`, `_squareSearchTimer`, `newPostBoardOrigin`, `newPostPoll`, `pdAnon`, `pdImageFile`, `pdSending` (square), `chatBackground`, `chatPartnerAvatar`, `chatPartnerSchool`, `chatPendingFile`, `chatPollPending` (chat), `coupleContainer`, `coupleMatchId`, `couplePartner`, `coupleSpace` (couple), `friendHubDirect`, `friendHubView` (addfriend), `myTickets`, `verifyCardUrl`, `viewingProfileId` (profile), `notifRefreshBusy`. Module-local (not on `S`): `setupWizardStep`, `setupInitInFlight` (profile.js).

### 4.3 `cleanupUserState()` (core.js) — called on logout, on 401, and on boot without token

Stops every timer through its own helper (`stopMatchPolling`, `stopChatPolling`, `stopNotifPolling`, `stopCountdownTick`, `stopRealtime` (closes the EventSource and clears trailing throttle timers), `stopSessionCountdown`), then resets: `currentUser`, `userSettings`, `matchStatus` (to the bucket shape), `homeView='chat'`, `activeMatchMode='romantic'`, `isSubmittingProposal`, `energy`, `enhanced`, `matchBasis`, `matchExtraInfo`, `matchPrefs`, calls `resetMatchPlanState()` (invalidates in-flight preference responses and the "enhanced this round" marker), match polling ids, all chat fields, `sessions`, session meta, `countdownInterval`, notification fields, questionnaire buckets + mode + cursor, post-detail/composer fields, `squarePosts`, `squareReqSeq`, `isSubmittingPost`, `editTags`, `setupTags`, `activeTab='match'`, `squareSection`, `squareTab`, `newPostBoard`, `newPostAnonymous`, `milestoneData`, `metadataCache`, `filterGender`, `filterStages`. **Not** reset: `S.enhanced._uid` marker (handled by keying), the runtime-added fields listed above (e.g. `squareScrollPos`, `couple*`, `friendHub*`, `myTickets`), and DOM input values (auth inputs, setup inputs, `#register-code-hint`). It also does not clear `localStorage` beyond what the callers remove (`cl_token`).

---

## 5. i18n

Mechanism (i18n.js): English is the source language in the markup. When `localStorage.cl_lang === 'zh'`, at boot the whole `document.body` is walked and every text node whose **trimmed text exactly equals** a key in the `ZH` dictionary is replaced; a `MutationObserver` translates any node added later (so dynamically set `textContent` gets translated too). Placeholders are translated from a separate `ZH_PLACEHOLDER` map. Anything inside an element with `data-no-i18n` is skipped (user content, brand words, dynamic values that already contain the right language). Changing language reloads the page. Strings with no dictionary entry stay English in zh mode. JS that composes dynamic text branches on `window.getLang() === 'zh'` and marks the node `data-no-i18n`.

Implication for iOS: ship a plain string table with the pairs below; user content is never translated; dropdown **values** stay English (`metaLabel()` only maps display text via `META_ZH`, e.g. `University of Warwick` → 华威大学, `London` → 伦敦, `Year 1` → 大一, `Master's` → 硕士 — full table in i18n.js lines 240–340).

### 5.1 Strings in this module (en → zh; "—" = no zh, shown in English)

Splash: `Skip` → — · `One thoughtful match, every week.` → `每周一次，用心匹配。` · `UNIMATCHA`, `BETA` (no-i18n).

Auth: `Sign In` → `登录` · `Register` → `注册` · `Welcome Back` → `欢迎回来` · `Enter your academic credentials` → `输入你的账号信息` · `Join Unimatcha` → `加入 Unimatcha` · `Create your academic profile` → `创建你的账号` · `Email Address` → `邮箱地址` · `Password` → `密码` · `Confirm Password` → `确认密码` · `Verification Code` → `验证码` · `Send code` → `发验证码` · `Forgot Password?` → `忘记密码？` · `Terms of Service` → `用户协议` · `Privacy Policy` → `隐私政策` · `© 2026 Unimatcha. All Rights Reserved.` → — · placeholders `student@campus.edu`, `••••••••` → — · `6-digit code` → `6 位验证码`.

Auth dynamic (JS ternaries): `Sending…`/`发送中…` · `Code sent`/`验证码已发送` · `Enter your email first`/`请先填写邮箱` · `Dev mode (no email service yet): your code is N`/`开发模式（未接邮件服务）：验证码 N` · `Code sent to your email, valid for 10 minutes`/`验证码已发送到你的邮箱，10 分钟内有效` · `Failed to send: `/`发送失败：` · `Enter the 6-digit email verification code`/`请输入 6 位邮箱验证码` · cooldown label `Ns` (both).

Auth toasts, English only: `Please fill all fields`, `Login failed: …`, `Registration failed: …`, `Password must be at least 8 characters`, `Passwords do not match`.

Logout card: `Log out of Unimatcha?` → — · `Log Out` → `退出登录` · `Cancel` → `取消`.

Banned: `Account Suspended` → — · `Your account has been disabled for violating the community guidelines. If you believe this is a mistake, please contact support.` → — · `Log Out` → `退出登录`.

Profile Setup: `Profile Setup` → `完善资料` · `1 / 4` (no-i18n by nature) · `What should we call you?` → `怎么称呼你？` · `Your nickname is what others see.` → `昵称是别人看到的名字。` · `Nickname` → `昵称` · placeholder `The Scholar` → `你的昵称` · `Your real name` → `你的真实姓名` · `Only shown to confirmed partners.` → `仅对确认的伴侣可见。` · `Real name` → `真实姓名` · `Given name (名)` → `名` · `Family name (姓)` → `姓` · `How do you identify?` → `你的性别是？` · `Used for matching. Not shown publicly.` → `仅用于匹配，不公开展示。` · `Gender` → `性别` · `Male` → `男` · `Female` → `女` · `Non-Binary` → — (dictionary has `Non-binary` lowercase b, which does not match this button) · `Other` → `其他` · `When were you born?` → `你的生日是？` · `We show your age, never your birthday.` → `我们只展示年龄，不展示生日。` · `Birthday` → `生日` · `Back` → `上一步` · `Next` → `下一步` · `Continue` → `继续` · `Upload` → `上传` · `Your Academic Identity` → `你的头像` · `Basic Info` → `基本信息` · `University / School` → `学校` · `Select Institution` → `选择学校` · `City` → `城市` · `Select City` → `选择城市` · `Major` → `专业` · `Select Major` → `选择专业` · `MBTI` → — · `Select MBTI` → `选择 MBTI` · `Nationality` → `国籍` · `Select Nationality` → `选择国籍` · `Looking For` → `想认识` · `Men`/`Women`/`Anyone` → — · `Academic Year` → `学业阶段` · `Select Grade` → `选择年级` · grade options via META_ZH (`Foundation` 预科, `Year 1..4` 大一..大四, `Master's` 硕士, `PhD Year 1..3` 博士一/二/三年级, `PhD Year 4+` 博士四年级及以上) · `Interests` → `兴趣` · suggestion chips `Linguistics` / `Philosophy` / `Digital Art` / `Architecture` → — (they exist only in `META_ZH`, which the text-node translator does not consult; the chips stay English in zh mode and the stored values are English) · `Add new interest...` → `添加兴趣…` · `Add` → `添加` · `Bio` → `个人简介` · `Academic Manifesto` → `关于我` · `Briefly describe your academic pursuits...` → — · `/ 250 characters` → — · `Confirm Profile` → `完成资料` · `By continuing, you agree to the Academic Code of Conduct.` → `继续即表示你同意社区行为准则。`

Setup toasts, English only: `Please enter a nickname`, `Please enter your real name`, `Please enter your real name (given + family name)`, `Please select your gender`, `Please select your birthday`, `Unimatcha is for students aged 16–40`, `Failed to load options. Please try again.`, `Save failed: …`, `Avatar updated`, `Avatar upload failed: …`.

Questionnaire cards (post-setup): `Complete Your Match Profile` → `完善匹配资料` · `Complete a questionnaire to unlock that mode.` → `完成问卷即可解锁对应模式的匹配。` · `Romantic Questionnaire` → `恋人问卷` · `Friend Questionnaire` → `朋友问卷` · `Start` → `开始` · `Retake` → `重新填写` · `Maybe Later` → `稍后再说`.

Questionnaire wall (match pane): `A few quick questions unlock romantic matching.` → `花几分钟答题，解锁恋人匹配。` · `…friend matching.` → `花几分钟答题，解锁朋友匹配。` · `Fill Out Questionnaire` → `填写问卷` · `Questionnaire updated — refill for better matches` → `问卷已更新，重新填写让匹配更准` · `Refill` → `去填写`.

Change password: `Change password`, `Current password`, `New password`, `Next`(→`下一步`), `Change`, `Enter your current password` → `输入当前密码`, `At least 8 characters` → `至少 8 位`, toasts `Enter your current password`, `Password must be at least 8 characters`, `Password changed`.

Server messages surfaced verbatim in toasts are English only (listed in §3).

---

## 6. Cross-module links

**This module calls**: `window.api`, `window.toast`, `window.confirmCard`, `window.promptCard`, `window.checkUserState`, `window.showPage`, `window.startRealtime`, `window.stopMatchPolling`, `window.stopChatPolling`, `window.stopNotifPolling`, `window.stopCountdownTick`, `window.cleanupUserState`, `window.closeAllOverlays`, `window.codeCooldown`, `window.getLang` (i18n.js), `window.escapeHtml`, `window.safeUrl`, `window.uploadImageFile`, `window.metaLabel` (i18n.js), `window.switchTab` → `window.switchHomeView` (match.js), `window.renderQuestionnaireCards` (questionnaire.js), `window.resetMatchPlanState` (match.js, inside cleanup), `window.stopSessionCountdown` (chat.js, inside cleanup), `openContentPage` (settings.js, from the auth footer).

**Calls into this module**: `hideSplash` → `checkUserState` (boot); `api()` 401 path → `showPage('page-auth')`; Settings page → `doLogout`, `showChangePassword`; Profile page → `applyVerification` (dead endpoint); questionnaire.js swipe-back / header → `showPage('page-home')`; `page-questionnaire` header back → `showPage` + `switchTab`; every module that needs auth uses `localStorage.cl_token` through `api()`; match.js `ensureEnhancedShape` reads `S.currentUser.id`; profile.js Edit Profile reads `S.currentUser.profile` (which `saveProfile` keeps in sync).

**Module import order matters** (`main.js`): core → i18n → auth → questionnaire → profile → match → couple → addfriend → chat → square → notifications → settings → milestone. profile.js wraps `window.showPage` in a `setTimeout(0)` after all imports, so the setup-page init hook is present by the time the splash hides.

---

## 7. Gotchas (subtle behaviors an iOS implementer must preserve or consciously fix)

1. **Login-vs-register post-auth path differs**: login re-fetches `/users/me` and routes through `hasProfile`/BANNED; register jumps straight to Profile Setup with only the light `{id,email,status,createdAt}` user and starts SSE. Setup pre-fill therefore has nothing to pre-fill after a fresh register (expected).
2. **Wrong-password toast is generic**: the shared 401 handler swallows the server text, so the H5 shows `Login failed: Unauthorized` (and also clears an already-empty token, runs cleanup, and re-shows the auth page). iOS should show `Incorrect email or password` from the server instead and must not treat a login 401 as "session expired".
3. **Send-code cooldown is client-timed at 60 s** to mirror the server's `CODE_RESEND_MS`; the server computes cooldown from `expiresAt − 10 min`, so after an app restart the server may still say "wait" for the remaining seconds — surface the 400 message rather than a raw error.
4. **`devCode` only appears outside production** (`NODE_ENV !== 'production'` and SMTP unconfigured). In production the hint is always "Code sent to your email, valid for 10 minutes". Keep the devCode branch for local/dev builds (the iOS `AuthViewModel` already does).
5. **Registration validates only what the DTO needs**: password 8–64, code 6 digits. Email format errors come back from the server (`Please enter a valid email address`). The backend lowercases and trims emails; login also tries lowercase for legacy mixed-case accounts.
6. **Wizard required fields are re-validated in `saveProfile`**, because the hidden wizard inputs are the data source. `realName` is derived (`given + ' ' + family`) and sent alongside `givenName`/`familyName`. `age` is client-computed from `birthday` and must be 16–40 (server rejects otherwise). Birthday picker bounds: `[today−40y, today−16y]`.
7. **`genderPref` defaults to `'any'`** (pre-selected chip); `gender` has no default and is required. Matching pools filter out users missing gender/genderPref/age — this is why the wizard blocks on them.
8. **Interest chips: max 8, case-sensitive dedupe, values sent as-is**. Suggestion chips are English labels; zh mode shows translated labels but stores English.
9. **Dropdown values are English canonical strings**; display is translated via `META_ZH` only. `grade` is normalised to `GRADE_OPTIONS` casing; legacy values (e.g. `Freshman`, `Undergraduate`) are preserved as an extra selectable option so a re-edit never loses them. `school`, `grade`, `bio` are submitted even when empty (overwrite with `""`); `city/major/mbti/nationality` are omitted when empty (server keeps previous).
10. **Avatar upload is immediate and independent of Confirm**; `POST /uploads/image` returns a host-based absolute URL (production https via trust-proxy). Use `safeUrl`-style scheme checks before rendering user URLs (stored XSS lesson, 7/13).
11. **`S.currentUser.profile` is patched locally after save** so Edit Profile shows fresh values; `hasProfile` is not patched. After `saveProfile` the app must go through the equivalent of `switchTab('match')` (activate home, show bottom nav, active tab state, `#tab-match` panel, then `switchHomeView('chat')`) — calling only the view switch produced a blank home with no active nav item (bug fixed 8/31).
12. **Questionnaire is optional at boot**; the two-card overlay after setup is dismissible ("Maybe Later"). The wall only appears when entering a match mode (`romantic`/`friend` home view) and only for users in `idle` state; searching/matched/relationship users get a non-blocking "Refill" banner instead. Completion-endpoint failure never blocks.
13. **BANNED handling**: `/users/me` may report `status:'BANNED'` → banned page (token kept, SSE not started). Any later API call returns 401 → auth page. Login for a banned account returns 401 with a distinct message that H5 currently hides (see #2).
14. **Back arrow on Profile Setup goes to the auth page without logging out**; the token remains, so a cold restart lands on setup again. Logging in as another account from there does not run `cleanupUserState` (only `checkUserState`'s failure/no-token paths and logout do) — carry-over of `S.setupTags`/`S.metadataCache` is possible. iOS: make "back" an explicit logout (or drop the back button).
15. **Auth inputs persist across logout** (password field included) and the code hint is not cleared — iOS should clear form state on logout.
16. **Splash Skip + 3 s timer double-fires `checkUserState`** (two `/users/me` calls). Guard once on iOS. Splash minimum display is effectively 3 s (+0.6 s fade) unless skipped.
17. **Forgot Password is a dead button**; `applyVerification` targets a removed endpoint. Do not port either; student verification lives in the Profile module (`/users/me/verification/send-code` + `/submit`).
18. **Toast is the only feedback channel** in this module (3 s, top, black). No haptics, no inline errors, no loading spinners on Sign In / Register / Confirm Profile (only the Send-code button shows a busy label). Adding busy states on iOS is a safe improvement (server already dedupes: 409 on duplicate register).
19. **SSE starts on auth success** (`/realtime/stream?token=`), is stopped in `cleanupUserState`, and an `evicted` frame means "stop and do not reconnect" (5-connection cap per user). With SSE up, chat polling drops from 5 s to 30 s and notifications 15 s → 60 s.
20. **Rate limits**: send-code and register share a 30 req/min/IP bucket (campus NAT sized); expect `429` text `Too many requests, please try again later`.
21. **Theme/language are global, not per-account**, and language changes reload the page in H5; iOS can switch live but must keep the same string table and the "user content is never translated" rule.
22. **Existing iOS code to reuse** (`/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha`): `AuthService` (send-code/register/login already match the contract), `AuthViewModel` (devCode hint, `refresh()` via `/users/me`, BANNED → logout — note H5 shows a banned page instead), `Models/Auth.swift` `User`/`AuthResponse` (fields match §3.4), `APIClient` (envelope unwrap + 401 clear — same generic-401 flaw as H5, and 401 is thrown before parsing the body so login's message is lost; token in UserDefaults → move to Keychain), `OnboardingCoordinator` (already treats questionnaire as optional but **pushes** a romantic questionnaire step after setup — H5 shows the two-card overlay over the Chat home instead). `RegisterFormView` lacks the 60 s cooldown and the dev-hint `data-no-i18n` equivalent; `ProfileSetupView` is a single long form — must be rebuilt as the 4-step wizard + optional form. `SplashView`/`Theme` are the old dark neon-green (`#39FF6A` on `#0B0F0C`) design — the current H5 is light `#f9f9f9` + `#CCFF00` with a dark-mode variant; Theme must be replaced.
