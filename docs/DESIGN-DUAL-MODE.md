# 校园 Love 双模式（恋人 + 朋友）重构设计方案 — 实现就绪版

> 适用版本：当前 main 分支
> 后端：NestJS + Prisma（`apps/api`） | H5：原生 JS（`apps/h5`）
> 本文档为**只读分析 + 设计**产物，未改动任何代码。所有文件:行号引用对应当前代码状态。
> **本版为「实现就绪」深化版**：每节扩充到"新对话照着分阶段实现即可"的细节程度（完整 schema / 迁移 SQL / service 函数签名与伪代码 / 接口 JSON 示例 / 朋友问卷题目 / 前端函数与 DOM 级清单 / 分期验收用例）。
>
> **⚠️ 修订说明（最终业务规则收口）**：本版根据用户最终确认的业务规则（见 **§1.5 业务规则（最终确认）**）做了较大调整，覆盖了早期 §1.2 的若干决策。**当任何旧叙述与 §1.5 冲突时，一律以 §1.5 为准。** 关键变化：
> 1. **朋友也要确认**：恋人与朋友匹配后均为「先聊后定」，48h 内双方点「确认」才转永久，未确认到期统一 `EXPIRED`（对话消失 + 通知）——推翻了早期「朋友无需确认」。
> 2. **48h 过期为通用机制**：对恋人 / 朋友的「临时对话」一律生效，由 scheduler 扫描。
> 3. **导航重构**：底部 3 tab（主页 / 广场 / 我的）；**主页顶部三切换 Chat / 恋人匹配 / 朋友匹配**。Chat 升级为主页一级视图（不再是匹配页子视图），承载全部对话。
> 4. **删除排行榜（leaderboard）入口与 Profile「Love Mode」入口。**
> 5. **广场改版**：从「情侣帖」改为「推荐 + 校园墙 + 三卡 + 后管联动」（完整设计 §8.1；旧情侣帖去向 + 5 项关键决策已定稿 §8.1.6）。

---

## 1. 概述

### 1.1 产品目标

把现有「单一恋人匹配」系统升级为「**恋人（romantic）+ 朋友（friend）双模式并存**」系统。两种模式各有独立的问卷、偏好、状态机和匹配产出，用户可同时进行；两种模式均采用「**匹配 → 立即可聊（临时对话）→ 48h 内双方确认 → 永久**」的统一流程（先聊后定 + 双向确认 + 48h 过期）。

> **本节（§1.2）为早期决策的历史记录，部分已被 §1.5 覆盖。** 实现一律以 §1.5 + 第 3/4/6/8 章修订后内容为准；下表标注了每条的现行状态。

### 1.2 早期产品决策（已被 §1.5 部分覆盖，见状态列）

| # | 早期决策 | 现行状态（以 §1.5 为准） |
|---|---|---|
| 1 | 两种模式：恋人 + 朋友，匹配页顶部切换 | ✅ 有效，但切换升级为**主页顶部三切换 Chat / 恋人匹配 / 朋友匹配**（§1.5 A） |
| 2 | 模式并存，状态/问卷/偏好各自独立 | ✅ 有效 |
| 3 | 两套独立问卷，匹配评分各用各的 | ✅ 有效；但问卷为**选填**（注册后两张卡片，可都填/只填一个/都不填，不填则不能进对应模式匹配，§1.5 G） |
| 4 | 周期制；恋人一轮 1 个、朋友一轮多个候选 | ✅ 有效（恋人周五下午 1 个；朋友每轮最多 5 个候选，§1.5 B/C） |
| 5 | 恋人「先聊后定」，双方确认才成立 | 🔁 **修订**：保留「先聊后定 + 双确认」，但**新增 48h 时限**——48h 内未双确即 `EXPIRED`（对话消失 + 通知），不再无限期等待（§1.5 B、§3.1） |
| 6 | 朋友匹配后直接聊、**无需确认** | ❌ **推翻**：朋友也要双方确认才保留对话，未确认 48h 自动消失（§1.5 C、§3.2） |
| 7 | 聊天改为会话列表（微信式），含已读 | 🔁 **升级**：会话列表升级为**主页一级视图「Chat」**，含永久 + 临时（带 48h 倒计时）两类对话（§1.5 A/D、§4） |
| 8 | 朋友筛选偏好可自定义（独立于恋人） | ✅ 有效 |
| 9 | 广场情侣帖仅属于已确认恋爱关系 | ❌ **推翻**：广场大改为「推荐 + 校园墙 + 三卡 + 后管联动」，移除情侣帖主线（完整设计 §1.5 I、§8.1；旧情侣帖**迁移进 SquarePost + 旧表废弃** + 5 项关键决策已定稿 §8.1.6） |

### 1.3 关键术语统一（贯穿全文档）

- **mode 取值**：字符串 `"romantic"` | `"friend"`（API 层、应用层一律用小写字符串）。
- **Match.mode 枚举**（DB 层）：`MatchMode { ROMANTIC, FRIEND }`。
- **QuestionnaireVersion.type 枚举**（DB 层）：`QuestionnaireType { ROMANTIC, FRIEND }`。
- **MatchStatus 新状态机（恋人 / 朋友对称：匹配 → 临时对话 → 48h 双确 → 永久 / 过期）**：
  - 恋人：`MATCHED_ROMANTIC`（临时对话）→ `ROMANTIC_CONFIRMING`（单方已确认）→ `RELATIONSHIP_ROMANTIC`（永久）
  - 朋友：`MATCHED_FRIEND`（临时对话）→ `FRIEND_CONFIRMING`（单方已确认）→ `FRIEND_CONFIRMED`（永久）
  - 通用终态：`REJECTED` / `DISSOLVED` / `EXPIRED`（48h 未双确，对话消失 + 双方通知）
  - 旧值保留兼容：`PENDING_CONFIRM` / `MATCHED` / `RELATIONSHIP_MODE`
- **「临时对话」（temp）vs「永久对话」（confirmed）**：`MATCHED_*` / `*_CONFIRMING` 为临时对话（带 48h 倒计时，到期 `EXPIRED`）；`RELATIONSHIP_ROMANTIC` / `FRIEND_CONFIRMED` 为永久对话（无 TTL）。Chat 列表据此显示倒计时标记与「确认成为恋人 / 朋友」入口（见 §4）。
- **48h 计时锚点**：以 `Match.createdAt`（匹配产出时刻）起算 48 小时；到期且未双确即 `EXPIRED`。
- **UserModeState.matchState 取值**（应用层小写字符串）：`idle` / `searching` / `matched` / `confirming` / `relationship`（朋友复用 `relationship` 表示「已确认朋友」语义）/ `no_match`。
  - 注：朋友可同时拥有多个已确认朋友，UMS 是「该用户在该模式的总体状态」，不逐对维护；逐对状态以 `Match.status` 为准（见 §3.2）。
- **mode↔枚举映射工具**（实现阶段 2 新建 `apps/api/src/matching/mode.util.ts`）：

```ts
import { MatchMode, QuestionnaireType } from '@prisma/client';
export type ModeStr = 'romantic' | 'friend';
export const toMatchMode = (m: ModeStr): MatchMode =>
  m === 'friend' ? MatchMode.FRIEND : MatchMode.ROMANTIC;
export const toQType = (m: ModeStr): QuestionnaireType =>
  m === 'friend' ? QuestionnaireType.FRIEND : QuestionnaireType.ROMANTIC;
export const normalizeMode = (raw?: string): ModeStr =>
  raw === 'friend' ? 'friend' : 'romantic'; // 默认 romantic，向下兼容

// 「临时对话」状态：可聊、带 48h 倒计时、可触发确认
export const TEMP_STATUSES = ['MATCHED_ROMANTIC','ROMANTIC_CONFIRMING','MATCHED_FRIEND','FRIEND_CONFIRMING'];
// 「永久对话」状态：已确认、无 TTL
export const CONFIRMED_STATUSES = ['RELATIONSHIP_ROMANTIC','FRIEND_CONFIRMED','RELATIONSHIP_MODE'/*旧数据*/];
// 全部可聊状态（临时 + 永久）
export const ALL_CHATTABLE = [...TEMP_STATUSES, ...CONFIRMED_STATUSES];
// 某状态是否为临时对话（前端用于展示倒计时 / 确认入口）
export const isTempStatus = (s: string) => TEMP_STATUSES.includes(s);
// 48h 过期窗口（毫秒）
export const CONFIRM_WINDOW_MS = 48 * 60 * 60 * 1000;
```

> 说明：本文档取**最清晰、最易扩展、最不易状态污染**的组合：`UserModeState` 独立表 + `MatchMode` 枚举 + 显式 `MATCHED_ROMANTIC/_FRIEND` 状态。

---

## 1.5 业务规则（最终确认）

> 本章为用户最终拍板的业务规则全集（A–J），是**全文档的最高权威**。任何旧叙述与本章冲突时以本章为准。每条末尾标注了受影响的技术章节，便于交叉核对。

### A. 导航结构（改动）

- 底部导航固定 **3 个 tab：主页 / 广场 / 我的**。
- **主页顶部三切换按钮：Chat / 恋人匹配 / 朋友匹配**（并列三选）：
  - **Chat** = 所有对话（永久对话 + 临时对话，统一在此）。
  - **恋人匹配** = 恋人模式匹配界面。
  - **朋友匹配** = 朋友模式匹配界面。
- **对话不再分散在匹配界面里**，统一收口到 Chat 视图。
- **删除底部导航的排行榜入口。**
  > 影响：§4（Chat 升级为主页一级视图）、§6.2（主页顶部三切换）、§6.6（Chat 列表）、§H/§8.2（删排行榜）。

### B. 恋人模式

- 每周期只匹配 **1 个**对象。
- 周五下午匹配到后，**48h 内双方都点「确认成为恋人」才成立**（对话框转为永久保留）。
- **48h 内未双方确认 → 直接过期（`EXPIRED`）**，双方互相看不到（对话从列表消失），仅各收到一条通知。
- 匹配失败（含过期）后，**需用户主动点击才重新加入匹配池**（不自动续期）。
- **确认成为恋人后，恋人匹配模式停止**（已有恋人者不再被匹配新恋人）；恋人匹配界面改为显示「打开和恋人的对话」入口。
  > 影响：§3.1（恋人状态机 + 48h EXPIRE）、§3.4（confirmRelationship、startMatch 的恋人独占）、§3.5（不自动续）、§6.2（恋人匹配界面已确认后的入口）。

### C. 朋友模式（改动：朋友也要确认）

- 每轮**最多 5 个**朋友候选。
- 匹配后**也要双方确认才保留对话框**（与恋人一致）；未确认 **48h 自动消失**（`EXPIRED`）。
- 可**同时拥有多个已确认朋友**，各自独立 1v1。
  > 影响：§3.2（朋友状态机新增 confirming/confirmed + 48h EXPIRE）、§3.4（confirmRelationship 通用化）、§3.6（朋友候选上限 5）、§5.6。

### D. 对话框 / 确认

- **已确认（恋人或朋友）→ 对话框永久保留**；**未确认 → 一律 48h 自动消失**。
- 未确认的**临时对话在 Chat 列表中显示**，带「**剩余 Xh 倒计时**」标记 + 「确认成为恋人 / 朋友」入口；双方确认转永久，48h 未确认自动从列表消失。
- 「**确认成为恋人 / 朋友**」按钮在 **Chat 的对话框界面内**点（**不是匹配界面**）。
  > 影响：§4.1/§4.2（会话列表返回 status/mode/remainingMs）、§6.6（Chat 对话内确认按钮）、§4.4。

### E. 删除 / 拉黑

- 可**删除关系（恋人 / 朋友）**；删除后双方收到通知「X 解除了朋友 / 恋爱关系」。
- **拉黑跨两个模式生效**（拉黑后两模式都不再匹配到对方）。
  > 影响：§3.4（dissolveMatch 通用 + 发通知）、§6.7（dissolve 端点）、§3.6（候选池过滤拉黑对）。

### F. 跨模式

- 同一对用户若同时都在恋爱池 + 朋友池，**可同时被配成恋人候选 + 朋友**（两模式各一条 Match，互不影响）。
  > 影响：§2.1（`@@unique([userAId,userBId,mode])`）、§3.3。

### G. 问卷

- **注册登录后给两张卡片（恋人问卷 / 朋友问卷）供选择填写**：可都填、可只填一个、可都不填，**均不强制**。
- 不填对应问卷则**不能进对应模式匹配**（点对应模式匹配时引导去填）。
  > 影响：§5.1（选填语义，去掉「强制填」）、§6.3（注册后两张卡片引导）、§3.4（startMatch 校验该模式问卷已填）。

### H. 删除的功能

- **排行榜（leaderboard 模块 / 入口）整块删除。**
- **Profile 的「Love Mode」入口删除。**
  > 影响：§6.2/§8.2（前端去入口、底部导航无排行榜）、附录。

### I. 广场改版（推荐 + 校园墙 + 三卡 + 后管联动）

> 从「情侣帖」改为 **推荐 + 校园墙** 两 tab，完整规则（11 条）已确认，详见 §8.1。**旧情侣帖去向 + 5 项关键决策（§8.1.6）已全部定稿**（旧帖**迁移进 SquarePost + 旧表废弃**、校园墙「人人可发 + 仅同校可见」、个人帖举报 ≥3 自动隐藏待审 / 官方发布即生效、间距减半、推荐 MVP 三信号），实现照 §8.1.6 表即可，不再挂起。

1. **两个 tab**：推荐 / 校园墙。
2. **三种卡**：大卡 = 官方帖（学生会 / 团队 / 赞助商，走后管联动）；中卡 = 校园墙用户帖（单列、头像 + 学校在上、大图、赞评）；小卡 = 推荐用户帖（双列瀑布流）。
3. **发帖去向**：发帖时选「推荐」或「校园墙」。发校园墙 → 中卡（仅同校可见）；发推荐 → 小卡（全网、算法排序）。
4. **推荐 tab** = 小卡 + 官方大卡（加权插入 / 置顶）+ 偶尔提校园墙优质中卡。
5. **校园墙 tab** = 仅同校中卡（同校过滤硬约束）。
6. **每帖右上角标注发布者学校。**
7. **两 tab 均可匿名发帖**：匿名隐藏头像 / 昵称为「匿名同学」，学校仍标注。
8. **推荐算法 = 加权混排**（官方按权重插入；个人按 热度 + 同校 + 新鲜度 打分；偶尔提中卡）。MVP 可落地。
9. **后管联动**：`admin_users` 加 `role`（super / student_union / team / sponsor）；学生会绑定 `schoolId`（仅发本校）；用后管发大卡官方帖。
10. **赞助商帖标 "Sponsored"。**
11. **帖子间距调小**（`space-y-12 → space-y-6`、小卡 `gap-4 → gap-3`）。
  > 影响：§2.6/§2.7（SquarePost 三表 + 可选 `coupleMatchId` + AdminUser 角色扩展 + 迁移 10/11/12）、§8.1（完整广场章）、§6.11（前端两 tab + 三卡 + 匿名 + 学校标注 + 间距 + 后管页）、§9 阶段 7（占位→完整 + 后管联动 + CouplePost 迁移）。
  > ✅ §8.1.6 的 5 项关键决策（旧情侣帖去向=迁移进 SquarePost、校园墙发帖权限、审核口径、间距具体值、推荐信号）已全部定稿，落地口径见 §8.1.6 决策表。

### J. 增强模式（付费能量系统）

> 本条为用户最终拍板的「增强模式」业务规则全集（8 条），与 §10 详细设计一一对应。**任何 §10 实现细节与本条冲突时，以本条为准。**

1. **开关**：在 match setting 里选择是否启用增强模式（**恋爱 / 朋友各自的 match setting 独立开关**）。
2. **能量**：用户的虚拟资源，**按"格"计**。来源 = 充值购买为主 + 少量免费（签到 / 新人赠送 / 任务）。
3. **能量展示与入口**：profile **顶部一行**显示剩余能量格（每格一个可视方块 / 图标），**点进去到购买页充值**。
4. **消耗规则**：恋爱匹配开增强 = **固定扣 3 格**；朋友匹配开增强 = 用户**可选 1–5 格**，N 格 = 这轮**保证匹配到 N 个朋友**。
5. **效果**：不开增强这轮**可能匹配不到（no_match）**；开增强**保证这轮一定匹配到**（恋爱保证 1 个；朋友保证 N 个）。
6. **保证机制**：增强用户**无视 75 分匹配阈值**，从池中强配最接近的（恋爱取最高分 1 个；朋友取 Top-N）；若池中确实没有任何可配对象（**空池**），则**退还能量 + 通知**。
7. **扣费时机**：开增强**加入匹配池时预扣**对应格数；若这轮系统确实没配到（空池）则**退还**。
8. **跨模式**：恋爱、朋友各自独立开关与消耗；两模式可各自用增强（互不影响）。

> （支付渠道——微信 / 支付宝 / Stripe 等——暂不定，本期先做**能量账户 + 消耗/退还 + 充值接口**[可先 mock / 预留对接点]，渠道对接后续。）
> 影响：§2.1（新增 `EnergyBalance`/`EnergyTransaction`、`Match` 加增强字段、`UserMatchPreferences` 加增强开关）、§3.4（`startMatch` 带 enhanced/cells 预扣）、§3.6（增强无视阈值强配 + 空池退还）、§6（match setting 增强开关、profile 顶部能量格、购买页）、§9（阶段8）、**§10（增强模式完整章）**。

### 1.5.1 规则 → 技术设计影响矩阵（速查）

| 规则 | 数据模型 | 状态机/匹配 | 接口 | Chat | 48h 清理 | 删除项 | 前端 | 分期 |
|---|---|---|---|---|---|---|---|---|
| A 导航 | — | — | — | §4 | — | §8.2 | §6.2/6.6 | 阶段5 |
| B 恋人 | — | §3.1 | §3.4 | §4 | §3.5 | — | §6.2 | 阶段2/5 |
| C 朋友确认 | — | §3.2 | §3.4 | §4 | §3.5 | — | §6.5 | 阶段2/5 |
| D 对话/确认 | — | §3.1/3.2 | §3.4/6.7 | §4.1/4.2 | §3.5 | — | §6.6 | 阶段3/5 |
| E 删除/拉黑 | — | §3.1/3.2 | §3.4/6.7 | §4.1 | — | — | §6.6 | 阶段2/5 |
| F 跨模式 | §2.1 | §3.3 | — | §4 | — | — | — | 阶段2 |
| G 问卷选填 | — | — | §3.4 | — | — | — | §6.3 | 阶段4/5 |
| H 删除 | — | — | — | — | — | §8.2 | §6.2 | 阶段0/5 |
| I 广场 | §2.6（含可选 `coupleMatchId`）/§2.7（迁移 10/11/12） | §8.1.4（推荐加权混排 `listRecommend`/`listCampusWall`）+ §8.1.3（官方发帖 scope 校验） | §8.1.5（`/square/v2/{posts,recommend,campus-wall,posts/:id/{like,comments,report}}` + `/admin/square/posts` + `/admin/users`）+ §8.1.4（`listRecommend`/`listCampusWall` 端点排序逻辑）+ §8.1.7（举报→`isHidden` 审核流） | — | — | §8.1.6（旧情侣帖**迁移进 SquarePost + 旧表废弃**，迁移 12 回填 `coupleMatchId`；5 项决策已定稿） | §6.11/§8.1 | 阶段7 |
| **J 增强模式** | §2.1/§10.1 | §3.4/§3.6/§10.3 | §10.4 | §10.4（退款通知） | §10.3（48h 退款） | — | §6.2/§6.4/§6.6/§10.5 | **阶段8** |

> **I 规则（广场改版）映射展开**（因广场跨「数据模型 + 排序算法 + 多端点 + 审核 + 前端」最广，速查表行 I 各格的全量索引在此展开，便于落地时定位）：
> - **数据模型**：§2.6（`SquarePost`（含可选 `coupleMatchId`）/`SquarePostComment`/`SquarePostLike` 三表 + `AdminUser` 扩展 role/schoolId/organizationName/isActive + `SquareBoard`/`SquareAuthorType`/`AdminRole` 枚举）、§2.7（迁移 10/11/12，迁移 12 把 CouplePost 搬入 SquarePost 并废弃旧表）。
> - **排序 / 匹配逻辑**：§8.1.4（推荐 tab 加权混排 `listRecommend`：个人小卡 `score=0.5*热度+0.3*同校+0.2*新鲜度`、官方大卡每 5 插 1 + pinned 置顶、偶尔提中卡；校园墙 `listCampusWall` 同校硬过滤）、§8.1.3（官方发帖 `getAdminScope` 权限 scope 校验）。
> - **接口**：§8.1.5 用户侧 `POST /square/v2/posts`、`GET /square/v2/recommend`、`GET /square/v2/campus-wall`、`GET /square/v2/posts/:id`、`POST /square/v2/posts/:id/{like,comments,report}`；官方/后管侧 `POST /admin/square/posts`、`DELETE /admin/square/posts/:id`、`POST/GET/PUT/DELETE /admin/users`（§8.1.3）。审核流见 §8.1.7（举报累计 ≥3 自动 `isHidden=true` / 后管手动下架 / 作者自删）。
> - **迁移 / 过渡项**：§8.1.6（旧情侣帖**迁移进 SquarePost**：CouplePost+单人帖+demo 搬为普通帖、作者取发帖方、可选 `coupleMatchId` 保留双头像，迁移后旧表废弃；5 项关键决策已定稿）。
> - **前端**：§6.11（两 tab `[推荐|校园墙]` + 三卡 `bentoLargeCard`/`bentoWideCard`/`bentoSmallCard` 分发 + 匿名渲染 `postAuthorDisplay` + 学校标注 `school-badge` + 间距 `space-y-12→6`/`gap-4→3`）+ 后管前端（账号管理页 + 官方发帖页 §6.11 末）。
> - **分期**：§9 阶段 7（依赖阶段 5）。

---

## 2. 数据模型变更

### 2.1 变更总览

| 表 / 枚举 | 变更 | 目的 |
|---|---|---|
| 新增枚举 `QuestionnaireType` | `ROMANTIC` / `FRIEND` | 问卷分类 |
| 新增枚举 `MatchMode` | `ROMANTIC` / `FRIEND` | 匹配模式 |
| `QuestionnaireVersion` | 新增 `type`（枚举），partial unique index `(type) WHERE isActive` | 每类型唯一 active |
| `Answer` | **不改结构**，通过 `questionnaireVersionId → type` 推导 | 答案隐含模式，零侵入 |
| `UserMatchPreferences` | 新增 `mode`；`@@unique([userId])`→`@@unique([userId, mode])`；新增 `preferredInterests`/`preferredActivities`/`friendRequirements`；**新增 `enhancedModeEnabled`（增强开关）+ `friendEnhancedCells`（朋友 1–5 档）** | 两套独立偏好 + 增强开关（J 规则 §10） |
| 新增表 `UserModeState` | 整表新增，替代 User 上 4 个字段 | per-mode 状态彻底隔离 |
| `User` | 删除 `matchState`/`matchSearchingSince`/`weeklyMatchNote`/`mode`；`matchPreferences` 改一对多；新增 `modeStates`；**新增 `energyBalance`（一对一）+ `energyTransactions`（一对多）** | 状态外移 + 挂能量账户（J 规则 §10） |
| **新增表 `EnergyBalance`** | 整表新增（用户能量账户，`userId @unique`，`totalEnergy`/`usedEnergy`） | 增强模式付费能量账户（J 规则 §10.1） |
| **新增表 `EnergyTransaction`** | 整表新增（能量流水：RECHARGE/CONSUME/REFUND/CLAIM，`balanceAfter`/`relatedMatchId`/`relatedMatchMode`） | 充值/消耗/退还/领取审计与对账（J 规则 §10.1） |
| **新增枚举 `EnergyTxType`** | `RECHARGE`/`CONSUME`/`REFUND`/`CLAIM` | 能量流水类型 |
| **新增表 `SquarePost`** | 整表新增（广场改版**唯一帖子主表**，`board`/`authorType`/`authorUserId`/`adminId`/`school`/`anonymous`/`isSponsored`/`isHidden`/`tags`/`metadata` + **可选 `coupleMatchId`**），**取代** `CouplePost` | 推荐 + 校园墙 + 三卡（I 规则 §8.1，详见 §2.6）；`coupleMatchId` 承载迁移后情侣帖双头像语义（§8.1.6） |
| **新增表 `SquarePostComment`** | 整表新增（楼中楼，结构同旧 `PostComment`） | 广场新帖评论（§2.6） |
| **新增表 `SquarePostLike`** | 整表新增（`@@unique([postId,userId])`） | 广场新帖点赞（§2.6） |
| **新增枚举 `SquareBoard`** | `RECOMMEND`/`CAMPUS_WALL` | 发帖去向 tab（§8.1.0 规则 1/3） |
| **新增枚举 `SquareAuthorType`** | `USER`/`STUDENT_UNION`/`TEAM`/`SPONSOR` | 发帖者身份 ↔ 大/中/小卡（§8.1.1） |
| **新增枚举 `AdminRole`** | `SUPER`/`STUDENT_UNION`/`TEAM`/`SPONSOR` | 后管角色体系（I 规则 §8.1.3） |
| `AdminUser` | 新增 `role`(AdminRole?)/`schoolId`(String?)/`organizationName`(String?)/`isActive`(Boolean=true)；新增 `squarePosts` 反向关系；`@@index([role, schoolId])` | 后管联动发官方大卡（I 规则 §8.1.3，详见 §2.6） |
| `User` | 新增 `squarePosts`/`squareComments`/`squareLikes` 反向关系（广场新表） | 广场改版关联（§2.6） |
| `CouplePost` / `PostComment` / `PostLike`（旧） | **迁移后废弃**：经**迁移 12**（§2.7）整体搬入 `SquarePost`/`SquarePostComment`/`SquarePostLike`，随后停写、不再被任何代码路径使用（确认稳定后可单独 drop） | §8.1.6 定稿：迁移进 SquarePost + 旧表废弃 |
| `Match` | 新增 `mode`（枚举）；`@@unique([userAId,userBId])`→`@@unique([userAId,userBId,mode])`；3 个复合索引；状态机扩展；**新增 `enhancedMode`/`enhancedUserEnergy`/`enhancedAttemptedAt`（增强配对记录，便于退款）** | 同一对用户每模式一条 + 记录增强消耗（J 规则 §10.1） |
| `MatchStatus` | 扩展 6 个新值（恋人 3 + 朋友 3，保留旧值兼容） | 支持恋人 / 朋友对称的「先聊后定 + 双确认 + 48h 过期」 |
| 删除枚举 `UserMode` | 移除 `MATCH_MODE`/`RELATIONSHIP_MODE` | 全局模式概念已无意义 |
| `Message` / `Question` / `QuestionOption` 等 | **不改结构** | matchId 隐含 mode；发帖校验逻辑改 |

> **增强模式数据模型的完整 Prisma 定义、迁移 SQL、字段语义见 §10.1。** 本节仅在总览登记，避免 §2.2 目标全文与 §10.1 重复维护——§10.1 给出可直接追加到 §2.2 的 model/enum 片段，迁移编号续接 §2.3（迁移 7 起）。

### 2.2 完整目标 Prisma Schema

> 完整替换 `apps/api/prisma/schema.prisma`。以下为**目标全文**（迁移 6 上线后即此最终态）。

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────── 新增枚举 ─────────────
enum QuestionnaireType {
  ROMANTIC
  FRIEND
}

enum MatchMode {
  ROMANTIC
  FRIEND
}

// ───────────── 增强模式：能量流水类型（§10） ─────────────
enum EnergyTxType {
  RECHARGE // 充值购买
  CONSUME  // 匹配预扣
  REFUND   // 退还（空池 / 48h 未确认）
  CLAIM    // 领取免费（注册/签到/任务）
}

// ───────────── 用户体系 ─────────────
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  status       UserStatus @default(ACTIVE)
  // 已删除: mode, matchState, matchSearchingSince, weeklyMatchNote

  verificationStatus String @default("unverified")
  settings           Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  profile        Profile?
  answers        Answer[]
  matchesAsUserA Match[]   @relation("MatchUserA")
  matchesAsUserB Match[]   @relation("MatchUserB")
  sentMessages   Message[] @relation("MessageSender")

  couplePosts  CouplePost[]
  postComments PostComment[]
  postLikes    PostLike[]

  matchPreferences UserMatchPreferences[]   // 改为一对多（每模式一条）
  modeStates       UserModeState[]          // NEW

  energyBalance      EnergyBalance?       // NEW（增强模式，一对一，§10.1）
  energyTransactions EnergyTransaction[]  // NEW（增强模式流水，§10.1）

  notifications Notification[]
  reports       Report[]

  @@map("users")
}

enum UserStatus {
  ACTIVE
  BANNED
}

model AdminUser {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  isSuperAdmin Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("admin_users")
}

// ───────────── 新增: 用户 per-mode 状态 ─────────────
model UserModeState {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  mode   String // "romantic" | "friend"

  // 恋人: idle/searching/matched/confirming/relationship/no_match
  // 朋友: idle/searching/matched/confirming/relationship/no_match
  //   （朋友也要确认；relationship 表示「至少有一个已确认朋友」的活跃态，逐对状态以 Match.status 为准）
  matchState          String    @default("idle")
  matchSearchingSince DateTime?
  weeklyMatchNote     String?   // "no_match" 或 null

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, mode])
  @@index([userId, mode, matchState])
  @@map("user_mode_states")
}

// ───────────── 新增: 增强模式能量账户（§10.1） ─────────────
model EnergyBalance {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  totalEnergy Int @default(0) // 累计充值 + 赠送的总格数（只增）
  usedEnergy  Int @default(0) // 已消耗格数（CONSUME 时 +=，REFUND 时 -=）
  // 可用 availableEnergy = totalEnergy - usedEnergy（应用层计算，不落库）

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("energy_balances")
}

// ───────────── 新增: 增强模式能量流水（§10.1） ─────────────
model EnergyTransaction {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  type         EnergyTxType
  amountEnergy Int          // 变动的格数（CONSUME/REFUND/RECHARGE/CLAIM 均记正数）
  balanceAfter Int          // 交易后可用余额快照（对账用）

  relatedMatchId   String? // 关联 Match.id（CONSUME/REFUND 非空）
  relatedMatchMode String? // "romantic" | "friend"（本笔交易涉及的模式）
  reason           String? // 说明，如 "恋爱增强消耗3格" / "朋友增强空池退还5格"
  metadata         Json?   // 扩展，如 { rechargeMethod: "wechat"|"alipay"|"stripe", orderId, packageId }

  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@index([relatedMatchId])
  @@map("energy_transactions")
}

// ───────────── 用户资料（不变） ─────────────
model Profile {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  nickname   String?
  school     String?
  grade      String?
  gender     String?
  genderPref String?
  age        Int?
  city       String?
  interests  String[]
  bio        String?  @db.Text
  avatarUrl  String?

  socialLinks Json?

  signature String?  @db.Text
  coverUrl  String?
  tags      String[]

  major       String?
  mbti        String?
  nationality String?
  realPhotos  String[]
  zodiac      String?

  extraData           Json?
  relationshipScore   Float @default(0)
  profileCompleteness Int   @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("profiles")
}

// ───────────── 匹配偏好（新增 mode + 朋友字段） ─────────────
model UserMatchPreferences {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  mode   String // "romantic" | "friend"

  // 恋人 / 通用字段
  requireSameCity        Boolean  @default(false)
  requireSameUniversity  Boolean  @default(false)
  requireSameMajor       Boolean  @default(false)
  preferredNationalities String[]
  preferredMbti          String[]
  preferredGender String?
  ageMin          Int?
  ageMax          Int?
  universityStage String?

  // 朋友字段
  preferredInterests  String[]
  preferredActivities String[]
  friendRequirements  String? @db.Text

  // 增强模式开关（§10，J 规则）—— 恋人/朋友各自一条 UMP，开关独立
  enhancedModeEnabled Boolean @default(false) // 该模式是否启用增强
  friendEnhancedCells Int?    @default(1)      // 朋友模式增强档位 1–5（=保证匹配的朋友数 N）；恋人模式忽略（固定 3 格）

  matchBasis     String? @default("both")
  extraMatchInfo String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, mode])
  @@map("user_match_preferences")
}

// ───────────── 问卷体系（新增 type） ─────────────
model QuestionnaireVersion {
  id          String            @id @default(cuid())
  version     Int               @unique
  type        QuestionnaireType @default(ROMANTIC)
  title       String
  description String?           @db.Text
  isActive    Boolean           @default(false)
  publishedAt DateTime?

  questions Question[]
  answers   Answer[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // 每 type 最多一个 active：Postgres partial unique index（迁移 1 手写，schema 无法表达）
  @@map("questionnaire_versions")
}

model Question {
  id              String               @id @default(cuid())
  questionnaireId String
  questionnaire   QuestionnaireVersion @relation(fields: [questionnaireId], references: [id], onDelete: Cascade)

  type        QuestionType
  title       String
  description String?
  isRequired  Boolean      @default(true)
  isEnabled   Boolean      @default(true)
  order       Int          @default(0)
  group       String?

  options QuestionOption[]
  answers Answer[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("questions")
}

enum QuestionType {
  SINGLE_CHOICE
  MULTIPLE_CHOICE
  SCALE
  TEXT
}

model QuestionOption {
  id         String   @id @default(cuid())
  questionId String
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  label String
  value String
  order Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("question_options")
}

model Answer {
  id                     String               @id @default(cuid())
  userId                 String
  user                   User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  questionnaireVersionId String
  questionnaireVersion   QuestionnaireVersion @relation(fields: [questionnaireVersionId], references: [id])
  questionId             String
  question               Question             @relation(fields: [questionId], references: [id])

  value Json

  submittedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, questionnaireVersionId, questionId])
  @@map("answers")
}

// ───────────── 匹配体系（新增 mode + 扩展 status） ─────────────
model MatchConfig {
  id          String  @id @default(cuid())
  cronExpr    String
  isEnabled   Boolean @default(true)
  description String?
  timezone    String  @default("Asia/Shanghai")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("match_configs")
}

model MatchJob {
  id           String         @id @default(cuid())
  status       MatchJobStatus @default(PENDING)
  triggeredBy  String?
  startedAt    DateTime?
  completedAt  DateTime?
  errorMessage String?        @db.Text

  totalCandidates Int @default(0)
  totalMatched    Int @default(0)

  matches Match[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("match_jobs")
}

enum MatchJobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

model Match {
  id         String   @id @default(cuid())
  matchJobId String
  matchJob   MatchJob @relation(fields: [matchJobId], references: [id])

  userAId String
  userA   User   @relation("MatchUserA", fields: [userAId], references: [id])
  userBId String
  userB   User   @relation("MatchUserB", fields: [userBId], references: [id])

  mode   MatchMode   @default(ROMANTIC)
  status MatchStatus @default(MATCHED_ROMANTIC)
  score  Float?
  metadata Json?

  // 增强模式记录（§10）：哪一方以增强发起、消耗了多少格、增强配对时刻（计退款窗口）
  enhancedMode       String?   // null | "romantic" | "friend"（该配对是否由增强用户发起）
  enhancedUserEnergy Int?      // 该配对消耗/预扣的能量格数（恋爱=3，朋友=friendEnhancedCells）
  enhancedAttemptedAt DateTime? // 增强配对时刻（用于 48h 退款窗口计时锚点，可与 createdAt 一致）

  userAConfirmed Boolean   @default(false)
  userBConfirmed Boolean   @default(false)
  confirmedAt    DateTime?

  relationshipStartedAt DateTime?

  compatibilityScore Float?
  interactionStreak  Int    @default(0)
  growthScore        Float  @default(0)
  empathyScore       Float  @default(0)

  dissolvedBy    String?
  dissolvedAt    DateTime?
  dissolveReason String?

  couplePosts CouplePost[]
  messages    Message[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userAId, userBId, mode])
  @@index([mode, status])
  @@index([userAId, mode, status])
  @@index([userBId, mode, status])
  @@map("matches")
}

enum MatchStatus {
  // 恋人模式（先聊后定 + 双确认 + 48h 过期）
  MATCHED_ROMANTIC        // 临时对话：可聊，48h 倒计时中
  ROMANTIC_CONFIRMING     // 单方已确认，等待对方
  RELATIONSHIP_ROMANTIC   // 双方确认 → 永久恋人

  // 朋友模式（与恋人对称：也要双确认 + 48h 过期）
  MATCHED_FRIEND          // 临时对话：可聊，48h 倒计时中
  FRIEND_CONFIRMING       // 单方已确认，等待对方
  FRIEND_CONFIRMED        // 双方确认 → 永久朋友

  // 通用终态
  REJECTED
  DISSOLVED
  EXPIRED                 // 48h 未双确：对话消失 + 双方通知

  // 废弃（保留兼容，不再写入）
  PENDING_CONFIRM
  MATCHED
  RELATIONSHIP_MODE
}

// ───────────── 广场（旧情侣动态：迁移 12 后废弃，见 §8.1.6/§2.7） ─────────────
// 注：CouplePost/PostComment/PostLike 数据由迁移 12 整体搬入 SquarePost 体系后停写；
// 物理表与本 model 在观察期后的单独 drop 迁移中移除（届时同批删除 User 的反向关系）。
model CouplePost {
  id           String  @id @default(cuid())
  matchId      String?
  match        Match?  @relation(fields: [matchId], references: [id])
  authorUserId String
  author       User    @relation(fields: [authorUserId], references: [id])

  title   String?
  content String   @db.Text
  images  String[]

  likeCount    Int @default(0)
  commentCount Int @default(0)

  comments PostComment[]
  likes    PostLike[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("couple_posts")
}

model PostComment {
  id     String     @id @default(cuid())
  postId String
  post   CouplePost @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId String
  user   User       @relation(fields: [userId], references: [id])

  content  String  @db.Text
  imageUrl String?

  parentCommentId String?
  parent          PostComment?  @relation("CommentReplies", fields: [parentCommentId], references: [id], onDelete: Cascade)
  replies         PostComment[] @relation("CommentReplies")

  createdAt DateTime @default(now())

  @@map("post_comments")
}

model PostLike {
  id        String     @id @default(cuid())
  postId    String
  post      CouplePost @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId    String
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime   @default(now())

  @@unique([postId, userId])
  @@map("post_likes")
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String
  title     String
  body      String   @db.Text
  isRead    Boolean  @default(false)
  metadata  Json?
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@map("notifications")
}

model SystemConfig {
  id        String   @id @default(cuid())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt

  @@map("system_configs")
}

model Message {
  id       String  @id @default(cuid())
  matchId  String
  match    Match   @relation(fields: [matchId], references: [id], onDelete: Cascade)
  senderId String
  sender   User    @relation("MessageSender", fields: [senderId], references: [id])
  content  String  @db.Text
  imageUrl String?
  isRead   Boolean @default(false)

  createdAt DateTime @default(now())

  @@index([matchId, createdAt])
  @@map("messages")
}

model Report {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  category  String
  content   String   @db.Text
  contact   String?
  status    String   @default("open")
  createdAt DateTime @default(now())

  @@map("reports")
}
```

### 2.3 六个迁移（SQL + 执行纪律）

> Postgres 限制：枚举只能追加值；`ALTER TYPE ADD VALUE` 后必须在**新事务**才能 `UPDATE` 引用新值；`@@unique([type,isActive])` 需 partial unique index（schema 无法表达）。
> **生成方式建议**：用 `prisma migrate dev --create-only --name xxx` 生成迁移目录骨架，再把下面 SQL 覆盖进 `migration.sql`；迁移 4/5 拆成两个目录确保跨事务。

**迁移 1 — `20240613_01_add_questionnaire_type`**

```sql
CREATE TYPE "QuestionnaireType" AS ENUM ('ROMANTIC', 'FRIEND');

ALTER TABLE "questionnaire_versions"
  ADD COLUMN "type" "QuestionnaireType" NOT NULL DEFAULT 'ROMANTIC';

-- 前置脏数据检查（手动执行，确认每 type 至多 1 个 active 再建索引）：
-- SELECT "type", count(*) FROM "questionnaire_versions" WHERE "isActive" GROUP BY "type";
CREATE UNIQUE INDEX "qv_type_active_unique"
  ON "questionnaire_versions" ("type") WHERE "isActive" = true;
```

**迁移 2 — `20240613_02_add_user_mode_state`**

```sql
CREATE TABLE "user_mode_states" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mode" TEXT NOT NULL,
  "matchState" TEXT NOT NULL DEFAULT 'idle',
  "matchSearchingSince" TIMESTAMP(3),
  "weeklyMatchNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ums_user_mode_unique" ON "user_mode_states"("userId","mode");
CREATE INDEX "ums_user_mode_state_idx" ON "user_mode_states"("userId","mode","matchState");

-- 现有 User 单一匹配状态迁入 romantic 行
INSERT INTO "user_mode_states"
  ("id","userId","mode","matchState","matchSearchingSince","weeklyMatchNote","createdAt","updatedAt")
SELECT gen_random_uuid()::text, "id", 'romantic',
       COALESCE("matchState",'idle'), "matchSearchingSince", "weeklyMatchNote",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

-- 老 proposed/matched 归一化到新值（先聊后定语义）
UPDATE "user_mode_states" SET "matchState"='confirming'   WHERE "matchState"='proposed';
UPDATE "user_mode_states" SET "matchState"='relationship' WHERE "matchState"='matched';
```

> 注：`gen_random_uuid()` 需 `pgcrypto` 扩展（PG13+ 通常内置）。若不可用，改用 `md5(random()::text || clock_timestamp()::text)`。

**迁移 3 — `20240613_03_add_preferences_mode`**

```sql
ALTER TABLE "user_match_preferences"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'romantic',
  ADD COLUMN "preferredInterests"  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "preferredActivities" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "friendRequirements"  TEXT;

-- 旧唯一约束名按 Prisma 约定为 "user_match_preferences_userId_key"；若不同先查 \d
ALTER TABLE "user_match_preferences" DROP CONSTRAINT "user_match_preferences_userId_key";
ALTER TABLE "user_match_preferences"
  ADD CONSTRAINT "ump_user_mode_unique" UNIQUE ("userId","mode");
```

**迁移 4 — `20240613_04_add_match_mode_and_expand_status`**（建枚举/列/约束/索引 + 仅追加枚举值，不 UPDATE）

```sql
CREATE TYPE "MatchMode" AS ENUM ('ROMANTIC','FRIEND');
ALTER TABLE "matches" ADD COLUMN "mode" "MatchMode" NOT NULL DEFAULT 'ROMANTIC';

ALTER TYPE "MatchStatus" ADD VALUE 'MATCHED_ROMANTIC';
ALTER TYPE "MatchStatus" ADD VALUE 'ROMANTIC_CONFIRMING';
ALTER TYPE "MatchStatus" ADD VALUE 'RELATIONSHIP_ROMANTIC';
ALTER TYPE "MatchStatus" ADD VALUE 'MATCHED_FRIEND';
ALTER TYPE "MatchStatus" ADD VALUE 'FRIEND_CONFIRMING';
ALTER TYPE "MatchStatus" ADD VALUE 'FRIEND_CONFIRMED';

ALTER TABLE "matches" DROP CONSTRAINT "matches_userAId_userBId_key";
ALTER TABLE "matches"
  ADD CONSTRAINT "matches_userA_userB_mode_key" UNIQUE ("userAId","userBId","mode");
CREATE INDEX "matches_mode_status_idx"        ON "matches"("mode","status");
CREATE INDEX "matches_userA_mode_status_idx"  ON "matches"("userAId","mode","status");
CREATE INDEX "matches_userB_mode_status_idx"  ON "matches"("userBId","mode","status");
```

**迁移 5 — `20240613_05_migrate_match_status`**（独立目录/事务，迁移 4 提交后执行）

```sql
UPDATE "matches" SET "status"='MATCHED_ROMANTIC'
  WHERE "status"='PENDING_CONFIRM' AND "userAConfirmed"=false AND "userBConfirmed"=false;
UPDATE "matches" SET "status"='ROMANTIC_CONFIRMING'
  WHERE "status"='PENDING_CONFIRM' AND ("userAConfirmed"=true OR "userBConfirmed"=true);
UPDATE "matches" SET "status"='RELATIONSHIP_ROMANTIC'
  WHERE "status" IN ('MATCHED','RELATIONSHIP_MODE');
```

**迁移 6 — `20240613_06_drop_user_match_fields`**（**后端切到 UserModeState 读写后**才上线）

```sql
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "matchState",
  DROP COLUMN IF EXISTS "matchSearchingSince",
  DROP COLUMN IF EXISTS "weeklyMatchNote",
  DROP COLUMN IF EXISTS "mode";
DROP TYPE IF EXISTS "UserMode";
```

> **执行纪律**：迁移前完整备份；staging 先全量验证；迁移 4 与 5 必须分两次提交；迁移 6 延后到代码完全适配 `UserModeState` 之后（否则运行期读到已删字段 500）。

> **⏭️ 迁移交接（执行顺序声明）**：本节（§2.3）仅覆盖**双模式重构的迁移 1–6**。**增强模式（付费能量系统）的迁移 7–9 见 §10.1**（`20240613_07_add_energy_system` / `..._08_add_match_enhanced_fields` / `..._09_add_prefs_enhanced_fields`），编号与执行顺序**续接本节**。DBA 完整执行顺序为：**1 → 2 → 3 → 4（提交）→ 5（提交）→ 6（后端切到 UserModeState 后）→ 7 → 8 → 9**。其中 4/5 因 Postgres 枚举跨事务限制必须分两次提交（§7 风险 #1）；7/8/9 无枚举跨事务问题，可单目录依次执行（§10.1）。阶段映射：1–6 属阶段 1（§9 阶段 1），7–9 属阶段 8（§9 阶段 8，依赖阶段 1）。

### 2.4 迁移验证脚本

文件：`apps/api/prisma/verify-migrations.ts`（`ts-node prisma/verify-migrations.ts` 跑，全部断言通过才放行）。

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const fail: string[] = [];

  // 1. 每 type 至多 1 个 active
  const dupActive: any[] = await prisma.$queryRaw`
    SELECT "type", count(*)::int AS c FROM "questionnaire_versions"
    WHERE "isActive" GROUP BY "type" HAVING count(*) > 1`;
  if (dupActive.length) fail.push(`有 type 存在多个 active 版本: ${JSON.stringify(dupActive)}`);

  // 2. 每个 User 都有一条 romantic UserModeState
  const usersNoRomantic: any[] = await prisma.$queryRaw`
    SELECT u."id" FROM "users" u
    LEFT JOIN "user_mode_states" s ON s."userId"=u."id" AND s."mode"='romantic'
    WHERE s."id" IS NULL`;
  if (usersNoRomantic.length) fail.push(`${usersNoRomantic.length} 个用户缺少 romantic UserModeState`);

  // 3. 没有残留旧 Match 状态
  const legacy = await prisma.match.count({
    where: { status: { in: ['PENDING_CONFIRM','MATCHED','RELATIONSHIP_MODE'] } },
  });
  if (legacy > 0) fail.push(`仍有 ${legacy} 条 Match 处于旧状态，迁移 5 未生效`);

  // 4. 所有 Match.mode 非空（默认 ROMANTIC）
  const matchModeCount = await prisma.match.groupBy({ by: ['mode'], _count: true });
  console.log('Match by mode:', matchModeCount);

  if (fail.length) { console.error('❌ 校验失败:\n' + fail.join('\n')); process.exit(1); }
  console.log('✅ 迁移校验全部通过');
}
main().finally(() => prisma.$disconnect());
```

### 2.5 seed.ts 改动

`apps/api/prisma/seed.ts`：
1. 现有 V2 创建块加 `type: QuestionnaireType.ROMANTIC`（导入 `QuestionnaireType`）。
2. 为每个 seed 用户建 `romantic` 的 `UserModeState`（替代原 `user.update({ matchState })`）：

```ts
await prisma.userModeState.upsert({
  where: { userId_mode: { userId: u.id, mode: 'romantic' } },
  create: { userId: u.id, mode: 'romantic', matchState: 'idle' },
  update: {},
});
```

3. 新增 friend 问卷种子（见 §5.5 `FRIEND_QUESTIONS` 与创建块）。

### 2.6 广场改版数据模型（SquarePost + AdminUser 扩展，I 规则 §8.1）

> 以下 model/enum **追加到 §2.2 目标全文**（与 §10.1 增强模式片段同等性质，可直接拼入 `schema.prisma`）；迁移见 §2.7（迁移 10/11/12，编号续接 §2.3 的 1–6 与 §10.1 的 7–9）。**`SquarePost` 取代旧 `CouplePost`**：迁移 10/11 建新表与扩展后管，迁移 12 把旧 `CouplePost` 数据搬入并废弃旧表（§8.1.6）。

```prisma
// ───────────── 广场改版：推荐 + 校园墙（新表，取代 CouplePost） ─────────────
enum SquareBoard {
  RECOMMEND     // 推荐 tab
  CAMPUS_WALL   // 校园墙 tab（同校可见）
}

enum SquareAuthorType {
  USER           // 用户个人帖（authorUserId 非空）→ 小卡(recommend)/中卡(campus_wall)
  STUDENT_UNION  // 学生会官方帖（adminId 非空；school 标注该校）→ 大卡
  TEAM           // 团队官方帖（adminId 非空；跨校）→ 大卡
  SPONSOR        // 赞助商推广帖（adminId 非空；标 "Sponsored"）→ 大卡
}

enum AdminRole {
  SUPER          // 超管：全校、全角色管理
  STUDENT_UNION  // 学生会（绑定 schoolId）：仅发本校官方帖
  TEAM           // 团队：发跨校官方帖
  SPONSOR        // 赞助商：发商业推广帖
}

model SquarePost {
  id           String           @id @default(cuid())

  board        SquareBoard      @default(RECOMMEND)
  authorType   SquareAuthorType @default(USER)

  // 作者标识（二选一：USER 帖 authorUserId 非空；官方帖 adminId 非空）
  authorUserId String?
  authorUser   User?            @relation("SquarePostAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)
  adminId      String?
  admin        AdminUser?       @relation(fields: [adminId], references: [id], onDelete: SetNull)

  school       String?          // 右上角学校标注（USER 取 author.profile.school；官方帖显式传/留空=跨校）

  coupleMatchId String?         // 可选：CouplePost 迁移而来的情侣帖，关联原 Match（非空=情侣帖，前端取双方 profile 展示双头像）；普通/单人/demo 帖留空（§8.1.6 迁移 12）

  title        String?
  content      String           @db.Text
  images       String[]         @default([])

  likeCount    Int              @default(0)
  commentCount Int              @default(0)

  anonymous    Boolean          @default(false)  // true=隐藏头像/昵称为"匿名同学"（§8.1.1，学校仍标注）
  isSponsored  Boolean          @default(false)  // SPONSOR 帖=true，UI 显示 "Sponsored"

  isHidden     Boolean          @default(false)  // 举报/下架后对他人隐藏（发帖者仍可见）
  deletedBy    String?          // 删除者（adminId / 'reporter:auto' / 发帖者本人）
  deletedAt    DateTime?
  deleteReason String?

  tags         String[]         @default([])     // 分类标签（预留召回/筛选，本期不参与排序）
  metadata     Json?            // 扩展（weight/pinned/campaignId/partnerInfo...）

  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  comments     SquarePostComment[]
  likes        SquarePostLike[]

  @@index([board, createdAt])     // 推荐/校园墙分段查询
  @@index([board, school])        // 校园墙同校过滤
  @@index([authorType, createdAt])// 官方帖置顶/插入
  @@index([isHidden, createdAt])  // 审核后台筛选
  @@index([coupleMatchId])        // 情侣帖按原 Match 反查双方 profile（迁移 12）
  @@map("square_posts")
}

model SquarePostComment {
  id              String              @id @default(cuid())
  postId          String
  post            SquarePost          @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId          String
  user            User                @relation("SquarePostCommentAuthor", fields: [userId], references: [id], onDelete: Cascade)

  content         String              @db.Text
  imageUrl        String?

  parentCommentId String?
  parent          SquarePostComment?  @relation("SquareCommentReplies", fields: [parentCommentId], references: [id], onDelete: Cascade)
  replies         SquarePostComment[] @relation("SquareCommentReplies")

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([postId, createdAt])
  @@map("square_post_comments")
}

model SquarePostLike {
  id        String     @id @default(cuid())
  postId    String
  post      SquarePost @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId    String
  user      User       @relation("SquarePostLikes", fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime   @default(now())

  @@unique([postId, userId])
  @@index([postId])
  @@index([userId])
  @@map("square_post_likes")
}
```

**User 关系扩展**（追加到 §2.2 的 `model User`）：

```prisma
  squarePosts    SquarePost[]        @relation("SquarePostAuthor")
  squareComments SquarePostComment[] @relation("SquarePostCommentAuthor")
  squareLikes    SquarePostLike[]    @relation("SquarePostLikes")
```

**AdminUser 扩展**（替换 §2.2 的 `model AdminUser`）：

```prisma
model AdminUser {
  id               String       @id @default(cuid())
  email            String       @unique
  passwordHash     String
  name             String
  role             AdminRole?                       // NEW：null=仅可查看（无发帖权）
  schoolId         String?                          // NEW：STUDENT_UNION 必填（绑定本校）
  organizationName String?                          // NEW：TEAM/SPONSOR 组织名
  isActive         Boolean      @default(true)      // NEW：禁用账号（软删除）
  isSuperAdmin     Boolean      @default(false)     // 兼容旧字段（与 role=SUPER 二者取一/对齐）
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  squarePosts      SquarePost[]                     // NEW：发布的官方帖

  @@index([role, schoolId])
  @@map("admin_users")
}
```

> **`isSuperAdmin` ↔ `role` 兼容**：迁移 11 把现有 `isSuperAdmin=true` 的账号回填 `role=SUPER`（见 §2.7）；新代码以 `role` 为权威，`isSuperAdmin` 仅向下兼容旧鉴权代码，逐步收敛。

### 2.7 广场改版迁移（迁移 10/11/12，续接 §2.3 / §10.1）

> 编号续接：§2.3 迁移 1–6、§10.1 迁移 7–9，本节为**迁移 10/11/12**。10/11 建新表与扩展后管，12 把旧 `CouplePost` 数据搬入 `SquarePost` 并废弃旧表（§8.1.6 定稿）。三者无枚举跨事务问题（新枚举仅新表/新列引用，不 `UPDATE` 既有行的枚举值），可单目录依次执行（顺序 10 → 11 → 12）；执行纪律同 §2.3（先备份、staging 验证）。

**迁移 10 — `20240613_10_add_square_posts`**

```sql
CREATE TYPE "SquareBoard" AS ENUM ('RECOMMEND', 'CAMPUS_WALL');
CREATE TYPE "SquareAuthorType" AS ENUM ('USER', 'STUDENT_UNION', 'TEAM', 'SPONSOR');

CREATE TABLE "square_posts" (
  "id"           TEXT PRIMARY KEY,
  "board"        "SquareBoard" NOT NULL DEFAULT 'RECOMMEND',
  "authorType"   "SquareAuthorType" NOT NULL DEFAULT 'USER',
  "authorUserId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "adminId"      TEXT REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "school"       TEXT,
  "coupleMatchId" TEXT REFERENCES "matches"("id") ON DELETE SET NULL,
  "title"        TEXT,
  "content"      TEXT NOT NULL,
  "images"       TEXT[] NOT NULL DEFAULT '{}',
  "likeCount"    INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "anonymous"    BOOLEAN NOT NULL DEFAULT false,
  "isSponsored"  BOOLEAN NOT NULL DEFAULT false,
  "isHidden"     BOOLEAN NOT NULL DEFAULT false,
  "deletedBy"    TEXT,
  "deletedAt"    TIMESTAMP(3),
  "deleteReason" TEXT,
  "tags"         TEXT[] NOT NULL DEFAULT '{}',
  "metadata"     JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sp_board_created_idx"  ON "square_posts"("board", "createdAt" DESC);
CREATE INDEX "sp_board_school_idx"   ON "square_posts"("board", "school");
CREATE INDEX "sp_author_type_idx"    ON "square_posts"("authorType", "createdAt" DESC);
CREATE INDEX "sp_hidden_created_idx" ON "square_posts"("isHidden", "createdAt" DESC);
CREATE INDEX "sp_couple_match_idx"   ON "square_posts"("coupleMatchId");

CREATE TABLE "square_post_comments" (
  "id"              TEXT PRIMARY KEY,
  "postId"          TEXT NOT NULL REFERENCES "square_posts"("id") ON DELETE CASCADE,
  "userId"          TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content"         TEXT NOT NULL,
  "imageUrl"        TEXT,
  "parentCommentId" TEXT REFERENCES "square_post_comments"("id") ON DELETE CASCADE,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);
CREATE INDEX "spc_post_created_idx" ON "square_post_comments"("postId", "createdAt" DESC);

CREATE TABLE "square_post_likes" (
  "id"        TEXT PRIMARY KEY,
  "postId"    TEXT NOT NULL REFERENCES "square_posts"("id") ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spl_post_user_unique" UNIQUE ("postId", "userId")
);
CREATE INDEX "spl_post_idx" ON "square_post_likes"("postId");
CREATE INDEX "spl_user_idx" ON "square_post_likes"("userId");
```

**迁移 11 — `20240613_11_extend_admin_users`**

```sql
CREATE TYPE "AdminRole" AS ENUM ('SUPER', 'STUDENT_UNION', 'TEAM', 'SPONSOR');

ALTER TABLE "admin_users"
  ADD COLUMN "role"             "AdminRole",
  ADD COLUMN "schoolId"         TEXT,
  ADD COLUMN "organizationName" TEXT,
  ADD COLUMN "isActive"         BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "au_role_school_idx" ON "admin_users"("role", "schoolId");

-- 兼容回填：现有超管账号置 role=SUPER（新代码以 role 为权威）
UPDATE "admin_users" SET "role" = 'SUPER' WHERE "isSuperAdmin" = true AND "role" IS NULL;
```

**迁移 12 — `20240613_12_migrate_couple_posts_to_square`**（§8.1.6 定稿：CouplePost → SquarePost 数据迁移 + 旧表废弃）

> 在迁移 10/11 建好 `square_posts` / `square_post_comments` / `square_post_likes` 后执行。把旧 `couple_posts`（情侣帖 + 历史单人帖 + demo）整体搬成 `SquarePost` 普通帖：作者取发帖方（`authorType='USER'`、`board='RECOMMEND'`），`coupleMatchId` 回填原 `matchId` 以保留双头像语义，`school` 取作者 profile.school。评论 / 点赞按 postId 映射搬运。**新旧 postId 一致（沿用同一 id）**，故评论 / 点赞可直接以原 postId 写入。

```sql
-- 12.1 帖子本体：couple_posts → square_posts（沿用原 id，便于评论/点赞直接映射）
INSERT INTO "square_posts"
  ("id","board","authorType","authorUserId","adminId","school","coupleMatchId",
   "title","content","images","likeCount","commentCount",
   "anonymous","isSponsored","isHidden","tags","metadata","createdAt","updatedAt")
SELECT cp."id", 'RECOMMEND', 'USER', cp."authorUserId", NULL,
       p."school",                       -- 学校取作者 profile（取不到为 NULL）
       cp."matchId",                     -- coupleMatchId：非空=情侣帖（前端展示双头像），空=普通/单人/demo
       cp."title", cp."content", cp."images", cp."likeCount", cp."commentCount",
       false, false, false, '{}', NULL, cp."createdAt", cp."updatedAt"
FROM "couple_posts" cp
LEFT JOIN "profiles" p ON p."userId" = cp."authorUserId";

-- 12.2 评论：post_comments → square_post_comments（postId 沿用，parentCommentId 同表内一致）
INSERT INTO "square_post_comments"
  ("id","postId","userId","content","imageUrl","parentCommentId","createdAt","updatedAt")
SELECT pc."id", pc."postId", pc."userId", pc."content", pc."imageUrl",
       pc."parentCommentId", pc."createdAt", pc."createdAt"
FROM "post_comments" pc;

-- 12.3 点赞：post_likes → square_post_likes（沿用 @@unique([postId,userId])）
INSERT INTO "square_post_likes" ("id","postId","userId","createdAt")
SELECT pl."id", pl."postId", pl."userId", pl."createdAt"
FROM "post_likes" pl;

-- 12.4 校验（迁移后立即执行，断言不通过则回滚）：
-- 帖子总数一致：
--   SELECT (SELECT count(*) FROM "couple_posts")
--          = (SELECT count(*) FROM "square_posts" WHERE "authorType"='USER' AND "board"='RECOMMEND');
-- 情侣帖条数一致：
--   SELECT (SELECT count(*) FROM "couple_posts" WHERE "matchId" IS NOT NULL)
--          = (SELECT count(*) FROM "square_posts" WHERE "coupleMatchId" IS NOT NULL);
-- 评论/点赞条数一致：
--   SELECT (SELECT count(*) FROM "post_comments") = (SELECT count(*) FROM "square_post_comments");
--   SELECT (SELECT count(*) FROM "post_likes")    = (SELECT count(*) FROM "square_post_likes");
```

> **旧表废弃（迁移 12 校验通过后）**：`couple_posts` / `post_comments` / `post_likes` 停写，旧 `square` 端点下线（§8.1.5/§8.1.6）。物理 `DROP TABLE` 不在本迁移内执行——保留一个观察期，确认线上稳定、无回滚需求后单独追加 drop 迁移；schema 中相应 model 与 `User.couplePosts/postComments/postLikes` 反向关系在 drop 迁移同批移除。

---

## 3. 匹配流程与状态机

### 3.1 恋人「先聊后定 + 48h 双确认」状态机（含转换表）

> 流程：匹配产出 → 立即可聊（临时对话）→ 48h 内双方确认 → 永久；48h 未双确 → `EXPIRED`（对话消失 + 双方通知）。

```
UserModeState.matchState (mode='romantic')
  idle ─startMatch─► searching ─cron 本轮无─► no_match ─(用户主动点击)─► searching
                        │ 本轮匹配成功(1个)
                        ▼
                     matched ─任一方 confirm─► confirming ─另一方 confirm─► relationship(恋人匹配停止)
                        │  ▲                      │                              │ dissolve
                        │  └──── 48h 未双确 ───────┘                             ▼
                        │            │                                         idle
                        │      (EXPIRED: 对话消失+通知)                  (用户主动点击才再 startMatch)
                        ▼            ▼
                      idle ◄──────── no_match? 否, 回 idle, 需用户主动重进池
```

**Match.status 转换表（mode=ROMANTIC）**

| 当前状态 | 动作/事件 | 守卫 | 新状态 | 副作用 |
|---|---|---|---|---|
| (无) | cron 配对 | 评分≥阈值，双方均无进行中 ROMANTIC | `MATCHED_ROMANTIC` | 双方 UMS→`matched`，发 match_result 通知；`createdAt` 作为 48h 锚点 |
| `MATCHED_ROMANTIC` | A confirmRelationship | A 未确认 | `ROMANTIC_CONFIRMING` | `userAConfirmed=true`，A 的 UMS→`confirming` |
| `ROMANTIC_CONFIRMING` | B confirmRelationship | 双方都将确认 | `RELATIONSHIP_ROMANTIC` | `confirmedAt`/`relationshipStartedAt=now`，双方 UMS→`relationship`；**恋人匹配停止**（B 规则） |
| `MATCHED_ROMANTIC`/`ROMANTIC_CONFIRMING` | **48h EXPIRE**（scheduler） | `createdAt ≤ now-48h` 且未双确 | `EXPIRED` | 双方 UMS→`idle`；对话从 Chat 列表隐藏；各发 expire 通知；**不自动续，需用户主动点击重进池** |
| `MATCHED_ROMANTIC`/`ROMANTIC_CONFIRMING` | reject（可选） | 参与者 | `REJECTED` | 双方 UMS→`idle`，清确认标志 |
| `RELATIONSHIP_ROMANTIC` | dissolve（删除关系） | 参与者 | `DISSOLVED` | 双方 UMS→`idle`；广场相关数据隐藏；**双方收到「X 解除了恋爱关系」通知**（E 规则） |

要点：
- 配对成功即 `MATCHED_ROMANTIC`，**立即可聊（临时对话）**，不再有早期 `PENDING_CONFIRM` 的「先确认才能聊」等待期。
- 「确认成为恋人」是 **Chat 对话框内**的动作（不是匹配界面），**双方都确认**才 `RELATIONSHIP_ROMANTIC`。
- **48h 时限通用**：`MATCHED_ROMANTIC` / `ROMANTIC_CONFIRMING` 在 `createdAt` 起 48h 内未双确 → `EXPIRED`，由 scheduler 扫描（§3.5）。
- **确认后恋人匹配停止**：进入 `relationship` 后 `startMatchForUser('romantic')` 被独占拦截，恋人匹配界面改显「打开和恋人的对话」入口（B 规则、§6.2）。
- 过期 / reject / dissolve 后 UMS 回 `idle`，**不自动重新加入匹配池**，需用户主动点击（B 规则）。

### 3.2 朋友「先聊后定 + 48h 双确认」状态机（改动：朋友也要确认）

> 与恋人对称，但一轮可产出**最多 5 个候选**，且**可同时拥有多个已确认朋友**（各自 1v1）。逐对独立确认 / 过期，互不影响其它朋友会话。

```
UserModeState.matchState (mode='friend')
  idle ─startMatch─► searching ─cron 本轮无─► no_match ─(用户主动点击)─► searching
                        │ 本轮匹配成功(≤5 个候选, 各一条 MATCHED_FRIEND)
                        ▼
                  matched(多条临时对话) ── 每条独立 ──► confirming ──► confirmed(永久朋友)
                        │  ▲                                │
                        │  └──── 该条 48h 未双确 ───────────┘
                        │              (EXPIRED: 该对话消失+双方通知)
                        ▼
                  剩余无任何活跃朋友对话时 UMS 回 idle；有已确认朋友则保持 relationship
```

**Match.status 转换表（mode=FRIEND）**

| 当前状态 | 动作/事件 | 守卫 | 新状态 | 副作用 |
|---|---|---|---|---|
| (无) | cron 配对 | 评分≥阈值，每人本轮取 Top-N（N≤5） | `MATCHED_FRIEND` | 双方 UMS→`matched`；发 match_result 通知；`createdAt` 作为 48h 锚点 |
| `MATCHED_FRIEND` | A confirmFriend | A 未确认 | `FRIEND_CONFIRMING` | `userAConfirmed=true`，A 的 UMS→`confirming`（若 A 已有已确认朋友则保持 `relationship`） |
| `FRIEND_CONFIRMING` | B confirmFriend | 双方都将确认 | `FRIEND_CONFIRMED` | `confirmedAt=now`，双方 UMS→`relationship`（永久朋友，可与多人并存） |
| `MATCHED_FRIEND`/`FRIEND_CONFIRMING` | **48h EXPIRE**（scheduler） | `createdAt ≤ now-48h` 且未双确 | `EXPIRED` | 该对话从 Chat 列表隐藏；各发 expire 通知；该用户**若再无任何活跃朋友会话**则 UMS→`idle`，否则保持现态 |
| `MATCHED_FRIEND`/`FRIEND_CONFIRMING`/`FRIEND_CONFIRMED` | dissolve（删除关系） | 参与者 | `DISSOLVED` | **双方收到「X 解除了朋友关系」通知**（E 规则）；只解除这一条，不影响其它朋友 |

要点：
- 一轮产出**最多 5 条** `MATCHED_FRIEND`（临时对话），全部立即可聊，但**都要双方确认**才 `FRIEND_CONFIRMED`（永久）。
- 与恋人不同，朋友 `matched`/`relationship` **不独占**：再次跑 cron 可继续追加新候选（已确认朋友数量不限）。
- 每条朋友 Match 的 48h 计时**各自独立**（按各自 `createdAt`）。

### 3.3 模式并存

两套状态分存 `UserModeState(userId,'romantic')` 与 `(userId,'friend')`，互不影响。一个用户可同时 `romantic=searching` 且 `friend=matched`。`@@unique([userAId,userBId,mode])` 允许同一对用户在两模式各有一条 Match。

### 3.4 关键 service 函数签名与伪代码

> 文件：`apps/api/src/matching/matching.service.ts`。所有现有方法加 `mode: ModeStr` 参数（默认 `'romantic'`）。新增私有 `ensureModeState`。

```ts
// ── 确保 per-mode 状态行存在（懒创建） ──
private async ensureModeState(tx, userId: string, mode: ModeStr) {
  return tx.userModeState.upsert({
    where: { userId_mode: { userId, mode } },
    create: { userId, mode, matchState: 'idle' },
    update: {},
  });
}

// ── 开始匹配（替换 startMatchForUser；新增增强模式参数 enhanced/friendCells，J 规则 §10.2） ──
async startMatchForUser(
  userId: string, mode: ModeStr = 'romantic',
  enhanced = false, friendCells?: number, // 增强开关 + 朋友档位（1–5）
) {
  // BANNED 拦截；不再读 user.mode（已删）
  // G 规则：该模式问卷必须已填，否则引导去填（前端先查 /questionnaire/completion，后端兜底）
  const completion = await this.questionnaireService.getCompletion(userId);
  if (!completion[mode]?.completed)
    throw new BadRequestException(`请先填写${mode === 'friend' ? '朋友' : '恋人'}问卷后再进入匹配`);

  // 增强校验：能量必须充足（J 规则 4/7：加入池时预扣）。cost = 恋爱固定3，朋友=friendCells(1–5)
  let cost = 0;
  if (enhanced) {
    cost = mode === 'romantic' ? 3 : Math.min(5, Math.max(1, friendCells ?? 1));
    const available = await this.energyService.getAvailableEnergy(userId);
    if (available < cost) throw new BadRequestException('能量不足，请充值');
  }

  return this.prisma.$transaction(async (tx) => {
    const st = await this.ensureModeState(tx, userId, mode);
    if (st.matchState === 'searching') return { status: 'SEARCHING', message: '已在匹配中' };
    // 恋人独占：matched/confirming/relationship 时不可重开（B 规则：已有恋人不再匹配新恋人）
    // 朋友：matched/confirming/relationship 均允许继续追加新候选（C 规则：可同时多个朋友）
    if (mode === 'romantic' && ['matched','confirming','relationship'].includes(st.matchState))
      throw new BadRequestException('你已有进行中或已确认的恋人，恋人匹配已停止');
    // CAS：仅当不在 searching/(恋人独占态) 时写入 searching
    const blocked = mode === 'romantic'
      ? ['searching','matched','confirming','relationship'] : ['searching'];
    const res = await tx.userModeState.updateMany({
      where: { userId, mode, matchState: { notIn: blocked } },
      data: { matchState: 'searching', matchSearchingSince: new Date(), weeklyMatchNote: null },
    });
    if (res.count === 0) { /* 并发抢先：重读区分 SEARCHING / 冲突 */ }

    // 增强：① 同一事务内写入本轮增强选择到 UMP（匹配时 buildCandidates 读取）；
    //       ② 预扣能量（CONSUME 流水 + usedEnergy += cost）。详见 §10.2 energyFlow。
    await tx.userMatchPreferences.update({
      where: { userId_mode: { userId, mode } },
      data: { enhancedModeEnabled: enhanced,
              ...(mode === 'friend' ? { friendEnhancedCells: cost || 1 } : {}) },
    });
    if (enhanced) {
      await this.energyService.consumeInTx(tx, userId, cost, mode,
        /*matchId*/ null, `${mode === 'friend' ? '朋友' : '恋爱'}增强预扣${cost}格`);
    }
    return { status: 'SEARCHING', message: enhanced ? `已加入本轮匹配池（增强：预扣${cost}格）` : '已加入本轮匹配池' };
  });
}
// 注：过期 / 解除 / 拒绝后 UMS 回 idle，**不自动续**；用户须主动再次调用本方法（B 规则）。
// 注：增强预扣后若本轮空池（无任何可配对象）→ executeMatchJob 标记 → 退还（REFUND）；详见 §3.6/§10.2/§10.3。

// ── 停止匹配（替换 stopMatchForUser） ──
async stopMatchForUser(userId: string, mode: ModeStr = 'romantic') {
  const st = await this.prisma.userModeState.findUnique({ where: { userId_mode: { userId, mode } } });
  if (!st || st.matchState !== 'searching') throw new BadRequestException('当前不在匹配中');
  await this.prisma.userModeState.update({
    where: { userId_mode: { userId, mode } },
    data: { matchState: 'idle', matchSearchingSince: null },
  });
  return { status: 'IDLE', message: '已停止匹配' };
}

// ── 完整状态（替换 getFullMatchStatus；按 mode 分支） ──
async getFullMatchStatus(userId: string, mode: ModeStr = 'romantic') {
  const st = await this.ensureModeState(this.prisma, userId, mode);
  const cfg = await this.prisma.matchConfig.findFirst({ where: { isEnabled: true } });
  const nextRunAt = this.computeNextRunAt(cfg?.cronExpr);
  const base = { mode, matchConfig: cfg ? { cronExpr: cfg.cronExpr, description: cfg.description } : null, nextRunAt };

  if (mode === 'friend') {
    // 朋友：返回多候选/多朋友数组（含临时 + 已确认；临时带 remainingMs）
    if (st.matchState === 'searching')
      return { ...base, state: st.weeklyMatchNote === 'no_match' ? 'no_match' : 'searching', matches: [] };
    const friendStatuses = ['MATCHED_FRIEND','FRIEND_CONFIRMING','FRIEND_CONFIRMED'];
    const ms = await this.prisma.match.findMany({
      where: { mode: 'FRIEND', status: { in: friendStatuses },
        OR: [{ userAId: userId }, { userBId: userId }], dissolvedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const matches = await Promise.all(ms.map(async (m) => {
      const isA = m.userAId === userId, pid = isA ? m.userBId : m.userAId;
      const isTemp = isTempStatus(m.status);
      return {
        matchId: m.id, status: m.status, score: m.score,
        myConfirmed: isA ? m.userAConfirmed : m.userBConfirmed,
        partnerConfirmed: isA ? m.userBConfirmed : m.userAConfirmed,
        // 临时对话剩余时间（毫秒），永久对话为 null
        remainingMs: isTemp ? Math.max(0, m.createdAt.getTime() + CONFIRM_WINDOW_MS - Date.now()) : null,
        partner: await this.profilesService.getPublicProfile(pid),
      };
    }));
    // 朋友匹配界面：matched=有临时候选/已确认朋友；否则回 UMS 态
    return { ...base, state: matches.length ? 'matched' : (st.matchState as any), matches };
  }

  // 恋人：单对象（matched/confirming/relationship 都返回 partner+match；临时态附 remainingMs）
  const romanticStatuses = ['MATCHED_ROMANTIC','ROMANTIC_CONFIRMING','RELATIONSHIP_ROMANTIC'];
  const m = await this.prisma.match.findFirst({
    where: { mode: 'ROMANTIC', status: { in: romanticStatuses },
      OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { createdAt: 'desc' },
  });
  if (!m) {
    if (st.matchState === 'searching')
      return { ...base, state: st.weeklyMatchNote === 'no_match' ? 'no_match' : 'searching', match: null, partner: null };
    return { ...base, state: 'idle', match: null, partner: null };
  }
  const isA = m.userAId === userId, pid = isA ? m.userBId : m.userAId;
  const stateMap = { MATCHED_ROMANTIC: 'matched', ROMANTIC_CONFIRMING: 'confirming', RELATIONSHIP_ROMANTIC: 'relationship' };
  const isTemp = isTempStatus(m.status);
  return {
    ...base, state: stateMap[m.status],
    match: { id: m.id, status: m.status,
      myConfirmed: isA ? m.userAConfirmed : m.userBConfirmed,
      partnerConfirmed: isA ? m.userBConfirmed : m.userAConfirmed,
      // 临时对话（MATCHED_ROMANTIC/ROMANTIC_CONFIRMING）剩余时间，永久关系为 null
      remainingMs: isTemp ? Math.max(0, m.createdAt.getTime() + CONFIRM_WINDOW_MS - Date.now()) : null,
      score: m.score, matchedAt: m.createdAt,
      relationshipStartedAt: m.relationshipStartedAt },
    partner: await this.profilesService.getPublicProfile(pid),
  };
}

// ── 通用确认：确认成为恋人 / 朋友（双确认语义，romantic + friend 统一） ──
// 在 Chat 对话框内触发（D 规则），双方都确认才转永久。
async confirmRelationship(userId: string, matchId: string) {
  return this.prisma.$transaction(async (tx) => {
    const m = await tx.match.findUnique({ where: { id: matchId } });
    if (!m) throw new NotFoundException('匹配不存在');
    if (m.userAId !== userId && m.userBId !== userId) throw new ForbiddenException('你不属于该匹配');

    // 按 mode 决定临时/永久状态名
    const isFriend = m.mode === 'FRIEND';
    const modeStr: ModeStr = isFriend ? 'friend' : 'romantic';
    const TEMP   = isFriend ? ['MATCHED_FRIEND','FRIEND_CONFIRMING'] : ['MATCHED_ROMANTIC','ROMANTIC_CONFIRMING'];
    const CONFIRMING = isFriend ? 'FRIEND_CONFIRMING' : 'ROMANTIC_CONFIRMING';
    const FINAL  = isFriend ? 'FRIEND_CONFIRMED' : 'RELATIONSHIP_ROMANTIC';

    if (!TEMP.includes(m.status)) throw new BadRequestException('当前状态不可确认');
    // 兜底：48h 已过的临时对话不允许再确认（应已被 scheduler 置 EXPIRED）
    if (Date.now() > m.createdAt.getTime() + CONFIRM_WINDOW_MS)
      throw new BadRequestException('确认窗口已过期');
    const isA = m.userAId === userId;
    if (isA ? m.userAConfirmed : m.userBConfirmed)
      return { status: 'WAITING', message: '你已确认，等待对方' };

    // CAS：带 status 守卫更新本方确认 + 推进到 CONFIRMING
    await tx.match.updateMany({
      where: { id: matchId, status: { in: TEMP } },
      data: { ...(isA ? { userAConfirmed: true } : { userBConfirmed: true }), status: CONFIRMING },
    });
    // 本方 UMS → confirming（朋友若已有已确认朋友则保持 relationship，不降级）
    await tx.userModeState.updateMany({
      where: { userId, mode: modeStr, matchState: { notIn: ['relationship'] } },
      data: { matchState: 'confirming' } });

    const u = await tx.match.findUnique({ where: { id: matchId } });
    if (u!.userAConfirmed && u!.userBConfirmed) {
      const now = new Date();
      await tx.match.update({ where: { id: matchId },
        data: { status: FINAL, confirmedAt: now,
                ...(isFriend ? {} : { relationshipStartedAt: now }) } });
      await tx.userModeState.updateMany({
        where: { userId: { in: [m.userAId, m.userBId] }, mode: modeStr },
        data: { matchState: 'relationship' } });
      // 通知双方：关系/朋友确立
      return { status: FINAL, message: isFriend ? '双方已确认，成为朋友！' : '双方已确认，恋爱关系已确立！' };
    }
    return { status: 'WAITING', message: '你已确认，等待对方确认...' };
  });
}

// ── 通用解除（删除关系，恋人 / 朋友 + 发通知，E 规则） ──
async dissolveMatch(userId: string, matchId: string, reason?: string) {
  // 1. 校验参与者；2. 校验状态可解除（恋人 RELATIONSHIP_ROMANTIC / 朋友任意活跃态 / 临时对话亦可）；
  // 3. 置 DISSOLVED + dissolvedBy=userId / dissolvedAt / dissolveReason；
  // 4. 对方收到通知：「{我的昵称} 解除了{朋友/恋爱}关系」（type='relationship_dissolved'，metadata.mode）；
  // 5. UMS 回收（复用 §3.5 的 recomputeModeStateAfterExpire 判定，保证一致）：
  //    - 恋人：双方 mode='romantic' UMS → idle（恋人匹配可再次主动开启）
  //    - 朋友：仅解除这一条，不影响其它朋友；调 recomputeModeStateAfterExpire 重算——
  //            仍有已确认朋友→保持 relationship，仅剩临时对话→matched，全空→idle（§3.5 伪代码）
  // 6. 恋人解除后，广场相关数据隐藏（§8）。
}

// 注：拉黑（E 规则）跨两模式生效——见 §3.6「拉黑过滤」：拉黑写入后，buildCandidates 对两模式均过滤该对用户。

// ── 执行匹配（executeMatchJob 加 mode 参数；含增强强配 + 空池退款，§3.6/§10.3） ──
async executeMatchJob(jobId: string, mode: ModeStr) {
  const qType = toQType(mode);
  const activeVersion = await this.prisma.questionnaireVersion.findFirst({ where: { isActive: true, type: qType } });
  const candidates = await this.buildCandidates(mode, activeVersion?.id); // CandidateProfile 含 enhanced/enhancedCost
  // C 规则：朋友每轮最多 5 个候选；恋人每轮 1 个
  const constraints = { maxMatchesPerUser: mode === 'romantic' ? 1 : 5, mode };
  // generateMatches 两阶段：① 增强用户无视 75 分阈值强配（恋人取最高分1，朋友取TopN）；② 普通用户 greedy(threshold=75)。
  // 返回值新增 pair.enhanced/pair.enhancedCost 与 emptyPoolUserIds（空池需退款用户）。详见 §3.6/§10.3。
  const result = await this.matchModelProvider.generateMatches(candidates, constraints);
  const initStatus = mode === 'romantic' ? 'MATCHED_ROMANTIC' : 'MATCHED_FRIEND';
  // 逐对创建 Match(mode, status=initStatus, userAConfirmed=false, userBConfirmed=false)；
  //   → 立即可聊（临时对话），48h 倒计时从 createdAt 起算（恋人/朋友一致）。
  //   → 若 pair.enhanced：写 Match.enhancedMode=mode / enhancedUserEnergy=pair.enhancedCost / enhancedAttemptedAt=now（便于退款）。
  // 恋人：跳过任一方已有进行中或已确认的 ROMANTIC 匹配；双方 UMS(romantic)→matched
  // 朋友：允许一人多条（≤5）；双方 UMS(friend)→matched
  // 未匹配 searching 者：对应 mode 的 UMS.weeklyMatchNote='no_match' + 通知（不自动续，需用户主动重进池）
  // 增强空池退款（J 规则 6/7）：result.emptyPoolUserIds 中每个增强用户（本轮池无任何可配对象）
  //   → energyService.refund(userId, mode, cost, null, '增强空池退还') + 通知「本轮无可配对象，能量已退还」。
  //   （注：增强保证机制下，只要池中存在任一其他候选就一定配上；只有真正空池才退款。）
  for (const ep of result.emptyPoolUserIds ?? []) {
    await this.energyService.refund(ep.userId, mode, ep.cost, null, '本轮无可配对象', 'empty_pool');
    // refund 内部已发通知 type='energy_refunded'（metadata.refundReason='empty_pool'，§10.2/§10.4 退款通知）
  }
}

// ── 候选池（buildCandidates 加 mode 参数） ──
private async buildCandidates(mode: ModeStr, activeVersionId?: string) {
  const states = await this.prisma.userModeState.findMany({
    where: { mode, matchState: 'searching',
      user: { status: 'ACTIVE', profile: { isNot: null } } },
    select: { userId: true },
  });
  const ids = states.map(s => s.userId);
  const users = await this.prisma.user.findMany({
    where: { id: { in: ids } },
    include: {
      profile: true,
      matchPreferences: { where: { mode } },   // 按 mode 取偏好
      answers: activeVersionId
        ? { where: { questionnaireVersionId: activeVersionId },
            include: { question: { select: { type: true, order: true, group: true } } } }
        : undefined,
    },
  });
  // 恋人：要求 gender/genderPref/age 齐全（同旧逻辑）
  // 朋友：放宽——不强制性别字段，profile 存在即可
  // _prefs 取 user.matchPreferences[0]（该 mode 唯一一条）
  // E 规则（拉黑跨两模式）：generateMatches 前剔除「任一方拉黑了对方」的候选对——
  //   两个模式都用同一份拉黑名单（拉黑是用户级，不区分 mode）。
  // J 规则（增强，§10.3）：每个 CandidateProfile 附带
  //   enhanced = _prefs.enhancedModeEnabled
  //   enhancedCost = mode==='romantic' ? 3 : (_prefs.friendEnhancedCells ?? 1)
  //   供 generateMatches 分离「增强池 / 普通池」并对增强用户无视 75 分阈值强配。
}

// ── 触发（triggerMatchJob 加 mode；写 metadata.mode） ──
async triggerMatchJob(triggeredBy = 'manual', mode: ModeStr = 'romantic') {
  // 「正在运行」检查改为按 mode 维度（用 MatchJob.metadata.mode 区分两模式可并行）
  const job = await this.prisma.matchJob.create({ data: { triggeredBy, status: 'PENDING' } });
  // metadata 写 { mode }；queue payload { jobId, mode }
  await this.matchQueue.add(MATCH_JOB, { jobId: job.id, mode }, { attempts: 3, backoff: {...} });
}
```

> **Queue processor**（`match.processor.ts` 或 module 内）：`process(MATCH_JOB)` 读 `job.data.mode`（缺省 `'romantic'`）转发给 `executeMatchJob(jobId, mode)`。

### 3.5 Cron 调度 + 48h 通用过期清理（match.scheduler.ts）

**(1) 匹配触发**：`syncCronFromDB` 内 cron 回调改为**串行触发两模式**（避免并发 job 抢运行锁）；恋人按周五下午周期，朋友同周期：

```ts
await this.matchingService.triggerMatchJob('scheduler', 'romantic');
await this.matchingService.triggerMatchJob('scheduler', 'friend');
```

> **不自动续**（B 规则）：上一轮未匹配 / 已过期的用户，UMS 已回 `idle`，**不会自动再进池**；只有用户主动 `startMatch` 后下一轮才参与。cron 只处理当前 `searching` 的用户。

**(2) 48h 通用过期清理（核心新增）**：原 `handleProposalExpiry`（10 分钟 Interval）升级为 `expireUnconfirmedMatches`——**对恋人 + 朋友的临时对话统一生效**（D 规则）：

```ts
@Interval(10 * 60 * 1000)
async handleConfirmExpiry() {
  await this.matchingService.expireUnconfirmedMatches();
}

// matching.service.ts
async expireUnconfirmedMatches() {
  const cutoff = new Date(Date.now() - CONFIRM_WINDOW_MS); // now - 48h
  // 临时对话（未双确）超 48h → EXPIRED
  const stale = await this.prisma.match.findMany({
    where: {
      status: { in: ['MATCHED_ROMANTIC','ROMANTIC_CONFIRMING','MATCHED_FRIEND','FRIEND_CONFIRMING'] },
      createdAt: { lte: cutoff },
    },
    select: { id: true, mode: true, userAId: true, userBId: true },
  });
  for (const m of stale) {
    await this.prisma.$transaction(async (tx) => {
      // 1. 置 EXPIRED（对话从 Chat 列表隐藏：sessions/chattable 查询不含 EXPIRED）
      await tx.match.update({ where: { id: m.id }, data: { status: 'EXPIRED' } });
      // 2. 双方各发一条「未确认已过期」通知（type='match_expired'，metadata.mode）
      await tx.notification.createMany({ data: [
        { userId: m.userAId, type: 'match_expired', title: '匹配已过期',
          body: '48 小时内未双方确认，该匹配已过期。', metadata: { mode: m.mode } },
        { userId: m.userBId, type: 'match_expired', title: '匹配已过期',
          body: '48 小时内未双方确认，该匹配已过期。', metadata: { mode: m.mode } },
      ]});
      // 3. UMS 回收：
      //    - 恋人：双方 mode='romantic' UMS 若处于 matched/confirming → idle
      //    - 朋友：双方 mode='friend' UMS 若再无任何活跃朋友对话 → idle，否则保持
      const modeStr = m.mode === 'FRIEND' ? 'friend' : 'romantic';
      await this.recomputeModeStateAfterExpire(tx, [m.userAId, m.userBId], modeStr);
    });
  }
}
```

> 计时锚点为 `Match.createdAt`（匹配产出时刻）；过期是**对话消失 + 双方通知**（B/C/D 规则），双方互相从 Chat 列表看不到。

**(3) `recomputeModeStateAfterExpire`（UMS 回收判定，恋人 / 朋友分支伪代码）**：过期事务内统一调用，按 mode 决定 UMS 是否回 `idle`。**恋人**：单对象语义，过期后该用户该模式无任何活跃对话，直接回 `idle`（除非已是 `relationship`——但 `relationship` 的恋人不会有临时对话过期，理论不命中）。**朋友**：多对象语义，须**扫描该用户是否仍有任何活跃朋友 Match**——只要还有任一**临时对话（temp）或永久朋友（confirmed）**，UMS 保持 `relationship`（有已确认朋友）或 `matched`（仅剩临时对话）；**全部清空才回 `idle`**。

```ts
import { TEMP_STATUSES, CONFIRMED_STATUSES } from './mode.util';
// FRIEND 的临时集 / 永久集（mode.util 已含全模式集合，这里取朋友子集）
const FRIEND_TEMP      = ['MATCHED_FRIEND','FRIEND_CONFIRMING'];   // ⊂ TEMP_STATUSES
const FRIEND_CONFIRMED = ['FRIEND_CONFIRMED'];                     // ⊂ CONFIRMED_STATUSES

private async recomputeModeStateAfterExpire(tx, userIds: string[], mode: ModeStr) {
  for (const userId of userIds) {
    if (mode === 'romantic') {
      // 恋人：过期后若 UMS 处于 matched/confirming（非 relationship）→ idle
      await tx.userModeState.updateMany({
        where: { userId, mode: 'romantic', matchState: { in: ['matched','confirming'] } },
        data: { matchState: 'idle', matchSearchingSince: null },
      });
      continue;
    }
    // 朋友：扫描是否仍有任何活跃朋友会话（临时 + 永久），决定 idle / matched / relationship
    const confirmedCount = await tx.match.count({
      where: { mode: 'FRIEND', dissolvedAt: null, status: { in: FRIEND_CONFIRMED },
        OR: [{ userAId: userId }, { userBId: userId }] },
    });
    const tempCount = await tx.match.count({
      where: { mode: 'FRIEND', dissolvedAt: null, status: { in: FRIEND_TEMP },
        OR: [{ userAId: userId }, { userBId: userId }] },
    });
    // 判定：有已确认朋友 → relationship；否则仅剩临时对话 → matched；全空 → idle
    const next = confirmedCount > 0 ? 'relationship' : (tempCount > 0 ? 'matched' : 'idle');
    await tx.userModeState.updateMany({
      where: { userId, mode: 'friend', matchState: { notIn: ['searching'] } }, // searching 态不被过期事务降级
      data: { matchState: next, ...(next === 'idle' ? { matchSearchingSince: null } : {}) },
    });
  }
}
```

> 朋友判定要点（C 规则）：① **永久朋友优先**——只要 `FRIEND_CONFIRMED` 计数 > 0，无论临时对话是否过期，UMS 保持 `relationship`（朋友可与多人并存）；② 仅当**既无永久朋友、又无任何临时对话**时才回 `idle`（该用户该模式彻底空闲，需主动重进池）；③ `searching` 态不被本事务触碰（用户可能刚重新进池等下一轮，由 `notIn:['searching']` 守卫）；④ 同样的 recompute 逻辑应在 `dissolveMatch`（§3.4 步骤 5 朋友分支）复用，保证「解除最后一个朋友 / 临时对话」后 UMS 正确回 `idle`。
> 兼容：历史 `PENDING_CONFIRM` 仍由 §3.6 的 `expireStaleProposals` 单独清理（不影响新机制）。

> **增强配对 48h 退款（设计决策点，详见 §10.3）**：当一条 `EXPIRED` 的 Match 是**增强发起**（`enhancedMode` 非空）时，是否退还预扣的 `enhancedUserEnergy`？
> - **§1.5 J 规则（最高权威）只规定「空池退还」**：增强一旦成功配上对象（即便最后未确认），能量视为已消费，**默认不退**——增强保证的是「配到」，不保证「对方确认」。
> - 深化设计 JSON 另给了「48h 未确认退还」选项（更宽松）。本文档**默认采纳 §1.5 口径（仅空池退）**；若产品决定放宽到「48h 未双确也退」，在本处的 `EXPIRED` 事务内对 `enhancedMode != null` 的 Match 追加一笔 `REFUND`（金额 = `enhancedUserEnergy`）即可，开关见 §10.3。

### 3.6 算法差异（ScoringMatchModelProvider + interface）

`match-model.interface.ts`：`MatchConstraints` 加 `mode: 'romantic'|'friend'`，`maxMatchesPerUser`（恋人=1 / 朋友=5）；`CandidateProfile` 加可选 `activities?: string[]`。

| 维度 | 恋人 romantic | 朋友 friend |
|---|---|---|
| 候选池 | UMS `mode='romantic', matchState='searching'` | `mode='friend', matchState='searching'` |
| 评分问卷 | `QuestionnaireType.ROMANTIC` active 版本答案 | `QuestionnaireType.FRIEND` active 版本答案 |
| 分类权重 | 生活习惯15/价值观20/恋爱观25/沟通20/财务观20 | social15/interest25/personality20/values20/lifestage20（见 §5.3） |
| 硬约束 | 性别双向、同城/同校（启用）、年龄、学段 | 软约束为主：兴趣交集；性别默认不限（除非用户显式设 preferredGender） |
| 一人本轮产出 | `maxMatchesPerUser=1`（greedy 已实现） | `maxMatchesPerUser=5`：每人取 Top-N（N≤5）候选全部成对（C 规则） |
| 产出后流程 | 临时对话 → 48h 内双确 → 永久（§3.1） | **同恋人**：临时对话 → 48h 内双确 → 永久（§3.2） |
| 拉黑过滤 | 剔除任一方拉黑对方的对（E 规则） | 同左（跨模式同名单） |
| 增强（J 规则 §10.3） | 增强用户**无视 75 分阈值**强配最高分 1 个；空池退 3 格 | 增强用户**无视阈值**强配 Top-N（N=`friendEnhancedCells`，1–5）；空池退 N 格 |

**增强两阶段配对（J 规则 6/7，落地于 `generateMatches`）**：`generateMatches` 先按 `CandidateProfile.enhanced` 把候选分成「增强池 / 普通池」，分两阶段：
- **阶段一（增强强配，无视阈值）**：遍历增强用户，从全部尚未被占用的候选中选分数最高者（恋人取 1 个；朋友取 Top-N，N=`enhancedCost=friendEnhancedCells`），**即使分数 < 75 也强配**。每配一对写 `pair.enhanced=true / pair.enhancedCost=cost`。若该增强用户**所在池没有任何其它可配对象（空池）**，记入 `emptyPoolUserIds.push({ userId, mode, cost })`（→ §3.4 executeMatchJob 退款）。
- **阶段二（普通贪心，threshold=75）**：剩余普通用户走现有 `greedyMatch`（恋人）/`multiMatch`（朋友），保持 75 分阈值不变，产出 `pair.enhanced=false`。
- **混合约束**：增强用户与普通用户配对时，**增强一方可强配**，但**普通一方的硬约束（性别偏好、年龄范围等）仍生效**——不会把不满足普通方硬性偏好的对象塞给普通方。
- `MatchResult` 新增字段：`pairs[].enhanced` / `pairs[].enhancedCost` / 顶层 `emptyPoolUserIds: Array<{userId, mode, cost}>`。`MatchConstraints` / `CandidateProfile` 字段扩展见 §10.3。

**朋友 greedy 改造**：现有 `greedyMatch` 一人只配一对。朋友模式新增 `multiMatch(candidates, threshold, topN=5)`：对每个 user 取其有效配对中分数最高的 **Top-N（N≤5）**（去重无向对），不设 `matched` 独占。`generateMatches` 按 `constraints.mode` 选 `greedyMatch`（恋人，maxMatchesPerUser=1）或 `multiMatch`（朋友，maxMatchesPerUser=5）。

**朋友评分**：复用 `calcQuestionnaireScore` 框架，但 `CATEGORY_WEIGHTS` 按 mode 切换两套常量表（key 用题目 group：`社交风格/兴趣活动/人格节奏/价值观/生活规划`）；硬约束里性别/同城等**默认不启用**，仅当 `_prefs.preferredGender` 等显式设置才生效。

**两套过期清理并存**：
- 新机制 `expireUnconfirmedMatches`（§3.5）：处理新状态 `MATCHED_ROMANTIC/ROMANTIC_CONFIRMING/MATCHED_FRIEND/FRIEND_CONFIRMING` 超 48h → `EXPIRED`（对话消失 + 双方通知）。这是 B/C/D 规则的落地。
- 旧兼容 `expireStaleProposals`：`where: { status: 'PENDING_CONFIRM', createdAt: { lte: cutoff } }` 保持（只清历史脏数据），不触碰新状态。

---

## 4. Chat 主视图（会话列表 + 临时/永久对话）

> **A 规则定位**：Chat 升级为**主页顶部三切换之一**（Chat / 恋人匹配 / 朋友匹配），不再是匹配页的子视图。Chat = **所有对话的统一入口**：
> - **永久对话（confirmed）**：已确认的恋人（`RELATIONSHIP_ROMANTIC`）+ 多个已确认朋友（`FRIEND_CONFIRMED`）。
> - **临时对话（temp）**：未双确的恋人 / 朋友候选（`MATCHED_*` / `*_CONFIRMING`），列表项带「**剩余 Xh 倒计时**」标记 + 「**确认成为恋人 / 朋友**」入口；48h 未双确自动从列表消失（`EXPIRED`，D 规则）。
> - 「确认成为恋人 / 朋友」按钮**在 Chat 对话框界面内**点（不是匹配界面，D 规则）。
> 前端落地见 §6.2（主页顶部三切换）、§6.6（Chat 列表与对话内确认按钮）。

### 4.1 权限放开（chat.service.ts:13-27）

```ts
private async verifyMatchAccess(matchId: string, userId: string) {
  const match = await this.prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, status: true, mode: true, userAId: true, userBId: true },
  });
  if (!match) throw new NotFoundException('匹配不存在');
  if (match.userAId !== userId && match.userBId !== userId)
    throw new ForbiddenException('你不属于该匹配');
  // 临时对话（可聊、带倒计时）+ 永久对话（已确认）均可聊
  const chattable = [
    // 临时（temp）
    'MATCHED_ROMANTIC','ROMANTIC_CONFIRMING','MATCHED_FRIEND','FRIEND_CONFIRMING',
    // 永久（confirmed）
    'RELATIONSHIP_ROMANTIC','FRIEND_CONFIRMED','RELATIONSHIP_MODE'/*兼容*/,
  ];
  const readOnly  = ['DISSOLVED','EXPIRED'];  // 只读历史，禁写（EXPIRED 还会从列表隐藏）
  if (![...chattable, ...readOnly].includes(match.status))
    throw new ForbiddenException('该匹配当前不可聊天');
  return match;
}
```

`sendMessage`（chat.service.ts:88）把 `if (match.status === 'DISSOLVED')` 扩为 `if (['DISSOLVED','REJECTED','EXPIRED'].includes(match.status))` 禁写（保留只读历史）。

### 4.2 新增会话列表接口（含 status / mode / remainingMs）

`GET /chat/sessions?mode=romantic|friend|all&limit=50` →

> 每个 session 必含：`mode`（romantic/friend）、`status`（原始 MatchStatus）、`sessionType`（**temp / confirmed**，前端据此分组与展示倒计时）、`remainingMs`（**临时对话剩余毫秒**，永久对话为 `null`）。这是 D 规则在接口层的落地。

```jsonc
{
  "data": {
    "sessions": [
      {
        "matchId": "ckxyz...",
        "mode": "romantic",
        "status": "MATCHED_ROMANTIC",
        "sessionType": "temp",            // temp（未确认，带倒计时）| confirmed（已确认，永久）
        "remainingMs": 151200000,         // 临时对话剩余时间（ms）；confirmed 为 null
        "myConfirmed": false,
        "partnerConfirmed": false,
        "partner": { "id": "ck...", "nickname": "小明", "avatarUrl": "https://...",
                     "school": "复旦大学", "gender": "male", "age": 21 },
        "lastMessage": { "id": "cm...", "content": "在吗", "imageUrl": null,
                         "senderId": "ck...", "isRead": false, "createdAt": "2026-06-13T09:30:00.000Z" },
        "unreadCount": 3,
        "updatedAt": "2026-06-13T09:30:00.000Z"
      },
      {
        "matchId": "ckabc...",
        "mode": "friend",
        "status": "FRIEND_CONFIRMED",
        "sessionType": "confirmed",
        "remainingMs": null,
        "myConfirmed": true,
        "partnerConfirmed": true,
        "partner": { "id": "ck...", "nickname": "阿康", "avatarUrl": "https://...",
                     "school": "复旦大学", "gender": "male", "age": 22 },
        "lastMessage": { "id": "cm...", "content": "周末爬山？", "imageUrl": null,
                         "senderId": "ck...", "isRead": true, "createdAt": "2026-06-14T18:00:00.000Z" },
        "unreadCount": 0,
        "updatedAt": "2026-06-14T18:00:00.000Z"
      }
    ],
    "total": 5
  }
}
```

`ChatService.getConversationSessions(userId, mode: 'romantic'|'friend'|'all' = 'all', limit = 50)` 伪代码：

```ts
import { TEMP_STATUSES, CONFIRMED_STATUSES, CONFIRM_WINDOW_MS, isTempStatus } from '../matching/mode.util';
// 临时（temp）+ 永久（confirmed）一并返回；EXPIRED/DISSOLVED/REJECTED 不进列表（对话消失）
const statuses = [...TEMP_STATUSES, ...CONFIRMED_STATUSES];
const where: any = { status: { in: statuses }, dissolvedAt: null,
  OR: [{ userAId: userId }, { userBId: userId }] };
if (mode !== 'all') where.mode = toMatchMode(mode);
const matches = await this.prisma.match.findMany({
  where, orderBy: { updatedAt: 'desc' }, take: limit,
  include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
});
// 批量取 partner profile + unreadCount，避免 N+1
const partnerIds = matches.map(m => m.userAId === userId ? m.userBId : m.userAId);
const profiles = await this.prisma.profile.findMany({
  where: { userId: { in: partnerIds } },
  select: { userId: true, nickname: true, avatarUrl: true, school: true, gender: true, age: true } });
const profMap = new Map(profiles.map(p => [p.userId, p]));
const unread = await this.prisma.message.groupBy({
  by: ['matchId'],
  where: { matchId: { in: matches.map(m => m.id) }, senderId: { not: userId }, isRead: false },
  _count: { _all: true } });
const unreadMap = new Map(unread.map(u => [u.matchId, u._count._all]));
const sessions = matches.map(m => {
  const isA = m.userAId === userId, pid = isA ? m.userBId : m.userAId;
  const temp = isTempStatus(m.status);
  return { matchId: m.id, mode: m.mode.toLowerCase(), status: m.status,
    sessionType: temp ? 'temp' : 'confirmed',
    remainingMs: temp ? Math.max(0, m.createdAt.getTime() + CONFIRM_WINDOW_MS - Date.now()) : null,
    myConfirmed: isA ? m.userAConfirmed : m.userBConfirmed,
    partnerConfirmed: isA ? m.userBConfirmed : m.userAConfirmed,
    partner: { id: pid, ...(profMap.get(pid) ?? {}) },
    lastMessage: m.messages[0] ?? null,
    unreadCount: unreadMap.get(m.id) ?? 0,
    updatedAt: m.updatedAt };
});
return { sessions, total: sessions.length };
```

> 注：临时对话即便已超 48h，若 scheduler 尚未跑到，`remainingMs` 会为 0；前端对 `remainingMs<=0` 的临时会话应做「即将过期/已过期」灰显并下次刷新隐藏。最终一致由 `expireUnconfirmedMatches`（§3.5）保证 → 置 `EXPIRED` 后从列表消失。

> 注：`updatedAt` 排序要求发消息时 touch match.updatedAt（在 `sendMessage` 末尾加 `match.update({ where:{id:matchId}, data:{ updatedAt:new Date() } })`），否则用 `lastMessage.createdAt` 在应用层排序。

### 4.3 chat.controller.ts 新增

```ts
@Get('sessions')
@ApiOperation({ summary: '会话列表（恋人候选 + 多个朋友）' })
async getSessions(
  @CurrentUser('id') userId: string,
  @Query('mode') mode = 'all',
  @Query('limit') limit?: string,
) {
  return this.chatService.getConversationSessions(userId, mode as any, limit ? +limit : 50);
}
```

### 4.4 已读 & 复用

`Message.isRead` 不改；进会话拉消息时已自动标记（chat.service.ts:58-67 / pollMessages:159-167）。`GET/POST /chat/:matchId/messages`、`/poll`、`/read`、`/unread` 全部复用，仅权限放开。

---

## 5. 双问卷系统

### 5.1 两类问卷模型

`QuestionnaireType.ROMANTIC`（现有 V2）与 `FRIEND`（新）各自独立版本线，各一个 active（partial unique）。

**G 规则（选填，不强制）**：注册登录后，向用户展示**两张卡片（恋人问卷 / 朋友问卷）供选择填写**——可都填、可只填一个、可都不填，均不强制。**不填对应问卷则不能进对应模式匹配**：用户点「恋人匹配 / 朋友匹配」进入匹配时，若该 type 的 active 版本未答完，前端引导去填、后端 `startMatchForUser` 兜底拦截（§3.4）。`getCompletion` 用于判断两类问卷的完成度（§5.2）。

### 5.2 问卷 service / controller 改造

`questionnaire.service.ts`：

```ts
async getActiveQuestionnaire(type: QuestionnaireType = 'ROMANTIC') {
  const v = await this.prisma.questionnaireVersion.findFirst({
    where: { isActive: true, type },
    include: { questions: { where: { isEnabled: true }, orderBy: { order: 'asc' },
               include: { options: { orderBy: { order: 'asc' } } } } } });
  if (!v) throw new NotFoundException('暂无可用问卷');
  return v;
}
async listVersions(type?: QuestionnaireType) {
  return this.prisma.questionnaireVersion.findMany({
    where: type ? { type } : {}, orderBy: { version: 'desc' },
    include: { _count: { select: { questions: true, answers: true } } } });
}
async createVersion(dto) {  // dto 加必填 type
  // ...nextVersion 仍全局自增；data 写 type: dto.type
}
async publishVersion(id: string) {  // type-scoped 下线
  const v = await this.getVersion(id);
  await this.prisma.questionnaireVersion.updateMany({
    where: { isActive: true, type: v.type }, data: { isActive: false } });
  return this.prisma.questionnaireVersion.update({
    where: { id }, data: { isActive: true, publishedAt: new Date() } });
}
async getCompletion(userId: string) {
  const out: any = {};
  for (const type of ['ROMANTIC','FRIEND'] as const) {
    const v = await this.prisma.questionnaireVersion.findFirst({
      where: { isActive: true, type },
      include: { questions: { where: { isEnabled: true, isRequired: true }, select: { id: true } } } });
    if (!v) { out[type.toLowerCase()] = { completed: false }; continue; }
    const answered = await this.prisma.answer.count({
      where: { userId, questionnaireVersionId: v.id, questionId: { in: v.questions.map(q => q.id) } } });
    out[type.toLowerCase()] = { completed: answered >= v.questions.length, versionId: v.id };
  }
  return out;  // { romantic: {completed,versionId}, friend: {completed} }
}
```

`questionnaire.controller.ts`：

```ts
@Get('active')   // ?type=romantic|friend（默认 romantic）
getActive(@Query('type') type = 'romantic') { return this.svc.getActiveQuestionnaire(toQType(type)); }
@Get('completion')
getCompletion(@CurrentUser('id') id: string) { return this.svc.getCompletion(id); }
```

`admin-questionnaire.controller.ts`：`GET versions` 加 `@Query('type')` 透传；`CreateQuestionnaireVersionDto` 加 `@IsEnum(QuestionnaireType) type`。

`answers.service.ts`：`submitAnswers` 与 `getMyAnswers` 已按 `questionnaireVersionId` 工作，**无需改**（type 隐含）；可选新增 `getMyAnswers(userId, type)` 用 `questionnaireVersion: { type }` 过滤。

### 5.3 朋友问卷题目（FRIEND，25 题）

> 全为 SCALE（1=完全不同意…5=完全同意），与恋人问卷一致，便于复用前端渲染与 `calcQuestionnaireScore`。group 即评分分类。

**社交风格 social（权重 15%，order 1-5）**

| order | 题干 |
|---|---|
| 1 | 我更享受和少数几个挚友深交，而不是认识很多泛泛之交 |
| 2 | 朋友间发生分歧时，我倾向于直接说出来而不是憋在心里 |
| 3 | 我希望朋友能长期稳定地保持联系，而不是聚一阵就淡了 |
| 4 | 我乐于主动张罗聚会、组织大家一起出去玩 |
| 5 | 即使很久没联系，我也认为真正的朋友重逢时依然能无话不谈 |

**兴趣活动 interest（权重 25%，order 6-10）**

| order | 题干 |
|---|---|
| 6 | 我希望和朋友有比较一致的兴趣爱好，这样相处更有话题 |
| 7 | 我喜欢和朋友一起进行户外/运动类活动（爬山、球类、骑行等） |
| 8 | 我喜欢和朋友一起钻研某项技能或爱好（游戏、乐器、编程、摄影等） |
| 9 | 我愿意经常和朋友相约线下见面，而不只是线上聊天 |
| 10 | 我喜欢和朋友一起探索新事物（新店、新展览、新活动），而非总去老地方 |

**人格节奏 personality（权重 20%，order 11-15）**

| order | 题干 |
|---|---|
| 11 | 我的生活节奏偏快，喜欢把日程排得比较满 |
| 12 | 在群体里我通常是比较外向、主动带动气氛的那一个 |
| 13 | 我很看重朋友的靠谱程度：答应的事一定会做到 |
| 14 | 朋友临时改变计划或迟到时，我能比较从容地接受 |
| 15 | 我喜欢和情绪稳定、不容易内耗的人做朋友 |

**价值观 values（权重 20%，order 16-20）**

| order | 题干 |
|---|---|
| 16 | 我更看重和朋友三观一致，胜过单纯玩得来 |
| 17 | 当人情和原则冲突时，我倾向于坚持原则 |
| 18 | 我无法接受朋友在背后议论或评判我 |
| 19 | 我认为朋友之间应当坦诚，不喜欢拐弯抹角或留心眼 |
| 20 | 我愿意在朋友需要时认真倾听并提供实际帮助，而不只是说漂亮话 |

**生活规划 lifestage（权重 20%，order 21-25）**

| order | 题干 |
|---|---|
| 21 | 我目前正处于学业/事业的关键冲刺阶段，时间比较紧张 |
| 22 | 我未来几年会长期待在同一座城市，不太会频繁搬迁 |
| 23 | 我希望朋友和我处在相近的人生阶段，更容易互相理解 |
| 24 | 未来三年我会把主要精力投入在自我提升上（考研/考证/技能） |
| 25 | 我愿意结识不同专业/不同背景的朋友来拓展视野 |

### 5.4 朋友偏好字段语义

`UserMatchPreferences`（mode='friend'）：`preferredInterests`（多选标签，与 Profile.interests 取交集驱动软评分）、`preferredActivities`（活动类型多选，如 `运动/学习/游戏/美食/旅行`）、`friendRequirements`（自由文本，暂仅存储，不参与评分）。性别/同城等沿用同字段但**默认空=不限**。

### 5.5 seed 草稿（friend 问卷）

`apps/api/prisma/seed.ts` 顶部加 `FRIEND_QUESTIONS` 常量（25 题，group/order/title 如 §5.3），创建块：

```ts
const existingFriend = await prisma.questionnaireVersion.findFirst({ where: { type: 'FRIEND', isActive: true } });
if (!existingFriend) {
  const latest = await prisma.questionnaireVersion.findFirst({ orderBy: { version: 'desc' } });
  await prisma.questionnaireVersion.create({
    data: {
      version: (latest?.version ?? 0) + 1,
      type: 'FRIEND',
      title: '校园朋友匹配问卷 V1',
      description: '以下25道题帮助我们了解你的社交风格与兴趣，找到合拍的朋友。1=完全不同意，5=完全同意。',
      isActive: true, publishedAt: new Date(),
      questions: { create: FRIEND_QUESTIONS.map(q => ({
        type: QuestionType.SCALE, title: q.title, isRequired: true,
        isEnabled: true, order: q.order, group: q.group })) },
    },
  });
}
```

### 5.6 朋友评分权重表（provider 常量）

```ts
const FRIEND_CATEGORY_WEIGHTS: Record<string, number> = {
  '社交风格': 0.15, '兴趣活动': 0.25, '人格节奏': 0.20, '价值观': 0.20, '生活规划': 0.20,
};
```

`calcQuestionnaireScore` 与 `inferGroupByOrder` 接受 `mode` 参数选用对应权重表与 order→group 映射（朋友 order 1-5→社交风格、6-10→兴趣活动、11-15→人格节奏、16-20→价值观、21-25→生活规划）。

---

## 6. 前端 UX（apps/h5）— 函数 / DOM 级清单

> **导航总览（A/H 规则）**：底部导航固定 **3 tab：主页（home）/ 广场（square）/ 我的（profile）**（**无排行榜**）。主页内部用**顶部三切换** `Chat / 恋人匹配 / 朋友匹配` 切换三个一级视图：
> - **Chat** = 所有对话（永久 + 临时，§6.6）。
> - **恋人匹配** = 恋人模式匹配界面（§6.2/6.5）。
> - **朋友匹配** = 朋友模式匹配界面（§6.5）。
>
> 对话**不再**出现在匹配界面里——匹配界面只负责「进池/出结果/进入对话」，对话统一在 Chat。

### 6.1 状态结构（state.js）

新增/改字段：

```js
// 主页顶部一级视图：'chat' | 'romantic' | 'friend'（A 规则三切换）
S.homeView = 'chat';                       // 默认进 Chat（所有对话）
S.activeMatchMode = 'romantic';            // 'romantic' | 'friend'（当前匹配模式视图）
S.matchStatus = {                          // 按 mode 分桶
  romantic: null,  // { state, match, partner, nextRunAt, matchConfig }
  friend:   null,  // { state, matches:[...], nextRunAt }
};
S.sessions = [];                           // Chat 会话列表缓存（含 temp/confirmed）
S.romanticAnswers = {};                    // 问卷答案分桶（替代单一 S.answers）
S.friendAnswers   = {};
S.questionnaireMode = 'romantic';          // 当前填写的问卷模式
S.friendPrefInterests = [];                // 朋友偏好多选缓存
S.friendPrefActivities = [];

// 增强模式（J 规则 §10.5）
S.energy = { totalEnergy: 0, usedEnergy: 0, availableEnergy: 0 }; // /energy/balance 缓存
S.enhanced = {                             // match setting 内增强开关（按 mode 分桶，回填自 UMP）
  romantic: { enabled: false, cost: 3 },
  friend:   { enabled: false, cells: 1 },  // cells=1–5，cost 同 cells
};
S.energyPackages = [                        // 充值方案（前端常量或从 /energy/packages 拉）
  { id: 'pkg_30',  cells: 30,  price: '¥30' },
  { id: 'pkg_60',  cells: 60,  price: '¥58' },
  { id: 'pkg_100', cells: 100, price: '¥88' },
];
```

### 6.2 主页顶部三切换 + 匹配界面（index.html `#tab-match`/主页区 + match.js）

> **DOM（导航重构）**：
> - **底部导航**（index.html `#bottom-nav` 约 L753-768）：维持 3 个按钮，语义对齐为 **主页（home）/ 广场（square）/ 我的（profile）**；保持当前已无排行榜入口的状态（H 规则的底部部分本就满足，确认不要回退新增）。第一个 tab 的 `switchTab('match')` 即「进入主页」，进入后默认 `homeView='chat'`。
> - **主页顶部三切换**：在主页内容区顶部插入分段切换 `[💬 Chat | ❤️ 恋人匹配 | 👥 朋友匹配]`，选中态荧光绿 `#CCFF00`。点击分别 `switchHomeView('chat'|'romantic'|'friend')`。
>
> **新增/改造函数**（match.js）：
> - `switchHomeView(view)`：设 `S.homeView`；`'chat'` → `loadSessions()`（§6.6）；`'romantic'/'friend'` → `S.activeMatchMode=view` 后 `loadMatchTab()`（进模式前先查问卷完成度，见 §6.3）。
> - `loadMatchTab()`：`api('/matching/status?mode='+S.activeMatchMode)`，结果存 `S.matchStatus[S.activeMatchMode]`。
> - `renderMatchTab(data)`（匹配界面，**不含对话列表**）：
>   - **恋人分支**：
>     - `matched/confirming`：显示「进入对话」（跳 Chat 对应会话）+ 文案提示「48h 内双方确认才成立」；**确认按钮不在这里**，在 Chat 对话框内（D 规则）。
>     - `relationship`（B 规则：已确认恋人，恋人匹配停止）：匹配界面改为显示「**打开和恋人的对话**」入口（跳 Chat 该会话）+ 「解除关系」入口，**不再展示「开始匹配」**。
>     - `searching/no_match/idle`：进池/等待/重新进池按钮（过期或失败后须用户主动点「重新匹配」，B 规则——不自动续）。
>   - **朋友分支**：见 §6.5（最多 5 张候选卡，进对话入口）。
>   - **进池按钮（增强透传，J 规则 §10.5）**：点「开始匹配 / 重新匹配」调 `POST /matching/start?mode=...`，body 带 `{ enhanced: S.enhanced[mode].enabled, friendCells: S.enhanced.friend.cells }`（恋人忽略 cells，固定 3）。开增强前若 `availableEnergy<cost` 引导充值（§10.5）。
> - `startMatchPolling()`：URL 带 mode；恋人终态判定 `relationship`，朋友常驻轮询（可继续追加候选）。

### 6.3 注册后问卷两张卡片（选填）+ 进模式引导（questionnaire.js + index.html）

- **注册登录后两张卡片（G 规则）**：在注册完成 / 首次进入主页时，展示**两张卡片：恋人问卷 / 朋友问卷**，各带「去填写」「稍后」。**可都填、可只填一个、可都不填**，均不强制。卡片状态用 `GET /questionnaire/completion` 渲染（已填打勾）。
- **进模式引导（不填则不能进对应模式匹配）**：点「恋人匹配 / 朋友匹配」时，若该 mode `completed=false` → 弹卡/跳 `page-questionnaire` 并 `loadQuestionnaire(mode)`；已填则直接进匹配界面。
- `loadQuestionnaire(mode='romantic')`：`api('/questionnaire/active?type='+mode)`；答案桶用 `mode==='friend'?S.friendAnswers:S.romanticAnswers`；顶部加 `❤️ Romantic / 👥 Friend` 标识（写 `#q-mode-badge`）。
- `submitAnswers()`：`questionnaireVersionId: S.questionnaire.id`（已隐含 type），提交后回主页并 `switchHomeView(S.questionnaireMode)`。
- `S.answers` 全局引用改为按 `S.questionnaireMode` 指向对应桶（renderQuestion / answerXxx 统一走 `currentAnswers()` 取桶）。

### 6.4 偏好分离 + 增强开关（index.html `filter-overlay` 约 L773-868 + match.js）

- **DOM**：`filter-overlay` 顶部加 `❤️ Romantic / 👥 Friend` 选项卡；friend 区新增：兴趣多选 chips（`#friend-interests`）、活动多选 chips（`#friend-activities`）、自由文本 `#friend-requirements`；romantic 区保持现状（性别/年龄/阶段/同校/同城）。
- **改造**：`openFilterSheet(mode=S.activeMatchMode)` → `api('/matching/preferences?mode='+mode)` 回填对应区（含 `enhancedModeEnabled`/`friendEnhancedCells`）；`saveFilterPrefs(mode)` → `PUT /matching/preferences?mode='+mode`，body 按 mode 取字段（romantic 现有字段 / friend 发 `preferredInterests/preferredActivities/friendRequirements/preferredGender`）+ 增强字段。
- match.js 新增 `toggleFriendInterest(v)`/`toggleFriendActivity(v)`/`updateFriendPrefUI()`（仿现有 `toggleStage`/`updateStageUI`）。

**增强开关（J 规则 §10.5）**：在 `filter-overlay`（即 match setting）每个模式区底部加「✨ 增强模式」一项（恋人/朋友各自独立）：
- **恋人区**：checkbox「使用增强模式（消耗 3 格能量）」→ `S.enhanced.romantic.enabled`，固定 cost=3。
- **朋友区**：checkbox「启用朋友增强保底」+ 滑块 `min=1 max=5`（`#friend-cells-slider`），文案「GUARANTEE: N friends / Cost: N energy cells」→ `S.enhanced.friend.{enabled,cells}`。
- 开关只是**意向暂存**；真正的预扣发生在用户点「开始匹配」调 `startMatch` 时（§6.2 `loadMatchTab`/进池按钮把 `enhanced/cells` 透传给 `POST /matching/start`）。
- 勾选前先校验能量：`S.energy.availableEnergy < cost` 时禁用「开始匹配」并提示「能量不足，去充值」（跳购买页 `openEnergyModal()`，§10.5）。
- match.js 新增 `toggleEnhance(mode)`/`updateFriendCells(v)`/`updateEnhanceUI(mode)`；`saveFilterPrefs` 一并 `PUT` `enhancedModeEnabled`（朋友另带 `friendEnhancedCells`）持久化到 UMP。

### 6.5 朋友匹配界面（match.js renderMatchTab friend 分支，最多 5 张候选）

- `state==='searching'`：复用 searching 骨架 + 倒计时（下一轮出结果）。
- `state==='no_match'`：复用 no_match 卡，附「重新匹配」（须用户主动点，B/不自动续同理）。
- `state==='matched'`：渲染**多卡片网格（最多 5 张，C 规则）**。数据来自 `S.matchStatus.friend.matches[]`，每卡：头像 + 昵称 + 学校 + score +：
  - **临时候选**（`status∈{MATCHED_FRIEND,FRIEND_CONFIRMING}`）：显示「**剩余 Xh**」倒计时（由 `remainingMs` 渲染）+ 「**进入对话**」按钮（跳 Chat 该会话；**确认按钮在 Chat 对话内**，不在此处，D 规则）。
  - **已确认朋友**（`status==='FRIEND_CONFIRMED'`）：显示「已是朋友」标记 + 「进入对话」。
- 注：朋友匹配界面只是入口；真正的多人 1v1 对话全部在 Chat（§6.6）。

### 6.6 Chat 主视图（chat.js 列表层 + 对话内确认/解除）

> A/D 规则：Chat 是主页一级视图，列出**全部对话**（永久 + 临时），临时对话带倒计时与确认入口。

- **`loadSessions()`**：`api('/chat/sessions?mode=all')` → `S.sessions` → `renderSessions()`（在 `switchHomeView('chat')` 时调用；恋人/朋友确认或过期后也刷新）。
- **`renderSessions()`**：建议**分两组渲染**——
  - **临时对话（`sessionType==='temp'`）**：列表项 = 头像 + 昵称 + `lastMessage`（截断）+ **「剩余 Xh」倒计时徽标**（按 `remainingMs` 本地递减/着色，临近 0 变红）+ 未读红点 + mode 角标（❤️ 恋人候选 / 👥 朋友候选）。`remainingMs<=0` 灰显「即将消失」，下次刷新隐藏。
  - **永久对话（`sessionType==='confirmed'`）**：列表项 = 头像 + 昵称 + `lastMessage` + 未读红点 + mode 角标（❤️ 恋人 / 👥 朋友）。
  - 点击任一项 `openSession(session)`。
- **chat.js 改造**：`S.chatMatchId` 为「当前会话」沿用；`openSession(session)` = 用列表项数据填 `S.chatPartnerName/Id/Avatar/chatMatchId` + 记录 `S.chatSessionType/chatMode/chatMyConfirmed` 后走现有 `openChat()`；切会话 `stopChatPolling()`→重置→`loadChatHistory()`（防串台 chat.js:34-56 已有）。
- **对话框内「确认成为恋人 / 朋友」按钮（D 规则，恋人 + 朋友通用）**：
  - 当 `sessionType==='temp' && !myConfirmed` 时，chat-overlay 头部显示按钮：恋人模式文案「❤️ 确认成为恋人」、朋友模式「👥 确认成为朋友」。
  - `onclick="confirmRelationship('<matchId>')"` → `POST /matching/:matchId/confirm-relationship`（接口通用支持两模式，§3.4）；成功后 toast + 刷新会话列表与匹配状态。
  - 已确认（`myConfirmed && !partnerConfirmed`）时按钮替换为「等待对方确认…」禁用态；双方确认后徽标转「永久」。
  - 对话框头部另有「**删除关系**」入口（恋人/朋友通用）→ `POST /matching/:matchId/dissolve`（§6.7），二次确认后调用，成功后该会话从列表移除，对方收到通知（E 规则）。
- **能量退款通知（J 规则 §10.4）**：退款通知统一 type=`energy_refunded`，通过通知中心 / Chat 列表顶部下发；点击可跳购买页查看余额；退款到账后应刷新 `S.energy`（重拉 `/energy/balance`）。**前端需区分两类退款场景的文案，按 `metadata.refundReason` 渲染**：
  - **空池退还（默认必有，§3.6/§10.3）**：增强加入池后本轮池中无任何可配对象 → 退还。文案「本轮无可配对象，已退还 N 格能量」。**收到时机**：该模式 `executeMatchJob` 跑完（cron 触发后）即下发——与「本轮 no_match」同一时刻，用户**无对话产生**。
  - **48h 未确认退还（可选开关，仅当后端 `SystemConfig.energy.refundOnExpire=true` 时才会下发，§3.5/§10.3）**：增强**已配上**对象但 48h 内双方未确认 → `EXPIRED` 同时退还。文案「增强匹配 48h 未确认，已退还 N 格能量」。**收到时机**：与 `match_expired` 通知**同一时刻**（scheduler `expireUnconfirmedMatches` 置 `EXPIRED` 时），即配对发生 48h 后；该开关默认 `false`，**关闭时此类通知永不出现**（增强一旦配上即视为消费，§1.5 J 口径）。
  - **前端无需感知开关状态**：是否退、退多少完全由后端决定，前端只按收到的 `energy_refunded` 通知（含 `metadata.refundReason ∈ {empty_pool, unconfirmed_48h}`、`metadata.energy=N`、`metadata.mode`）渲染对应文案并刷新余额；不在前端硬编码 48h 退款逻辑。

### 6.7 confirm-relationship / dissolve 端点（matching.controller.ts）

```ts
@Post(':matchId/confirm-relationship')
@ApiOperation({ summary: '在 Chat 对话内确认（通用 romantic/friend，双方确认才转永久）' })
confirmRelationship(@CurrentUser('id') userId: string, @Param('matchId') matchId: string) {
  return this.matchingService.confirmRelationship(userId, matchId);  // 按 Match.mode 自动分流（§3.4）
}
@Post(':matchId/dissolve')   // 通用解除（恋人/朋友），替代旧无参 dissolve；发通知（E 规则）
dissolveMatch(@CurrentUser('id') userId, @Param('matchId') matchId, @Body() dto: DissolveDto) {
  return this.matchingService.dissolveMatch(userId, matchId, dto.reason);
}
```

> 旧 `/matching/confirm` `/reject` `/proposals/...` `/dissolve`（无参）保留作兼容（内部对历史 PENDING_CONFIRM 仍可用），新前端不再调用。`startMatch`/`stop`/`status`/`preferences` 都加 `?mode=`。
> 注：`/confirm-relationship` 端点名沿用，但语义已通用化（朋友也走它）；如需更语义化可加别名 `/confirm`，但内部同一 `confirmRelationship`。

### 6.8 删除排行榜 + Profile「Love Mode」入口（H 规则，前端）

> 现状（grounding）：底部导航本就只有 3 个按钮（无排行榜）；排行榜与 Love Mode 入口均在 **Profile 页内**（index.html）。本节明确删除这两个 Profile 入口与排行榜整块。

- **index.html（Profile 页）**：
  - 删除「Leaderboard」入口按钮（约 L715-722，`onclick="openLeaderboard()"`）。
  - 删除「Love Mode」入口按钮（约 L702-714，`onclick="openMilestones()"` 的 Love Mode 卡）。
  - 删除「Leaderboard Overlay」整块（约 L1383-1410，`#leaderboard-overlay` / `#leaderboard-content`）。
- **JS**：
  - `apps/h5/src/modules/leaderboard.js`：前端不再引用（从 `main.js` 入口移除该模块加载/导出；或保留文件但不挂载）。
  - `apps/h5/src/main.js`、`settings.js`、`styles/main.css`、`README.md`：清理 `openLeaderboard`/leaderboard 相关引用与样式（grep 命中：见任务核对清单）。
  - `milestone.js` 的「Love Mode」入口去除（如 milestone 其它用途保留则只去入口绑定）。
- **底部导航**：确认维持 主页/广场/我的 三项，**不要回退新增排行榜 tab**。
- **后端**：`leaderboard` 模块可保留代码（不删 service/controller），但前端不暴露；如需彻底下线可在路由层标注「已废弃，前端不调用」（见 §8.2）。

### 6.9 校园动画微调（可选，match.js renderCampusScene）

`renderCampusScene(mode)`：朋友模式点缀色 `#CCFF00`→蓝 `#4A90E2`，强化模式区分，保持简笔风格。

### 6.10 Profile 顶部能量格 + 充值购买页（J 规则 §10.5）

> 完整 HTML / JS 片段见 **§10.5**。本节列前端落地点与函数清单。

- **Profile 顶部能量条**（index.html「我的」页顶部，约 §6.8 删除入口之上）：插入 `#profile-energy-section`，一行展示 `ENERGY` 标签 + 动态格子 `#energy-display`（每格一个荧光绿小方块，最多渲染 10 格，超出显示 `+N`）+ 「Buy」按钮 → `openEnergyModal()`。
- **购买 overlay**（`#modal-energy-purchase`）：三档卡片（30/60/100 格，价格见 §10.4 packages）+ 支付方式按钮（WeChat Pay / Alipay / Stripe，本期 mock）。
- **profile.js 新增/改造**：
  - `loadEnergyBar()`：`api('/energy/balance')` → `S.energy` → 渲染格子；进 Profile / 充值成功 / 退款通知后调用。
  - `openEnergyModal()` / `closeEnergyModal()`：开关购买 overlay。
  - `selectEnergyPackage(pkgId)` → `POST /energy/purchase` 拿 `paymentIntent`（本期 mock 直接返回成功）。
  - `selectPaymentMethod(method)` → 唤起 SDK / 显示二维码（mock 占位）；支付完成回调 `POST /energy/purchase/confirm` → 刷新 `loadEnergyBar()` + toast。
  - （可选）`claimEnergy(claimType)` → `POST /energy/claim`（注册赠送 / 每日签到 / 任务），用于免费途径。
- **能量同步时机**：登录后、进 Profile、开始增强匹配前、退款通知到达后，均刷新 `S.energy`，并据 `availableEnergy` 控制 match setting 增强开关可用性（§6.4）。

### 6.11 广场改版前端（推荐 + 校园墙 + 三卡 + 匿名 + 学校标注 + 间距，I 规则 §8.1）

> **现状（grounding）**：`#tab-square`（index.html L638-659）现有「Recommended / Campus Life / Top Stories」三段 + `#square-feed`（`space-y-12`）+ `switchSquareTab(el, tab)` + 浮动发帖按钮 `openNewPost()`；`square.js` 已有 `loadSquarePosts` / `renderSquareFeed` / `bentoLargeCard` / `bentoWideCard` / `bentoSmallCard` / `bentoTextCard` / `likePost` / `openPostDetail`。本次改版**复用这套基建**，重定义为两 tab + 三卡。

**DOM 改造（index.html `#tab-square`）**：
- **顶部两段切换**：把现有三按钮替换为 **`[推荐 | 校园墙]`** 两个，`onclick="switchSquareTab(this, 'recommend'|'campus_wall')"`，选中态荧光绿 `#CCFF00`/黑底白字风格沿用。
- **间距调小（规则 11）**：`#square-feed` 由 `space-y-12`（3rem）改为 **`space-y-6`**（1.5rem）；小卡双列网格由 `gap-4` 改为 **`gap-3`**（`square.js` L88 `grid grid-cols-2 gap-4` → `gap-3`）。
- **发帖去向选择**：`openNewPost()` 弹层（`#modal-new-post`）顶部加一组单选 **`[发到推荐 | 发到校园墙]`**（`S.newPostBoard`，默认 `recommend`）+ **匿名开关** checkbox「匿名发布（显示为「匿名同学」，仍标注学校）」（`S.newPostAnonymous`）。
- **学校标注（规则 6）**：三卡渲染右上角加 `<span class="school-badge">{post.school}</span>`；官方帖额外加徽标（学生会 / 团队）或「Sponsored」（赞助商，`isSponsored`）。

**square.js 改造**：
- `loadSquareTab()` / `switchSquareTab(el, tab)`：`tab ∈ {'recommend','campus_wall'}`，分别调 `GET /square/v2/recommend` / `GET /square/v2/campus-wall`。
- `loadSquarePosts()`：按当前 tab 取对应端点，结果存 `S.squarePosts`；**校园墙无 `profile.school`** 时渲染空状态「补全学校信息后查看校园墙」。
- `renderSquareFeed(items)`：按 `authorType` + `board` 分发卡型——
  - 官方帖（`authorType ∈ 官方`）→ `bentoLargeCard(p)`（大卡，含官方徽标 / Sponsored + 学校）。
  - `board=campus_wall && authorType=USER` → `bentoWideCard(p)`（中卡，单列、头像 + 学校在上、大图、内容、赞评）。
  - `board=recommend && authorType=USER` → `bentoSmallCard(p)`（小卡，双列瀑布流网格，两两成对放进 `grid grid-cols-2 gap-3`）。
  - 推荐 tab 内若混入校园墙提上来的中卡，按 `board=campus_wall` 走 `bentoWideCard`。
- **匿名渲染（规则 7）**：新增 `postAuthorDisplay(p)` —— `p.anonymous` 为 true 时返回 `{ name: '匿名同学', avatar: 占位图 }`，否则用 `p.authorUser.profile`；三卡的 `avatarChip` / `postAuthorName` 统一走它。**后端对匿名帖已置空 `authorUser`**，前端兜底再渲染匿名占位。
- 发帖提交 `submitNewPost()`：`POST /square/v2/posts`，body `{ board: S.newPostBoard, title?, content, images?, anonymous: S.newPostAnonymous, tags? }`；成功后回当前 tab 刷新。
- `likePost` / `openPostDetail` / 评论：改调 `/square/v2/posts/:id/...`（楼中楼复用 `SquarePostComment`，渲染逻辑不变）；详情页同样按 `anonymous` 渲染作者位、右上角学校。

**state.js 新增**：
```js
S.squareTab = 'recommend';        // 'recommend' | 'campus_wall'
S.squarePosts = [];               // 当前 tab 列表缓存
S.newPostBoard = 'recommend';     // 发帖去向（弹层单选）
S.newPostAnonymous = false;       // 匿名开关
```

**后管发帖前端（apps/admin-web，I 规则 §8.1.3）**：
- **用户管理页**（`apps/admin-web/src/app/(dashboard)/users/page.tsx` 同级新增「后管账号」管理页或 tab）：角色下拉 `SUPER/STUDENT_UNION/TEAM/SPONSOR`、学校选择（`STUDENT_UNION` 必选、其它禁用）、组织名文本框（`TEAM/SPONSOR`）、禁用 toggle（`isActive`）；调 `POST/PUT/DELETE /admin/users`。
- **官方发帖页**（新增 `apps/admin-web/src/app/(dashboard)/square/post/page.tsx`）：选 board（推荐 / 校园墙）+ `authorType`（由当前后管 role 推导锁定）+ 学校（`STUDENT_UNION` 取绑定校、`TEAM/SPONSOR` 可选 / 跨校）+ 标题 / 正文 / 图片 + `SPONSOR` 自动勾选「Sponsored」；调 `POST /admin/square/posts`。
- `apps/admin-web/src/lib/api.ts` 新增 `createAdminUser/updateAdminUser/listAdminUsers/createOfficialPost` 等封装。

---

## 7. 风险与迁移注意

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| 1 | 枚举追加值后才能 UPDATE（PG 限制） | 高 | 迁移 4/5 分两次事务；staging 先验；备份+回滚脚本 |
| 2 | 删 User 匹配字段时序 | 高 | 迁移 6 必须在后端切到 UserModeState 读写后上线 |
| 3 | 旧 PENDING_CONFIRM/RELATIONSHIP_MODE 映射 | 中 | 迁移 5 显式 UPDATE；verify 脚本断言无残留 |
| 4 | 会话列表 N+1 | 中 | 批量 profile + groupBy unread（§4.2） |
| 5 | 「先聊后定」UX 断裂 | 中 | 版本提示「配对后立即可聊，48h 内双方确认才保留」；确认前临时对话带倒计时 |
| 6 | 朋友多对话过长 | 中 | 按 updatedAt 排序 + 取 limit；每轮候选上限 5（§3.6） |
| 7 | maxMatchesPerUser 朋友须为 5（非 1/非 ∞） | 中 | buildCandidates 按 mode 传约束（romantic=1，friend=5）；补单测 |
| 8 | 多个 isActive 同 type | 中 | partial unique 建索引前清理；建索引失败即阻断 |
| 9 | 48h 过期清理误伤/漏伤 | 高 | `expireUnconfirmedMatches` 只扫临时状态（§3.5）；旧 `expireStaleProposals` 只清 PENDING_CONFIRM（§3.6）；按 createdAt 锚点 |
| 10 | 临时对话到期前后端不一致（前端还显示） | 中 | 接口返 `remainingMs`，前端 `<=0` 灰显；10min Interval 扫描置 EXPIRED 后从列表消失 |
| 11 | 确认窗口竞态（A 在最后一刻确认 vs 过期任务） | 中 | confirmRelationship 内 CAS + 兜底校验 `now>createdAt+48h` 拒绝（§3.4） |
| 12 | 删排行榜/Love Mode 漏删残链 | 中 | grep 全量清理 index.html/main.js/leaderboard.js/settings.js/css/README（§6.8/§8.2） |
| 13 | 旧情侣帖迁移数据完整性（CouplePost→SquarePost） | 高 | **已定取「迁移进 SquarePost + 旧表废弃」**（§8.1.6/§2.7 迁移 12）：沿用原 postId 搬运、`coupleMatchId` 回填情侣语义、`school` 取作者 profile；迁移后**断言**帖/情侣帖/评论/点赞条数与原表逐项一致（§2.7 迁移 12 校验段），不通过即回滚；旧表先停写、观察期后再单独 drop（不在迁移 12 内物理删表），保留回退窗口；迁移前全量备份、staging 先验 |
| 13b | 后管权限提升攻击（改 role 越权） | 高 | 仅 `SUPER` 可改 `role`/`schoolId`；STUDENT_UNION 官方帖 `school` 受 `getAdminScope.schoolIds` 强校验，发他校被拒（§8.1.3） |
| 13c | 匿名帖泄露身份 | 高 | 列表/详情接口对 `anonymous=true` 帖**置空** `authorUser` id/昵称/头像，前端再兜底渲染「匿名同学」；学校来自 `SquarePost.school` 不经作者 profile（§8.1.1） |
| 14 | 旧前端无 mode 参数 | 中 | 所有 `?mode=` 默认 romantic；旧端点保留 |
| 15 | 并发切模式/多端一致性 | 中 | 状态写单事务 CAS；前端进 tab 强制重拉 |
| 16 | 对方注销悬空 Match | 低 | 定时扫描标 EXPIRED；前端「对方账户已删除」 |
| 17 | 拉黑跨模式未生效（E 规则） | 中 | buildCandidates 用统一用户级拉黑名单过滤两模式候选对（§3.6） |
| 18 | 能量预扣后崩溃 / 任务失败，扣了没配也没退（J） | 高 | 预扣与进池同一事务；空池退款幂等（按 matchId/轮次去重）；对账脚本扫 CONSUME 无对应 Match 且无 REFUND 的孤儿（§10.6） |
| 19 | 并发重复消耗 / 退款（双跑、重试） | 高 | `consume`/`refund` 校验 `availableEnergy>=0`，按 `relatedMatchId` 唯一去重；queue `attempts=3` 但消耗放进池事务、退款幂等（§10.2/§10.6） |
| 20 | 增强强配把超低分对象塞给普通方，破坏体验 | 中 | 阶段一只对**增强方**放宽阈值；普通方硬约束（性别/年龄）仍生效（§3.6/§10.3） |
| 21 | 「空池才退」边界：池里只有 1 个增强用户自己 | 中 | `emptyPoolUserIds` 判定 = 排除自己后无任何可配对象；单测覆盖单人池（§10.3） |
| 22 | 充值金额/到账与流水不一致（对账） | 高 | 每笔写 `balanceAfter` 快照 + `metadata.orderId/transactionId`；支付回调验签后才入账（§10.4，渠道对接期落地） |
| 23 | 余额展示与后端不一致（多端/扣费后） | 中 | 关键动作后重拉 `/energy/balance`；前端格子仅展示，扣费判定以后端为准（§6.10/§10.5） |
| 24 | 48h 未确认是否退款的口径分歧 | 中 | §1.5 J 为准：默认仅空池退；48h 退款为可选开关（§3.5/§10.3），上线前产品明确 |

---

## 8. 广场改版（推荐 + 校园墙 + 三卡 + 后管联动）+ 删除排行榜 / Love Mode

### 8.1 广场改版（推荐 + 校园墙 + 三卡 + 后管联动）

> **I 规则深化（最终确认）**：广场从「情侣帖」改为 **推荐（recommend）+ 校园墙（campus_wall）** 两个 tab。本节为**实现就绪**设计，自洽于 §1.5（最高权威）、§2 数据模型、§9 分期。
> **现状（grounding）**：`apps/api/src/square/`（`square.service.ts` / `square.controller.ts` / `dto/square.dto.ts`）已存在，基于 `CouplePost` + `PostComment` + `PostLike`，前端 `apps/h5/index.html`（`#tab-square` 约 L638-659，含 `#square-feed`、`switchSquareTab`、`openNewPost`）+ `apps/h5/src/modules/square.js`（`renderSquareFeed` / `bentoLargeCard` / `bentoSmallCard` / `bentoWideCard` / `bentoTextCard`）已实现「Recommended / Campus Life / Top Stories」三段 bento 流。本次改版**复用这套卡片渲染基建**，把语义重定义为大/中/小三卡。

#### 8.1.0 最终规则速览（11 条）

1. **两个 tab**：推荐 / 校园墙。
2. **三种卡**：
   - **大卡** = 官方帖（学生会 / 团队 / 赞助商发布，走后管联动；复用 `bentoLargeCard` 升级版）。
   - **中卡** = 校园墙用户帖（单列：头像 + 学校在上、大图、内容、点赞评论；复用 `bentoWideCard`）。
   - **小卡** = 推荐用户帖（双列瀑布流网格：图 + 标题 + 时间 + 作者 + 点赞；复用 `bentoSmallCard`）。
3. **发帖去向**：发帖时选「推荐」或「校园墙」。发校园墙 → 中卡（仅同校可见）；发推荐 → 小卡（全网、算法排序）。
4. **推荐 tab**：小卡（发到推荐的个人帖）+ 大卡（官方，加权插入 / 置顶）+ 偶尔把校园墙优质内容提上来显示为中卡。
5. **校园墙 tab**：只显示同校的中卡（同校过滤）。
6. **每个帖子右上角标注发布者学校。**
7. **推荐和校园墙都可匿名发帖**：匿名时隐藏头像 / 昵称为「匿名同学」，但仍标注学校。
8. **推荐算法 = 加权混排**（官方大卡按权重插入；个人小卡按 热度 + 同校加权 + 新鲜度 打分排序；偶尔提校园墙中卡）。MVP 可落地。
9. **后管联动**：`admin_users` 加角色 `role`（super / student_union / team / sponsor）；学生会账号绑定 `schoolId`（只能发本校官方帖）；用后管登录发大卡官方帖。
10. **赞助商帖标 "Sponsored" 标识。**
11. **帖子间距调小**（现 `#square-feed` 为 `space-y-12` = 3rem，太松，改为 `space-y-6` ≈ 1.5rem；小卡网格 `gap-4`→`gap-3`，详见 §6.11）。

> **设计取向**：**新增 `SquarePost` / `SquarePostComment` / `SquarePostLike` 三张表**取代旧 `CouplePost` 体系，新广场全部走 `SquarePost`；旧 `CouplePost`（情侣帖 + 单人帖 + demo）经**迁移 12**（§2.7）整体搬入 `SquarePost` 后**废弃停写**，情侣双头像语义由可选 `coupleMatchId` 保留。旧情侣帖去向及 5 项关键决策见 §8.1.6（**已全部定稿**，旧帖取「迁移进 SquarePost」）。数据模型完整定义见 §2.6，迁移见 §2.7（迁移 10/11/12）。

#### 8.1.1 三卡 ↔ 数据字段映射

| 卡型 | 触发条件（`SquarePost`） | 渲染（复用 square.js） | tab |
|---|---|---|---|
| **大卡** 官方帖 | `authorType ∈ {STUDENT_UNION, TEAM, SPONSOR}` | `bentoLargeCard` 升级：大图 + 标题 + 官方徽标（学生会 / 团队）/「Sponsored」（赞助商）+ 右上角学校 | 推荐（加权置顶）；校园墙（仅本校学生会帖） |
| **中卡** 校园墙用户帖 | `authorType=USER && board=CAMPUS_WALL` | `bentoWideCard`：单列、头像 + 学校在上、大图、内容、点赞评论 | 校园墙（同校）；推荐（算法偶尔提上来） |
| **小卡** 推荐用户帖 | `authorType=USER && board=RECOMMEND` | `bentoSmallCard`：双列瀑布流，图 + 标题 + 时间 + 作者 + 点赞 | 推荐 |

> **匿名渲染（规则 7）**：`anonymous=true` 时，三卡的作者位一律渲染头像占位 + 昵称「匿名同学」，**但右上角学校标注照常显示**（学校来自 `SquarePost.school`，不经作者 profile，匿名也不泄露身份）。后端列表接口对匿名帖**不下发** `authorUser.id/nickname/avatarUrl`（置空），从源头防泄露。

#### 8.1.2 数据模型（详见 §2.6）

新增 `SquarePost`（`board` / `authorType` / `authorUserId` / `adminId` / `school` / `anonymous` / `isSponsored` / `isHidden` / `tags` / `metadata` + **可选 `coupleMatchId`** 等）+ `SquarePostComment`（楼中楼，结构同旧 `PostComment`）+ `SquarePostLike`（`@@unique([postId,userId])`）。`AdminUser` 扩展 `role` / `schoolId` / `organizationName` / `isActive`（详见 §2.6）。

**`SquarePost` 取代 `CouplePost`（不再并存）**：`SquarePost` 是广场唯一帖子主表；旧 `CouplePost` / `PostComment` / `PostLike` 通过**迁移 12**（§2.7）整体搬入 `SquarePost` / `SquarePostComment` / `SquarePostLike` 后**废弃停写**。其中情侣帖的「双人」语义由 `SquarePost.coupleMatchId`（可选，关联原 `CouplePost.matchId`）承载——非空即为情侣帖，前端据此取该 Match 双方 profile 展示**双头像**；普通 / 单人 / demo 帖该字段留空。迁移与回填口径见 §8.1.6「迁移要点」+ §2.7 迁移 12。

#### 8.1.3 后管角色体系 + 官方发帖联动

**新增 `AdminRole` 枚举**：`SUPER`（超管，全校全角色管理）/ `STUDENT_UNION`（学生会，绑定 `schoolId`，仅发本校官方帖）/ `TEAM`（团队，发跨校官方帖）/ `SPONSOR`（赞助商，发商业推广帖，标 "Sponsored"）。`AdminUser.role` 可为 `null`（仅可查看，无发帖权）。

**新增后管模块 `apps/api/src/admin/admin-users.service.ts` + 接口（`admin.controller.ts` 扩展）**：

```
POST   /admin/users          创建后管用户（仅 SUPER）
GET    /admin/users          列表（含分页 + role/schoolId/isActive 过滤）
PUT    /admin/users/:id      更新（仅 SUPER 可改 role/schoolId，防权限提升；用户自身可改密码/name）
DELETE /admin/users/:id      禁用（仅 SUPER；软删除 isActive=false）
```

**权限校验工具 `getAdminScope(adminId)`**（被 `SquareService.createOfficialPost` 注入调用）：

```ts
async getAdminScope(adminId: string): Promise<{
  role: AdminRole;
  schoolIds: string[];      // 可管理 / 可发帖的学校：SUPER=全部；STUDENT_UNION=[schoolId]；TEAM/SPONSOR=[]（跨校无限制）
  canPublishOfficial: boolean; // role ∈ {STUDENT_UNION,TEAM,SPONSOR} && isActive
}>
```

**官方发帖（`square.service.ts` 新增 `createOfficialPost`）**：

```ts
async createOfficialPost(adminId: string, dto: CreateOfficialPostDto) {
  const scope = await this.getAdminScope(adminId);              // 经 AdminUsersService
  if (!scope.canPublishOfficial) throw new ForbiddenException('无权发官方帖');
  // STUDENT_UNION：dto.school 必填且必须 ∈ scope.schoolIds（只能发本校）
  // TEAM/SPONSOR：dto.school 可空（跨校）；SPONSOR 强制 isSponsored=true
  // 写入 SquarePost(authorType=scope.role, adminId, board=dto.board, school, isSponsored, ...)
}
```

> **权限边界（与 §1.5 H、E 自洽）**：STUDENT_UNION 仅能发本校（`school` 受 `schoolIds` 约束）的官方帖到 recommend / campus_wall，不能发个人帖、不能看其它学校的后管；TEAM / SPONSOR 无地域限制。**拉黑跨角色（§1.5 E）**：任何用户拉黑对方后，两模式匹配均过滤，但广场对官方帖 / 他人帖**仍可见**（广场不参与拉黑屏蔽，仅匹配池过滤）。

#### 8.1.4 推荐算法（加权混排，MVP 可落地）

> 实现位置：`square.service.ts` 的 `listRecommend(userId, page, limit)`。先**分别取候选**再**加权混排**，纯应用层排序（无需额外引擎，MVP 友好）。

**个人小卡打分**（`board=RECOMMEND && authorType=USER && !isHidden`）：

```
score = 0.5 * hotness + 0.3 * sameSchoolBoost + 0.2 * freshness

hotness        = log10(1 + likeCount + 2*commentCount)         // 热度（评论权重更高）
sameSchoolBoost= (post.school === me.school) ? 1 : 0           // 同校加权
freshness      = clamp(1 - ageHours / 168, 0, 1)              // 新鲜度：7 天线性衰减
```

**官方大卡加权插入**（`board=RECOMMEND && authorType∈官方`）：取最新 N 条未隐藏官方帖，按固定节奏插入信息流——**每 5 个个人小卡插 1 个官方大卡**（`metadata.weight` 可调权重，置顶帖 `metadata.pinned=true` 永远首位）。SPONSOR 帖同等参与插入但带 "Sponsored" 标识。

**偶尔提校园墙中卡**（规则 4）：从 `board=CAMPUS_WALL && school===me.school && likeCount>=阈值`（如 ≥10）中随机取 1–2 条，以中卡形式插入推荐流（每页最多 2 条），让本校优质内容破圈。

**伪代码**：

```ts
async listRecommend(userId, page = 1, limit = 20) {
  const me = await profileSchool(userId);
  const personal = await scoreAndSortPersonalCards(me.school);   // 小卡按 score desc
  const official = await latestOfficial(board='RECOMMEND');      // 大卡（pinned 优先）
  const wallPicks = await topCampusWall(me.school, take=2);       // 中卡（偶尔提上来）
  // 混排：先放 pinned 大卡 → 每 5 小卡插 1 普通大卡 → 每页插 ≤2 中卡 → 分页切片
  return interleave({ personal, official, wallPicks, page, limit });
}
```

> **MVP 边界（✅ 已定，§8.1.6 决策点 1）**：本期推荐信号锁定为 **热度 + 同校加权 + 新鲜度 + 官方权重**（`score=0.5*hotness+0.3*sameSchool+0.2*freshness`，官方插入/置顶）。**关注关系 / 兴趣 `tags` 召回、协同过滤 / 向量召回等列为「后续迭代（非本期）」**，不作为待确认项；`tags` 字段先入库占位，本期不参与排序。

**校园墙列表**（`listCampusWall(userId)`）：`board=CAMPUS_WALL && school===me.school && !isHidden`，按 `createdAt desc`（或热度），**同校过滤是硬约束**（规则 5）；无 `profile.school` 的用户返回空 + 引导补全资料。

#### 8.1.5 接口变更（square.controller.ts）

> 新增端点统一挂在 `square` 控制器；旧 `CouplePost` 端点（`GET/POST /square/posts...`）在迁移 12 完成、数据搬入 `SquarePost` 后**下线**（见 §8.1.6）。**前端只调用以下新端点**：

```
POST   /square/v2/posts            用户发帖（body: board, title?, content, images?, anonymous?, tags?）
                                   authorType=USER，userId 取自 JWT，school 取自 author.profile.school
GET    /square/v2/recommend        推荐 tab 流（加权混排，§8.1.4），分页
GET    /square/v2/campus-wall      校园墙 tab 流（同校过滤），分页
GET    /square/v2/posts/:id        帖子详情（含评论、myLiked）
POST   /square/v2/posts/:id/like   点赞（切换）
POST   /square/v2/posts/:id/comments  评论（楼中楼，复用 SquarePostComment）
POST   /square/v2/posts/:id/report 举报（置 isHidden 走审核，见 §8.1.7）

// 官方（后管，走后管鉴权，不在用户 JWT 下）：
POST   /admin/square/posts         后管发官方帖（body: board, authorType 由 role 推导, school?, title, content, images, isSponsored?）
DELETE /admin/square/posts/:id     后管下架（置 isHidden=true + deletedBy/deleteReason）
```

**`CreatePostDto`（v2）字段**：`board: 'recommend'|'campus_wall'`（`@IsEnum`）、`title?`、`content`（≤2000）、`images?`、`anonymous?: boolean`（默认 false）、`tags?: string[]`。**校验**：`board` 合法；校园墙发帖**不做独立的「成员资格」校验**（任何人可向自己学校发，但只有同校可见——`school` 一律写入作者本人 `profile.school`，用户无法伪造他校）；**当 `board=campus_wall` 且作者无 `profile.school` 时返回 `400`**（引导补全资料后再发，§8.1.6 决策点 2 已定稿）。

#### 8.1.6 旧情侣帖（CouplePost）去向 + 5 项关键决策 — ✅ 已定稿

> 据《广场改版最终规则》+ §1.5 I，**旧情侣帖不再作为广场主体**。本节原 5 项决策**已全部拍板定稿**（下表「最终决策」列即落地口径，实现照此即可，无需再挂起）。先给旧情侣帖去向的最终方案（迁移进 SquarePost），再给 5 项决策的最终答案。

**旧情侣帖去向（✅ 已定：迁移进新 `SquarePost`）**：

- **最终方案 = 数据迁移**：现有 `CouplePost`（情侣双头像帖 + 历史单人帖 + demo 数据）**全部迁移成 `SquarePost` 普通帖**；迁移完成后**旧 `CouplePost` 表废弃**（停写、不再被任何代码路径使用，可在确认稳定后单独 drop）。
- **作者归属**：情侣帖迁移后作者取「**发帖那一方**」（`authorType=USER`，`authorUserId = CouplePost.authorUserId`），落到推荐 tab（`board=RECOMMEND`）。
- **保留「双人 / 情侣」展示（推荐做法）**：`SquarePost` 新增**可选字段 `coupleMatchId`**（关联原 `CouplePost.matchId`），承载「这是情侣帖」的语义，使前端仍可在卡片上展示**双头像**（按 `coupleMatchId` 取该 Match 双方 profile 渲染）。迁移脚本回填该字段；非情侣帖（历史单人帖 / demo）`coupleMatchId` 留空，按普通用户帖渲染。字段定义见 §2.6，迁移回填见 §2.7 **迁移 12**。
- **优点**：用户数据进入新体系、广场不再有「旧表死代码」长期并存负担；情侣语义通过 `coupleMatchId` 无损保留；迁移一次完成，后续只维护一套 `SquarePost`。

> **被否方案（不采纳，留档）**：早期「隐藏入口（保留旧表 + 前端不渲染 + Profile 单独查看）」与「标记弃用」均不采纳——长期并存两套帖子表、维护成本与状态污染风险更高。**最终统一为「迁移进 SquarePost + 旧表废弃」。**

**迁移要点（CouplePost → SquarePost，对应 §2.7 迁移 12）**：

1. **逐行搬运**：`CouplePost` 每行插入一条 `SquarePost`，映射 `title/content/images/likeCount/commentCount/createdAt/updatedAt` 原样保留；`authorUserId = CouplePost.authorUserId`、`authorType = USER`、`board = RECOMMEND`、`anonymous = false`、`isSponsored = false`、`isHidden = false`。
2. **学校回填**：`school = 作者 profile.school`（取不到则留空，按无校帖处理，仍可在推荐 tab 出现，校园墙不涉及）。
3. **情侣语义回填**：`coupleMatchId = CouplePost.matchId`（非空即标记为情侣帖，前端据此展示双头像；为空按普通帖）。
4. **评论 / 点赞搬运**：`PostComment → SquarePostComment`、`PostLike → SquarePostLike`（按新旧 postId 映射表回填 `postId`，保留 `userId/content/imageUrl/parentCommentId/createdAt`；点赞去重沿用 `@@unique([postId,userId])`）。
5. **旧表废弃**：迁移校验通过后，`CouplePost`/`PostComment`/`PostLike` 旧表**停写**；新 `SquarePost` 发帖**不再校验** `RELATIONSHIP_ROMANTIC` / `RELATIONSHIP_MODE`（用户发帖自由，与恋爱 / 朋友状态无关）；旧 `square.service.ts:18-24` 那段「查 RELATIONSHIP_MODE 决定情侣帖」的逻辑作废、旧 `square` 端点下线。
6. **校验**：迁移脚本附断言——`SquarePost` 中 `coupleMatchId IS NOT NULL` 的条数 = 原 `CouplePost` 中 `matchId IS NOT NULL` 的条数；总帖数 = 原 `CouplePost` 行数；评论 / 点赞数对齐（见 §2.7 迁移 12 校验段、§7 风险 #13）。

**5 项关键决策（最终定稿）**：

| # | 决策点 | 最终决策（落地口径） | 影响章节 |
|---|---|---|---|
| 1 | **推荐算法信号** | **MVP 锁定三信号**：个人小卡 `score = 0.5*热度 + 0.3*同校 + 0.2*新鲜度`（§8.1.4），官方大卡按 `metadata.weight` 加权、每 5 小卡插 1、`pinned` 置顶，偶尔提本校高赞中卡（每页 ≤2）。**关注关系 / 兴趣 `tags` 等召回信号列为「后续迭代（非本期）」**——`tags` 字段先入库占位（不参与排序），留待二期协同/兴趣召回，避免 MVP 引入无数据冷启动的信号。 | §8.1.4 |
| 2 | **校园墙发帖权限** | **采「人人可发、`school` 取自己 profile、仅同校可见」**（不额外验证学生身份 / 「必须该校用户」）。发帖时 `school` 一律写入作者本人 `profile.school`（用户无法伪造他校）；无 `profile.school` 者**禁止发校园墙**（`POST /square/v2/posts` 当 `board=campus_wall` 且作者无 school → `400`，引导补全资料），同时其校园墙列表为空（§8.1.4）。即「同校可见」由 `school` 写入源 + 列表硬过滤双重保证，无需独立的「成员资格」校验。 | §8.1.5 / §8.1.4 |
| 3 | **审核口径** | **官方账号发帖直接发布（信任后管）**：不做草稿→发布二次审核；`SUPER` 可信，`STUDENT_UNION/TEAM/SPONSOR` 受角色 + `schoolId` 约束，足以兜底，`status: DRAFT/PUBLISHED` 仅在 `metadata` 预留、本期不实现。**个人帖被举报 ≥3 次自动隐藏待审**：举报累计 ≥3 自动 `isHidden=true`（`deletedBy='reporter:auto'`）+ 后管可随时手动下架（`deletedBy=adminId`）+ 作者可自删（`deletedBy=自己`）；隐藏后对他人不可见、发帖者仍可见。详见 §8.1.7。 | §8.1.7 / §8.1.5 |
| 4 | **间距具体值** | **定稿采纳**：`#square-feed` 列表 `space-y-12`（3rem）→ **`space-y-6`**（1.5rem）；小卡双列网格 `gap-4`（1rem）→ **`gap-3`**（0.75rem）。即「间距减半」（规则 11），详见 §6.11。 | §6.11 |
| 5 | **历史情侣帖** | **迁移进 `SquarePost`**：见上「旧情侣帖去向」——`CouplePost`（情侣帖 + 单人帖 + demo）全部迁移成 `SquarePost` 普通帖（作者取发帖方、`authorType=USER`），可选 `coupleMatchId` 保留双头像语义；迁移后**旧 `CouplePost` 表废弃**。迁移步骤见上「迁移要点」+ §2.7 **迁移 12**。 | §8.1.6（本节） / §2.6 / §2.7 |

> **自洽校验**：以上 5 项与 §1.5 I（最高权威）、§2.6/§2.7（数据模型 + 迁移 12）、§8.1.4（算法）、§8.1.7（审核）、§6.11（前端间距）一致。本节定稿后，全文档凡涉及旧情侣帖去向之处一律按「迁移进 SquarePost + 旧表废弃」落地，**不再挂起**。

#### 8.1.7 审核与内容安全（✅ 已定稿，§8.1.6 决策点 3）

> 本节为**最终落地口径**（§8.1.6 决策点 3 已拍板），非「默认方案」，实现照此即可。

- **官方帖：发布即生效**（不做草稿 → 发布二次审核）。`SUPER` 可信；`STUDENT_UNION/TEAM/SPONSOR` 受角色与 `schoolId` 约束（§8.1.3）即足以兜底。`status: DRAFT|PUBLISHED` 仅在 `metadata` 预留，**本期不实现**。
- **个人帖（UGC）：举报阈值 = 3**。用户举报（`POST /square/v2/posts/:id/report`），**累计举报数 ≥ 3 自动置 `isHidden=true`**（`deletedBy='reporter:auto'`，`deleteReason='举报超阈值自动隐藏'`），或后管随时手动下架（`DELETE /admin/square/posts/:id`，`deletedBy=adminId`）。隐藏后**对他人不可见、发帖者仍可见**。索引 `@@index([isHidden, createdAt])` 支撑审核后台筛选。
  - **幂等**：同一 `(postId,userId)` 重复举报不累加（按 `userId` 去重计数，避免刷举报误伤）；建议举报落 `metadata.reports[]` 或单列计数 + 去重集合（本期可用 `metadata` 累加 + 去重，简化无新表）。
- **作者自删**：发帖者可删自己的帖（置 `isHidden=true`，`deletedBy=自己`，`deleteReason='作者自删'`）。

### 8.2 删除排行榜模块 + Love Mode 入口（H 规则）

**前端（必须删，详见 §6.8）**：删除 Profile 内「Leaderboard」「Love Mode」入口 + `#leaderboard-overlay` 整块 + 相关 JS/CSS 引用；底部导航维持 3 tab 无排行榜。

**后端（leaderboard 模块）**：
- 选项 A（保留代码、前端不暴露）：`apps/api/src/leaderboard/*` 不删，但在 controller 标注 `@deprecated` / 文档注明「前端已下线」；不在任何前端导航/接口文档中引用。
- 选项 B（彻底下线）：从 `app.module.ts` 移除 `LeaderboardModule` 导入，删除 `leaderboard.controller.ts`/`leaderboard.service.ts`（及 iOS `LeaderboardService`/`LeaderboardViewModel` 引用——若 iOS 在维护）。
- **本设计取选项 A**（保留后端代码、前端不暴露），降低回退成本；待确认后可转 B。

> 注：iOS 端（`apps/ios`）若同步维护，同样去掉排行榜入口与 Love Mode 入口（`LeaderboardViewModel`/`MainTabView` 等），口径同 H5；本文档以 H5 为主。

---

## 9. 分期实现计划

> 原则：先做低风险解耦（删排行榜/LoveMode）→ 数据模型先行 → 后端流程 → 聊天与问卷并行 → 前端整合 → 灰度。阶段间依赖已标注。
> 本次修订把以下纳入对应阶段：**删排行榜/Love Mode（阶段 0）**、**朋友确认 + 48h 通用过期（阶段 2/3）**、**Chat 主视图（阶段 3/5）**、**导航三切换（阶段 5）**、**广场改版：推荐+校园墙+三卡+后管联动（阶段 7，§8.1）**、**增强模式付费能量系统（阶段 8，依赖阶段 2/5，§10）**。

### 阶段 0 — 删除排行榜 + Love Mode 入口（低风险解耦）｜依赖：无（可最先做）

**改动文件**
- `apps/h5/index.html`：删 Profile 内 Leaderboard / Love Mode 入口 + `#leaderboard-overlay` 整块（§6.8）。
- `apps/h5/src/main.js` / `modules/leaderboard.js` / `modules/settings.js` / `modules/milestone.js` / `styles/main.css` / `README.md`：清理 leaderboard / Love Mode 引用。
- 后端取**选项 A**：`apps/api/src/leaderboard/*` 保留代码、标注前端已下线（§8.2）。

**验收用例**
1. 三 tab（主页/广场/我的）正常；Profile 无 Leaderboard / Love Mode 入口；无残留报错（grep 无悬空 `openLeaderboard`/`#leaderboard-overlay`）。
2. 后端 leaderboard 接口仍存在但前端不再调用。

### 阶段 1 — 数据模型 + 迁移（地基）｜依赖：无

**改动文件**
- `apps/api/prisma/schema.prisma`：§2.2 全量替换。
- `apps/api/prisma/migrations/20240613_01..06/migration.sql`：§2.3 六个迁移（4/5 分两目录）。
- `apps/api/prisma/verify-migrations.ts`：§2.4。
- `apps/api/prisma/seed.ts`：§2.5（romantic type + UMS + friend 问卷种子 §5.5）。

**验收用例**
1. `prisma migrate deploy` 在 staging 跑通；`prisma generate` 无类型错误。
2. `ts-node prisma/verify-migrations.ts` 全部断言通过（每 user 有 romantic UMS；无旧 Match 状态残留；每 type≤1 active）。
3. `SELECT` 抽查：原 `proposed` 用户 → UMS `confirming`；原 `RELATIONSHIP_MODE` Match → `RELATIONSHIP_ROMANTIC`。

### 阶段 2 — 后端双匹配引擎 + 恋人/朋友「先聊后定 + 双确认」｜依赖：阶段 1

**改动文件**
- `apps/api/src/matching/mode.util.ts`（新建，§1.3：含 TEMP/CONFIRMED 状态集、`CONFIRM_WINDOW_MS`、`isTempStatus`）。
- `apps/api/src/matching/matching.service.ts`：`startMatchForUser`（含问卷完成度校验 G、恋人确认后停止匹配 B）/`stopMatchForUser/getFullMatchStatus`（返 remainingMs）/`triggerMatchJob/executeMatchJob`（朋友上限 5）/`buildCandidates`（拉黑过滤 E）加 mode；新增**通用** `confirmRelationship`（romantic/friend 分流）/`dissolveMatch`（发通知 E）/`ensureModeState`/`expireUnconfirmedMatches`（48h 通用过期 §3.5）；保留 `expireStaleProposals` 仅清 PENDING_CONFIRM（§3.6）。
- `apps/api/src/matching/matching.controller.ts`：各端点加 `?mode=`；`POST /matching/:matchId/confirm-relationship`（通用）、`POST /matching/:matchId/dissolve`（§6.7）。
- `apps/api/src/matching/match.scheduler.ts`：cron 串行触发两模式（§3.5）；`@Interval` 调 `expireUnconfirmedMatches`。
- `apps/api/src/matching/matching.module.ts` / queue processor：`MATCH_JOB` payload 带 mode。
- `apps/api/src/matching/providers/match-model.interface.ts`：`MatchConstraints.mode`、`maxMatchesPerUser`（恋人1/朋友5）、`CandidateProfile.activities?`。
- `apps/api/src/matching/providers/scoring-match-model.provider.ts`：双权重表、`multiMatch(topN=5)`、按 mode 分流、朋友软约束（§3.6/5.6）。
- `apps/api/src/matching/dto/match-preferences.dto.ts`：加 `preferredInterests/preferredActivities/friendRequirements`（可选数组/文本）。
- `apps/api/src/matching/dto/dissolve.dto.ts`（新建）：`DissolveDto { reason?: string }`。
- `apps/api/src/matching/test/matching.service.spec.ts`：双模式评分、朋友一人多对（≤5）、恋人 + 朋友确认流程、48h 过期、拉黑过滤。

**验收用例**
1. 恋人 E2E：两人 `startMatch('romantic')`→trigger→各 1 条 `MATCHED_ROMANTIC`（立即可聊）；A `confirm-relationship`→`ROMANTIC_CONFIRMING`；B 确认→`RELATIONSHIP_ROMANTIC`，双方 UMS=relationship，**恋人匹配停止**（再 `startMatch('romantic')` 被拒）。
2. 朋友 E2E：多人 `startMatch('friend')`→trigger→每人 ≤5 条 `MATCHED_FRIEND`；A/B 各 `confirm-relationship`→`FRIEND_CONFIRMED`（永久），可与多人并存。
3. **48h 过期**：临时对话 `createdAt` 早于 now-48h 且未双确 → `expireUnconfirmedMatches` 置 `EXPIRED`，双方收到 `match_expired` 通知，列表不再返回。
4. **删除关系**：`dissolve` 后对方收到「X 解除了朋友/恋爱关系」通知；朋友只解除该条不影响其它朋友。
5. **拉黑跨模式**：拉黑后两模式 `buildCandidates` 均不再产出该对。
6. **问卷未填拦截（G）**：未填 friend 问卷调 `startMatch('friend')` 被拒。
7. 偏好按 mode 独立读写；旧无 mode 调用默认 romantic 正常；`buildCandidates('friend')` 含无性别字段用户。

### 阶段 3 — Chat 主视图（会话列表 + 临时/永久 + 倒计时）+ 权限放开｜依赖：阶段 2

**改动文件**
- `apps/api/src/chat/chat.service.ts`：`verifyMatchAccess` 放开（临时 + 永久均可聊，§4.1）；`sendMessage` 禁写 DISSOLVED/REJECTED/EXPIRED + 末尾 touch `match.updatedAt`；新增 `getConversationSessions`（返 `sessionType`/`remainingMs`/`mode`/`status`，§4.2）。
- `apps/api/src/chat/chat.controller.ts`：`GET /chat/sessions`（§4.3）。
- `apps/api/src/chat/dto/chat.dto.ts`：会话查询 DTO（mode/limit，可选）。

**验收用例**
1. 配对成功即可收发消息（临时对话 `MATCHED_ROMANTIC`/`MATCHED_FRIEND`），无需先确认。
2. `DISSOLVED`/`EXPIRED` 只读、禁发；`REJECTED` 禁发。
3. `GET /chat/sessions` 同时返回永久（已确认恋人 + 多个已确认朋友）与临时（带 `remainingMs`）对话；`sessionType` 准确；`unreadCount`/`lastMessage` 正确；`?mode=friend` 过滤生效；按 updatedAt 倒序。
4. 48h 过期后该临时会话从 `/chat/sessions` 消失。

### 阶段 4 — 双问卷系统 + 管理后台｜依赖：阶段 1（可与阶段 2/3 并行）

**改动文件**
- `apps/api/src/questionnaire/questionnaire.service.ts`：`getActiveQuestionnaire(type)`、`listVersions(type)`、`createVersion`(带 type)、`publishVersion` type-scoped、`getCompletion`（§5.2）。
- `apps/api/src/questionnaire/questionnaire.controller.ts`：`GET active?type=`、`GET completion`（§5.2）。
- `apps/api/src/questionnaire/admin-questionnaire.controller.ts`：`GET versions?type=`。
- `apps/api/src/questionnaire/dto/questionnaire.dto.ts`：`CreateQuestionnaireVersionDto.type`（`@IsEnum(QuestionnaireType)`）。
- `apps/api/src/answers/answers.service.ts`：可选 `getMyAnswers(userId, type)`。
- `apps/api/prisma/seed.ts`：friend 25 题（§5.3/5.5）。
- `apps/admin-web/src/app/(dashboard)/...questionnaire`：版本列表/创建加 type 过滤与选择。

**验收用例**
1. 同用户分别答 romantic / friend，互不覆盖。
2. 发布 friend 版本只下线 friend 旧 active，romantic 不受影响。
3. `GET /questionnaire/completion` → `{ romantic:{completed:true}, friend:{completed:false} }` 准确（用于注册后两张卡片 + 进模式引导，G 规则）。

### 阶段 5 — 前端整合（H5）：三切换导航 + Chat 主视图 + 双模式 UI｜依赖：阶段 2/3/4

**改动文件**
- `apps/h5/src/state.js`：§6.1 新字段（`S.homeView`、`S.matchStatus` 分桶、`S.sessions` 等）。
- `apps/h5/index.html`：**主页顶部三切换 `Chat / 恋人匹配 / 朋友匹配`**；底部维持 3 tab（主页/广场/我的，无排行榜）；注册后两张问卷卡片；问卷 mode 标识；偏好双区；Chat 列表（临时带倒计时 + 永久两组）；**Chat 对话框头部「确认成为恋人/朋友」+「删除关系」按钮**（§6.2/6.3/6.4/6.6）。
- `apps/h5/src/modules/match.js`：`switchHomeView`、`loadMatchTab/renderMatchTab`（恋人 relationship 显「打开和恋人的对话」入口；朋友最多 5 卡 + 倒计时）、朋友偏好 toggle、`renderCampusScene(mode)`（§6.2/6.5/6.9）。
- `apps/h5/src/modules/questionnaire.js`：注册后两卡片渲染 + 选填、`loadQuestionnaire(mode)`、答案分桶、提交后回对应模式（§6.3）。
- `apps/h5/src/modules/chat.js`：`loadSessions/renderSessions`（temp/confirmed 分组 + 倒计时徽标）、`openSession`、列表↔单聊切换、**对话内 `confirmRelationship`（恋人/朋友通用）+ `dissolveMatch`**（§6.6）。

**验收用例**
1. 主页顶部三切换 Chat/恋人匹配/朋友匹配 互不串状态；对话只在 Chat 出现，不在匹配界面。
2. 问卷选填：注册后可都填/只填一个/都不填；未填对应问卷点该模式匹配被引导去填。
3. 恋人 matched→Chat 临时对话（带倒计时）→对话内「确认成为恋人」→双方确认转永久；恋人匹配界面改显「打开和恋人的对话」。
4. 朋友 matched→最多 5 卡→进 Chat 临时对话→对话内「确认成为朋友」→双方确认转永久（可多个）。
5. 临时对话 48h 未双确从 Chat 列表消失；删除关系后对方收到通知、会话移除。
6. Chat 列表全部可聊对象 + 未读红点；进会话清零未读；切会话不串台。
7. 底部无排行榜；Profile 无 Leaderboard / Love Mode 入口。

### 阶段 6 — 灰度与回滚（贯穿）

- feature flag 控制朋友模式开关；staging 留观 1 周；线上 10%→50%→100%。
- 监控匹配成功率、确认转化率、48h 过期率、聊天活跃度、API 延迟/错误率；保留快速回滚（关 flag + 迁移 6 延后到稳定后再上）。

### 阶段 7 — 广场改版：推荐 + 校园墙 + 三卡 + 后管联动（I 规则 §8.1）｜依赖：阶段 5（前端整合，复用 square 基建）

> 落地完整广场（不再占位）。**`SquarePost` 取代旧 `CouplePost`**：新功能全走 `SquarePost`；旧情侣帖去向取 §8.1.6 定稿「迁移进 SquarePost + 旧表废弃」（迁移 12，`coupleMatchId` 保留双头像语义），**5 项关键决策已全部定稿**（见 §8.1.6 决策表），本阶段直接照此落地。

**改动文件**

- **数据模型（地基）**
  - `apps/api/prisma/schema.prisma`：追加 §2.6 `SquarePost`（含可选 `coupleMatchId`）/`SquarePostComment`/`SquarePostLike` + 枚举 `SquareBoard`/`SquareAuthorType`/`AdminRole`；扩展 `AdminUser`（role/schoolId/organizationName/isActive + squarePosts）+ `User`（三个反向关系）。
  - `apps/api/prisma/migrations/20240613_10_add_square_posts/migration.sql`、`20240613_11_extend_admin_users/migration.sql`、`20240613_12_migrate_couple_posts_to_square/migration.sql`：§2.7 迁移 10/11/12（迁移 11 含 isSuperAdmin→role=SUPER 回填；**迁移 12 把 CouplePost 数据搬入 SquarePost + 回填 coupleMatchId + 校验断言**，§8.1.6）。
- **后端广场（用户侧）**
  - `apps/api/src/square/square.service.ts`：新增 `createPostV2`（authorType=USER，school 取 author.profile.school，board/anonymous/tags）、`listRecommend`（加权混排 §8.1.4；情侣帖 `coupleMatchId` 非空时附带双方 profile 供前端展示双头像）、`listCampusWall`（同校过滤 §8.1.4）、`getPostV2`、`likePostV2`、`createCommentV2`（楼中楼，SquarePostComment）、`reportPost`（举报置 isHidden §8.1.7）；旧 `CouplePost` 方法在迁移 12 完成后停用、旧端点下线。
  - `apps/api/src/square/square.controller.ts`：新增 `/square/v2/posts`（POST）、`/square/v2/recommend`、`/square/v2/campus-wall`、`/square/v2/posts/:id`、`/square/v2/posts/:id/{like,comments,report}`（§8.1.5）。
  - `apps/api/src/square/dto/square.dto.ts`：新增 `CreatePostV2Dto`（board `@IsEnum`、title?、content、images?、anonymous?、tags?）、`ReportPostDto`。
  - `apps/api/src/square/square.module.ts`：注入 `AdminUsersService`（getAdminScope 供官方发帖鉴权）。
- **后端后管（官方侧 + 角色体系）**
  - `apps/api/src/admin/admin-users.service.ts`（新建）：`createAdminUser`/`updateAdminUser`（仅 SUPER 改 role/schoolId）/`listAdminUsers`/`getAdminScope`（§8.1.3）。
  - `apps/api/src/admin/admin.controller.ts`：扩展 `POST/GET/PUT/DELETE /admin/users`；新增 `POST /admin/square/posts`（`createOfficialPost`：scope 校验、STUDENT_UNION 限本校、SPONSOR 强制 isSponsored）、`DELETE /admin/square/posts/:id`（下架）。
  - `apps/api/src/admin/dto/`（新建）：`CreateAdminUserDto`/`UpdateAdminUserDto`/`CreateOfficialPostDto`。
- **前端 H5（apps/h5）**
  - `apps/h5/index.html`：`#tab-square` 顶部两段 `[推荐 | 校园墙]`；`#square-feed` `space-y-12`→`space-y-6`；`openNewPost` 弹层加发帖去向单选 + 匿名开关 + 学校标注（§6.11）。
  - `apps/h5/src/modules/square.js`：`switchSquareTab(recommend|campus_wall)`、`loadSquarePosts`（按 tab 调 v2 端点）、`renderSquareFeed`（按 authorType+board 分发大/中/小卡）、`postAuthorDisplay`（匿名渲染）、小卡网格 `gap-4`→`gap-3`、`submitNewPost`（带 board/anonymous）、`like/comment/detail` 改调 v2。
  - `apps/h5/src/state.js`：`S.squareTab`/`S.squarePosts`/`S.newPostBoard`/`S.newPostAnonymous`（§6.11）。
- **前端后管（apps/admin-web）**
  - 后管账号管理（用户管理页同级新增）：角色下拉 + 学校选择（STUDENT_UNION 必选）+ 组织名 + isActive toggle。
  - `apps/admin-web/src/app/(dashboard)/square/post/page.tsx`（新建）：官方发帖界面（board + authorType 锁定 + 学校 + 内容 + Sponsored）。
  - `apps/admin-web/src/lib/api.ts`：`createAdminUser`/`updateAdminUser`/`listAdminUsers`/`createOfficialPost` 封装。
- **测试**
  - `apps/api/src/square/test/square.service.spec.ts`（新建）：v2 发帖去向、推荐混排、校园墙同校过滤、匿名脱敏、官方发帖权限边界、举报隐藏；**情侣帖迁移**（`coupleMatchId` 非空帖返回双方 profile、双头像渲染数据完整）。

**验收用例**

1. **发帖去向**：用户发帖选「推荐」→ `board=RECOMMEND`，进推荐 tab 小卡；选「校园墙」→ `board=CAMPUS_WALL`，进校园墙 tab 中卡。
2. **三卡渲染**：推荐 tab 同时出现个人小卡（双列）+ 官方大卡（每 5 小卡插 1，pinned 置顶）+ 偶尔提上来的校园墙中卡；校园墙 tab 仅本校中卡 + 本校学生会大卡。
3. **同校过滤（规则 5）**：A（复旦）与 B（北大）各发校园墙帖；A 的校园墙 tab 只见复旦帖，B 只见北大帖；无学校信息的用户校园墙为空 + 引导补全。
4. **学校标注（规则 6）**：每张卡右上角显示发布者学校。
5. **匿名（规则 7）**：匿名帖在两 tab 均显示「匿名同学」+ 占位头像，但学校照常；接口不下发匿名作者 id/昵称/头像。
6. **后管联动（规则 9）**：SUPER 可建/改任意 role 账号；STUDENT_UNION 仅能发本校官方帖（发他校被拒）；TEAM/SPONSOR 跨校；非官方 role / isActive=false 发官方帖被拒（403）。
7. **Sponsored（规则 10）**：SPONSOR 帖 `isSponsored=true`，前端显示 "Sponsored" 标识。
8. **推荐排序（规则 8）**：高赞 + 同校 + 新帖排序靠前（验证 score 公式 §8.1.4）；官方按权重插入，pinned 永远首位。
9. **间距（规则 11）**：`#square-feed` 间距由 3rem 降为 1.5rem，小卡网格 gap 由 1rem 降为 0.75rem。
10. **审核（§8.1.7）**：举报累计达阈值或后管下架后帖子 `isHidden=true`，他人列表不再返回，发帖者仍可见。
11. **旧情侣帖迁移（§8.1.6 / 迁移 12）**：迁移 12 跑通后，原 `CouplePost`（情侣帖 + 单人帖 + demo）全部出现在推荐 tab 为 `SquarePost` 普通帖；情侣帖（`coupleMatchId` 非空）仍展示双头像；评论 / 点赞计数与原帖一致；迁移校验断言（帖/情侣帖/评论/点赞条数逐项相等）通过；旧 `CouplePost` 表停写、旧 `square` 端点已下线。

> **✅ §8.1.6 的 5 项关键决策已定稿**：旧情侣帖**迁移进 SquarePost + 旧表废弃**（`coupleMatchId` 保留双头像）、校园墙「人人可发 + 仅同校可见 + 无 school 禁发」、官方账号发布即生效 / 个人帖举报 ≥3 自动隐藏待审、间距减半（`space-y-6` / `gap-3`）、推荐 MVP 三信号（热度+同校+新鲜度，`tags` 仅占位、关注/兴趣召回列为后续迭代）——本阶段直接照此落地，无需再等确认。

### 阶段 8 — 增强模式（付费能量系统）｜依赖：阶段 1（数据模型）+ 阶段 2（匹配引擎）+ 阶段 5（前端整合）

> J 规则 / §10。可在阶段 2/5 已落地后并行开发；支付渠道对接为后续独立子阶段（本期 mock）。

**改动文件**
- `apps/api/prisma/schema.prisma`：追加 `EnergyBalance`/`EnergyTransaction` model + `EnergyTxType` enum；`Match` 加 `enhancedMode`/`enhancedUserEnergy`/`enhancedAttemptedAt`；`UserMatchPreferences` 加 `enhancedModeEnabled`/`friendEnhancedCells`（§10.1）。
- `apps/api/prisma/migrations/20240613_07_add_energy_system/`、`..._08_add_match_enhanced_fields/`、`..._09_add_prefs_enhanced_fields/`：§10.1 迁移 SQL（编号续接 §2.3 的 6 个迁移）。
- `apps/api/src/energy/`（新建模块）：`energy.module.ts` / `energy.service.ts`（`getAvailableEnergy`/`consumeInTx`/`refund`/`recharge`/`claim`/`listTransactions`）/ `energy.controller.ts`（`GET /energy/balance`、`POST /energy/purchase` + `/purchase/confirm`、`POST /energy/claim`、`GET /energy/transactions`，§10.4）。
- `apps/api/src/matching/matching.service.ts`：`startMatchForUser` 加 `enhanced/friendCells` + 预扣（§3.4/§10.2）；`executeMatchJob` 增强强配 + 空池退款（§3.4/§3.6/§10.3）；注入 `EnergyService`。
- `apps/api/src/matching/matching.controller.ts`：`POST /matching/start` body/query 加 `enhanced/friendCells`。
- `apps/api/src/matching/providers/match-model.interface.ts`：`CandidateProfile.enhanced/enhancedCost`、`MatchResult.pairs[].enhanced/enhancedCost`、`MatchResult.emptyPoolUserIds`（§10.3）。
- `apps/api/src/matching/providers/scoring-match-model.provider.ts`：两阶段配对（增强无视阈值强配 + 空池标记，§10.3）。
- `apps/api/src/matching/match.scheduler.ts`：（可选）`EXPIRED` 增强配对 48h 退款开关（§10.3，默认关）。
- `apps/api/src/matching/test/matching.service.spec.ts`（**补增强模式单测**，承接阶段 2 已有用例）：必须覆盖以下边界——
  - **增强强配无视阈值**：增强方池中最高分 < 75 仍被强配（恋人 1 个 / 朋友 Top-N）。
  - **空池退款**：排除自己后 `valid.length===0` → `emptyPoolUserIds` 含该用户 + `refund(..., 'empty_pool')`（单人池、全员增强互配、增强用户多于候选三种边界）。
  - **朋友档位不足 N 不退**：`friendCells=5` 但池只有 2 个可配 → 配 2 个、5 格不退（验收用例 10）。
  - **增强 × 普通混合硬约束（验收用例 13）**：女方有 `preferredGender` 被开增强的男方强配 → **被拦截**（能配的另一对照例成对）；女方有 `ageMin/ageMax` 被超龄的开增强男方强配 → **被拦截**；普通方无偏好时增强方可强配（即使 < 75）。即 `passesHardConstraintsForNormalSide(增强方, 普通方)` 为 false 时不成对。
  - **48h 退款开关**：`refundOnExpire=false`（默认）EXPIRED 不退、无 `energy_refunded`；`=true` 时 EXPIRED 同事务追加 `refund(..., 'unconfirmed_48h')` 且幂等（重复扫描不重复退）。
- 前端（apps/h5）：`state.js`（§6.1 `S.energy/S.enhanced`）；`index.html`（Profile 能量条 + 购买 overlay + match setting 增强开关，§6.4/6.10/§10.5）；`profile.js`（能量条/购买，§6.10）；`match.js`（增强开关 + 进池透传，§6.2/6.4）。

**验收用例**
1. 余额：`GET /energy/balance` 返回 `{ totalEnergy, usedEnergy, availableEnergy }`；新用户领取（claim registration）后 +1 格。
2. 充值（mock）：`POST /energy/purchase` → `/purchase/confirm` 后 `availableEnergy` 增加，写一条 `RECHARGE` 流水。
3. 恋爱增强：能量≥3 时 `startMatch('romantic', enhanced=true)` 预扣 3 格（CONSUME 流水，`usedEnergy+=3`）；能量<3 被拒「能量不足」。
4. 朋友增强档位：`friendCells=N(1–5)` 预扣 N 格，本轮**保证配到 N 个朋友**（无视 75 分阈值）。
5. 强配无视阈值：增强用户即便池中最高分 < 75 也被强配；普通用户仍受 75 阈值与硬约束约束。
6. 空池退款：增强用户本轮池中无任何其它可配对象（排除自己后 `valid.length===0`）→ 自动 `REFUND`（`usedEnergy-=cost`）+ 通知 `energy_refunded`（`metadata.refundReason='empty_pool'`、`matchId=null`），收到时机 = cron 跑完本轮、无对话产生（§3.6/§10.3）。
7. 跨模式独立：恋人增强与朋友增强开关/消耗互不影响；可同模式各自开启。
8. 流水：`GET /energy/transactions` 分页返回 RECHARGE/CONSUME/REFUND/CLAIM，`balanceAfter` 与实际余额一致。
9. 前端：Profile 顶部能量格渲染正确；match setting 增强开关（恋人 checkbox / 朋友滑块 1–5）；能量不足禁用并引导充值；退款通知刷新余额。
10. **朋友档位不足 N 不退（J 规则 6/7 边界，§10.3 L2208-2209）**：`friendCells=5` 预扣 5 格，但本轮池中仅 2 个可配朋友 → 强配 **2 个**（已配视为达成），**5 格全部消费、不退任何格**（`usedEnergy` 仍 +5，无 REFUND 流水）；仅当 `valid.length===0`（完全空池）才整笔退还（用例 6）。区分点：池中有 ≥1 个可配对象即视为「配到」，不按「配满 N」退差额。
11. **48h 未确认退款开关 = 关（默认，§3.5/§10.3）**：增强已配上对象但 48h 内未双确 → `EXPIRED` + `match_expired` 通知；预扣能量**不退**（无 REFUND 流水，`usedEnergy` 不变），**不产生 `energy_refunded` 通知**。
12. **48h 未确认退款开关 = 开（`SystemConfig.energy.refundOnExpire=true`，可选，§10.3）**：同场景下 `expireUnconfirmedMatches` 置 `EXPIRED` 的同一事务内对 `enhancedMode != null` 的 Match 追加 `REFUND`（金额=`enhancedUserEnergy`，`relatedMatchId` 非空、幂等）+ 通知 `energy_refunded`（`metadata.refundReason='unconfirmed_48h'`），与 `match_expired` **同一时刻**下发；重复扫描因幂等不重复退。
13. **增强 × 普通混合硬约束（风险 #20，§3.6 L1312）**：① 女方设 `preferredGender=female`，被开增强的男方强配 → **被拦截不成对**（普通方性别偏好生效，男方需另寻满足其偏好者）；② 女方设 `ageMin/ageMax` 但男方年龄超范围，男方开增强强配 → **被拦截**（普通方年龄硬约束生效）；③ 普通方无性别/年龄偏好（朋友默认不限）时，增强方可强配该普通方（即使分数 < 75）；④ 增强方自身**无视 75 分阈值与自身硬约束**，但**对方为普通方时其硬约束始终生效**——确保不破坏普通用户体验。

---

## 10. 增强模式（付费能量系统）

> **J 规则的完整实现章。** 增强模式是双模式系统之上的**付费增值层**：用户用「能量（按格计）」换取「本轮保证匹配到对象」。本章自洽于：§2 数据模型、§3 匹配流程状态机、§1.5 业务规则；**与 §1.5 J 条冲突时以 §1.5 为准**。

### 10.0 业务规则（与 §1.5 J 一致，复述供本章自查）

1. **开关**：match setting 内选择是否启用增强（**恋爱 / 朋友各自独立开关**，挂在各自的 `UserMatchPreferences`）。
2. **能量**：虚拟资源，**按"格"计**。来源 = 充值为主 + 少量免费（签到 / 新人赠送 / 任务）。
3. **展示与入口**：Profile **顶部一行**显示剩余能量格（每格一个方块/图标），**点进购买页充值**。
4. **消耗**：恋爱开增强 = **固定扣 3 格**；朋友开增强 = 用户**可选 1–5 格**，N 格 = **保证匹配到 N 个朋友**。
5. **效果**：不开增强本轮**可能 no_match**；开增强**保证本轮一定匹配到**（恋爱 1 个 / 朋友 N 个）。
6. **保证机制**：增强用户**无视 75 分阈值**强配最接近者（恋爱最高分 1 个 / 朋友 Top-N）；**空池**（池中确无任何可配对象）则**退还能量 + 通知**。
7. **扣费时机**：**加入匹配池时预扣**；空池则**退还**。
8. **跨模式**：恋爱、朋友各自独立开关与消耗，互不影响。

> 支付渠道（微信 / 支付宝 / Stripe）**本期不定**，先做能量账户 + 消耗/退还 + 充值接口（mock / 预留对接点）。

### 10.1 数据模型（追加到 §2.2，迁移续接 §2.3）

> 以下 model/enum 已写入 §2.2 目标全文（`EnergyTxType`、`EnergyBalance`、`EnergyTransaction`、`Match` 三字段、`UserMatchPreferences` 两字段）。此处汇总语义 + 给出**新增迁移 7/8/9**（编号续接 §2.3 的 1–6）。

**能量账户字段语义**

- `EnergyBalance`：`userId @unique` 一对一 User；`totalEnergy`（累计充值+赠送，只增）；`usedEnergy`（已消耗，CONSUME 时 +=，REFUND 时 -=）。**可用能量 `availableEnergy = totalEnergy - usedEnergy`** 在应用层计算（不落库，避免双写漂移）。
- `EnergyTransaction`（流水/单据，**只增不改**）：`type`（RECHARGE/CONSUME/REFUND/CLAIM）；`amountEnergy`（变动格数，恒正）；`balanceAfter`（交易后**可用余额**快照，对账）；`relatedMatchId?`（CONSUME/REFUND 关联 Match）；`relatedMatchMode?`（"romantic"|"friend"）；`reason?`；`metadata?`（如 `{ rechargeMethod, orderId, packageId, transactionId }`）。
- `Match.enhancedMode?`（null|"romantic"|"friend"，标记该配对是否由增强发起）；`Match.enhancedUserEnergy?`（该配对消耗/预扣格数，退款依据）；`Match.enhancedAttemptedAt?`（增强配对时刻，退款窗口锚点，通常 = createdAt）。
- `UserMatchPreferences.enhancedModeEnabled`（该模式是否启用增强，默认 false）；`UserMatchPreferences.friendEnhancedCells?`（朋友档位 1–5，= 保证匹配的朋友数 N；恋人忽略，固定 3）。

**迁移 7 — `20240613_07_add_energy_system`**

```sql
CREATE TYPE "EnergyTxType" AS ENUM ('RECHARGE','CONSUME','REFUND','CLAIM');

CREATE TABLE "energy_balances" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "totalEnergy" INTEGER NOT NULL DEFAULT 0,
  "usedEnergy"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

CREATE TABLE "energy_transactions" (
  "id"               TEXT PRIMARY KEY,
  "userId"           TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type"             "EnergyTxType" NOT NULL,
  "amountEnergy"     INTEGER NOT NULL,
  "balanceAfter"     INTEGER NOT NULL,
  "relatedMatchId"   TEXT,
  "relatedMatchMode" TEXT,
  "reason"           TEXT,
  "metadata"         JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "et_user_created_idx"  ON "energy_transactions"("userId","createdAt");
CREATE INDEX "et_related_match_idx" ON "energy_transactions"("relatedMatchId");

-- 为存量用户初始化空账户（可选；也可懒创建：首次访问 /energy/balance 时 upsert）
INSERT INTO "energy_balances" ("id","userId","totalEnergy","usedEnergy","createdAt","updatedAt")
SELECT gen_random_uuid()::text, "id", 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "users"
ON CONFLICT ("userId") DO NOTHING;
```

**迁移 8 — `20240613_08_add_match_enhanced_fields`**

```sql
ALTER TABLE "matches"
  ADD COLUMN "enhancedMode"        TEXT,
  ADD COLUMN "enhancedUserEnergy"  INTEGER,
  ADD COLUMN "enhancedAttemptedAt" TIMESTAMP(3);
```

**迁移 9 — `20240613_09_add_prefs_enhanced_fields`**

```sql
ALTER TABLE "user_match_preferences"
  ADD COLUMN "enhancedModeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "friendEnhancedCells" INTEGER DEFAULT 1;
```

> 执行纪律同 §2.3：先备份、staging 验证；这三个迁移无枚举跨事务问题，可单目录依次执行。

### 10.2 能量服务（EnergyService）+ 消耗/退还流程

> 新建模块 `apps/api/src/energy/`（`energy.module.ts` / `energy.service.ts` / `energy.controller.ts`）。`EnergyService` 被 `MatchingService` 注入（§3.4）。**核心不变量：`availableEnergy = totalEnergy - usedEnergy >= 0` 恒成立；每笔变动写一条 `EnergyTransaction`。**

```ts
// energy.service.ts（函数签名与伪代码）
export const ENERGY_COST_ROMANTIC = 3;
export const FRIEND_CELLS_MIN = 1, FRIEND_CELLS_MAX = 5;

// 懒创建账户
private async ensureBalance(tx, userId: string) {
  return tx.energyBalance.upsert({
    where: { userId }, create: { userId, totalEnergy: 0, usedEnergy: 0 }, update: {},
  });
}

// 可用能量
async getAvailableEnergy(userId: string): Promise<number> {
  const b = await this.ensureBalance(this.prisma, userId);
  return b.totalEnergy - b.usedEnergy;
}

// 预扣（CONSUME）——在 startMatch 的同一事务内调用（§3.4）
async consumeInTx(tx, userId: string, cost: number, mode: ModeStr,
                  matchId: string | null, reason: string) {
  const b = await this.ensureBalance(tx, userId);
  const available = b.totalEnergy - b.usedEnergy;
  if (available < cost) throw new BadRequestException('能量不足，请充值');
  const updated = await tx.energyBalance.update({
    where: { userId }, data: { usedEnergy: { increment: cost } } });
  await tx.energyTransaction.create({ data: {
    userId, type: 'CONSUME', amountEnergy: cost,
    balanceAfter: updated.totalEnergy - updated.usedEnergy,
    relatedMatchId: matchId, relatedMatchMode: mode, reason } });
}

// 退还（REFUND）——空池（§3.6）或 48h 未确认（可选，§10.3）。幂等：同 matchId+REFUND 不重复
// refundReason 区分两类场景：'empty_pool'（空池，默认必退）| 'unconfirmed_48h'（48h 未确认，可选开关）
// 供前端按 metadata.refundReason 渲染不同文案（§6.6）；matchId 为 null（空池无 Match）/ 非 null（48h 已配上）
async refund(userId: string, mode: ModeStr, cost: number,
             matchId: string | null, reason: string,
             refundReason: 'empty_pool' | 'unconfirmed_48h' = 'empty_pool') {
  return this.prisma.$transaction(async (tx) => {
    if (matchId) { // 幂等去重
      const dup = await tx.energyTransaction.findFirst({
        where: { relatedMatchId: matchId, type: 'REFUND' } });
      if (dup) return;
    }
    const b = await this.ensureBalance(tx, userId);
    const dec = Math.min(cost, b.usedEnergy); // 不退超过已用，防 usedEnergy 转负
    const updated = await tx.energyBalance.update({
      where: { userId }, data: { usedEnergy: { decrement: dec } } });
    await tx.energyTransaction.create({ data: {
      userId, type: 'REFUND', amountEnergy: dec,
      balanceAfter: updated.totalEnergy - updated.usedEnergy,
      relatedMatchId: matchId, relatedMatchMode: mode, reason } });
    // 通知 metadata 带 refundReason，前端据此渲染「空池」/「48h 未确认」两类文案（§6.6）
    await tx.notification.create({ data: {
      userId, type: 'energy_refunded', title: '能量已退还',
      body: `${reason}，已退还 ${dec} 格能量。`,
      metadata: { mode, energy: dec, refundReason, matchId } } });
  });
}

// 充值（RECHARGE）——支付回调验签成功后入账（§10.4）
async recharge(userId: string, cells: number, metadata: any) {
  return this.prisma.$transaction(async (tx) => {
    const b = await this.ensureBalance(tx, userId);
    const updated = await tx.energyBalance.update({
      where: { userId }, data: { totalEnergy: { increment: cells } } });
    await tx.energyTransaction.create({ data: {
      userId, type: 'RECHARGE', amountEnergy: cells,
      balanceAfter: updated.totalEnergy - updated.usedEnergy,
      reason: `充值 ${cells} 格`, metadata } });
    return updated.totalEnergy - updated.usedEnergy;
  });
}

// 免费领取（CLAIM）——registration / daily-checkin / task-complete，防重放
async claim(userId: string, claimType: 'registration'|'daily-checkin'|'task-complete') {
  // 防重放：registration 仅一次；daily-checkin 当天仅一次；task-complete 按任务键去重
  // 命中已领取 → BadRequestException('今日已领取' / '已领取')
  // 否则按规则 grantedEnergy（registration=1 / checkin=1 / task=1~3），走 recharge 同款入账（type=CLAIM）
}
```

**消耗/退还时序（与 §3 衔接）**

```
开增强加入池(startMatch)
  └─[同一事务]─ UMS→searching + UMP.enhancedModeEnabled=true(+friendEnhancedCells) + CONSUME 预扣 cost
                    │
                cron 跑 executeMatchJob(mode)
                    ├─ 配上(强配)：创建 Match{enhancedMode,enhancedUserEnergy=cost,enhancedAttemptedAt} → 临时对话 → 走 §3.1/§3.2 双确认
                    │     └─ 48h 内双确 → 永久（能量不再变动，预扣保留=正常消费）
                    │     └─ 48h 未双确 → EXPIRED（默认不退；可选开关退，§10.3）
                    └─ 空池(池中无任何其它可配对象)：emptyPoolUserIds → REFUND cost + 通知 energy_refunded
```

### 10.3 对匹配算法的改动（ScoringMatchModelProvider + interface）

**接口扩展**（`match-model.interface.ts`）：
- `CandidateProfile` 加：`enhanced: boolean`（= `UMP.enhancedModeEnabled`）、`enhancedCost: number`（恋人=3 / 朋友=`friendEnhancedCells`）。
- `MatchPair` 加：`enhanced?: boolean`、`enhancedCost?: number`。
- `MatchResult` 加：`emptyPoolUserIds: Array<{ userId: string; mode: ModeStr; cost: number }>`。

**两阶段配对**（`generateMatches`，伪代码）：

```ts
generateMatches(candidates: CandidateProfile[], constraints): MatchResult {
  const mode = constraints.mode;
  const enhancedUsers = candidates.filter(c => c.enhanced);
  const matched = new Set<string>();           // 已占用 userId（无向去重）
  const pairs: MatchPair[] = [];
  const emptyPoolUserIds: any[] = [];

  // ── 阶段一：增强用户强配（无视 75 分阈值） ──
  for (const e of enhancedUsers) {
    // 候选 = 所有其他人（排除自己 + 已占用）；普通方硬约束仍生效（性别/年龄等）
    const valid = candidates
      .filter(c => c.userId !== e.userId && !matched.has(c.userId)
                && passesHardConstraintsForNormalSide(e, c))   // 对方若为普通方，其偏好须满足
      .map(c => ({ c, score: calculatePairScore(e, c) }))
      .sort((a, b) => b.score - a.score);

    if (valid.length === 0) {                    // 空池（J 规则 6/7）→ 退款
      emptyPoolUserIds.push({ userId: e.userId, mode, cost: e.enhancedCost });
      continue;
    }
    if (mode === 'romantic') {                   // 恋爱：保证 1 个（取最高分，即使 < 75）
      const top = valid[0];
      pairs.push({ userAId: e.userId, userBId: top.c.userId, score: top.score,
                   enhanced: true, enhancedCost: ENERGY_COST_ROMANTIC });
      matched.add(e.userId); matched.add(top.c.userId);
    } else {                                      // 朋友：保证 Top-N（N=enhancedCost，1–5）
      const topN = valid.slice(0, e.enhancedCost);
      for (const { c, score } of topN) {
        if (matched.has(c.userId)) continue;
        pairs.push({ userAId: e.userId, userBId: c.userId, score,
                     enhanced: true, enhancedCost: e.enhancedCost });
        matched.add(c.userId);
      }
      matched.add(e.userId);
      // 注：若 valid 不足 N（如池子小），尽量配满，已配的视为达成；不足部分不退（已配到 ≥1）。
      //     仅当 valid.length===0（完全空池）才整笔退还，这是 §1.5 J 的口径。
    }
  }

  // ── 阶段二：普通用户走现有阈值算法（threshold=75 不变） ──
  const remaining = candidates.filter(c => !c.enhanced && !matched.has(c.userId));
  const normalPairs = mode === 'romantic'
    ? greedyMatch(remaining, SCORE_THRESHOLD)            // maxMatchesPerUser=1
    : multiMatch(remaining, SCORE_THRESHOLD, /*topN*/ 5);// 朋友 ≤5（§3.6）
  pairs.push(...normalPairs.map(p => ({ ...p, enhanced: false })));

  return { pairs, emptyPoolUserIds, /* ...原有字段 */ };
}
```

**与 75 分阈值的关系**：
- 普通用户配对：**继续用 75 分阈值**（不变）。
- 增强用户配对：**完全绕过阈值**，从池中取最高分强配（即使低分也配）。
- **增强 × 普通**：增强方可强配，但**普通方的偏好硬约束仍生效**（性别偏好、年龄范围、同城/同校等）——不破坏普通用户体验（风险 #20）。

**空池判定**（风险 #21）：`valid.length === 0`（排除自己与已占用后**无任何**可配对象）才算空池退款。池中只剩增强用户自己 = 空池。单测须覆盖单人池、全员增强互配、增强用户多于候选等边界。

**48h 未确认退款（可选开关，与 §3.5 联动）**：
- 默认（§1.5 J）：增强一旦**配上**即视为消费，48h 未双确 `EXPIRED` **不退**。
- 可选（深化设计 JSON 的更宽松口径）：在 `expireUnconfirmedMatches`（§3.5）置 `EXPIRED` 的同一事务内，对 `enhancedMode != null` 的 Match 追加 `refund(发起方, enhancedMode, enhancedUserEnergy, matchId, '增强配对48h未确认退还', 'unconfirmed_48h')`。用 `SystemConfig` 开关（如 `energy.refundOnExpire`）控制，**默认 false**，产品确认后再开。
- **两类退款的 `refundReason` 与前端 UX**（§6.6）：`refund` 第 6 参 `refundReason` 区分两类——空池退还传 `'empty_pool'`（默认必有，cron 跑完即下发，无对话产生），48h 未确认退还传 `'unconfirmed_48h'`（仅开关开启时，随 `EXPIRED` 同时下发，配对 48h 后）。两类均落 `Notification(type='energy_refunded')`，`metadata.refundReason` 供前端渲染不同文案；开关关闭时 `'unconfirmed_48h'` 通知永不产生，前端无需感知开关。

### 10.4 后端 API（energy.controller.ts）

> 路由前缀 `/energy`，均需登录（`@CurrentUser`）。

**1. `GET /energy/balance`** → `{ totalEnergy, usedEnergy, availableEnergy }`

```jsonc
{ "data": { "totalEnergy": 31, "usedEnergy": 3, "availableEnergy": 28 } }
```

**2. `POST /energy/purchase`** — 入参 `{ packageId: "pkg_30" | "pkg_60" | "pkg_100" }`

充值方案（前端常量 / 也可 `GET /energy/packages` 暴露）：

| packageId | 能量格 | 价格（参考） | 说明 |
|---|---|---|---|
| `pkg_30`  | 30  | ¥30 / $4 / £3 | 基础 |
| `pkg_60`  | 60  | ¥58 / $8      | 优惠约 3.3% |
| `pkg_100` | 100 | ¥88 / $12     | 优惠约 2.6% |

支付流程（**本期 mock / 预留对接点**）：
- a. 后端生成订单（可复用 `metadata`/独立 Order 表，本期可仅记 `metadata.orderId`）；
- b. 返回 `paymentIntent`（支付宝/微信二维码串 或 Stripe `clientSecret`）；本期 mock 直接返回 `{ mock: true }`；
- c. 前端唤起支付 SDK / 显示二维码；
- d. 支付完成回调 **`POST /energy/purchase/confirm`** `{ orderId, transactionId }`；
- e. 后端验签成功 → `EnergyService.recharge(userId, cells, { rechargeMethod, orderId, transactionId, packageId })`（写 RECHARGE 流水 + `totalEnergy += cells`）。

返回（confirm 后）：`{ success: true, availableEnergy: 58, transactionId: "..." }`

> 本期 mock：可让 `POST /energy/purchase` 直接走 recharge 并返回新余额，跳过 c/d；接口签名仍按上面保留，渠道对接期只换实现（验签 + 异步回调）。

**3. `POST /energy/claim`** — 入参 `{ claimType: "registration" | "daily-checkin" | "task-complete" }`

- `registration`：注册后首次赠送 1 格（自动或手动领取，仅一次）。
- `daily-checkin`：每日 00:00 后可领 1 格（24h 一次）。
- `task-complete`：完成任务（如填完朋友问卷）奖励 1–3 格。
- **防重放**：检查 `EnergyTransaction` 是否已有今日/同任务的 CLAIM 记录。

返回：`{ success: true, grantedEnergy: 1, availableEnergy: 29 }`

**4. `GET /energy/transactions?page=1&limit=20`** → 分页流水

```jsonc
{ "data": { "items": [
  { "type": "CONSUME", "amountEnergy": 3, "balanceAfter": 28,
    "relatedMatchId": "ck...", "relatedMatchMode": "romantic",
    "reason": "恋爱增强预扣3格", "createdAt": "2026-06-13T08:00:00.000Z" },
  { "type": "RECHARGE", "amountEnergy": 30, "balanceAfter": 31,
    "reason": "充值 30 格", "createdAt": "2026-06-13T07:50:00.000Z" }
], "total": 12, "page": 1, "limit": 20 } }
```

**退款通知（§6.6 联动）**：空池退还时 `EnergyService.refund` 写一条 `Notification(type='energy_refunded')`，前端通知中心 / Chat 顶部展示「本轮无可配对象，已退还 N 格能量」。

**匹配端点变更（§3.4/§6.7）**：`POST /matching/start` body/query 加 `enhanced: boolean` 与 `friendCells?: 1..5`，转发给 `startMatchForUser(userId, mode, enhanced, friendCells)`。

### 10.5 前端实现（apps/h5）

> 状态字段见 §6.1（`S.energy`/`S.enhanced`/`S.energyPackages`）；落地点见 §6.4（增强开关）、§6.10（能量条 + 购买页）。本节给 HTML / JS 片段。

**(1) Profile 顶部能量条**（index.html，「我的」页顶部，§6.8 删除入口之上）：

```html
<div id="profile-energy-section" class="px-6 py-4 bg-surface-container-low rounded-lg">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-neon">flash_on</span>
      <span class="font-label text-xs font-bold tracking-widest">ENERGY</span>
    </div>
    <div id="energy-display" class="flex gap-1"><!-- 动态渲染格子 --></div>
    <button class="text-neon text-xs font-bold hover:underline" onclick="openEnergyModal()">Buy</button>
  </div>
</div>
```

**(2) 充值购买 overlay**（`#modal-energy-purchase`）：

```html
<div id="modal-energy-purchase" class="overlay">
  <div class="overlay-content max-w-sm">
    <h2 class="font-headline text-xl mb-4">Get Energy</h2>
    <div class="grid grid-cols-3 gap-3">
      <button class="energy-package" data-pkg="pkg_30"><span class="text-2xl font-bold">30</span><span class="text-xs text-outline">¥30</span></button>
      <button class="energy-package" data-pkg="pkg_60"><span class="text-2xl font-bold">60</span><span class="text-xs text-outline">¥58</span></button>
      <button class="energy-package" data-pkg="pkg_100"><span class="text-2xl font-bold">100</span><span class="text-xs text-outline">¥88</span></button>
    </div>
    <div id="payment-methods" class="mt-6 space-y-2">
      <button class="w-full btn-secondary" onclick="selectPaymentMethod('wechat')">WeChat Pay</button>
      <button class="w-full btn-secondary" onclick="selectPaymentMethod('alipay')">Alipay</button>
      <!-- 本期 mock：选档位后直接 confirm；渠道对接期换真实 SDK -->
    </div>
  </div>
</div>
```

**(3) match setting 增强开关**（filter-overlay 内，§6.4；按 mode 渲染）：

```html
<div class="match-setting-item">
  <h3 class="font-label text-xs font-bold tracking-widest mb-2">✨ 增强模式</h3>
  <div class="flex items-center gap-4">
    <input type="checkbox" id="enhance-toggle" onchange="toggleEnhance(currentMode())">
    <label for="enhance-toggle" class="text-xs font-medium" id="enhance-label">
      <!-- 恋人：使用增强模式（消耗3格能量） / 朋友：启用朋友增强保底 -->
    </label>
  </div>
  <!-- 朋友模式且已开增强时显示 1–5 滑块 -->
  <div id="friend-cells-wrap" class="mt-3 hidden">
    <label class="text-xs font-label font-bold tracking-widest">
      GUARANTEE: <span id="friend-cells-display">1</span> friends
    </label>
    <input type="range" min="1" max="5" id="friend-cells-slider" class="w-full"
           oninput="updateFriendCells(this.value)">
    <div class="text-[10px] text-outline mt-1">Cost: <span id="friend-cells-cost">1</span> energy cells</div>
  </div>
</div>
```

**(4) profile.js — 能量条渲染**：

```js
async function loadEnergyBar() {
  const res = await window.api('/energy/balance');
  const d = res.data || res;
  S.energy = d;
  const box = document.getElementById('energy-display');
  if (!box) return;
  box.innerHTML = '';
  const show = Math.min(d.availableEnergy, 10);   // 最多渲染 10 格
  for (let i = 0; i < show; i++) {
    const cell = document.createElement('div');
    cell.className = 'w-3 h-3 bg-neon rounded-sm';
    box.appendChild(cell);
  }
  if (d.availableEnergy > 10) {                    // 超出显示 +N
    const more = document.createElement('span');
    more.className = 'text-[10px] text-outline ml-1';
    more.textContent = `+${d.availableEnergy - 10}`;
    box.appendChild(more);
  }
}
function openEnergyModal()  { document.getElementById('modal-energy-purchase')?.classList.add('open'); }
function closeEnergyModal() { document.getElementById('modal-energy-purchase')?.classList.remove('open'); }
```

**(5) match.js — 增强开关 + 进池透传**：

```js
function toggleEnhance(mode) {
  S.enhanced[mode].enabled = !S.enhanced[mode].enabled;
  // 朋友模式显隐 1–5 滑块；能量不足时禁用并提示去充值
  updateEnhanceUI(mode);
  const cost = mode === 'romantic' ? 3 : S.enhanced.friend.cells;
  if (S.enhanced[mode].enabled && S.energy.availableEnergy < cost) {
    toast('能量不足，去充值'); openEnergyModal();
  }
}
function updateFriendCells(v) {
  S.enhanced.friend.cells = +v;
  document.getElementById('friend-cells-display').textContent = v;
  document.getElementById('friend-cells-cost').textContent = v;
}
// 点「开始匹配」时透传 enhanced/friendCells
async function startMatch(mode) {
  const enhanced = S.enhanced[mode].enabled;
  const friendCells = mode === 'friend' ? S.enhanced.friend.cells : undefined;
  await window.api('/matching/start?mode=' + mode, { method: 'POST',
    body: { enhanced, friendCells } });
  // 成功后刷新能量（预扣已发生）+ 匹配状态
  await loadEnergyBar(); await loadMatchTab();
}
```

> 退款通知（`energy_refunded`）到达后调用 `loadEnergyBar()` 同步余额（§6.6）。

### 10.6 对账与一致性（运维）

- **不变量**：任一时刻 `availableEnergy = totalEnergy - usedEnergy >= 0`；`SUM(RECHARGE+CLAIM amountEnergy) = totalEnergy`；`SUM(CONSUME) - SUM(REFUND) = usedEnergy`。
- **对账脚本**（`apps/api/prisma/verify-energy.ts`，仿 §2.4）：
  - 校验上面三条不变量逐用户成立；
  - 扫**孤儿 CONSUME**：有 `CONSUME` 但对应 Match 不存在/已 EXPIRED 且无 `REFUND` 且非「已配上消费」——人工核查；
  - 扫**重复 REFUND**：同 `relatedMatchId` 出现 >1 条 REFUND（应被 `refund` 幂等拦截）。
- **幂等**：`refund(matchId)` 按 `relatedMatchId+REFUND` 去重（§10.2）；空池退款在 executeMatchJob 内一次性处理，queue 重试时因幂等不会重复退。
- **预扣安全**：预扣与进池在**同一事务**（§3.4），事务失败则连预扣一起回滚，不会「扣了没进池」。

---

## 附：未改动 / 可复用清单

- `Message`、`Question`、`QuestionOption`、`Answer`、`MatchConfig`、`MatchJob`、`Notification`、`Report`、`SystemConfig`、`Profile` 结构不变。（`CouplePost`/`PostComment`/`PostLike` 不在此列——迁移 12 后废弃，见上条。）
- 聊天 `getMessages`/`sendMessage`/`markRead`/`getUnreadCount`/`pollMessages` 逻辑复用，仅放开权限 + touch updatedAt。
- 问卷 `Answer` 提交/查询逻辑复用（type 隐含）。
- 广场 `CouplePost`/`PostComment`/`PostLike` **迁移后废弃**（迁移 12 整体搬入 `SquarePost`/`SquarePostComment`/`SquarePostLike`，随后停写，观察期后单独 drop，§2.7/§8.1.6）；广场主功能改为「推荐 + 校园墙 + 三卡 + 后管联动」（完整设计 §8.1），全部走 `/square/v2`；情侣帖双头像语义由可选 `coupleMatchId` 保留；新 `SquarePost` 发帖**不再校验** `RELATIONSHIP_ROMANTIC`（用户自由发帖）。
- `leaderboard` 后端模块代码保留（前端不暴露，§8.2 选项 A）。
- 前端问卷渲染（SCALE/SINGLE/MULTI/TEXT）、聊天单聊 UI、倒计时/动画工具函数复用。
- **增强模式（§10）为新增层**：新建 `apps/api/src/energy/` 模块（`EnergyBalance`/`EnergyTransaction`），不改动现有匹配以外的表结构；`Match`/`UserMatchPreferences` 仅**追加可空字段**（向下兼容，不开增强即与现状一致）。`Notification` 复用（新增 type `energy_refunded`）。支付渠道对接为后续独立工作（本期 mock，预留 `metadata.rechargeMethod`）。
