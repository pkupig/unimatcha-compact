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

项目待办总表见 [BACKLOG.md](BACKLOG.md)，**产品功能清单**按端分三份：[docs/FEATURES-APP.md](docs/FEATURES-APP.md) / [docs/FEATURES-WEBSITE.md](docs/FEATURES-WEBSITE.md) / [docs/FEATURES-ADMIN.md](docs/FEATURES-ADMIN.md)（纯功能列表，用户手动维护；技术视角底稿见 [docs/PROJECT-CHECKLIST.md](docs/PROJECT-CHECKLIST.md)），匹配调度方案见 [SCHEDULING.md](SCHEDULING.md)。详细架构、API 文档、快速开始见 [README.md](README.md)。

仓库说明：GitHub 远程 `origin`（https://github.com/pkupig/unimatcha-compact）是**唯一**项目仓库（2026-08-19 由 `pkupig/unimatcha` 迁来），推送用 `git push origin main`，主分支 `main`；部署另走服务器裸仓库 `server`（root@209.97.179.143:/opt/unimatcha.git），上线一律 **`git push origin main` + `git push server main`** 两条都推。旧仓库保留为只读备份远程 `unimatcha-old`（pkupig/unimatcha，内容与迁移时一致）；重复的 `unipia` 远程已删除（它与 unimatcha 是改名后的同一仓库，留着会推错地方）。**警告**：新仓库里的 `skeleton-blueprint` 分支是迁移前那份**函数体被掏空的骨架蓝图**（square.js 94 行、`function isOfficial(p);` 这种不合法 JS），仅作留档，**任何情况下都不要从它取代码**。

源码一律以 `apps/` 为准（根目录 api/h5/admin-web 部署快照已于 2026-07-13 移除，现已不存在）。

> 2026-08-14 更正：本段此前写的是「远程 `unipia`（pkupig/unipia）为唯一仓库，推送用 `git push unipia main`；旧远程 `origin`（campus-love）已弃用」，与实际不符——当前工作副本只有一个远程 `origin`，指向 `pkupig/unimatcha`（即用户确认的仓库地址），没有 `unipia` 远程，`origin` 也不是 campus-love。推测仓库在 7/13 之后改名/重建而本文档未同步。
>
> 本机 git 身份未配置（提交会直接失败），已按历史提交作者在**本仓库**设为 `Mohan Ding <dingmohan2004@hotmail.com>`（未加 `--global`，不影响其他项目）。

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
4. **归档硬阈值**：CLAUDE.md 每次会话都整份进上下文，必须保持精简——日志区只保留**最近 5 个日期**，或整文件超过 **40 KB** 即触发；每天第一次开工检查时一并执行，把更旧的条目原样移到 `docs/DEVLOG-archive.md` 顶部（归档文件同样按日期倒序）。不要等用户提醒（2026-09-02 曾涨到 161 KB 才被用户发现，旧规则「约 30 条」从未触发过）。

---

## 每日日志

### 2026-09-05
- 完成（🧩 六大功能一轮实现，待上线）：用户一次性提了聊天长按菜单（引用/转发/复制/翻译/点赞，双击也点赞）、广场帖子直接转发进聊天、新增「附近」与「探索」两个分类、认证校标系统、广场页序改为 推荐→附近→探索→校园墙。**四点拍板**（AskUserQuestion）：校标先自动生成+后台可覆盖、附近走真 GPS、**本轮不做翻译**（只留入口）、认证门槛**仅限探索里的外校墙**（本校墙一切照旧）。中途追加「续火花」。
- **schema 增量**（迁移 `20260905093000_square_chat_features`，纯增量+一条回填，**尚未上生产**）：`User.verifiedSchool`（管理员审核通过时写的学校快照）、`Message.kind/replyToId/metadata` + 新表 `MessageLike`、`Match.streakCount/streakLastDate`、`SquarePost.lat/lng`、`School.badgeUrl/badgeText/badgeColor`。**曾加过 `Profile.lat/lng/locationEnabled` 又删掉**——`getMyProfile` 是整行 spread，任何新列自动出网；而且「附近」是**帖子**流，位置该挂在帖子上，服务端**一点用户位置都不存**。
- **隐私口径（本轮立的规矩）**：①观察者坐标只是请求参数，用完即弃，且**服务端先吸附到 ~500m 网格**再算——出参虽只给距离档位，但调用方能任意指定自己的坐标并按排序二分，多探几次就能把某条帖子三角定位出来，分桶本身挡不住；②坐标永不出网（`shapePost` 里 delete，后台投票审核列表那个**不走 shapePost 的独立整形口**也补了 `lat/lng: undefined`——它已经剔除匿名作者，坐标留着等于白脱敏）；③匿名帖/匿名评论**绝不显示校标**（会把作者从「全校」缩到「本校已认证的人」）；④转发快照对匿名帖不带学校、只给通用名——快照是永久的，写错了没得救。
- **校标的信任根**：只认 `User.verifiedSchool`，**不能用 `Profile.school`**（用户可改的下拉框，认证过的人改一下就能挂任意学校的校标，「认证校标」当场失去意义）。同一判定也用在外校墙门禁上——否则那道门一个下拉框就绕过去了。CSS 类用 `.sch-badge` 而非 `.school-badge`（后者是既有「学校胶囊」，带 padding+黑底会把 15px 校标压扁）。
- **对抗性复查（56 代理）确认 39 条，已全部修复**。五条 high：①**「附近」是个死页**——只写了读的一半，没有任何客户端在发帖时上报 `lat/lng`，于是**授权定位的人看到空页、拒绝定位的反而有内容**（行为完全颠倒），且白白要了一次精确定位权限；补发帖浮层 opt-in「带上位置」开关 + 服务端 GPS 零命中回落同城。②一进广场就弹定位授权（四页全量预热，用户还在推荐页）→ 改为只有「附近」真是当前页才请求。③门禁可被一个下拉框绕过（见上）。④距离分桶挡不住三角定位（见上）。⑤长按菜单被自己派生的 click 关掉——菜单是手指**仍按着**时弹的，抬手那个 click 正好命中关闭监听（延时 10ms 挡不住），改听下一次 `pointerdown/touchstart`。medium 里较有价值的：转发快照零可见性校验（已下架/未过审的帖子能被永久固化进聊天记录，改 `findFirst` 带 `isHidden:false, reviewStatus:'approved'`）、跨校刷举报可自动下架任意帖（举报有意不设门槛当安全阀，改在服务层加每人每小时 10 次上限；**注意 `reportPost` 写的是 `SquarePost.metadata.reports[]`，`Report` 表是「问题反馈」，两回事**，所以用进程内计数而不是查表）、`refreshMessageLike` 拉的是**最旧** 50 条（稍长的会话里近期消息的赞永远刷不出来）。
- **收尾三项**：①详情页消费 `canInteract`——外校墙未认证时输入区整条换成说明+「去认证」，点赞置灰，而不是让人敲完一整条评论才吃 403（实测拦截态 0 次 API 调用、放行态照常 POST）。②`S.nearbyMode` 写了从不读 → 补降级提示条，且**两种降级说法必须分开**（`city_fallback`=定位到了但半径内没内容 / `city`=压根没定位），否则拒绝定位的人会以为「附近就是没人发」。③词典清理：`Quote/Forward/Copy/Like/Unlike` 等通用短词全是死键（调用点一律 `zh?:''` 三元），留在全局词典里只会等着哪段用户内容漏了 `data-no-i18n` 就被整词替换（8/13 教训），删；`Recommend/Nearby/Explore/Campus Wall/Pinned` 是真实 tab 标签，留。
- **验证**：api tsc 0 + jest 64/64（新增 `chat-streak` 10 条日期边界用例——跨月/跨年/闰年/时钟回拨；`square-anon` 扩到 22 条，含 3 条 verifiedSchool 门禁）；H5 vite build 过；浏览器实测详情页门禁 8/8（中英双态、放行/拦截双向、加载期不残留上一帖提示条）、附近降级四态文案、引用转发帖子卡（有标题取标题、无标题回落 `[帖子]/[Post]`）、长按菜单全链路（不被自身 click 关掉、下一次按下才关）。
- **测法记档**：①`TouchEvent` 要打在 `.chat-bubble/.chat-image/.chat-share-card` **本身**上，打在外层 `.chat-row` 上 `closest(TARGET_SEL)` 取不到，手势静默不触发（白查半天）；②预览窗格隐藏时定时器被节流到约 1/秒，`setTimeout(100)` 实测 396ms 才响、`for(60×100ms)` 直接跑满 45s 超时——**测长按/双击这类计时手势必须先把标签页 front 起来**；③`S` 没挂 window，要驱动状态得走 `openSession/openPostDetail` 这类真实入口 + mock `window.api`。
- 完成（🚀 上线 077f744 + 生产核验全绿）：双推 → 服务器 `build api h5` → **迁移预检**（`compose run --rm --no-deps api migrate deploy`，旧容器持续服务，DEPLOY.md 6.5 流程首次实战）→ 换容器。核验（6 代理 workflow：5 路只读并行 + 1 路串行 e2e）：①迁移落地——`_prisma_migrations` 2 行、新列/索引/外键逐项在场；**回填是「空真」通过**（生产 13 用户全 unverified，UPDATE 命中 0 行属预期，首个真实认证过审时才见真章）；②坐标隐私——admin 帖子路由带真 token 扫全部 45 条真实帖 0 命中 lat/lng，数据面 45 帖坐标全 NULL；③8 容器 Up、api 日志零 ERROR、磁盘 23%；④公共端点全 200（school-badges badge 三键在场值为 null——自动生成在前端，符合设计）；⑤h5 bundle MD5 与本地逐字节一致（index-R5U56_fB.js）+ immutable 缓存头 + 新功能标记在场。**e2e 12/12**（真实 API + psql：引用回复带原文、点赞/取消幂等+myLiked、双方同日各发一条 streakCount 0→1、转发快照匿名帖无 school 键、不存在/已下架帖 404、外校墙 B(unverified) 评论点赞双 403 而 A(verified) 双 2xx、canInteract 双向、**坐标落库实测截到 3 位小数**（51.507/-0.128）、nearby GPS 流命中且出参无 lat/lng、无坐标走 needCity）；测试数据 17 表残留清点全 0。
- 待办：真实用户第一次认证过审后，抽查 `verifiedSchool` 快照确实写入（回填与写入路径都还没被真实数据踩过）。

### 2026-09-04
- 完成（🎨 绿卡内对齐 + 朋友副文案两行）：用户三点——朋友文案凑两行、卡内周历与倒计时等宽、两者左缘齐「距下轮公布」标签。改法：①朋友 idle 副文案 EN/ZH 各加长到自然两行（romantic 本就两行）；②周历 .mp-day 去死宽 44px 改内容宽 + 行 space-between，今日白片用 padding+负 margin 撑呼吸感不挪列；③倒计时「数字+单位」包进 .mp-cd-g 分组、.mp-cd 改 space-between 两端撑满。三者左缘=标签左缘、右缘=周历右缘（39px 处，均在卡 padding 18px 内）。浏览器量证：labelL=calFirstL=cdFirstL=39、三行右缘距右皆 39，中英双模式副文案均 2 行。
- 完成（🎨 计划页对齐线统一 + 绿卡圆角调小，二轮修正）：用户三点——倒计时卡圆角小、卡两边对齐加号左缘/铃铛右缘、标题与匹配偏好同线。原几何：顶栏 px-2（图标外缘距屏边 8px）、面板 padding 30px、绿卡出血到 8px（三线各异）。改法：面板左右 padding 30→8px、绿卡取消出血（width 100%/margin 0），标题/绿卡/偏好框/CTA 天然同线；圆角 24-28px 不规则 → 12-15px 小号不规则（保留一点手绘感）。浏览器量证四元素 l/r 逐像素相同，恋人面板同类名自动同步。**二轮修正**：用户指出「过头了」——第一轮对齐到 40px 按钮热区边（8px），实际要的是**图标墨迹**边。canvas measureText 量不了 ligature（测出来是字母串），改用 Material Symbols 官方 24 网格路径几何换算：add 墨迹内缩 5/24、notifications 4/24，22px 字号下加号墨迹左缘≈21.6px、铃铛墨迹右缘距右≈20.4px → 对齐线取 21px（两侧误差<0.7px）。
- 完成（🎨 进池 CTA 去光晕）：用户指出「加入匹配池」按钮周围一圈过渡底色——9/1 重设计时给 .mp-cta 加的荧光绿 box-shadow 光晕，按要求移除（--leave 变体上冗余的 box-shadow:none 一并清理）。
- 完成（🐛 问卷重填横幅不消失）：用户报「问卷更新提示重新填写后不消失」。后端完成度按 active 版本实时计数、翻转正常——纯 H5 DOM 生命周期 bug：横幅只有注入方（ensureQuestionnaireThenMatch 未完成时 prepend 进面板）没有移除方，而横幅的目标人群恰是「在池中」用户，9/1 的计划页**同态守卫**命中时 loadMatchTab 不重建容器 → 重填返回后旧横幅原地留存到整页刷新。修复：completed 分支对称补一行 `.q-refill-banner` remove。浏览器 mock 断言：未完成+searching 出横幅 → completed 翻真重进 → 横幅消失且 `.mp-box` 为同一节点（守卫仍生效，未引入重建）。
- 完成（🐛 直加好友混入朋友匹配卡片，2df0b63 已上线 + 生产端到端 10/10）：用户报「扫码添加的好友出现在匹配朋友的卡片里」。根因：`getFullMatchStatus` 朋友分支把所有 `FRIEND_ACTIVE` 状态的 Match 全当卡片返回，而扫码/搜索直加建的正是 FRIEND_CONFIRMED。修复用 schema 现成判别键 **`matchJobId`（直加好友恒为 null，schema 注释本就写明）**：①状态接口按 `matchJobId != null` 过滤卡片（getMyMatchResult 复用同函数自动继承；聊天列表查询与此无关，直加好友继续正常显示）；②connectByUserId **复活**旧匹配行（曾每周匹配→解除→直加）时一并置 `matchJobId=null/score=null/metadata.source`，复活后按直加身份对待；③**同根第二个 bug**：直加流程原本无条件把双方 UMS 刷成 relationship——正在 searching 的用户扫个码就被静默踢出本周匹配池，改为 `notIn:['searching']` 保留搜索态（非搜索方仍按原语义置 relationship）。H5 零改动（新版匹配页对 relationship+空 matches 本就回落进池计划页，旧版同构，已按 9/1 重设计后的代码复核）。验证：tsc 0 + jest 38/38；**生产端到端 10/10**（容器内真实 API：扫码 2xx→C 仍 searching→卡片零显示→视图状态 searching→D 置 relationship→带 matchJobId 的周匹配照常出卡且唯一→聊天列表两好友都在→直加复活 2xx→复活行 matchJobId=null→卡片消失；测试数据零残留）。另：主干 9/1 由并行会话上了匹配页重设计（75f1b62/007fa94），本轮已合回分支。
- 完成（📚 日志归档 + 并行会话调和）：CLAUDE.md 超归档线，2026-08-19 及更早共 19 条移入 docs/DEVLOG-archive.md（新建），正文留 4 个日期。**主检出发现 9/2 会话未提交的同类归档改动**（硬化规则文本 + 自己的归档切分）——两份归档 18 条公共条目逐字节一致、其独有的 8/19 条与硬化规则文本均已采纳为超集后提交，主检出脏副本随后清理。归档规则自此为硬阈值（5 日期/40KB）。

### 2026-09-01
- 完成（🚀 第二轮上线 007fa94）：h5 重建，容器内 js+css 与本地 MD5 逐字节一致（index-CYG6UNbk.js / index-BPknrCBJ.css）、app 200、index 引用新 bundle。
- 完成（匹配页第二轮打磨：真轨道横滑 + 下拉刷新移除 + 两态几何统一 + 框头固定）：用户四点反馈+一点补充。①**三视图改广场同款真轨道**（最大改动）：恋人/朋友不再共用一个 #match-content——拆成 #home-track 下三个独立面板（chat / home-match-romantic / home-match-friend，各自纵向滚动，#tab-match 改 overflow:hidden），跟手平移、两页同框、12px 页缝、两端 0.3 橡皮筋、≥70px 松手吸附、点分段同一条吸附动画；相邻匹配面板预热（缓存渲计划页，拖出来不是白板）；bindSquareSwipe 全套惯例照搬（方向判定后 preventDefault 掐竖滚、settle 绑 document、pagerWidth 零宽回退）。**连锁改造**：计划页内部 id 全换 class+data-mp（双面板 id 会撞，fillPlanBox/tick 改面板内 querySelector）、倒计时 tick 双面板各按 data-mode 走、loadPlanData 竞态令牌按模式分桶（预热与激活并发拉偏好，全局令牌互相作废）、couple.js 挂载点 fallback 指 romantic 面板、`.fixed.top-0 ~ main` 安全区补偿失配（面板被 track 包住不再是 main 兄弟）→ 各面板 padding 自带 var(--sat) **且只算一次**（顺带修掉上一轮 margin+padding 双倍下移——正是「上方距离不对」的真因，实测 titleY=64=顶栏底+8px 与设计稿一致）；nav 自动隐藏改绑 chat 面板（#tab-match 不滚了）。②**匹配面板下拉刷新移除**：attachPullToRefresh 加 opts.enabled 谓词（match 页限定 chat 视图），movers 只挂 chat 面板。③**两态统一**：标题恒 .mp-title 26px（去掉 searching 24px 特例）、副文案 .mp-sub 钳两行高（min-height 3.3em），实测 idle/searching 几何逐项相等（26px/64/46/359）。④**摘要框头固定**（用户补充）：.mp-box 拆 .mp-box-head（匹配偏好+编辑/锁定，固定）+ .mp-box-scroll（偏好内容，滚动）。⑤非计划态居中改滚动安全（content 纵向 auto margin：矮内容居中、超高顶对齐可滚——旧版 justify-center 超高会裁顶）。验证（375px mock 全断言）：轨道 0/-387/-774 三档、mid-drag -487 跟手且两页同框截图、橡皮筋 -810 弹回、小位移弹回、chat PTR 可用/匹配视图被 enabled 拦、框头 scrollTop 999 后 headY 不动、真 searching（锁定行+离开钮在场）与 idle 几何全等、matched/no_match 布局与溢出安全、vite build 过。**测法教训**：点「加入匹配池」后增强确认卡会 await 挂起——不点掉它就断言 searching 几何，比的是 idle 自己（第一轮就这么假绿了一次，重测才实锤）。
- 完成（🚀 上线 75f1b62）：双推（origin + server）→ 服务器重建 h5 容器。核验：容器内 js+css 与本地构建 MD5 逐字节一致（index-BeOwYdNS.js）、app/api 200（--resolve 127.0.0.1，8/31 排障惯例）、八容器 Up。本轮全部改动仅 H5 + 文档，api/db 零变更无迁移。
- 完成（🎨 匹配页 idle/searching 全面重设计，恋人+朋友四态）：用户给了 Claude Design 定稿（根目录 `UniMatcha新匹配页 ui.html`——自解包 bundle，12MB；**读法**：抽 `<script type="__bundler/template">` 的 JSON 就是画布源码，别硬啃整文件）+ 口头需求（朋友模式同款/左上角统一加号/偏好+设置并进一个只读框/框大小不变框内滚动/编辑弹既有偏好卡/补充信息直接展示原文）。落地：①**页面结构**（match.js renderPlanState 一套渲染 idle/searching×romantic/friend 四态）：标题+副文案 → **出血荧光绿倒计时卡**（不规则圆角手绘感、周历行「今天白片+公布日白标手绘圈（公布日取 getNextRevealDate 与倒计时同源）」、单行 48px 白描边大数字，tick 就地更新+跨天就地重渲周历）→ **只读摘要框 #mp-box**（flex:1 框内滚动隐滚条；2×2 偏好网格——朋友模式第三格换「兴趣优先」；匹配设置段=增强模式只读开关 .mp-toggle+副文案、补充信息原文软填充文本框，空态灰占位）→ 贴底 CTA（进池绿 r12+光晕 / searching 粉描边「离开匹配池」）；searching 时「编辑」换「🔒 匹配中锁定 · 离开后可修改」（点=toast，用户拍板）+内容压暗 .55、增强副文案按 lastEnhancedRound 显「本轮已生效 · N 能量」。布局走 `#home-match-view.match-plan`（id 作用域压工具类），matched/情侣/空态分支自动摘类回居中布局。②**匹配设置抽屉删除**：#match-settings-overlay 整块移除，增强开关/补充信息/重新填问卷（用户拍板进卡）以原样式并入 #filter-overlay 偏好卡；装载并入 loadPrefsForMode（竞态令牌+loadFailed 防空白覆盖，原 openMatchSettings 的守卫全数保留）、保存并入 saveFilterPrefs（PUT 带 extraMatchInfo、**不带增强字段**——后端只认 /matching/start 扣费路径）；retakeQuestionnaire 改收 filter-overlay。③左上角三视图统一加号（tune 入口删除）。④偏好缓存 S.matchPrefs 分桶进 state.js + cleanupUserState 必清（防换账号泄显）；保存成功后摘要框就地刷新。⑤i18n 补 5 键（标题/四句副文案）；框内动态值走 zh 三元+data-no-i18n；深色全套补齐（绿卡恒黑字、分隔线白 9%、mp-extra 深底）。**验证**（vite dev + fetch/EventSource 全 mock、375px）：中英双态四状态截图逐项对设计稿；编辑卡按模式显隐增强区、兴趣 chip 从 profile 渲染；保存链路 PUT 载荷字段逐一核对+框就地刷新；增强确认卡→start body {enhanced:true}/{cells:1}；锁定 toast；620px 矮屏框 119px 内滚 287px 且 CTA 恒可见；matched→居中布局还原；加号菜单匹配页可开；深色 computed 色值核对；vite build 过。**记档**：toggleLang 会整页重载（mock 需重注入）；预览窗格隐藏时截图是陈旧合成帧，分段高亮「没切」以 DOM classList 为准（老坑再确认）。
- 完成（上线前对抗复查 workflow 19 代理：16 findings 确认 15 / 驳回 1，去重后 9 项全部修复）：①【high】**下拉刷新 × 框内滚动冲突**——PTR 只查 `container.scrollTop<=0`，计划页把 #tab-match 钉死后真滚动容器变成 .mp-box，框滚到中部再往下拖会同时触发整页下拉、>70px 松手即刷新且框内位置归零；attachPullToRefresh 加 innerScrolled 守卫（沿途祖先有「可滚且未到顶」的容器即不启动，touchstart/touchmove 双闸），顺带给 bindHomeViewSwipe 挂 square 同款 horizLock（横滑时 PTR 指示器让位）。②【medium】**30s 轮询无条件整页重渲计划页**（滚动位置每拍归零 + 每拍多拉一次 /matching/preferences）——renderPlanState 加同态守卫：标记写在 mp-box 自己身上（`data-plan="mode:s|i"`，其它分支 innerHTML 覆盖即天然失效），同 mode 同态只 fillPlanBox 不重建不拉网（实测同节点保留、scrollTop 80 不动、零额外请求）。③【medium】**偏好加载失败仍可 Save**——共享控件残留的可能是另一模式的旧值，PUT 会写错模式；加 prefsLoadFailed 整卡拒存（toast 反馈；不动按钮 disabled——applyPanelReadonly 的 350ms 定时器会覆盖它，视觉禁用是假的）。④【medium】**换账号泄显**——lastEnhancedRound 与在途偏好响应都不随 cleanupUserState 清理；新增 resetMatchPlanState（标记归零 + seq 令牌作废在途响应）接入 cleanup。⑤【low】**周历公布日误标**——徽标按星期几定位，周五 17:00 后 reveal 已是下周五、徽标却圈在本周（已过）五格上与倒计时自相矛盾（每周约 55 小时必现）；改按日期差定位，reveal 不在本周整行不出徽标。⑥【low】**X 键/下拉关卡绕过 closeFilterSheet** 致摘要框增强显示陈旧至下一拍轮询——X 改走 closeFilterSheet、bindSheetDragClose 加可选 onClose 参数，且 toggleEnhance/updateFriendCells 改完即同步框（实测滑块拖到 3 副文案就地变「保底 3 位 · 3 能量」）。⑦i18n 删 4 孤儿键（Match Settings/两句旧副文案/小写 Matching in progress）。⑧12MB 设计稿进 .gitignore。驳回的 1 条（重填问卷跟错模式）前提不成立——偏好卡模式选项卡早已移除。复验：全修复项浏览器断言绿 + vite build 过。**测法教训**：横滑测试会真的切走视图，后续断言要先确认「屏上的框是谁的」——一度把守卫正确拦截误判成同步失效。
- 完成（两处收尾）：①偏好卡标题「偏好」→「编辑」并真居中——justify-between 下左右两键宽度不同（关闭图标 vs 保存胶囊），标题夹中间必偏左，改绝对定位 left-1/2 平移；文案由 openFilterSheet 按语言设置 + data-no-i18n（'Edit' 太短，不进全局词典防误翻用户内容，8/13 教训）。②主页三视图（聊天/恋人/朋友）左右滑切换——bindHomeViewSwipe 挂 #tab-match，按当前下标 ±1 两端夹住（8/19 广场横滑教训）；只在松手判定不做跟手（三视图是显隐不是滑轨）；守卫：多指作废、.overlay.active（聊天对话/偏好卡）或加号菜单打开不切、|dx|≥60 且 ≥1.5|dy|（不抢纵向滚动/下拉刷新）。浏览器合成 TouchEvent 断言 9/9：三向切换+两端夹住+纵向/小位移/弹层守卫全过、标题几何中心 188==vw/2。
