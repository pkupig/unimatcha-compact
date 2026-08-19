# 前端业务逻辑问题清单（2026-06-13 H5 专项审查）

> 6 路并行审查 H5 全部前端模块的业务逻辑（状态/数据流/轮询/错误/边界/竞态）。
> high+ 已逐条对抗性核实属实；medium/low 为发现项，修复前需各自核实真伪。
>
> **✅ 2026-06-13 已修复**：A 节 21 条 high/critical 全部修复；B 节 42 条 medium/low 经核实修复 21 条、其余判为误报或过度防御已跳过。构建通过（API tsc / H5 vite）。详见 FIXLOG.md。

---

## A. high / critical（21 条，已核实属实）

### A1. [critical/state] Logout 时状态未完全清理，可能导致跨用户串号
- 文件：`apps/h5/src/modules/auth.js:60-71`
- 核实结论：Logout 时状态未完全清理确实存在，不仅限论断中的字段列表。doLogout() (auth.js:60-71) 只清理了 S.currentUser = null、localStorage token 和轮询定时器，但未清空其他用户数据。具体残留字段包括：(1) S.matchStatus - 旧匹配对象信息被 loadProfileTab()/match.js 直接渲染；(2) S.chatMessages[] - 旧聊天记录被 renderChatMessages(chat.js:117) 直接显示；(3) S.chatMatchId/S.chatPartnerId/S.chatPartnerName - 新用户打开旧聊天时 API 可能操作错误的 match ID；(4) S.questionnaire/S.answers/S.currentQuestion - 新用户打开问卷时显示旧题目和预填旧答案；(5) S.editTags/S.setupTags - 编辑资料时预填旧标签。跨用户串号风险为 CRITICAL，尤其在共享设备或快速登录注销场景下网络请求未完成时，新用户可见旧用户数据。
- 建议修法：在 doLogout() 中创建完整的状态清理逻辑。建议创建 cleanupUserState() 函数，清理所有用户相关字段：S.matchStatus=null, S.chatMessages=[], S.chatMatchId=null, S.chatPartnerId=null, S.chatPartnerName=null, S.questionnaire=null, S.answers={}, S.currentQuestion=0, S.editTags=[], S.setupTags=[], S.chatNextCursor=null, S.chatLastId=null, S.chatRenderFrom=0, S.chatPollBusy=false, S.isSubmittingProposal=false, S.currentPostId=null, S.pdPostData=null, S.pdReplyTo=null, S.pdPendingImgs=[], S.userSettings=null。在 doLogout() 和 checkUserState() 的未登录分支（token 不存在时）都调用此函数，确保页面切换到 auth 前状态已完全重置。同时在 showPage('page-auth') 执行时调用 closeAllOverlays() 防止旧 overlay 残留。

### A2. [high/boundary] Token 过期后只清 token 并跳转登录，未终止进行中的请求或轮询
- 文件：`apps/h5/src/modules/core.js:18-23`
- 核实结论：确认存在真实的 token 过期后轮询管理问题。具体修正如下：

**问题 1（HIGH）：api() 401 处理返回 null 导致 renderMatchTab() 崩溃**
- 位置：C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/core.js:18-23
- 症状：当 api() 检测到 401 时，直接返回 null（而非 throw）；match.js:389-399 的 startMatchPolling 轮询接收到 null，传给 renderMatchTab(null)；renderMatchTab 在 line 52 尝试读取 null.state 导致 TypeError
- 证据：match.js:52 没有参数检查，直接执行 `const state = data.state || data.status || 'idle'`，在 data=null 时抛出"Cannot read properties of null (reading 'state')"
- 实际影响：错误被 match.js:397 的 catch(e) {} 吞掉，轮询继续运行，但后台反复崩溃

**问题 2（HIGH）：轮询在 token 过期时不停止，资源泄漏**
- 位置：C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/match.js:389-399
- 症状：api() 返回 null 时不抛异常，startMatchPolling 的 setInterval 无法通过 catch 感知 401，S.matchPollingId 的定时器持续每 30s 执行
- 对比：doLogout() 在 auth.js:62-65 正确地停止了所有轮询（stopMatchPolling/stopChatPolling/stopNotifPolling），但自动 401 触发的登出路径没有这一步
- 资源后果：用户在认证页面时，后台仍持续发送无 token 的请求，每 30s/5s/15s 一次（match/chat/notif），造成不必要的带宽消耗

**问题 3（MEDIUM）：chat 和 notif 轮询相对安全，但设计不一致**
- 位置：chat.js:252-254、notifications.js:24-25
- 安全原因：使用了 `data?.data || data || {}` 链式处理，即使 api() 返回 null 也不会崩溃
- 但 match.js 采用了不同的 `d.data || d` 模式（无空值防护），导致不一致的健壮性

**问题 4（MEDIUM）：api() 返回 null 的设计问题**
- api() 的 401 处理是"调用方感知"的设计（返回 null），而不是"抛异常"设计
- 这导致调用方必须处理 `result === null` 的情况，但很多地方没有这样做
- 例如：match.js:394 的 `S.matchStatus = d.data || d` 无法区分"确实返回了{}"还是"返回了 null"

**论断原文的修正：**
- ✅ 轮询确实在 401 时不停止
- ✅ 会造成持续无效请求
- ❌ 不会造成"反复闪现"（showPage 和 removeItem 都是幂等的）
- ✅ 但确实有"进行中的异步操作继续发请求"的问题
- ❌ "下一次轮询会再次触发 401→清 token→跳转"的表述准确，但"造成反复闪现"不准确——应该是"持续无效请求 + 后台反复崩溃"
- 建议修法：建议修复方案（按优先级）：

**方案 A：将 api() 的 401 改为 throw（推荐，改动最少）**
```javascript
// core.js:18-23
if (res.status === 401) {
  localStorage.removeItem('cl_token');
  window.showPage('page-auth');
  throw new Error('Unauthorized');  // 改为 throw，让调用方 catch 感知
}
```
然后修改 match.js 的 startMatchPolling：
```javascript
S.matchPollingId = setInterval(async () => {
  try {
    const d = await window.api('/matching/status');
    S.matchStatus = d.data || d;
    window.renderMatchTab(S.matchStatus);
    if (S.matchStatus.state === 'matched' || S.matchStatus.state === 'relationship') stopMatchPolling();
  } catch (e) {
    // 401 会触发此处，停止轮询
    window.stopMatchPolling();
  }
}, 30000);
```

**方案 B：在 api() 的 401 时直接停止所有轮询（激进，改动多）**
```javascript
// core.js:18-24
if (res.status === 401) {
  localStorage.removeItem('cl_token');
  window.stopMatchPolling?.();
  window.stopChatPolling?.();
  window.stopNotifPolling?.();
  window.stopCountdownTick?.();
  window.showPage('page-auth');
  return null;
}
```

**方案 C：让 renderMatchTab 对 null 参数有防护（辅助修复）**
```javascript
// match.js:46-52
function renderMatchTab(data) {
  const container = document.getElementById('match-content');
  if (!container || !data) return;  // 添加 data 的 null 检查
  window.stopCountdownTick();
  const state = (data && (data.state || data.status)) || 'idle';
  // ...
}
```

**推荐执行顺序：方案 A > 方案 C > 方案 B（如需兜底）**

### A3. [high/boundary] loginState 检查逻辑不覆盖所有组合，缺少「资料未完成」边界情况处理
- 文件：`apps/h5/src/modules/core.js:52-77`
- 核实结论：检查结论部分错误。核实结果：(1) 用户被禁(BANNED)确实无处理逻辑——Prisma schema 定义了 UserStatus.BANNED 枚举，后端 users.service.ts 第24行在 select 中返回 status 字段，但前端 checkUserState 第52-77行仅检查 hasProfile 和 completedQuestionnaire，对 status 无判断，且 HTML 中仅有 page-auth/profile-setup/questionnaire/home 4个页面，无 banned 页面，被禁用户会错误进入资料/问卷/首页；(2) 资料部分填写但 nickname 为空不失效——后端第45行已计算 hasProfile 值，前端第62行 defensive fallback 也会正确判，问题不成立；(3) Token有效但用户已删除(404)已处理——后端 findById 抛 NotFoundException，api() 函数第18-25行对非401错误统一 throw，checkUserState 第73-76行 catch 捕获并清 token 回登录页，闭环成立。真实问题：被禁用户(status=BANNED)缺少拦截逻辑和对应UI页面。
- 建议修法：在 checkUserState() 中，在获取用户数据后、进行 hasProfile 检查前，添加被禁检查：`if (u.status === 'BANNED') { window.showPage('page-banned'); return; }` 并在 HTML 中新增 `<div id="page-banned">` 页面显示被禁提示（如"您的账户已被禁用，如有异议请联系支持"）。后端已在 schema/service 中完整支持，前端缺补。

### A4. [high/state] 匹配提议状态数据字段不一致 - partner 读取
- 文件：`apps/h5/src/modules/match.js:93-131`
- 核实结论：问题确实存在。后端 getFullMatchStatus() 的 proposed 分支会调用 getPublicProfile(partnerId)，该函数在用户无个人资料时返回 null（profiles.service.ts:60）。前端 match.js:93 的条件 `state==='proposed' && data.match && data.partner` 当 partner 为 null 时会失败，导致渲染 idle 界面而非 proposed 的匹配提议卡片。真实触发路径：(1) 匹配对象资料未完成但被列入匹配池；(2) 轮询时对方资料被删除；(3) 网络异常导致 partner 返回空对象。后端无guard检查 partner 是否非空就直接返回，前端也无fallback或提示用户。
- 建议修法：后端修复（matching.service.ts:207 后）：if (!partner) { await tx.user.update(..., data: {matchState:'idle'}); return {..., state:'idle', partner:null}; } 前端修复（match.js:93）：增加 `p && p.nickname && p.school` 的校验，并在 partner 为 null/不完整时显示 toast 警告而非静默降级到 idle。增加轮询异常处理：若连续2次 proposed 态但 partner 为 null，主动调 loadMatchTab() 强刷整个状态。

### A5. [high/dataflow] proposed 状态下倒计时计算使用 matchedAt，但后端返回 createdAt
- 文件：`apps/h5/src/modules/match.js:99`
- 核实结论：后端确实返回 matchedAt: pendingMatch.createdAt（matching.service.ts 第 220、265、921、934 行），字段语义与名称不符。虽然当前业务逻辑上都用 48h 倒数，但字段命名 matchedAt（应为"匹配确认时刻"）而实际值是 createdAt（提议生成时刻），导致两个问题：(1) 后续代码维护者易误改为 confirmedAt，导致 proposed 状态下倒计时消失（null 会被模板条件渲染为空）；(2) null 路径虽然有 line 99 的条件守卫，但静默失败，用户无错误提示。此外，match.js:122 的模板条件渲染（${deadline ? ... : ''}）在倒计时为 null 时会隐藏整个应答期限板块，用户看不到 48h 期限，误以为时间充足。
- 建议修法：1. 后端改字段名为准确的语义：const matchedAt: pendingMatch.createdAt 改为 const proposedAt: pendingMatch.createdAt，或在 API 文档中明确标注"matchedAt 是提议创建时刻，非双确认时刻"。2. 前端 match.js:99 行加防护和日志：const deadline = m.matchedAt && m.matchedAt !== null ? new Date(m.matchedAt).getTime() + 48 * 3600 * 1000 : null; if (!deadline && state === 'proposed') console.warn('Missing matchedAt for proposed match', m)。3. match.js:122 行的模板改为有明确 fallback：${deadline ? ... : '<div class="text-center py-3...">倒计时加载中或已过期</div>'}，避免静默隐藏。4. 后端 expireStaleProposals() 完成后，前端轮询应在 proposed 状态时更频繁地检查（改 30s 为 10-15s），特别是在 48h 临界区间。

### A6. [high/boundary] proposed 状态渲染缺少 partner 的兼容判断
- 文件：`apps/h5/src/modules/match.js:93`
- 核实结论：proposed 状态确实可能出现 partner=null 的情况。虽然后端在 PENDING_CONFIRM 不存在时有 fallback 重置为 idle，但在存在 PENDING_CONFIRM 的主路径中，若对方 profile 不存在（数据库不一致或对方账户被删除），getPublicProfile() 返回 null。前端第93行条件检查会因 data.partner=null 而失败，用户看不到待确认的 proposed 卡片，反而降级到 idle 画面，没有任何错误提示或恢复提示。
- 建议修法：在 renderMatchTab 第93行的 else if 前增加专门处理 proposed+null-partner 情况的分支，例如：

```javascript
else if (state === 'proposed' && data.match && !data.partner) {
  // 容错：有提议但无对方资料（数据库不一致/对方账户被删除）
  container.innerHTML = `<div class="w-full text-center px-8 py-12">
    <div class="w-20 h-20 mx-auto mb-6 flex items-center justify-center rounded-full border-2 border-outline">
      <span class="material-symbols-outlined text-3xl text-outline">person_remove</span>
    </div>
    <h2 class="font-headline text-lg font-extrabold tracking-[0.2em] uppercase text-on-surface mb-3">对方已离线</h2>
    <p class="font-body text-on-surface-variant text-sm mb-10 max-w-xs mx-auto">对方可能删除了账户或资料，您的提议已失效。</p>
    <button class="btn-cta" onclick="window.loadMatchTab()">刷新</button>
  </div>`;
} else if (state === 'proposed' && data.match && data.partner) {
  // ... 现有 proposed 逻辑 ...
}
```

或后端更激进的修复：在返回 proposed 前检查 partner 非空，若为空则自动清理孤立的 PENDING_CONFIRM 记录并返回 idle 状态。

### A7. [critical/dataflow] matched 状态数据结构兼容性问题
- 文件：`apps/h5/src/modules/match.js:54-92`
- 核实结论：第53行 `const match = data.partner || data.match` 的问题不完全如指控所述。实际情况是：在matched/relationship状态下，前端期望match变量包含用户资料字段（avatarUrl、nickname、school、bio等），这些字段仅存在于partner对象而非match对象。正常情况下因partner对象存在，match会被赋为partner；而partner对象有userId字段，第86行 `viewPartnerProfile(${match.id || match.userId})` 会fallback到match.userId，调用正确。但当data.partner为null（数据一致性破裂时），match会被赋为data.match对象，此时第55-85行会渲染失败（缺少用户信息），第86行会传入match.id（match记录ID，非用户ID），导致查询错误用户。建议在第54行条件中添加 `data.partner` 存在性检查，或改写为明确分离：`const p = data.partner; const m = data.match;`，对齐proposed状态的清晰模式。
- 建议修法：将第53行改为 `const match = data.partner;` 并在第54行改为 `if ((state === 'matched' || state === 'relationship') && match && data.partner)` 或改写整个分支与proposed分支保持一致：`if ((state === 'matched' || state === 'relationship') && data.partner) { const p = data.partner; const m = data.match; ... viewPartnerProfile(${p.userId}) }`，确保数据结构明确且异常情况时不会fallback到错误的对象。

### A8. [high/error] 确认/拒绝提议后状态回滚逻辑缺失
- 文件：`apps/h5/src/modules/match.js:249-297`
- 核实结论：问题确实存在，但表现形式与论述略有偏差。不是"按钮卡死"而是"DOM被覆盖后按钮不存在"。当 loadMatchTab() 的 API 请求失败时，catch 块会调用 renderIdleMatch()，将整个 #match-content DOM 替换为空白卡片。虽然前驱的 setProposalButtonsDisabled(false) 在逻辑上已执行，但因元素已被删除而失效。后端状态与前端渲染不同步，用户误以为确认失败。核心根源：loadMatchTab 的 catch 块缺乏上下文感知，应判断当前状态是否在 proposed 时选择保留 DOM 而非覆盖。兜住的地方：後端 confirmProposal 和 rejectProposal 实现了幂等性和事务隔离，状态一致性在持久层有保障。
- 建议修法：在 loadMatchTab() catch 块中添加状态感知逻辑：(1) 若当前 S.matchStatus 已知为 proposed，保留 DOM 并仅 toast 网络错误；(2) 新增一个"网络故障自动重试"机制，如 30s 后自动尝试重新加载；(3) 或在 confirmMatch/rejectMatch 的 finally 块中，catch loadMatchTab 的失败并以异步重试替代同步等待。另可在前端增加乐观UI：调用 API 时立即渲染"等待确认中..."而非禁用按钮，减少用户困惑。

### A9. [critical/state] matchId 快速切换时轮询回调执行异步导致消息乱序或跨对话显示
- 文件：`C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/chat.js:9-37, 275-287, 247-272`
- 核实结论：论断核实成立。代码中存在两个关键的竞态条件漏洞，会导致消息乱序、跨对话显示污染：

**漏洞1: loadChatHistory() 中的多步await竞态**
- 文件: apps/h5/src/modules/chat.js:48-69
- 问题: for循环内多次await后，S.chatMatchId可能已改变，但后续循环继续用全局值请求，并在第63-65行无检查地覆盖状态
- 场景: 用户打开对话A，第1页加载中(await)，立即切换对话B → 对话A的第2页请求会污染对话B的数据

**漏洞2: pollChatMessages() 中的await竞态**
- 文件: apps/h5/src/modules/chat.js:247-272
- 问题: 
  (1) 第252行 `await window.api()` 未保存当前matchId和lastId到本地变量
  (2) 第256行 `S.chatLastId = msgs[...].id` 和第262行 `S.chatMessages.push()` 无匹配检查
  (3) chatPollBusy标志仅防护同对话并发，无法防护跨对话污染
- 场景: 对话A轮询中(await)，用户切换对话B(S.chatMatchId=b, S.chatMessages=[])，对话A的API返回后，消息被推入对话B的数组

**防护缺失**:
- openChat()第15行设置S.chatMatchId在await loadChatHistory()前，但loadChatHistory内无matchId检查
- startChatPolling()第277行未在闭包中捕获matchId，setInterval回调读全局值
- pollChatMessages()无请求前后的matchId一致性验证

**具体破坏流程**:
时刻T0: 对话A轮询启动(matchId=a, lastId=msg_a_100)
时刻T1: 用户点击对话B
  → openChat(): S.chatMatchId=b, S.chatLastId=null, S.chatMessages=[]
  → startChatPolling(): 新timer开始
时刻T2: 对话A的API返回 {messages:[msg_a_101,msg_a_102]}
  → pollChatMessages()恢复
  → S.chatLastId=msg_a_102 (覆盖对话B的null)
  → S.chatMessages.push(msg_a_101,msg_a_102) 推入对话B!
时刻T3: 用户在对话B中看到对话A的消息; 对话B下一次轮询参数错误(lastId=msg_a_102)
- 建议修法：修复方案:

**方案A (快速修复)**: 在pollChatMessages()中保存并验证matchId
```javascript
async function pollChatMessages() {
  const currentMatchId = S.chatMatchId;  // 保存快照
  if (!currentMatchId || S.chatPollBusy) return;
  S.chatPollBusy = true;
  try {
    const lastId = S.chatLastId;  // 同时保存lastId
    const qs = lastId ? `?afterId=${encodeURIComponent(lastId)}` : '';
    const data = await window.api(`/chat/${currentMatchId}/messages/poll${qs}`);
    
    // await后检查matchId是否改变
    if (S.chatMatchId !== currentMatchId) {
      S.chatPollBusy = false;
      return;  // 放弃过时响应
    }
    
    const env = data?.data || data || {};
    const msgs = Array.isArray(env) ? env : env.messages || [];
    if (msgs.length) {
      S.chatLastId = msgs[msgs.length - 1].id;
      // ... 后续处理
    }
  } catch(e) {}
  S.chatPollBusy = false;
}
```

**方案B (彻底修复)**: 在startChatPolling中捕获matchId到闭包
```javascript
function startChatPolling() {
  window.stopChatPolling();
  const matchId = S.chatMatchId;  // 闭包捕获
  S.chatPollingId = setInterval(() => {
    if (S.chatMatchId === matchId) {
      window.pollChatMessages();
    }
  }, 5000);
}
```

**方案C (根本修复)**: 在loadChatHistory()中也添加matchId检查
```javascript
async function loadChatHistory() {
  const currentMatchId = S.chatMatchId;
  if (!currentMatchId) return;
  try {
    const all = [];
    let cursor = null;
    for (let i = 0; i < 100; i++) {
      if (S.chatMatchId !== currentMatchId) break;  // 检查
      const qs = `limit=${CHAT_PAGE_SIZE}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const data = await window.api(`/chat/${currentMatchId}/messages?${qs}`);  // 用快照
      // ...
    }
    if (S.chatMatchId === currentMatchId) {  // 最后检查
      S.chatMessages = all;
      S.chatLastId = all.length ? all[all.length - 1].id : null;
      // ...
    }
  } catch(e) {}
}
```

### A10. [high/boundary] 后端禁止已解除关系(DISSOLVED)的发送，前端无状态检查与提示
- 文件：`C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/chat.js:161-175 vs apps/api/src/chat/chat.service.ts:88-90`
- 核实结论：论断完全属实。代码走查证实了完整的缺陷链条：

**后端行为（已正确实现）：**
- chat.service.ts:88-90 在发送消息前检查 match.status，若为 DISSOLVED 则返回 403 错误信息'关系已解除，无法发送新消息'
- chat.service.ts:23 在 verifyMatchAccess 中允许 DISSOLVED 状态下的只读访问（可查看历史消息）

**前端漏洞（实际存在）：**
1. **状态检查缺失**：chat.js:161-175 的 sendChatMessage 函数直接 POST，无任何 match.status 检查
2. **错误处理过于通用**：core.js:6-28 的 api() 函数会把所有非 401 的错误转换为通用 Error，chat.js:171-173 的 catch 块显示通用 'Failed to send' toast，未向用户说明真实原因（关系已解除 vs 网络问题）
3. **缺乏同步机制**：openChat (第 9-37 行) 无对关系状态的实时同步。虽然 matchPolling 可能运行（如果未切离 match tab），但：
   - 轮询周期 30 秒（match.js:398），无法保证及时发现关系变更
   - 即使 S.matchStatus 被更新为 idle，聊天界面已在 overlay 中的用户看不到这个变化
   - 聊天 overlay 打开时无任何监听关系状态的心跳
4. **UI 无提示**：当关系已解除时，聊天输入框不禁用，不显示"关系已解除"提示，用户误以为可以继续聊天

**用户遭遇的完整场景：**
用户 A 在 H5 打开了聊天 overlay。此时 S.matchStatus.match.status='RELATIONSHIP_MODE'，S.chatMatchId 已设置。
与此同时，用户 B（或用户 A 在另一客户端）点击"End Connection"，后端将 match.status 改为 DISSOLVED，matchState 改为 idle。
用户 A 在 H5 未切离 match tab，matchPolling 运行，30 秒内刷新 S.matchStatus → {state:'idle', match:null}。
但用户 A 仍在聊天 overlay 中，看不到主 tab 的状态变化。
用户 A 在聊天输入框输入消息，点击发送 → sendChatMessage POST /chat/{matchId}/messages。
后端拒绝：403 关系已解除，无法发送新消息。
前端 catch(e)，显示 'Failed to send'。
用户困惑：不知道原因是关系已解除还是网络问题，可能反复尝试发送。

**证据代码位置：**
- 前端缺陷：apps/h5/src/modules/chat.js:161-175（sendChatMessage，无 match.status 检查）
- 后端契约：apps/api/src/chat/chat.service.ts:88-90（发送时校验 DISSOLVED 状态）
- 状态更新：apps/api/src/matching/matching.service.ts:668-699（dissolveRelationship 同时改 match.status 和 matchState）
- 匹配状态查询：apps/api/src/matching/matching.service.ts:162-192（getFullMatchStatus 在 idle 时返回 match=null）
- 建议修法：前端应在以下三个地方补充防护：

1. **openChat 时检查关系状态**（严格级别）：
```javascript
async function openChat() {
  if (!S.matchStatus?.partner && !S.matchStatus?.match) {
    window.toast('No active connection');
    return;
  }
  
  // 新增：检查关系是否已解除
  if (S.matchStatus.match?.status === 'DISSOLVED') {
    window.toast('This connection has been ended');
    return;
  }
  
  const match = S.matchStatus.partner || S.matchStatus.match;
  // ... 其余代码
}
```

2. **sendChatMessage 时检查关系状态**（防御级别）：
```javascript
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input?.value?.trim();
  if (!text || !S.chatMatchId) return;
  
  // 新增：防卫检查，防止用户在关系已解除后仍可发送
  if (S.matchStatus?.match?.status === 'DISSOLVED') {
    window.toast('This connection has been ended');
    if (input) input.value = '';
    return;
  }
  
  try {
    // ... 现有代码
  }
}
```

3. **完善错误处理**（用户体验级别）：
修改 api() 的错误传递，或在 sendChatMessage 中细化错误处理：
```javascript
catch (e) {
  // 试图从错误信息中识别"关系已解除"
  if (e.message && e.message.includes('关系已解除')) {
    window.toast('This connection has been ended');
    // 主动关闭聊天界面或禁用输入
    window.closeChat();
  } else {
    window.toast('Failed to send');
  }
}
```

4. **UI 禁用与提示**（长期级别）：
在聊天 UI 中，当检测到 match.status='DISSOLVED' 时，禁用输入框并显示"Connection ended"提示。

### A11. [high/error] 所有异步错误被静默吞掉，包括网络超时和后端异常，无日志追踪
- 文件：`C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/chat.js:67, 244, 270`
- 核实结论：论断核心成立：loadChatHistory()第67行、pollChatMessages()第270行、refreshReadReceipts()第244行都存在空catch块，会静默吞掉网络超时和服务器错误(500等)。但需要澄清：(1)401认证失败不会被这些catch捕获，因为api()函数已在19-22行全局处理，直接返回null并跳转到登录页；(2)pollChatMessages()的轮询不会完全停止，setInterval继续运行，5秒后会自动重试，因为S.chatPollBusy标志在finally(第271行)被正确重置。真实影响：用户在单次或短期内可能因网络/服务器故障无法加载历史消息或接收新消息，且完全无感知（无任何toast提示或UI反馈），但自动重试机制会在5秒后恢复尝试。缺乏的是：(1)用户可见的错误提示；(2)开发者可追踪的日志（console.error/监控埋点）；(3)明确的重试状态指示。
- 建议修法：在core.js添加全局错误日志函数window.logError()，在chat.js三处catch块中：(1)调用window.logError()记录错误；(2)对用户可见的失败场景(loadChatHistory、pollChatMessages)调用window.toast('Failed to load messages. Retrying...')或类似提示；(3)为pollChatMessages维护连续失败计数(S.chatPollFailCount)，在反复失败时升级提示级别为'Chat connection lost'。对于refreshReadReceipts()，因其为非关键的已读状态同步，可保持静默但仍需日志记录以便事后诊断。

### A12. [high/cache] 详情页点赞后列表页未同步：无共享状态更新
- 文件：`apps/h5/src/modules/square.js:372-378`
- 核实结论：问题确实存在。列表页的post对象是纯HTML渲染，不存储在共享状态中。用户在详情页点赞后，likePdPost()调用API并重新加载详情，但closePostDetail()返回列表时没有刷新列表HTML。列表的likeCount值被硬编码在DOM中（bentoLargeCard第78行、bentoSmallCard第128行、bentoWideCard第151行），来自上一次loadSquarePosts()的API响应。后端正确返回了更新的likeCount和myLiked标志，但前端没有同步机制将此更新推回列表渲染。
- 建议修法：在closePostDetail()中增加loadSquarePosts()调用以重新加载列表，或在S中实现post对象缓存并通过数据绑定保持同步。推荐方案：(1)快速修复 - closePostDetail()末尾添加window.loadSquarePosts()；(2)长期修复 - 为列表posts建立S.squarePosts缓存，likePdPost()成功后同步更新缓存中对应post的likeCount和myLiked，避免全量重载。

### A13. [high/error] 错误吞掉：列表点赞异常无日志，用户无反馈
- 文件：`apps/h5/src/modules/square.js:178`
- 核实结论：likePost（列表页点赞）确实存在错误吞掉问题。第178行的空catch块导致：(1) API失败时，按钮会显示虚假的取消点赞状态（因res.liked为undefined时走else分支），欺骗用户；(2) 无toast提示用户失败；(3) 无console日志供开发排查。与submitPdComment（第366行）的对比处理形成强烈反差。唯一不同于论断的是：并非"乐观更新已完成"，而是"API失败后显示虚假反向状态"——既没有真正保存，UI也显示错。
- 建议修法：在square.js第157-179行的likePost函数中，将空catch块改为：catch (e) { window.toast('Failed to like post'); console.error('likePost error:', e); }，并在API失败时恢复按钮原始状态（不要更新UI）。或者改为点赞前禁用按钮、调用后再启用的防护方案，避免虚假反馈。

### A14. [high/cache] 评论提交后列表评论数未同步：全量reload低效
- 文件：`apps/h5/src/modules/square.js:353-369`
- 核实结论：评论提交后列表评论数不同步确实是真实问题。根据代码追查：(1)后端的square.service.ts:225行确实在事务中正确递增commentCount; (2)listPosts API会返回包含commentCount的post对象（Prisma include默认包含scalar字段）; (3)但问题在前端square.js:365行，submitPdComment()成功后仅调用loadPostDetail()重新加载详情，这只更新了S.pdPostData和detail overlay的DOM，而不会刷新列表视图(square-feed)。所以用户返回列表时会看到旧的commentCount。
- 建议修法：修复方案：submitPdComment()成功后，除了调用loadPostDetail()外，还需要：(1)更新列表中对应post的commentCount（若该post仍在当前列表中）；或(2)重新加载列表数据。最优做法是在state中维护列表的post对象引用，提交评论成功后增量更新该post的commentCount（S.pdPostData可以同步），这样既避免了全量reload的低效，也确保了列表和详情的数据一致性。详见apps/h5/src/modules/square.js:353-369。

### A15. [high/form] 发帖上传中重复提交：无防抖、无isSubmitting标志
- 文件：`apps/h5/src/modules/square.js:441-471`
- 核实结论：发帖上传中重复提交问题确实存在。具体证据：
1. submitNewPost函数（square.js 441-471行）无任何防重复提交机制
2. 状态对象S中无isSubmittingPost标志（第13行有isSubmittingProposal但未用于发帖）
3. HTML中Publish按钮（index.html 820行）无disabled属性或条件禁用
4. 函数执行流：第450-453行异步上传所有图片，第459行单次POST请求，若用户在上传中快速再次点击，会直接触发第二次submitNewPost()调用，导致并发请求
5. 后端createPost服务（square.service.ts 10-50行）无幂等性保护，无基于时间戳/内容哈希/请求ID的去重机制，会无条件创建新couplePost记录
6. match.js中confirmMatch/rejectMatch（250-296行）已采用正确的防重模式：检查isSubmittingProposal、禁用按钮、finally中重置，但发帖功能未复制该模式
- 建议修法：前端修复方案：(1) 在state.js第32行后添加isSubmittingPost: false；(2) submitNewPost函数头部添加防护：if (S.isSubmittingPost) return; 及 S.isSubmittingPost = true；在try/finally中确保重置；(3) HTML按钮添加条件：disabled=${S.isSubmittingPost ? 'disabled' : ''}；或简单方案：提交前禁用按钮 document.querySelector('button[onclick="submitNewPost()"]').disabled = true；后端可增强idempotency：基于userId+createdAt时间戳（如1秒内相同用户多次POST则拒绝）或使用幂等键机制（客户端生成UUID传递）

### A16. [high/form] Profile Setup: Missing age and gender field collection
- 文件：`C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:101-135`
- 核实结论：前端档案设置页面（page-profile-setup）完全缺少 age 和 gender 输入字段。saveProfile() 函数（profile.js 第 101-135 行）只收集 nickname/school/grade/bio/city/major/mbti/nationality/interests，从不读取或提交 age 或 gender。虽然后端 DTO 允许这两个字段为可选（profile.dto.ts），但匹配服务强制要求用户必须填写这两个字段才能进入匹配池（matching.service.ts 第 840 行：filter 条件要求 `u.profile.gender && u.profile.age != null`）。结果：用户档案设置完成后会进入问卷调查，问卷完成后进入主页，但因为 profile.gender 和 profile.age 都是 null，用户会被匹配算法无声地过滤出去，无法获得任何匹配提议。
- 建议修法：需要在档案设置页面（index.html page-profile-setup 部分）添加 age 和 gender 的输入/选择元素，并在 saveProfile() 函数中读取这两个值并包含在载体中。建议：(1) 在 HTML 表单中为 grade selection 部分上方或下方添加 age range picker（例如数字输入或 select）和 gender radio/select 组件；(2) 在 profile.js saveProfile() 函数第 118-127 行的 extra 对象中添加 age 和 gender 字段；(3) 测试完整流程以确保匹配过滤器第 840 行的条件能通过。

### A17. [high/error] Metadata cache: Silent fallback to empty array on API failure masks data load errors
- 文件：`C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:8-18`
- 核实结论：问题核实为真实存在。代码流确认：

**触发场景1 - 网络故障**
- core.js L17-25: fetch失败或返回非2xx → 抛异常
- profile.js L15-16: catch异常 → 沉默return []
- profile.js L42-46: fillMetaSelect([], ...) → 仅渲染placeholder选项，无可选项

**触发场景2 - 元数据文件缺失**
- metadata.service.ts L12-20: fs.readFileSync异常 → catch返回[]
- 后端返回{success:true, data:{items:[]}}
- 前端profile.js L12: res.data.items = []
- L13: if(items.length) 判定失败 → 不缓存
- L14: return [] → 渲染空dropdown

**真实危害验证**
- 用户点击"Select School"下拉框只看到placeholder无选项，误认为无数据
- 实际问题（API故障、文件丢失、配置错误）完全隐藏无任何错误提示
- L15-16的catch块无console.error、toast或日志

**缓存行为修正（vs论断）**
- 论断："cached previously, stale data served until app restart"
- 实际：L13条件`if(items.length)`仅在非空时缓存
- 若API返回空但有效响应，下次reload仍重新fetch而非持久化stale
- 但网络故障时无任何缓存降级，用户体验仍差
- 建议修法：1. 在fetchMetadata catch块增加错误可见性：catch (e) { console.error(`Metadata fetch failed:`, e.message); window.toast('Failed to load options. Please refresh.'); return []; }

2. 增加即使空数据也缓存的降级策略：const items = res?.data?.items || []; S.metadataCache[path] = {items, ts: Date.now()};

3. 简化响应解析（L12）：const items = res?.data?.items ?? [];

4. 在initProfileSetupPage检查加载失败：if ([unis, cities, majors].some(a => !a?.length)) { window.toast('Some options failed to load.'); document.querySelector('button[onclick="saveProfile()"]').disabled = true; }

### A18. [high/dataflow] Edit Profile: Payload construction silently skips empty string fields
- 文件：`C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:275-287`
- 核实结论：经代码走查确认，该论断准确。前端 saveEditProfile() 在构造 extra 对象后，通过 if(v) 条件过滤，导致所有空字符串字段被排除出 payload。后端 upsertProfile() 使用 prisma.upsert 的 update 操作，仅更新 payload 中存在的字段，未提及的字段保持原值。结果是用户清空 city 时，前端不发送 city 字段，后端无法清除该字段，用户期望的"清空"操作被静默忽略，旧值 'London' 持续存在。
- 建议修法：修改 profile.js 275-287 的条件判断，从 if(v) 改为 if(v !== '')，确保空字符串被包含在 payload 中；同时在后端 profiles.service.ts 中处理空字符串为 null（以便 Prisma 清除字段），或改用 null 作为清除标记。

### A19. [high/state] 问卷中途返回后状态保持依赖S.answers，但S.answers在loadQuestionnaire时被重置
- 文件：`apps/h5/src/modules/questionnaire.js:6-17, 96-104`
- 核实结论：问卷中途返回后状态保持的问题是真实的、有完整代码证据的。前端的 loadQuestionnaire() 在第6-11行无条件地重置 S.currentQuestion=0 和 S.answers={}，即使用户之前已保存过答案。后端虽然通过 /answers POST 的 upsert 逻辑保存了答案到数据库，但前端重新加载问卷时完全没有调用 /answers/mine 接口来恢复这些已保存的答案。因此用户在做到第5题时关闭问卷返回，再次打开时会被重置到第1题且丢失所有答题进度。这是一个真实的前端缺陷。
- 建议修法：修改 apps/h5/src/modules/questionnaire.js 的 loadQuestionnaire() 函数：在获取问卷后，调用 /answers/mine?versionId={问卷版本ID} 来加载已保存的答案。如果存在已答题记录，将这些答案映射回 S.answers 并计算已完成的进度；只有在没有任何已答题时才重置为空。这样可以实现断点续做的体验。

### A20. [high/error] 错误处理吞错：markNotificationRead和notifPollTick的catch都没有日志或toast提示
- 文件：`apps/h5/src/modules/notifications.js:89-95, 119-122`
- 核实结论：确认问题存在：markNotificationRead (C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/notifications.js 89-94行) 的catch块为空，且DOM更新(el.classList.remove('unread'))发生在API调用之后但在错误处理之前，导致如果API失败，UI已显示已读但后端实际失败，用户无感知。refreshUnreadBadge (115行) 和 loadNotifications (81-85行) 的catch块也都为空。notifPollTick (119-122行) 调用链中两个函数都依赖这些破损的错误处理，若轮询过程中网络故障或API错误，用户看到的数据是陈旧的但毫无感知。这些问题与chat.js、profile.js中显式的toast()调用模式不符，是真正的错误处理缺陷。
- 建议修法：在markNotificationRead的catch块中添加console.error和toast提示：catch (e) { console.error('Failed to mark read:', e); window.toast('Failed to mark notification as read'); if (el) el.classList.add('unread'); }。在refreshUnreadBadge和loadNotifications的catch块中添加console.error。在notifPollTick中考虑添加重试机制或检查失败状态。对标chat.js模块的成熟错误处理模式。

### A21. [high/form] 问卷textarea onchange事件不会触发re-render，切题时数据丢失风险
- 文件：`apps/h5/src/modules/questionnaire.js:48-49`
- 核实结论：论断完全正确。TEXT 类型题的 textarea 在 questionnaire.js 第 49 行使用 onchange="answerText(...)"，而 onchange 仅在 blur 时触发。若用户在 textarea 中输入文字后直接点击 Next 而不 blur（例如用 Tab 或鼠标点击按钮跳过），answerText() 不会被调用，S.answers[q.id] 保持 undefined。nextQuestion() 中没有任何前置验证（第 96-105 行），直接调用 renderQuestion() 重新渲染，textarea 的 DOM 被 innerHTML 销毁，用户的输入永久丢失。后端答案服务会验证必答题（isRequired=true）是否都有对应的 answer 记录，如果该题未被记录则拒绝提交。
- 建议修法：将第 49 行的 onchange 改为 oninput，并同时在 answerText() 后添加 window.renderQuestion() 调用以保持 UI 与状态同步；或在 nextQuestion() 中添加验证逻辑检查当前题目是否已填写（检查 S.answers[q.id] 是否为 undefined 或空）且 q.isRequired 为真时阻止跳转并提示用户。最佳方案是两者结合：用 oninput 实时保存 + nextQuestion 验证。

---

## B. medium / low（42 条，待核实后修复）

- **B1** [medium/boundary] Await 前没有检查必要前置状态，可能导致空指针错误 — `apps/h5/src/modules/chat.js:9-37`
  - openChat() 第 14 行 `const match = S.matchStatus.partner || S.matchStatus.match` 在 S.matchStatus 为 null 时会抛错（无 safe-chain 或存在性检查）。若用户先进入 chat 页面而未加载 match 状态，会直接崩溃。类似的还有 S.currentUser?.profile?.avatarUr
- **B2** [medium/optimistic] 乐观更新后回滚逻辑不完整，用户可见闪屏或状态不一致 — `apps/h5/src/modules/match.js:202-214`
  - startMatch() 中乐观渲染「搜索中」状态后调用 API，若 API 失败则 loadMatchTab() 刷新真实状态。但在用户网络不稳定时，可见的状态变化顺序为：idle → searching → 闪回 idle。更严重的是 likePost() (square.js 157-179) 直接修改计数器，若 API 返回 unexpected response 格式（如 res.dat
- **B3** [medium/form] 表单重复提交防护不足：乐观禁用按钮但未验证幂等性 — `apps/h5/src/modules/match.js:249-297`
  - confirmMatch/rejectMatch 中虽然置 S.isSubmittingProposal = true 来禁用按钮，但若用户在禁用前双击或用浏览器开发者工具触发多次点击，可能发出多个请求。后端若不是幂等实现（如状态机检查 'proposed' 状态再转移），会返回 400「已处理过」而前端仍执行 loadMatchTab() 恢复，但中间有个刹那的错误提示闪烁。
- **B4** [medium/polling] Polling 陷入失败循环：每次 API 错误都 catch 吞掉，无重试策略或指数退避 — `apps/h5/src/modules/match.js:389-399、chat.js:275-287、notifications.js:124-127`
  - 所有轮询都用 `setInterval` 且 `catch(e) {}` 吞掉所有错误。若 API 服务故障（如数据库宕机），轮询会无限重复每 5-30 秒发失败请求，浪费网络和电池。且用户无任何反馈。对比而言，应该在连续失败N次后降低轮询频率或停止轮询并提示用户。
- **B5** [low/cache] Metadata 缓存无失效策略和大小限制，可能导致内存泄漏 — `apps/h5/src/modules/profile.js:8-18`
  - S.metadataCache 在页面整个生命周期内持续积累（university/major/city/mbti/nationality 等），一旦页面不刷新就永不清理。若用户多次打开编辑资料，每次都调用 fetchMetadata() 并缓存，cache 会逐渐膨胀。虽然单次数据量不大（可能只有几 KB），但在长期会话中可能累积到 MB 级，尤其是若后端未设 cache-control 并且响
- **B6** [medium/dataflow] Chat 消息分页加载时滚动位置恢复逻辑脆弱，长列表性能差 — `apps/h5/src/modules/chat.js:129-142、247-273`
  - loadEarlierChatMessages() 通过计算 prevHeight 和 scrollTop 来恢复位置，但若渲染过程中 DOM 尺寸变化（图片懒加载完成、文本换行等），计算会失效。再加上 S.chatMessages 是全量加载（第 48-68 行），若对话有数百条消息，每次加载都会重新渲染整个列表（innerHTML 赋值），会卡顿。Polling (第 247-273 行) 也
- **B7** [medium/state] Profile 编辑时字段值取自 DOM 而非 S.currentUser，可能造成数据不一致 — `apps/h5/src/modules/profile.js:263-296`
  - saveEditProfile() 用 document.getElementById(...).value 来读取表单值，但若 openEditProfile() 和实际编辑之间有其他操作修改了 S.currentUser（如后台推送或其他 tab 修改），表单初始值不会更新，用户无感知地基于旧值提交。例如另一 tab 修改了 grade，当前编辑 tab 仍显示旧值并可能覆盖。
- **B8** [medium/state] Overlay 切换时未清理内部状态，可能导致前次操作残留影响新打开 — `apps/h5/src/modules/core.js:126-148`
  - openOverlay/closeOverlay 只操作 DOM class，不清理模块内缓存。例如打开 post-detail-overlay 加载评论，关闭时 S.pdPostData、S.currentPostId、S.pdReplyTo 都保留，再次打开同一个或不同的 post 时旧数据残留可能影响渲染或交互逻辑（如回复框仍显示前一个 post 的回复目标）。
- **B9** [medium/optimistic] 开始匹配乐观渲染未能正确同步后端状态 — `apps/h5/src/modules/match.js:202-214`
  - startMatch (第202行) 中，乐观渲染 S.matchStatus = { state: 'searching' }，然后 await window.api('/matching/start', 'POST')。若 API 失败，catch 只 toast 错误，不修改 S.matchStatus；然后 loadMatchTab() 会重新拉取实际状态。问题：乐观渲染与实际状态的同步时
- **B10** [medium/polling] 轮询 startMatchPolling 未检测 tab 切换，可能持续轮询非活跃状态 — `apps/h5/src/modules/match.js:389-400`
  - startMatchPolling 设置 30s 轮询。loadMatchTab 第12行条件 if (S.matchStatus.state !== 'matched' && S.matchStatus.state !== 'relationship') 会启动轮询。但 switchTab (core.js:99) 虽调用 stopMatchPolling()，若轮询回调中的 window.re
- **B11** [low/cache] 偏好筛选回填时 preferredGender null 值处理不一致 — `apps/h5/src/modules/match.js:455`
  - openFilterSheet (第448行) 中，第455行 S.filterGender = prefs.preferredGender || 'all'。后端 getMatchPreferences (matching.service.ts:767) 返回 preferredGender: null（表示不限），前端 || 运算将 null 视为 falsy，回退到 'all'。虽然结果相同
- **B12** [medium/form] 偏好筛选 universityStage 白名单校验后未同步到 UI 高亮 — `apps/h5/src/modules/match.js:457`
  - 第457行 S.filterStage = STAGE_WHITELIST.includes(prefs.universityStage) ? prefs.universityStage : undefined。若后端返回非法值（如 'phd'，不在 STAGE_WHITELIST ['undergraduate', 'master', 'doctor'] 中），S.filterStage 被设为
- **B13** [low/form] saveFilterPrefs 未检验年龄范围有效性 — `apps/h5/src/modules/match.js:498-519`
  - 第500-501行 const rawMin = parseInt(...) || 18, rawMax = parseInt(...) || 24。若用户手动修改 HTML input 值为非数字（如 'abc'），parseInt 返回 NaN，|| 18 会兜底。但若用户同时改两个值，可能出现 rawMin > rawMax（虽然第508-509行有 Math.min/Math.max 纠正
- **B14** [medium/boundary] renderMatchTab 多分支间状态条件判断遗漏边界 — `apps/h5/src/modules/match.js:46-199`
  - renderMatchTab 中，state 来自 data.state (后端新格式) 或 data.status（旧格式，第52行）。但后端 getFullMatchStatus 仅返回 state 字段（matching.service.ts 全文无 status 字段），故 data.status 降级分支永不触发。现有条件分支为：matched/relationship (54行), p
- **B15** [medium/dataflow] stopMatch 操作成功后立即 loadMatchTab，可能竞态陷入 searching — `apps/h5/src/modules/match.js:217-226`
  - stopMatch (第217行) 调用 API 停止匹配，后端将 matchState 改为 'idle'（matching.service.ts:138）。然后第221行 window.loadMatchTab() 拉取新状态。若此时后台有定时匹配任务执行，可能同时调用 triggerMatchJob，将该用户重新置为 'searching'。前端会拉到 'searching' 状态，显示匹配
- **B16** [medium/polling] 轮询增量消息与历史加载缺乏同步屏障导致边界消息重复可能性 — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/chat.js:48-68, 246-273`
  - 用户首次进入聊天页。loadChatHistory() 第63行设置 S.chatMessages = all，第64行设置 S.chatLastId = all[49].id；立即调用 startChatPolling()（第36行）。若历史加载与第一次轮询之间的网络延迟很小，pollMessages() 可能获取到包含重复消息边界的结果。触发：网络稳定但延迟小（<1s）、消息到达频繁的场景。用
- **B17** [medium/boundary] 历史分页防重入标志同步设置，快速滚动时可能触发并发加载 — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/chat.js:130-141`
  - 用户快速向上滚动，触发 loadEarlierChatMessages()（第130行）。第134行设置 S.chatLoadingHistory = true，第137-139行 sync 重新渲染，第140行立即设置为 false。若用户再次滚动（第0-10px范围）触发，由于异步操作本身不完整（渲染是同步的，但 scroll 事件可能重入），可能导致重复减少 chatRenderFrom。此
- **B18** [medium/polling] 首次加载为空时 afterId=null 导致轮询无过滤，收到全量消息+重复风险 — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/chat.js:48-68, 246-272 & apps/api/src/chat/chat.service.ts:139-156`
  - 新对话首次开启，loadChatHistory() 返回 0 条消息（双方从未聊天），S.chatLastId 设为 null。第一次轮询调用 pollMessages(afterId=null)。后端过滤条件：afterId 为 null 时不过滤（第142-143行），返回所有消息。若此时对方恰好发了消息，loadChatHistory() 完成之间可能既收到了轮询的消息又收到了历史的消息（重
- **B19** [medium/dataflow] markChatRead() 被 pollChatMessages() 频繁调用且消息判定逻辑草率 — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/chat.js:265, 208-214`
  - pollChatMessages() 第265行检查 `fresh.some(m => m.senderId !== S.currentUser?.id)` 只判断是否有对方消息，立即调用 markChatRead()。但 fresh 消息列表中可能有自己的重复消息（如果轮询返回了之前发的）。调用 PUT 会标记对方所有消息为已读，导致本来未读的旧消息被误标记。同时每 5 秒轮询如果每次都有对方消
- **B20** [medium/boundary] 列表点赞按钮DOM选择器脆弱：样式改变即失效 — `apps/h5/src/modules/square.js:162-176`
  - likePost函数通过 `btn.querySelector('[data-like-count]')` 和 `.querySelector('.material-symbols-outlined')` 查找DOM更新点赞数与icon。问题：postLikeButton返回的HTML中icon有多个修饰符（如`transition-colors`），如果UI改版后icon的class顺序变化或新
- **B21** [medium/boundary] 评论回复：取消回复后input仍有焦点，用户无明确反馈 — `apps/h5/src/modules/square.js:322-351`
  - setPdReply第339行自动focus到comment-input，但cancelPdReply（第343-351行）只隐藏reply-bar，不clear input焦点状态。若用户点击回复→设置pdReplyTo→点击cancel，input仍聚焦且没有blur效果，视觉上无法清晰判断回复已取消（尤其是低端设备软键盘开启的情况）。另外，pdReplyTo的id与replyTargetId
- **B22** [medium/boundary] 发帖后关系检查失败无清晰提示：RELATIONSHIP_MODE校验前端缺少 — `apps/h5/src/modules/square.js:441-471`
  - submitNewPost（第441行）直接调用API，但后端在square.service.ts第16行校验user.mode !== 'RELATIONSHIP_MODE'时会返回ForbiddenException。问题：(1)前端未预先校验关系状态，如果用户失去匹配（从RELATIONSHIP_MODE→DISSOLVED），再点发帖会得到API错误 (2)错误处理catch只显示gene
- **B23** [medium/polling] 分类tab切换时旧请求竞态覆盖新结果 — `apps/h5/src/modules/square.js:11-22`
  - switchSquareTab（第11行）修改S.squareSection后立即调用loadSquarePosts，但loadSquarePosts是异步无cancel机制。场景：用户快速点击 Recommended→Campus Life→Top Stories，三个请求并发，最后哪个response返回就用哪个的数据渲染，可能显示错误分类的posts。没有request ID或abort c
- **B24** [low/boundary] 多图轮播：边界条件未处理（首尾导航、单图隐藏） — `apps/h5/src/modules/square.js:214-248`
  - renderPdImages（第214行）生成轮播carousel和navigation buttons。问题：(1)pdCarouselNav（第233行）无边界检查，用户在首张图片左滑或末张图片右滑时，仍能smooth scroll，产生空白frame (2)单图情况（第216行）返回无轮播按钮的HTML，但如果后续数据更新为多图（例如编辑post），DOM不会自动转换为carousel (3
- **B25** [medium/boundary] API响应结构解析混乱：data.data || data形式重复 — `apps/h5/src/modules/square.js:29,160,206`
  - 三个地方都有 `data.data || data` 的防御式解析：(1)loadSquarePosts第29行 `const env = data.data || data` (2)likePost第160行 `const res = (data && (data.data || data)) || {}` (3)loadPostDetail第206行 `S.pdPostData = data.
- **B26** [low/error] 列表加载失败：无重试机制，error UI不友好 — `apps/h5/src/modules/square.js:57-62`
  - loadSquarePosts catch块（第57-62行）显示'Failed to load posts'的static HTML，无重试button。如果网络波动，用户被迫手动刷新整个Square tab，用户体验差。另外，S.squareSection状态会被保留，下次刷新时会请求相同分类，但无缓存或stale-while-revalidate机制。
- **B27** [medium/dataflow] 详情页回复目标模糊：parentCommentId可能指向reply而非top-level comment — `apps/h5/src/modules/square.js:250-267,322-331`
  - setPdReply的参数replyTargetId（第322行注释说是'top-level parent'）被传给backend作parentCommentId。但问题在renderPdComment（第251行）中：为了支持嵌套replies，replyTargetId被用作两个目的：(1)是否缩进渲染（isReply参数） (2)传给backend的parent ID。如果comment既可
- **B28** [medium/optimistic] Settings toggle: Render called before API response can cause race condition UI flip — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/settings.js:49-72`
  - User clicks pushEnabled toggle → toggleSetting('pushEnabled') immediately renders ON state → calls window.renderSettingsToggles() to show toggle switched → slow network: API takes 3s to respond → user
- **B29** [medium/dataflow] Settings: loadUserSettings() called AFTER renderSettingsToggles() in openSettings() — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/settings.js:6-12`
  - openSettings() calls renderSettingsToggles() (line 10) before loadUserSettings() (line 12) → first render uses old/default S.userSettings → loadUserSettings() is async but doesn't await → renderSettin
- **B30** [medium/boundary] Partner Profile: realPhotos array not guaranteed in API response — undefined fallback works but brittle — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:572-608`
  - viewPartnerProfile() calls /users/{userId}/public-profile → renderPartnerProfileFull(p) assumes p.realPhotos is always array or null, uses 'const photos = p.realPhotos || []' → if backend returns {rea
- **B31** [medium/dataflow] Edit Profile: saveEditProfile() doesn't preserve realPhotos or cover URL in payload — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:263-295`
  - User edits nickname in Edit Profile overlay (which also shows photo grid + cover) → saves profile → payload only includes {nickname, bio, interests, school, grade, city, major, mbti, nationality} → re
- **B32** [medium/state] Profile photo upload: Optimistic update + no loading state means concurrent uploads race — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:424-447`
  - User rapidly clicks upload button twice before first upload completes → two async chains run in parallel → both call renderPhotoSlots() after their API returns → if second finishes first with URL1, fi
- **B33** [low/state] Setup page: initProfileSetupPage() called twice on page show (race with module load) — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:640-647`
  - profile.js defers window.showPage override via setTimeout(()=>{...}, 0) to wrap baseShowPage → when user navigates back to setup page, window.showPage('page-profile-setup') fires → wrapped override ca
- **B34** [low/form] Edit tags: renderEditTags() has duplicate getElementById call with same fallback — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:328-332`
  - renderEditTags() line 329: 'const c = document.getElementById('edit-tags-list') || document.getElementById('edit-tags-list')' — same query twice, pointless. If element missing, c=null and no error but
- **B35** [low/form] Setup interests: No deduplication check in addSetupTagValue() — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/profile.js:65-71`
  - addSetupTag() (line 53) has check 'if (!S.setupTags.includes(tag))' to prevent dupes, but addSetupTagValue() (line 65) HAS this check on line 67 too. Both called from different places (form input vs p
- **B36** [low/error] API error handling: 401 token refresh redirects without stopping current request chain — `C:/Users/丁漠涵/Desktop/campus-love/apps/h5/src/modules/core.js:18-22`
  - saveProfile() calls window.api('/profiles/me', 'PUT', payload) → network 401 → api() removes token + redirects to page-auth → returns null → saveProfile() receives null, tries 'const u = data.data || 
- **B37** [medium/polling] 通知未读徽章更新时序问题：标记已读后refreshUnreadBadge可能拿到缓存数据 — `apps/h5/src/modules/notifications.js:89-96, 98-117`
  - markNotificationRead(id, el) 调用 API 标记单条已读成功后，立即调用refreshUnreadBadge()重拉计数。但如果后端标记成功但网络延迟，或前端轮询正在进行中（notifPollTick每15秒调一次），可能产生计数不一致。更严重：若连续快速点击多条通知的unread徽章，每条都会触发refreshUnreadBadge，但API请求竞态导致最后的结果可能
- **B38** [medium/dataflow] 排行榜快速切tab时可能出现数据不一致：S.lbTab变更了但UI还在渲染旧tab数据 — `apps/h5/src/modules/leaderboard.js:23-34, 84-140`
  - switchLbTab(tab) 改S.lbTab、更新按钮样式，然后调用loadLeaderboardData()。如果用户极快连续点击多个tab（duration->score->compatibility），switchLbTab会快速改S.lbTab，而每个loadLeaderboardData()是异步的。若score的API响应慢于compatibility，会导致最后的innerHT
- **B39** [medium/boundary] 通知列表分页不完整：仅加载第1页，若用户通知超50条则看不到更早的 — `apps/h5/src/modules/notifications.js:20-26, 24`
  - loadNotifications()硬编码 page=1&limit=50，无分页UI（无'Load more'按钮）。若用户有超50条通知，最早的通知永远看不到。且轮询notifPollTick只重新加载第1页，若用户滚动查看历史（假设有分页），新轮询结果会覆盖用户正在看的页面。
- **B40** [medium/state] 里程碑S.matchStatus未及时同步导致渲染异常：若openMilestones时无active match但之后match发生变化 — `apps/h5/src/modules/milestone.js:12-37, 29-34`
  - loadMilestone()先拉取/matching/milestones，若返回state!=='relationship'则渲染空态。但随后若尝试拉/matching/status补充partner信息用于header avatar，两个API间可能不一致（例如milestones已进入relationship但status还在loading）。更严重：renderMilestone()依赖
- **B41** [medium/dataflow] 通知点击跳转metadata依赖但未验证：点通知跳转到match可能失败如果matchId不存在 — `apps/h5/src/modules/notifications.js:58, 54-70`
  - HTML中 markNotificationRead('${n.id}', this) 有onclick绑定，但渲染逻辑(54-70行)没有看到跳转逻辑。查看HTML index.html的.notif-item onclick，应该是有点击后跳转。但代码里没找到对metadata.matchId的处理。如果这个跳转逻辑存在但未在本文件中，那就是关键遗漏。假设存在，则未验证matchId是否有效，
- **B42** [medium/dataflow] 排行榜coupleInfo数据字段不匹配可能导致空名字：coupleA/coupleB vs userA/userB — `apps/h5/src/modules/leaderboard.js:37-48, 84-139`
  - lbNames()获取coupleA.nickname 和 coupleB.nickname，但后端返回的可能是userA/userB而非coupleA/coupleB（两个命名约定混用）。lbCoupleAvatars()同样期望coupleA/coupleB。若后端返回的JSON key是userA/userB，则所有avatar和names都会是undefined，UI显示'Couple'（

## C. 已推翻（误报，不修）

- 缺少全局错误边界：未捕获 Promise rejection 导致应用崩溃无提示
- API 响应解包逻辑不一致，可能导致数据为 undefined
- 切换 Tab 时轮询启停不完全，可能导致页面切走后轮询继续占用资源或造成幽灵渲染
- renderMatchTab 第53行 match 变量赋值逻辑混淆
- proposed 状态下轮询可能被 stopCountdownTick 干扰
- 已读回执无防抖，多条消息连续到达时触发风暴式PUT请求
- 图片消息发送失败的降级方案过度重（重新加载全部历史）损坏已读状态
- 列表→详情点赞状态不一致：乐观更新失败后无回滚
- Edit Profile: Missing age and gender field binding
- 问卷提交缺少必答题校验（前端无拦截）
- 轮询泄漏：switchTab时未清理所有轮询（openLeaderboard后返回tab无清理）
- Milestone空态判断逻辑不完整：state==='relationship'但无partner数据时会崩溃

