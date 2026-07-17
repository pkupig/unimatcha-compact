# Admin 平台重写设计文档（三角色 + 广告商业化）

> 本文档是 admin 重写 + 广告/分成/提现体系的实施蓝本。所有实现必须与本文一致。
> 金额一律以 **分（cents, Int）** 存储，前端以元展示（JetBrains Mono 数字字体）。货币 CNY（£ 场景后续再说，字段留 currency 无必要，MVP 单币种）。

## 0. 已确认的业务决策

1. **计价模式：混合** —— 商家下单时选择 `BUYOUT`（按天包断，单价按学校配置）、`CPM`（千次曝光）、`CPC`（按点击）之一。
2. **分级审核** —— 平台直签商家的广告由平台团队审核；学生会自拉赞助商的广告由该学生会审核，平台拥有最终下架权（suspend）。
3. **分成** —— 每个学校两档分成（基点 bps，0–10000）：`platformShareBps`（平台直签广告，默认 1000 = 10%）、`selfSourcedShareBps`（学生会自拉赞助，默认 3000 = 30%），团队可按校调整。另外团队可直接向学校发放**固定金额赞助额度**（SPONSOR_GRANT）。
4. **范围：全链路** —— 后端 + 三角色 admin 前端 + H5 广场真实广告展示与曝光/点击统计。
5. **支付（MVP）** —— 无真实支付网关。审核通过后订单进入 `PENDING_PAYMENT`，商家线下对公转账，平台团队后台「确认收款」后广告才可上线（与现有 energy 模拟支付思路一致）。
6. **提现（MVP）** —— 学生会绑定银行账户（先记录，不对接银行 API）→ 发起提现 → 团队审核通过 → 线下打款 → 标记已打款。

## 1. 角色与权限

沿用现有 `AdminRole` 枚举，不改值：

| 角色 | 含义 | 范围 |
|---|---|---|
| `SUPER` | 团队·超管 | 一切权限 + 管理员账号 CRUD + 系统配置 |
| `TEAM` | 团队·成员 | 除管理员账号/系统配置外的全部平台权限 |
| `STUDENT_UNION` | 学生会 | 仅本校（绑定 `schoolId` → School.id）|
| `SPONSOR` | 商家/赞助商 | 仅自己的广告与账户；`sourcedBySchoolId` 为 null = 平台直签，否则为某学生会自拉 |

后端新增 `@Roles(...)` 装饰器 + `RolesGuard`（与 `AdminJwtAuthGuard` 组合使用），服务层做范围校验（学生会只能操作本校、商家只能操作自己的 campaign）。

**约束**：学生会自拉的商家（`sourcedBySchoolId != null`）只能投放到其来源学校；平台直签商家可多校投放。学生会可创建/停用自己来源的 SPONSOR 账号；团队可创建全部。

## 2. Prisma 新模型（apps/api/prisma/schema.prisma）

```prisma
enum AdPricingModel { BUYOUT CPM CPC }
enum AdCampaignStatus {
  DRAFT                    // 商家编辑中
  PENDING_UNION_REVIEW     // 学生会自拉商家提交 → 本校学生会审
  PENDING_PLATFORM_REVIEW  // 平台直签商家提交 → 团队审
  REJECTED                 // 驳回（可改后重新提交）
  PENDING_PAYMENT          // 审核通过，等待线下付款 + 团队确认收款
  SCHEDULED                // 已付款，未到 startDate
  ACTIVE                   // 投放中
  PAUSED                   // 商家自暂停（可恢复）
  SUSPENDED                // 平台强制下架（终态，团队可解除回 ACTIVE）
  COMPLETED                // 到期或预算耗尽（终态，触发分成入账）
}
enum LedgerEntryType { AD_SHARE SPONSOR_GRANT WITHDRAWAL ADJUSTMENT }
enum WithdrawalStatus { PENDING APPROVED REJECTED PAID }

model School {
  id                   String  @id @default(cuid())
  name                 String  @unique   // 与 Profile.school / SquarePost.school 字符串相等匹配
  city                 String?
  isActive             Boolean @default(true)
  platformShareBps     Int     @default(1000)
  selfSourcedShareBps  Int     @default(3000)
  buyoutDailyPriceCents Int?   // null = 用全局默认（SystemConfig: ad_pricing_defaults）
  cpmPriceCents        Int?    // 每 1000 次曝光
  cpcPriceCents        Int?
  bankAccountName      String?
  bankName             String?
  bankAccountNo        String?
  createdAt/updatedAt
  placements   AdPlacement[]
  ledger       SchoolLedgerEntry[]
  withdrawals  WithdrawalRequest[]
  admins       AdminUser[]          // 反向：STUDENT_UNION 账号
  sourcedSponsors AdminUser[] @relation("SponsorSource")
}

// AdminUser 增量字段：
//   school   School? @relation(fields: [schoolId], references: [id])  ← schoolId 从"学校名字符串"迁移为 School.id
//   sourcedBySchoolId String?  + sourcedBySchool School? @relation("SponsorSource")
//   contactName String?  contactPhone String?

model AdCampaign {
  id            String @id @default(cuid())
  advertiserId  String           // AdminUser (SPONSOR)
  title         String           // 卡片标题
  content       String @db.Text  // 卡片文案
  images        String[]         // 至少 1 张，H5 大卡展示
  landingUrl    String?          // 点击跳转外链（可空 = 仅详情）
  pricingModel  AdPricingModel
  status        AdCampaignStatus @default(DRAFT)
  startDate     DateTime         // 投放起（含）
  endDate       DateTime         // 投放止（含）
  budgetCents   Int?             // CPM/CPC 必填；BUYOUT 为 null
  totalPriceCents Int @default(0) // BUYOUT=Σ placement 价；CPM/CPC = budgetCents
  spendCents    Int @default(0)  // CPM/CPC 实时累计；BUYOUT 激活即 = totalPrice
  priceSnapshot Json?            // 提交时锁定的各校单价 {schoolId: {buyoutDaily, cpm, cpc}}
  sourcedBySchoolId String?      // 提交时从 advertiser 冗余
  paymentConfirmedByAdminId String?  paymentNote String?  paidAt DateTime?
  unionReviewedByAdminId String?  platformReviewedByAdminId String?
  reviewNote String?  rejectedReason String?
  suspendedAt DateTime?  suspendReason String?
  completedAt DateTime?  settledAt DateTime?   // settledAt = 分成已入账（幂等标记）
  placements  AdPlacement[]
  dailyStats  AdDailyStat[]
  timestamps; index [status, startDate], [advertiserId, createdAt], [sourcedBySchoolId, status]
}

model AdPlacement {
  id String @id @default(cuid())
  campaignId String  → AdCampaign (Cascade)
  schoolId   String  → School
  buyoutPriceCents Int?   // BUYOUT: 天数 × 该校日单价（提交时计算锁定）
  @@unique([campaignId, schoolId])
}

model AdDailyStat {
  id String @id @default(cuid())
  campaignId String → AdCampaign (Cascade)
  schoolId   String
  date       DateTime @db.Date
  impressions Int @default(0)
  clicks      Int @default(0)
  spendCents  Int @default(0)   // 当日该校消耗（CPM/CPC 按计价实时算；BUYOUT 按天均摊展示用）
  @@unique([campaignId, schoolId, date]); index [schoolId, date]
}

model SchoolLedgerEntry {
  id String @id @default(cuid())
  schoolId String → School
  type LedgerEntryType
  amountCents Int          // 有符号：收入 +，提现 −
  refType String?  refId String?   // 'campaign' | 'withdrawal' | 'grant'
  note String?
  createdByAdminId String?
  createdAt; index [schoolId, createdAt]
}

model WithdrawalRequest {
  id String @id @default(cuid())
  schoolId String → School
  amountCents Int
  status WithdrawalStatus @default(PENDING)
  bankSnapshot Json        // {accountName, bankName, accountNo} 申请时快照
  requestedByAdminId String
  reviewedByAdminId String?  reviewNote String?
  createdAt  reviewedAt DateTime?  paidAt DateTime?
  index [schoolId, createdAt], [status]
}
```

**余额定义**：`balance = Σ ledger.amountCents − Σ (PENDING/APPROVED 提现的 amountCents)`（冻结在途金额）。提现 `PAID` 时写入负数 `WITHDRAWAL` ledger 条目；`REJECTED` 释放冻结。

**AdminUser.schoolId 迁移**：现值为学校名字符串。seed/迁移逻辑：为每个出现过的名字 upsert School（name），把 AdminUser.schoolId 更新为 School.id。`SquarePost.school`、`Profile.school` 保持字符串（以 School.name 相等匹配）。学生会发帖/校园墙逻辑里凡用到 `admin.schoolId` 作为学校名的地方（square.service.ts createOfficialPost）改为查 School.name。

## 3. 计费与分成逻辑

- **单价来源**：School 覆盖值 → 否则 SystemConfig `ad_pricing_defaults`（seed 默认：buyoutDaily=20000 分/天/校、cpm=5000 分、cpc=200 分）。提交审核时快照进 `priceSnapshot`，此后改价不影响已提交订单。
- **BUYOUT**：`totalPrice = Σ_school (天数 × 该校日单价)`；确认收款后到 startDate 自动 ACTIVE，spend = totalPrice。
- **CPM**：曝光累计，`spend = Σ_school floor(impressions × cpm / 1000)`；**CPC**：`spend = clicks × cpc`。事件按天按校累加进 AdDailyStat，事务内同步累加 campaign.spendCents，`spend ≥ budget` 时置 COMPLETED。
- **生命周期调度**（AdsScheduler，@Interval 10min + 每日 00:05）：SCHEDULED→ACTIVE（到 startDate）；ACTIVE→COMPLETED（过 endDate 或预算耗尽）。
- **分成入账（settle，幂等）**：campaign 变 COMPLETED 时（调度器或事件驱动），若 `settledAt == null`：对每个 placement，金额 = BUYOUT ? buyoutPriceCents : 该校 spend 合计；`shareBps = (campaign.sourcedBySchoolId == placement.schoolId) ? school.selfSourcedShareBps : school.platformShareBps`；写入 `AD_SHARE` ledger（refType='campaign'）。SUSPENDED 的订单不自动结算，团队可手动 ADJUSTMENT。

## 4. 后端模块与路由（全部在 /api/v1 下）

新增 NestJS 模块：`schools`、`ads`、`finance`。公共：`common/decorators/roles.decorator.ts`、`common/guards/roles.guard.ts`。

### schools（AdminJwtAuthGuard）
| 路由 | 角色 | 说明 |
|---|---|---|
| GET /admin/schools?search&isActive | TEAM+ / UNION(仅本校) | 列表含统计（用户数、进行中广告数、累计收入、余额）|
| POST /admin/schools | SUPER/TEAM | 创建（name 唯一）|
| PUT /admin/schools/:id | SUPER/TEAM | 基本信息 + 分成 bps + 计价覆盖 |
| GET /admin/schools/:id | TEAM+ / UNION(本校) | 详情 + 统计 |
| PUT /admin/schools/:id/bank | UNION(本校) / TEAM | 绑定银行账户 |
| GET /admin/ad-pricing/defaults · PUT 同 | SUPER/TEAM | SystemConfig ad_pricing_defaults |

### ads（AdminJwtAuthGuard；events/serving 例外见下）
| 路由 | 角色 | 说明 |
|---|---|---|
| POST /admin/ads/campaigns | SPONSOR | 创建草稿 |
| PUT /admin/ads/campaigns/:id | SPONSOR(own, DRAFT/REJECTED) | 编辑 |
| POST /admin/ads/campaigns/:id/submit | SPONSOR(own) | 计价快照+算价；→ PENDING_UNION_REVIEW（自拉）或 PENDING_PLATFORM_REVIEW（直签）|
| GET /admin/ads/campaigns?status&schoolId&page | 按角色 scope | SPONSOR=own；UNION=sourcedBySchoolId=本校 或 placement 含本校（只读）；TEAM=全部 |
| GET /admin/ads/campaigns/:id | 同上 scope | 详情含 placements/stats 汇总 |
| POST /admin/ads/campaigns/:id/review {approve, note} | UNION(本校待审) / TEAM(平台待审) | 通过→PENDING_PAYMENT；驳回→REJECTED |
| POST /admin/ads/campaigns/:id/confirm-payment {note} | SUPER/TEAM | → SCHEDULED（或已过 startDate 直接 ACTIVE）|
| POST /admin/ads/campaigns/:id/pause · /resume | SPONSOR(own) / TEAM | ACTIVE↔PAUSED |
| POST /admin/ads/campaigns/:id/suspend {reason} · /unsuspend | SUPER/TEAM | 强制下架/恢复 |
| GET /admin/ads/campaigns/:id/stats?from&to | scope 同详情 | AdDailyStat 日序列 |
| GET /admin/ads/overview | TEAM / UNION / SPONSOR | 角色化汇总（用于 dashboard）|

**H5 侧（用户 JWT，AdsPublicController）**：
- `GET /ads/feed?school=<name>&limit=3` — 返回该校当日可展示广告（ACTIVE 且日期内、CPM/CPC 预算未尽、placement 命中该校）随机轮换，卡片形状同官方大卡：`{id, title, content, images, landingUrl, advertiserName}`。
- `POST /ads/events {events: [{campaignId, school, type: 'impression'|'click'}]}` — 批量上报，聚合进 AdDailyStat + spend 累加 + 预算触顶自动 COMPLETED。对非 ACTIVE 订单静默忽略。

### finance（AdminJwtAuthGuard）
| 路由 | 角色 | 说明 |
|---|---|---|
| GET /admin/finance/schools/:id/summary | UNION(本校)/TEAM | balance、累计收入、冻结、明细分页 ledger |
| POST /admin/finance/grants {schoolId, amountCents, note} | SUPER/TEAM | 发放赞助额度（SPONSOR_GRANT 正数入账）|
| POST /admin/finance/adjustments | SUPER/TEAM | 手工调整（正负）|
| POST /admin/finance/withdrawals {amountCents} | UNION | 校验余额、银行卡已绑定；快照银行卡 |
| GET /admin/finance/withdrawals?status&schoolId | UNION(本校)/TEAM | 列表 |
| POST /admin/finance/withdrawals/:id/review {approve, note} | SUPER/TEAM | PENDING→APPROVED/REJECTED |
| POST /admin/finance/withdrawals/:id/mark-paid | SUPER/TEAM | APPROVED→PAID + 负数 ledger |
| GET /admin/finance/revenue-report?from&to | SUPER/TEAM | 分校收入报表（广告收入、平台留存、学校分成）|

### 现有模块改造
- **admin.controller GET /admin/users**：UNION 角色强制 `profile.school == 本校 name` 过滤；PATCH status / verification 同样 scope（服务层校验目标用户学校）。
- **admin-users 端点**：允许 UNION `POST /admin/admin-users` 创建 SPONSOR（强制 `sourcedBySchoolId = 本校`、role=SPONSOR）；UNION 的 GET 列表只见自己拉的 SPONSOR；TEAM/SUPER 不变但支持新字段。原 SUPER-only 逻辑对其他角色/字段保持。
- **GET /admin/dashboard**：按角色返回不同 payload（team: 平台全量 + 收入汇总；union: 本校用户/收入/待审广告数；sponsor: 自己的投放汇总）。
- **square.service createOfficialPost**：admin.schoolId 现在是 School.id，需查 School.name 再比对/写入 post.school。

### seed 更新（prisma/seed.ts + scripts/seed-ads-demo.js）
- seed.ts：新增 SystemConfig `ad_pricing_defaults`；把已有 STUDENT_UNION 账号的 schoolId（学校名）迁移为 School.id（upsert School）。
- 新 `scripts/seed-ads-demo.js`（幂等，Docker CMD 中加在 seed-square-demo 之后）：3 所学校（University of Warwick / UCL / University of Manchester）、每校 1 个学生会账号（union.warwick@unimatcha.com / Union@123456 等）、2 个平台直签商家 + 1 个 Warwick 学生会自拉商家（sponsor.starbucks@…、sponsor.hsbc@…、sponsor.local@…，密码 Sponsor@123456）、各状态 campaign 若干（ACTIVE 的带 7 天 AdDailyStat 假数据）、1 笔赞助发放、1 笔待审提现。

## 5. Admin 前端重写（apps/admin-web）

保留 Next.js 14 + Tailwind + axios + react-hot-toast + lucide-react；**新增 recharts** 做数据图。删除未用依赖（next-auth、swr、react-query、react-hook-form、zod、date-fns）。

### 设计规范（Ivory & Ink，与 H5/website 一致）
- 画布 `#f9f9f9`，卡片纯白 + 1px `rgba(198,198,198,.4)` 细线边框，**10px 圆角**，无渐变、阴影极轻。
- 强调色只用霓虹绿 `#CCFF00`（hover `#B8E600`）：主 CTA、激活态导航、关键徽章；黑色 `#1b1b1b` 实心按钮为次级动作；危险动作霓虹粉 `#FF2EC4` 描边。
- 字体：Plus Jakarta Sans（标题，extrabold，小号大写字间距标签 `tracking-[0.2em]`）、Be Vietnam Pro（正文）、JetBrains Mono（金额/数字）。
- 图表：recharts，线/柱均用 ink 黑 + 霓虹绿两色，网格 `#e8e8e8`，无渐变填充。
- 全部页面用共享 UI 组件，禁止再写 `text-gray-900` 之类的裸灰阶（统一 token）。

### 共享层
```
src/lib/auth.ts        // 现有 + role helpers (isTeam/isUnion/isSponsor)
src/lib/api.ts         // 全量重写补齐新端点
src/lib/format.ts      // fenToYuan、日期、数字格式化
src/components/ui/     // PageHeader, StatCard, Card, DataTable, Badge(状态色映射),
                       // Modal, ConfirmDialog, Money, EmptyState, Tabs, Field/Input/Select,
                       // TrendChart(recharts 封装), RoleGate
src/components/layout/Sidebar.tsx  // 按角色渲染导航
```

### 导航与页面

**SUPER/TEAM（团队）**：总览 `/dashboard` · 用户管理 `/users` `/users/[id]` · 学校管理 `/schools` `/schools/[id]`（分成/计价/银行/统计）· 账号管理 `/accounts`（tab：学生会 / 商家 / 管理员(SUPER)）· 广告管理 `/ads`（列表+筛选）`/ads/[id]`（详情/审核/确认收款/下架/数据）· 财务 `/finance`（tab：提现审核 / 赞助发放 / 收入报表）· 广场发帖 `/square-post` · 问卷 `/questionnaire` `/questionnaire/[id]` · 匹配 `/matching` · 系统设置 `/settings`（SUPER，SystemConfig + 计价默认值）

**STUDENT_UNION（学生会）**：总览 `/dashboard`（本校数据 + 余额卡）· 本校用户 `/users`（scope 自动）· 赞助商 `/sponsors`（创建/管理自拉商家账号）· 广告审核 `/ads`（待审队列 + 本校广告列表，详情页可审核）· 发帖子 `/square-post` · 收益提现 `/earnings`（余额、明细、绑定银行卡、申请提现、提现记录）

**SPONSOR（商家）**：总览 `/dashboard`（投放汇总 + 趋势图）· 广告投放 `/ads`（我的列表）`/ads/new`（创建：素材/多校选择/计价模式/排期/预算 → 实时报价）`/ads/[id]`（状态流转 + 日数据图表）· 账户 `/account`（联系方式、改密）

同一路由按角色渲染不同内容（`/dashboard`、`/users`、`/ads` 复用路径，页内以 role 分支/RoleGate 控制），侧边栏只显示该角色可见项；页面级也要做 role 校验（未授权跳 dashboard）。登录页更新：展示三角色说明。

## 5.5 广场管理与举报处理（追加需求 2026-07-03）

**范围规则**：SUPER/TEAM 管理全部帖子；STUDENT_UNION 仅管理 `post.school == 本校 School.name` 的帖子（含校园墙与推荐流带本校标注的帖子）；SPONSOR 无此能力。

### 后端（square.service + admin.controller）
| 路由 | 角色 | 说明 |
|---|---|---|
| GET /admin/square/posts?board&school&status&reported&search&page&limit | TEAM+ / UNION(强制本校) | status: all/visible/hidden；reported=true 过滤 metadata.reports 非空或 deletedBy='reporter:auto'；返回含 authorType、作者展示名（用户昵称或 admin 名）、reportCount、isHidden、deleteReason 等 |
| DELETE /admin/square/posts/:id {reason} | TEAM+ / UNION(本校) | 既有下架接口，补 UNION 范围校验（非本校 403） |
| POST /admin/square/posts/:id/restore | TEAM+ / UNION(本校) | 恢复展示：isHidden=false，清 deletedBy/deletedAt/deleteReason |
| POST /admin/square/posts/:id/dismiss-reports | TEAM+ / UNION(本校) | 清空 metadata.reports；若 deletedBy='reporter:auto' 同时恢复展示 |
| GET /admin/reports?status&page&limit | SUPER/TEAM | 用户反馈举报（Report 表），含提交用户 email/昵称 |
| PATCH /admin/reports/:id {status} | SUPER/TEAM | open → resolved（幂等） |

### 前端 `/moderation`（TEAM 导航「广场管理」，UNION 导航「校园墙管理」）
- Tabs：**帖子管理**（筛选：板块/学校(仅 TEAM)/状态/搜索；表格列：内容摘要、作者(类型徽章+名字/匿名)、学校、板块、互动数、举报数(>0 粉色徽章)、状态、时间、操作）；**举报队列**（reported=true 预筛，多一个「清除举报」操作）；**用户反馈**（TEAM 专属 tab：Report 表 + 标记已处理）。
- 操作：下架（ConfirmDialog + 原因必填，danger）/ 恢复 / 查看详情（Modal 全文+图片）/ 清除举报。
- H5 端无改动（举报入口已存在）。

## 5.6 官网提交联动（追加需求 2026-07-16）

官网（apps/website）已有两类公开提交落库到 `PublicSubmission`（POST /public/waitlist、POST /public/sponsor-application，(type,email) 幂等 upsert）。本节把它们接进团队后台：

**模型增量**（已加）：`status PublicSubmissionStatus @default(PENDING)`（PENDING 待处理 / CONTACTED 已联系 / APPROVED 已开通 / REJECTED 已关闭）、`handledByAdminId/handledAt/handleNote`、`convertedAdminId`（一键开通创建的后台账号 id）、`updatedAt`。

### 后端（admin 模块，SUPER/TEAM only）
| 路由 | 说明 |
|---|---|
| GET /admin/submissions?type&status&search&page&limit | 列表，newest first；search 模糊匹配 email/organization；返回 {items,total,page,limit}，item 含全部字段 + convertedAdmin {id,name,role} join |
| PATCH /admin/submissions/:id {status, note?} | 状态流转（CONTACTED/REJECTED/回 PENDING），记 handledBy/handledAt/handleNote；APPROVED 只能经 convert 达成（PATCH 传 APPROVED → 400） |
| POST /admin/submissions/:id/convert | 一键开通，body：`{accountRole: 'STUDENT_UNION'\|'SPONSOR', email?, name, password, schoolId?, newSchoolName?, newSchoolCity?, organizationName?, contactName?, contactPhone?}`。STUDENT_UNION：schoolId 或 newSchoolName 二选一（新建 School）；SPONSOR：organizationName 必填、schoolId 可选作为 sourcedBySchoolId。email 缺省用申请邮箱；与现有 AdminUser 冲突 → 400『该邮箱已有后台账号』。事务内：创建（可选）School → 创建 AdminUser（bcrypt 12）→ 提交记录置 APPROVED + convertedAdminId + handledBy。响应回传 {admin, school?, initialPassword}（一次性展示） |
| GET /admin/dashboard（TEAM payload 增量） | + pendingSubmissions（SPONSOR 且 PENDING 计数） |

### 前端（admin-web，TEAM 导航「官网提交」/submissions，放在「财务」之后）
- Tabs：赞助申请（SPONSOR）/ 候补名单（WAITLIST）。状态筛选 + 邮箱/组织搜索。
- 列：组织 / 邮箱(mono) / 留言（截断+查看 Modal）/ 提交时间 / 状态 Badge（待处理 ink / 已联系 outline / 已开通 neon / 已关闭 pink）/ 处理信息（备注+时间）/ 操作。
- 操作（赞助申请）：标记已联系（Modal 可填备注）、开通账号（Modal：账号类型单选 学生会/商家 → 学生会：学校下拉「现有学校 + 新建…」；商家：组织名/联系人/电话 + 可选来源学校；邮箱默认申请邮箱可改；密码输入 + 「随机生成」按钮）→ 成功后展示一次性凭据卡（邮箱/密码 + 复制按钮 + 提醒线下交付）、关闭（原因备注）。候补名单只读 + 可标记已联系/关闭。
- 已开通的行展示 convertedAdmin 名字并链接 /accounts。
- 团队总览新增 ActionChip「待处理赞助申请」→ /submissions。

## 6. H5 改造（apps/h5/src/modules/square.js）

- 进入推荐流时并行 `GET /ads/feed?school=<我的学校>&limit=3`；广告卡以 bentoLargeCard 形态渲染（Sponsored 霓虹绿徽章 + advertiserName），插入规则：首屏第 3 个卡位 1 个，此后每 8 个小卡插 1 个，广告轮换不重复。
- 曝光：IntersectionObserver ≥50% 可见即计 1 次（每卡每次会话最多 1 次），入内存队列；点击：卡片 tap → 有 landingUrl 开新页，无则展示详情浮层；同时入队。
- 队列每 10s 或页面隐藏时（visibilitychange/sendBeacon 降级 fetch keepalive）批量 POST `/ads/events`。
- 校园墙不插广告。无学校资料的用户不请求广告。

## 7. 验收清单（verify 阶段逐项过）

1. 三角色登录后导航与页面各不相同，越权路由访问被拒（前端跳转 + 后端 403）。
2. 商家创建 BUYOUT 广告（2 校 × 3 天）→ 报价 = Σ 校日价×3；提交 → 平台待审；团队通过 → 待付款；确认收款 → SCHEDULED/ACTIVE。
3. 学生会自拉商家提交 → 该校学生会待审队列出现，其他学生会不可见；通过后团队可下架。
4. H5 推荐流出现 Sponsored 大卡；滚动曝光/点击后，商家端数据报表数字增长（CPM/CPC spend 同步增长，预算耗尽自动 COMPLETED）。
5. COMPLETED 后学校 ledger 出现 AD_SHARE，金额 = spend × 对应 bps；自拉单用 selfSourcedShareBps。
6. 团队发放赞助额度 → 学生会余额增加；学生会绑卡、申请提现（超余额被拒）→ 团队通过 → 标记打款 → 余额扣减、ledger 出现负数 WITHDRAWAL。
7. 学生会用户列表只含本校（Profile.school == School.name），封禁/审核他校用户 403。
8. 原有功能（用户、问卷、匹配、官方发帖）在 TEAM 端全部可用，样式统一为 Ivory & Ink。
