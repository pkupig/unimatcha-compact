# Unimatcha — User Data Inventory for Matching

> Purpose: the complete set of signals the backend holds about a user, as the design
> surface for the matching algorithm. Read directly from `apps/api/prisma/schema.prisma`
> and the seed. Use it to decide what the scorer/pairing consumes.

**Legend**
- `●` required / reliably set (enforced at registration or always present)
- `○` optional — collected but frequently empty/sparse
- `✗` stored but **NOT consumed by the current matching algorithm** (free signal for a new design)

**How user data is keyed**
- Most rows are **per user**.
- `UserModeState` and `UserMatchPreferences` are **per user *and* per mode** (`"romantic"` | `"friend"`) — a user can have totally different state/prefs in each mode.
- Questionnaire `Answer`s are **per user + questionnaire version + question** (separate romantic vs friend questionnaires).

---

## 1. Account / Identity — `User`

| Field | Type | Set | Used by matching | Notes |
|---|---|---|---|---|
| `id`, `email` | string | ● | id only | identity |
| `status` | enum `ACTIVE` / `BANNED` | ● | **eligibility** | BANNED users excluded from the pool |
| `verificationStatus` | `unverified` / `pending` / `verified` / `rejected` | ● | ✗ | student-ID trust signal (unused) |
| `studentCardUrl` | string? | ○ | ✗ | uploaded student card (admin review) |
| `schoolEmail` | string? | ○ | ✗ | verified school email — authenticity signal |
| `connectCode` | string? (unique) | ○ | ✗ | QR add-friend code |
| `settings` | JSON? | ○ | ✗ | see breakdown below |
| `createdAt` / `updatedAt` | datetime | ● | ✗ | account age / recency (could gate re-matching) |

`settings` JSON sub-keys (per user):
- `pushEnabled` — boolean
- `privacy` — `{ showProfile, showOnline, showMoments }`
- `notes` — `{ [otherUserId]: "private note text" }` — **per-user private notes about other users**
- `chatBackgrounds` — `{ [matchId]: url }`
- `coupleCovers` — `{ [matchId]: url }`
- `nudgeSuffix` — string (custom "X nudged you …" suffix)

---

## 2. Profile / Demographics — `Profile` (one per user)

| Field | Type | Set | Used by matching | How it's used today |
|---|---|---|---|---|
| `nickname` | string? | ● | display | — |
| `realName` / `familyName` / `givenName` | string? | ● (required at setup) | ✗ | not scored |
| `gender` | string? | ● (required) | **hard gate** | romantic bidirectional gender-pref check |
| `genderPref` | string? | ● (required) | **hard gate** | romantic compatibility (`any` / specific) |
| `age` | int? | ● (required) | demographic + filter | romantic age-diff bands; `ageMin/ageMax` window |
| `school` | string? | ● (required) | score + filter | same-school bonus; `requireSameUniversity` |
| `city` | string? | ● (required) | score + filter | same-city bonus; `requireSameCity` |
| `grade` | string? | ● (required) | filter only | regex → infer `undergraduate` / `master` / `doctor` stage |
| `interests` | string[] | ○ | friend score | friend demographic overlap (intersection count) |
| `bio` | text? | ○ | ✗ | **free text — prime AI/embedding signal, unused** |
| `signature` | text? | ○ | ✗ | short tagline (unused) |
| `tags` | string[] | ○ | ✗ | self-tags e.g. 学霸/猫奴 (unused) |
| `mbti` | string? | ○ | ✗ | **not even loaded into the candidate** |
| `zodiac` | string? | ○ | ✗ | unused |
| `nationality` | string? | ○ | ✗ | unused |
| `major` | string? | ○ | ✗ | unused (`requireSameMajor` pref is also dead) |
| `wishGifts` | string[] | ○ | ✗ | gift jar (partner-only display) |
| `realPhotos` | string[] | ○ | ✗ | photo wall (partner-only) |
| `avatarUrl` / `coverUrl` | string? | ○ | ✗ | display |
| `socialLinks` | JSON? | ○ | ✗ | `{ wechat, qq, xiaohongshu, weibo, instagram }` |
| `extraData` | JSON? | ○ | ✗ | open extension blob (empty) |
| `relationshipScore` | float (default 0) | derived | ✗ | leaderboard remnant |
| `profileCompleteness` | int 0-100 | derived | ✗ | data-quality signal (could weight confidence) |

---

## 3. Match Preferences / Filters — `UserMatchPreferences` (one row **per mode**)

User-set knobs, stored separately for `romantic` and `friend`. Hard filters zero the pair
score when violated; the rest are mostly reserved.

| Field | Type / default | Mode | Used by matching | Behavior today |
|---|---|---|---|---|
| `mode` | `"romantic"` \| `"friend"` | — | key | one row per (user, mode) |
| `requireSameCity` | bool (false) | both | **hard gate** | rejects pair if cities differ; **conservatively rejects if either city is blank** |
| `requireSameUniversity` | bool (false) | both | **hard gate** | rejects if schools differ; rejects if either school blank |
| `requireSameMajor` | bool (false) | both | ✗ **DEAD** | stored, never read by the scorer |
| `preferredGender` | string? | both | **hard gate** | romantic: always enforced; friend: enforced **only if explicitly set** |
| `ageMin` | int? | both | **hard gate** | rejects partner younger than min |
| `ageMax` | int? | both | **hard gate** | rejects partner older than max |
| `universityStage` | string? (CSV of `undergraduate`/`master`/`doctor`) | both | **hard gate** | rejects only if the partner's *inferred* stage is non-null AND not in this set (lenient: unknown grade passes) |
| `preferredNationalities` | string[] | both | ✗ **DEAD** | reserved |
| `preferredMbti` | string[] | both | ✗ **DEAD** | reserved (Profile.mbti also unused) |
| `preferredInterests` | string[] | both | ✗ **DEAD** | reserved (note: `Profile.interests` IS used for friend score, but this *preference* field is not) |
| `preferredActivities` | string[] | friend | **score** | injected as `candidate.activities`; friend demographic intersection (×5, cap 10) |
| `friendRequirements` | text? | friend | ✗ **DEAD** | free text — stored for a future AI matcher |
| `enhancedModeEnabled` | bool (false) | both | **economy** | turns on "enhanced" forced pairing (energy-gated, bypasses the 75 threshold) |
| `friendEnhancedCells` | int? (1; range 1–5) | friend | **economy** | guaranteed friend count N = enhanced cost in cells (romantic enhanced cost is fixed at 3) |
| `matchBasis` | string? (`"both"`; values `both`/`questionnaire`/`profile`) | both | **score blend** | `both` → questionnaire+demographic; `questionnaire` → (q/70)×100 only; `profile` → (demo/30)×100 only. **Only honored when *both* users agree**; a mismatch silently falls back to `both` |
| `extraMatchInfo` | string? | both | ✗ **DEAD** | free text — reserved |
| `createdAt` / `updatedAt` | datetime | — | ✗ | — |

**Summary of Part 3:** of ~17 preference fields, the scorer actually uses **9** (`requireSameCity`,
`requireSameUniversity`, `preferredGender`, `ageMin`, `ageMax`, `universityStage`, `preferredActivities`,
`matchBasis`, and the two enhanced/economy toggles). The rest — `requireSameMajor`, `preferredNationalities`,
`preferredMbti`, `preferredInterests`, `friendRequirements`, `extraMatchInfo` — are **collected from the user
but never read**, i.e. ready-made inputs a new algorithm can switch on with no UI/schema work.

---

## 4. Questionnaire Answers — `Answer` × `Question` (richest compatibility signal)

Versioned per mode (`QuestionnaireVersion`: `type` = ROMANTIC | FRIEND, `version`, `isActive`;
exactly one active per type). Each `Question`: `type`, `title`, `order`, `group` (the dimension),
`isRequired`, `isEnabled`; `MULTIPLE/SINGLE_CHOICE` also have `QuestionOption` rows (`label`,`value`,`order`).
Each `Answer`: `value` (JSON — number for SCALE, string for single, string[] for multi), keyed
`userId + version + questionId`.

**Supported question types:** `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `SCALE`, `TEXT`.

**ROMANTIC questionnaire — 50 questions, 5 dimensions × 10, all SCALE 1–5 Likert (agree↔disagree):**
| Dimension (`group`) | Meaning | `order` range | Count |
|---|---|---|---|
| `生活习惯` | lifestyle / daily habits | 1–10 | 10 |
| `价值观` | values / life goals | 11–20 | 10 |
| `恋爱观` | relationship/romance views | 21–30 | 10 |
| `沟通` | communication & social style | 31–40 | 10 |
| `财务观` | money / financial outlook | 41–50 | 10 |

**FRIEND questionnaire — 25 questions, 5 dimensions × 5, all SCALE 1–5:**
| Dimension (`group`) | Meaning | `order` range | Count |
|---|---|---|---|
| `社交风格` | social style | 1–5 | 5 |
| `兴趣活动` | interests / activities | 6–10 | 5 |
| `人格节奏` | personality rhythm | 11–15 | 5 |
| `价值观` | values | 16–20 | 5 |
| `生活规划` | life planning | 21–25 | 5 |

Notes for design:
- Questions carry **no per-question weight/importance column** — the dimension is just the `group` string; current weights are hardcoded per dimension in code.
- Question text is **Chinese-only seed data** (not translated for the English build).
- `TEXT` answers and free-text prefs contribute **nothing** today (no NLP/embeddings).
- Full question texts live in `apps/api/prisma/seed.ts` (`ROMANTIC_QUESTIONS`, `FRIEND_QUESTIONS`).

---

## 5. Per-Mode Matching State — `UserModeState` (one per mode)

| Field | Type | Meaning |
|---|---|---|
| `matchState` | `idle`/`searching`/`matched`/`confirming`/`relationship`/`no_match` | where the user is in the funnel |
| `matchSearchingSince` | datetime? | how long they've waited in the pool (fairness/priority signal) |
| `weeklyMatchNote` | `"no_match"` \| null | last run produced no match |

---

## 6. Energy / Economy — `EnergyBalance` + `EnergyTransaction`

- `EnergyBalance`: `totalEnergy` (credited), `usedEnergy` (consumed) → available = total − used.
- `EnergyTransaction` ledger: `type` (`RECHARGE`/`CLAIM`/`CONSUME`/`REFUND`), `amountEnergy`,
  `balanceAfter`, `relatedMatchId`/`relatedMatchMode`, `reason`, `metadata`, `dedupeKey`.
- Drives **enhanced** ("forced") matching: a user who spends energy is guaranteed a pairing that
  bypasses the score threshold (romantic cost 3, friend cost = `friendEnhancedCells`).

---

## 7. Match / Relationship History — `Match` (per pair + mode, unique)

| Field | Type | Signal |
|---|---|---|
| `status` | MatchStatus enum | MATCHED_*/*_CONFIRMING/RELATIONSHIP_*/FRIEND_CONFIRMED/REJECTED/DISSOLVED/EXPIRED |
| `score` | float? | the score the model assigned at pairing time |
| `metadata` | JSON? | `{ algorithm, version, threshold, enhancedUserId … }` |
| `userAConfirmed`/`userBConfirmed`, `confirmedAt` | bool/datetime | who accepted, when |
| `relationshipStartedAt` | datetime? | start of a confirmed relationship |
| `enhancedMode`/`enhancedUserEnergy`/`enhancedAttemptedAt` | — | enhanced-match accounting |
| `dissolvedBy`/`dissolvedAt`/`dissolveReason` | — | breakup outcome |
| `compatibilityScore`/`interactionStreak`/`growthScore`/`empathyScore` | float/int | **deprecated** leaderboard fields, still present |

→ **Outcome history** (who you were shown, confirmed, ignored→expired, or dissolved) is a complete,
**currently-unused** feedback signal — the natural input for a learning/re-ranking layer or
avoid-re-matching rules.

---

## 8. Behavioral / Social Signals — exist, **none feed matching today**

- **Chat** — `Message` per match (`content`, `kind` = `text`|`nudge`, `isRead`, `createdAt`):
  responsiveness, message volume, who-initiates, mutual engagement.
- **Square (social feed)** — `SquarePost` / `SquarePostComment` / `SquarePostLike`
  (with `anonymous`, `school`, `tags`, like/comment counts): activity level, interests-by-behavior,
  who-likes/comments-on-whom (a behavioral affinity graph).
- **Social graph** — confirmed friend + romantic `Match`es form a real relationship network
  (mutual friends, degrees of separation) — already surfaced in the "Relationship Network" feature.
- **Couple-space (confirmed couples)** — `CoupleMemberState` (status/craving/schedule/`loveYouCount`),
  anniversaries, bucket-list: relationship-health signals (post-match).
- **Trust** — `Report` rows (a user being reported), `verificationStatus`.

---

## 9. What current matching uses vs. ignores (design cheat-sheet)

**Used today:** gender, genderPref, age, city, school, grade(→stage), `interests` (friend),
`preferredActivities` (friend), the 9 active preference gates, questionnaire SCALE/SINGLE/MULTI
answers (per-dimension weighted similarity, 70 pts) + demographics (30 pts), enhanced/energy.

**Collected but unused (free inputs):** `bio`, `signature`, `tags`, `mbti`, `zodiac`, `nationality`,
`major`, `realPhotos`, `socialLinks`, `profileCompleteness`, `verificationStatus`, `matchSearchingSince`,
all `TEXT` answers, `requireSameMajor`, `preferredNationalities`, `preferredMbti`, `preferredInterests`,
`friendRequirements`, `extraMatchInfo`, **all behavioral/chat/square/outcome data**.

**Structural notes:**
- No per-question importance weighting (only dimension-level, hardcoded).
- Sparse data is treated as *moderate* (no overlap → flat 35/70; generous demographic defaults).
- Pairing is naive greedy (not reciprocal/stable); scoring weights & the 75 threshold are hardcoded.
