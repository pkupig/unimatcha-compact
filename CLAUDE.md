# CLAUDE.md

## 项目简介

Unimatcha —— 面向大学生的长期恋爱匹配平台（v2.0）。每周五 17:00 公布一轮匹配结果。Monorepo 结构：

- `apps/api` — NestJS 后端（Prisma + PostgreSQL + Redis/BullMQ）
- `apps/admin-web` — Next.js 管理后台
- `apps/h5` — H5 移动端（SPA）
- `apps/web` — Web 端
- `apps/website` — 官网（Aleo 风格，霓虹绿主题，双语）
- `apps/ios` — iOS 端
- `matching-ml` — 匹配模型服务（Python/FastAPI，规则+微调 LLM 混合，见 [matching-ml/README.md](matching-ml/README.md)）

项目待办总表见 [BACKLOG.md](BACKLOG.md)，匹配调度方案见 [SCHEDULING.md](SCHEDULING.md)。详细架构、API 文档、快速开始见 [README.md](README.md)。

仓库说明：GitHub 远程 `unipia`（https://github.com/pkupig/unipia）是**唯一**项目仓库，推送用 `git push unipia main`；旧远程 `origin`（campus-love）已弃用，不再同步。源码一律以 `apps/` 为准（unipia 原有的根目录 api/h5/admin-web 部署快照已于 2026-07-13 移除）。

## 每日日志规则

每个工作日在下方「每日日志」中**追加一条当天的记录**（新条目放在最上面），格式如下：

```markdown
### YYYY-MM-DD
- 完成：今天做了什么（改了哪些模块/文件、修了什么 bug）
- 进行中：尚未完成的工作
- 待办 / 明日计划：下一步要做什么
```

要求：

1. 每天第一次开始工作时，先检查今天是否已有条目，没有则新建。
2. 当天结束或完成一个阶段性任务后，及时补充「完成」内容。
3. 日志条目按日期倒序排列（最新的在最上面）。
4. 条目过多时（超过约 30 条），把最旧的条目移到 `docs/DEVLOG-archive.md` 归档。

---

## 每日日志

### 2026-07-13
- 完成（全项目找 bug + 代码整理）：8 路子系统多代理扫描 + 逐条对抗复核（3 视角），确认并修复 4 项（一批 matching-energy 声明经复核判为误报）：①【严重】上传接口存储型 XSS——imageFileFilter 只校验 mimetype(客户端可控)，存盘扩展名却取自 originalname，伪造 image/png+filename=x.svg 绕过 → 落盘 .svg 被当 svg+xml 提供在 API 源执行；改为扩展名一律由 mimetype→ext 白名单派生。②③【严重】H5 存储型 XSS——avatarUrl/帖子图/realPhotos 是 @IsString 自由串，原样插进 src="${url}"，escapeHtml 不转义引号 → x" onerror="偷 localStorage.cl_token；加 window.safeUrl(拦 javascript:/vbscript:/file:/非图片 data:，转义属性破坏字符)+window.safeCssUrl(剥离引号/括号防 url() 闭合)，扫掉 square/match/chat/couple/addfriend/profile/milestone/ads 全部 src 注入点 + couple 封面/profile 背景图，照片查看器 onclick 改用 this.src 不拼用户串。④【中】H5 换账号 cleanupUserState 漏重置 S.enhanced/energy/matchBasis → 新用户继承前账号增强开关被扣费；补齐重置。验证：safeUrl/safeCssUrl 对攻击向量逐一实测拦截、正常 URL 放行；API tsc + jest 20/20、H5 vite build 通过。
- 完成（整理）：根目录 6 份设计/审计文档(PRD/DESIGN-DUAL-MODE/BUSINESS-LOGIC-AUDIT/FIXLOG/FRONTEND-LOGIC-ISSUES/H5-GAPS)归入 docs/，根目录只留 README/BACKLOG/SCHEDULING/CLAUDE；删 apps/website/_preview-*.html + _vtest.html 设计草稿(含 6.7MB base64 dump，正式站 index.html 不引用)；删无引用的 stub-match-model.provider.ts。三批干净提交。
- 完成（匹配闭环，BACKLOG P0-1/P0-2/P0-5 全部落地并实弹验证）：①P0-1 接入 matching-ml：ai-match-model.provider.example.ts 升级为正式 AIMatchModelProvider（超时/AbortController、响应结构校验、错误消息去 PII），matching.module.ts 改 env 工厂选择（MATCH_MODEL=ai|scoring，缺省设了 AI_PROVIDER_URL 即 ai，一行回滚）；②P0-2 埋点：MatchExposure（补 matchJobId 列 + (matchJobId,matchId) 唯一键防 Bull 重试重复曝光）+ MatchBehaviorEvent 进 schema 并 db push；曝光在 executeMatchJob 逐对事务提交后落库（featureSnapshot 冻结自模型 metadata），confirmed/rejected(临时解除)/dissolved(永久解除)/firstMessage/message 挂服务端权威动作处（matching.service / chat.service），viewed/openedProfile 走新端点 POST /matching/feedback/events（DTO 白名单 + 归属校验 + 按 (matchId,actorId,type) 去重防刷库）；③P0-5：/match 加 Bearer 鉴权（MATCH_API_KEY，constant-time），空 key 仅允许回环地址，非回环+空 key 拒绝启动（fail-closed）；④环境：装 Python 3.12 + matching-ml venv，Docker 起 postgres/redis。验证：tsc 过、jest 20/20、matching-ml 冒烟全过（含 ranker 学习信号）、鉴权 401/401/200、E2E 实弹 romantic+friend 各 4 候选→2 对（metadata 含算法/宪法版本/28 特征快照/中文理由）、确认→RELATIONSHIP_ROMANTIC、8 类行为事件全落库、UTF-8 hex 往返无损、伪造 confirmed 被 400、重复事件 accepted:0。对抗性审查（5 维度×3 视角，受限额部分中断）确认 3 项已全修复：事件刷库、fail-open 默认配置、错误回显 PII。
- 完成（仓库对齐）：删除 unipia 根目录 api/ h5/ admin-web/ 部署快照（apps/ 为唯一源码真源），origin(campus-love) 标记弃用。
- 完成（上半日，双向同步）：本地 ↔ unipia 双向同步。①把 .env / apps/api/.env 移出版本库（含真实密钥，unipia 政策也禁止），.gitignore 补 .env.* 与 .claude/；②7/4 遗留的全部工作区改动分 6 批提交（api 广告商业化+审核+角色 101 文件 / admin-web 三角色后台 / h5 / ios 改名+web+website / 根文档 / 同步 unipia）；③merge unipia/main（--allow-unrelated-histories）拉下 matching-ml 匹配模型服务（含 7/8–7/10 十次迭代）、BACKLOG.md、SCHEDULING.md、scripts/set-weekly-schedule.sh；④推送合并后的 main 到 unipia（内容为两边超集，未删 unipia 的 api/ h5/ admin-web/ 部署快照目录）。origin(campus-love) 未推送。
- 待办 / 明日计划：服务器部署 matching-ml + 配 AI_PROVIDER_URL/MATCH_API_KEY（P0-1 的部署半）；正式切周日公布 cron（P0-3，运营操作，scripts/set-weekly-schedule.sh）；H5 接 viewed/openedProfile 上报（P1-6）；攒数据后每周训 ranker（P1-2）。本地 e2e.r1–r4@test.local 测试用户留在开发库可复用。

### 2026-07-12
- 完成：将 github.com/pkupig/unipia 添加为远程（`unipia`）并与本地全面对比。结论：unipia 是服务器部署快照仓库（api/ 为 Docker 导出、h5 为构建产物），核心增量是本地完全没有的 matching-ml 匹配模型服务（7/4 导入 + 7/8–7/10 共 10 次迭代提交）及 BACKLOG.md / SCHEDULING.md / scripts/set-weekly-schedule.sh；本地是 unipia 的超集（广告商业化 6 模型 + 三角色后台 + Unimatcha 品牌名，均未提交）。后端已有 ai-match-model.provider.example.ts 契约文件（matching.module 当前绑定 ScoringMatchModelProvider），埋点表 MatchExposure/MatchBehaviorEvent 尚未建（unipia BACKLOG P0-2）。
- 待办 / 明日计划：等用户指示同步方式（预计：把 matching-ml + 文档搬入本地 monorepo；按 BACKLOG P0 接入 provider、建埋点表）。7/4 遗留：分批 commit 工作区改动。

### 2026-07-04
- 完成：广场/校园墙管理 + 举报处理全部落地并验证（团队全量、学生会本校隔离 403、举报队列、下架/恢复/清除举报、用户反馈处理、/moderation 双视角 UI）。对抗性审查（4 维度 × 逐条反驳复核）确认 14 个问题并全部修复：①【严重】CPM/CPC 结算不封顶——普通用户可刷点击让平台按虚增消耗给学校分成真金白银 → 事件路径消耗原子增量+展示封顶、结算基数按实收预算封顶（多校按比例折算），已 E2E 实测（100 次刷点击→消耗精确封顶 1000 分、分成 100 分）；②BUYOUT 流水缺失 → accrueBuyoutSpend 按天摊销（调度器 tick + 到期补齐 + 启动追赶）；③过去 startDate 计入锁价 → 创建/提交双重校验；④并发批次 spend 丢更新 → 原子增量；⑤【严重】admin-matching / admin-questionnaire 控制器裸奔无 RolesGuard（商家可读全平台用户/改问卷）→ 补 SUPER/TEAM 守卫；⑥商家无法拉学校列表 → 瘦身响应含生效单价；⑦前端字段对账 4 处（earnings balance、报表 gross/keep/withdrawal 字段、学生会待审角标、举报用户昵称）；⑧H5 事件批 >100 被 400 整批丢弃 → 分片上报 + 4xx 不重试；⑨H5 换账号不重置广告会话 → token 变更自动重置。收入报表窗口口径（流水按投放日、分成按结算日）属计提/结算时点差异，保留现状。
- 待办 / 明日计划：整理提交全部工作区改动（建议按 后端/admin-web/h5/docs 分批 commit）；商家充值→真实支付渠道、广告素材图片上传（目前 URL 输入）留待下阶段。

### 2026-07-03
- 完成：创建 CLAUDE.md，建立每日日志制度。启动 Admin 平台三角色重写：完成业务设计文档 [docs/ADMIN-REDESIGN.md](docs/ADMIN-REDESIGN.md)（角色权限、广告混合计价 BUYOUT/CPM/CPC、分级审核、双档分成、赞助发放与提现流程）；Prisma 新增 School / AdCampaign / AdPlacement / AdDailyStat / SchoolLedgerEntry / WithdrawalRequest 模型并完成 db push + 存量 schoolId（学校名→School.id）数据迁移；新增 RolesGuard/@Roles 鉴权层；schools/ads/finance 三个后端模块、admin-web 三角色前端重写、H5 广场广告注入并行实现中。本机无 Node，安装了便携版 Node 20 到 C:\Users\DingM\.claude\tools。
- 完成（续）：后端（schools/ads/finance 模块 + admin 角色化改造 + 种子数据）与前端（三角色导航/登录/仪表盘 + 学校/账号/广告/财务/收益/赞助商全部页面）+ H5 广告注入全部落地并编译通过。已验证：三角色登录与范围隔离、学生会审核→团队确认收款→SCHEDULED 全流程、BUYOUT 报价（2校×3天×20000=120000 分）、自拉商家跨校投放 403、提现审批→打款→负数入账→余额守恒、H5 信息流 SPONSORED 大卡展示与曝光计费闭环（曝光 2→3、消耗 10→15 分）。补建 /sponsors 页面（工作流分工遗漏）；修正 dashboard 取值与 placements 校名显示。
- 进行中：追加需求——广场/校园墙帖子管理（学生会本校、团队全量，下架/恢复）+ 举报处理（被举报帖子队列 + 用户反馈处理），后端与 /moderation 页面并行实现中。
- 待办 / 明日计划：广场管理验收；全量代码对抗性审查并修复；整理提交工作区改动（注意 matching 测试文案不一致已拆分为独立任务）。
