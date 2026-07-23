import { S } from '../state.js';

// ========================================
// HOME TOP-LEVEL VIEW SWITCH (Chat / 恋人匹配 / 朋友匹配)  §6.2 (A 规则)
// ========================================
// 主页内部三切换：'chat' | 'romantic' | 'friend'。
//  - 'chat'：显示会话列表视图 #home-chat-view，调 loadSessions()（chat.js 列表层，§6.6）。
//  - 'romantic' / 'friend'：显示匹配视图 #home-match-view，设 S.activeMatchMode 后先查该模式
//    问卷完成度（GET /questionnaire/completion，§6.3 G 规则——未填不能进匹配，引导去填），
//    已填则 loadMatchTab()。
function switchHomeView(view) {
  if (view !== 'chat' && view !== 'romantic' && view !== 'friend') view = 'chat';
  S.homeView = view;
  // 切视图先停掉上一视图的轮询/倒计时/动画，避免叠加泄漏
  window.stopMatchPolling();
  window.stopCountdownTick();
  window.stopCampusAnim?.();
  // 顶部分段高亮
  document.querySelectorAll('#home-mode-switch .home-mode-seg').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  // 左上角按钮随视图切换：Chat=加好友；恋人/朋友匹配页=Match Settings（本轮反馈4）
  const leftBtn = document.getElementById('home-addfriend-btn');
  if (leftBtn) {
    const icon = leftBtn.querySelector('.material-symbols-outlined');
    if (view === 'chat') {
      // Chat 视图左上角加号 → 小弹出卡（搜索/扫码/关系网 + 深色/语言，本轮反馈7）
      if (icon) icon.textContent = 'add';
      leftBtn.title = 'Add';
      leftBtn.onclick = () => window.toggleChatPlusMenu();
    } else {
      if (icon) icon.textContent = 'tune';
      leftBtn.title = 'Match Settings';
      leftBtn.onclick = () => window.openMatchSettings();
    }
  }
  const chatView = document.getElementById('home-chat-view');
  const matchView = document.getElementById('home-match-view');
  if (view === 'chat') {
    if (chatView) chatView.style.display = 'block';
    if (matchView) matchView.style.display = 'none';
    // 会话列表由 chat.js 提供（§6.6）；尚未实现时静默跳过，不阻塞匹配视图。
    window.loadSessions?.();
    return;
  }
  // 匹配视图（恋人 / 朋友）
  if (chatView) chatView.style.display = 'none';
  if (matchView) matchView.style.display = 'flex';
  S.activeMatchMode = view;
  // 进模式前先查问卷完成度（G 规则：未填该模式问卷不能进匹配，引导去填）
  ensureQuestionnaireThenMatch(view);
}
window.switchHomeView = switchHomeView;

// ─── Chat 视图加号小弹出卡（本轮反馈7）────────────────────────
// 顺序：搜索 → 扫码 → 关系网；附深色模式/语言。点击项后关卡片再执行。
function toggleChatPlusMenu() {
  const existing = document.getElementById('chat-plus-menu');
  if (existing) { existing.remove(); return; }
  const items = [
    { icon: 'search', label: 'Search chats', run: () => window.openFriendHubAt('search') },
    { icon: 'qr_code_2', label: 'Add by QR', run: () => window.openFriendHubAt('qr') },
    { icon: 'hub', label: 'Relationship Network', run: () => window.openFriendHubAt('graph') },
    { icon: 'dark_mode', label: 'Dark mode', run: () => window.toggleDarkMode() },
    { icon: 'translate', label: 'Language', run: () => window.toggleLang() },
  ];
  const wrap = document.createElement('div');
  wrap.id = 'chat-plus-menu';
  wrap.innerHTML = `
    <div class="cpm-backdrop" onclick="toggleChatPlusMenu()"></div>
    <div class="cpm-card">
      ${items.map((it, i) => `
        <button type="button" class="cpm-item" data-i="${i}">
          <span class="material-symbols-outlined" style="font-size:20px">${it.icon}</span>
          <span>${it.label}</span>
        </button>`).join('')}
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('.cpm-item').forEach((btn) => {
    btn.onclick = () => {
      const it = items[Number(btn.dataset.i)];
      toggleChatPlusMenu();
      it.run();
    };
  });
  // 触发入场动画
  requestAnimationFrame(() => wrap.querySelector('.cpm-card')?.classList.add('cpm-in'));
}
window.toggleChatPlusMenu = toggleChatPlusMenu;

// 查该模式问卷完成度：completed=false -> 引导去填该模式问卷；已填 -> loadMatchTab()。
// completion 接口异常时不阻断匹配（退化为直接进匹配界面，避免误锁用户）。
async function ensureQuestionnaireThenMatch(mode) {
  let completed = true;
  try {
    const res = await window.api('/questionnaire/completion?type=' + mode);
    // 兼容 {success,data:{[mode]:{completed}}} / {data:{...}} / 直接 {[mode]:{...}} /
    // 扁平 {completed} 四种返回形态：先解包 envelope，再按 mode 取桶，缺则回退顶层。
    const d = res?.data ?? res ?? {};
    const m = d[mode] ?? d ?? {};
    completed = !!m.completed;
  } catch (e) {
    console.warn('[match] 问卷完成度查询失败，默认放行进匹配', e);
    completed = true;
  }
  // 视图可能在等待期间被切走：仅当仍停留在该匹配模式时才继续渲染
  if (S.homeView !== mode) return;
  if (!completed) {
    promptFillQuestionnaire(mode);
    return;
  }
  window.loadMatchTab();
}

// 未填问卷引导：在 #match-content 渲染一张引导卡，按钮跳问卷页填写对应模式问卷。
function promptFillQuestionnaire(mode) {
  window.stopCountdownTick();
  const container = document.getElementById('match-content');
  if (!container) return;
  const isFriend = mode === 'friend';
  const labelText = isFriend ? 'Friend Questionnaire' : 'Romantic Questionnaire';
  // 平面简约空态（本轮反馈6）：荧光绿圆角方块 + 黑色图标，无圆环无描边
  container.innerHTML = `<div class="w-full text-center px-8 py-16">
    ${window.flatEmptyIcon(isFriend ? 'group' : 'auto_awesome', 'neon')}
    <h2 class="font-headline text-lg font-extrabold tracking-tight text-on-surface mb-2">${labelText}</h2>
    <p class="font-body text-on-surface-variant text-sm mb-10 max-w-[15rem] mx-auto leading-relaxed">A few quick questions unlock ${isFriend ? 'friend' : 'romantic'} matching.</p>
    <div class="w-full max-w-xs mx-auto">
      <button class="btn-cta bg-neon text-black" onclick="goFillQuestionnaire('${mode}')">Fill Out Questionnaire</button>
    </div>
  </div>`;
}
window.promptFillQuestionnaire = promptFillQuestionnaire;

// 跳问卷页并加载对应模式问卷（mode 透传给 questionnaire.js；当前实现忽略 mode 亦兼容）。
function goFillQuestionnaire(mode) {
  S.questionnaireMode = mode === 'friend' ? 'friend' : 'romantic';
  window.showPage('page-questionnaire');
  window.loadQuestionnaire?.(S.questionnaireMode);
}
window.goFillQuestionnaire = goFillQuestionnaire;

// ========================================
// MATCH TAB
// ========================================
// 拉取当前匹配模式（S.activeMatchMode）的状态，存入 S.matchStatus[mode] 分桶，渲染。
// Defensive: ensure S.matchStatus is the bucketed shape before indexing by mode
// (some teardown paths may have nulled it). Idempotent.
function ensureMatchStatusBucket() {
  if (!S.matchStatus || typeof S.matchStatus !== 'object') {
    S.matchStatus = { romantic: null, friend: null };
  }
  return S.matchStatus;
}

// 防御：保证 S.enhanced 及其 romantic/friend 分桶结构存在，避免 toggleEnhance /
// updateEnhanceUI / loadPrefsForMode 在 state 被清空（登出/重登）后访问 undefined 崩溃。
// 幂等。与 ensureMatchStatusBucket 同模式。
function ensureEnhancedShape() {
  if (!S.enhanced || typeof S.enhanced !== 'object') S.enhanced = {};
  if (!S.enhanced.romantic || typeof S.enhanced.romantic !== 'object') {
    S.enhanced.romantic = { enabled: false, cost: 3 };
  }
  if (!S.enhanced.friend || typeof S.enhanced.friend !== 'object') {
    S.enhanced.friend = { enabled: false, cells: 1 };
  }
  return S.enhanced;
}
window.ensureEnhancedShape = ensureEnhancedShape;

async function loadMatchTab() {
  const mode = S.activeMatchMode || 'romantic';
  ensureMatchStatusBucket();
  try {
    const data = await window.api('/matching/status?mode=' + mode);
    const status = data.data || data;
    S.matchStatus[mode] = status;
    window.renderMatchTab(status);
    // 非终态都轮询（恋人 relationship 为终态停轮询；朋友常驻轮询可继续追加候选）
    const st = status.state;
    if (mode === 'romantic') {
      if (st !== 'relationship') window.startMatchPolling();
    } else {
      window.startMatchPolling();
    }
  } catch (e) {
    console.error('[match] loadMatchTab 失败', e);
    // A8: 状态感知的失败处理。已知非空闲态时保留现有 DOM，仅提示网络错误并恢复按钮可点，
    // 避免把已知的 matched/confirming/relationship 卡片覆盖成 idle 空白。
    const prev = S.matchStatus[mode];
    const prevState = prev && (prev.state || prev.status);
    if (prevState && prevState !== 'idle') {
      S.isSubmittingProposal = false;
      window.setProposalButtonsDisabled(false);
      window.toast('Network error, please try again');
      return;
    }
    window.stopCountdownTick();
    const container = document.getElementById('match-content');
    if (container) {
      container.innerHTML = window.renderIdleMatch();
      window.startCampusAnim('idle');
    }
  }
}
window.loadMatchTab = loadMatchTab;

function renderIdleMatch() {
  // idle 与 searching 共用相同的固定高度骨架，保证两态切换时动画块与主按钮垂直位置不跳动。
  const mode = S.activeMatchMode || 'romantic';
  const friend = mode === 'friend';
  const title = friend ? 'Find New Friends' : 'Start Your Journey';
  const sub = friend
    ? 'Enter the matching pool to discover up to 5 like-minded companions.'
    : 'Enter the matching pool to discover your intellectual companion.';
  return `<div class="w-full text-center px-8 flex flex-col items-center">
    ${renderMatchWaitAnim(false)}
    <div class="mt-6 flex flex-col items-center">
      <h2 class="font-headline text-[22px] font-extrabold tracking-tight text-on-surface mb-2">${title}</h2>
      <p class="font-body text-on-surface-variant text-[13px] leading-relaxed max-w-[16rem] mx-auto">${sub}</p>
    </div>
    <div class="mt-8 w-full max-w-xs mx-auto flex flex-col items-center gap-5">
      <button class="btn-cta w-full bg-neon text-black" onclick="startMatch()">Join Matching Pool</button>
      <button class="text-[11px] font-bold tracking-wide text-outline hover:text-primary transition-colors underline underline-offset-8" onclick="openFilterSheet()">Modify Preferences</button>
    </div>
  </div>`;
}
window.renderIdleMatch = renderIdleMatch;

// ── 等待动画：直接嵌入设计文件本体（/loaders.html = 原 HTML 原样，iframe 渲染）──
// 恋人 = #2 呼吸双球融合；朋友 = #20 呼吸集群。active=false 浅灰静止，true 荧光绿播放。
function renderMatchWaitAnim(active) {
  const friend = (S.activeMatchMode || 'romantic') === 'friend';
  const v = friend ? '20' : '2';
  const color = active ? '%23CCFF00' : (document.documentElement.classList.contains('dark') ? '%233a3a42' : '%23d6d6d6');
  const run = active ? '1' : '0';
  return `<div class="match-anim"><iframe class="match-anim-frame" src="/loaders.html?v=${v}&run=${run}&color=${color}" scrolling="no" frameborder="0" aria-hidden="true"></iframe></div>`;
}

// 兼容旧调用点：iframe 内 CSS 动画自驱动
function startCampusAnim() {}
window.startCampusAnim = startCampusAnim;
function stopCampusAnim() {}
window.stopCampusAnim = stopCampusAnim;
window.stopCampusAnim = stopCampusAnim;


// A4/A6/A7: 对方资料缺失（partner 为 null / 不完整 / 账户变更）时的容错卡片。
function renderPartnerMissing(message) {
  return `<div class="w-full text-center px-8 py-16">
    ${window.flatEmptyIcon('person_off')}
    <h2 class="font-headline text-lg font-extrabold tracking-tight text-on-surface mb-2">Profile Unavailable</h2>
    <p class="font-body text-on-surface-variant text-sm mb-10 max-w-xs mx-auto leading-relaxed">${window.escapeHtml(message || "Couldn't load this profile. Please try again later.")}</p>
    <div class="w-full max-w-xs mx-auto">
      <button class="btn-cta bg-neon text-black" onclick="loadMatchTab()">Refresh</button>
    </div>
  </div>`;
}
window.renderPartnerMissing = renderPartnerMissing;

// ========================================
// RENDER MATCH TAB（按 mode 分支：恋人单对象 / 朋友最多 5 候选）  §6.2 / §6.5
// ========================================
function renderMatchTab(data) {
  const container = document.getElementById('match-content');
  if (!container) return;
  // 每次重渲先清掉共享倒计时 interval，各分支再按需启动自己的 ticker，避免残留。
  window.stopCountdownTick();
  const mode = (data && data.mode) || S.activeMatchMode || 'romantic';
  if (mode === 'friend') return renderFriendMatchTab(container, data);
  return renderRomanticMatchTab(container, data);
}
window.renderMatchTab = renderMatchTab;

// ─── 恋人分支 ────────────────────────────────────────────────
function renderRomanticMatchTab(container, data) {
  const state = data.state || data.status || 'idle';

  // relationship：已确认恋人（B 规则——恋人匹配停止）。匹配界面改为「打开和恋人的对话」+「解除关系」，
  // 不再展示「开始匹配」。确认按钮在 Chat 对话框内（D 规则）。
  if (state === 'relationship') {
    if (!data.partner || !data.partner.nickname) {
      container.innerHTML = renderPartnerMissing('This profile is unavailable — it may be updating or the account has changed.');
      return;
    }
    const matchId = data.match?.id || data.matchId;
    // 恋人确认后：匹配页不再展示对方资料卡，改为情侣互动空间（本轮反馈2）
    window.renderCoupleSpace(container, matchId, data.partner);
    return;
  }

  // matched / confirming：临时对话（48h 双确认）。匹配界面只给「进入对话」入口 + 48h 提示，
  // 确认按钮在 Chat 对话框内（D 规则）。
  if (state === 'matched' || state === 'confirming') {
    if (!data.partner || !data.partner.nickname) {
      container.innerHTML = renderPartnerMissing('This profile is unavailable — it may be updating or the account has changed.');
      return;
    }
    const p = data.partner;
    const m = data.match || {};
    const matchId = m.id || data.matchId;
    const avatar = p.avatarUrl || p.avatar || '';
    const cover = p.coverUrl || avatar; // #1 卡片背景用对方封面图，没有则用头像模糊兜底
    const verified = p.verificationStatus === 'verified';
    const interests = p.interests || p.tags || [];
    const waiting = m.myConfirmed && !m.partnerConfirmed;
    container.innerHTML = `
      <div class="w-full max-w-xl mx-auto py-4">
        <div class="px-2 mb-4">
          <p class="font-headline text-[10px] font-bold text-outline-variant tracking-[0.3em]">This Week's Match</p>
        </div>
        <div class="relative border border-outline-variant/10 overflow-hidden rounded-[10px]">
          ${cover ? `<img src="${window.safeUrl(cover)}" alt="" class="absolute inset-0 w-full h-full object-cover ${p.coverUrl ? '' : 'blur-2xl scale-125'}"><div class="absolute inset-0" style="background:linear-gradient(to bottom,rgba(249,249,249,0.3),rgba(249,249,249,0.62) 48%,rgba(249,249,249,0.92) 82%)"></div>` : '<div class="absolute inset-0 bg-surface-container-lowest"></div>'}
          <div class="relative p-6">
            <div class="flex flex-col items-center text-center mb-6 pt-2">
              <div class="w-28 h-28 rounded-full border-4 border-primary p-1 overflow-hidden bg-white mb-3 cl-pulse">
                ${avatar ? `<img src="${window.safeUrl(avatar)}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full rounded-full bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined text-4xl text-outline">person</span></div>`}
              </div>
              <h3 class="text-2xl font-headline font-bold tracking-tight text-on-surface flex items-center gap-2 justify-center">${window.escapeHtml(p.nickname || 'Match')}${verified ? `<span class="material-symbols-outlined text-base text-primary" title="Campus verified">verified</span>` : ''}</h3>
              <p class="font-body text-sm text-outline">${window.escapeHtml(p.school || 'University')}${p.academic_year ? ' · ' + window.escapeHtml(p.academic_year) : ''}</p>
            </div>
            ${interests.length ? `<div class="mb-5"><p class="text-[10px] tracking-[0.2em] text-outline mb-2">Shared Interests</p><div class="flex flex-wrap gap-2">${interests.slice(0, 6).map(t => `<span class="bg-primary text-on-primary px-3 py-1 rounded-[10px] text-[10px] font-bold tracking-widest">${window.escapeHtml(t)}</span>`).join('')}</div></div>` : ''}
            ${renderRemainingBlock(m.remainingMs, 'Open the chat and both confirm within this time')}
            <button class="btn-cta bg-neon text-black shadow-lg mt-2" onclick="openConnectionChat('${matchId || ''}')">Enter Chat</button>
            <p class="text-center mt-3 text-[10px] text-outline-variant leading-relaxed">Both of you must tap "Confirm Partner" in chat within 48 hours${waiting ? ' · You have confirmed, waiting for their response' : ''}</p>
          </div>
        </div>
      </div>`;
    startRemainingTick(m.remainingMs);
    reportMatchEvent(matchId, 'viewed'); // P1-6：看到本周匹配卡
    return;
  }

  // no_match：本周无缘分。须用户主动点重新匹配（B 规则——不自动续）。
  if (state === 'no_match') {
    container.innerHTML = `
      <div class="w-full text-center px-8 py-16">
        ${window.flatEmptyIcon('hourglass_empty')}
        <h2 class="font-headline text-lg font-extrabold tracking-tight text-on-surface mb-2">No Match This Week</h2>
        <p class="font-body text-on-surface-variant text-sm mb-10 max-w-xs mx-auto leading-relaxed">${window.escapeHtml(data.message || 'No suitable match this week. See you next Friday.')}</p>
        <div class="w-full max-w-xs mx-auto flex flex-col gap-6 items-center">
          <button class="btn-cta bg-neon text-black" onclick="startMatch()">Match Again</button>
          <button class="text-[10px] tracking-[0.15rem] text-outline hover:text-primary transition-colors font-medium underline underline-offset-8" onclick="openFilterSheet()">Modify Preferences</button>
        </div>
      </div>`;
    return;
  }

  // searching：等待下一轮出结果。
  if (state === 'searching') {
    renderSearchingSkeleton(container, 'romantic');
    return;
  }

  // idle / 其它：进池入口。
  container.innerHTML = window.renderIdleMatch();
  window.startCampusAnim('idle');
}

// ─── 朋友分支（最多 5 张候选卡，C 规则 §6.5） ──────────────────
function renderFriendMatchTab(container, data) {
  const state = data.state || 'idle';
  const matches = Array.isArray(data.matches) ? data.matches : [];

  if (state === 'searching') {
    renderSearchingSkeleton(container, 'friend');
    return;
  }

  if (state === 'no_match' && !matches.length) {
    container.innerHTML = `
      <div class="w-full text-center px-8 py-16">
        ${window.flatEmptyIcon('group_off')}
        <h2 class="font-headline text-lg font-extrabold tracking-tight text-on-surface mb-2">No Friends This Round</h2>
        <p class="font-body text-on-surface-variant text-sm mb-10 max-w-xs mx-auto leading-relaxed">${window.escapeHtml(data.message || 'No suitable friend candidates this round. Adjust your preferences or try matching again.')}</p>
        <div class="w-full max-w-xs mx-auto flex flex-col gap-6 items-center">
          <button class="btn-cta bg-neon text-black" onclick="startMatch()">Match Again</button>
          <button class="text-[10px] tracking-[0.15rem] text-outline hover:text-primary transition-colors font-medium underline underline-offset-8" onclick="openFilterSheet('friend')">Modify Preferences</button>
        </div>
      </div>`;
    return;
  }

  if (state === 'matched' && matches.length) {
    // 候选卡网格（最多 5 张）；每卡头像 + 昵称 + 学校 + 剩余Xh/已是朋友 + 进入对话
    const cards = matches.slice(0, 5).map(renderFriendCandidateCard).join('');
    container.innerHTML = `
      <div class="w-full max-w-xl mx-auto py-4">
        <div class="px-2 mb-4">
          <p class="font-headline text-[10px] font-bold text-outline-variant tracking-[0.3em]">Friend Candidates · ${matches.length}</p>
        </div>
        <div class="grid grid-cols-1 gap-3">
          ${cards}
        </div>
      </div>`;
    // 临时候选带 48h 倒计时：用统一 ticker 刷新所有 .friend-remaining 节点
    startFriendRemainingTick(matches);
    matches.slice(0, 5).forEach((c) => reportMatchEvent(c.matchId, 'viewed')); // P1-6
    return;
  }

  // idle / 其它：进池入口（荧光绿点缀）。
  container.innerHTML = window.renderIdleMatch();
  window.startCampusAnim('idle');
}

// 单张朋友候选卡。临时候选显示剩余倒计时；已确认朋友显示 Friends 标记。
function renderFriendCandidateCard(c) {
  const p = c.partner || {};
  const matchId = c.matchId;
  const avatar = p.avatarUrl || p.avatar || '';
  const cover = p.coverUrl || avatar; // #1 卡片背景用对方封面图，没有则用头像模糊兜底
  const confirmed = c.status === 'FRIEND_CONFIRMED';
  const remaining = !confirmed && c.remainingMs != null;
  const interests = p.interests || p.tags || []; // #8 朋友候选卡也显示兴趣
  return `<div class="relative border border-outline-variant/15 rounded-[10px] p-4 flex flex-col overflow-hidden">
    ${cover ? `<img src="${window.safeUrl(cover)}" alt="" class="absolute inset-0 w-full h-full object-cover ${p.coverUrl ? '' : 'blur-2xl scale-125'}"><div class="absolute inset-0" style="background:linear-gradient(to bottom,rgba(249,249,249,0.4),rgba(249,249,249,0.7) 55%,rgba(249,249,249,0.94) 85%)"></div>` : '<div class="absolute inset-0 bg-surface-container-lowest"></div>'}
    <div class="relative flex flex-col">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-14 h-14 rounded-full border-2 border-neon p-0.5 overflow-hidden bg-white shrink-0">
        ${avatar ? `<img src="${window.safeUrl(avatar)}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full rounded-full bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined text-xl text-outline">person</span></div>`}
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-headline font-bold text-sm tracking-tight text-on-surface truncate">${window.escapeHtml(p.nickname || 'Friend')}</h3>
        <p class="font-body text-xs text-outline truncate">${window.escapeHtml(p.school || 'University')}</p>
      </div>
    </div>
    ${p.bio ? `<p class="font-body text-[11px] text-on-surface-variant mb-3" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${window.escapeHtml(p.bio)}</p>` : ''}
    ${interests.length ? `<div class="flex flex-wrap gap-1.5 mb-3">${interests.slice(0, 5).map((t) => `<span class="px-2.5 py-0.5 rounded-[10px] border border-on-surface/20 bg-surface-container-lowest/60 text-on-surface text-[9px] font-bold tracking-widest">${window.escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <div class="flex items-center justify-between mb-3 min-h-[18px]">
      ${confirmed
        ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest text-neon"><span class="material-symbols-outlined text-sm">group</span>Friends</span>`
        : (remaining
          ? `<span class="friend-remaining inline-flex items-center gap-1 text-[10px] font-bold tracking-widest text-neon-pink" data-deadline="${Date.now() + c.remainingMs}"><span class="material-symbols-outlined" style="font-size:13px">timer</span><span class="font-mono">${window.formatCountdown(c.remainingMs)}</span></span>`
          : `<span class="text-[10px] font-bold tracking-widest text-outline">Pending</span>`)}
    </div>
    <button class="w-full py-3 rounded-[10px] bg-neon text-black font-headline font-bold text-[11px] tracking-[0.15em] active:scale-[0.98] transition-all" onclick="openConnectionChat('${matchId}')">Enter Chat</button>
    <button class="w-full py-2 mt-1 text-[9px] text-neon-pink font-medium underline underline-offset-4 tracking-widest active:scale-95" onclick="dissolveMatch('${matchId}')">Cancel connection</button>
    ${confirmed ? '' : `<p class="text-center mt-1 text-[9px] text-outline-variant leading-snug">Both must tap "Confirm Friend" in chat within 48 hours</p>`}
    </div>
  </div>`;
}
window.renderFriendCandidateCard = renderFriendCandidateCard;

// searching 骨架（idle 同高度，避免跳动）。点缀统一荧光绿；mode 仅用于校园场景人物渲染。
function renderSearchingSkeleton(container, mode) {
  container.innerHTML = `
    <div class="w-full text-center px-8 flex flex-col items-center">
      ${renderMatchWaitAnim(true)}
      <div class="mt-6 flex flex-col items-center">
        <h2 class="font-headline text-[22px] font-extrabold tracking-tight text-on-surface mb-1.5">Matching in progress</h2>
        <p class="text-[11px] tracking-[0.12em] text-outline uppercase mb-1.5">Next cycle in</p>
        <div class="font-mono text-3xl font-light tracking-widest text-primary leading-none" id="match-countdown">00:00:00</div>
      </div>
      <div class="mt-8 w-full max-w-xs mx-auto flex flex-col items-center gap-5">
        <button class="px-8 py-2.5 bg-transparent text-neon-pink border border-neon-pink rounded-full font-headline font-bold text-xs tracking-[0.1em] hover:bg-neon-pink hover:text-black transition-all active:scale-[0.98]" onclick="stopMatch()">Leave Pool</button>
        <button class="text-[11px] font-bold tracking-wide text-outline hover:text-primary transition-colors underline underline-offset-8" onclick="openFilterSheet()">Modify Preferences</button>
      </div>
    </div>`;
  window.startCountdownTick();
  window.startCampusAnim('waiting');
}

// 临时对话 48h 剩余倒计时块（恋人卡内）。
function renderRemainingBlock(remainingMs, hint) {
  if (remainingMs == null) return '';
  return `<div class="text-center mb-3 py-3 border-t border-b border-outline-variant/20"><p class="text-[10px] tracking-[0.15em] text-outline mb-1">${window.escapeHtml(hint)}</p><div class="font-mono text-2xl font-light tracking-widest text-primary" id="match-remaining-countdown">--:--:--</div></div>`;
}

// 恋人临时对话剩余倒计时 ticker：基于 remainingMs 推算 deadline 后每秒递减；到 0 自动刷新状态。
function startRemainingTick(remainingMs) {
  if (remainingMs == null) return;
  const deadline = Date.now() + remainingMs;
  const el = document.getElementById('match-remaining-countdown');
  if (!el) return;
  const tick = () => {
    const node = document.getElementById('match-remaining-countdown');
    if (!node) return;
    const diff = deadline - Date.now();
    if (diff <= 0) {
      node.textContent = '00:00:00';
      window.stopCountdownTick();
      window.loadMatchTab();
      return;
    }
    node.textContent = window.formatCountdown(diff);
  };
  tick();
  S.countdownInterval = setInterval(tick, 1000);
}

// 朋友候选卡剩余倒计时 ticker：刷新所有 .friend-remaining 节点（按各自 data-deadline）。
function startFriendRemainingTick(matches) {
  const hasTemp = matches.some(m => m.status !== 'FRIEND_CONFIRMED' && m.remainingMs != null);
  if (!hasTemp) return;
  const tick = () => {
    const nodes = document.querySelectorAll('.friend-remaining');
    if (!nodes.length) { window.stopCountdownTick(); return; }
    let anyExpired = false;
    nodes.forEach(n => {
      const deadline = parseInt(n.dataset.deadline, 10);
      const diff = deadline - Date.now();
      const valEl = n.querySelector('.font-mono') || n;
      if (diff <= 0) { valEl.textContent = '00:00:00'; n.classList.add('text-neon-pink'); anyExpired = true; }
      else valEl.textContent = window.formatCountdown(diff);
    });
    if (anyExpired) { window.stopCountdownTick(); window.loadMatchTab(); }
  };
  tick();
  S.countdownInterval = setInterval(tick, 1000);
}

// 短倒计时文案（朋友卡用）：>1h 显示 "Xh"，否则 "Xm"。
function formatRemainingShort(diff) {
  if (diff <= 0) return '0m';
  const h = Math.floor(diff / 3600000);
  if (h >= 1) return h + 'h';
  const m = Math.floor(diff / 60000);
  return Math.max(1, m) + 'm';
}
window.formatRemainingShort = formatRemainingShort;

// ========================================
// CHAT 入口（从匹配界面跳到 Chat 对应会话，§6.2/6.5）
// 对话统一在 Chat 视图（§6.6 chat.js）。这里切到 Chat 视图并尝试打开该 matchId 的会话。
// ========================================
async function openConnectionChat(matchId) {
  // 切到 Chat 一级视图（同步切 DOM 显隐 + 高亮 + 触发会话列表加载）
  window.switchHomeView('chat');
  // switchHomeView 已触发 loadSessions()（异步）；这里再 await 一次以拿到最新列表，
  // 然后按 matchId 打开对应会话。chat.js 提供 openSessionById（按 S.sessions 查表）。
  if (!matchId) return;
  if (window.loadSessions) {
    try { await window.loadSessions(); } catch (e) {}
  }
  window.openSessionById?.(matchId);
}
window.openConnectionChat = openConnectionChat;

// ========================================
// START / STOP / DISSOLVE
// ========================================
// 进池：透传增强意向（J 规则 §10.5）。body{mode,enhanced,cells}；恋人忽略 cells（后端固定 3）。
// 开增强前校验能量：availableEnergy<cost 则引导充值（openEnergyModal）。
async function startMatch() {
  const mode = S.activeMatchMode || 'romantic';
  ensureEnhancedShape();
  const enh = S.enhanced[mode] || {};
  // enhanced 必为 boolean（是否开启增强）。
  const enhanced = !!enh.enabled;
  // cells：朋友模式必为 1–5 的正整数（保证匹配朋友数 N，cost===cells），绝不传 0/undefined；
  // 恋人模式不传 cells（后端固定 3 格）。
  const cells = mode === 'friend'
    ? Math.min(5, Math.max(1, parseInt(S.enhanced.friend.cells, 10) || 1))
    : undefined;
  // 开增强前能量校验（恋人固定 3 格，朋友按 cells）。
  if (enhanced) {
    const cost = mode === 'romantic' ? 3 : cells;
    const avail = S.energy?.availableEnergy ?? 0;
    if (avail < cost) {
      window.toast('Not enough energy — top up');
      window.openEnergyModal?.();
      return;
    }
  }
  // 乐观渲染：立即进入搜索中动画
  ensureMatchStatusBucket()[mode] = { mode, state: 'searching' };
  window.renderMatchTab(S.matchStatus[mode]);
  try {
    const body = { mode, enhanced };
    if (mode === 'friend') body.cells = cells;
    await window.api('/matching/start', 'POST', body);
    window.toast('Entered matching pool');
    // 预扣已发生，刷新能量余额（profile.js 提供；未实现时静默跳过）
    window.loadEnergyBar?.();
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
  // 与服务器真实状态同步
  window.loadMatchTab();
}
window.startMatch = startMatch;

async function stopMatch() {
  const mode = S.activeMatchMode || 'romantic';
  try {
    await window.api('/matching/stop?mode=' + mode, 'POST');
    window.toast('Left matching pool');
    window.loadMatchTab();
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
}
window.stopMatch = stopMatch;

// 解除关系（恋人/朋友通用，§6.7）。带 matchId 调新端点；二次确认后调用。
async function dissolveMatch(matchId) {
  const mode = S.activeMatchMode || 'romantic';
  const friend = mode === 'friend';
  const what = friend ? 'this friendship' : 'this relationship';
  // Mode-aware success copy: friend mode must not say "Relationship ended" (dual-mode §6.7).
  const okMsg = friend ? 'Friendship ended' : 'Relationship ended';
  const ok = await window.confirmCard({
    title: friend ? 'End this friendship?' : 'End this relationship?',
    body: friend ? 'You will no longer be matched as friends.' : 'This will end your relationship. Neither of you can message anymore.',
    confirmLabel: 'End',
    danger: true,
  });
  if (!ok) return;
  if (!matchId) {
    // 兜底：无 matchId 时退回旧无参端点（兼容历史恋人关系）
    try {
      await window.api('/matching/dissolve', 'POST', {});
      window.toast(okMsg);
      window.loadMatchTab();
    } catch (e) {
      window.toast('Failed: ' + e.message);
    }
    return;
  }
  try {
    await window.api('/matching/' + matchId + '/dissolve', 'POST', {});
    window.toast(okMsg);
    window.loadMatchTab();
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
}
window.dissolveMatch = dissolveMatch;

// ========================================
// 兼容旧提议确认/拒绝（历史 PENDING_CONFIRM 数据，§6.7；新前端主路径不再使用）
// ========================================
function setProposalButtonsDisabled(disabled) {
  ['proposal-reject-btn', 'proposal-confirm-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}
window.setProposalButtonsDisabled = setProposalButtonsDisabled;

// ========================================
// MATCH CYCLE COUNTDOWN
// ========================================
function getNextCronRun(cronExpr) {
  if (!cronExpr) return null;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;
  const minute = parseInt(m, 10),
    hour = parseInt(h, 10);
  if (isNaN(minute) || isNaN(hour) || dom !== '*' || mon !== '*') return null;
  let targetDow = null;
  if (dow !== '*') {
    targetDow = parseInt(dow, 10);
    if (isNaN(targetDow)) return null;
    targetDow = targetDow % 7;
  }
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (targetDow === null) {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    let d = (targetDow - next.getDay() + 7) % 7;
    if (d === 0 && next <= now) d = 7;
    next.setDate(next.getDate() + d);
  }
  return next;
}
window.getNextCronRun = getNextCronRun;

function formatCountdown(diff) {
  if (diff <= 0) return '00:00:00';
  const d = Math.floor(diff / 86400000),
    h = Math.floor(diff % 86400000 / 3600000),
    m = Math.floor(diff % 3600000 / 60000),
    s = Math.floor(diff % 60000 / 1000);
  const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}
window.formatCountdown = formatCountdown;

// 优先用后端下发的 nextRunAt；缺失时 fallback 到本地 cron 解析，再退到周五 17:00。
// 按当前匹配模式从分桶读取状态。
function getMatchCycleCountdown() {
  const mode = S.activeMatchMode || 'romantic';
  const st = S.matchStatus?.[mode];
  let next = st?.nextRunAt ? new Date(st.nextRunAt) : null;
  if (!next || isNaN(next.getTime())) next = window.getNextCronRun(st?.matchConfig?.cronExpr);
  if (!next) return window.getNextFriday5pmCountdown();
  return window.formatCountdown(next - Date.now());
}
window.getMatchCycleCountdown = getMatchCycleCountdown;

function getNextFriday5pmCountdown() {
  const now = new Date();
  const day = now.getDay();
  let d = (5 - day + 7) % 7;
  if (d === 0 && now.getHours() >= 17) d = 7;
  const next = new Date(now);
  next.setDate(now.getDate() + d);
  next.setHours(17, 0, 0, 0);
  return window.formatCountdown(next - now);
}
window.getNextFriday5pmCountdown = getNextFriday5pmCountdown;

function startCountdownTick() {
  window.stopCountdownTick();
  const el = document.getElementById('match-countdown');
  const tick = () => {
    if (el) el.textContent = window.getMatchCycleCountdown();
  };
  tick();
  S.countdownInterval = setInterval(tick, 1000);
}
window.startCountdownTick = startCountdownTick;

function stopCountdownTick() {
  if (S.countdownInterval) {
    clearInterval(S.countdownInterval);
    S.countdownInterval = null;
  }
  // 顺带清理校园简笔画人物的随机动作 interval（搭车清理避免泄漏）。
}
window.stopCountdownTick = stopCountdownTick;

// ========================================
// MATCH STATUS POLLING（带 mode）
// ========================================
function stopMatchPolling() {
  if (S.matchPollingId) {
    clearInterval(S.matchPollingId);
    S.matchPollingId = null;
  }
  S.matchPollFailCount = 0;
}
window.stopMatchPolling = stopMatchPolling;

const MATCH_POLL_MAX_FAILS = 5;

function startMatchPolling() {
  stopMatchPolling();
  S.matchPollFailCount = 0;
  // 记录轮询绑定的模式：用户切走模式后旧 tick 成为 no-op，避免串桶。
  const mode = S.activeMatchMode || 'romantic';
  S.matchPollingId = setInterval(async () => {
    if (S.activeMatchMode !== mode || S.homeView !== mode) return;
    try {
      const d = await window.api('/matching/status?mode=' + mode);
      const status = d.data || d;
      ensureMatchStatusBucket()[mode] = status;
      S.matchPollFailCount = 0;
      window.renderMatchTab(status);
      // 恋人 relationship 终态停轮询；朋友常驻轮询（可继续追加候选）。
      if (mode === 'romantic' && status.state === 'relationship') stopMatchPolling();
    } catch (e) {
      S.matchPollFailCount = (S.matchPollFailCount || 0) + 1;
      console.error(`[match] 状态轮询失败（第 ${S.matchPollFailCount} 次）`, e);
      if (S.matchPollFailCount >= MATCH_POLL_MAX_FAILS) {
        window.stopMatchPolling();
        window.toast('Match updates paused — check your connection and retry');
      }
    }
  }, 30000);
}
window.startMatchPolling = startMatchPolling;

// ========================================
// 行为埋点（P1-6）：viewed=看到匹配卡；openedProfile=打开对方资料。
// 服务端按 (matchId, actorId, type) 去重，这里再做会话内去重省请求。
// ========================================
const reportedMatchEvents = new Set();
function reportMatchEvent(matchId, type) {
  if (!matchId) return;
  const key = matchId + ':' + type;
  if (reportedMatchEvents.has(key)) return;
  reportedMatchEvents.add(key);
  window.api('/matching/feedback/events', 'POST', { events: [{ matchId, type }] })
    .catch(() => reportedMatchEvents.delete(key)); // 失败允许下次重试
}
window.reportMatchEvent = reportMatchEvent;

// ========================================
// PARTNER PROFILE
// ========================================
async function viewPartnerProfile(userId, matchId) {
  S.viewingProfileId = userId; // #3b：备注按钮用它
  if (matchId) reportMatchEvent(matchId, 'openedProfile');
  window.openOverlay('partner-profile-overlay');
  try {
    const data = await window.api(`/users/${userId}/public-profile`);
    const p = data.data || data;
    window.renderPartnerProfile(p);
  } catch (e) {
    window.toast('Failed to load profile');
  }
}
window.viewPartnerProfile = viewPartnerProfile;

// 全屏对方资料（本轮反馈2）：封面 hero + 头像 + 昵称(可加备注) + 学校 + 年级·年龄·城市
// + 性格/兴趣标签 + 专业/MBTI/星座/国籍档案网格 + bio + 真实照片墙 Portfolio。
// 唯一渲染器（profile.js 旧的 renderPartnerProfileFull 覆盖已移除，避免双实现冲突）。
function renderPartnerProfile(p) {
  const c = document.getElementById('partner-profile-content');
  if (!c || !p) return;
  const esc = window.escapeHtml;
  const avatar = p.avatarUrl || p.avatar || '';
  const cover = p.coverUrl || avatar || '';
  const interests = p.interests || [];
  const tags = p.tags || [];
  const photos = p.realPhotos || [];
  const verified = p.verificationStatus === 'verified';
  // 备注：聊天列表已带 partner.note，按当前查看的 userId 取（没有会话则为空，标题回退昵称）
  const sess = (S.sessions || []).find((s) => {
    const pp = s.partner || {};
    return String(pp.userId || pp.id) === String(S.viewingProfileId);
  });
  const note = (sess && sess.partner && sess.partner.note) || '';
  const title = p.nickname || 'User'; // 昵称恒为主名；备注作为名字后的小标签（本轮反馈5）
  // 基础信息行：年级·年龄·城市（空字段自动省略）
  const infoLine = [p.grade, p.age, p.city]
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map((v) => esc(String(v)))
    .join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  // 档案网格：专业 / MBTI / 星座 / 国籍（有几项显示几项）
  const facts = [
    ['Major', p.major], ['MBTI', p.mbti], ['Zodiac', p.zodiac], ['Nationality', p.nationality],
  ].filter((f) => f[1]);
  const factGrid = facts.length ? `
    <div class="px-6 mt-8 grid grid-cols-2 gap-3">
      ${facts.map(([label, val]) => `
        <div class="rounded-[10px] border border-outline-variant/20 bg-surface-container-lowest p-3">
          <p class="text-[9px] font-bold tracking-[0.2em] text-outline uppercase mb-1">${label}</p>
          <p class="text-sm font-bold tracking-tight text-on-surface truncate">${esc(String(val))}</p>
        </div>`).join('')}
    </div>` : '';
  const chip = (t, filled) => `<span class="px-3.5 py-1.5 rounded-[10px] ${filled ? 'bg-neon text-black' : 'border border-primary text-primary'} text-[10px] font-bold tracking-widest">${esc(t)}</span>`;
  // #2 去掉 "Personality Tags"/"Interests" 标题，只保留标签本身
  const chipSection = (heading, list, filled) => list.length ? `
    <div class="px-6 mt-5">
      <div class="flex flex-wrap gap-2">${list.map((t) => chip(t, filled)).join('')}</div>
    </div>` : '';
  // 真实照片墙 Portfolio：首图大图 + 两张侧栏 + 其余 3 列网格
  // onclick 用 this.src（浏览器解析后的 URL 属性，非可注入字符串），不把用户 URL 拼进 JS 串
  const cell = (u) => `<img src="${window.safeUrl(u)}" alt="" class="w-full h-full object-cover cursor-pointer" onclick="window.open(this.src,'_blank')">`;
  let portfolio = '';
  if (photos.length) {
    const [first, ...others] = photos;
    const side = others.slice(0, 2);
    const rest = others.slice(2);
    portfolio = `
    <div class="px-6 mt-10">
      <div class="flex justify-between items-end mb-4">
        <h2 class="font-headline font-bold text-xs tracking-[0.2em] text-on-surface">Photo Portfolio</h2>
        <span class="text-[10px] font-bold text-outline tracking-widest">${photos.length} Photo${photos.length > 1 ? 's' : ''}</span>
      </div>
      <div class="grid grid-cols-12 gap-2 ${side.length ? 'h-[260px]' : 'h-[220px]'}">
        <div class="${side.length ? 'col-span-8' : 'col-span-12'} h-full bg-surface-container overflow-hidden rounded-[10px]">${cell(first)}</div>
        ${side.length ? `<div class="col-span-4 flex flex-col gap-2">${side.map((u) => `<div class="flex-1 min-h-0 bg-surface-container overflow-hidden rounded-[10px]">${cell(u)}</div>`).join('')}</div>` : ''}
      </div>
      ${rest.length ? `<div class="grid grid-cols-3 gap-2 mt-2">${rest.map((u) => `<div class="aspect-square bg-surface-container overflow-hidden rounded-[10px]">${cell(u)}</div>`).join('')}</div>` : ''}
    </div>`;
  }
  c.innerHTML = `
    <div class="relative">
      <div class="relative h-60 bg-surface-container-low overflow-hidden">
        ${cover ? `<img src="${window.safeUrl(cover)}" alt="" class="absolute inset-0 w-full h-full object-cover ${p.coverUrl ? '' : 'blur-2xl scale-125'}">` : ''}
        <div class="absolute inset-0" style="background:linear-gradient(to bottom,rgba(0,0,0,0.28),rgba(0,0,0,0) 38%,rgba(249,249,249,0) 68%,#f9f9f9)"></div>
        <button onclick="hideOverlay('partner-profile-overlay')" class="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-black/35 backdrop-blur text-white flex items-center justify-center active:scale-95 transition-transform" title="Back">
          <span class="material-symbols-outlined" style="font-size:20px;">arrow_back</span>
        </button>
      </div>
      <div class="px-6 -mt-12 relative">
        <div class="w-24 h-24 rounded-full p-[3px] bg-primary shadow-lg">
          <div class="w-full h-full rounded-full overflow-hidden ring-2 ring-white bg-surface-container-high flex items-center justify-center">
            ${avatar ? `<img src="${window.safeUrl(avatar)}" alt="" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-3xl text-outline">person</span>'}
          </div>
        </div>
        <div class="mt-3 flex items-center gap-2 flex-wrap">
          <h1 class="font-headline font-extrabold text-2xl tracking-tight text-on-surface">${esc(title)}</h1>
          ${verified
            ? `<span class="material-symbols-outlined text-primary" style="font-size:20px;" title="Campus verified">verified</span>`
            : `<span class="px-1.5 py-0.5 rounded-[10px] bg-surface-container text-[9px] font-bold tracking-widest text-outline" title="Not campus verified">UNVERIFIED</span>`}
          ${note ? `<span class="px-2 py-0.5 rounded-[10px] bg-surface-container text-[10px] font-bold tracking-widest text-on-surface-variant">${esc(note)}</span>` : ''}
          <button onclick="promptSetNote()" class="ml-0.5 w-7 h-7 rounded-full border border-outline-variant/40 text-on-surface-variant flex items-center justify-center active:scale-95 transition-transform" title="${note ? 'Edit note' : 'Add note'}">
            <span class="material-symbols-outlined" style="font-size:16px;">${note ? 'edit' : 'add'}</span>
          </button>
        </div>
        ${p.realName ? `<p class="text-xs text-on-surface-variant mt-0.5">${esc(p.realName)}</p>` : ''}
        ${p.school ? `<p class="text-sm font-medium text-on-surface-variant mt-1.5 flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:16px;">school</span>${esc(p.school)}</p>` : ''}
        ${infoLine ? `<p class="text-xs text-outline tracking-wider mt-1.5">${infoLine}</p>` : ''}
        ${p.daysKnown != null ? `<p class="text-xs text-outline tracking-wider mt-1.5 flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:14px;">calendar_month</span>Known for ${p.daysKnown} day${p.daysKnown === 1 ? '' : 's'}</p>` : ''}
      </div>
    </div>
    ${factGrid}
    ${chipSection('Interests', interests, true)}
    ${p.bio ? `
    <div class="px-6 mt-8">
      <h2 class="font-headline font-bold text-xs tracking-[0.2em] text-on-surface mb-3">About</h2>
      <p class="font-body text-sm leading-relaxed text-on-surface-variant">${esc(p.bio)}</p>
    </div>` : ''}
    ${portfolio}
    <div class="h-6"></div>`;
}
window.renderPartnerProfile = renderPartnerProfile;

// #3b：设置/清除对当前所看用户的备注
async function promptSetNote() {
  const id = S.viewingProfileId;
  if (!id) { window.toast('No user selected'); return; }
  const sess = (S.sessions || []).find((s) => String((s.partner || {}).userId || (s.partner || {}).id) === String(id));
  const current = (sess && sess.partner && sess.partner.note) || '';
  const note = await window.promptCard({ title: 'Set a note', label: 'Note', placeholder: 'Leave blank to clear', value: current });
  if (note === null) return;
  try {
    await window.api('/users/me/notes', 'PUT', { targetUserId: id, note });
    window.toast(note.trim() ? 'Note saved' : 'Note cleared');
    if (window.loadSessions) window.loadSessions();
  } catch (e) {
    window.toast('Failed: ' + (e?.message || 'try again'));
  }
}
window.promptSetNote = promptSetNote;

// ========================================
// FILTER / PREFERENCES（按 mode 分离，§6.4）
// ========================================
const STAGE_WHITELIST = ['undergraduate', 'master', 'doctor'];
const FRIEND_GENDER_WHITELIST = ['male', 'female', 'all'];

// 偏好面板当前编辑模式（默认跟随 S.activeMatchMode）。
function currentMode() {
  return S.prefMode === 'friend' || S.prefMode === 'romantic' ? S.prefMode : (S.activeMatchMode || 'romantic');
}
window.currentMode = currentMode;

// 打开偏好面板：按当前匹配模式拉取偏好并回填对应区（增强字段已移至 Match Settings，此处不含）。
async function openFilterSheet(mode) {
  window.openOverlay('filter-overlay');
  const m = (mode === 'friend' || mode === 'romantic') ? mode : (S.activeMatchMode || 'romantic');
  S.prefMode = m;
  // switchPrefMode already fetches + backfills this mode's prefs (loadPrefsForMode).
  // Do not call loadPrefsForMode again here — the previous double-call fired two
  // identical GET /matching/preferences requests and rendered the form twice.
  switchPrefMode(m);
}
window.openFilterSheet = openFilterSheet;

// 切换偏好面板模式选项卡：显隐 romantic/friend 区 + 高亮选项卡，并拉取该模式偏好回填。
function switchPrefMode(mode) {
  const m = (mode === 'friend') ? 'friend' : 'romantic';
  S.prefMode = m;
  const romSec = document.getElementById('filter-romantic-section');
  const friSec = document.getElementById('filter-friend-section');
  if (romSec) romSec.style.display = m === 'romantic' ? '' : 'none';
  if (friSec) friSec.style.display = m === 'friend' ? '' : 'none';
  document.querySelectorAll('.pref-mode-tab').forEach(el => {
    const active = el.dataset.mode === m;
    el.style.background = active ? '#CCFF00' : 'transparent';
    el.style.color = active ? '#000' : '#1b1b1b';
  });
  loadPrefsForMode(m);
}
window.switchPrefMode = switchPrefMode;

// 拉取并回填某模式偏好（不含增强——增强已移至 Match Settings 面板）。
async function loadPrefsForMode(mode) {
  let prefs = {};
  try {
    const data = await window.api('/matching/preferences?mode=' + mode);
    prefs = data?.data || data || {};
  } catch (e) {}
  if (mode === 'romantic') {
    fillRomanticPrefs(prefs);
  } else {
    fillFriendPrefs(prefs);
  }
}

// 恋人区回填（性别/年龄/阶段/同校/同城）。
function fillRomanticPrefs(prefs) {
  S.filterGender = prefs.preferredGender || 'all';
  S.filterStages = String(prefs.universityStage || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => STAGE_WHITELIST.includes(s));
  const ageAny = document.getElementById('filter-age-any');
  if (ageAny) ageAny.checked = prefs.ageMin == null && prefs.ageMax == null;
  const ageMin = document.getElementById('filter-age-min');
  if (ageMin) ageMin.value = prefs.ageMin != null ? prefs.ageMin : 18;
  const ageMax = document.getElementById('filter-age-max');
  if (ageMax) ageMax.value = prefs.ageMax != null ? prefs.ageMax : 24;
  const ss = document.getElementById('filter-same-school');
  if (ss) ss.checked = !!prefs.requireSameUniversity;
  const sc = document.getElementById('filter-same-city');
  if (sc) sc.checked = !!prefs.requireSameCity;
  window.toggleAgeAny();
  window.updateGenderUI();
  window.updateStageUI();
}

// 朋友区回填：
//  - 朋友独有：兴趣优先级（最多 3，来自 profile）/ 活动多选 / 自由文本要求
//  - 补全的恋爱字段（除大学阶段）：性别 / 年龄 / 同校 / 同城——回填到与恋人区共享的输入控件，
//    这些控件始终在 DOM 中（friend 区激活时恋人区仅 display:none），便于 saveFilterPrefs('friend') 取值提交。
function fillFriendPrefs(prefs) {
  // 性别（朋友 segment，all/male/female）
  S.friendGender = FRIEND_GENDER_WHITELIST.includes(prefs.preferredGender) ? prefs.preferredGender : 'all';
  // 兴趣优先级（最多 3）：存入 preferredInterests，限 3
  S.friendPrefInterests = (Array.isArray(prefs.preferredInterests) ? prefs.preferredInterests.slice() : []).slice(0, 3);
  // 补全恋爱字段（除大学阶段）：年龄 / 同校 / 同城——回填共享输入控件
  const ageAny = document.getElementById('filter-age-any');
  if (ageAny) ageAny.checked = prefs.ageMin == null && prefs.ageMax == null;
  const ageMin = document.getElementById('filter-age-min');
  if (ageMin) ageMin.value = prefs.ageMin != null ? prefs.ageMin : 18;
  const ageMax = document.getElementById('filter-age-max');
  if (ageMax) ageMax.value = prefs.ageMax != null ? prefs.ageMax : 24;
  const ss = document.getElementById('filter-same-school');
  if (ss) ss.checked = !!prefs.requireSameUniversity;
  const sc = document.getElementById('filter-same-city');
  if (sc) sc.checked = !!prefs.requireSameCity;
  window.toggleAgeAny?.();
  updateFriendGenderUI();
  renderFriendPriorityInterests();
  updateFriendPrefUI();
}

function closeFilterSheet() {
  window.closeOverlay('filter-overlay');
}
window.closeFilterSheet = closeFilterSheet;

// 保存偏好：按当前偏好面板模式取字段 PUT（不含增强——增强由 saveMatchSettings 负责）。
async function saveFilterPrefs(mode) {
  const m = (mode === 'friend' || mode === 'romantic') ? mode : currentMode();
  // 年龄/同校/同城为恋人/朋友共享输入控件（始终在 DOM）。增强字段不在此提交（已移至 Match Settings）。
  const ageAny = document.getElementById('filter-age-any')?.checked || false;
  const rawMin = parseInt(document.getElementById('filter-age-min')?.value, 10) || 18;
  const rawMax = parseInt(document.getElementById('filter-age-max')?.value, 10) || 24;
  const ageMin = ageAny ? null : Math.min(rawMin, rawMax);
  const ageMax = ageAny ? null : Math.max(rawMin, rawMax);
  const requireSameCity = document.getElementById('filter-same-city')?.checked || false;
  const requireSameUniversity = document.getElementById('filter-same-school')?.checked || false;
  let prefs;
  if (m === 'friend') {
    prefs = {
      mode: 'friend',
      // 朋友独有
      preferredInterests: (Array.isArray(S.friendPrefInterests) ? S.friendPrefInterests : []).slice(0, 3),
      // 补全的恋爱字段（除大学阶段）
      preferredGender: S.friendGender === 'all' || !S.friendGender ? null : S.friendGender,
      ageMin,
      ageMax,
      requireSameUniversity,
      requireSameCity,
    };
  } else {
    prefs = {
      mode: 'romantic',
      requireSameCity,
      requireSameUniversity,
      preferredGender: S.filterGender === 'all' ? null : S.filterGender,
      ageMin,
      ageMax,
      universityStage: (S.filterStages && S.filterStages.length) ? S.filterStages.join(',') : null,
    };
  }
  try {
    await window.api('/matching/preferences', 'PUT', prefs);
    window.toast('Preferences saved');
    window.closeFilterSheet();
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
}
window.saveFilterPrefs = saveFilterPrefs;

// ─── 年龄 Any 开关（恋人区） ──────────────────────────────────
function toggleAgeAny() {
  const any = !!document.getElementById('filter-age-any')?.checked;
  const minEl = document.getElementById('filter-age-min');
  if (minEl) minEl.disabled = any;
  const maxEl = document.getElementById('filter-age-max');
  if (maxEl) maxEl.disabled = any;
  if (any) {
    const el = document.getElementById('age-range-display');
    if (el) el.textContent = 'Any';
  } else {
    window.updateAgeDisplay();
  }
}
window.toggleAgeAny = toggleAgeAny;

// ─── 大学阶段多选（恋人区） ──────────────────────────────────
function toggleStage(val) {
  if (!STAGE_WHITELIST.includes(val)) return;
  if (!Array.isArray(S.filterStages)) S.filterStages = [];
  const i = S.filterStages.indexOf(val);
  if (i >= 0) S.filterStages.splice(i, 1);
  else S.filterStages.push(val);
  window.updateStageUI();
}
window.toggleStage = toggleStage;

function selectStage(val) {
  window.toggleStage(val);
}
window.selectStage = selectStage;

function updateStageUI() {
  const stages = Array.isArray(S.filterStages) ? S.filterStages : [];
  document.querySelectorAll('.stage-chip').forEach(el => {
    if (stages.includes(el.dataset.value)) {
      el.style.background = '#CCFF00';
      el.style.color = '#000';
      el.style.borderColor = '#CCFF00';
    } else {
      el.style.background = 'transparent';
      el.style.color = '#1b1b1b';
      el.style.borderColor = '#c6c6c6';
    }
  });
}
window.updateStageUI = updateStageUI;

// ─── 朋友偏好：性别 / 兴趣 / 活动多选（§6.4） ──────────────────
function selectFriendGenderSegment(val) {
  if (!FRIEND_GENDER_WHITELIST.includes(val)) return;
  S.friendGender = val;
  updateFriendGenderUI();
}
window.selectFriendGenderSegment = selectFriendGenderSegment;

function updateFriendGenderUI() {
  document.querySelectorAll('.friend-gender-seg').forEach(el => {
    const active = el.dataset.value === (S.friendGender || 'all');
    el.style.background = active ? '#CCFF00' : 'transparent';
    el.style.color = active ? '#000' : '#1b1b1b';
  });
}
window.updateFriendGenderUI = updateFriendGenderUI;

// 兴趣多选（兼容旧静态 chip 入口）：现统一走兴趣优先级逻辑（限 3）。
function toggleFriendInterest(val) {
  toggleFriendPriorityInterest(val);
}
window.toggleFriendInterest = toggleFriendInterest;

// 活动多选：含则移除否则加入，随后刷新高亮。
function toggleFriendActivity(val) {
  if (!Array.isArray(S.friendPrefActivities)) S.friendPrefActivities = [];
  const i = S.friendPrefActivities.indexOf(val);
  if (i >= 0) S.friendPrefActivities.splice(i, 1);
  else S.friendPrefActivities.push(val);
  updateFriendPrefUI();
}
window.toggleFriendActivity = toggleFriendActivity;

// 朋友兴趣/活动 chip 高亮（选中 = 荧光绿底黑字 #CCFF00，未选 = 透明底灰边）。
function updateFriendPrefUI() {
  const interests = Array.isArray(S.friendPrefInterests) ? S.friendPrefInterests : [];
  const activities = Array.isArray(S.friendPrefActivities) ? S.friendPrefActivities : [];
  document.querySelectorAll('.friend-interest-chip').forEach(el => {
    const on = interests.includes(el.dataset.value);
    el.style.background = on ? '#CCFF00' : 'transparent';
    el.style.color = on ? '#000' : '#1b1b1b';
    el.style.borderColor = on ? '#CCFF00' : '#c6c6c6';
  });
  document.querySelectorAll('.friend-activity-chip').forEach(el => {
    const on = activities.includes(el.dataset.value);
    el.style.background = on ? '#CCFF00' : 'transparent';
    el.style.color = on ? '#000' : '#1b1b1b';
    el.style.borderColor = on ? '#CCFF00' : '#c6c6c6';
  });
}
window.updateFriendPrefUI = updateFriendPrefUI;

// ─── 朋友兴趣优先级（最多 3，来自当前用户 profile 兴趣）（§6.4） ──────────────────
// 取当前用户 profile 的兴趣标签作为可选项（interests 优先，回退 tags）。去空去重。
function getProfileInterestOptions() {
  const prof = S.currentUser?.profile || {};
  const raw = Array.isArray(prof.interests) && prof.interests.length
    ? prof.interests
    : (Array.isArray(prof.tags) ? prof.tags : []);
  const seen = new Set();
  const out = [];
  raw.forEach(t => {
    const v = (t == null ? '' : String(t)).trim();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  });
  return out;
}

// 动态渲染兴趣优先级 chip 到 #friend-interests：选项来自 profile 兴趣，回填已选（S.friendPrefInterests，限 3）。
// 无 profile 兴趣时给出空状态提示。chip 共用 .friend-interest-chip 以复用 updateFriendPrefUI 高亮。
function renderFriendPriorityInterests() {
  const wrap = document.getElementById('friend-priority-interests');
  if (!wrap) return;
  const opts = getProfileInterestOptions();
  // 先把已选裁剪为仍存在于 profile 选项内的项（profile 兴趣可能已变更），并保持限 3。
  if (Array.isArray(S.friendPrefInterests)) {
    S.friendPrefInterests = S.friendPrefInterests.filter(v => opts.includes(v)).slice(0, 3);
  } else {
    S.friendPrefInterests = [];
  }
  if (!opts.length) {
    wrap.innerHTML = `<p class="font-body text-xs text-stone-400 leading-relaxed">Add interests to your profile first, then pick up to 3 priorities here.</p>`;
    return;
  }
  // 经 dataset.value 传值（避免值含引号时 inline onclick 注入/解析问题）。
  // escapeHtml 不转义双引号，属性上下文需额外转义 " 以防截断 data-value。
  wrap.innerHTML = opts.map(v => {
    const text = window.escapeHtml(v);
    const attr = text.replace(/"/g, '&quot;');
    return `<button class="friend-interest-chip px-5 py-2.5 rounded-[10px] border border-outline-variant font-headline font-bold text-xs tracking-wider transition-all active:scale-[0.98]" data-value="${attr}" onclick="toggleFriendPriorityInterest(this.dataset.value)">${text}</button>`;
  }).join('');
  updateFriendPrefUI();
}
window.renderFriendPriorityInterests = renderFriendPriorityInterests;

// 切换兴趣优先级：含则移除，否则加入；最多 3 个，超出禁选并 toast。
function toggleFriendPriorityInterest(val) {
  const v = val == null ? '' : String(val);
  if (!v) return;
  if (!Array.isArray(S.friendPrefInterests)) S.friendPrefInterests = [];
  const i = S.friendPrefInterests.indexOf(v);
  if (i >= 0) {
    S.friendPrefInterests.splice(i, 1);
  } else {
    if (S.friendPrefInterests.length >= 3) {
      window.toast('Pick up to 3 priority interests');
      return;
    }
    S.friendPrefInterests.push(v);
  }
  updateFriendPrefUI();
}
window.toggleFriendPriorityInterest = toggleFriendPriorityInterest;

// ========================================
// 增强模式开关（J 规则 §6.4 / §10.5）
// ========================================
// 切换增强开关（恋人/朋友各自独立）。朋友显隐 1–5 滑块；能量不足时提示去充值。
function toggleEnhance(mode) {
  ensureEnhancedShape();
  const m = mode === 'friend' ? 'friend' : 'romantic';
  S.enhanced[m].enabled = !S.enhanced[m].enabled;
  updateEnhanceUI(m);
  const cost = m === 'romantic' ? 3 : (S.enhanced.friend.cells || 1);
  if (S.enhanced[m].enabled && (S.energy?.availableEnergy ?? 0) < cost) {
    window.toast('Not enough energy — top up');
    window.openEnergyModal?.();
  }
}
window.toggleEnhance = toggleEnhance;

// 朋友增强档位 1–5（=保证匹配朋友数 N，cost 同 cells）。
function updateFriendCells(v) {
  ensureEnhancedShape();
  const cells = Math.min(5, Math.max(1, parseInt(v, 10) || 1));
  S.enhanced.friend.cells = cells;
  const disp = document.getElementById('friend-cells-display');
  if (disp) disp.textContent = cells;
  const cost = document.getElementById('friend-cells-cost');
  if (cost) cost.textContent = cells;
}
window.updateFriendCells = updateFriendCells;

// 同步增强开关 UI：checkbox 勾选态 + 朋友 1–5 滑块显隐与值。
function updateEnhanceUI(mode) {
  ensureEnhancedShape();
  const m = mode === 'friend' ? 'friend' : 'romantic';
  if (m === 'romantic') {
    const tg = document.getElementById('romantic-enhance-toggle');
    if (tg) tg.checked = !!S.enhanced.romantic.enabled;
    return;
  }
  const tg = document.getElementById('friend-enhance-toggle');
  if (tg) tg.checked = !!S.enhanced.friend.enabled;
  const wrap = document.getElementById('friend-cells-wrap');
  if (wrap) wrap.classList.toggle('hidden', !S.enhanced.friend.enabled);
  const slider = document.getElementById('friend-cells-slider');
  if (slider) slider.value = S.enhanced.friend.cells || 1;
  updateFriendCells(S.enhanced.friend.cells || 1);
}
window.updateEnhanceUI = updateEnhanceUI;

// ========================================
// MATCH SETTINGS（左上角图标入口）
// matchBasis 三选 + extraMatchInfo 自由文本；retake 问卷入口移入此面板内。
// ========================================
const MATCH_BASIS_WHITELIST = ['questionnaire', 'profile', 'both'];

function updateMatchBasisUI() {
  document.querySelectorAll('.match-basis-seg').forEach(el => {
    if (el.dataset.value === S.matchBasis) {
      el.style.background = '#CCFF00';
      el.style.color = '#000';
    } else {
      el.style.background = 'transparent';
      el.style.color = '#1b1b1b';
    }
  });
}
window.updateMatchBasisUI = updateMatchBasisUI;

async function openMatchSettings() {
  window.openOverlay('match-settings-overlay');
  ensureEnhancedShape();
  const mode = S.activeMatchMode || 'romantic';
  let prefs = {};
  try {
    const data = await window.api('/matching/preferences?mode=' + mode);
    prefs = data?.data || data || {};
  } catch (e) {}
  S.matchBasis = MATCH_BASIS_WHITELIST.includes(prefs.matchBasis) ? prefs.matchBasis : 'both';
  const extra = document.getElementById('match-extra-info');
  if (extra) extra.value = prefs.extraMatchInfo != null ? prefs.extraMatchInfo : '';
  window.updateMatchBasisUI();
  // 增强开关回填（按当前匹配模式，§10.5）：Match Settings 现负责增强字段。
  if (mode === 'romantic') {
    S.enhanced.romantic.enabled = !!prefs.enhancedModeEnabled;
  } else {
    S.enhanced.friend.enabled = !!prefs.enhancedModeEnabled;
    S.enhanced.friend.cells = Math.min(5, Math.max(1, prefs.friendEnhancedCells || 1));
  }
  // 仅显示当前匹配模式的增强项（恋爱 match setting 只显示恋爱增强，朋友只显示朋友增强，§本轮反馈3）
  const rItem = document.getElementById('romantic-enhance-item');
  const fItem = document.getElementById('friend-enhance-item');
  if (rItem) rItem.style.display = mode === 'romantic' ? '' : 'none';
  if (fItem) fItem.style.display = mode === 'friend' ? '' : 'none';
  window.updateEnhanceUI(mode);
}
window.openMatchSettings = openMatchSettings;

function closeMatchSettings() {
  window.closeOverlay('match-settings-overlay');
}
window.closeMatchSettings = closeMatchSettings;

async function setMatchBasis(v) {
  if (!MATCH_BASIS_WHITELIST.includes(v)) return;
  S.matchBasis = v;
  window.updateMatchBasisUI();
  try {
    await window.api('/matching/preferences', 'PUT', { mode: S.activeMatchMode || 'romantic', matchBasis: v });
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
}
window.setMatchBasis = setMatchBasis;

async function saveMatchSettings() {
  ensureEnhancedShape();
  const mode = S.activeMatchMode || 'romantic';
  const extraMatchInfo = document.getElementById('match-extra-info')?.value || '';
  // 增强开关只在客户端状态 S.enhanced 里，join pool (startMatch → POST /matching/start) 时才
  // 提交并预扣能量。这里不再把 enhancedModeEnabled/friendEnhancedCells 发到 /matching/preferences：
  // 后端只认 /matching/start 的扣费路径，偏好端点已拒收这两个字段（防免费白嫖增强）。
  const body = { mode, extraMatchInfo };
  try {
    await window.api('/matching/preferences', 'PUT', body);
    window.toast('Settings saved');
    window.closeMatchSettings();
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
}
window.saveMatchSettings = saveMatchSettings;
