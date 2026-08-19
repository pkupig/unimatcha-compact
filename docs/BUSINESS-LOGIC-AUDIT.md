# 业务逻辑审查报告（2026-06-20）

> 对 `apps/api/src` 后端做的一轮业务逻辑专审,逐条对照 `DESIGN-DUAL-MODE.md` 契约 + 真实代码路径核实。
> 不含已在 `FIXLOG.md` 标记修复的项。按严重度排序。
> **状态:9 项已于 2026-06-20 全部修复(`tsc` 通过、20 个单测通过)。修复要点见文末「修复记录」。**

---

## 🔴 CRITICAL

### 1. 配对在落库阶段被跳过时,增强能量被白扣且无退款
`matching.service.ts:420-454`（skip 分支）+ `scoring-match-model.provider.ts:451-503` + `energy.service.ts:90-124`

能量在 `startMatchForUser` 进池时就预扣(事务内,`matching.service.ts:185-190`)。`executeMatchJob` 重新校验每一对时,若任一方已有 active match 就 `skippedPairs++; return;` 跳过——**此路径既不退款也不重新入队**。退款只在「池子里 0 候选」(`emptyPoolUserIds`)或 48h 过期路径触发。

**场景**:增强恋爱用户扣 3 格 → 调度跑,stage1 强匹配到 X(于是该用户不在 `unmatched` 里)→ 建对事务前 X 刚确认了别的恋人 → line 424 命中已有 active 检查 → 该对被跳过。用户:① 永久损失 3 格 ② 没匹配上 ③ 没 `no_match` 通知 ④ 没退款。纯扣费无服务。朋友模式同理。

**修复**:跳过携带增强用户的对时,按 matchId 幂等退款 `enhancedUserEnergy`,或把该用户改投 `emptyPoolUserIds`。

### 2. 朋友增强「保证 N 个」在部分满足时全额扣费、不退差额
`scoring-match-model.provider.ts:486-503` + `matching.service.ts:131-134`

设计 J.4/J.5:朋友增强选 1–5 格,N 格=本轮保证 N 个朋友。用户预扣 `cells`(如 5)。stage1 `topList = valid.slice(0, limit)`,但若只有 2 个有效候选就只建 2 对。退款只在 `valid.length === 0` 触发。**付 5 拿 2 → 全额扣 5、差额 3 格凭空消失,保证落空。**

**修复**:`0 < valid.length < cells` 时退 `cells - 实际建对数`,或按 `enhancedUserEnergy = actualMatched` 退差额。需明确产品决策:池子不够是退差额还是直接拒绝请求。

---

## 🟠 HIGH

### 3. `submitAnswers` 不校验 questionId 属于该问卷版本(跨版本污染)
`answers/answers.service.ts:12-58`

必答校验(line 27-30)是对的,但 upsert 循环(line 33-50)写入 payload 里**每个** `questionId`,不验证它是否属于 `dto.questionnaireVersionId`。可把「朋友问卷的题」存到「恋爱版本 ID」下。`buildCandidates` 按 `questionnaireVersionId` 拉答案做评分时会把外来题算进去,污染匹配分。

**修复**:upsert 前取该版本的合法 `questionId` 集合,拒绝/丢弃不在集合内的答案。

### 4. 朋友 `startMatch` 并发下能量可双花、余额变负
`matching.service.ts:139-197` + `energy.service.ts:90-124`

朋友模式 CAS 的 `blocked` 只含 `['searching']`(允许重入加候选),且 `getAvailableEnergy` 预检在事务外。`consumeInTx` 内对 `totalEnergy - usedEnergy` 的 check-then-act 在 READ COMMITTED 下非原子:两个并发增强朋友请求(各 3 格)都读到 available=3、都通过、都 +3 → usedEnergy=6 > total=3,余额 -3,违反「余额不可为负」。

**修复**:`consumeInTx` 开头对 balance 行 `SELECT ... FOR UPDATE`,或用带条件的 `updateMany`(命中 0 行则抛)保证原子扣减。恋爱模式因更严的 CAS 侥幸不受影响,朋友模式不行。

### 5. 48h 过期锚定 `Match.createdAt`,rematch 走 upsert 不重置 → 重匹配的对「一出生即过期」
`matching.service.ts:483-523`（upsert update 分支）+ `:826-830` + `mode.util.ts:48`

终态对(EXPIRED/DISSOLVED/REJECTED)被重新匹配时,`upsert` 的 update 分支重置了 status/确认标志,但**没重置 `createdAt`**(`@default(now())` 仅 create 生效)。48h 窗口和前端倒计时都从 `createdAt` 算。原 `createdAt` 超过 48h 的对一旦被重匹配,下一次 10 分钟扫描立刻判过期、倒计时显示 0。

**修复**:update 分支显式 `createdAt: new Date()`,或新增 `matchedAt`/`tempStartedAt` 列,把 48h 窗口与倒计时锚定到它。

---

## 🟡 MEDIUM

### 6. 恋爱 `confirmRelationship` 的 confirming-state 守卫误用了朋友语义
`matching.service.ts:713-717` — UMS 更新 `matchState: { notIn: ['relationship'] }` 是为朋友(别降级已有确认朋友的人)写的,被统一套到恋爱上。配合 5/1 的 rematch/skip 漏洞,可能出现一个用户同时持有 `RELATIONSHIP_ROMANTIC` + `MATCHED_ROMANTIC`,违反恋爱排他。**修复**:按模式拆分守卫,恋爱分支无条件更新或直接拒绝「已有恋人时确认第二段恋爱临时对」。

### 7. `triggerMatchJob` 的「已有任务运行中」是全局判断,非按模式 → cron 的朋友批次常被吞
`matching.service.ts:332-353` + `match.scheduler.ts:78-88` — scheduler 串行触发 romantic→friend。任一 PENDING/RUNNING 就抛 `已有匹配任务正在运行`。BullMQ 异步,romantic job 还没被 worker 处理完,friend 触发就抛错并被 scheduler `catch` 吞掉。**异步 worker 下这是常态而非偶发,等于 cron 的朋友批次几乎从不执行。** **修复**:按 `triggeredBy` 后缀(`:friend`/`:romantic`)过滤,或给 `MatchJob` 加 `mode` 列。

### 8. `pollMessages` 的 `afterId` 指向已删消息时回退到 epoch-0,返回整段历史
`chat/chat.service.ts:283-300` — `afterId` 解析不到时 `?? new Date(0)` → `createdAt > epoch` 拉全量。轮询热路径(5s)上既错(客户端重渲所有消息)又放大负载。当前无删消息逻辑故暂不触发,但属隐患。**修复**:`afterId` 解析不到就返回 `{ messages: [] }`,不回退 epoch。

### 9. 广场 `likeCount` 去规范化计数可被并发 unlike 扣成负/失真
`square/square.service.ts:450-469` — 存在性检查(line 446)在事务外,`likeCount: { decrement: 1 }` 无下限。并发 unlike / 重试请求会对一次真实 unlike 扣两次,长期使展示数和推荐 hotness 失真。**修复**:存在性检查移入事务,按真实 delete/create 命中行数决定是否改计数,或直接用 `_count.likes` 重算。

---

## ✅ 核实安全（看着可疑但没问题）

- **双 token 隔离**:`JWT_SECRET` / `ADMIN_JWT_SECRET` 不同 key,两个 strategy 都断言 `payload.role`。用户 token 过不了 admin 守卫。
- **封禁拦截**:JWT `validate` + `startMatchForUser` 双重校验。
- **确认/过期竞态**:confirm 与 expire 都用带状态守卫的 CAS `updateMany`(事务内)+ confirm 重校 48h 窗口,三类竞态已闭合(与 FIXLOG 2026-06-13 一致)。
- **退款幂等**:`refundInTx` 按 `relatedMatchId + type=REFUND` 去重 + `dec = min(cost, usedEnergy)` 兜底,退款本身不会双退/扣负(发现 1 是「缺退款调用」,非退款 bug)。
- **解除后聊天只读**:`verifyMatchAccess` 放行 DISSOLVED/EXPIRED 读、`sendMessage` 拒写,每次操作都校验归属。
- **广场隐藏帖可见性**:get/comment/like 都 `isHidden && authorUserId !== userId → 404`;校园墙同校过滤是硬 `where`。

---

最高价值是 **1、2(CRITICAL,真实扣费损失)** 和 **3、4(HIGH,跨版本污染 / 余额变负)**,都能经正常流程触发,建议优先修。

---

## 修复记录(2026-06-20)

> `#2` 按「退还未满足的差额」实现(付 N 拿 M,退 N−M 格),而非拒绝请求。

| # | 文件 | 修复 |
|---|---|---|
| 1+2 | `matching.service.ts` `executeMatchJob` | 用 `matchedCount: Map<userId,数量>` 记录每人本轮实际落库的 match 数;退款循环扩展为:恋爱配到≥1 即不退、否则退全部;朋友退 `cells − 实际匹配数`。覆盖「落库被 skip」与「朋友部分满足」。退款带 `dedupeKey=${jobId}:${userId}` 保证 job 重试不重复退。 |
| 3 | `answers.service.ts` `submitAnswers` | 提交前查该版本(`question.questionnaireId`)的合法题目 ID 集合,含外来 `questionId` 直接 400,杜绝跨版本答案污染评分。 |
| 4 | `energy.service.ts` `consumeInTx` | check-then-act 改为原子守卫 `updateMany({ where:{ usedEnergy:{ lte: total−cost } } })`,`count===0` 抛错;DB 行锁串行求值 WHERE,并发不再双花/余额转负。 |
| 5 | `matching.service.ts` `executeMatchJob` upsert | update 分支显式 `createdAt: new Date()`,重匹配旧行时重置 48h 窗口与倒计时锚点,不再「一出生即过期」。 |
| 6 | `matching.service.ts` `confirmRelationship` | 恋人确认前增 `RELATIONSHIP_ROMANTIC` 独占校验(已有恋人则拒);confirming 的 UMS 守卫按模式拆分(朋友保留 `notIn:['relationship']`,恋人无条件推进)。 |
| 7 | `matching.service.ts` `triggerMatchJob` | 「正在运行」检查加 `triggeredBy: { endsWith: ':${mode}' }`,romantic/friend 互不阻塞,cron 朋友批次不再被吞。 |
| 8 | `chat.service.ts` `pollMessages` | `afterId` 先一次性解析;解析不到返回空,不再回退 `epoch-0` 拉全量历史。 |
| 9 | `square.service.ts` `likePost` | 存在性检查移入事务,以 delete/create 真正命中为准,败者抛错回滚,`likeCount` 不再漂移/转负。 |

配套:`energy.service.ts` `refund/refundInTx` 增 `dedupeKey` 参数(无 matchId 的批量退款据此幂等去重)+ `dec<=0` 时跳过(不写 0 格流水与通知)。单测 `matching.service.spec.ts` 同步更新退款断言。
