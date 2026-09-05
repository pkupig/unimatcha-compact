# iOS "Views" layer audit — `apps/ios/Unimatcha/Views/**`

Source root: `/Users/aimi/Downloads/unimatcha-compact/apps/ios/Unimatcha/Views` (24 files, 6,096 lines).
Supporting layers read for context (not audited in depth here): `App/` (RootView, MainTabView, Theme), `Models/`, `Network/`, `ViewModels/`.
Backend truth checked against: `/Users/aimi/Downloads/unimatcha-compact/apps/api/src/**` (controllers, DTOs, services, `prisma/schema.prisma`).
H5 truth checked against: `/Users/aimi/Downloads/unimatcha-compact/apps/h5/index.html` + `src/modules/*.js`.

Verdict vocabulary used below:
- **Reuse as-is** – can be dropped into the new app with only theme/i18n token swaps.
- **Reuse logic / redesign UI** – the state machine, bindings and endpoint calls are right; the layout must be rebuilt to the H5 design.
- **Needs field updates** – decoding or payload does not match the current backend (exact fields listed).
- **Wrong endpoint** – calls a route that does not exist or has different semantics.
- **Obsolete** – no H5 counterpart / superseded.

---

## 0. Headline findings (read this first)

1. **The layer has never compiled.** `APIClient.request<T: Decodable>` decodes `APIResponse<T>` where `APIResponse<T: Codable>` – every Service call is a type error. Treat every view as "typed against intent, never executed". (Also `AuthService.SendCodeResponse` is `Decodable` only – same constraint failure.)
2. **Two screens are guaranteed to fail decoding even after the generic fix**, because the backend shape is nested where the iOS model is flat:
   - `ChatSessionsView` – `GET /chat/sessions` returns `lastMessage` as a **message object** `{id,content,imageUrl,kind,senderId,isRead,createdAt}`; iOS `ChatSession.lastMessage: String?` → `JSONDecoder` throws → the whole sessions list errors. `partner.id` (backend) vs `partner.userId` (iOS `PublicProfile`) → the "主页" link in `ChatView` never renders.
   - `CoupleSpaceView` – `GET /couple/:matchId` returns `status: {me, partner}`, `craving: {me:{current,history}, partner:{current}}`, `loveYou: {me:{count,sentToday}, partner:{count}}`, `schedule: {me:[],partner:[]}`, `gifts: {me:[],partner:[]}`; iOS `CoupleSpace` declares `status: String?`, `craving: String?`, `loveYou.mine/partner/total`, `gifts: [String]?` → decode throws → couple space always shows the error state.
3. **One silent product-breaking bug**: `MatchFilterView` defaults `preferredGender` to the literal `"any"` and PUTs it. The backend hard gate (`scoring-match-model.provider.ts:128,142`) is `if (aPrefs?.preferredGender && b.gender !== aPrefs.preferredGender) return 0` – any non-empty string is a hard filter, so `"any"` matches **nobody**. H5 sends `null` for "no preference" (`match.js:1571,1582`).
4. **Navigation shell is a different product.** iOS `MainTabView` = 5 tabs (匹配 / 聊天 / 广场 / 消息 / 我的). Current H5 = **3 tabs** (`bottom-nav`: Match / Square / Profile). Chat is not a tab – it is the first pane of a 3-pane horizontally swiped track inside the Match tab (Chat · Romantic · Friend, `home-track`), and Notifications is a right-slide overlay opened from a bell in the Match top bar. The whole iOS shell must be restructured; individual screens can be salvaged.
5. **Theme, language and storage are all wrong direction**: dark-only neon theme (`Theme.bg = #0B0F0C`) vs H5 light theme (`#f9f9f9`) with a dark-mode variant; every user-facing string is hard-coded Chinese and `Locale(identifier:"zh_CN")` is forced in formatters vs H5 bilingual (EN default, zh via dictionary); JWT + user JSON persisted in `UserDefaults` (`TokenStorage`) – must be Keychain.
6. **Missing entirely on iOS** (no view, and for some no model either): banned page, questionnaire mode-card wall + question-nav grid, plus-menu (contacts search / scan / relationship graph / dark mode / language), friend hub (graph + contact search + QR scan), chat image send + viewer + in-chat confirm/dissolve + chat background, milestone overlay, square Pinned page, square search page, masonry/card-type feed, poll voting, event cards + tickets + ticket detail (no `Event`/`Ticket` model at all), sponsored ad cards (`/ads/feed`), comment like/reply/anonymous/image, post share/long-press action cards, notification detail + grouping + localisation + pagination, student-verification submit (card photo + code), content pages (help/safety/terms/privacy), contact-us, report-a-problem, toast system, SSE realtime, pull-to-refresh, language switch, dark-mode switch.

Reusable with confidence: `FlowLayout`, `AvatarCircle`, `TagChip`, `Card`, `NeonButtonStyle`/`GhostButtonStyle` (as a pattern), `MetadataPickerSheet`, `FormSection`/`OnboardTextField`/`PickerRow`/`NeonTag`/`FlexTagRow`/`TagFlowGrid`, `LoadingView`, the QR generator in `ConnectCodeView`, the questionnaire answer inputs (`SingleChoiceInput`/`MultipleChoiceInput`/`ScaleInput`/`QuestionTextInput`), the match state-machine switch in `MatchTabView`, the optimistic like reconcile in `PostDetailView`, the chat polling/append pattern in `ChatViewModel`.

---

## 1. Global facts that apply to every file

| Topic | Existing iOS | Current backend / H5 | Consequence |
|---|---|---|---|
| Base URL | `Info.plist API_BASE_URL` = `http://localhost:3001/api/v1`; `NSAllowsArbitraryLoads=true` | Global prefix `api/v1` (`main.ts:60`); prod `https://api.unimatcha.ai/api/v1` | Keep the plist key; drop ATS exemption for prod. |
| Envelope | `APIResponse{success,data,message}` unwrapped in `APIClient` | `TransformInterceptor` wraps every REST response as `{success:true, data}` (`data?.data !== undefined ? data.data : data`); errors `{success:false, message,...}` | Correct contract; only the generic constraint is wrong. `/realtime/stream` (SSE) is **not** wrapped. |
| Auth | `Authorization: Bearer <token>`; 401 → clear token | Same | OK. Token must move to Keychain. |
| Deployment target | iOS 16.0 (`project.yml`); uses `NavigationStack`, `Layout`, `TextField(axis:)`, `scrollDismissesKeyboard`, `scrollContentBackground`, `toolbarBackground`, `navigationDestination`, `.badge` (47 uses) | — | Fine for 16+. `onChange(of:) { new in }` single-arg form (3 uses) is deprecated from iOS 17 (warning only). |
| Theme | `Theme` enum: neon green `#39FF6A` on near-black; `Card`, `NeonButtonStyle`, `GhostButtonStyle`, `themedScreen()` | H5: light `#f9f9f9` surface, neon-green primary, pink secondary (`text-neon-pink`), 10px radii, wide-tracked uppercase labels, Material Symbols icons; `.dark` variant (warm black `#121110`) | Token table must be rewritten light-first with a dark set; component *pattern* (token-only colors) is good and should be kept. |
| i18n | Hard-coded Chinese literals in all 24 view files; `zh_CN` locale forced in `MatchTabView.shortTime` and `NotificationsView.relativeTime` | H5 default EN, zh dictionary, `data-no-i18n` on user content, `META_ZH` display map for metadata values (values stay English) | All strings → `String(localized:)` / catalog; metadata values must stay English in payloads. |
| Grades | `ProfileViewModel.grades = ["大一","大二",…,"博士四"]` (Chinese) | `CreateProfileDto GRADE_VALUES = ['Foundation','Year 1'..'Year 4',"Master's",'PhD Year 1'..'PhD Year 4+']` (English canonical, zh only at display) | iOS writes non-canonical grade strings; matching `universityStage` filters and H5 display map will not recognise them. |
| Age | `ProfileSetupView` slider 16…30; `ProfileEditView` stepper 16…40; sends `age` | DTO: `age` 16…40 **and** `birthday` `YYYY-MM-DD`; H5 collects **birthday** (16–40 yrs) and derives `age` client-side, submits both | Replace age controls with a date picker; compute age. |
| Data-fetch placement | Half the screens call Services directly from the view (`MatchFilterView`, `EnhancedSheet`, `PartnerProfileView`, `ConnectCodeView`, `SettingsView`, `PostDetailView`), half via `@MainActor ObservableObject` VMs | — | Pick one; the VM pattern is the one worth keeping. |
| Error handling | Every async call repeats `catch let e as APIError {…} catch {…}` | — | Extract once. |
| Realtime | 5s fixed polling in `ChatViewModel`; notifications only refreshed on tab load | H5: `EventSource ${API}/realtime/stream?token=` → `ready|message|notification|read|evicted` frames; polling downgraded to 30s/60s while SSE is up | Needs an SSE client (URLSession bytes stream) + the same fallback cadence. |
| Pull-to-refresh | `.refreshable` on several screens | H5 custom PTR on chat pane and square feeds only (explicitly **removed** from match plan pane on 2026-09-01) | Match plan pane must not have PTR. |

---

## 2. Coverage matrix — current H5 inventory → existing iOS view

H5 ids come from `apps/h5/index.html` (`page-*`, `tab-*`, `*-overlay`, `modal-*`).

| H5 page / overlay | What it is (current H5) | Existing iOS view | Verdict |
|---|---|---|---|
| `#splash` (+ `splash-skip`) | Flat logo + progress line, Skip button, boot watchdog | `Splash/SplashView.swift` | Reuse logic / redesign UI |
| `#page-auth` (Sign In / Register tabs via `switchAuthTab`) | Email+password sign-in; register = email + 6-digit code (`Send code`, 60s cooldown) + password; Terms/Privacy links → content pages | `Auth/AuthView.swift`, `LoginFormView.swift`, `RegisterFormView.swift` | Reuse logic / redesign UI (add cooldown, links) |
| `#page-banned` | "Account Suspended" + Log Out | — | **Missing** (`AuthViewModel.refresh` silently logs out on `status=="BANNED"`; login returns 401 for banned) |
| `#page-profile-setup` (`setup-wizard`, step bar) | One-field-per-screen wizard: avatar, nickname, family/given name, gender, birthday, school, city, major, grade, MBTI, nationality, bio (+counter), tags (+`add-interest-overlay` suggestions) | `Onboarding/ProfileSetupView.swift` | Needs redesign + field updates |
| `#page-questionnaire` | Mode badge, `n / total`, progress bar, watermark, question text (EN uses `titleEn`), options (`labelEn`), prev/next, **`q-nav-overlay`** grid jump, close → home | `Onboarding/QuestionnaireView.swift` | Reuse logic / redesign UI; add q-nav + EN fields |
| `#questionnaire-cards` (`q-card-romantic`, `q-card-friend`) | "Complete Your Match Profile" wall shown in a match pane for idle users without answers; retake banner for in-pool users | — (OnboardingCoordinator's optional post-setup step is not this) | **Missing** |
| `#page-home` + `#bottom-nav` | 3 tabs Match / Square / Profile; floating pill nav that hides on scroll-down | `App/MainTabView.swift` (5 tabs) | Restructure |
| `#tab-match` top bar | Left `+` (`toggleChatPlusMenu`: search contacts / scan QR / relationship graph / dark mode / language), centre segmented Chat·Romantic·Friend (`home-mode-switch`), right bell + `notif-badge` | `Matching/MatchTabView.swift` (segmented picker romantic/friend only) | Restructure |
| `#home-chat-view` | Temp sessions section (48h countdown) + confirmed sections, WeChat-style rows, empty state, banner, PTR | `Chat/ChatSessionsView.swift` | Needs field updates + redesign |
| `#home-match-romantic` / `#home-match-friend` | idle/searching "plan page" (title, sub, bleed neon countdown card with week strip, read-only preferences summary box with edit/lock, CTA join/leave), matched reveal card, relationship card / couple space mount, no-match | `Matching/MatchTabView.swift` | Reuse state machine / redesign UI |
| `#chat-overlay` (+ `chat-image-viewer`) | Header: back, partner avatar/name/location (tap → partner profile), header actions (in-chat confirm / dissolve for temp sessions), chat background; messages with ≥10-min time separators, read receipts, nudge lines, images; input: image picker (`chat-pending-image` thumb), text, round send; dissolved notice disables input | `Chat/ChatView.swift` | Reuse skeleton; substantial additions |
| `#filter-overlay` ("Edit" preferences card) | Bottom sheet: gender (all/male/female), age (Any checkbox or min/max), university stage multi-select, same university, same city, interests chips (friend), extra info textarea, **enhanced toggle + friend cells slider**, retake questionnaire, Save | `Matching/MatchFilterView.swift` + `Matching/EnhancedSheet.swift` | Merge + redesign + field updates |
| `#friend-hub-overlay` (`panel-graph` / `panel-search` / `panel-qr` with My QR / Scan) | Relationship graph (`/relationships/graph`), contact search (local filter of sessions), QR (my code + camera scanner + manual code input) | `Profile/ConnectCodeView.swift` (QR + manual only) | Partial; redesign into hub |
| `#partner-profile-overlay` | Cover hero with absolute back button, name, verified, school·grade, meta, facts, tags, photo strip, note editing (`PUT /users/me/notes`) | `Matching/PartnerProfileView.swift` | Reuse + extend |
| `#milestone-overlay` | Relationship milestones (`/matching/milestones`) | — (`Milestones` model exists, unused) | **Missing** |
| `#tab-square` (`square-tabs` Recommend / Campus Wall / absolute-positioned Pinned, `square-track` 3-page swipe, `square-fab`) | 2-col masonry (`square-feed-grid`), card types: text card (highlighter style), image card (ratio), official large, campus-wall wide, sponsored ad, poll, event, pinned badge; per-page scroll memory; header hidden in Pinned | `Square/SquareTabView.swift` | Redesign; keep VM pagination |
| `#square-search-overlay` | Full-screen search page with own masonry grid (`GET /square/v2/search`) | — | **Missing** |
| `#post-detail-overlay` | Three-part flex (header = author, scroll body, footer composer); collapse header/footer on scroll; images viewer; like/comment counts row + date; comments grouped by thread with reply, like, anonymous alias + emoji avatar, author dot; composer row `[image][anon]+input+send`; `⋯` action card (share / report two-step); long-press comment action card; poll voting; event block (buy ticket) | `Square/PostDetailView.swift` | Reuse skeleton; substantial additions |
| `#overlay-new-post` | "Posting to" chip (board = current page, not a picker), title, content, images, bottom card: anonymous + poll toggle (campus wall only) + 2–6 poll options with remove | `Square/CreatePostView.swift` | Reuse skeleton; field updates |
| `#tab-profile` | Hero (cover pull-reveal blur, avatar, name, `verify-btn` status pill), meta, facts, photos strip, energy section (`energy-display` + Get Energy), rows: Energy, My Tickets, Edit Profile, Contact Us, Settings | `Profile/ProfileTabView.swift` | Redesign; keep VM |
| `#verify-overlay` | Student ID card photo upload + school email + Send code + code + Submit for review | `Profile/SettingsView.swift` verification section (send-code only) | Partial — **no submit** |
| `#edit-profile-overlay` (+ `add-interest-overlay`) | Avatar, cover, nickname, family/given name, gender, birthday (+age hint), school, city, major, grade, MBTI, nationality, signature (+count), bio (+count), tags, photo grid (≤6 real photos), studentId; Save | `Profile/ProfileEditView.swift` | Redesign + field updates |
| `#modal-energy-purchase` | "Get Energy": select package (pkg_30 ¥30 / pkg_60 ¥58 / pkg_100 ¥88), payment method (WeChat / Alipay / stripe), Pay button "Pay ¥X · N cells" | `Energy/EnergyView.swift` | Reuse logic / redesign UI |
| `#tickets-overlay` / `#ticket-detail-overlay` | My tickets (`/events/tickets/mine`), ticket card with QR (code), detail | — | **Missing** (no models) |
| `#notifications-overlay` / `#notif-detail-overlay` | Right-slide panel (86% width), header right-aligned; groups Today/Yesterday/Earlier; 44px icon plate + unread dot; 2-line clamp; Load More; localised titles/bodies; tap → detail overlay + mark read | `Notifications/NotificationsView.swift` (a 4th tab) | Redesign; add detail/pagination |
| `#settings-overlay` | Account (email, Password → change form), Preferences (Language, Dark mode, Push toggle), Nudge suffix, Privacy (show profile/online/moments), Support (Help, Safety, Report a Problem, Terms, Privacy Policy), Log out, version | `Profile/SettingsView.swift` | Redesign; move verification out |
| `#content-overlay` | Help / Safety / Terms / Privacy static pages (bilingual) | — | **Missing** |
| `#contact-overlay` | "Contact Us" → contact@unimatcha.ai | — | **Missing** |
| `#report-overlay` | Report a Problem (category / content / contact → `POST /reports`) | — (`ReportService` exists) | **Missing** |
| `#toast` | Global toast | — (alerts used) | **Missing** |
| Language dialog / dark-mode toggle | `openLangDialog`, `toggleDarkMode` | — | **Missing** |

---

## 3. Per-file audit

Format for each file: **Defines** → **Screen & behaviour** → **API / JSON assumed** → **Backend verdict (verified)** → **Quality issues** → **Reuse verdict**.

### 3.1 `Views/Splash/SplashView.swift` (67 lines)
- **Defines**: `SplashView` (+ DEBUG preview).
- **Screen**: near-black bg, blurred neon glow circle (pulsing), 104pt gradient circle with SF `sparkles`, "Unimatcha" 32pt heavy rounded, tagline "遇见最合适的 TA"; spring-in animations. Shown by `RootView` for a fixed 1.8 s (`DispatchQueue.main.asyncAfter`).
- **API**: none.
- **Backend verdict**: n/a.
- **Quality**: hard-coded Chinese tagline; timer-based dismissal (H5 dismisses on boot + has Skip); dark-only.
- **Reuse**: redesign UI (H5 splash = flat logo + progress line + Skip; light). Keep the "show until auth state resolved" idea but drive it from `AuthViewModel.refresh()` completion, not a timer.

### 3.2 `Views/Auth/AuthView.swift` (94 lines)
- **Defines**: `AuthView`; `InputFieldModifier` (shared text-field chrome).
- **Screen**: brand header (72pt circle + name + "找到你的长期伴侣"), 2-segment pill 登录/注册 with `.easeInOut` crossfade, hosts `LoginFormView` / `RegisterFormView` in a `NavigationStack` + `ScrollView` with `.scrollDismissesKeyboard(.interactively)`.
- **API**: none directly.
- **Backend verdict**: n/a.
- **Quality**: Chinese literals; dark theme; `InputFieldModifier` is a good reusable pattern (rename/re-token).
- **Reuse**: reuse logic / redesign UI. H5 auth page uses underline tab buttons (`data-tab="signin|register"`), and footer links to Terms/Privacy content pages.

### 3.3 `Views/Auth/LoginFormView.swift` (52 lines)
- **Defines**: `LoginFormView`.
- **Screen**: email (`.emailAddress`, no autocap) + password secure field, error text, primary button with spinner, hint "大学邮箱登录 · 每周五公布新一轮匹配". Submit enabled when both non-empty and not loading.
- **API**: `AuthViewModel.login` → `POST /auth/login` `{email,password}`.
- **Backend verdict**: **OK**. `LoginDto{email,password}`; returns `{user:{id,email,status,hasProfile,profileCompleteness}, token}` — iOS `User` has all as optional except `id,email,status` ✓. Banned → 401 "Your account has been banned…" ✓ (surfaces as error text).
- **Quality**: Chinese literals only.
- **Reuse**: reuse logic / re-skin.

### 3.4 `Views/Auth/RegisterFormView.swift` (92 lines)
- **Defines**: `RegisterFormView`.
- **Screen**: email, [6-digit code field + "发验证码" button (disabled while sending / email empty)], code hint line, password (≥8), confirm password (red outline on mismatch), error, "创建账号" (enabled when email set, code length 6, pw ≥8, pw == confirm).
- **API**: `AuthViewModel.sendRegisterCode` → `POST /auth/register/send-code {email}`; `AuthViewModel.register` → `POST /auth/register {email,password,code}`.
- **Backend verdict**: **OK**. `RegisterSendCodeDto{email}` → `{message, expiresInSec}` (dev without SMTP adds `devCode`); `RegisterDto{email, password(8–64), code(6)}` → `{user:{id,email,status,createdAt}, token}` (no `hasProfile` → `OnboardingCoordinator` falls back to `/profiles/me`, which 404s "Profile not completed" → goes to profile step ✓). Both endpoints rate-limited 30/min per IP (`AuthCodeRateLimitGuard`); 60 s resend cooldown enforced server-side (400).
- **Quality**: no client-side 60 s cooldown countdown (H5 `codeCooldown` shows "Ns"); no Terms/Privacy links; Chinese.
- **Reuse**: reuse logic; add cooldown timer; re-skin.

### 3.5 `Views/Onboarding/OnboardingCoordinator.swift` (101 lines)
- **Defines**: `OnboardingCoordinator` (post-login gate, phases `.checking/.profile/.questionnaire/.main`), `LoadingView(message:)`.
- **Behaviour**: `.checking` → if `currentUser.hasProfile == true` → main; else `profileVM.loadProfile()`, if profile exists → main else → `.profile`. After profile save → offers optional romantic questionnaire (`allowSkip: true`) → main.
- **API**: indirectly `GET /users/me` (`authVM.refresh`), `GET /profiles/me`.
- **Backend verdict**: `GET /users/me` returns `{id,email,status,verificationStatus,createdAt, modeStates:[{mode,matchState,matchSearchingSince}], profile:{…incl. birthday,studentId,wishGifts}, hasProfile, completedQuestionnaire}` — matches `User` model ✓ (`hasProfile = !!(profile && profile.nickname)`).
- **Delta vs H5 routing** (`core.js checkUserState`): H5 order is `status==='BANNED'` → `page-banned`; no profile → `page-profile-setup`; else `page-home` + `switchTab('match')` + chat view. H5 **never** shows the questionnaire right after setup; the questionnaire is gated per mode inside the match pane (`/questionnaire/completion?type=`) with a soft wall only for idle users.
- **Quality**: `LoadingView` fine; Chinese "正在准备…".
- **Reuse**: keep the coordinator pattern; drop the `.questionnaire` phase; add `.banned`.

### 3.6 `Views/Onboarding/ProfileSetupView.swift` (508 lines)
- **Defines**: `ProfileSetupView(onComplete:)`; building blocks `FormSection`, `OnboardTextField`, `PickerRow`, `NeonTag`, `FlexTagRow`, `TagFlowGrid`, `MetadataPickerSheet(title:options:selected:allowFreeText:onPick:)`.
- **Screen**: single scroll form: header; 基本信息 (nickname text, school picker, city picker); 学业与年龄 (major picker, grade chips from `profileVM.grades`, age `Slider` 16…30); 性别与偏好 (gender chips, genderPref chips); 兴趣爱好 (preset tag grid); 个人简介 (TextEditor); "保存并继续". Pickers are searchable sheets fed by `MetadataViewModel.shared` (`/metadata/uk/{cities,universities,majors}` → `{items:[String]}` ✓) with free-text commit.
- **API**: `ProfileViewModel.saveProfile` → `PUT /users/me` with `UpdateProfileRequest`. Required client-side: nickname, school, city.
- **Backend verdict**: **needs field updates**. `PUT /users/me` uses `CreateProfileDto` (all optional, upsert) ✓ path; but: `grade` values are Chinese (backend canonical `GRADE_VALUES` English) ✗; `gender` default `"female"` is pre-selected (H5 requires an explicit choice) ✗; no `birthday` (H5 collects birthday, DTO regex `YYYY-MM-DD`; DTO `age` min 16 max 40) ✗; no `familyName/givenName`, `avatarUrl` (upload via `POST /uploads/image` multipart `file` → `{url,filename}`), `mbti`, `nationality`, `tags` (H5 setup collects tags with an add-interest sheet; interests preset chips are iOS-only). `interests` Chinese preset list vs H5 free-text/English suggestions.
- **Delta vs H5**: H5 is a **step wizard** (one field per screen, `setup-step-bar`, `setup-step-num`, prev/next, empty-value blocking) not a long form; fields order: avatar → nickname → family/given name → gender → birthday → school → city → major → grade → MBTI → nationality → bio → tags.
- **Quality**: `PickerField.id = hashValue` (ok); `TagFlowGrid` uses adaptive `LazyVGrid` (fine); Chinese; `Slider` for age.
- **Reuse**: **redesign** the screen; **reuse** all building blocks (`FormSection`, `OnboardTextField`, `PickerRow`, `NeonTag`, `FlexTagRow`, `TagFlowGrid`, `MetadataPickerSheet`) after re-tokening.

### 3.7 `Views/Onboarding/QuestionnaireView.swift` (382 lines)
- **Defines**: `QuestionnaireView(mode:allowSkip:onComplete:)`; inputs `SingleChoiceInput`, `MultipleChoiceInput`, `ScaleInput`, `QuestionTextInput`.
- **Screen**: `NavigationStack`; loading / error(retry, optional skip) / empty ("本模式暂无问卷", continue) / content. Content = 5pt progress capsule, "问题 n / total", title, description, "（可选）" if not required, type-specific input, bottom bar (上一题 ghost | 下一题 / 提交问卷 neon, disabled until answered). Scale = 5 square buttons labelled 1..5 with captions "完全不同意" … "完全同意". Loads on `.task` if VM has a different mode; `onChange(vm.isSubmitted)` → `onComplete`.
- **API**: `GET /questionnaire/active?type=romantic|friend` → `QuestionnaireVersion{id,version,type,title,description,questions[]}`; `POST /answers {questionnaireVersionId, answers:[{questionId,value}]}`.
- **Backend verdict**: **OK, incomplete fields.** Response is the Prisma version with `questions (isEnabled, ordered) { options (ordered) }`. `Question` iOS model lacks `titleEn`, `code`, `semantics`, `hardness`, `weight`, `target` (v2 contract); `QuestionOption` lacks `labelEn`. `QuestionType` enum values `SINGLE_CHOICE|MULTIPLE_CHOICE|SCALE|TEXT` ✓ (unknown → `.text`). `SubmitAnswersDto` accepts any `value` ✓; response `{message, answeredCount, questionnaireVersion}` ✓. Scale direction: backend/H5 now 1 = strongly disagree … 5 = strongly agree (flipped 2026-08-30) — iOS labels already match ✓. **Not verified here**: whether H5 submits the same value shapes (single → `option.value` string, multi → `[value]`, scale → Int, text → String) — check the questionnaire mapper before reusing `AnyCodable` encoding.
- **Delta vs H5**: H5 has close (→ home match), mode badge, watermark, `q-nav-overlay` grid (green answered / outlined unanswered / ring current, tap to jump), `titleEn`/`labelEn` in EN mode, choice tick on green plate (dark-mode gotcha recorded 2026-08-30), full-page wall for idle users + retake banner for in-pool users.
- **Quality**: `QuestionTextInput` keeps local `@State` seeded once (fine); `ScaleInput` default answer 3 from VM (`getScaleAnswer` returns 3 when unanswered but `isCurrentQuestionAnswered` uses `answers[q.id] != nil` – consistent); Chinese.
- **Reuse**: **reuse core** (paging, inputs, submit) + add EN fields, q-nav grid, mode wall; re-skin.

### 3.8 `Views/Matching/MatchTabView.swift` (555 lines)
- **Defines**: `MatchTabView`; private `SearchingRing`, `PartnerMatchCard(partner:score:)`; public `AvatarCircle(urlString:fallback:size:)`, `TagChip(text:)`.
- **Screen**: `NavigationStack` titled "匹配", toolbar filter icon → `MatchFilterView` sheet; segmented `Picker` 恋人/朋友 (switch reloads). Branches on `matchingVM.state`:
  - `.idle`: hero circle, "准备好遇见 TA 了吗？/找到志同道合的朋友", "每周五 17:00 公布结果", `nextRunAt`, buttons 加入匹配 (`start(enhanced:false)`) + 使用增强匹配 (→ `EnhancedSheet`).
  - `.searching`: spinning ring, "已加入匹配池", nextRunAt label, 退出匹配 (`stop`).
  - `.noMatch`: dim hero, `status.message` fallback text, 重新加入 + 调整筛选条件.
  - `.matched/.confirming`: romantic → `PartnerMatchCard` + confirmed hint + [暂不 (dissolve) | 确认建立关系 (confirm)]; friend → list of `matches` each with card + hint + same buttons.
  - `.relationship`: romantic → partner card + "在一起 N 天" + `NavigationLink(CoupleSpaceView(matchId:))` + 解除恋爱关系; friend → list of friends with 解除.
- **API**: `GET /matching/status?mode=`; `POST /matching/start {mode,enhanced?,cells?}`; `POST /matching/stop?mode=`; `POST /matching/:matchId/confirm-relationship`; `POST /matching/:matchId/dissolve {reason?}`.
- **Backend verdict**: **OK on shape** (`getFullMatchStatus`): `{mode, matchConfig{cronExpr,description}|null, nextRunAt, state, searchingSince?, match{id,status,myConfirmed,partnerConfirmed,remainingMs,score,matchedAt,relationshipStartedAt,confirmedAt}|null, partner|null}` for romantic; `{…, state, matches:[{matchId,status,score,myConfirmed,partnerConfirmed,remainingMs,matchedAt,partner}]}` for friend ✓. `start` → `{status:'SEARCHING', message}` ✓; `stop` → `{status,message}` ✓; confirm → `{status:'WAITING'|FINAL, message}` ✓; dissolve → `{message}` ✓.
  - **Logic bugs**: (a) friend mode: backend returns `state:'matched'` whenever `matches` is non-empty — including already-`FRIEND_CONFIRMED` friends — so iOS renders "确认建立关系" buttons for confirmed friends and the friend `.relationship` branch is effectively unreachable; must branch per item on `status` (`MATCHED_FRIEND`/`FRIEND_CONFIRMING` = temp, `FRIEND_CONFIRMED` = permanent). (b) `noMatch` uses `status.message` which the backend does not send. (c) `partner` for strangers can be `{nickname, avatarUrl, hidden:true}` (privacy) – card must tolerate.
- **Delta vs H5** (2026-09-01 redesign): no mode picker in a nav bar — three-pane track (Chat / Romantic / Friend) with real horizontal drag, 12px gutter, rubber band, snap; idle/searching "plan page": 26px title + 2-line sub, **bleed neon-green countdown card** (hand-drawn rounded corners, week strip with today + reveal-day badge computed from `nextRunAt`, single-line 48px outlined big number, ticks in place), **read-only preferences summary box** (`mp-box`, fixed head "匹配偏好 + 编辑/🔒 locked while searching", scrolling body: 2×2 prefs grid, enhanced toggle read-only + sub-text, extra info text) and bottom CTA (green r12 glow join / pink-outlined "离开匹配池"); no pull-to-refresh on match panes; 30s status polling with same-state guard; matched → reveal card; relationship → couple space mounted in the romantic pane; `viewed` feedback event on card render (`POST /matching/feedback/events`) — iOS never reports feedback events (`MatchingService.reportFeedback` exists, unused).
- **Quality**: `shortTime` forces `zh_CN` and "M月d日"; `heroCircle`/SF icons vs H5 line-art; Chinese; `AvatarCircle` and `TagChip` should live in Components.
- **Reuse**: **reuse state machine + VM**; **redesign** every branch; extract `AvatarCircle`, `TagChip`, `PartnerMatchCard` (as reveal card base).

### 3.9 `Views/Matching/EnhancedSheet.swift` (193 lines)
- **Defines**: `EnhancedSheet` (sheet).
- **Screen**: header bolt icon + copy per mode; cost card (romantic fixed 3, friend = stepper 1…5 "每位朋友消耗 1 能量"); balance card (`GET /energy/balance`, insufficient warning, `NavigationLink(EnergyView())`); bottom bar "确认并开始（N 能量）" → `matchingVM.start(enhanced:true, cells:cost)` and dismiss on success.
- **API**: `GET /energy/balance` → `{totalEnergy,usedEnergy,availableEnergy}` ✓; `POST /matching/start {mode, enhanced:true, cells}` (cells only for friend) ✓ (`StartMatchDto` cells 1–5).
- **Backend verdict**: **OK**. Backend refuses with 400 "Not enough energy" when short ✓. Enhanced flag is reset per round server-side ✓.
- **Delta vs H5**: no standalone sheet; the enhanced toggle + friend cells slider live inside the preferences edit card (`filter-overlay`), and joining shows a **confirm card** ("增强确认卡", tap outside = abort) before `POST /matching/start {enhanced:true}` / `{cells:N}`; summary box shows "本轮已生效 · N 能量" using `lastEnhancedRound`.
- **Quality**: fine; Chinese.
- **Reuse**: reuse cost/balance logic; fold UI into the preferences card + a confirm card.

### 3.10 `Views/Matching/MatchFilterView.swift` (231 lines)
- **Defines**: `MatchFilterView(mode:)` (sheet).
- **Screen**: 基本 (必须同城 toggle; gender segmented 不限/男生/女生 → `"any"|"male"|"female"`); 年龄范围 (min/max steppers 16…60 with cross-clamp); 匹配依据 segmented 综合/问卷/资料 (`both|questionnaire|profile`); 补充说明 / 想认识的朋友 TextEditor (`extraMatchInfo`); toolbar 取消 / 保存.
- **API**: `GET /matching/preferences?mode=` → `MatchPreferences`; `PUT /matching/preferences` body = whole `MatchPreferences` (incl. `mode`).
- **Backend verdict**: **needs field updates**.
  - GET returns Prisma row or defaults incl. `enhancedModeEnabled`, `friendEnhancedCells` (not in iOS model — ignored; fine) ✓.
  - PUT `UpdateMatchPreferencesDto`: `ageMin/ageMax` **Min 18 / Max 60** → iOS stepper allows 16–17 → 400 ✗. `preferredGender` literal `"any"` → **hard-gates every candidate to 0** (see §0.3); H5 sends `null` ✗✗. `universityStage` (csv of `undergraduate|master|doctor`), `requireSameUniversity`, `preferredInterests` (friend chips) not editable ✗. `extraMatchInfo` MaxLength 500 (no client cap). Backend strips `enhancedModeEnabled/friendEnhancedCells` from PUT ✓ (iOS doesn't send them).
  - `matchBasis` picker: field exists server-side but the H5 edit card **does not expose it** (summary box shows gender/age/stage/same-uni/same-city/interests/extra only) — treat as hidden.
- **Delta vs H5**: entry is the "编辑" button in the summary box (or the `+` menu) not a Profile-tab row; sheet with drag-to-close handle, title centred "编辑", gender `all` → null, "Any age" checkbox → `ageMin/ageMax=null` else 18/24 defaults, stage multi-select, same-uni/same-city toggles, interests chips (friend mode, from profile), extra info textarea, enhanced toggle + cells slider, "重新填问卷", Save; save refuses when the load failed (`prefsLoadFailed`), and the summary box refreshes in place.
- **Quality**: view-owned networking; Chinese.
- **Reuse**: redesign + fix payload; reuse `sectionCard` pattern.

### 3.11 `Views/Matching/PartnerProfileView.swift` (246 lines)
- **Defines**: `PartnerProfileView(profile:)` (preloaded) / `PartnerProfileView(userId:)` (lazy).
- **Screen**: 160pt cover (or gradient) with bottom fade + 92pt avatar overlapping; name; badges (已认证 if `verificationStatus=="verified"`, MBTI, zodiac); info rows card (学校/年龄/城市/年级/专业/国籍, only non-empty); 个人简介; 兴趣爱好 chips; 个人标签 chips; 真实照片 3-col grid (104pt). Title "TA 的主页".
- **API**: `GET /users/:id/public-profile` → `PublicProfile`.
- **Backend verdict**: **OK, incomplete**. Backend returns: self/connected → `getFullPublicProfile` `{userId, verificationStatus, nickname, realName, school, grade, age, city, interests, bio, avatarUrl, socialLinks, relationshipScore, signature, coverUrl, tags, major, mbti, nationality, realPhotos, zodiac}` + `daysKnown`; stranger → `public_profile_fields` whitelist (default `STRANGER_SAFE_FIELDS` = nickname, school, grade, age, city, interests, bio, avatarUrl, signature, tags + `userId`, `verificationStatus`; `coverUrl/realPhotos/realName` always stripped) or `{nickname, avatarUrl, hidden:true}` when `privacy.showProfile=false`. iOS model decodes all of these (extras ignored) but cannot show `hidden`, `daysKnown`, `realName`, `socialLinks`, `signature` (declared, not rendered), `wishGifts` (not in response anyway).
- **Delta vs H5**: cover hero fills status bar with an absolute back button (safe-area fix 2026-08-19), school pill uses `metaLabel` (zh display), note editing (`PUT /users/me/notes {targetUserId,note}`), photo strip, fetch-failure must close the overlay (H5 open bug noted 2026-08-19 — don't repeat).
- **Quality**: view-owned networking; Chinese labels; `PublicProfile.id` falls back to a fresh `UUID()` when `userId` is nil → unstable `Identifiable` identity.
- **Reuse**: reuse + extend (hidden state, daysKnown, note, signature).

### 3.12 `Views/Chat/ChatSessionsView.swift` (194 lines)
- **Defines**: `ChatSessionsView`; private `SessionRow(session:)`.
- **Screen**: `NavigationStack` large title "聊天"; empty state; `LazyVStack` of `Card` rows: 52pt avatar, nickname + mode badge (恋爱/交友), temp countdown "剩 Nh/Nm" (from `remainingMs`), last message preview or "打个招呼吧～", unread pill. `NavigationLink → ChatView(matchId:partnerName:)`.
- **API**: `GET /chat/sessions?mode=all&limit=50` → `ChatSessionsResponse{sessions,total}`.
- **Backend verdict**: **needs field updates (decode-breaking)**. Actual session: `{matchId, mode('romantic'|'friend'), status, sessionType('temp'|'confirmed'), remainingMs|null, myConfirmed, partnerConfirmed, partner:{id, note, nickname, avatarUrl, school, gender, age}, lastMessage:{id,content,imageUrl,kind,senderId,isRead,createdAt}|null, unreadCount, chatBackground, updatedAt}`.
  - `lastMessage` is an **object**, iOS `String?` → decode throws ✗✗.
  - `partner.id` vs iOS `PublicProfile.userId` → nil; `partner.note` (user's nickname for the contact — H5 shows note first) missing ✗.
  - `sessionType` "confirmed" (iOS comment says "permanent"; only `== "temp"` is tested, harmless).
  - `lastMessageAt` does not exist (use `lastMessage.createdAt`).
  - H5 requests `limit=100` (contact search bug 2026-08-19) — iOS 50.
- **Delta vs H5**: lives in the Match tab's Chat pane; two sections (temp with countdown / confirmed), WeChat-style rows (hairline separators, 48px avatar, time at row end, preview localised: image → "[图片]", nudge → text), banner area, PTR, header `+` menu, contact search panel filters these sessions locally by nickname/school/last message.
- **Quality**: `session.lastMessage!` force unwrap after `isEmpty == false` (safe but smelly); Chinese.
- **Reuse**: reuse VM; **fix model**; redesign rows.

### 3.13 `Views/Chat/ChatView.swift` (316 lines)
- **Defines**: `ChatView(matchId:partnerName:)` / `ChatView(matchId:currentUserId:partner:)` wrapper; private `ChatScreen`, `NudgeLine`, `MessageBubble`.
- **Screen**: inline title = partner name; trailing "主页" link (only when `partner?.userId` present — never, see 3.12); message list (`ScrollViewReader`, auto-scroll to last on count change), bubbles: mine = gradient right, theirs = surface left with 32pt avatar; image messages 180×180; `kind=="nudge"` → centred capsule line; HH:mm under every bubble; input bar: wave button (`nudge`), multiline `TextField(axis:.vertical)`, round send. Polling 5 s (`startPolling` on task, stop on disappear); `loadHistory` marks read; errors → alert "发送失败".
- **API**: `GET /chat/:matchId/messages?limit=50` → `{messages,nextCursor}` ✓; `PUT /chat/:matchId/messages/read` → `{markedRead}` (decoded as `GenericResponse`, all-optional ✓); `GET /chat/:matchId/messages/poll?afterId=` → `{messages}` ✓; `POST /chat/:matchId/messages {content?,imageUrl?}` → message ✓ (400 if both empty; 403 if chat ended); `POST /chat/:matchId/nudge` → `{ok,messageId,content}` ✓.
- **Backend verdict**: **OK** (message `{id,content,imageUrl,kind,senderId,isRead,createdAt}` ✓). Not used: `PUT /chat/:matchId/background {imageUrl|null}` (confirmed chats only) → `{chatBackground}`; SSE.
- **Delta vs H5** (`chat.js`): header shows avatar + name + location, tap → partner profile; **in-chat confirm/dissolve controls for temp sessions** (the "D rule": 确认成为恋人/朋友 / 解除) driven by `myConfirmed/partnerConfirmed` and `POST /matching/:id/confirm-relationship` / `dissolve {reason:'user_dissolved'}`); chat background image (`chat-bg`); **image send** (pick → pending thumb → upload `/uploads/image` → send `{imageUrl}`), image viewer overlay; time separators only when ≥10 min apart (same-day HH:MM / 昨天 / date, bilingual) not per bubble; "已读" under my last read bubble; dissolved notice + disabled input (`chat-dissolved-notice`); send concurrency guard, snapshot of matchId before async, cursor not advanced by own messages, id de-dup; polling 5 s → 30 s when SSE connected; `openedProfile` feedback event when opening partner profile.
- **Quality**: `text!` force unwrap in `NudgeLine`; `currentUserId` may be `""` if `authVM.currentUser` nil (no guard); `DateFormatter` allocated per bubble; Chinese.
- **Reuse**: reuse skeleton (list + input + polling); add everything in the delta list.

### 3.14 `Views/Components/FlowLayoutView.swift` (51 lines)
- **Defines**: `FlowLayout: Layout` (spacing param; wraps subviews left-to-right).
- **Backend**: n/a.
- **Quality**: correct, iOS 16 `Layout`; no cache use (fine at chip counts).
- **Reuse**: **reuse as-is**.

### 3.15 `Views/Couple/CoupleSpaceView.swift` (479 lines)
- **Defines**: `CoupleSpaceView(matchId:)` (owns `CoupleViewModel`).
- **Screen**: cover header (160pt, dual 60pt avatars 我/TA with heart); 在一起 N 天 (+ "自 yyyy-mm-dd"); 我爱你 card (累计 total, mine/TA counts, "说我爱你" pulse button); 状态 / 想吃 editable rows → text-entry sheets; 心愿单 (toggle done, add sheet); 纪念日 list (add sheet with free-text date "YYYY-MM-DD"); empty/error state with retry. Title "情侣空间".
- **API**: `GET /couple/:matchId`; `POST /couple/:matchId/love-you`; `PUT /couple/:matchId/status {status}`; `POST /couple/:matchId/craving {text}`; `POST /couple/:matchId/bucket {text}`; `PATCH /couple/:matchId/bucket/:id {done,note?}`; `POST /couple/:matchId/anniversary {title,date}`; (`PUT /couple/:matchId/cover {imageUrl?}` in service, unused).
- **Backend verdict**: **needs field updates (decode-breaking)**. Actual `getSpace`: `{matchId, daysTogether, since, partner:{userId,nickname,avatarUrl,bio}, me:{userId}, cover, loveYou:{me:{count,sentToday}, partner:{count}}, status:{me,partner}, craving:{me:{current,history[]}, partner:{current}}, schedule:{me:[{id,text,startAt,endAt,expired}],partner:[…]}, gifts:{me:[String],partner:[String]}, anniversaries:[{id,title,date,note,images[],daysUntil}], bucket:[{id,text,done,createdBy,doneBy,doneNote,doneImages[]}]}`. iOS `CoupleSpace.status: String?`, `craving: String?`, `gifts: [String]?`, `loveYou{mine,partner,total,unlocked}`, `schedule: [CoupleSchedule]?` all mismatch → decode throws ✗✗. `me` lacks nickname/avatar (iOS shows "我" fallback – fine). Mutations return the **full space** (decoded as all-optional `GenericResponse` → succeeds, then VM reloads — wasteful but OK). Love-you is once per day server-side (`sentToday`) — iOS has no gating/feedback. Routes not covered: `POST/DELETE schedule`, `PATCH/DELETE anniversary/:id` (note/images), `DELETE bucket/:id`, bucket `image/images`, cover set.
- **Delta vs H5** (`couple.js`, mounted in the romantic pane, plus `milestone-overlay` via `/matching/milestones` → `{state:'relationship', daysTogether, messageCount, postCount, sharedInterests, matchScore, startedAt}`): cover with pull-reveal, per-side status/craving (mine editable, partner's shown), craving history chips, schedules with expiry, gifts (mine vs partner's wish list from profile `wishGifts`), anniversaries with countdown + images/note, bucket with done-by/note/images, "I love you" with sentToday state and 100×100 milestone notification, dissolve entry.
- **Quality**: manual date string entry (no `DatePicker`); `value!` force unwrap in `editableRow`; Chinese.
- **Reuse**: reuse the card composition idea; **rewrite models** and rebuild to H5.

### 3.16 `Views/Energy/EnergyView.swift` (275 lines)
- **Defines**: `EnergyView` (pushed screen; owns `EnergyViewModel`).
- **Screen**: balance card (可用能量 48pt, 总获取 / 已使用); 每日签到 card ("签到" → `claim daily-checkin`); 充值套餐 2-col grid (cells + ¥price, tap = purchase → confirm immediately with `transactionId:"mock-<orderId>"`); 近期流水 list (icon/label per type RECHARGE/CLAIM/REFUND/CONSUME, +/- amount). Alerts for info/error. Title "能量中心".
- **API**: `GET /energy/balance` ✓; `GET /energy/packages` → `[{packageId,cells,priceCny}]` ✓ (pkg_30 ¥30 / pkg_60 ¥58 / pkg_100 ¥88); `POST /energy/purchase {packageId}` → `{orderId,packageId,cells,priceCny}` ✓; `POST /energy/purchase/confirm {orderId,packageId,transactionId?}` → `{success,availableEnergy,transactionId}` ✓ (idempotent by orderId); `POST /energy/claim {claimType:'daily-checkin'}` → `{success,grantedEnergy,availableEnergy}` ✓ (400 "already claimed" second time; grants 1); `GET /energy/transactions?page&limit` → `{items:[{id,type,amountEnergy,balanceAfter,reason?,createdAt,…}],total,page,limit}` ✓.
- **Backend verdict**: **OK**.
- **Delta vs H5**: H5 has **no energy centre page**: energy shows as a cell bar on the Profile tab (`energy-display`) and the purchase flow is `modal-energy-purchase` — "Get Energy": pick package → pick payment method (WeChat / Alipay / stripe radio rows) → "Pay ¥X · N cells" → purchase+confirm → toast + refresh. H5 exposes no check-in button (a `claimEnergy(claimType)` helper exists in `profile.js` but no UI) and never calls `/energy/transactions`. Whether to keep check-in / transactions on iOS is a product call — the backend supports both.
- **Quality**: fine; Chinese; `priceString` OK.
- **Reuse**: reuse VM/purchase logic; redesign as the H5 sheet (packages + payment method + pay), optionally keep check-in/ledger as extras.

### 3.17 `Views/Notifications/NotificationsView.swift` (134 lines)
- **Defines**: `NotificationsView` (a tab).
- **Screen**: `NavigationStack` "消息", toolbar 全部已读 (disabled when `unread==0`); list of `Card` rows: 40pt icon circle (SF by `type`), title (bold if unread), body 3-line clamp, relative time (`RelativeDateTimeFormatter`, zh_CN), unread dot. Empty state. `.task` load, `.refreshable`.
- **API**: `GET /notifications?page=1&limit=20` → `{items:[{id,type,title,body,isRead,createdAt,metadata}],total,unread,page,limit}` ✓; `PUT /notifications/read` ✓; (`GET /notifications/unread-count` → `{unreadCount}` used by `MainTabView` badge ✓; `PUT /notifications/:id/read` in service, unused).
- **Backend verdict**: **OK on shape**; **icon map is stale**: real `type` values are `like, comment, milestone, system, relationship_confirmed, relationship_dissolved, match_result, no_match, match_expired, friend_added, energy_refunded` (iOS only recognises `match/message/like/comment/system/energy` → most fall to the bell). `metadata` carries `{matchId?, postId?, commentId?, mode?, …}` ✓.
- **Delta vs H5** (`notifications.js`): opened from the bell in the Match top bar as a **right-slide panel** (not a tab); header on the right (title + `arrow_forward` close); groups Today / Yesterday / Earlier; 44px rounded icon plate with unread pink dot at its corner; 2-line body clamp; "Load More" pill (page size `NOTIF_PAGE_SIZE`); tap → `notif-detail-overlay` (full text) + `PUT /notifications/:id/read`; **titles/bodies are localised client-side** (`localizeNotif`: 16 title map + regex patterns for dynamic bodies since backend strings are English); bilingual relative time; 60s poll fallback + SSE `notification` frame.
- **Quality**: `markAllRead` rebuilds immutable structs; no pagination; Chinese; zh_CN forced.
- **Reuse**: reuse VM + list; redesign as overlay; add detail, paging, localisation, type map.

### 3.18 `Views/Profile/ConnectCodeView.swift` (173 lines)
- **Defines**: `ConnectCodeView` (pushed).
- **Screen**: my code card (208pt plate, CoreImage `CIFilter.qrCodeGenerator` at 10× scale on white, monospaced code, copy button); "输入对方连接码" card (uppercase monospaced field, 添加好友 button, inline result message). Title "我的连接码".
- **API**: `GET /users/me/connect-code` → `{connectCode}` ✓ (auto-generated `CL` + 8 chars); `POST /matching/connect {code}` → `{matchId, message, partner}` ✓ (400 self / empty, 404 invalid).
- **Backend verdict**: **OK**.
- **Delta vs H5** (`friend-hub-overlay`, `addfriend.js`): one "Friends" hub with three panels — relationship graph (`GET /relationships/graph`), contact search (local), QR panel with **My QR / Scan** segmented (camera scanner via `addfriend-reader`, `addfriend-cam-error` fallback to manual `addfriend-code-input` + Add narrow button). Entry is the `+` menu in the Match top bar, not the Profile tab.
- **Quality**: view-owned networking; `CIContext` per view (fine); Chinese.
- **Reuse**: **reuse QR generation**; add camera scanning (`AVCaptureMetadataOutput` / `DataScannerViewController`), graph and search panels; rehome under the hub.

### 3.19 `Views/Profile/ProfileEditView.swift` (419 lines)
- **Defines**: `ProfileEditView` (pushed; binds `ProfileViewModel`).
- **Screen**: avatar row ("头像上传即将开放" – **no upload UI**); 基本信息 (nickname; city/school/major via pushed searchable pickers; grade/gender/偏好性别 via `Menu`; age `Stepper` 16…40); 个性属性 (MBTI, 星座, 国籍 menus); 个性签名; 个人标签 (preset chips + custom chips ≤10 + add field); 个人简介 TextEditor; 社交联系方式 (wechat/qq/xiaohongshu/weibo/instagram); "保存资料" → `saveProfile` → dismiss.
- **API**: `PUT /users/me` (`CreateProfileDto`) ✓ path; `MetadataViewModel` lists ✓ (`/metadata/mbti-types`, `/metadata/nationalities`).
- **Backend verdict**: **needs field updates**: grade Chinese values ✗ (see §1); sends `age` not `birthday` ✗; `zodiac` Chinese literals ok-ish (free string) but H5 no longer edits zodiac; `socialLinks` is a valid DTO field but H5 edit page **does not expose it** (iOS-only section); missing `familyName/givenName`, `birthday`, `avatarUrl`/`coverUrl` upload (`POST /uploads/image`), `realPhotos` grid (≤6; also `POST /uploads/real-photo {url}` helper), `studentId` (≤32, self-only), `signature` ≤100 with counter, `tags` ≤10 × ≤20 chars (iOS enforces count only), `wishGifts` (≤5, partner-only).
- **Delta vs H5** (`edit-profile-overlay`): full-screen overlay, cover + avatar pickers at top (camera badge), soft-filled inputs (no underlines), 2-col grid with tight gaps, gender select + birthday date input with live age hint, `add-interest-overlay` for tags (no "+ Add New" chip — removed 2026-08-31), photo grid, studentId, save validates nickname first (button-lock bug fixed 2026-08-06 — don't re-introduce); after save → `switchTab('match')` for fresh users.
- **Quality**: three separate search `@State`s; `Menu` for long lists (nationalities) is poor UX; Chinese preset tags; Chinese.
- **Reuse**: reuse `sectionCard/fieldRow/pickerNavRow/inlineMenuRow/searchablePicker` builders; redesign fields to the H5 set.

### 3.20 `Views/Profile/ProfileTabView.swift` (266 lines)
- **Defines**: `ProfileTabView` (tab).
- **Screen**: header card (132pt cover + scrim, 72pt avatar with green ring if verified, nickname + `checkmark.seal`, "school · grade", chips MBTI/zodiac/age); 资料完整度 bar (`profileCompleteness`); entries card (编辑资料 / 匹配偏好(romantic) / 我的连接码 / 能量中心 / 设置); 退出登录; "Unimatcha v1.0.0". Loads `/profiles/me` on task; refreshable also refreshes `/users/me`.
- **API**: `GET /profiles/me` → Prisma profile + `{joinedAt, connectCode, verificationStatus}` ✓ (iOS model ignores the extras; `verificationStatus` is read from `authVM.currentUser` instead).
- **Backend verdict**: **OK**.
- **Delta vs H5** (`tab-profile`): hero with cover pull-to-reveal (blur mask fades with pull distance), avatar, name, **`verify-btn`** pill (opens `verify-overlay` / shows status), meta line (school via `metaLabel`), facts row, photos strip, energy section (cells bar + "Get Energy" → energy modal), rows: **Energy, My Tickets, Edit Profile, Contact Us, Settings**. No completeness bar, no logout (moved to Settings), no version (in Settings), no preferences/connect-code rows (moved to Match `+` menu / hub).
- **Quality**: Chinese; version string literal.
- **Reuse**: reuse VM; redesign layout and menu.

### 3.21 `Views/Profile/SettingsView.swift` (327 lines)
- **Defines**: `SettingsView` (pushed).
- **Screen**: 隐私 (接收推送通知 / 展示我的资料 / 展示在线状态 / 展示我的动态 toggles, persisted on each change); 拍一拍后缀 (field + 保存后缀); 修改密码 (current/new ≥6/confirm → 更新密码); 校园邮箱认证 (status badge from `authVM.currentUser.verificationStatus`, email field, 发送验证码, dev code display); 关于 (版本 1.0.0); 退出登录.
- **API**: `GET/PUT /users/me/settings` ✓ (`{pushEnabled, privacy:{showProfile,showOnline,showMoments,searchable,discoverable}}` — iOS model has the 3 visible keys; PUT merges only booleans provided ✓); `PUT /chat/nudge-suffix {suffix}` → `{nudgeSuffix}` ✓ (≤40 chars server-side); `POST /auth/change-password {currentPassword,password}` ✓ but DTO **MinLength 8** vs iOS check ≥6 ✗ (400 for 6–7 chars); `POST /users/me/verification/send-code {schoolEmail}` → `{message, expiresInSec}` (+`devCode` only in dev) ✓; **missing** `POST /users/me/verification/submit {studentCardUrl, schoolEmail, code}` → status `pending` ✗ (flow is incomplete: code is sent but can never be submitted).
- **Backend verdict**: needs field updates (password min, verification submit).
- **Delta vs H5** (`settings-overlay`): Account (email display, Password row → inline change form), Preferences (**Language**, **Dark mode**, Push toggle), Nudge suffix ("…nudged me" + save), Privacy (3 toggles — searchable/discoverable UI was deliberately removed 2026-08-19), Support (Help Center / Safety Tips / Report a Problem / Terms / Privacy Policy → `content-overlay` / `report-overlay`), Log out, "Unimatcha v2.4.0". Verification lives in `verify-overlay` (card photo + email + code + submit) opened from the Profile hero.
- **Quality**: view-owned networking; `settings` not reverted on save failure; Chinese.
- **Reuse**: reuse actions; redesign sections; move verification to its own screen with upload + submit.

### 3.22 `Views/Square/CreatePostView.swift` (194 lines)
- **Defines**: `CreatePostView(board:onPosted:)` (sheet).
- **Screen**: 发布到 2-segment board picker (推荐/校园墙); 标题（可选）; 内容 TextEditor (min 160pt); 匿名发布 toggle card; toolbar 取消 / 发布 (enabled when content non-empty).
- **API**: `POST /square/v2/posts {board:'recommend'|'campus_wall', title?, content, images:nil, anonymous, tags:nil}` → shaped post ✓.
- **Backend verdict**: **OK, incomplete**: `CreatePostDto` also has `images[]`, `tags[]`, `postType:'normal'|'poll'`, `pollOptions[2..6]` (each ≤50; poll → `reviewStatus:'pending'`, author-only until approved); `title` ≤100, `content` ≤2000 (no client caps). Campus wall requires profile school (server derives `school`; H5 pre-checks and redirects to edit profile — 2026-07-26).
- **Delta vs H5** (`overlay-new-post`): no board picker — board = the page the FAB was tapped on, shown as a "Posting to" chip; order: chip → title → content → image picker (`post-image-input`, upload on submit); bottom card group: anonymous toggle, **poll toggle (campus wall only)** + option inputs with add/remove (min 2) and renumbered placeholders; page header Cancel / Publish (safe-area `shrink-0` bug 2026-08-19).
- **Quality**: fine; Chinese.
- **Reuse**: reuse skeleton + submit; add images/poll; remove board picker.

### 3.23 `Views/Square/PostDetailView.swift` (414 lines)
- **Defines**: `PostDetailView(postId:)` (pushed via `navigationDestination(for: String.self)`).
- **Screen**: author header (anon → `anonymousAuthor.nickname` "匿名同学"; 推广 badge; school + date); title; content; images stacked full-width; like bar (heart toggle optimistic + reconcile, comment count); Divider; 评论 N list (top-level + replies indented 42pt; name/date/content/image); bottom composer (`safeAreaInset`) text + paperplane; `⋯` menu: 举报 (alert with reason text field) / 删除 (if `isMine`, confirm alert).
- **API**: `GET /square/v2/posts/:id` ✓; `POST /square/v2/posts/:id/like` → `{liked, message}` ✓; `POST /square/v2/posts/:id/comments {content, imageUrl?, parentCommentId?}` → comment ✓ (content ≤500; **`anonymous?`** not sent); `POST /square/v2/posts/:id/report {reason?}` → `{reported, reporterCount, hidden, message}` ✓ (≤200); `DELETE /square/v2/posts/:id` → `{message}` ✓.
- **Backend verdict**: **OK on shape, incomplete fields**. Detail = `shapePost(post)` (Prisma post spread: `board` UPPERCASE, `authorType`, `postType`, `pollOptions:[{text,votes}]`, `reviewStatus`, `eventId`, `isPinned`, `tags`, `likeCount`, `commentCount`, `school`, `images`, `anonymous`, `isSponsored`, `authorUser{id,profile{nickname,avatarUrl}}` or null, `anonymousAuthor{aliasSeed,nickname,avatarUrl:null}`, `anonymousAuthorToken`, `isMine`; `authorUserId` removed when anonymous) + `comments` (via `shapeComments`+`anonymizeComments`: each `{id, content, imageUrl, parentCommentId, anonymous, createdAt, likeCount, myLiked, user:{profile:{nickname,avatarUrl}} (no id), anonymousAuthor?, anonymousAuthorToken?, replies[]}`) + `myLiked` + `myVote` (poll). iOS `SquareComment` lacks `anonymous`, `likeCount`, `myLiked`, `anonymousAuthor` (aliasSeed), `anonymousAuthorToken`; `SquarePostDetail` lacks `postType/pollOptions/myVote/eventId/isPinned/tags/anonymousAuthorToken`. Not used: `POST /square/v2/comments/:id/like` → `{liked, likeCount}`; `POST /square/v2/posts/:id/vote {optionIndex}` → `{pollOptions, myVote}`; `GET /events/:id` / `POST /events/:id/purchase {paymentMethod?}` for event posts.
- **Delta vs H5** (`post-detail-overlay`, ~2026-08-10…08-19 work): three-part flex page (header = back + **author** avatar/name/school-or-official badge + `⋯`; scroll body; footer composer) with header/footer collapse on scroll-down (absolute + padding compensation; footer height var); date at the end of the like/comment row; comment threads grouped (parent + replies 28px spacing), reply button sets `parentCommentId`, comment like button in-place update, per-comment anonymous alias localised from `aliasSeed` (zh/en animal names + emoji avatar with seed colour, font size derived from container), author dot + "作者" for `anonymousAuthorToken` match; composer row `[image][anon]+input pill+send` (61px), anonymous state shown via placeholder "正在匿名评论…", image upload deferred to send, image-only comments allowed, send guard + draft restore on failure, comment count tap scrolls to composer; `⋯` action card (share via `navigator.share`/clipboard, report two-step); long-press comment action card (share/like/report → generic `POST /reports {category:'content', content:'commentId…'}`); poll bars with vote/change vote; event block with buy ticket (energy pricing); image viewer.
- **Quality**: `reportReason` alert text field; report failure swallowed; comment `replies` only one level (matches backend); Chinese.
- **Reuse**: reuse load/like/comment/delete plumbing; rebuild layout and add comment features, poll, event, actions.

### 3.24 `Views/Square/SquareTabView.swift` (333 lines)
- **Defines**: `SquareTabView` (tab); private `SquareCardRow(card:onLike:)`.
- **Screen**: 2-segment board pill (推荐/校园墙); feed = single-column `LazyVStack` of `Card`s (38pt avatar, name + 推广/同校 badges, school, date; title 2 lines; content 4 lines; horizontal 120pt image strip (≤6); `#tag` chips; heart+count (tap = like), comment count); infinite scroll on last card; `.refreshable`; empty state with 发布动态; campus wall gate when `needProfileSchool`; toolbar compose → `CreatePostView` sheet.
- **API**: `GET /square/v2/recommend?page&limit` / `GET /square/v2/campus-wall?page&limit` → `{items, page, limit, total, hasMore, needProfileSchool?}` ✓ (limit clamped 1–50; also accept `cursor`, `search`); `POST …/like` ✓.
- **Backend verdict**: **OK on shape** (`shapeCard` = `shapePost` + `cardType:'large'|'medium'|'small'` + `sameSchool`); iOS `SquareCard` already has `cardType` but never uses it. Missing endpoints: `GET /square/v2/pinned` → `{items,total,needProfileSchool?}`; `GET /square/v2/search?q&board?&page&limit` → `{query, posts:{items,page,limit,total,hasMore}}` (items may carry `commentSnippet`); `GET /ads/feed?school&limit=3` + `POST /ads/events` (sponsored cards + impression/click batches).
- **Delta vs H5** (`tab-square`, `square.js`): header segmented "Recommend / Campus Wall" centred + absolutely-positioned smaller "Pinned" segment to the right (baseline-aligned, hidden until data), ink underline, search icon → search page; **3-page track** with real horizontal drag/snap (page index ±1, clamped), per-page scroll position memory, re-tap bottom nav = scroll top + reload current page only, header hides in Pinned; **2-column masonry** (`grid-auto-rows:1px`, JS span = ⌈h⌉+6, explicit column placement with hole fill, ResizeObserver + fonts.ready re-layout); card kinds: small text card (cream bg, bold left text, first-phrase highlighter stripe, no author school badge, "title + avatar/nickname + likes" only), image card with height by image ratio (110–300 clamp), official large card, campus-wall medium wide card (avatar/nickname/time/body/comments/likes), sponsored ad card, poll card (bars, vote), event card (time/place/price, buy), pinned badge (`isPinned`) on wall/pinned pages; draggable FAB (`square-fab`) clamped inside safe area; PTR; likes synced across recommend/wall/search caches.
- **Quality**: `SquareViewModel.like` doesn't use `LikeResult.message`, ok; `withLike` copy-constructor is brittle; Chinese.
- **Reuse**: reuse VM pagination + like sync; **redesign** everything visible.

---

## 4. Shared components inventory (where they live today → recommendation)

| Component | Defined in | Notes | Keep? |
|---|---|---|---|
| `Theme` tokens, `Color(hex:)`, `NeonButtonStyle`, `GhostButtonStyle`, `Card`, `themedScreen()` | `App/Theme.swift` | Pattern good; palette dark-only | Keep pattern, rewrite palette light-first + dark set |
| `InputFieldModifier` | `Auth/AuthView.swift` | soft-filled input chrome | Keep (rename `SoftField`) |
| `LoadingView` | `Onboarding/OnboardingCoordinator.swift` | spinner + caption | Keep |
| `FormSection`, `OnboardTextField`, `PickerRow`, `NeonTag`, `FlexTagRow`, `TagFlowGrid`, `MetadataPickerSheet` | `Onboarding/ProfileSetupView.swift` | good form primitives | Keep, move to `Components/` |
| `SingleChoiceInput`, `MultipleChoiceInput`, `ScaleInput`, `QuestionTextInput` | `Onboarding/QuestionnaireView.swift` | correct per type | Keep, add `labelEn` |
| `AvatarCircle`, `TagChip` | `Matching/MatchTabView.swift` | generic | Keep, move to `Components/` |
| `PartnerMatchCard`, `SearchingRing` | `Matching/MatchTabView.swift` (private) | reveal-card base / spinner | Redesign |
| `SessionRow` | `Chat/ChatSessionsView.swift` (private) | | Redesign (WeChat rows) |
| `MessageBubble`, `NudgeLine` | `Chat/ChatView.swift` (private) | | Keep bubble idea; add image/time-separator/read |
| `FlowLayout` | `Components/FlowLayoutView.swift` | | Keep as-is |
| QR generator (`qrImage(from:)`) | `Profile/ConnectCodeView.swift` | CoreImage | Keep, extract |
| `sectionCard/fieldRow/pickerNavRow/inlineMenuRow/socialRow/searchablePicker` | `Profile/ProfileEditView.swift` | | Keep builders |
| `sectionCard/toggleRow/themedField/secureField/badge` | `Profile/SettingsView.swift` | duplicates of the above | Merge into one settings-row kit |
| `SquareCardRow` | `Square/SquareTabView.swift` (private) | single-column card | Replace with masonry card kinds |

---

## 5. Consolidated backend-contract deltas (verified against `apps/api/src`)

| Area | iOS assumes | Backend actually | Severity |
|---|---|---|---|
| Envelope generics | `request<T: Decodable>` + `APIResponse<T: Codable>` | any `Decodable` payload | **Compile error** |
| `GET /chat/sessions` | `lastMessage: String?`, `partner.userId`, `lastMessageAt` | `lastMessage` object, `partner.id` + `note/gender/age`, `chatBackground`, `updatedAt`, `sessionType 'confirmed'` | **Decode failure** |
| `GET /couple/:matchId` | flat `status/craving` strings, `loveYou{mine,partner,total}`, `gifts:[String]`, `schedule:[…]` | nested `{me,partner}` structures; bucket `doneBy/doneNote/doneImages`; anniversaries `daysUntil/note/images` | **Decode failure** |
| `PUT /matching/preferences` | `preferredGender:"any"`, `ageMin` from 16 | `null` = no preference (non-empty string is a hard gate); `ageMin/ageMax` 18–60 | **Logic bug / 400** |
| `POST /auth/change-password` | new pw ≥6 | `MinLength(8)` | 400 |
| Profile grade | Chinese labels | `GRADE_VALUES` English canonical | data corruption |
| Profile age | `age` only | `birthday` + derived `age` | field update |
| Verification | send-code only | + `POST /users/me/verification/submit {studentCardUrl, schoolEmail, code}` | missing flow |
| Comments | `{content,imageUrl,parentCommentId}` | + `anonymous`; response adds `anonymous, likeCount, myLiked, anonymousAuthor{aliasSeed}, anonymousAuthorToken` | field update |
| Posts | no `postType/pollOptions/tags/images` on create; no `isPinned/myVote/eventId/pollOptions` on read | present | field update |
| Notifications `type` | `match/message/like/comment/system/energy` | `like, comment, milestone, system, relationship_confirmed, relationship_dissolved, match_result, no_match, match_expired, friend_added, energy_refunded` | icon map |
| Friend match state | `.relationship` branch for confirmed friends | `state:'matched'` whenever `matches` non-empty; per-item `status` distinguishes temp vs `FRIEND_CONFIRMED` | logic bug |
| Public profile | always full object | may be `{nickname, avatarUrl, hidden:true}`; connected adds `daysKnown`, `realName`, `socialLinks` | field update |
| Questionnaire | `title/label` only | `titleEn/labelEn/code/semantics/hardness/weight/target` | field update |
| Not modelled at all | — | `/square/v2/pinned`, `/square/v2/search`, `/square/v2/comments/:id/like`, `/square/v2/posts/:id/vote`, `/events/*`, `/ads/feed`, `/ads/events`, `/relationships/graph`, `/users/me/notes`, `/chat/:id/background`, `/couple/*/schedule`, `/matching/milestones` (model only), `/matching/feedback/events` (service only), `/reports` (service only), `/realtime/stream` | missing |
| Unverified (backend OK, iOS OK) | auth, users/me, profiles/me, settings, connect-code, matching status/start/stop/confirm/dissolve, chat messages/poll/send/read/nudge/nudge-suffix, energy (all), notifications (all), metadata, uploads/image, questionnaire/active, answers | | — |

---

## 6. Code-quality items not to carry forward

1. Never-compiled generic constraint (`APIClient.request` / `APIResponse`), plus `AuthService.SendCodeResponse: Decodable` (same).
2. `TokenStorage` in `UserDefaults` (token **and** full user JSON) → Keychain for token; user object in memory/cache only.
3. Hard-coded Chinese UI strings in all 24 view files; forced `zh_CN` locales in date/relative formatters; Chinese metadata lists (`grades`, `zodiacOptions`, `presetTags`, gender labels) in `ProfileViewModel`.
4. Dark-only palette; UIKit global appearance mutation (`UITabBar.appearance()` in `MainTabView.onAppear`).
5. Force unwraps after `isEmpty == false` checks (`ChatSessionsView:128`, `ChatView:215`, `CoupleSpaceView:275`); `body.append(s.data(using:.utf8)!)` in `APIClient.uploadImage`.
6. Unstable `Identifiable` ids: `PublicProfile.id` → random `UUID()` when `userId` nil; `QuestionOption.id` similar fallback.
7. Timer-driven splash (`asyncAfter 1.8s`) instead of auth-resolution-driven.
8. Networking called directly from views (6 screens) vs VMs (rest); duplicated `catch` ladders everywhere.
9. `ChatViewModel` fixed 5 s polling with no SSE and no visibility awareness; own messages appended without id de-dup against poll results.
10. `NotificationViewModel.markAllRead` rebuilds structs because model fields are `let`.
11. `EnergyViewModel.purchase` auto-confirms with a fake transaction id (fine for mock, but H5 has a payment-method step — keep the two-step UI).
12. `PostDetailView.submitReport` swallows errors silently; report reason via `alert` text field.
13. `MatchTabView.noMatchView` reads a `status.message` field the backend never sends.
14. `ProfileSetupView`/`ProfileEditView` age controls (slider/stepper) instead of birthday `DatePicker`.
15. `MatchFilterView` steppers allow 16–17 (backend min 18); `"any"` literal.
16. `SettingsView` password min 6 (backend 8).
17. `MainTabView` 5-tab shell and `OnboardingCoordinator` optional questionnaire phase — both structurally wrong vs H5.
18. `onChange(of:) { v in }` single-arg (3 uses) — deprecated in iOS 17, fine on 16.
19. `Menu` used for 40+-item pickers (nationalities) in `ProfileEditView`.
20. `Info.plist` `NSAllowsArbitraryLoads=true`.
