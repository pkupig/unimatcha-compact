# Unimatcha 项目内容总清单

> **技术视角底稿**（2026-08-10 全仓实扫生成：7 大模块 367 条 + 查漏 4 条，含代码路径，开发时对照用；2026-08-13 补录搜索与发现，2026-08-14 补录评论检索 P1-9）。
> **产品视角主档见按端拆分的三份纯功能列表**：[FEATURES-APP.md](FEATURES-APP.md) / [FEATURES-WEBSITE.md](FEATURES-WEBSITE.md) / [FEATURES-ADMIN.md](FEATURES-ADMIN.md)——日常维护勾选以产品主档为准，本文件随代码变动同步。
> （原 PRODUCT-CHECKLIST.md 已于 2026-08-10 拆分为上述三份并删除，内容存于 git 历史 1457de7。）

**状态图例**

| 写法 | 含义 |
|---|---|
| `- [x]` | ✅ 已完成（代码完整落地） |
| `- [ ] 🟡` | 半成品 / mock / 留桩（如假支付、mock LLM、无 UI 入口） |
| `- [ ] 🚧` | 进行中 |
| `- [ ] ❓` | 待确认 / 待决策 |
| `- [ ]` | 待办（未实现） |

**目录**：[总览](#总览) · [后端 API](#后端-api) · [H5 移动端](#h5-移动端) · [管理后台](#管理后台) · [官网](#官网) · [iOS + 旧版 Web](#ios-客户端--旧版-web-官网) · [匹配模型服务](#匹配模型服务) · [文档与部署运维](#文档与部署运维) · [遗留与杂项](#遗留与杂项查漏补充) · [全项目待办汇总](#全项目待办汇总跨模块去重)

## 总览

> 完成度 = ✅ 完成条数 ÷ 条目数（🟡 / 🚧 / ⬜ 均不计入完成）。

| 模块 | 条目 | ✅ 完成 | 🟡 半成品/mock | 🚧 进行中 | ⬜ 待办 | ❓ | 完成度 |
|---|---|---|---|---|---|---|---|
| 后端 API | 59 | 49 | 8 | 0 | 2 | 0 | 83% |
| H5 移动端 | 75 | 71 | 4 | 0 | 0 | 0 | 95% |
| 管理后台 | 49 | 43 | 5 | 0 | 1 | 0 | 88% |
| 官网 | 47 | 44 | 1 | 0 | 2 | 0 | 94% |
| iOS 客户端 + 旧版 Web 官网 | 46 | 28 | 9 | 0 | 6 | 3 | 61% |
| 匹配模型服务 | 40 | 33 | 4 | 0 | 3 | 0 | 83% |
| 文档与部署运维 | 58 | 29 | 11 | 1 | 15 | 2 | 50% |

## 后端 API

> NestJS + Prisma/PostgreSQL + Redis/BullMQ 后端，覆盖鉴权、双模式匹配、聊天、情侣空间、广场、活动、能量、三角色管理后台与广告商业化、官网公开接口；支付/SMTP 为 mock 留桩，其余功能基本完整落地。

### 鉴权与用户体系

- [x] **用户鉴权（注册/登录/改密）** — POST /auth/register|login|change-password，JWT 策略 + 全局 JwtAuthGuard `apps/api/src/auth/auth.controller.ts`
- [x] **管理端登录** — POST /admin/auth/login，独立 AdminJwtGuard + RolesGuard（SUPER/TEAM/STUDENT_UNION/SPONSOR 四角色） `apps/api/src/auth/admin-auth.controller.ts`
- [x] **用户信息与设置** — GET/PUT /users/me、me/settings（行锁更新防并发丢写）、me/match-status、me/notes、连接码、用户搜索、公开资料 `apps/api/src/users/users.controller.ts`
- [ ] 🟡 **学生认证（.edu 验证码）** — send-code/submit 流程完整，但无 SMTP——验证码写日志并随响应返回 devCode，留有 TODO(SMTP) `apps/api/src/users/users.service.ts:435-466`
- [x] **个人资料** — GET/PUT /profiles/me（含生日/年龄、头像、照片墙等字段） `apps/api/src/profiles/profiles.controller.ts`
- [x] **元数据字典** — GET /metadata/uk/cities|universities|majors、mbti-types、nationalities，数据来自 seed JSON `apps/api/src/metadata/metadata.controller.ts`
- [x] **图片上传** — POST /uploads/image|avatar|real-photo，扩展名由 mimetype 白名单派生（防存储型 XSS），静态 /uploads 带 nosniff，trust proxy 修 https URL `apps/api/src/uploads/uploads.controller.ts`
- [x] **举报** — POST /reports 用户反馈/举报入口，进后台处理队列 `apps/api/src/reports/reports.controller.ts`
- [x] **关系网** — GET /relationships/graph 好友/恋人关系图谱 `apps/api/src/relationships/relationships.controller.ts`
- [ ] **拉黑/屏蔽** — 无数据表无接口，确认为有意留桩（客户端亦无入口） `CLAUDE.md 2026-07-13 日志「拉黑无表均为有意留桩」`

### 匹配系统（双模式：恋人/朋友）

- [x] **匹配核心流程** — POST /matching/start（增强模式能量预扣）/connect/connect-user/stop、status/result/milestones、确认关系/解除（confirm-relationship、dissolve、proposals 确认/拒绝）、偏好 GET/PUT `apps/api/src/matching/matching.controller.ts`
- [x] **匹配模型 Provider（本地打分 + AI）** — MATCH_MODEL=ai|scoring 环境工厂选择；AIMatchModelProvider 调 matching-ml（超时/AbortController/Bearer 鉴权/响应校验），回退本地 ScoringMatchModelProvider。注意 matching-ml 服务侧 LLM_BACKEND 仍为 mock `apps/api/src/matching/matching.module.ts:33-46`
- [x] **行为埋点与反馈** — POST /matching/feedback/events（viewed/openedProfile 等，白名单+归属校验+去重防刷）；曝光 MatchExposure 逐对落库、confirmed/dissolved/firstMessage 服务端权威埋点 `apps/api/src/matching/feedback/match-feedback.service.ts`
- [x] **过期退款** — expireUnconfirmedMatches 每 10 分钟跑一次：恋人退全部预扣、朋友按格退，dedupeKey 去重 `apps/api/src/matching/matching.service.ts:993`
- [x] **管理端匹配运营** — GET/PUT /admin/matching/config（cron 表达式热更新）、jobs 触发/列表/详情/重试、results `apps/api/src/matching/admin-matching.controller.ts`
- [x] **问卷（用户端 + 管理端）** — GET /questionnaire/active|completion；管理端版本 CRUD/发布、题目增删改/排序/启停；75 题中英双语题库 `apps/api/src/questionnaire/`
- [x] **答卷提交** — POST /answers、GET /answers/mine，按模式（恋人/朋友）分卷 `apps/api/src/answers/answers.controller.ts`

### 社交互动

- [x] **聊天** — 会话列表、消息发送/轮询（复合游标不丢同毫秒消息，无 WebSocket）、已读/未读、拍一拍 nudge（消息文案为英文写死，H5 侧本地化）、每会话聊天背景 `apps/api/src/chat/chat.controller.ts`
- [x] **情侣空间** — GET /couple/:matchId 聚合页；封面、说 100 次我爱你、状态、想吃/想要 craving、日程、纪念日、愿望清单（bucket）各自 CRUD，里程碑通知 `apps/api/src/couple/couple.controller.ts`
- [x] **广场 v2（推荐流 + 校园墙）** — 发帖（含匿名化名/官方帖/投票帖审核制）、recommend/campus-wall 双流（按天稳定洗牌）、详情、投票/改票、点赞（匿名 token 防反推）、评论（楼中楼）、举报、删帖 `apps/api/src/square/square.controller.ts`
- [x] **广场搜索** — GET /square/v2/search（帖子+用户两组，用户组仅第 1 页）；recommend/campus-wall 亦支持 search 参数（此前该参数被静默忽略，H5 已在发但后端不读）。pg_trgm 子串检索，相关性 标题 3.0 > 标签精确 2.6 > 正文 1.8 > **评论命中 1.2** + similarity 模糊兜底，终排 rel×(1+0.12·热度)×(1+0.1·新鲜度)；可见性与信息流同口径（校园墙同校硬过滤在跨板 OR 时各自带约束） `apps/api/src/square/square.service.ts` searchPosts/searchAll
- [x] **评论内容检索（P1-9）** — LEFT JOIN LATERAL 每帖只取一条最早命中评论：既给展示片段又天然按帖去重（否则热帖用自己的评论刷满整页）。片段截断 120 字、**只下发正文不带评论作者**（匿名帖评论在详情页已脱敏，搜索结果不得成为反推旁路）；帖子本身命中时不挂片段（避免卡上同时出现标题命中与一句无关评论）。可见性沿用主帖 scope——实测他校墙帖、已删帖均不会经评论穿透 `apps/api/src/square/square.service.ts` searchPosts
- [x] **猜你喜欢（推荐流个性化）** — 由点赞/评论聚合 tag/作者/学校三张权重表（评论权重 2.5×点赞），进程内 5 分钟 TTL 缓存 + 点赞/评论即时失效；affinity 以 0.45 权重进 scorePersonalCard（低于热度 0.5），行为 <3 次不做个性化避免冷启动劣化 `apps/api/src/square/square.service.ts` getTasteProfile/affinityOf
- [x] **找人（联系人搜索）** — GET /discovery/users：昵称/学校/专业/城市/标签/兴趣 + 连接码精确命中置顶（绕过 searchable，因对方给码即同意）；相关性排序 + 分页 + 关系态标注；`/users/search` 保留为兼容壳 `apps/api/src/discovery/discovery.service.ts`
- [x] **猜你认识** — GET /discovery/suggestions + POST suggestions/:userId/dismiss。三路召回：二度好友（3.0·log2(1+共同好友)，对数抑制中心节点刷屏）/ 同校同年级同专业+兴趣重合 / 广场共现（≥2 次）；原因码由后端下发、文案前端出。**隐私为主设计**：privacy.discoverable 默认关闭且双向要求（viewer 未开→功能不可用并引导，候选未开→不被推出），单侧打开零曝光；排除集合含已解除关系的人（故意不带 dissolvedAt 过滤） `apps/api/src/discovery/discovery.service.ts`
- [ ] 🟡 **活动与门票** — GET /events/:id、tickets/mine、POST /:id/purchase——购票即出票为 mock 支付（每人限购 2 张、条件自增防超卖）；核销/名单在 admin 侧 `apps/api/src/events/events.service.ts:15`
- [ ] 🟡 **能量系统** — 余额/流水/领取/消耗退款闭环完整；充值 purchase/confirm 为 mock 支付（仅生成订单号，paymentIntent {mock:true}，无真实渠道） `apps/api/src/energy/energy.service.ts:267-321`
- [x] **通知** — GET /notifications、unread-count、单条/批量已读；16 类通知（赞/评论/审核/退款/里程碑等，正文英文，H5 本地化） `apps/api/src/notifications/notification.controller.ts`
- [x] **情侣排行榜** — GET /leaderboard（duration/score/streak 等 8 类实时榜），代码完整且模块已注册；iOS 新版已弃用该入口 `apps/api/src/leaderboard/leaderboard.service.ts`

### 管理后台与商业化

- [x] **管理后台核心** — dashboard（含待审角标）、用户管理（状态/重置模式/认证审核）、管理员账号 CRUD、系统配置 configs `apps/api/src/admin/admin.controller.ts`
- [x] **内容审核（广场/投票/举报）** — 官方发帖、帖子下架/恢复/清除举报（学生会本校隔离、团队全量）、投票帖审核、举报队列处理 `apps/api/src/admin/admin.controller.ts:180-335`
- [x] **活动管理** — 发布活动（同步生成广场活动帖）、修改/停售/取消、购票名单、入场核销（防重复） `apps/api/src/admin/admin.controller.ts:270-314`
- [x] **官网提交处理** — GET/PATCH /admin/submissions 工作流（PENDING→CONTACTED→APPROVED/REJECTED）+ POST :id/convert 一键开通学生会/商家账号 `apps/api/src/admin/admin.controller.ts:338-377`
- [x] **学校管理与广告定价** — /admin/schools CRUD + 银行信息；/admin/ad-pricing/defaults 全局计价默认值 `apps/api/src/schools/schools.controller.ts`
- [x] **广告投放（BUYOUT/CPM/CPC）** — campaign 创建/提交/分级审核/确认收款/暂停恢复/停用；H5 侧 GET /ads/feed 注入 + POST /ads/events 计费（消耗原子增量、展示封顶、结算按实收预算封顶） `apps/api/src/ads/ads-admin.controller.ts`
- [x] **财务（分成/提现）** — 学校账本 summary、赞助发放 grants、调整、提现申请/审批/打款（负数入账余额守恒）、收入报表 `apps/api/src/finance/finance.controller.ts`
- [x] **官网公开接口** — GET /public/site-stats（真实统计+下轮公布时间，60s 缓存）、POST waitlist、sponsor-application（幂等 upsert），进程内 IP 限流 60s/10 次 `apps/api/src/public/public.controller.ts`

### 数据模型（prisma/schema.prisma，46 模型）

- [x] **用户与账号域** — User/AdminUser（四角色）/Profile（含 birthday）/UserModeState（双模式状态机） `apps/api/prisma/schema.prisma:56-260`
- [x] **能量域** — EnergyBalance/EnergyTransaction（类型枚举含充值/消耗/退款） `apps/api/prisma/schema.prisma:171-214`
- [x] **情侣空间域** — CoupleMemberState/Anniversary/BucketItem/ScheduleEntry/CravingEntry + CouplePost/PostComment/PostLike `apps/api/prisma/schema.prisma:261-639`
- [x] **问卷域** — QuestionnaireVersion/Question（titleEn 双语列）/QuestionOption/Answer `apps/api/prisma/schema.prisma:381-466`
- [x] **匹配域** — MatchConfig（cronExpr）/MatchJob/Match/UserMatchPreferences + 埋点表 MatchExposure（(matchJobId,matchId) 唯一防重）/MatchBehaviorEvent `apps/api/prisma/schema.prisma:339-1104`
- [x] **广场与活动域** — SquarePost（postType/reviewStatus/eventId）/SquarePostComment/SquarePostLike/SquarePollVote + Event/EventTicket `apps/api/prisma/schema.prisma:640-807`
- [x] **消息通知与举报域** — Message/Notification/Report/SystemConfig `apps/api/prisma/schema.prisma:808-867`
- [x] **商业化域** — School/AdCampaign/AdPlacement/AdDailyStat/SchoolLedgerEntry/WithdrawalRequest `apps/api/prisma/schema.prisma:901-1058`
- [x] **官网提交域** — PublicSubmission（WAITLIST/SPONSOR 类型 + 处理工作流状态与经手人字段） `apps/api/prisma/schema.prisma`
- [x] **发现域** — UserSuggestionDismiss（(userId,targetUserId) 唯一，单向永久忽略）；隐私开关 searchable/discoverable 复用 User.settings.privacy JSON（无需建列） `apps/api/prisma/schema.prisma` UserSuggestionDismiss
- [ ] 🟡 **迁移管理** — prisma/migrations 目录为空——生产走 db push 而非 migrate（Dockerfile 启动时 npx prisma db push） `apps/api/prisma/migrations（空）`
- [x] **搜索索引（db push 无法声明的部分）** — prisma/ensure-search-indexes.ts 幂等补 pg_trgm 扩展 + 10 个 GIN/复合索引（square_posts title/content/tags、profiles nickname/school/major/city/interests/tags、school+grade），接入 Dockerfile 启动链；**失败不阻断启动**，配套 PrismaService.hasTrgm() 探测一次并缓存，缺扩展时 SQL 去掉 similarity 分量降级为纯 ILIKE `apps/api/prisma/ensure-search-indexes.ts`

### 任务调度、Seed 与脚本

- [x] **BullMQ 匹配队列** — match.processor.ts 消费 MATCH_QUEUE 执行每轮匹配；match.scheduler.ts 由 MatchConfig.cronExpr 数据库驱动动态 CronJob（非法表达式保留旧调度），每 10 分钟 syncCronFromDB + expireUnconfirmedMatches `apps/api/src/matching/match.processor.ts`
- [x] **广告生命周期调度** — ads.scheduler.ts @Interval 10 分钟 tick：BUYOUT 按天摊销 accrueBuyoutSpend、状态流转、结算前补齐漏摊（启动即追赶一次） `apps/api/src/ads/ads.scheduler.ts`
- [x] **Seed 脚本** — prisma/seed.ts：管理员账号（SEED_ADMIN_* 环境变量）、75 题双语题库、系统配置、广告计价默认值、AdminUser.schoolId 数据迁移；幂等 upsert `apps/api/prisma/seed.ts`
- [x] **英文题面回填脚本** — prisma/backfill-question-en.ts 幂等回填 titleEn（复用 seed 题库映射），生产已跑 75/75；开发库因本机 Docker 未恢复尚未补跑 `apps/api/prisma/backfill-question-en.ts`
- [x] **演示数据脚本（SEED_DEMO 开关）** — scripts/seed-square-demo.js、seed-ads-demo.js 仅 SEED_DEMO=true 时在容器启动执行；另有 seed-demo-matched.js、reset-password.js 运维脚本 `apps/api/scripts/`

### Mock / 留桩汇总

- [ ] 🟡 **能量充值支付** — mock 支付：purchase 仅生成订单号返回 {mock:true}，confirm 直接入账，注释标明「正式渠道接入后落 Order 表」 `apps/api/src/energy/energy.service.ts:267-321`
- [ ] 🟡 **活动购票支付** — mock 支付：购票即出票，pricePaidCents 仅记录票面价，无真实扣款 `apps/api/src/events/events.service.ts:15`
- [ ] 🟡 **邮件验证码发送（SMTP）** — 无邮件服务，验证码随响应返回 devCode 供测试，TODO(SMTP) 待接入后移除 `apps/api/src/users/users.service.ts:462-466`
- [ ] **拉黑功能** — 无表无接口，有意留桩待后续设计 `CLAUDE.md 2026-07-13 后端契约核对结论`
- [ ] 🟡 **AI 匹配的真实 LLM** — API 侧 AIMatchModelProvider 已完整接线，但下游 matching-ml 服务 LLM_BACKEND=mock（规则打分正常，真实 LLM 需 API key）——属 API 外部依赖 `apps/api/src/matching/providers/ai-match-model.provider.ts`

## H5 移动端

> H5 移动端 SPA（Vite+原生 JS 模块，14 个模块约 1.1 万行）：登录注册向导、双模式问卷与匹配、聊天/拍一拍/关系网、广场瀑布流+校园墙+投票+活动、情侣空间、能量与票夹、通知、资料与设置、全站中英双语，功能面基本完整；已知留桩点为能量/购票 mock 支付、认证邮件 devCode、免费能量无入口、单帖举报缺入口。

### 启动与应用基座

- [x] **启动页 Splash** — 平面 logo+进度线+BETA 标+Skip 按钮，3s 自动隐藏 `apps/h5/index.html(#splash)`
- [x] **启动看门狗自愈** — 资源加载失败或 7s 未 boot 带时间戳重载一次（sessionStorage 防循环），二次失败显示可重试降级页 `apps/h5/index.html 内联脚本(__appBooted/cl_boot_retry)`
- [x] **PWA 主屏支持** — manifest.webmanifest + 各尺寸图标 + apple-touch-icon；无 Service Worker 离线缓存（缓存策略由 nginx 控制） `apps/h5/public/manifest.webmanifest`
- [x] **API 基址自适应** — localhost/裸 IP 直连 :3001，生产自动切 https://api.<域名> `apps/h5/src/state.js`
- [x] **API 封装与图片上传** — 统一 fetch 封装(Bearer token)+/uploads/image 图片上传 `apps/h5/src/modules/core.js(api/uploadImageFile)`
- [x] **用户状态路由与换账号清理** — checkUserState 分流 未登录/封禁页/资料未建/主界面；cleanupUserState 防新账号继承旧状态 `apps/h5/src/modules/core.js`
- [x] **XSS 防护工具** — escapeHtml + safeUrl/safeCssUrl 拦截 javascript:/引号注入，全站 src/背景图接线 `apps/h5/src/modules/core.js`

### 登录注册与账号

- [x] **邮箱登录/注册** — 邮箱+密码（≥8 位、二次确认），token 存 localStorage，注册后进资料向导 `apps/h5/src/modules/auth.js`
- [x] **注册资料分步向导** — 昵称/姓名/性别/生日(16–40 岁,推算年龄)每项一屏+进度条+空值拦截，兴趣标签、头像上传、学校等元数据下拉 `apps/h5/src/modules/profile.js(initProfileSetupPage/setupWizard*)`
- [ ] 🟡 **学生认证** — 学生证上传+校邮验证码+提交审核已接线；无 SMTP 时后端返回 devCode 前端直显（邮件服务未接为已知外部缺口） `apps/h5/src/modules/profile.js(sendVerifyCode 注释)`
- [x] **修改密码** — 设置页入口，当前密码+新密码提交 `apps/h5/src/modules/auth.js(submitChangePassword)`
- [x] **封禁页与退出登录** — page-banned 独立页；登出确认卡+停全部轮询+状态清理 `apps/h5/index.html(#page-banned)`

### 匹配问卷

- [x] **双模式问卷** — 恋人 50 题/朋友 25 题分桶作答，开场双卡选择弹层，完成态标记 `apps/h5/src/modules/questionnaire.js`
- [x] **四种题型渲染** — 单选/多选/五档量表/文本，文本延迟 flush `questionnaire.js(answerSingle/Multiple/Scale/Text)`
- [x] **题目导航跳题** — 网格弹层任意跳题：绿=已答/描边=未答/圈=当前 `questionnaire.js(openQNav/jumpToQuestion)`
- [x] **题面双语** — 英文态显示 titleEn 缺省回退中文（后端 75 题已回填） `questionnaire.js(loadQuestionnaire)`
- [x] **提交与重做** — 空白答案校验、按模式提交、可重新作答 `questionnaire.js(submitAnswers/retakeQuestionnaire)`

### 匹配（恋人/朋友双模式）

- [x] **首页三段切换** — Chat/恋人/朋友三视图切换 + 左上加号弹出卡（搜索/扫码/关系网/深色/语言直达） `apps/h5/src/modules/match.js(switchHomeView/toggleChatPlusMenu)`
- [x] **匹配状态机渲染** — idle 引导/searching 等待动画+剩余时间/matched 揭晓卡/relationship 关系卡，缺问卷先引导作答 `match.js(renderMatchTab/renderRomanticMatchTab/renderFriendMatchTab)`
- [x] **每周公布倒计时** — 解析后端 cronExpr 算下轮时间，失败回退本地周五 17:00 `match.js(getNextCronRun/getNextFriday5pmCountdown)`
- [x] **进入/离开匹配池、确认/解除** — startMatch(含增强扣费确认)/stopMatch/dissolveMatch；确认在聊天头部完成 `match.js`
- [x] **匹配偏好面板** — 性别/年龄区间(Any)/学段多选/朋友兴趣与活动优先级/matchBasis/补充信息，竞态令牌防回填覆盖 `match.js(saveFilterPrefs 等)`
- [x] **增强匹配（能量付费）** — 恋人 3 格/朋友 1–5 格滑档，开关按模式持久化，后端「已在池中」不扣费的空操作已修 `match.js(toggleEnhance/updateFriendCells/ensureEnhancedShape)`
- [x] **行为埋点上报** — viewed(匹配卡渲染)/openedProfile(打开对方资料) POST /matching/feedback/events，会话内去重 `match.js(reportMatchEvent)`
- [x] **对方公开资料全屏页** — 统一渲染器（含学校/年级中文映射） `match.js(renderPartnerProfile)`

### 聊天与关系网

- [x] **会话列表** — 临时/已确认会话、模式徽标、临时会话剩余时限倒计时、未读标记、下拉刷新 `apps/h5/src/modules/chat.js(renderSessions/startSessionCountdown)`
- [x] **聊天会话** — 游标分页历史、上滑加载更早、轮询新消息、已读回执、发送文字/图片、全屏图片查看器 `chat.js(loadChatHistory/pollChatMessages/sendChatImage)`
- [x] **拍一拍 Nudge** — 点对方头像菜单触发，设置页可自定义后缀（即时保存） `chat.js(chatNudge)`
- [x] **聊天壁纸** — 按会话自定义背景图上传 `chat.js(editChatWallpaper/applyChatBackground)`
- [x] **会话内确认/解除关系** — 头部动作按会话类型/模式渲染，双方确认状态同步 `chat.js(renderChatHeaderActions/confirmRelationship)`
- [x] **能量退款横幅** — 过期未确认匹配的退款通知在会话列表顶部浮出 `chat.js(checkRefundOnSessions/showRefundBanner)`
- [x] **加好友中心** — 我的连接码二维码(qrcodejs)/摄像头扫码(html5-qrcode,失败退手输)/手输码连接 → 直开会话 `apps/h5/src/modules/addfriend.js`
- [x] **关系网图谱** — SVG 绘制直接关系图，线粗=亲密度，点节点开聊 `addfriend.js(loadFriendGraph/renderGraphSvg)`
- [x] **搜索与发现面板** — 上区按昵称/备注/学校/末条消息过滤本地会话（点结果直开）；下区空关键词时挂「可能认识的人」（原因标签+忽略+一键加好友），有关键词时改挂 /discovery/users 找同学；未开 discoverable 出引导开启而非空列表 `addfriend.js(runFriendSearch/searchPeople/loadSuggestions/userResultRow)`

### 广场（推荐流+校园墙）

- [x] **双页横滑与独立滚动** — 推荐/校园墙轨道横滑切换，滚动位置各自记忆恢复，切页不重拉（仅空页/搜索残留时刷新） `apps/h5/src/modules/square.js(switchSquareTab/bindSquareSwipe)`
- [x] **推荐瀑布流布局** — JS 显式列/行定位替代 grid dense（洞回填），ResizeObserver+rAF+250ms 兜底重排，图片比例卡+纯文字 3:4 卡 `square.js(layoutSquareMasonry/observeMasonryItems)`
- [x] **校园墙** — 全宽卡信息流；未绑学校显示补资料引导门槛 `square.js(renderSquareNeedSchool)`
- [x] **发帖** — 标题/正文/多图上传、去向随所在页、匿名开关、投票行仅校园墙显示 `square.js(openNewPost/submitNewPost/handlePostImages)`
- [x] **校园墙投票** — 发起 2–6 选项（审核制 pending 仅作者可见）、卡片占比条投票/改票 `square.js(pollBlock/votePollOption/toggleNewPostPoll)`
- [ ] 🟡 **活动卡与购票** — 活动条/详情块/购票确认卡已完整，但支付为 mock（确认文案自述 beta 期 mock，直接落票夹） `square.js(buyEventTicket: 'Payment is mocked in beta')`
- [x] **帖子详情与评论** — 图片轮播、楼层分组评论+回复、点赞、评论数点击滚动聚焦输入条、时间/排序 `square.js(renderPostDetail/renderPdComment/focusPdComposer)`
- [x] **点赞与双页状态同步** — 列表/详情/两页副本三方同步 `square.js(syncPostLikeState/patchSquareCard)`
- [x] **广场搜索** — 搜索条展开/收起、有筛选时图标变绿提示、清空/切页恢复未过滤流并熄灭高亮；搜索态改走 /square/v2/search，结果顶部渲染 PEOPLE 区（共享 userResultRow）；命中评论的卡片渲染 COMMENT 片段行（data-no-i18n 只包评论正文、不包标签，否则中文态标签漏译） `square.js(runSquareSearch/loadSquareTab2/renderSearchPeople/commentSnippetLine)`
- [x] **可拖动发帖按钮** — FAB 拖动+边缘吸附+localStorage 位置记忆，拖动期间禁横滑 `square.js(bindFabDrag)`
- [x] **广告注入** — 推荐流插 Sponsored 大卡（搜索态/校园墙不插），IntersectionObserver 计曝光去重、点击落地页或详情浮层、事件批量上报+pagehide flush、换账号重置会话 `apps/h5/src/modules/ads.js`
- [x] **帖子内举报入口** — 详情页页眉「更多」操作卡（分享/举报帖子，两步确认防误触）走 POST /square/v2/posts/:id/report；评论长按 600ms 弹操作卡（分享/点赞/举报），评论举报走通用 POST /reports（category=content，带 commentId/postId/摘要） `square.js:1066,1092`

### 情侣空间与里程碑

- [x] **情侣空间主页** — 恋人关系态下渲染于匹配页：封面编辑、状态、想吃什么(快捷+自定义)、100 次我爱你计数 `apps/h5/src/modules/couple.js(renderCoupleHub/coupleSendLoveYou)`
- [x] **日程与纪念日** — 添加/删除/详情/全部列表 `couple.js(openAddSchedule/openAddAnniversary/openAnniversaryDetail)`
- [x] **心愿单与礼物罐** — 心愿添加/打卡完成(可附图)/查看/删除，礼物罐弹层 `couple.js(coupleAddBucket/openGiftJar)`
- [x] **关系里程碑总览** — 关系统计时间线 overlay，设置页 Love mode 入口（关系态解锁） `apps/h5/src/modules/milestone.js`

### 能量与票夹

- [x] **能量余额展示** — 资料页能量条，/energy/balance 拉取缓存 `apps/h5/src/modules/profile.js(loadEnergyBar/renderEnergyDisplay)`
- [ ] 🟡 **能量充值** — 选套餐→选支付方式→统一确认下单+confirm 闭环完整，但为 mock 支付（confirm 不带 transactionId，注释留真实 SDK 位） `profile.js(confirmEnergyPurchase 注释)`
- [ ] 🟡 **免费能量领取** — claimEnergy 已接 /energy/claim 但界面无调用入口 `profile.js(claimEnergy)，index.html 无引用`
- [x] **我的票夹** — 票卡列表+二维码(qrcodejs)+VALID/USED/CANCELLED 状态徽标+空态/重试 `profile.js(loadMyTickets)`

### 通知

- [x] **通知面板** — 右滑面板、今天/昨天/更早分组、分页加载更多、图标盘+未读粉点、轮询+未读角标 `apps/h5/src/modules/notifications.js`
- [x] **通知详情与已读** — 详情弹层、单条标记已读 `notifications.js(openNotificationDetail/markNotificationRead)`
- [x] **通知中文本地化** — 后端英文通知前端按语言映射：16 种标题+7 静态正文+10 条动态正则（带昵称/格数/审核原因） `notifications.js(localizeNotif/NOTIF_BODY_PATTERNS)`

### 个人资料

- [x] **资料主页** — 头像/学校胶囊/认证入口/能量/菜单行，下拉背景模糊消散手势 `profile.js(loadProfileTab/setupBgPullReveal)`
- [x] **编辑资料** — 性别/生日(年龄联动)/学校城市专业国籍等元数据下拉/兴趣标签/简介字数统计，校验先行防保存键卡死 `profile.js(openEditProfile/saveEditProfile)`
- [x] **封面与照片墙** — 封面上传、照片墙多图上传/删除 `profile.js(handleCoverFile/triggerProfilePhotoUpload)`
- [x] **主页文案编辑** — 独立编辑弹层 `profile.js(saveEditHomepage)`
- [x] **资料预览（公开卡）** — 以他人视角预览公开资料卡 `profile.js(openPreview/renderPublicProfileCard)`

### 设置与支持

- [x] **设置页** — 账号(改密)/偏好(语言+深色)/推送/拍一拍后缀/隐私五开关（公开资料·在线状态·公开动态·允许被搜到·允许被推荐），全部即时保存带并发防抖；SETTING_FALLBACKS 让 discoverable 缺键兜底 false（其余仍兜底 true），避免老用户看到与后端相反的开态 `apps/h5/src/modules/settings.js(getSettingValue)`
- [x] **内容页四篇双语** — 帮助中心/安全提示/用户协议/隐私政策，中文态整页切换英文回退 `settings.js(CONTENT_PAGES/CONTENT_PAGES_ZH)`
- [x] **联系我们与报告问题** — 联系弹窗(contact@unimatcha.ai)；报告表单分类(bug/用户等)提交 feedback 接口 `settings.js(openContactUs/submitReport)`

### i18n 与主题

- [x] **全局中英切换** — ZH 词典+MutationObserver 动态翻译文本节点、占位符词典、data-no-i18n 隔离用户内容防误翻 `apps/h5/src/modules/i18n.js(startI18n/translateTree)`
- [x] **元数据中文映射** — META_ZH 234 项(大学/城市/专业/国籍/年级)，仅翻显示、值保持英文，下拉+展示面 8 处接线 `i18n.js(META_ZH/metaLabel)`
- [x] **时间戳语言感知** — 中文态 刚刚/N 分钟前/zh-CN 日期，全站帖子/评论/通知统一 `square.js(formatPostTime)`
- [x] **深色模式** — 主题持久化+设置/加号菜单双入口切换 `i18n.js(applyTheme/toggleDarkMode)`
- [x] **语言选择弹窗** — 中/英选择卡，持久化 cl_lang `i18n.js(openLangDialog)`

### 通用组件与手势

- [x] **下拉刷新组件** — 圆片跟手+进度旋转+过阈值变绿转圈，match/square/profile 三页复用，onPull 进度回调驱动 profile 模糊消散 `apps/h5/src/modules/core.js(attachPullToRefresh)`
- [x] **底部导航** — 悬浮胶囊、滚动下滑隐藏上滑恢复、重按当前 tab 回顶+刷新 `core.js(bindNavAutoHide)`
- [x] **侧滑面板右滑返回** — 全屏 overlay 通用右滑关闭手势，多指/touchcancel 无条件复位防卡死 `core.js(swipePanel)`
- [x] **弹层拖拽关闭** — 偏好等 sheet 支持拖拽关闭 `core.js(bindSheetDragClose)`
- [x] **通用 UI 件** — confirmCard/promptCard 确认与输入卡、toast、btnBusy、flatEmptyIcon 平面空态图标 `core.js`

## 管理后台

> Next.js 管理后台，四角色（SUPER 超管/TEAM 平台团队/STUDENT_UNION 学生会/SPONSOR 商家，代码中商家角色名为 SPONSOR 而非 MERCHANT），侧边栏与各页面按角色分支渲染，覆盖用户/学校/账号/广告/内容审核/活动/财务/官网提交/问卷/匹配/系统设置全链路，绝大部分功能已完整接线。

### 基础架构与登录

- [x] **管理员登录页** — 邮箱+密码登录，三角色说明提示行；登录 401 不跳转以显示失败原因 `apps/admin-web/src/app/login/page.tsx`
- [x] **鉴权与角色体系** — SUPER/TEAM/STUDENT_UNION/SPONSOR 四角色，token 存 localStorage，401 自动清 token 跳登录；页面级 RoleGate 守卫 `apps/admin-web/src/lib/auth.ts`
- [x] **角色化侧边栏导航** — TEAM/SUPER 13 项（系统设置仅 SUPER）、学生会 8 项、商家 3 项，三套导航按角色切换 `apps/admin-web/src/components/layout/Sidebar.tsx`
- [x] **API 封装层** — axios 实例统一封装 60+ 后端端点（含类型定义），响应解包与校验错误归一化 `apps/admin-web/src/lib/api.ts`
- [x] **旧路由兼容跳转** — /admin-accounts→/accounts、/relationship→/dashboard 永久重定向防旧书签 404 `apps/admin-web/src/app/(dashboard)/admin-accounts/page.tsx、relationship/page.tsx`
- [x] **共享 UI 组件库** — PageHeader/StatCard/DataTable/Modal/ConfirmDialog/Tabs/TrendChart/StatusBadge 等全站复用 `apps/admin-web/src/components/ui/index.tsx`

### 总览 Dashboard（角色分支）

- [x] **平台团队总览** — 用户/学校/进行中广告/30 天流水统计卡 + 待办 chips（提现/待审广告/赞助申请）+ 30 天消耗趋势图 + 快捷入口 `apps/admin-web/src/app/(dashboard)/dashboard/page.tsx TeamDashboard`
- [x] **学生会总览** — 本校用户/账户余额/待审广告/进行中投放统计卡 + 最近入账明细表（取本校财务摘要） `apps/admin-web/src/app/(dashboard)/dashboard/page.tsx UnionDashboard`
- [x] **商家投放总览** — 投放中/总消耗/7 日曝光/点击统计卡 + 7 天曝光点击趋势图 + 新建广告 CTA `apps/admin-web/src/app/(dashboard)/dashboard/page.tsx SponsorDashboard`

### 用户管理（TEAM 全量 / 学生会本校）

- [x] **用户列表** — 搜索（300ms 去抖）+ 状态筛选 + 分页；双模式（恋爱/朋友）匹配状态徽章；学生会由后端自动 scope 本校 `apps/admin-web/src/app/(dashboard)/users/page.tsx`
- [x] **封禁/解封与重置模式** — ACTIVE↔BANNED 切换；关系中用户可重置回匹配模式 `users/page.tsx handleStatus/handleResetMode`
- [x] **学生认证审核** — 未认证/待审核/已认证/已驳回四态下拉直改 + 学生证图片与校邮箱查看 `users/page.tsx handleVerification`
- [x] **用户详情页** — 资料/认证/双模式状态只读详情 `apps/admin-web/src/app/(dashboard)/users/[id]/page.tsx`

### 学校管理（SUPER/TEAM）

- [x] **学校列表与新建** — 学校/城市/用户数/进行中广告/累计收入/余额/分成/状态列表 + 搜索筛选 + 新建 Modal `apps/admin-web/src/app/(dashboard)/schools/page.tsx`
- [x] **学校详情配置** — 分成配置（平台直签/自拉档 bps↔%）、按校计价覆盖（清空回落全局默认）、银行账户查看与代改、数据统计卡；学生会访问重定向 /earnings `apps/admin-web/src/app/(dashboard)/schools/[id]/page.tsx`

### 账号管理

- [x] **账号管理三 Tabs（SUPER/TEAM）** — 学生会/商家/管理员（SUPER 专属 tab）账号列表与创建；停启用为 SUPER 专属，最后一个 SUPER 后端兜底保护 `apps/admin-web/src/app/(dashboard)/accounts/page.tsx`
- [x] **学生会自拉赞助商管理** — 学生会创建/停启用本校来源 SPONSOR 账号，后端强制 sourcedBySchoolId=本校 `apps/admin-web/src/app/(dashboard)/sponsors/page.tsx`
- [x] **个人账户页（商家入口）** — 组织/联系人/来源只读展示 + 改显示名 + 改密码 `apps/admin-web/src/app/(dashboard)/account/page.tsx`

### 广告投放与审核

- [x] **广告列表（三角色分支）** — 商家：我的广告+新建；学生会：待我审核/本校广告；团队：全量+状态/学校筛选，支持 ?status= 深链 `apps/admin-web/src/app/(dashboard)/ads/page.tsx`
- [x] **创建/编辑广告（商家）** — BUYOUT/CPM/CPC 三计价模式 + 多校选投 + 右侧实时报价（校覆盖价→全局默认）；仅 DRAFT/REJECTED 可编辑 `apps/admin-web/src/app/(dashboard)/ads/new/page.tsx`
- [ ] 🟡 **广告素材图片** — 素材为 URL 文本输入，无文件上传（DEVLOG 明确留待下阶段） `ads/new/page.tsx images 输入行`
- [x] **广告详情与全生命周期操作** — 商家提交/暂停/恢复，学生会审核（PENDING_UNION_REVIEW），团队审核+确认收款+强制下架/恢复；含曝光点击消耗统计与日趋势图 `apps/admin-web/src/app/(dashboard)/ads/[id]/page.tsx`
- [ ] **商家充值/在线支付** — 无支付渠道，收款靠团队线下「确认收款」流转状态；真实支付渠道留待下阶段 `ads/[id]/page.tsx confirm-payment`

### 内容审核 Moderation（团队全量 / 学生会本校）

- [x] **帖子管理 tab** — 板块/学校(仅团队)/状态/搜索筛选 + 查看/下架(原因必填)/恢复；学生会视角为「校园墙管理」后端强制本校 `apps/admin-web/src/app/(dashboard)/moderation/page.tsx PostsPanel`
- [x] **举报队列 tab** — reported=true 预筛的被举报帖列表，多「清除举报」操作（自动隐藏帖同时恢复展示） `moderation/page.tsx PostsPanel reported`
- [x] **投票审核 tab** — 校园墙投票帖 pending/approved/rejected 三态，通过/驳回可填理由；团队视图带 hasUnionReviewer 徽标 `moderation/page.tsx PollsPanel`
- [x] **用户反馈 tab（团队专属）** — H5 反馈表单（bug/举报用户/不当内容等分类）列表 + 标记已处理/回退；学生会不可见（后端 403） `moderation/page.tsx FeedbackPanel`

### 活动管理（团队 + 学生会）

- [x] **活动列表与状态流转** — 标题/学校/时间/票价/已售/状态列表 + 停售/恢复/取消；SPONSOR 被 RoleGate 拦截 `apps/admin-web/src/app/(dashboard)/events/page.tsx`
- [x] **发布活动** — Modal 表单（价格元转分、容量、场地），学生会自动本校/团队留空=全网，创建同时生成广场活动帖 `events/page.tsx 创建表单`
- [x] **购票名单与入场核销** — 按活动查看购票名单（票码/状态/持有人）；顶部输入票码核销，防重复核销（购票支付本身在 H5 侧为 mock） `events/page.tsx checkinEventTicket/getAdminEventTickets`

### 财务与收益提现

- [x] **提现审核（团队）** — 提现列表 + 状态筛选 + 通过/驳回（带备注）+ 标记已打款（负数入账） `apps/admin-web/src/app/(dashboard)/finance/page.tsx tab1`
- [x] **赞助发放（团队）** — 选学校发放 SPONSOR_GRANT 额度 + 所选学校发放记录 `finance/page.tsx tab2`
- [x] **分校收入报表（团队）** — 日期范围筛选 + 分校流水/学校分成/平台留存/发放/已提现报表含合计行 `finance/page.tsx tab3 getRevenueReport`
- [ ] 🟡 **手工账目调整** — createAdjustment API 已封装但无页面接线（正负调整入账无 UI 入口） `src/lib/api.ts:381，全局无调用点`
- [x] **学生会收益提现页** — 余额/累计收入/冻结统计 + 绑定银行卡 + 申请提现（校验余额与绑卡）+ 提现记录与收支明细分页 `apps/admin-web/src/app/(dashboard)/earnings/page.tsx`

### 官网提交（SUPER/TEAM）

- [x] **赞助申请处理** — 官网合作表单落库队列：标记已联系/关闭（原因必填）/重新打开，状态筛选+去抖搜索+留言查看 `apps/admin-web/src/app/(dashboard)/submissions/page.tsx tab1`
- [x] **一键开通账号** — 由申请直接创建学生会（选校或新建学校）或商家后台账号，随机密码生成 + 一次性凭据卡；APPROVED 仅可经开通达成 `submissions/page.tsx convertSubmission`
- [x] **候补名单查看** — type=WAITLIST 只读列表 + 标记已联系/关闭/重开 `submissions/page.tsx tab2`

### 广场官方发帖

- [x] **官方发帖页** — 推荐流/校园墙选板块，authorType 按登录角色推导锁定（学生会锁本校、商家强制 Sponsored、SUPER 不可直接发帖） `apps/admin-web/src/app/(dashboard)/square-post/page.tsx`
- [ ] 🟡 **发帖图片** — 图片同为 URL 文本输入，无文件上传 `square-post/page.tsx imageInput`

### 问卷管理（SUPER/TEAM）

- [x] **问卷版本列表与发布** — 恋爱/朋友两类问卷版本创建 + 发布确认（ConfirmDialog） `apps/admin-web/src/app/(dashboard)/questionnaire/page.tsx`
- [x] **题目管理** — 版本详情内加题（单选/多选/量表/文本四题型，选项编辑）、启停、删除 `apps/admin-web/src/app/(dashboard)/questionnaire/[id]/page.tsx`
- [ ] 🟡 **题目编辑（改题面）** — updateQuestion API 已封装但页面无编辑入口（只能删了重加） `src/lib/api.ts:278，全局无调用点`

### 匹配管理（SUPER/TEAM）

- [x] **匹配计划配置** — Cron 表达式 + 描述 + 启停开关编辑保存 `apps/admin-web/src/app/(dashboard)/matching/page.tsx Config Card`
- [x] **手动触发匹配** — 一键触发恋人+朋友双模式匹配任务入队 `matching/page.tsx handleTrigger`
- [x] **匹配任务列表与重试** — 最近任务状态/候选数/配对数/触发方 + 失败任务重试 `matching/page.tsx jobColumns`
- [ ] 🟡 **匹配结果/任务详情查看** — getMatchResults、getMatchJobDetail API 已封装但无页面展示配对明细 `src/lib/api.ts:309-311，全局无调用点`

### 系统设置（SUPER 专属）

- [x] **广告计价默认值** — BUYOUT 日价/CPM/CPC 全局默认价（元显示分存储） `apps/admin-web/src/app/(dashboard)/settings/page.tsx`
- [x] **SystemConfig 全量编辑** — 全部系统配置项 JSON textarea 逐行编辑保存（端点未收进 api.ts，页面内直连 axios 实例） `settings/page.tsx getConfigs/updateConfig`

## 官网

> apps/website 纯静态双语官网（nginx 容器托管，Caddy 反代 unimatcha.ai）：主页 + 4 内容页 + 2 法务页 + 404，共享脚手架 i18n，悬浮智能客服，统计/倒计时/两个表单对接后端 public 接口，已生产上线

### 主页 index.html

- [x] **页眉与导航** — 品牌标 UNIMATCHA+BETA 角标、四子页导航（赞助/安全/帮助/关于）、语言切换按钮、「获取 App」霓虹 CTA、≤920px 汉堡抽屉菜单 `index.html:727-746、site.css .beta-tag`
- [x] **Hero 区（旋转点阵地球）** — 标语+双 CTA、canvas 点阵地球（大洲 RLE 掩码、悬停显示各洲高校 tooltip、reduced-motion 降级）、三项统计小卡 `index.html:751-776、脚本 1610-1688 行 rotating dotted Earth`
- [x] **统计带（数字滚动动画）** — 在册用户/成功配对/覆盖院校/已运行轮次四项，countUp 缓动动画，data-stat 由后端活数据覆盖，失败保留静态回退值 `index.html:780-786、countUp 函数 1547 行`
- [x] **功能展示屏一：匹配（#features）** — ROUND 轮次标签+周五 17:00 倒计时卡+手机 mockup 轮播（按真实 H5 界面复刻：匹配中/问卷/聊天空态 3 页，拖拽+自动翻页）+「四步开启一段关系」步骤条 `index.html:794-915、phone mockup carousels 脚本 1823 行`
- [x] **功能展示屏二：校园墙（#wall）** — 校园墙/匿名树洞双 tab 折叠面板、八个常见板块 chips、第二台手机 mockup（广场/推荐/Profile 3 页）；两屏经 #showpin 滚动连续交叉淡化切换（不锁滚动，≤920px 回退） `index.html:917 起、#showpin 793 行、crossfade 脚本 1797 行`
- [x] **「不止于此」价值观网格（#more）** — 8 张卡：认真连接宣言/周五 17:00/长期关系+朋友/校园墙/.edu 认证/院校数统计/赞助学生会/少而精 `index.html:1056 起（sec bg-warm #more）`
- [x] **学生评价轮播（#reviews）** — 6 条双语评价卡片堆叠轮播，前后按钮+计数+5.5s 自动播放+reduced-motion 停用，数据在 REVIEWS 常量（演示文案） `index.html:1117-1130、REVIEWS 1433 行`
- [x] **赞助霓虹海报区（#partners）** — 霓虹绿满幅海报+上下双向跑马灯边框，CTA 指向 sponsors.html#apply 合作表单 `index.html:1136 起（sponsor-neon）`
- [ ] 🟡 **获取 App + 候补名单（#getapp）** — 变形 blob 点阵背景动画+邮箱候补表单（接后端）已完成；App Store / Google Play 徽章为「敬请期待」占位无真实链接（应用未上架） `index.html:1196-1226、ga-badge aria-disabled`
- [x] **首页内嵌 FAQ 区（#faq）** — 5 问手风琴+「前往帮助中心查看全部」入口（不带数字避免扩容改动） `index.html:1231 起、i18n faq.q1-q5`
- [x] **页脚** — 品牌标+四子页/法务页/H5 应用（app 子域）链接、contact@unimatcha.ai、©2026 `index.html:1266-1300`
- [x] **SEO 头部（favicon/OG/Twitter 卡）** — SVG data-URI favicon、apple-touch-icon、OG/Twitter 分享卡、theme-color，标题含「匹配 × 校园墙」双定位 `index.html:6-15、apple-touch-icon.png/favicon-192.png`

### 子页 sponsors.html（学生会合作）

- [x] **PARTNER 描边字 hero** — 「我们在找学生会合作」定位（非广告招商页） `sponsors.html:59-64`
- [x] **后台系统三视图演示（暗色区）** — 照真实 admin-web 复刻的浏览器框 mockup：学生会总览/校园墙管理/广告审核三 tab 切换，内部文字全量双语 `sponsors.html:74-216、site.js console-tabs 逻辑`
- [x] **真金赞助霓虹 band** — 「我们还真金白银地赞助你的活动」强调条，不展开细节 `sponsors.html:218-224（.sp-band）`
- [x] **合作联系表单（#apply）** — 学生会名称/邮箱/留言 → POST /public/sponsor-application，成功卡切换，失败回退 mailto；与后台「官网提交→一键开通学生会账号」工作流闭环 `sponsors.html:227-256、site.js sponsorForm 56-81 行`

### 子页 safety.html（安全与信任）

- [x] **SAFE hero + .edu 认证分栏** — 「每个人都是真实的同学」认证资料视觉卡（人名/兴趣标签双语） `safety.html:46-88`
- [x] **匿名化名机制分栏** — 「匿名保护你，不保护越界」真实名→化名转换视觉卡 `safety.html:90-124`
- [x] **举报三步流程** — 看到不对劲三步处理（学生会先审/平台复核/结果通知） `safety.html:126-139`
- [x] **数据四条底线（暗色编号行）** — sec-dark + edrows 编辑部式编号大行 `safety.html:141-157`
- [x] **社区红线跑马灯 + 联系区** — 黑色斜切跑马灯六项红线（双语）+ 邮箱联系兜底 `safety.html:159-176（.mq）`

### 子页 faq.html（帮助中心）

- [x] **45 问六分类手风琴** — 账号/匹配/校园墙/能量/安全/赞助合作六组（g-account 等 id），左侧筛选式目录：点分类只显示该类、支持 #g-xxx 深链、切换写回 URL hash `faq.html:72-277、site.js showGroup 98-124 行`
- [x] **跨语言真搜索** — 同时索引 data-zh/data-en 原始文案（惰性缓存 __hay），命中与显示语言无关，跨全部分类过滤、清空恢复当前分类 `site.js itemHaystack 126-151 行`
- [x] **「没找到答案」兜底区** — 引导邮件人工支持 `faq.html:278`

### 子页 about.html（关于我们）

- [x] **MATCHA hero + 宣言** — 「我们在认真做一件事」宣言分栏 `about.html:57-84`
- [x] **活数据统计带** — data-live-stat 元素由 /public/site-stats 覆盖（users/matches/schools/rounds），失败保留静态回退 `about.html、site.js 83-96 行`
- [x] **信条编号行 + 学生打造 + 联系区** — 「我们相信的事」edrows、「为校园而生由学生打造」、联系 CTA；团队故事等真实素材仍待补（日志遗留） `about.html:86-128、CLAUDE.md 7/16 待办`

### 法务页与 404

- [x] **terms.html 用户协议** — 中英双份完整 9 节（资格 18+/.edu、行为红线、内容授权、能量非货币可退、免责、账号处置），按 data-lang 内容块整页切换 `terms.html:48-168`
- [x] **privacy.html 隐私协议** — 中英双份 8 节（收集/使用/共享/存储安全/权利/未成年人/更新/联系），含「官网提交」数据类别并互链 terms `privacy.html:48-148`
- [x] **404.html 错误页** — 「这一页没匹配上」双语 + 描边 404 大字；nginx error_page 接入；八页中唯一未引 chat.js `404.html:28-32、nginx.conf error_page`

### 共享脚手架与 i18n

- [x] **site.css 组件库** — 同源设计令牌+页眉页脚+页面组件：page-hero/bigword 描边字/mq 斜切跑马灯/edrows 编号行/split 分栏/sec-dark 暗区/vis 视觉卡/form-card/console 后台 mockup/faq 布局/beta-tag `site.css（22585B）`
- [x] **site.js 子页共享脚本** — 语言切换(um_lang localStorage 与 index 互通、data-zh/data-en/占位符/页标题联动)、汉堡菜单、reveal 入场 IntersectionObserver、FAQ 手风琴、console tab、两处后端接线 `site.js 全文 152 行`
- [x] **index 独立 i18n 词典** — 主页用 data-i18n/data-i18n-html + 内联 I18N 中英词典（首访默认英文），与子页 data-zh/data-en 属性机制并存；手机 mockup/地球 tooltip 全量双语 `index.html:1303-1431 i18n 段、applyLang 1419 行`
- [x] **语言纯净化审计** — iframe 审计脚本逐页扫描：英文态 7 页 CJK 残留=0、中文态仅图标名与专有名词（7/16 完成） `CLAUDE.md 2026-07-16 日志`

### 智能客服 chat.js

- [x] **悬浮客服组件** — 自包含（自注样式+DOM，7 页一行引入）：荧光绿悬浮球+聊天面板+打字动画+快捷问题 chips `chat.js、各 html 引入（404 除外）`
- [x] **关键词知识库问答** — 16 个意图双语知识库（公布时间/模式区别/能量/增强/匿名/注销/密码/赞助/广告/下载/举报/隐私/学校/没匹配/问卷/分数/人工），关键词评分匹配、答案可带跳转链接、fallback 引导帮助中心+邮箱 `chat.js KB 数组 7-64 行`
- [x] **语言联动** — 跟随 um_lang，MutationObserver 监听 html[lang] 变化实时切换界面与回答语言 `chat.js lang() 79 行、CLAUDE.md 7/16`
- [ ] **知识库与 FAQ 数据源统一维护** — 现为两处手工维护，日志记录「后续可改为从 faq.html 数据源生成」 `CLAUDE.md 2026-07-16 待办`

### 后端 public 接口对接

- [x] **活数据统计 GET /public/site-stats** — index 7 处 data-stat + about data-live-stat 覆盖真实 users/matches/schools/roundsCompleted，ROUND 标签用 currentRound；API 不可达静默回退静态假数（42137 等为演示值） `index.html:1574-1589、site.js 83-96、后端 apps/api/src/public`
- [x] **下一轮公布倒计时** — CD_TARGET 取后端 nextRevealAt（MatchConfig.cronExpr 计算），失败回退本地「下周五 17:00」 `index.html:1555-1573`
- [x] **候补名单 POST /public/waitlist** — #getapp 邮箱表单，携 locale，成功显示确认文案，失败回退 mailto；后端 (type,email) 幂等 upsert + IP 限流 `index.html:1591-1608`
- [x] **合作申请 POST /public/sponsor-application** — sponsors 页表单，成功态卡片，失败回退 mailto；已 E2E 验证落库并接通后台 /submissions 处理工作流 `site.js 56-81、CLAUDE.md 7/16-7/17 日志`
- [x] **API 地址自动切换** — 按 hostname 切 localhost:3001 / api.unimatcha.ai（index 与 site.js 各一份） `site.js:4-5`

### SEO 与部署

- [x] **robots.txt + sitemap.xml** — 全站放行 + 7 页 sitemap（unimatcha.ai 域，含 changefreq/priority） `robots.txt、sitemap.xml`
- [x] **nginx.conf 缓存与 404 策略** — 媒体 30 天 immutable / css·js 1 小时 / HTML 5 分钟分级缓存，error_page 404 接自定义页 `nginx.conf`
- [x] **Dockerfile 静态镜像** — nginx:alpine 拷入全站，nginx.conf 构建后从网页根删除避免外泄；compose website 服务 + Caddy 主域反代，八容器生产已上线 `Dockerfile、.dockerignore、CLAUDE.md 7/17 部署日志`
- [ ] **hero 视频素材 _clip-a/b.mp4** — 两段备用素材（配对/相遇，共约 5MB）在仓库内但无任何页面引用，hero 视频改版待用户拍板 `grep 无引用、CLAUDE.md 7/14 备注`

## iOS 客户端 + 旧版 Web 官网

> apps/ios 为 2026-07-13 按当前后端契约整体重写的 SwiftUI 客户端（39 个 .swift、5 Tab 约 24 屏、12 个域 Service），主流程代码完整但存在多处留桩（头像/发图无选择器、认证只发码不提交、埋点未接线），且从未经真机/模拟器构建验证，并缺 7/18 之后的投票/活动/广告等新功能；apps/web 为已弃用的旧版 Next.js 官网（被 apps/website 取代、不再部署、内容过时）。

### iOS·工程基座与应用框架

- [x] **XcodeGen 工程与构建配置** — project.yml 文本工程（iOS 16+/Swift 5.9，无第三方包）+ Info.plist API_BASE_URL 配置 + README 构建说明 `apps/ios/project.yml`
- [x] **APIClient 网络内核** — 泛型请求（{success,data,message} 信封解包）、Bearer 注入、401 自动清 token、multipart 图片上传 /uploads/image `apps/ios/Unimatcha/Network/APIClient.swift`
- [ ] 🟡 **TokenStorage 登录态持久化** — UserDefaults 存 token+用户，README 明确注明发布前应换 Keychain；ATS 允许任意 http 也需收紧 `apps/ios/Unimatcha/Network/APIClient.swift:160`
- [x] **Theme 暗色霓虹绿设计令牌** — 全局颜色/圆角/渐变集中管理，无散落色值；注意为暗色主题，与 H5 当前的浅色 UI 风格不一致 `apps/ios/Unimatcha/App/Theme.swift`
- [x] **启动页 → 鉴权门 → 5 Tab 主壳** — SplashView / RootView / MainTabView（匹配·聊天·广场·消息(带未读角标)·我的） `apps/ios/Unimatcha/App/RootView.swift`
- [ ] ❓ **构建验证** — 重大风险：全部约 39 个 .swift 从未在真机/模拟器编译运行过（开发机为 Windows 无 Swift 工具链），仅经并行代理静态复核，能否一次编译通过未知 `CLAUDE.md 2026-07-13 日志「本机无 Swift 工具链…静态复核」`
- [ ] **App 图标** — AppIcon 为占位空集，README 注明提交前需补真实图标 `apps/ios/Unimatcha/Assets.xcassets/AppIcon.appiconset`

### iOS·网络服务层（12 个 Service）

- [x] **Auth / Profile / Metadata 服务** — 注册登录、/users/me 读写、公开资料、设置、连接码、改密、发认证码、英国城市/大学/专业/MBTI/国籍元数据 `apps/ios/Unimatcha/Network/AuthService.swift`
- [x] **Matching 双模式服务** — status/result/start(增强+格数)/stop/connect(码与用户)/confirm/dissolve/偏好读写/里程碑，契约与后端对齐 `apps/ios/Unimatcha/Network/MatchingService.swift`
- [x] **Chat 服务** — 会话列表、消息分页、增量 poll、发送、已读、未读数、拍一拍 nudge、聊天背景、nudge 后缀 `apps/ios/Unimatcha/Network/ChatService.swift`
- [x] **Square v2 服务** — 推荐流/校园墙分页、详情、发帖、点赞、评论（含楼中楼）、举报、删帖 `apps/ios/Unimatcha/Network/SquareService.swift`
- [x] **Couple / Energy / Notification 服务** — 情侣空间全套（封面/我爱你/状态/想吃/心愿/纪念日）、能量余额/套餐/购买确认/签到领取/流水、通知列表与已读 `apps/ios/Unimatcha/Network/CoupleService.swift`
- [x] **Questionnaire / Report / Upload 服务** — 按模式取问卷、完成度、交卷；用户反馈 /reports；图片上传返回 URL `apps/ios/Unimatcha/Network/QuestionnaireService.swift`

### iOS·鉴权与引导流程

- [x] **登录 / 注册表单** — AuthView 切换登录/注册，输入校验+按钮禁用态 `apps/ios/Unimatcha/Views/Auth/AuthView.swift`
- [x] **引导协调器** — 登录后判定：无资料→建资料→可选问卷→主界面；问卷可跳过，进匹配时再触发 `apps/ios/Unimatcha/Views/Onboarding/OnboardingCoordinator.swift`
- [x] **首次资料设置页** — 昵称/学校/城市/专业/年级/性别/兴趣等完整表单（508 行），元数据下拉带搜索 `apps/ios/Unimatcha/Views/Onboarding/ProfileSetupView.swift`
- [x] **问卷答题页** — 按模式取活跃问卷逐题作答并提交；无 H5 后来加的题目导航网格与双语题面 `apps/ios/Unimatcha/Views/Onboarding/QuestionnaireView.swift`

### iOS·匹配域

- [x] **匹配主页（双模式状态机）** — 恋人/朋友切换，idle/searching/noMatch/matched·confirming/relationship 五态渲染，下拉刷新 `apps/ios/Unimatcha/Views/Matching/MatchTabView.swift`
- [x] **增强匹配购买 Sheet** — 读能量余额、选格数、带 enhanced/cells 调 /matching/start `apps/ios/Unimatcha/Views/Matching/EnhancedSheet.swift`
- [x] **匹配偏好筛选** — MatchFilterView 按模式读写 /matching/preferences `apps/ios/Unimatcha/Views/Matching/MatchFilterView.swift`
- [x] **对方公开资料页** — PartnerProfileView 展示公开资料+认证徽标 `apps/ios/Unimatcha/Views/Matching/PartnerProfileView.swift`
- [ ] 🟡 **行为埋点上报（viewed/openedProfile）** — MatchingService.reportFeedback 已封装但全工程无任何调用点——P1-6 埋点只接了 H5，iOS 留桩 `apps/ios/Unimatcha/Network/MatchingService.swift:54（grep 无调用方）`

### iOS·聊天域

- [x] **会话列表** — 全模式会话+未读数展示 `apps/ios/Unimatcha/Views/Chat/ChatSessionsView.swift`
- [x] **聊天会话页** — 历史分页、定时增量轮询（进入启动/离开停止）、发文字、拍一拍、图片消息可显示 `apps/ios/Unimatcha/Views/Chat/ChatView.swift`
- [ ] 🟡 **发送图片消息** — 协议层支持 imageUrl、气泡能渲染图片，但无图片选择器 UI，只能发文字（全工程无 PhotosPicker/UIImagePickerController） `apps/ios/Unimatcha/ViewModels/ChatViewModel.swift:33-38`

### iOS·广场域

- [x] **双信息流（推荐/校园墙）** — 分页加载更多、匿名帖化名与化名头像渲染 `apps/ios/Unimatcha/Views/Square/SquareTabView.swift`
- [x] **帖子详情** — 全文+图片、点赞即时反馈、评论+一层楼中楼、举报（带原因）、删自己的帖 `apps/ios/Unimatcha/Views/Square/PostDetailView.swift`
- [ ] 🟡 **发帖** — 板块选择/标题/正文/匿名开关完整，但 images 固定传 nil——不能发图（上传管线在 APIClient 已具备） `apps/ios/Unimatcha/Views/Square/CreatePostView.swift:175-182`
- [ ] **校园墙投票（发起/投票/占比条）** — 7/18 后端+H5 已上线的投票功能 iOS 完全没有（模型无 pollOptions，grep 无命中） `apps/ios/Unimatcha/Models/Square.swift（无 poll 字段）`
- [ ] **活动卡/购票/我的票夹** — events/门票/二维码票夹为 H5+admin 专属，iOS 无任何对应代码 `apps/ios 全目录 grep event/ticket 无命中`
- [ ] **广告 SPONSORED 卡与曝光计费** — H5 广场有广告注入+事件上报，iOS 信息流不渲染广告也不上报 `apps/ios 全目录 grep sponsored/ad 无命中`

### iOS·情侣空间 / 能量 / 通知

- [x] **情侣空间** — 封面、我爱你计数、状态/想吃、心愿单勾选、纪念日，全部接 CoupleService `apps/ios/Unimatcha/Views/Couple/CoupleSpaceView.swift`
- [ ] 🟡 **能量中心** — 余额/每日签到/套餐充值/流水完整；购买为 mock 支付（选套餐→建单→立即确认 transactionId=mock-*，与后端 mock 支付一致，真支付渠道全平台未接） `apps/ios/Unimatcha/Views/Energy/EnergyView.swift`
- [x] **通知中心** — 列表分页、未读角标（Tab badge）、单条/全部已读 `apps/ios/Unimatcha/Views/Notifications/NotificationsView.swift`

### iOS·我的（资料/设置/连接码）

- [x] **个人主页** — 头像/认证徽标/完成度/菜单行（能量、连接码、设置等入口） `apps/ios/Unimatcha/Views/Profile/ProfileTabView.swift`
- [ ] 🟡 **编辑资料** — 基本信息/人格/签名/标签/简介/社交账号全表单完整；但头像上传 UI 留桩（界面写死「头像上传即将开放」，VM 的 uploadAvatar 无人调用）；仍用 age 数字，未跟进后端 7/18 新增的生日字段 `apps/ios/Unimatcha/Views/Profile/ProfileEditView.swift:87`
- [x] **设置页（改密/偏好/退出）** — 修改密码、用户设置读写、退出登录 `apps/ios/Unimatcha/Views/Profile/SettingsView.swift`
- [ ] 🟡 **校园邮箱认证** — 只做了「发送验证码」并显示 devCode；后端有 POST /users/me/verification/submit 提交验证码接口，iOS 无提交入口，认证流程走不完 `apps/ios/Unimatcha/Views/Profile/SettingsView.swift:130-165`
- [ ] 🟡 **连接码（QR 展示 + 手输添加好友）** — CoreImage 生成我的二维码、手输对方连接码建好友会话均完整；但无相机扫码（无 AVFoundation），「扫一扫」缺失 `apps/ios/Unimatcha/Views/Profile/ConnectCodeView.swift`

### iOS·横向差距与风险汇总

- [ ] ❓ **从未构建/运行验证** — 整个 App（2026-07-13 重写）仅静态复核，未经 Xcode 编译、模拟器或真机冒烟，属上架前必须补的第一步 `CLAUDE.md 2026-07-13 日志`
- [ ] **落后 H5 的功能面** — 投票、活动票务、广告、生日字段、行为埋点、双语 i18n（iOS 纯中文硬编码）、瀑布流/下拉刷新等 7/18 以后的所有 H5 迭代均未同步 `CLAUDE.md 2026-07-18 起日志 vs apps/ios 代码`
- [ ] ❓ **视觉基调与产品现状不一致** — iOS 为暗色霓虹绿主题，而 H5 实际产品是浅色 UI（官网 mockup 亦按浅色复刻），是否重做视觉待产品决策 `apps/ios/Unimatcha/App/Theme.swift`

### Web 端（apps/web）·定位与状态

- [x] **当前定位：已弃用的旧版官网** — Next.js 14 (App Router)+Tailwind 的营销官网（端口 3003），已被 apps/website 静态站取代；docker-compose 注释明确「apps/web 为已弃用的旧版 Next 官网，不再部署」，git 上仅一次提交（0f59f01 品牌重命名）后再无维护 `docker-compose.yml:132 注释`
- [x] **落地页内容（单组件移植版）** — Landing.tsx 单客户端组件注入整页 HTML+自带 vanilla JS 引擎：点阵地球 canvas、粒子、中英切换、周五 17:00 倒计时、校园墙 folder 演示、count-up 统计、Lenis 平滑滚动（respect reduced-motion）；@ts-nocheck 且构建关闭 TS/ESLint 检查 `apps/web/components/Landing.tsx`
- [ ] 🟡 **内容已过时（与现网不符）** — 统计为硬编码假数据（42137 用户等，未接 /public/site-stats）、倒计时纯本地计算、邮箱仍是旧域 hello@/partner@unimatcha.com（现网为 contact@unimatcha.ai）、候补名单只是 mailto 未接 /public/waitlist 接口、品牌标仍带旧 blip 圆点 `apps/web/components/Landing.tsx:44-46`
- [ ] **动画栈升级计划（GSAP/Framer/R3F 组件化）** — gsap/framer-motion 已装未用，README 规划把 Landing 拆成类型化 React 组件并迁移动画，但该方向已随 apps/website 取代而失去意义 `apps/web/README.md:26-45`

## 匹配模型服务

> 规则+微调 LLM 混合匹配服务：规则侧流水线（硬门→画像→召回→judge→融合→GS 稳定匹配→会员保障）与鉴权/部署/反馈闭环地基全部真实实现并在生产以 mock（规则）后端运行；4 个 LoRA 已在训练服务器训出多版但未合并部署，线上未切真实 LLM；ranker 训练管线可跑但无已训模型，仍用手写融合权重。

### API 层与服务接入

- [x] **FastAPI 匹配服务（POST /match + GET /health）** — 契约与 NestJS ai-match-model.provider 1:1（candidates/constraints → MatchResult），/health 返回当前 llm_backend `matching-ml/app/main.py`
- [x] **Bearer 鉴权（fail-closed）** — MATCH_API_KEY 常量时间比对；空 key 仅允许回环地址绑定，非回环+空 key 拒绝启动（P0-5） `matching-ml/app/main.py require_api_key/lifespan`
- [x] **环境配置层** — pydantic-settings 读 .env：backend/阈值/召回 K/匹配目标/ranker 路径全部环境可调 `matching-ml/app/config.py`
- [x] **Docker 化与 compose 接线** — 独立 Dockerfile + compose matching-ml 服务（仅内网可达，api 走 AI_PROVIDER_URL=http://matching-ml:8100/match） `matching-ml/Dockerfile`
- [x] **NestJS 后端 provider 对接** — 后端 AIMatchModelProvider 按 env 开关选择（设 AI_PROVIDER_URL 即启用，MATCH_MODEL=scoring 一行回退），P0-1 已完成 `README.md §7`

### 匹配流水线核心（规则侧，全部真实实现）

- [x] **硬门过滤** — 性别（per-mode preferredGender 优先）/年龄/城市等硬约束双向校验，逐行移植自 NestJS ScoringProvider；恋爱模式性别偏好强制、朋友模式填了才生效 `matching-ml/app/pipeline/rules.py passes_hard_gate`
- [x] **规则打分（问卷+人口学）** — questionnaire_score（分题组权重）+ demographic_score，题组权重按模式配置 `matching-ml/app/pipeline/rules.py`
- [x] **语义画像抽取 Extractor（规则版）** — 词典驱动：否定/对象识别、dealbreaker 抽取、认真度线索，与 LLM 版同 schema `matching-ml/app/pipeline/extractor.py RuleBasedExtractor`
- [x] **Pair Judge（规则版）** — 代码强制 dealbreaker 碰撞（香菜硬冲突/猫狗非冲突/认真度冲突），输出中文理由与风险 `matching-ml/app/pipeline/pair_judge.py RuleBasedJudge`
- [x] **召回层（规则 top-K）** — 便宜前置分控制 Judge 调用量（RECALL_TOP_K/JUDGE_MIN_PREFILTER）；embedding 双塔召回为路线图 todo `matching-ml/app/pipeline/recall.py`
- [x] **Fusion 融合打分** — LLM/问卷/画像/语义/互补按 ModeProfile 权重加权 + severity-5 硬冲突一票淘汰 + 风险扣分 `matching-ml/app/pipeline/fusion.py`
- [x] **matchBasis 依据加权** — 双方一致选 questionnaire/profile 时弱化另一侧组件（DOWN=0.15）并归一化回 0..100；分歧/缺省回退 both 输出逐字节不变 `matching-ml/app/pipeline/fusion.py _pair_basis`
- [x] **方向性欲望度 + 调和平均 mutual score** — d(a→b)/d(b→a) 分别计算后调和平均，惩罚一头热 `matching-ml/app/pipeline/pairscore.py`
- [x] **全局匹配（Gale-Shapley 稳定匹配 + b-matching）** — 恋爱=GS 稳定一对一（二部图零阻塞对，非二部图阻塞对消除+审计计数）；朋友=带容量贪心 b-matching；greedy 保留作 A/B。朋友模式『稳定 b-matching』仍是路线图 todo `matching-ml/app/pipeline/global_match.py`
- [x] **会员保障 + 空池退款 + 公平优先** — H5：会员不降硬门、低于阈值保留最优可行对象（guaranteedForMember 标记）、真空池才退款；长等待用户优先（fairness_wait_rounds 反马太） `matching-ml/app/pipeline/orchestrator.py`
- [x] **编排器与可审计 metadata** — 串起硬门→画像→召回→judge→融合→全局匹配；每对带 scoreBreakdown/reasons/risks/模型版本/宪法版本/特征快照/方向性分 `matching-ml/app/pipeline/orchestrator.py`
- [x] **交友/恋爱双模式配置（ModeProfile）** — 一套算法两份配置：题组权重/融合权重/独占 vs 多朋友拓扑/花费(3 vs 1 能量)/退款集中在一个配置对象 `matching-ml/app/mode_profile.py`

### 宪法与理由生成

- [x] **匹配宪法 Constitution** — 硬条款 H1-H5 代码强制（rules/fusion）+ 软条款 S1-S6 前置进所有 LLM 系统提示词；CONSTITUTION_VERSION 盖进每对 metadata 可回放审计 `matching-ml/app/constitution.py`
- [x] **匹配理由/风险生成** — Judge 输出中文 positiveReasons/cautionReasons，经 fusion 进 metadata.reasons/risks（生产实测 metadata 含中文理由） `matching-ml/app/pipeline/pair_judge.py`

### LLM 后端（当前 mock，微调已起步未上线）

- [x] **mock 规则后端（当前生产在用）** — LLM_BACKEND=mock 为缺省与生产现状，规则版与真模型输出完全同 schema，端到端可跑 `matching-ml/app/config.py llm_backend='mock'`
- [ ] 🟡 **Ollama 客户端与 LLM 推理路径** — OllamaClient（/api/chat + format:json）、LlmExtractor/LlmJudge 代码就绪，LLM_BACKEND=ollama 一键切换；但线上从未启用、未接真模型验证 `matching-ml/app/llm/client.py`
- [x] **LLM 故障自动降级** — LLM 出错/返回非法 JSON 时逐用户/逐对回退规则路，匹配任务永不硬失败 `matching-ml/app/pipeline/extractor.py:133-135`
- [ ] 🟡 **LoRA 微调（恋爱/交友 × 抽取/判断 共 4 个）** — 服务器（RTX 3090 + LLaMA-Factory + Qwen2.5-7B）已训出多版 adapter（rom-extractor v1-v3、rom-judge、friend-* 等，train_all.sh 注释可证），但产物不在仓库、未合并导出 GGUF/ollama 部署，线上服务未切换 `matching-ml/train_all.sh 头注释`
- [ ] **微调模型上线（ollama create + 切 backend）** — README §6.3 给出上线步骤，尚未执行；BACKLOG 待办『matching-ml 接真实 LLM』 `README.md §6.3/§9`

### 反馈闭环与 Ranker（V3 地基）

- [x] **曝光/行为 schema 与后端埋点表** — MatchExposure/MatchBehaviorEvent 两表已并入后端 Prisma 并在生产落库（P0-2），8 类行为事件全接线；H5 viewed/openedProfile 上报已完成（P1-6） `matching-ml/feedback/prisma_models.prisma`
- [x] **特征快照冻结** — build_snapshot 在匹配当时冻结特征写进 metadata.featureSnapshot，训练与推理同源防因果污染 `matching-ml/feedback/features.py`
- [x] **归因（last-touch）** — 事件归给 shownAt<=event.at 的最近一次曝光；没曝光不当负样本、举报=强负、bothActive 区分离线 `matching-ml/feedback/attribution.py（2026-07-13 从无窗池化修为 last-touch）`
- [x] **Ranker 训练脚本（LTR）** — 多任务四头（mutualConfirm/conversation/survive7d/report）合成 RankScore；LightGBM 优先、numpy 逻辑回归兜底，脚本可跑 `matching-ml/feedback/train_ranker.py`
- [x] **Ranker 热插拔接入流水线** — RANKER_MODEL_PATH 存在即替代手写融合权重排序；可行性门仍用 fusion 分（量纲修正，2026-07-13 ④） `matching-ml/app/pipeline/orchestrator.py:99-113`
- [ ] **已训练 ranker 模型** — ranker_model_path 缺省为空、仓库无 ranker.json——线上仍用手写 fusion 权重；需攒真实反馈后每周训（P1-2） `matching-ml/app/config.py:33`
- [ ] 🟡 **合成反馈生成器（仅测管线）** — gen_synthetic_feedback 造曝光+行为跑通『归因→训练→热插』全链路，明确声明不代表真实偏好（循环蒸馏警告） `matching-ml/feedback/gen_synthetic_feedback.py`
- [ ] 🟡 **曝光落库 sink** — 当前为 JSONL 文件版 JsonlSink，DB 写入留接口『换 DB 只改 sink』（后端侧曝光已直接落 Prisma，是另一条路径） `matching-ml/feedback/logging_sink.py`

### 训练数据与问卷契约

- [x] **合成数据生成 + SFT 数据集导出** — gen_synthetic 造画像/pair，build_extractor/judge_dataset 出 OpenAI 风格 JSONL（8:1:1 切分），与线上同一套 prompt 防训练-推理漂移 `matching-ml/data/gen_synthetic.py`
- [x] **mode-aware 自动弱标注** — autolabel_pairs 按模式差异打标（同一 dealbreaker 恋爱 HARD5/朋友 SOFT2 等），生成与标注同源 `matching-ml/data/autolabel_pairs.py`
- [x] **人工标注导出/回并** — export_for_annotation 抽样导出、merge_annotation 合并人工修正；运营打分工具本体仍是路线图 todo `matching-ml/data/export_for_annotation.py`
- [x] **LLaMA-Factory 训练配置** — dataset_info.json 注册 4 个数据集（rom/friend × extractor/judge），train_all.sh 一键训 4 LoRA（-vN 目录不覆盖可回滚）、TRAINING.md 全手册 `matching-ml/data/dataset_info.json`
- [x] **问卷设计契约 + 校验器** — 75 题带 matchSemantics(filter/similar/complement/freeform) × hardness(hard/soft) 双标签，validate.py 强制不变量并校验题组与 ModeProfile 权重一一对应 `matching-ml/questionnaire/uspark_questionnaire.json`

### 测试与评估

- [x] **端到端冒烟测试** — 6 个用例：香菜硬冲突/猫狗非冲突/完整 job 形状/稳定匹配打败贪心（零阻塞对）/ranker 学到注入信号/dealbreaker 压过软性 LLM 高分；日志多次记录 6/6 通过 `matching-ml/tests/test_pipeline.py`
- [x] **微调模型对抗评估脚本** — eval_rom_harsh/eval_friend_harsh（全新对抗输入按考点人审）+ eval_ext_compare（v1 vs v2 回归对比）；需在有 GPU/adapter 的服务器上跑（transformers+peft 直载 LoRA） `matching-ml/eval_rom_harsh.py`
- [ ] **上线前灰度评估流程** — schema 合法率/否定语义召回/硬冲突漏判率等指标与 5→20→50→100% 灰度仅写在文档，未执行（模型未上线） `README.md §6.4`

## 文档与部署运维

> 根目录文档体系完整（README 略过时），BACKLOG P0 六项中四项已完成、cron 切换与档位决策悬置；生产为 unimatcha.ai 八容器 Caddy 全自动 HTTPS 架构已稳定上线，散落待办以接真实 LLM、正式调度切换、真实支付为主。

### 根目录核心文档

- [ ] 🟡 **README.md（项目总览）** — 2026-08-13 已修：广场章节从**已下线的 v1 路径**（`/square/posts`，实际只挂 `/square/v2`，文档端点全 404）更正为 v2 全量端点、新增「搜索与发现」章节与隐私模型表、新增 pg_trgm 索引部署说明、默认管理员补 env 覆盖提示、模块图与目录树补 discovery。**仍待修**：ERD 与「核心表说明」停在单模式世代（无 UserModeState/能量/广告/活动等域）、排行榜章节仍在（后端保留但前端已下线）、快速开始的 5 服务端口直连与现八容器 + Caddy 生产架构脱节 `README.md`
- [x] **SCHEDULING.md（匹配调度与活动发布方案）** — 白话讲解 cron/MatchConfig；方案 A（改 cron 周日公布，零代码）步骤+文案齐备；方案 B（MatchRound 两阶段轮次）与 Announcement 公告系统仅为设计（对应 P1-4/P1-5 未实现） `SCHEDULING.md`
- [x] **DEPLOY.md（生产部署手册）** — unimatcha.ai 五子域架构表、Spaceship DNS 5 条 A 记录、生产 .env 模板（密钥/MATCH_API_KEY fail-closed/SEED_DEMO=false）、启动/验证清单/日常更新/常见问题，与实际上线流程一致 `DEPLOY.md`
- [x] **BACKLOG.md（待办与缺口总表）** — 项目「记忆备份」：已完成现状清单 + P0/P1/P2 分级待办 + 五项关键决策 + 纪律红线，更新至 2026-08-13（新增 P1-9 广场搜索纳入评论、P1-10 猜你认识用反馈调权）；逐条状态见下方专节 `BACKLOG.md`
- [x] **CLAUDE.md（每日日志制度）** — 日志规则+按日倒序开发日志（2026-07-03 起），是判断各待办完成状态的主要依据；超 30 条归档到 docs/DEVLOG-archive.md 的规则尚未触发（该文件不存在） `CLAUDE.md`

### docs/ 设计与规格文档

- [x] **PRD.md（业务与交互规格定稿）** — 2026-06-09 与产品确认的定稿：8 项决策清单、6 态匹配状态机、匹配页各状态交互、48h 确认限时；后被 DESIGN-DUAL-MODE 双模式设计迭代覆盖部分内容 `docs/PRD.md`
- [x] **DESIGN-DUAL-MODE.md（双模式重构设计·实现就绪版）** — 恋人+朋友双模式完整设计（§1.5 最终业务规则收口：双确认+48h 过期、3 tab 导航、删排行榜、广场改推荐+校园墙），含 schema/迁移/接口/验收用例；已按此实现落地 `docs/DESIGN-DUAL-MODE.md`
- [x] **ADMIN-REDESIGN.md（三角色后台+广告商业化设计）** — SUPER/TEAM/STUDENT_UNION/SPONSOR 四角色权限、BUYOUT/CPM/CPC 混合计价、分级审核、双档分成（bps）、提现流程的实施蓝本；2026-07-03/04 已全栈落地并对抗性审查 `docs/ADMIN-REDESIGN.md`
- [x] **matching-master.md / matching-data-inventory.md（匹配算法总参考+数据信号清单）** — 匹配可用的全部用户信号盘点（●必填/○稀疏/✗未用）、现有匹配系统结构与新算法接入面、问卷设计、已定/待定决策；是 matching-ml 设计的输入文档 `docs/matching-master.md、docs/matching-data-inventory.md`
- [x] **questionnaires-final-draft.md（恋爱 50 题问卷终稿）** — 犀利版恋爱问卷 50 题 5 维（恋爱观权重最高 0.25）；已进 seed 且 2026-07-24 补齐 75 题双语 titleEn `docs/questionnaires-final-draft.md`
- [ ] **friend-questionnaire-draft.md（朋友问卷 33 题重设计草稿）** — 拟以 6 维 33 题（社交风格权重 0.28 最高）替换现行 25 题朋友问卷，文档自述「待确认后再写进 seed」；现行 seed 仍为 25 题，草稿未落地 `docs/friend-questionnaire-draft.md`
- [x] **三份历史审计/修复记录（FIXLOG / BUSINESS-LOGIC-AUDIT / FRONTEND-LOGIC-ISSUES）** — 2026-06-09 约 30 处前后端契约 bug、06-20 后端业务逻辑 9 项（含能量白扣两 CRITICAL）、06-13 H5 前端 21 条 high 均已修复闭环，文档为存档 `docs/FIXLOG.md、docs/BUSINESS-LOGIC-AUDIT.md、docs/FRONTEND-LOGIC-ISSUES.md`
- [x] **H5-GAPS.md（H5 半成品清单）** — 2026-06-12 地毯式审计 31 项全部闭合（metadata 下拉/倒计时/偏好/发帖等），同时作为 iOS 端对齐功课单（iOS 已于 07-13 重写对齐） `docs/H5-GAPS.md`
- [x] **website-plan.md（官网技术路线交接文档）** — 官网选型/架构/部署路线与客户端-服务端边界心智模型；官网已按此建成并上线 unimatcha.ai `docs/website-plan.md`

### BACKLOG 待办逐条状态（P0 上线前必做）

- [x] **P0-1 接入 matching-ml（AIMatchModelProvider + env 开关）** — 07-13 代码接入（超时/结构校验/一行回退 MATCH_MODEL=scoring），07-17 生产八容器含 unimatcha_matching_ml；当前 LLM_BACKEND=mock 规则档 `BACKLOG.md P0-1`
- [x] **P0-2 埋点两张表（MatchExposure + MatchBehaviorEvent）** — 曝光/8 类行为事件服务端落库+防伪造端点 07-13 完成，H5 viewed/openedProfile 上报 07-21 接入，全链路 E2E 验证 `BACKLOG.md P0-2`
- [ ] 🟡 **P0-3 调度 A 方案（cron 切每周日公布+开场公告）** — 文档与脚本齐备（scripts/set-weekly-schedule.sh），但正式运营切换始终未执行，生产仍为每周五 17:00 公布；日志多次列为待办 `SCHEDULING.md`
- [ ] 🟡 **P0-4 阈值校准（SCORE_THRESHOLD）** — mock 档 60 分阈值 E2E 表现正常；07-13 已修 orchestrator 阈值门改用 fusion 分（量纲问题）；切真模型/开 ranker 后仍需重新校准 `BACKLOG.md P0-4`
- [x] **P0-5 /match 接口鉴权（MATCH_API_KEY）** — Bearer constant-time 校验、空 key 非回环 fail-closed 拒绝启动，401/401/200 矩阵验证；生产 compose/env 已接线 `BACKLOG.md P0-5`
- [ ] 🟡 **P0-6 上线档位决策（规则/prompt/微调）** — 事实上以 LLM_BACKEND=mock 规则档上线（产品能跑、数据先积累）；切 prompt 版/微调版的正式决策与实施未做 `BACKLOG.md P0-6`

### BACKLOG 待办逐条状态（P1 上线后迭代 / P2 远期）

- [ ] **P1-1 人工标注工具（pair 打分后台页）** — Pair Judge 微调的主要真数据来源，代码无任何实现痕迹 `BACKLOG.md P1-1`
- [ ] 🟡 **P1-2 每周训 ranker（LTR）** — 训练脚本 feedback/train_ranker.py 与热插机制已备，但真实数据例行训练未开始（ranker_model_path 为空） `BACKLOG.md P1-2`
- [ ] 🟡 **P1-3 微调 Pair Judge / Extractor（V2）** — 微调数据管线+TRAINING.md 手册就绪，但依赖 P1-1 标注与 ollama，实际微调未做，生产仍 mock `BACKLOG.md P1-3`
- [ ] 🟡 **P1-4 活动/公告系统（Announcement）** — Announcement 横幅/弹窗/推送公告模型未做；但 07-18 已另行落地活动+门票系统（Event/EventTicket+广场活动帖），覆盖了「活动发布」的一半语义 `BACKLOG.md P1-4`
- [ ] **P1-5 调度 B 方案（MatchRound 两阶段轮次）** — 开池/计算/公布三时刻分离+公布前人工审核，仅 SCHEDULING.md 有设计，无代码 `BACKLOG.md P1-5`
- [ ] 🟡 **P1-6 前端反馈收集 UI** — 行为埋点半（viewed/openedProfile 上报）07-21 已接；显式反馈（合适/不合适原因、聊后反馈、解除原因）UI 未见实现 `BACKLOG.md P1-6`
- [ ] 🟡 **P1-7 探索流量（反马太效应加权）** — waitingRounds/exposureCount 字段已在 schema 预留，后端填充候选与加权逻辑未实现 `BACKLOG.md P1-7`
- [ ] 🟡 **P1-8 门票加入 Apple Wallet** — 前端入口与下载逻辑已就绪（addTicketToWallet），入口由 ENABLE_APPLE_WALLET 暂隐；阻塞在 Apple 证书（开发者计划 + Pass Type ID + WWDR），后端 pkpass 签发未实现 `BACKLOG.md P1-8`
- [x] **P1-9 广场搜索纳入评论内容** — 2026-08-14 完成：square_post_comments.content 已建 trgm 索引，产品语义按用户拍板取「返回主帖 + 标注命中片段」 `BACKLOG.md P1-9`
- [ ] **P1-10 「猜你认识」用真实反馈调权** — 各路召回权重目前是手写常数；UserSuggestionDismiss（强负）与加好友（强正）尚未作为训练信号采集 `BACKLOG.md P1-10`
- [ ] **P2-1~P2-5 规模化远期（Embedding 召回/Blossom 全局匹配/端到端精排/分群监控与 A/B/回放仪表盘）** — 全部为用户量上万或有大量真实反馈后才启动的远期项，均无实现 `BACKLOG.md 第四节`
- [ ] 🚧 **五项关键决策待拍板（基座模型/时区/匹配周期/首版档位/匹配花费）** — 均未正式确认：脚本默认 Europe/London、生产仍周五 17:00 沪时公布、档位事实用 mock、花费用 ModeProfile 默认值（恋爱 3/朋友 1） `BACKLOG.md 第五节`

### 容器编排与生产架构

- [x] **docker-compose 八服务编排** — postgres16/redis7/api/matching-ml/admin-web/h5/website/caddy；env 全量接线（MATCH_MODEL/AI_PROVIDER_URL/SEED_DEMO/ALLOWED_ORIGINS），生产八容器 Up `docker-compose.yml`
- [x] **Caddy 反代 + 自动 HTTPS（五域名）** — unimatcha.ai+www→website、app→h5、admin→admin-web、api→api，Let's Encrypt 自动签发；上线验证五端点全 200 `Caddyfile`
- [x] **网络安全加固** — Postgres/Redis 仅绑 127.0.0.1（防无鉴权 Redis 暴露公网）；api/matching-ml 仅 expose 内网不直连公网；公开端点 IP 限流 60s/10 次 `docker-compose.yml ports 注释`
- [x] **生产服务器与 DNS** — DO 伦敦 209.97.179.143（2vCPU/4GB），NS 托管 DigitalOcean，五条 A 记录；私仓拉取受限改为本地 git push server 直推 /opt/unimatcha.git 裸仓库 + post-receive 自动检出 `CLAUDE.md 2026-07-17`
- [x] **反代信任链修复（trust proxy）** — Caddy 终止 TLS 后 Express 未信任 X-Forwarded-Proto 致上传返回 http:// URL 被混合内容拦截；main.ts 设 trust proxy 并批量改写存量 URL，已上线 f31d173 `CLAUDE.md 2026-08-07`

### 各镜像 Dockerfile 与启动策略

- [x] **api Dockerfile（多阶段+启动自举）** — node20 构建+metadata seed JSON 打包校验；启动 CMD：prisma db push（去 --accept-data-loss 防毁数据）→幂等管理员 seed→SEED_DEMO 开关控制演示数据→起服务 `apps/api/Dockerfile`
- [x] **h5 Dockerfile（vite 构建+nginx）+ 启动看门狗缓存策略** — nginx 对 index.html/manifest no-cache、/assets 一年不可变，配合 head 内置 7s 未 boot 自动重载看门狗，解决旧缓存 404 卡启动页 `apps/h5/Dockerfile`
- [x] **admin-web Dockerfile（NEXT_PUBLIC_API_URL 构建期内联）** — API 地址必须经 build ARG 传入（运行时设无效），standalone 输出+非 root 用户 `apps/admin-web/Dockerfile`
- [x] **website Dockerfile（官网纯静态 nginx）** — COPY 全站后删除 nginx.conf 防被当静态文件下发（曾因 .dockerignore 排除导致 COPY 失败的 bug 已修 b0df25a） `apps/website/Dockerfile`
- [x] **matching-ml Dockerfile（Python 3.12 FastAPI）** — 默认 LLM_BACKEND=mock 零依赖可跑；空 MATCH_API_KEY+非回环 fail-closed `matching-ml/Dockerfile`
- [x] **web Dockerfile（旧版 Next 官网）** — 构建可用但已弃用：compose 已将官网切到 apps/website 静态站，apps/web 不再部署 `apps/web/Dockerfile`

### 运维脚本

- [x] **set-weekly-schedule.sh（匹配 cron 切换脚本）** — 调管理端 PUT /admin/matching/config 即时生效免重启，默认周日 20:00 Europe/London；脚本就绪但正式切换未执行（即 P0-3） `scripts/set-weekly-schedule.sh`
- [x] **演示数据 seed 脚本（广场/广告/已匹配情侣）** — seed-square-demo.js / seed-ads-demo.js 由 api 容器启动时按 SEED_DEMO=true 执行，另有 seed-demo-matched.js、reset-password.js 手工运维脚本 `apps/api/scripts/`
- [x] **问卷英文回填脚本 backfill-question-en.ts** — 按中文题面幂等 updateMany 回填 titleEn，编入 dist；生产 75/75 已跑，开发库回填因本机 Docker 未恢复仍欠账 `apps/api/prisma/backfill-question-en.ts`

## 遗留与杂项（查漏补充）

> 全仓扫描查漏发现的边角板块，去留 / 主从关系待定——确认后改状态或删条即可。

- [ ] ❓ **后端 API 测试体系（jest 单测，且全仓无 CI）** — apps/api 存在 3 套 jest 单测（auth/matching/questionnaire，日志中反复引用的『jest 20/20』即此），但后端盘点板块（鉴权/匹配/社交/管理后台/数据模型/调度/Seed/Mock）均未含测试；matching-ml 的『测试与评估』只覆盖模型服务自身。同时全仓不存在任何 CI 配置（无 .github/、无 gitlab-ci 等），质量保障完全依赖本地手跑与浏览器实测——作为独立板块值得盘点（哪些模块有单测、哪些纯靠人肉验证）。 `apps/api/src/auth/test/auth.service.spec.ts；apps/api/src/matching/test/matching.service.spec.ts；apps/api/src/questionnaire/test/questionnaire.service.spec.ts；matching-ml/tests/test_pipeline.py（已覆盖，仅作对照）`
- [ ] ❓ **packages/shared 共享种子数据包（顶层 workspace）** — monorepo 顶层还有一个 packages/ 目录，内含 shared/seed 三份英国元数据 JSON（大学 78 所/城市/专业），未出现在任何代理的板块名单里。且它与 apps/api/src/metadata/seed/ 下的同名三份 JSON 互为副本，属双源数据，存在漂移风险（H5 侧 META_ZH 中文映射 234 项也基于这套列表），值得单列盘点其真实消费方与主从关系。 `packages/shared/seed/uk_universities.json、uk_cities.json、uk_majors.json；对照 apps/api/src/metadata/seed/ 下同名文件`
- [ ] ❓ **排行榜遗留模块（前端已下线、后端仍挂载）** — apps/api/src/leaderboard 是完整实现的 272 行服务（8 种榜单类型 + 兼容旧接口），controller 标注 @deprecated（双模式重构阶段 0 从前端下线，见 DESIGN-DUAL-MODE.md §8.2），但 app.module.ts 第 55 行仍挂载、JWT 鉴权后即可访问，全仓前端（H5/admin/iOS/web）零调用。它既非 mock 也非留桩（是活的已弃用接口面），落在后端各功能板块与『Mock/留桩汇总』的缝隙里，作为遗留接口面/回退保留代码值得单列。 `apps/api/src/leaderboard/leaderboard.controller.ts、leaderboard.service.ts、leaderboard.module.ts；apps/api/src/app.module.ts:55`
- [ ] ❓ **品牌与设计素材散件** — 若干入库的素材/设计参考文件无任何板块提及：根目录 logo/logo1.jpg（品牌素材）；docs/design/Organic Loaders (standalone).html（加载动画设计参考，非规格文档）；apps/h5/public/loaders.html（同类 loader 演示页，位于 public 会随 H5 一起部署到生产）；apps/website/_clip-a.mp4、_clip-b.mp4（合计约 5MB 的 hero 改版备用视频，随官网镜像分发，日志明确『留给 hero 改版、不接入不删除』）。可合并为一个素材板块盘点去留。 `logo/logo1.jpg；docs/design/Organic Loaders (standalone).html；apps/h5/public/loaders.html；apps/website/_clip-a.mp4、_clip-b.mp4`

## 全项目待办汇总（跨模块去重）

> 来自 CLAUDE.md 日志、BACKLOG 与本次扫描的散落待办去重；P0/P1 逐条状态见「文档与部署运维」章节。

- [ ] **matching-ml 接真实 LLM** — 生产 LLM_BACKEND=mock 规则打分，需 API key/ollama 才能切 prompt 或微调档（关联 P0-6/P1-3） `CLAUDE.md 2026-07-17/07-21/07-26 待办`
- [ ] **P0-3 公布 cron 正式运营切换** — 脚本文档全备，切每周日公布+开场公告的运营动作一直未执行，生产仍周五 17:00 `CLAUDE.md 2026-07-13 起多期待办`
- [ ] **开发库 titleEn 回填补跑** — 本机 Docker Desktop 故障重置后未恢复，开发库 75 题英文回填欠账（生产已完成） `CLAUDE.md 2026-07-24 排障、2026-07-26 待办`
- [x] **广场搜索后端语义** — 2026-08-13/14 已定并落地：pg_trgm 后端检索（帖子标题/正文/标签 + 评论内容），不上独立搜索引擎。注：原条目描述「H5 搜索目前前端过滤」本身就不准确——H5 一直在发 `&search=`，是后端静默忽略了该参数 `CLAUDE.md 2026-08-13/08-14`
- [ ] **官网 hero 视频改版待定** — _clip-a/b.mp4 素材（卡片墙配对/两人相遇）已备未接入，等用户拍板 `CLAUDE.md 2026-07-14/07-16/07-21 待办`
- [ ] 🟡 **真实支付渠道接入** — 能量购买、活动门票、商家广告充值均为 mock/线下确认收款流程，真实支付网关留待下阶段 `CLAUDE.md 2026-07-04 待办`
- [ ] **广告素材图片上传** — 商家广告素材目前 URL 手填，未做图片上传 `CLAUDE.md 2026-07-04 待办`
- [ ] 🟡 **SMTP 邮件发码与拉黑功能留桩** — 邮箱验证码发送为外部集成缺口、拉黑无表，07-13 契约测绘确认为有意留桩 `CLAUDE.md 2026-07-13 iOS 重写条目`
- [ ] **FAQ 数据源统一维护** — chat.js 客服知识库与帮助中心内容各自维护，后续可从 faq.html 单一数据源生成 `CLAUDE.md 2026-07-16/07-21 待办`
- [ ] **官网 about 页真实素材补充** — 团队故事等真实素材待补 `CLAUDE.md 2026-07-16 待办`
- [ ] **admin 收到官网新提交的提醒** — 官网表单→后台工作流已闭环，站内/邮件提醒为后续增强 `CLAUDE.md 2026-07-16 待办`
- [ ] ❓ **SEED_ADMIN_PASSWORD 上线后修改** — 建议用户登录后修改初始管理员密码，是否已改无记录 `CLAUDE.md 2026-07-17 待办`
- [ ] ❓ **admin 后台浏览器端人工验收** — 07-17 上线待办列「admin 后台人工过一遍」，后续日志无明确完成记录（H5 生产冒烟已于 07-24 线上 E2E 覆盖） `CLAUDE.md 2026-07-17 待办、2026-07-24`
- [ ] **P1-2 攒数据后每周训 ranker** — 埋点已跑通，等真实反馈数据积累后启动例行训练 `CLAUDE.md 2026-07-13 待办`
- [ ] **七天打卡任务** — PRD 决策明确「暂不做」，留作后续增强 `docs/PRD.md 决策清单 #6`
