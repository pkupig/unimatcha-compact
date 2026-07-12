# 全面排查修复记录（2026-06-09）

本轮通过 4 个并行审查 + 逐模块对照前后端契约，修复了约 30 处真实 bug。核心病根是同一类：**后端响应统一包了一层 `{success, data, timestamp}`，前端没解包**；以及**前后端字段名/接口字段不一致导致 400 或显示空白**。

> 验证：所有改动需 `docker compose up -d --build api h5` 重建。沙箱内因挂载缓存无法跑构建，最终以 Docker 构建为准。

---

## 后端 apps/api

1. **匹配 job 改为产出"待确认提议"** — `matching.service.ts` 每周 job 原本直接把两人设为 `relationship`（跳过确认）。改为创建 `PENDING_CONFIRM` + `matchState='proposed'`，确认流程才闭环。
2. **48h 自动过期** — `matching.service.expireStaleProposals()` + `match.scheduler.ts` 每 10 分钟扫描，超 48h 未双确的提议标记 `EXPIRED`、双方回 `idle`。
3. **`/users/me` 增加 `hasProfile` / `completedQuestionnaire`** — `users.service.ts`，供前端登录路由判断。
4. **新增 `POST /auth/change-password`** — `auth.controller.ts` + `auth.service.ts`，方法级 JWT 守卫。修复改密 404。
5. **资料 DTO 必填改可选 + 新增 `realPhotos`** — `profiles/dto/profile.dto.ts`。原本 nickname/school/grade/gender/genderPref/age/city 全必填，导致分步保存/编辑必 400。

## 前端 apps/h5 — 通用

6. **登录路由** — `core.js checkUserState` 按 `hasProfile`/`completedQuestionnaire` 判断，删除恒为真的 `status !== 'active'`。
7. **图片上传字段名** — `core.js uploadImageFile` 把表单字段 `image` 改 `file`（后端 `FileInterceptor('file')`）。**这一处修复了所有图片上传**（头像/封面/相册/发帖图原本全部 400）。
8. **登录/注册解包** — `auth.js` 读 `res.data`（早前已修）。
9. **匹配偏好** — `saveFilterPrefs` 只发 `requireSameCity`/`requireSameUniversity`，不再 400。
10. **修改密码入口** — 设置里 Password 行绑 `showChangePassword()`（原本无 onclick）。

## 匹配 match.js / index.html

11. **proposed 确认卡片 + no_match 界面** — 契合度分 / 共鸣点 / 校园认证 / 48h 倒计时 / 确认·拒绝 / 已确认等待态。
12. **no_match 加"退出匹配池/重新开始"出口**（原本死路）。
13. **searching 雷达动画** + `startMatch` 乐观渲染（点击即时反馈）。
14. **loadMatchTab 非终态持续轮询**（对方确认/超时自动刷新）。
15. **头像字段** `avatar`→`avatarUrl`；`renderPartnerProfile` 头像 + `academic_year`→`grade`。

## 广场 square.js

16. **列表解包** — `env.posts`（原本拿到分页对象，永远显示"暂无"）。
17. **卡片可点** — `openPostDetail('${p.id}')` 加引号（原本未引号→ReferenceError）。
18. **作者昵称路径** — `author.profile.nickname` / 评论 `user.profile.nickname`（原本全显示 Anonymous/User）。
19. **不再 400** — 发帖去掉 `title`、评论去掉 `parentId`（后端 DTO 不含这些字段）。

## 聊天 chat.js / index.html

20. **聊天打得开** — `chatMatchId` 取 `S.matchStatus.match.id`（原本三个 fallback 全 undefined → `/chat/undefined/...`）。
21. **消息解包** — `env.messages`（原本拿到 `{messages,nextCursor}` 对象 → 渲染空白）。
22. **相手头像设置** + 返回按钮改 `closeChat()`（停轮询，修复泄漏）+ partnerId 字段。

## 通知 notifications.js / index.html

23. **列表解包** `env.items`；已读字段 `read`→`isRead`；正文 `message`→`body`；`markNotificationRead('${id}')` 加引号；关闭按钮改 `closeNotifications()` 停轮询。

## 排行榜 leaderboard.js / index.html / state.js

24. **tab 类型值** — Points/Activity 原本发 `interaction`/`activity`（不在后端枚举 → 400）；改为 `duration`/`score`/`streak`，初始值 `duration`。
25. **行字段** — 改用 `coupleA`/`coupleB`/`label`/`rank`（原本 `nickname`/`score` 全空，显示 User/0）。

## 问卷 questionnaire.js

26. **提交不再 400** — `questionnaireId`→`questionnaireVersionId`；`questionId` 去掉 `parseInt`；题干 `q.title`；选项值 `o.value`、文案 `o.label`。

## 资料/照片 profile.js（照片改后端上传）

27. **头像/封面/真实照片全部走后端**：上传 `/uploads/image` 拿 URL → `/uploads/avatar` / `PUT /profiles/me {coverUrl}` / `/uploads/real-photo`，并从 `profile.avatarUrl/coverUrl/realPhotos` 读取。**移除全部 localStorage 照片方案**（修复"换设备丢失、对方看不到头像"）。
28. `academic_year`→`grade`（资料页 meta、预览、公开卡）。

---

## 仍未做（留待下一轮）

- **metadata 下拉**：学校/专业/城市/MBTI/国籍 仍是手填，未接 `metadata/*` 接口（UI 改动较大）。
- **隐私开关**：设置里的隐私/推送开关是死代码（无 `.privacy-toggle` 元素），点了不生效。
- **通知未读徽章**：铃铛上没有未读数（`/notifications/unread-count` 未接）；聊天已读靠后端拉取时自动标记，够用但无显式回执。

## 重新构建

```
docker compose up -d --build api h5
```

构建若报 TypeScript/语法错误，把输出发我即可。建议重建后重跑 `seed-test-proposal.js` 并清 token 重新登录验证。

---

# 2026-06-12 全量补齐（H5-GAPS.md 31 项）

> 上一节"仍未做"的三项（metadata 下拉、隐私开关、通知未读徽章）已在本轮全部完成。
> 本轮共改动 70 个文件（含 34 个新增），逐项状态见 `H5-GAPS.md`。构建验证：API `tsc --noEmit` 通过、H5 `vite build` 通过、`prisma validate` 通过。

## Schema 变更（需要 `prisma db push`！）

- `CouplePost.title String?`
- `PostComment.parentCommentId String?` + 自关联 replies（评论回复）
- `Message.imageUrl String?`（聊天图片）
- `UserMatchPreferences` 新增 `preferredGender / ageMin / ageMax / universityStage`
- `User.settings Json?`（推送 + 隐私开关）
- 新增 `Report` 模型（举报/问题反馈）

## 后端新增/扩展接口

- `GET /matching/milestones` — 情侣里程碑统计（在一起天数/消息数/帖子数/共同兴趣/匹配分）
- `GET/PUT /users/me/settings` — 推送与隐私设置
- `POST /reports` — 问题反馈（新模块 `src/reports/`）
- `GET /square/posts?section=recommended|campus-life|top-stories` — 广场分类
- 帖子 title、评论 parentCommentId、消息 imageUrl 进 DTO 与响应
- 点赞/评论/回复自动生成 like/comment 通知
- 匹配偏好（性别/年龄/学段）进入匹配硬约束

## H5 各域改动摘要

- **资料**：学校/城市/专业/MBTI/国籍/年级全部接 metadata 下拉（带缓存）；头像上传打通；伙伴页 Moments 网格 + 两层标签；标签 Enter 添加
- **匹配**：倒计时按后端 cron 计算（删 22:00 矛盾文案）；5 类偏好保存+回读；确认配对即时反馈
- **广场**：title 链路、列表点赞、分类 tab 生效、评论回复（嵌套）、多图轮播、bento 网格布局
- **聊天**：/poll 增量轮询、已读回执、上滑历史分页、图片消息
- **通知**：铃铛未读徽章、类型图标、15s 轮询
- **排行榜**：8 类 tab + Top3 领奖台；打开时状态同步
- **设置**：推送/隐私开关接 API；Help/Safety/ToS/Privacy 静态页；Contact Us 邮箱；Report 表单；Love Mode=情侣空间入口
- **认证**：删社交登录死按钮；注册加确认密码
- **新增** `src/modules/milestone.js` 情侣空间页

## 遗留

1. **`docker compose exec api npx prisma db push`** 必须执行（schema 6 处变更未推送）
2. 邮箱验证未做（无 SMTP）；OAuth 按决策不做
3. 未跑端到端运行时验证，db push 后建议人工过主流程
4. iOS 按 H5-GAPS.md 最终契约一次性对齐

---

# 2026-06-13 业务逻辑深审修复 + 全站 UI 改版

> 5 路并行审查匹配/业务逻辑，37 条发现核实属实 27 条并全部修复；按 19 张设计稿统一 UI。
> 构建验证：API `tsc --noEmit` 通过、H5 `vite build` 通过。本轮**无 schema 变更**（不需要再次 db push）。

## 匹配逻辑修复（重点）

- **确认竞态**：`confirmMatch`/`rejectMatch` 重构为单一事务，事务内重读 Match 状态 + 48h 过期校验，双方并发确认/确认 vs 拒绝/确认 vs 过期清理三类竞态均消除，返回值与最终库状态一致。
- **过期清理**：`expireStaleProposals` 边界 `lt`→`lte`，改批量 `updateMany`，缩小竞态窗口。
- **封禁拦截**：`startMatchForUser` 校验 `status==='BANNED'`，被封用户无法进池。
- **任务幂等**：`executeMatchJob` 开头 `COMPLETED` 直接返回；创建提议前查双方已有 PENDING/RELATIONSHIP 提议则跳过；通知与 Match 创建同事务，避免重试重复发提议/通知。
- **通知带 matchId**：配对通知 metadata 写入真实 match.id，前端可定位。
- **年龄缺失**：`buildCandidates` 过滤 `age != null`，不再默认 20。
- **评分算法**（critical）：原本只算量表题——补单选（相等=1）、多选（Jaccard）、文本（不计分、从分母剔除）；超范围分类题归入 GENERAL 并重新归一化权重；同城/同校偏好遇空值保守拒绝。
- **多实例调度**：`match.scheduler` cron 触发与过期清理加 Redis SETNX 锁，防重复执行。
- **倒计时**：`/matching/status` 新增 `nextRunAt`（后端用 CronJob 算下次执行，输出 UTC ISO）；前端直接倒数时间戳，消除时区/解析 bug。

## 跨模块一致性修复

- **聊天**：dissolve 后聊天记录改为**只读**（`verifyMatchAccess` 放行 DISSOLVED 读、`sendMessage` 拒绝），不再 403 黑屏。
- **广场**：dissolved 帖子列表隐藏、详情仅当事人可见、评论点赞冻结。
- **resetMode**：管理员重置时同事务清理该用户的 Match 并恢复**对方**状态。
- **隐私生效**：`showProfile=false` 仅返回昵称头像、`showMoments=false` 剔除 realPhotos，情侣对方豁免。
- **排行榜**（high）：streak/growth/empathy/compatibility 四指标原本字段永远为 0——改为查询时按真实数据实时计算（消息连击天数/互动成长/发言均衡度），候选集先粗排取 top 50 再精算避免 N+1。

## H5 前端逻辑修复

- 倒计时优先用后端 `nextRunAt`；`renderMatchTab` 进入即清理共享 interval（消除 ticker 冲突）；提议到期自动刷新；confirm/reject 防抖 + 立即禁用按钮；偏好 ageMin/ageMax 支持「Any」(null)；universityStage 白名单校验。

## UI 全站改版（黑白学院极简 Ivory & Ink）

- 设计冲突 6 项已拍板：直角（头像/抽屉例外）、底部导航无背景块（active=font-bold text-black）、顶栏 bg-surface/80 毛玻璃、下划线输入框、卡片细边框+轻阴影、按钮三层规范（黑底 CTA / 描边次级 / 标签）。
- 7 组页面统一套用（登录注册/匹配全态/广场 bento/聊天气泡/资料/设置·通知·排行榜·里程碑·问卷）；新增 `main.css` 的 `.btn-cta` `.btn-secondary` `.btn-tag` `.academic-input` 工具类。
- 铁律：只改视觉，所有 id/onclick/JS 钩子 class 保留；UI 完整性复核确认无引用断裂。

---

# 2026-06-13 H5 前端业务逻辑专项修复

> 6 路审查 H5 全部前端模块（非匹配，非样式，专审前端业务逻辑）。21 条 high+ 全修 + 42 条 medium 核实修 21 条。构建通过。详细问题清单见 `FRONTEND-LOGIC-ISSUES.md`。

## critical（3 条）

- **退出登录跨用户串号**：`doLogout`/`checkUserState` 未登录分支只清了 token+currentUser，残留 matchStatus/chatMessages/questionnaire/answers 等。新建 `cleanupUserState()`（core.js）清空 state.js 全部 45 个用户态字段并停所有轮询，两处都调用。
- **切换聊天对象消息串话**：轮询回调用 `currentMatchId` 快照校验，返回数据 matchId 与当前不符则丢弃；切对话先 stopChatPolling + 清 chatLastId/chatMessages。
- **matched 态数据结构兼容**：partner 为 null/字段缺失时走 `renderPartnerMissing` 兜底卡片并强刷，不再读 undefined 显示空白。

## high（18 条）

- **401 处理**：`api()` 遇 401 改为停全部轮询 + cleanupUserState + 跳登录 + throw（原来返回 null 致 `renderMatchTab(null)` 后台反复崩、轮询不停）。
- **被封禁拦截**：`checkUserState` 检测 `status==='BANNED'` 跳新增的 `page-banned`。
- **错误不再静默吞**：chat/square/notifications 的空 `catch{}` 补 console + toast。
- **匹配数据契约**：proposed 倒计时用 `matchedAt||createdAt`、partner 兼容判断、确认/拒绝失败回滚 UI。
- **⚠️ Profile Setup 采集 age/gender**：原本注册流程不收集这两字段，致上一轮加的性别/年龄匹配硬约束失效——已在 setup 表单补字段并提交（后端 DTO 已支持）。
- **列表↔详情同步**：详情页点赞/评论后局部回写列表项计数（syncPostLikeState/syncPostDetailToList），不再全量 reload。
- **发帖防重复提交**：`S.isSubmittingPost` 标志 + 禁用 Publish 按钮。
- **问卷不丢答案**：`loadQuestionnaire` 同版本保留内存答案、跨版本拉 `/answers/mine` 恢复进度；TEXT 题改 `oinput` 实时存 + 切题前 flush。
- **编辑资料字段构造**：已渲染控件即使空串也入 payload 以支持清空。

## medium（修复 21 条）

轮询连续失败退避停轮询、分类 tab 切换竞态（squareReqSeq）、metadata 失败不静默空+可重试、settings toggle 保存失败回滚、未读徽章时序、问卷必答校验等。其余 21 条判为误报/过度防御已跳过（见 FRONTEND-LOGIC-ISSUES.md C 节及核实跳过项）。

## 验证与遗留

- 构建：API `tsc --noEmit` 绿、H5 `vite build` 绿。
- `cleanupUserState` 已逐字段比对 state.js 全覆盖。
- 仍未跑端到端（Docker Desktop 当前未运行，需手动启动后重建容器验证）。
- iOS 端的同类逻辑（错误处理、metadata 兜底等）待后续按 H5 对齐时一并处理。

---

# 2026-06-13 端到端运行时验证 + 3 个运行时 bug 修复

> 重建容器后跑真实 HTTP 端到端冒烟（3 泳道：用户主流程/管理员/静态服务）。核心契约全部通过，并暴露 3 个静态构建查不出的运行时 bug，已全部修复并复验。

## 运行时通过的核心契约
- age/gender PUT 接受 + GET 回显一致；匹配偏好 5 字段回读命中；/matching/status 返回 nextRunAt；排行榜 8 类不再 500；双 token 分离；H5/admin 静态服务正常；管理员触发 job 跑到 COMPLETED。

## 修复的 3 个运行时 bug
1. **metadata seed 未打包进镜像**（容器内 uk/universities|cities|majors 返回空）：根因是构建脚本用纯 `tsc`（非 `nest build`，nest-cli.json 的 assets 不生效）。修复：seed json 复制到 `apps/api/src/metadata/seed/`，metadata.service 改读 `__dirname/seed`，静默 catch 改 `logger.error`，**Dockerfile 在 tsc 后显式 `cp` seed 到 dist 并加构建期断言**（缺文件则构建失败而非运行时静默空）。复验：universities 78 / cities 50 / majors 67 条真实英国数据。
2. **admin 分页 500**：`listJobs`/`listAllMatches` 的 page/limit 缺省时非法值传入 Prisma。修复：加默认值兜底。复验：两接口无参数调用均 200。
3. **匹配 0 配对——查实非算法 bug**：根因是 `startMatchForUser` 写 searching 后即时触发全量 job，并发加入时先到者的 job 抢在后到者提交 searching 前跑完、漏掉对方。算法本身正确：管理员重新触发后 6 个候选同批评估，Oxford 一对（同城同校、问卷答案一致）以 **98 分**产生 PENDING_CONFIRM，compatibilityScore=98。

## 设计项（已按决定实现）
- **去掉即时触发**（采纳方案 A）：`startMatchForUser` 不再写完 searching 就触发全量 job，只返回「已加入本轮匹配池，结果将在下次匹配时公布」。配对统一交给周五 cron 或管理员手动触发，符合「周五批量公布」语义，并发漏人的时序坑根除。复验：start 不再返回 jobId、match_jobs 数量不变。
- **city/school 归一化**：scoring-match-model.provider.ts 的同城/同校硬约束比较前做 `trim().toLowerCase()`，'coventry' 与 'Coventry' 不再误判为不同城（保留空值保守拒绝）。

## 容器状态
- 5 容器健康；schema 由容器启动 CMD 的 `prisma db push` 自动同步（6 处变更已在库，camelCase 列名）。
