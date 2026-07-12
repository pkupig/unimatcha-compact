# Unimatcha — Matching Master Reference

> One self-contained reference for designing the matching algorithm: every user signal we
> hold (Part A), how the current matching system works + where a new algorithm plugs in
> (Part B), the two sharpened questionnaires (Part C), and the decisions made / pending (Part D).
> Read from `apps/api/prisma/schema.prisma`, the matching module, and the seed.

Legend: `●` reliably set (required) · `○` optional/sparse · `✗` collected but **unused by current matching**.

---

# PART A — User Data Inventory (all signals)

## A1. Account / identity — `User`
- `●` `id`, `email`; `●` `status` (ACTIVE/BANNED — **eligibility gate**); `●` `verificationStatus` (`✗` unverified/pending/verified/rejected); `○` `studentCardUrl`, `schoolEmail` (`✗` authenticity); `○` `connectCode` (QR); `●` `createdAt` (account age).
- `○` `settings` JSON: `pushEnabled`, `privacy{showProfile,showOnline,showMoments}`, `notes{[otherUserId]:text}` (private notes about others), `chatBackgrounds`, `coupleCovers`, `nudgeSuffix`.

## A2. Profile / demographics — `Profile`
| Used by matching | Fields |
|---|---|
| **hard gate** | `gender ●`, `genderPref ●` (romantic), `ageMin/Max` window |
| score + filter | `age ●`, `school ●`, `city ●`, `grade ●` (→stage), `interests[] ○` (friend) |
| `✗` collected but unused | `bio ○`(free text — AI signal), `signature ○`, `tags[] ○`, `mbti ○`, `zodiac ○`, `nationality ○`, `major ○`, `wishGifts[] ○`, `realPhotos[] ○`, `socialLinks ○`, `extraData ○`, `relationshipScore`, `profileCompleteness` |
| display | `nickname ●`, `realName/familyName/givenName ●`, `avatarUrl/coverUrl ○` |

## A3. Match preferences / filters — `UserMatchPreferences` (one row **per mode**)
**Active gates (9):** `requireSameCity`, `requireSameUniversity`, `preferredGender`, `ageMin`, `ageMax`, `universityStage` (CSV), `preferredActivities[]` (friend score), `matchBasis` (`both`/`questionnaire`/`profile`), + economy toggles `enhancedModeEnabled`, `friendEnhancedCells` (1–5).
**`✗` collected but DEAD:** `requireSameMajor`, `preferredNationalities[]`, `preferredMbti[]`, `preferredInterests[]`, `friendRequirements` (text), `extraMatchInfo` (text).

## A4. Questionnaire answers — `Answer` × `Question`
Versioned per mode (`QuestionnaireVersion`: type ROMANTIC|FRIEND, one active each). `Question`: `type` (SINGLE_CHOICE / MULTIPLE_CHOICE / SCALE / TEXT), `title`, `order`, `group` (= dimension), `isRequired/Enabled`; choice questions have `QuestionOption{label,value,order}`. `Answer.value` = JSON (number / string / string[]), keyed `userId+version+questionId`.
- **No per-question importance/weight column** (only the dimension `group` string; weights are hardcoded per dimension in code).
- See Part C for the full (redesigned) question sets.

## A5. Per-mode matching state — `UserModeState` (per mode)
`matchState` (idle/searching/matched/confirming/relationship/no_match), `matchSearchingSince` (wait time), `weeklyMatchNote`.

## A6. Energy / economy — `EnergyBalance` + `EnergyTransaction`
`totalEnergy − usedEnergy = available`; full ledger (`type`, `amountEnergy`, `reason`, `relatedMatchId/Mode`, `dedupeKey`). Drives **enhanced** forced matching.

## A7. Match / relationship history — `Match` (per pair+mode, unique)
`status`, `score`, `metadata{algorithm,version,threshold}`, confirm flags + `confirmedAt`, `relationshipStartedAt`, enhanced fields, `dissolvedBy/At/Reason`. → **Outcome history (matched/confirmed/expired/dissolved) is a complete, currently-unused feedback signal.**

## A8. Behavioral / social signals — exist, **none feed matching today**
- **Chat** `Message` (`content`, `kind` text|nudge, `isRead`, `createdAt`) → responsiveness/engagement.
- **Square** `SquarePost`/`Comment`/`Like` (anonymous, school, tags, counts) → activity, behavioral affinity graph.
- **Social graph** — confirmed friend+romantic matches = a real network (mutual friends, degrees).
- **Couple-space** `CoupleMemberState` (status/craving/schedule/loveYouCount), anniversaries, bucket — post-match health.
- **Trust** — `Report` rows.

---

# PART B — Current Matching System (and the plug point)

## B1. Pipeline (end to end)
1. **Cron** built from `MatchConfig.cronExpr` + `timezone` (DB-configured; cadence isn't hardcoded). Fires → Redis lock → serially triggers **romantic** then **friend** jobs.
2. Each trigger creates a `MatchJob` (PENDING) + enqueues a **Bull** job (3 retries) → `MatchProcessor` → `executeMatchJob(mode)`.
3. **`buildCandidates`** — pool = `UserModeState.matchState='searching'` + user ACTIVE + has profile. Romantic also requires gender+genderPref+age; friend just a profile. Each → `CandidateProfile` (see B4). `filterBlacklisted` is a **no-op stub**.
4. **`generateMatches(candidates, constraints)`** (the algorithm) → `MatchResult`.
5. Per pair: in a `$transaction`, skip if already actively matched (romantic exclusivity), else **upsert** a temp `Match` (`MATCHED_ROMANTIC`/`MATCHED_FRIEND`), set both `UserModeState='matched'`, notify.
6. **48h double-confirm:** first confirmer → `*_CONFIRMING`; both → `RELATIONSHIP_ROMANTIC`/`FRIEND_CONFIRMED`. A 10-min sweep `EXPIRES` unconfirmed matches older than 48h.
7. Romantic is **exclusive** (1 active partner); friend allows up to **5**. **Enhanced** = energy-gated forced pairing that bypasses the score threshold; refunds on empty-pool/shortfall/expiry.

## B2. Scoring (`ScoringMatchModelProvider`, the wired provider)
`calculatePairScore(a, b, mode)` → 0–100:
1. **Hard constraints** (any fail → score 0): romantic bidirectional gender-pref; both modes `requireSameCity`/`requireSameUniversity` (conservatively reject if city/school blank), `preferredGender`, `ageMin/Max`, `universityStage`.
2. **Questionnaire (70 pts):** per shared question similarity — `SCALE: 1−|a−b|/4`, `SINGLE_CHOICE: exact 1/0`, `MULTIPLE_CHOICE: Jaccard`, `TEXT: ignored`. Averaged per dimension `group`, weighted by the per-mode table, **renormalized over present groups**, ×70. **No overlapping answers → flat 35/70.**
3. **Demographics (30 pts):** romantic = age-diff bands + same-city + same-school; friend = interests∩ + activities∩ + same-school.
4. **`matchBasis` blend:** both `questionnaire` → (q/70)×100; both `profile` → (demo/30)×100; else q+demo. Threshold for normal users = **75** (enhanced bypass).

**Current hardcoded weights:**
- Romantic: 生活习惯 0.15 · 价值观 0.20 · 恋爱观 0.25 · 沟通 0.20 · 财务观 0.20.
- Friend (OLD, to be replaced by Part C): 社交风格 0.15 · 兴趣活动 0.25 · 人格节奏 0.20 · 价值观 0.20 · 生活规划 0.20.

## B3. Pairing
- **Romantic `greedyMatch`:** score all i<j pairs ≥75, sort globally desc, claim each user once (first-come). Exclusive, **not reciprocal/stable**.
- **Friend `multiMatch`:** each user keeps Top-N (≤5) partners ≥75, dedup undirected. Non-exclusive.
- **O(n²)** all-pairs, no blocking.

## B4. Plug point (where a NEW algorithm goes)
- DI token **`MATCH_MODEL_PROVIDER`** → any class implementing `generateMatches(candidates, constraints) → MatchResult`. Swap `useClass` in `matching.module.ts`.
- **`CandidateProfile`** (already assembled): `userId, gender, genderPref, age, city, school, grade, interests[], activities[], answers[]{questionId,type,value,order,group}, _prefs (the per-mode UserMatchPreferences), enhanced, enhancedCost`. (MBTI/major/nationality/tags exist on Profile but aren't loaded yet — add in `buildCandidates`.)
- **`MatchConstraints`**: `mode, maxMatchesPerUser (romantic 1 / friend 5), sameCity?, excludeRelationshipMode?`.
- **`MatchResult`** (must return): `pairs[]{userAId,userBId,score,enhanced?,metadata?}`, `unmatched[]`, `emptyPoolUserIds[]{userId,mode,cost}` (for refunds), `modelVersion?`, `processingTimeMs?`.

## B5. Gaps / known weaknesses
Naive greedy (not reciprocal/stable); hardcoded weights + 75 threshold (config `match_score_threshold` seeded but unread); sparse data inflates scores (no-overlap → 35/70, generous demo defaults); SINGLE_CHOICE is binary (no ordinal "close option"); TEXT ignored (no NLP/embeddings); MBTI/major/nationality/tags/bio + 6 preference fields collected-but-dead; **no behavioral/outcome signal**; no blacklist/cooldown/fairness; O(n²).

---

# PART C — Questionnaires (sharpened, REDESIGNED)

> All rewritten to be 犀利/一针见血 and differentiating (money, sex, exes, jealousy, family,
> ambition, face, boundaries, 嫌贫/嫌差). `量表`=SCALE 1–5; `多选`=Jaccard overlap; `单选`=stance.
> Full text also in `docs/questionnaires-final-draft.md`.

## C1. 恋爱问卷 — 50 题 · weights: 生活习惯0.15 / 价值观0.20 / 恋爱观0.25 / 沟通0.20 / 财务观0.20

**生活习惯 (0.15)**
1. `量表` 我作息基本不可能为同居的人改，TA想早睡而我半夜还亮着灯刷手机，那是TA要适应我。
2. `量表` 对方把脏碗在水槽堆两天、地上头发一周不扫，我会忍到想吵架。
3. `量表` 我心里默认家务该有一个人主要担着，而那个人不会是我。
4. `量表` 我三餐全靠外卖速食毫无压力，谁要我天天开火做饭那才是折磨。
5. `量表` 我生病时要被全程伺候，但对方病了我大概只会让TA多喝热水、自己扛。
6. `量表` 我是十足的宅人，对方周末总拉我出去社交聚会，我会累到想逃、宁可待在家。
7. `量表` 我舍不得扔东西、东西堆成山，对方想帮我断舍离、丢我旧物我会强烈抗拒。
8. `量表` 对方嫌我懒、想改造我的身材和作息，我会反感而不是感激。
9. `单选` 同居后钱怎么管最舒服？ → 共同账户各留私房钱 / 按收入比例 / 我出大头 / AA到底 / 默认对方(男生)包大头
10. `多选` 对方哪些习惯会拉低好感甚至想分手？ → 抠脚用我牙刷 / 厕所不关门不冲 / 内裤乱丢不洗澡 / 打呼磨牙抢被子 / 从不收拾 / 吧唧嘴弄乱厨房 / 堆东西无边界 / 基本都能忍

**价值观 (0.20)**
11. `量表` 事业冲刺期和陪另一半二选一，我会先保事业。
12. `量表` 对方没有上进心、只想躺平，时间一长我会从心里看不上TA。
13. `量表` 定居城市我心里已定死，让我回老家/小城市等于妥协整个人生。
14. `量表` 出国机会和感情冲突，我会选出国，不会为对方留下。
15. `量表` 我有清晰的结婚年龄底线，过了那岁数我会焦虑到宁可将就。
16. `量表` 明确要丁克/不要孩子的人，再合适我也不会长期走下去。
17. `量表` 对方原生家庭我打心底看不上，就算TA本人不错我也会退缩。
18. `量表` 对方父母强烈反对，我大概率扛不住、最终放弃。
19. `量表` 重大选择上我不打算让步，更希望对方迁就我。
20. `单选` 婚后和双方父母的距离底线？ → 必须分开越远越好 / 同城分开住 / 谁方便住谁家 / 可跟我父母住但绝不跟对方父母 / 跟对方父母同住也无所谓

**恋爱观 (0.25, 最重)**
21. `量表` 对方超过两小时不回消息，我会反复点开对话框脑补TA在跟谁干嘛。
22. `量表` 对方单独和异性朋友吃饭出去玩我完全能接受，不需要报备。
23. `量表` 我会要求对方删掉所有前任的联系方式和合照，做不到我浑身不舒服。
24. `量表` 我能随时拿起对方手机翻看，是我判断关系健不健康的底线。
25. `量表` 只要没身体出轨、只是精神上喜欢了别人，我大概率还愿意继续。
26. `量表` 看到对方和别的异性走得近聊得开心，我会吃醋甚至当场翻脸。
27. `量表` 确定关系没多久就发生亲密关系，对我完全没问题。
28. `量表` 谈恋爱就是奔着结婚去的，超过两年不谈婚论嫁我会想撤。
29. `量表` 关系里大事小事最好都由我说了算，对方听我的我才安心。
30. `单选` 发现对方在交友软件跟人暧昧聊骚（没线下没身体）？ → 直接分手等于出轨 / 严重警告再有就结束 / 大吵但认错就原谅 / 看程度能商量 / 不太在意

**沟通 (0.20)**
31. `量表` 吵架时我会当场把话说开吵明白，而不是冷战回避。
32. `量表` 一旦闹翻，我会把对方以前的旧账一笔笔翻出来一起算。
33. `量表` 就算很爱，我也很难主动说出口『我爱你』或先示弱认错。
34. `量表` 对方一指出我的问题，我第一反应是先辩解证明自己没错。
35. `量表` 我生气时会用已读不回、冷暴力惩罚对方。
36. `量表` 吵完架我几乎从不先低头，宁可僵着也要等对方哄我。
37. `量表` 谈恋爱也得留私人空间，有些事我有权不告诉对方。
38. `量表` 我希望对方在社交平台公开我们的关系，藏着掖着我会怀疑TA不够认真。
39. `量表` 对方倾诉烦恼时，我习惯立刻给建议讲道理，而不是先安慰情绪。
40. `多选` 起冲突时我最常的反应？ → 当场挑明 / 冷战已读不回 / 甩脸阴阳 / 翻旧账 / 硬憋回避 / 夺门而出拉黑 / 立刻道歉哪怕不是我错 / 能平静就事论事

**财务观 (0.20)**
41. `量表` 约会吃饭旅行该男生多出钱，我心里是默认的。
42. `量表` 比起存钱，我更想趁年轻把钱花在体验和当下快乐上。
43. `量表` 为了买想要的东西，我会刷信用卡/花呗/借钱，先享受后还。
44. `量表` 婚前财产存款，就算结了婚也得分清楚各管各的。
45. `量表` 对方背着我欠网贷/一身债，这段关系基本到头了。
46. `量表` 结婚没彩礼或像样物质保障，我（或我家）不会松口。
47. `量表` 谈钱时我要求对方账户消费欠款都对我透明，我也愿意公开。
48. `量表` 对方为撑面子超能力送礼请客买名牌，我反而反感觉得不靠谱。
49. `量表` 未来把不少收入补贴对方父母，我从心里接受不了。
50. `单选` 婚房写谁名字/谁出钱？ → 谁出钱写谁名AA都写 / 对方(男方)出首付加我名 / 两家凑共同财产不计较 / 我出大头但必须有我名 / 该男方家备我家不出

## C2. 朋友问卷 — 33 题 · weights: 社交风格0.28 / 兴趣爱好0.20 / 对事物的接受程度0.16 / 生活节奏0.14 / 家庭实力0.11 / 学习成绩0.11
> 改动：删掉「价值观」（恋爱问卷已覆盖）；新增 对事物的接受程度 / 家庭实力 / 学习成绩；社交风格权重最高。

**社交风格 (0.28, 最重)**
1. `量表` 我只想花精力在少数几个能交心的人身上，泛泛之交对我就是浪费时间。
2. `单选` 我更想要哪种相处方式的朋友？ → 线下见面才算数 / 线上聊得来就够 / 线上线下都得有 / 看心情想约就约不想理就消失
3. `量表` 朋友做了让我不爽的事，我会当场说清楚，而不是憋着转头跟别人吐槽他。
4. `量表` 聚会基本都是我在张罗，我不主动这群人很快就散。
5. `量表` 再好的朋友半年不联系我也不会主动找，淡了就淡了不觉得可惜。
6. `量表` 朋友总把我当情绪垃圾桶、深夜倒苦水却从不问我过得怎样，我会慢慢躲着他。
7. `量表` 再亲的朋友也得给我留独处空间，天天黏着要陪要秒回我会想逃。
8. `量表` 好朋友谈了对象就把我冷落，我嘴上说理解，心里其实又酸又不平衡。

**兴趣爱好 (0.20)**
9. `多选` 爱玩哪类电子游戏？ → MOBA(王者/LOL) / 射击(瓦/CS/三角洲) / 开放世界·二次元(原神/绝区零/鸣潮) / 派对联机(蛋仔/糖豆人/双人成行) / 竞技体育·赛车 / 单机Steam(黑神话/法环) / 休闲·模拟经营 / 基本不玩
10. `多选` 经常做哪些运动？ → 跑步夜跑 / 健身撸铁 / 球类 / 骑行·Citywalk·爬山 / 游泳 / 瑜伽·跳操 / 滑板·滑雪·飞盘 / 几乎不运动
11. `多选` 歌单最多哪种风格？ → 华语流行·抖音热歌 / 说唱 / 国风古风 / 欧美·K-Pop / 摇滚·独立 / 电子·二次元·游戏原声 / 民谣 / 古典·纯音乐 / 无所谓
12. `多选` 刷短视频最常停下来看？ → 搞笑整活 / 美食探店 / 颜值穿搭 / 游戏动漫 / 知识科普·考研 / 情感两性 / 影视剪辑 / 宠物萌娃 / 基本不刷
13. `量表` 和朋友面对面坐着，我也会忍不住一直低头刷手机让对方干等。
14. `量表` 对方的爱好我完全无感、还觉得幼稚或浪费钱，我很难真心陪他玩。
15. `量表` 比起待在舒适圈，我更想要一个不断拽我试新东西、哪怕逼我出糗的人。

**对事物的接受程度 (0.16)**
16. `量表` 朋友开了句踩我痛处的玩笑全桌都笑，我会陪着笑不翻脸，但心里默默扣分。
17. `量表` 碰到三观差很远的人，我嘴上客气，心里已经看轻对方懒得深交。
18. `量表` 朋友约我做件出格、可能挨处分的事，只要够刺激我愿意一起冲。
19. `量表` 朋友脚踏两条船背着对象约别人，只要不坑我，我照样跟他称兄道弟。
20. `量表` 谁当面让我下不来台占我便宜，我嘴上不说但会暗暗记着找机会扳回来。

**生活节奏 (0.14)**
21. `量表` 我闲不下来，日程一空无所事事我就焦虑，觉得在虚度。
22. `量表` 熬到凌晨两三点对我是常态，让我十一点前睡简直要命。
23. `量表` 出门前我得先把计划定好，被临时拉去说走就走会让我浑身不自在。
24. `量表` 对方作息跟我反着来，处久了我肯定受不了想分开。
25. `单选` 一个空出来的周末你最想做什么？ → 约人出门社交 / 窝宿舍躺平刷剧打游戏 / 学习考证搞副业 / 户外跑步爬山骑行 / 不安排看心情

**家庭实力 (0.11)**
26. `单选` 你家经济状况大概哪一档？ → 普通(够花但额外要算计) / 小康(吃穿不愁偶尔任性) / 较富裕(花钱不太看价) / 不方便说
27. `量表` 和家境明显比我好的人相处，我会不自觉有压力甚至自卑。
28. `量表` 朋友老约我去消费不起的地方，我宁愿慢慢疏远也开不了口说我钱不够。
29. `量表` 说实话，我更愿意和家庭条件好的人深交，觉得眼界资源更合得来。

**学习成绩 (0.11)**
30. `量表` 知道一个人成绩靠后、年年挂科，我心里会默默看低他几分。
31. `量表` 朋友比我卷、绩点高、拿奖学金，我嘴上恭喜心里其实不太舒服。
32. `量表` 我更愿意跟成绩好、能帮我划重点提分的人深交，对我没用的就算了。
33. `量表` 朋友天天摆烂逃课打游戏，我会嫌弃他慢慢拉开距离。

---

# PART D — Decisions & open items

## Decided
- **Scoring engine:** AI / embedding-based (you to design). **Config:** weights/threshold stay as code constants. **Pairing:** you design it yourself.
- **Friend questionnaire:** redesigned to 6 dimensions (dropped 价值观), 社交风格 weighted highest.
- **Both questionnaires:** rewritten to be sharp/incisive (Part C).

## Pending
- Approve / edit the Part C questionnaires (wording, options, weights, sensitive items).
- Your pairing algorithm + AI/embedding scorer design.
- On approval I will: write Part C into `seed.ts` (questions + options + bumped versions, extend the seeder to carry per-question type + options), update the **friend** dimension weights + `inferGroupByOrder` in the scorer to the new 6 dims, rebuild + reseed.

## Scoring semantics to factor into your design
- **SCALE** = numeric closeness (similarity match — two equally "toxic"/materialistic people read as compatible because they agree).
- **SINGLE_CHOICE** = current scorer is **exact-match only**; several new single-choice items are *ordered spectrums* (e.g. 聊骚反应 直接分手→无所谓) where adjacent options should count as closer — needs ordinal handling in a new scorer.
- **MULTIPLE_CHOICE** = Jaccard overlap (games/sports/music/short-video → shared-interest score).
- **TEXT / bio / free-text prefs** = ignored today; prime inputs for an AI/embedding scorer.
