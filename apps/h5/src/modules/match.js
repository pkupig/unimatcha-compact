import { S } from '../state.js';

// ========================================
// HOME TOP-LEVEL VIEW SWITCH (Chat / 恋人匹配 / 朋友匹配)  §6.2 (A 规则)
// ========================================
// 主页内部三切换：'chat' | 'romantic' | 'friend'。
// 三视图排在 #home-track 横向轨道上（广场同款：跟手滑 + 松手吸附），切换 = 轨道
// 平移到目标面板；恋人/朋友各自独立面板（matchPaneEl/matchContentEl 按模式取）。
//  - 'chat'：会话列表面板，调 loadSessions()（chat.js 列表层，§6.6）。
//  - 'romantic' / 'friend'：设 S.activeMatchMode 后先查该模式问卷完成度
//    （GET /questionnaire/completion，§6.3 G 规则），已填则 loadMatchTab()。
const HOME_ORDER = ['chat', 'romantic', 'friend'];
const HOME_PAGE_GAP = 12; // 页间留白，与广场轨道一致

function matchPaneEl(mode) {
  return document.getElementById(mode === 'friend' ? 'home-match-friend' : 'home-match-romantic');
}
function matchContentEl(mode) {
  return matchPaneEl(mode)?.querySelector('.match-content') || null;
}
function homePagerWidth() {
  // 隐藏时 clientWidth 为 0 也要回退（8/19 广场 pagerWidth 同款坑）
  return document.getElementById('tab-match')?.clientWidth || window.innerWidth || 375;
}
function homeTrackOffset(view) {
  const i = Math.max(0, HOME_ORDER.indexOf(view));
  return -i * (homePagerWidth() + HOME_PAGE_GAP);
}
function setHomeTrack(x, animate) {
  const t = document.getElementById('home-track');
  if (!t) return;
  t.style.transition = animate ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  t.style.transform = 'translateX(' + x + 'px)';
}
if (!window.__homeTrackResizeBound) {
  window.__homeTrackResizeBound = true;
  window.addEventListener('resize', () => setHomeTrack(homeTrackOffset(S.homeView || 'chat'), false));
}

function switchHomeView(view) {
  if (!HOME_ORDER.includes(view)) view = 'chat';
  const first = !switchHomeView._entered; // 首次进入（switchTab('match')）直接就位不播动画
  switchHomeView._entered = true;
  S.homeView = view;
  // 切视图先停掉上一视图的轮询/倒计时/动画，避免叠加泄漏
  window.stopMatchPolling();
  window.stopCountdownTick();
  window.stopCampusAnim?.();
  // 顶部分段高亮
  document.querySelectorAll('#home-mode-switch .home-mode-seg').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  // 左上角按钮：三个视图统一为加号小弹出卡（设置入口并入摘要框「编辑」，tune 已移除）。
  const leftBtn = document.getElementById('home-addfriend-btn');
  if (leftBtn) {
    const icon = leftBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = 'add';
    leftBtn.title = 'Add';
    leftBtn.onclick = () => window.toggleChatPlusMenu();
  }
  // 轨道吸附到目标面板（点分段也走同一条动画，与横滑手感一致）
  setHomeTrack(homeTrackOffset(view), !first);
  // 相邻匹配面板预热：面板还空着就先用缓存渲一版计划页，横滑拖出来时不是白板
  // （广场「双页预载」同理；真实状态到达后 ensureQuestionnaireThenMatch 会重渲覆盖）
  prewarmMatchPanes(view);
  if (view === 'chat') {
    // 会话列表由 chat.js 提供（§6.6）；尚未实现时静默跳过，不阻塞匹配视图。
    window.loadSessions?.();
    return;
  }
  // 匹配视图（恋人 / 朋友）
  S.activeMatchMode = view;
  // 进模式前先查问卷完成度（G 规则：未填该模式问卷不能进匹配，引导去填）
  ensureQuestionnaireThenMatch(view);
}
window.switchHomeView = switchHomeView;

// 空匹配面板预热：只在面板从未渲染过时跑，用本地缓存同步渲一版计划页（零网络等待，
// loadPlanData 在后台刷新偏好）。当前正要进入的面板不预热——交给正规加载流程。
function prewarmMatchPanes(enteringView) {
  ['romantic', 'friend'].forEach((m) => {
    if (m === enteringView) return;
    const content = matchContentEl(m);
    if (!content || content.childElementCount > 0) return;
    renderPlanState(content, m, S.matchStatus?.[m]?.state === 'searching');
  });
}

// ─── 主页三视图左右滑切换（Chat ↔ 恋人 ↔ 朋友）────────────────
// 广场 bindSquareSwipe 同款：轨道跟手平移、两端橡皮筋、≥70px 松手吸附到相邻页，
// 判定为横滑后 preventDefault 掐断竖向滚动（非 passive）。8/19 教训：目标页按当前
// 下标 ±1 并夹住，不按方向写死；settle 绑 document 防触点节点被 innerHTML 换掉。
function bindHomeViewSwipe() {
  const root = document.getElementById('tab-match');
  if (!root || root.dataset.swipeBound) return;
  root.dataset.swipeBound = '1';
  let sx = 0, sy = 0, active = false, horiz = null, dx = 0;
  const swipeTarget = (d) => {
    const i = HOME_ORDER.indexOf(S.homeView || 'chat');
    return HOME_ORDER[Math.min(HOME_ORDER.length - 1, Math.max(0, i + (d < 0 ? 1 : -1)))];
  };
  root.addEventListener('touchstart', (e) => {
    if (active && e.touches.length > 1) return; // 手势中多指：忽略，不重置状态
    // 弹层（聊天对话/偏好卡等）或加号菜单打开时不启动横滑
    if (document.querySelector('.overlay.active') || document.getElementById('chat-plus-menu')) { active = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    active = true; horiz = null; dx = 0;
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!active) return;
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (horiz === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      horiz = Math.abs(dx) > Math.abs(dy);
      root.dataset.horizLock = horiz ? '1' : '0';
      if (horiz) root.style.touchAction = 'none';
    }
    if (!horiz) return;
    if (e.cancelable) e.preventDefault();
    const target = swipeTarget(dx);
    const damp = target === (S.homeView || 'chat') ? 0.3 : 1; // 两端没有下一页 → 橡皮筋
    setHomeTrack(homeTrackOffset(S.homeView || 'chat') + dx * damp, false);
  }, { passive: false });
  const settle = () => {
    if (!active) return;
    active = false;
    // 无条件复位（不受 !horiz 早退影响）：锁、touch-action、轨道都要回到位
    root.dataset.horizLock = '0';
    root.style.touchAction = '';
    if (S.activeTab !== 'match') { setHomeTrack(homeTrackOffset(S.homeView || 'chat'), false); return; }
    if (!horiz) { setHomeTrack(homeTrackOffset(S.homeView || 'chat'), true); return; }
    const target = swipeTarget(dx);
    if (Math.abs(dx) >= 70 && target !== (S.homeView || 'chat')) {
      window.switchHomeView(target); // 内部把轨道动画吸附到目标面板
    } else {
      setHomeTrack(homeTrackOffset(S.homeView || 'chat'), true); // 弹回当前页
    }
  };
  document.addEventListener('touchend', settle, { passive: true });
  document.addEventListener('touchcancel', settle, { passive: true });
}
window.bindHomeViewSwipe = bindHomeViewSwipe;

// ─── Chat 视图加号小弹出卡（本轮反馈7）────────────────────────
// 顺序：搜索 → 扫码 → 关系网；附深色模式/语言。点击项后关卡片再执行。
function toggleChatPlusMenu() {
  const existing = document.getElementById('chat-plus-menu');
  if (existing) { existing.remove(); return; }
  const items = [
    { icon: 'search', label: 'Search & discover', run: () => window.openFriendHubAt('search') },
    { icon: 'qr_code_2', label: 'Add by QR', run: () => window.openFriendHubAt('qr') },
    { icon: 'hub', label: 'Relationship Network', run: () => window.openFriendHubAt('graph') },
    { icon: 'dark_mode', label: 'Dark mode', run: () => window.toggleDarkMode() },
    { icon: 'translate', label: 'Language', run: () => window.openLangDialog() },
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
  if (completed) {
    // 重填完成后横幅必须撤掉：横幅是 prepend 进面板的，而计划页同态守卫命中时
    // loadMatchTab 不重建容器 DOM——没有这行，横幅会一直留到下次整页刷新。
    matchContentEl(mode)?.querySelector('.q-refill-banner')?.remove();
  }
  if (!completed) {
    // 问卷墙只拦「还没进任何状态」的用户。已在池中/已匹配/已在关系中的人必须能进
    // 匹配页——否则改版激活新问卷的瞬间（所有人完成度归零），在池的人连「离开匹配池」
    // 都点不到、情侣看不到伴侣卡。这些人改出顶部横幅引导重填，页面照常渲染。
    let state = S.matchStatus?.[mode]?.state;
    if (state === undefined) {
      try {
        const st = await window.api('/matching/status?mode=' + mode);
        state = (st?.data ?? st ?? {}).state;
      } catch (e) { state = undefined; }
      if (S.homeView !== mode) return;
    }
    if (!state || state === 'idle') {
      promptFillQuestionnaire(mode);
      return;
    }
    S.pendingQuestionnaireBanner = mode; // renderMatchTab 后追加横幅
  }
  await window.loadMatchTab();
  if (S.pendingQuestionnaireBanner === mode) {
    S.pendingQuestionnaireBanner = null;
    injectQuestionnaireBanner(mode);
  }
}

// 非 idle 用户的重填引导横幅：插在该模式面板的匹配内容顶部，不挡任何既有操作
function injectQuestionnaireBanner(mode) {
  const container = matchContentEl(mode);
  if (!container || container.querySelector('.q-refill-banner')) return; // 去重按本面板查（两面板可各有一条）
  const bar = document.createElement('div');
  bar.className = 'q-refill-banner w-full max-w-xs mx-auto mb-4 px-4 py-3 rounded-[10px] bg-neon/15 flex items-center justify-between gap-3';
  bar.innerHTML = `<span class="text-xs text-on-surface">Questionnaire updated — refill for better matches</span>
    <button class="shrink-0 px-3 py-1.5 rounded-full bg-neon text-black font-headline text-[10px] font-bold tracking-widest active:scale-95 transition-transform" onclick="goFillQuestionnaire('${mode === 'friend' ? 'friend' : 'romantic'}')">Refill</button>`;
  container.prepend(bar);
}

// 未填问卷引导：在该模式面板渲染一张引导卡，按钮跳问卷页填写对应模式问卷。
function promptFillQuestionnaire(mode) {
  window.stopCountdownTick();
  setMatchPlanLayout(mode, false); // 引导卡走原有居中布局
  const container = matchContentEl(mode);
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
  // 按用户从本地恢复（后端有意不存增强字段；不持久化则重启后开关归零=「保存没用」）
  const uid = S.currentUser?.id;
  if (uid && S.enhanced._uid !== uid) {
    try {
      const saved = JSON.parse(localStorage.getItem('cl_enhanced_' + uid) || 'null');
      if (saved) {
        S.enhanced.romantic = { ...S.enhanced.romantic, ...saved.romantic };
        S.enhanced.friend = { ...S.enhanced.friend, ...saved.friend };
      }
    } catch (e) {}
    S.enhanced._uid = uid;
  }
  return S.enhanced;
}

function persistEnhanced() {
  const uid = S.currentUser?.id;
  if (!uid) return;
  try {
    localStorage.setItem('cl_enhanced_' + uid, JSON.stringify({ romantic: S.enhanced.romantic, friend: S.enhanced.friend }));
  } catch (e) {}
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
    const container = matchContentEl(mode);
    if (container) renderPlanState(container, mode, false); // 未入池也跑倒计时
  }
}
window.loadMatchTab = loadMatchTab;

// ════════════════════════════════════════
// 匹配页新版（设计稿「UniMatcha新匹配页 ui.html」）：idle / searching 共用一套
// 「标题 → 出血荧光绿倒计时卡（周历 + 大数字） → 只读偏好/设置摘要框（框内滚动）
//  → 贴底主按钮」。编辑入口 = 摘要框右上角「编辑」→ 偏好卡（匹配设置已并入）。
// ════════════════════════════════════════

// idle/searching 用顶对齐满高布局（.home-match-pane.match-plan，见 main.css），
// 其余状态（matched 大卡/情侣空间/空态/问卷引导）恢复原有垂直居中布局。按模式面板切。
function setMatchPlanLayout(mode, on) {
  const pane = matchPaneEl(mode);
  if (pane) pane.classList.toggle('match-plan', !!on);
}

// 距下一轮公布的目标时刻：后端 nextRunAt → 本地 cron 解析 → 周五 17:00 兜底。
// mode 可选（预热/双面板 tick 需要按面板算），缺省当前激活模式。
function getNextRevealDate(mode) {
  const m = (mode === 'friend' || mode === 'romantic') ? mode : (S.activeMatchMode || 'romantic');
  const st = S.matchStatus?.[m];
  let next = st?.nextRunAt ? new Date(st.nextRunAt) : null;
  if (!next || isNaN(next.getTime())) next = window.getNextCronRun(st?.matchConfig?.cronExpr);
  if (!next) {
    const now = new Date();
    const day = now.getDay();
    let dd = (5 - day + 7) % 7;
    if (dd === 0 && now.getHours() >= 17) dd = 7;
    next = new Date(now);
    next.setDate(now.getDate() + dd);
    next.setHours(17, 0, 0, 0);
  }
  return next;
}

// 周历行：本周一~周日的日期；今天=白底圆片，公布日=白色「公布日」小标 + 手绘白圈。
function renderWeekRow(mode) {
  const zh = (window.getLang?.() === 'zh');
  const names = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
  const todayIdx = (now.getDay() + 6) % 7;
  // 徽标按【日期】定位而非星期几：周五 17:00 后 reveal 已是下周五，按星期定位会把
  // 「公布日」圈在本周（已过去的）五格上，与倒计时自相矛盾（复查确认）。
  // reveal 不在本周（idx 出 0..6）则整行不出徽标，跨天 tick 重渲周历时自愈。
  const reveal = getNextRevealDate(mode);
  const rd = new Date(reveal);
  rd.setHours(0, 0, 0, 0);
  const revealIdx = Math.round((rd - monday) / 86400000);
  const badge = zh ? '公布日' : 'REVEAL';
  let cells = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const num = String(d.getDate()).padStart(2, '0');
    cells += `<span class="mp-day${i === todayIdx ? ' mp-day--today' : ''}">${i === revealIdx
      ? `<span class="mp-day-badge" data-no-i18n>${badge}</span><svg class="mp-day-ring" width="40" height="28" viewBox="0 0 40 28" fill="none"><path d="M20 3 C30 2.5 37 8 37 14 C37 21.5 29 26 19 25.5 C10 25 3 21 3 14.5 C3 8 11 4 23 3.2" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round"/></svg>`
      : ''}<span class="mp-day-name" data-no-i18n>${names[i]}</span><span class="mp-day-num" data-no-i18n>${num}</span></span>`;
  }
  return `<div class="mp-week">${cells}</div>`;
}

// 出血荧光绿倒计时卡：标签 + 周历 + 单行大数字（白描边）。数字由 startCountdownTick
// 按 [data-cd] 每秒就地更新；跨天时周历也由 tick 就地重渲（data-day-stamp 比对）。
// 恋人/朋友两面板各有一份，全部用 class + data-mode 定位（双面板下 id 会撞）。
// alt=true 用镜像圆角（设计稿两画板的手绘感差异：idle/searching 各一套）。
function renderCountdownCard(mode, alt) {
  const zh = (window.getLang?.() === 'zh');
  const units = zh ? ['天', '时', '分', '秒'] : ['d', 'h', 'm', 's'];
  const keys = ['d', 'h', 'm', 's'];
  return `<div class="mp-card${alt ? ' mp-card--alt' : ''}">
    <p class="mp-card-label" data-no-i18n>${zh ? '距下轮公布' : 'NEXT REVEAL IN'}</p>
    ${renderWeekRow(mode)}
    <div class="mp-cd" data-mode="${mode}" data-day-stamp="${new Date().getDate()}">
      ${keys.map((k, i) => `<span class="mp-cd-g"><span class="mp-num" data-cd="${k}" data-no-i18n>00</span><span class="mp-unit" data-no-i18n>${units[i]}</span></span>`).join('')}
    </div>
  </div>`;
}

// 只读摘要框骨架：全部偏好字段 + 匹配设置（增强/补充信息），框内滚动、只读。
// searching 时右上角换锁定提示、内容压暗（设计稿 opacity .55）。值由 fillPlanBox 填。
function renderPlanBox(mode, searching) {
  const zh = (window.getLang?.() === 'zh');
  const friend = mode === 'friend';
  const L = zh
    ? { prefs: '匹配偏好', settings: '匹配设置', gender: '目标性别', age: '年龄范围', stage: '学业阶段', interests: '兴趣优先', school: '校区筛选', enhance: '增强模式', extra: '补充信息', edit: '编辑', lock: '匹配中锁定 · 离开后可修改' }
    : { prefs: 'MATCH PREFERENCES', settings: 'MATCH SETTINGS', gender: 'Target Gender', age: 'Age Range', stage: 'University Stage', interests: 'Interest Priority', school: 'School Filter', enhance: 'Enhanced Mode', extra: 'Extra Info', edit: 'Edit', lock: 'Locked while matching · leave pool to edit' };
  const header = searching
    ? `<button class="mp-lockline" onclick="matchSettingsLockedToast()" data-no-i18n><span class="material-symbols-outlined" style="font-size:13px">lock</span><span>${L.lock}</span></button>`
    : `<button class="mp-editlink" onclick="openFilterSheet('${mode}')" data-no-i18n><span>${L.edit}</span><svg width="26" height="5" viewBox="0 0 26 5" fill="none"><path d="M2 3 C7 1.6 13 3.8 18 2.6 C21 2 23.5 3 24 2.6" stroke="#CCFF00" stroke-width="2.6" stroke-linecap="round"/></svg></button>`;
  // 值节点一律 data-mp 属性（双面板下 id 会撞），fillPlanBox 在本面板内 querySelector
  const cell = (label, key) => `<span class="flex flex-col py-1.5 mp-sep" style="gap:1px">
      <span class="text-[10px] tracking-[0.06em] mp-muted" data-no-i18n>${label}</span>
      <span data-mp="${key}" class="text-[14px] font-extrabold text-on-surface" data-no-i18n>—</span>
    </span>`;
  return `<div class="mp-box" data-plan="${mode}:${searching ? 's' : 'i'}">
    <!-- 标题行固定（用户反馈：滚的是偏好内容，「匹配偏好」与「编辑」不动） -->
    <div class="mp-box-head flex items-center justify-between">
      <span class="mp-label" data-no-i18n>${L.prefs}</span>
      ${header}
    </div>
    <div class="mp-box-scroll${searching ? ' mp-dim' : ''}">
      <div class="grid grid-cols-2 gap-x-4 mt-0.5">
        ${cell(L.gender, 'gender')}
        ${cell(L.age, 'age')}
        ${friend ? cell(L.interests, 'interests') : cell(L.stage, 'stage')}
        ${cell(L.school, 'school')}
      </div>
      <p class="mp-label mt-3 mb-1" data-no-i18n>${L.settings}</p>
      <div class="flex items-center justify-between gap-3.5 py-1.5 mp-sep">
        <span class="flex flex-col" style="gap:1px">
          <span class="text-[14px] font-bold text-on-surface" data-no-i18n>${L.enhance}</span>
          <span data-mp="enh-sub" class="text-[11px] mp-muted" data-no-i18n></span>
        </span>
        <span data-mp="enh-toggle" class="mp-toggle"></span>
      </div>
      <div class="py-1.5">
        <span class="text-[14px] font-bold text-on-surface" data-no-i18n>${L.extra}</span>
        <div data-mp="extra" class="mp-extra mt-1.5" data-no-i18n></div>
      </div>
    </div>
  </div>`;
}

// 摘要框填值：偏好字段来自 prefs（缓存或刚拉的），增强来自 S.enhanced（客户端态，
// 进池时才提交扣费）。searching 且本轮确实以增强进池时按「本轮已生效」显示。
function fillPlanBox(mode, prefs) {
  const root = matchContentEl(mode);
  if (!root) return;
  const zh = (window.getLang?.() === 'zh');
  const set = (key, v) => { const el = root.querySelector(`[data-mp="${key}"]`); if (el) el.textContent = v; };
  if (prefs) {
    const g = prefs.preferredGender;
    set('gender', g === 'male' ? (zh ? '男生' : 'Male') : g === 'female' ? (zh ? '女生' : 'Female') : (zh ? '不限' : 'Any'));
    set('age', prefs.ageMin == null && prefs.ageMax == null ? (zh ? '不限' : 'Any') : `${prefs.ageMin ?? 18} — ${prefs.ageMax ?? 30}`);
    if (mode === 'friend') {
      const ints = (Array.isArray(prefs.preferredInterests) ? prefs.preferredInterests : []).filter(Boolean);
      set('interests', ints.length ? ints.slice(0, 3).join(' · ') : (zh ? '未设置' : 'Not set'));
    } else {
      const stageMap = zh
        ? { undergraduate: '本科', master: '硕士', doctor: '博士' }
        : { undergraduate: 'Undergrad', master: 'Master', doctor: 'PhD' };
      const stages = String(prefs.universityStage || '').split(',').map(s => stageMap[s.trim()]).filter(Boolean);
      set('stage', stages.length ? stages.join(' · ') : (zh ? '不限' : 'Any'));
    }
    const su = !!prefs.requireSameUniversity, sc = !!prefs.requireSameCity;
    set('school', su && sc ? (zh ? '仅同校 · 同城' : 'Same school · city') : su ? (zh ? '仅同校' : 'Same school only') : sc ? (zh ? '同城' : 'Same city') : (zh ? '不限' : 'Any'));
    const extraEl = root.querySelector('[data-mp="extra"]');
    if (extraEl) {
      const txt = String(prefs.extraMatchInfo || '').trim();
      extraEl.textContent = txt || (zh ? '告诉算法更多关于你的事' : 'Anything else to help matching…');
      extraEl.classList.toggle('mp-extra--empty', !txt);
    }
  }
  ensureEnhancedShape();
  const friend = mode === 'friend';
  const searching = S.matchStatus?.[mode]?.state === 'searching';
  const activeRound = searching && lastEnhancedRound[mode];
  const on = activeRound || !!S.enhanced[mode]?.enabled;
  const cells = friend ? Math.min(5, Math.max(1, parseInt(S.enhanced.friend.cells, 10) || 1)) : 3;
  const tg = root.querySelector('[data-mp="enh-toggle"]');
  if (tg) tg.classList.toggle('on', on);
  const sub = root.querySelector('[data-mp="enh-sub"]');
  if (sub) {
    if (activeRound) sub.textContent = zh ? `本轮已生效 · ${cells} 能量` : `Active this round · ${cells} cells`;
    else if (friend) sub.textContent = on ? (zh ? `保底 ${cells} 位 · ${cells} 能量` : `Guarantee ${cells} · ${cells} cells`) : (zh ? '每保底 1 位朋友 1 能量' : '1 cell per guaranteed friend');
    else sub.textContent = zh ? '3 能量 · 未匹配自动退回' : '3 cells · refunded if no match';
  }
}

// 摘要框数据装载：先用缓存立即填（renderPlanState 已做），这里拉新鲜值刷新。
// 竞态令牌 + 目标节点存在性双守卫（视图切走/状态翻页后放弃）。
async function loadPlanData(mode) {
  // 令牌按模式分桶：预热面板与激活面板会并发各拉一份，全局令牌会互相作废
  const seqs = (loadPlanData._seq = loadPlanData._seq || { romantic: 0, friend: 0 });
  const seq = ++seqs[mode];
  let prefs;
  try {
    const data = await window.api('/matching/preferences?mode=' + mode);
    prefs = data?.data || data || {};
  } catch (e) { return; } // 加载失败：保留缓存/占位显示，不打扰
  if (seq !== seqs[mode]) return;
  if (!S.matchPrefs || typeof S.matchPrefs !== 'object') S.matchPrefs = { romantic: null, friend: null };
  S.matchPrefs[mode] = prefs;
  // 双面板下该模式的框常驻（预热面板也在），只要框还在就回填（fillPlanBox 自带存在性守卫）
  if (!matchContentEl(mode)?.querySelector('.mp-box')) return;
  fillPlanBox(mode, prefs);
}

// idle / searching 整页渲染入口。
function renderPlanState(container, mode, searching) {
  setMatchPlanLayout(mode, true);
  // 同态重渲守卫（复查 medium）：30s 轮询无条件 renderMatchTab，整页重建会把 mp-box
  // 滚动位置拽回顶部、每拍还多拉一次偏好。同 mode 同状态且计划页 DOM 仍在时只刷值。
  // 标记放在 mp-box 自己身上：其它分支 innerHTML 覆盖后标记随 DOM 消失，天然失效。
  const key = mode + ':' + (searching ? 's' : 'i');
  const probe = container.querySelector('.mp-box');
  if (probe && probe.dataset.plan === key) {
    window.startCountdownTick(); // renderMatchTab 入口统一 stopCountdownTick 过，须重启
    fillPlanBox(mode, S.matchPrefs?.[mode] || null);
    return;
  }
  const friend = mode === 'friend';
  // 两态字体样式统一（用户反馈）：标题恒 .mp-title 26px，副文案 .mp-sub 钳两行高
  const title = searching ? 'Matching in Progress' : (friend ? 'Find New Friends' : 'Start Your Journey');
  const sub = searching
    ? (friend
      ? 'Names are revealed Friday 17:00 — friends on your wavelength are on the way.'
      : 'Names are revealed Friday 17:00 — someone on your wavelength is walking toward you.')
    : (friend
      ? "Join this week's pool — the algorithm will scan the crowd for 5 friends on your wavelength."
      : "Join this week's pool — the algorithm will watch the crowd for someone on your wavelength.");
  const cta = searching
    ? `<button class="mp-cta mp-cta--leave" onclick="stopMatch()">Leave Pool</button>`
    : `<button class="mp-cta" onclick="startMatch()">Join Matching Pool</button>`;
  container.innerHTML = `
    <h2 class="mp-title font-headline font-extrabold tracking-tight text-on-surface shrink-0">${title}</h2>
    <p class="font-body text-[14px] mp-sub mt-1.5 shrink-0" style="line-height:1.65">${sub}</p>
    ${renderCountdownCard(mode, searching)}
    ${renderPlanBox(mode, searching)}
    ${cta}`;
  window.startCountdownTick();
  fillPlanBox(mode, S.matchPrefs?.[mode] || null);
  loadPlanData(mode);
}

// 兼容壳：历史调用点（window.renderIdleMatch）——新版渲染带副作用（布局类/tick/
// 数据拉取），统一走 renderPlanState；返回空串避免旧的 innerHTML= 用法覆盖。
function renderIdleMatch() {
  const mode = S.activeMatchMode || 'romantic';
  const container = matchContentEl(mode);
  if (container) renderPlanState(container, mode, false);
  return '';
}
window.renderIdleMatch = renderIdleMatch;

// 等待动画（/loaders.html iframe）已按用户要求移除：idle 与 searching 都以
// 倒计时为视觉主体。startCampusAnim/stopCampusAnim 保留为空函数，兜住可能
// 残留的旧调用点。
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
  const mode = (data && data.mode) || S.activeMatchMode || 'romantic';
  const container = matchContentEl(mode);
  if (!container) return;
  // 每次重渲先清掉共享倒计时 interval，各分支再按需启动自己的 ticker，避免残留。
  window.stopCountdownTick();
  // 布局基线：先恢复居中布局，idle/searching 分支（renderPlanState）再自行开启计划页布局。
  setMatchPlanLayout(mode, false);
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
              <h3 class="text-2xl font-headline font-bold tracking-tight text-on-surface flex items-center gap-2 justify-center">${window.escapeHtml(p.nickname || 'Match')}${window.badgeFor?.({ verificationStatus: p.verificationStatus, verifiedSchool: p.verifiedSchool, badgeSize: 'md' }) || (verified ? `<span class="material-symbols-outlined text-base text-primary" title="Campus verified">verified</span>` : '')}</h3>
              <p class="font-body text-sm text-outline" data-no-i18n>${window.escapeHtml(window.metaLabel(p.school || 'University'))}${p.academic_year ? ' · ' + window.escapeHtml(window.metaLabel(p.academic_year)) : ''}</p>
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

  // idle / 其它：进池入口（新版计划页）。
  renderPlanState(container, 'romantic', false);
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

  // idle / 其它：进池入口（新版计划页）。
  renderPlanState(container, 'friend', false);
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
        <h3 class="font-headline font-bold text-sm tracking-tight text-on-surface truncate">${window.escapeHtml(p.nickname || 'Friend')}${window.badgeFor?.({ verificationStatus: p.verificationStatus, verifiedSchool: p.verifiedSchool }) || ''}</h3>
        <p class="font-body text-xs text-outline truncate" data-no-i18n>${window.escapeHtml(window.metaLabel(p.school || 'University'))}</p>
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

// searching：与 idle 同一套计划页布局，摘要框锁定压暗、主按钮换粉描边「离开匹配池」。
function renderSearchingSkeleton(container, mode) {
  renderPlanState(container, mode === 'friend' ? 'friend' : 'romantic', true);
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
// 本轮以增强身份进池的会话内标记（searching 骨架显示徽标用）
const lastEnhancedRound = { romantic: false, friend: false };

// 换账号清理（cleanupUserState 调用；模块内 let/const 外部够不到）：
// 本轮增强标记归零（否则下一账号的 searching 框会显示上一账号的「本轮已生效」）、
// 在途偏好请求作废（慢响应会把上一账号的偏好含补充信息回填进下一账号的框/卡）。
function resetMatchPlanState() {
  lastEnhancedRound.romantic = false;
  lastEnhancedRound.friend = false;
  const seqs = (loadPlanData._seq = loadPlanData._seq || { romantic: 0, friend: 0 });
  seqs.romantic++; seqs.friend++;
  loadPrefsForMode._seq = (loadPrefsForMode._seq || 0) + 1;
  prefsLoadFailed = false;
  switchHomeView._entered = false; // 下次进主页轨道直接就位不播动画
}
window.resetMatchPlanState = resetMatchPlanState;

async function startMatch() {
  const mode = S.activeMatchMode || 'romantic';
  ensureEnhancedShape();
  // 先过问卷门槛再谈扣费：否则用户确认了花费却被后端以「请先完成问卷」拒绝
  try {
    const res = await window.api('/questionnaire/completion?type=' + mode);
    const d = res?.data ?? res ?? {};
    const done = !!(d[mode] ?? d)?.completed;
    if (!done) { promptFillQuestionnaire(mode); return; }
  } catch (e) { /* 完成度查询失败：不拦，交给后端判定 */ }
  const enh = S.enhanced[mode] || {};
  const enhanced = !!enh.enabled;
  const cells = mode === 'friend'
    ? Math.min(5, Math.max(1, parseInt(S.enhanced.friend.cells, 10) || 1))
    : undefined;
  if (enhanced) {
    const cost = mode === 'romantic' ? 3 : cells;
    // 新鲜余额再校验（S.energy 可能是冷启动默认 0 或旧值）
    await window.loadEnergyBar?.();
    const avail = S.energy?.availableEnergy ?? 0;
    if (avail < cost) {
      window.toast('Not enough energy — top up');
      window.openEnergyModal?.();
      return;
    }
    // 显式确认：增强按轮付费，绝不静默扣（审计确认的重复扣费根因）
    const zh = typeof window.getLang === 'function' && window.getLang() === 'zh';
    const ok = await window.confirmCard(zh ? {
      title: '本轮使用增强匹配？',
      body: '将立即消耗 ' + cost + ' 格能量（当前 ' + avail + ' 格）。' + (mode === 'romantic' ? '本轮未匹配到会全额退回。' : '保底不足会按缺口退回。'),
      confirmLabel: '消耗 ' + cost + ' 格并进入',
      cancelLabel: '先不用增强',
    } : {
      title: 'Use Enhanced this round?',
      body: cost + ' energy cells will be spent now (you have ' + avail + '). ' + (mode === 'romantic' ? 'Fully refunded if no match this round.' : 'Shortfall refunded if the guarantee is not met.'),
      confirmLabel: 'Spend ' + cost + ' & join',
      cancelLabel: 'Join without it',
    });
    if (ok === null) return; // 点背景关闭 = 中止，不进池也不动开关（审计 #10）
    if (!ok) {
      // 显式选择「不用增强」：本次按普通身份进池，开关复位
      S.enhanced[mode].enabled = false;
      persistEnhanced();
      updateEnhanceUI(mode);
    }
  }
  const useEnhanced = !!S.enhanced[mode].enabled;
  // 乐观渲染：立即进入搜索中动画
  lastEnhancedRound[mode] = useEnhanced;
  ensureMatchStatusBucket()[mode] = { mode, state: 'searching' };
  window.renderMatchTab(S.matchStatus[mode]);
  try {
    const body = { mode, enhanced: useEnhanced };
    if (mode === 'friend') body.cells = cells;
    const res = await window.api('/matching/start', 'POST', body);
    const st = (res?.data ?? res) || {};
    // 后端在「已在池中」时早返回，不写增强标记也不扣费。此时绝不能报成功、
    // 更不能复位开关（审计 #3：否则用户以为买了增强，实际是空操作）。
    const alreadyIn = /already matching/i.test(String(st.message || ''));
    if (alreadyIn) {
      lastEnhancedRound[mode] = false;
      window.toast(useEnhanced
        ? 'Already in this round\'s pool — leave the pool first to join with Enhanced'
        : 'Already in the matching pool');
    } else {
      window.toast(useEnhanced ? 'Entered pool · Enhanced (' + (mode === 'romantic' ? 3 : cells) + ' cells)' : 'Entered matching pool');
      window.loadEnergyBar?.();
      // 按轮付费语义：确实扣费进池后才复位开关
      if (useEnhanced) {
        S.enhanced[mode].enabled = false;
        persistEnhanced();
        updateEnhanceUI(mode);
      }
    }
  } catch (e) {
    lastEnhancedRound[mode] = false;
    window.toast('Failed: ' + e.message);
  }
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

// 倒计时分格（用户反馈：要有格子分开时间单位的大格子）：天/时/分/秒 各占一格。
// 只渲染骨架，数字由 startCountdownTick 每秒按 [data-cd] 就地更新——不整块重渲，
// 避免每秒重建 DOM 打断过渡与无障碍焦点。
function countdownParts(diff) {
  if (!(diff > 0)) return { d: 0, h: 0, m: 0, s: 0 };
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

// （旧 2×2 荧光绿倒计时大格 renderCountdownBoxes 已被计划页的 renderCountdownCard 取代）

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

// 距下一轮公布的毫秒数：目标时刻统一由 getNextRevealDate 提供
// （后端 nextRunAt → 本地 cron 解析 → 周五 17:00 兜底），周历行同源。
function getMatchCycleMs(mode) {
  return getNextRevealDate(mode) - Date.now();
}
window.getMatchCycleMs = getMatchCycleMs;

function getMatchCycleCountdown() {
  return window.formatCountdown(getMatchCycleMs());
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
  const tick = () => {
    // 每次重新查 DOM：分支重渲后旧节点会失联，缓存引用会让倒计时静默停摆。
    // 双面板各有一份倒计时卡（预热面板横滑拖出来也要在走），按 data-mode 各算各的。
    const roots = document.querySelectorAll('.mp-cd');
    if (!roots.length) return;
    const stamp = String(new Date().getDate());
    roots.forEach((root) => {
      const mode = root.dataset.mode === 'friend' ? 'friend' : 'romantic';
      // 跨天：周历行的「今天」高亮与日期会过期，就地重渲本卡的周历（无网络请求）
      if (root.dataset.dayStamp && root.dataset.dayStamp !== stamp) {
        root.dataset.dayStamp = stamp;
        const week = root.closest('.mp-card')?.querySelector('.mp-week');
        if (week) week.outerHTML = renderWeekRow(mode);
      }
      const p = countdownParts(getMatchCycleMs(mode));
      ['d', 'h', 'm', 's'].forEach((k) => {
        const cell = root.querySelector(`[data-cd="${k}"]`);
        if (cell) {
          const v = String(p[k]).padStart(2, '0');
          if (cell.textContent !== v) cell.textContent = v;
        }
      });
    });
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
    .map((v) => esc(window.metaLabel(String(v))))
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
        <button onclick="hideOverlay('partner-profile-overlay')" class="pp-back absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-black/35 backdrop-blur text-white flex items-center justify-center active:scale-95 transition-transform" title="Back">
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
        ${p.school ? `<p class="text-sm font-medium text-on-surface-variant mt-1.5 flex items-center gap-1" data-no-i18n><span class="material-symbols-outlined" style="font-size:16px;">school</span>${esc(window.metaLabel(p.school))}</p>` : ''}
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

// 打开偏好面板：按当前匹配模式拉取偏好并回填对应区（含并入的匹配设置：增强/补充信息/重填问卷）。
// ── 匹配中锁定设置（产品规则）──
// 偏好与增强都只在下一次撮合时生效，进池后再改会与本轮已提交的条件不一致，
// 因此 searching 状态一律禁止修改，必须先离开匹配池。
// 只锁 searching：matched/confirming 时改的是下一轮的条件，应当放行。
function isMatchPoolActive(mode) {
  const m = (mode === 'friend' || mode === 'romantic') ? mode : (S.activeMatchMode || 'romantic');
  return S.matchStatus?.[m]?.state === 'searching';
}
window.isMatchPoolActive = isMatchPoolActive;

function matchSettingsLockedToast() {
  const zh = (window.getLang?.() === 'zh');
  window.toast(zh ? '匹配中无法修改设置，请先离开匹配池' : 'Leave the matching pool before changing settings');
}
window.matchSettingsLockedToast = matchSettingsLockedToast;

// 匹配中置为只读（用户反馈：可以查看但不能修改）：禁用面板内全部可交互控件
// 并置灰保存键，顶部插一条说明；离开匹配池后再打开自动恢复可编辑。
function applyPanelReadonly(overlayId, locked) {
  const root = document.getElementById(overlayId);
  if (!root) return;
  const zh = (window.getLang?.() === 'zh');
  root.querySelectorAll('input, select, textarea, button').forEach((el) => {
    // 关闭/返回键必须始终可用，否则面板会关不掉
    if (el.dataset.alwaysEnabled === '1' || /close|hide|Overlay\('/.test(el.getAttribute('onclick') || '')) return;
    el.disabled = locked;
    el.classList.toggle('opacity-50', locked);
    el.classList.toggle('pointer-events-none', locked);
  });
  let note = root.querySelector('[data-readonly-note]');
  if (locked && !note) {
    note = document.createElement('div');
    note.setAttribute('data-readonly-note', '1');
    note.className = 'mx-6 mt-4 mb-1 px-4 py-2.5 rounded-[12px] bg-surface-container-low flex items-center gap-2';
    note.innerHTML = `<span class="material-symbols-outlined text-outline" style="font-size:17px">lock</span>
      <span class="text-[11px] text-on-surface-variant leading-snug" data-no-i18n>${zh
        ? '匹配中：设置仅可查看。离开匹配池后可修改。'
        : 'Matching in progress — view only. Leave the pool to make changes.'}</span>`;
    const header = root.querySelector('header');
    if (header && header.parentElement) header.parentElement.insertBefore(note, header.nextSibling);
    else root.firstElementChild?.prepend(note);
  } else if (!locked && note) {
    note.remove();
  }
}
window.applyPanelReadonly = applyPanelReadonly;

async function openFilterSheet(mode) {
  window.openOverlay('filter-overlay');
  // 标题「编辑」按语言设置（静态 HTML 不进词典：'Edit' 太短，做全局键有误翻用户内容的风险）
  const title = document.getElementById('filter-sheet-title');
  if (title) title.textContent = (window.getLang?.() === 'zh') ? '编辑' : 'Edit';
  const m = (mode === 'friend' || mode === 'romantic') ? mode : (S.activeMatchMode || 'romantic');
  S.prefMode = m;
  // switchPrefMode already fetches + backfills this mode's prefs (loadPrefsForMode).
  // Do not call loadPrefsForMode again here — the previous double-call fired two
  // identical GET /matching/preferences requests and rendered the form twice.
  switchPrefMode(m);
  // 回填是异步的，等一拍再置只读，确保覆盖到渲染出来的控件
  applyPanelReadonly('filter-overlay', isMatchPoolActive(m));
  setTimeout(() => applyPanelReadonly('filter-overlay', isMatchPoolActive(m)), 350);
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

// 偏好卡整卡加载失败标记：失败时共享控件（年龄/同校/同城）与 S.filter* 还留着上一次
// 成功回填的值——可能是另一模式的，此时放行 Save 会把它们 PUT 进当前模式（复查 medium）。
// 置位后 saveFilterPrefs 整体拒存，重开面板/加载成功即复位。
let prefsLoadFailed = false;

// 拉取并回填某模式偏好 + 匹配设置区（原 match-settings 抽屉并入本卡：
// 增强区按模式显隐/开关回填、补充信息装载）。
async function loadPrefsForMode(mode) {
  // 竞态令牌：只有最后一次调用的响应才回填（快速切模式/重开面板会连发请求）
  const seq = (loadPrefsForMode._seq = (loadPrefsForMode._seq || 0) + 1);
  prefsLoadFailed = false;
  ensureEnhancedShape();
  // 网络请求前先同步就位：增强区显隐 + 开关状态 + 清空文本（弱网下旧模式残留窗口）
  const rItem = document.getElementById('romantic-enhance-item');
  const fItem = document.getElementById('friend-enhance-item');
  if (rItem) rItem.style.display = mode === 'romantic' ? '' : 'none';
  if (fItem) fItem.style.display = mode === 'friend' ? '' : 'none';
  window.updateEnhanceUI(mode);
  const extra = document.getElementById('match-extra-info');
  if (extra) { extra.value = ''; extra.dataset.dirty = ''; extra.dataset.loadFailed = ''; extra.oninput = () => { extra.dataset.dirty = '1'; }; }
  window.loadEnergyBar?.(); // 能量新鲜度（增强开关校验用）
  let prefs = null;
  try {
    const data = await window.api('/matching/preferences?mode=' + mode);
    prefs = data?.data || data || {};
  } catch (e) { prefs = null; }
  if (seq !== loadPrefsForMode._seq) return;
  if (prefs === null) {
    // 加载失败：不要把任何残留表单值当权威值——整卡拒存（共享控件此刻显示的可能是
    // 另一模式的旧值），extraMatchInfo 的 loadFailed 标记留作双保险。
    // 不动保存键 disabled：applyPanelReadonly 的 350ms 定时器会覆盖它，拦截靠
    // saveFilterPrefs 里的 prefsLoadFailed 检查 + toast 反馈。
    prefsLoadFailed = true;
    if (extra) extra.dataset.loadFailed = '1';
    window.toast('Preferences failed to load');
    return;
  }
  if (!S.matchPrefs || typeof S.matchPrefs !== 'object') S.matchPrefs = { romantic: null, friend: null };
  S.matchPrefs[mode] = prefs; // 顺带刷新主页摘要框的缓存源
  if (extra && extra.dataset.dirty !== '1') extra.value = prefs.extraMatchInfo != null ? prefs.extraMatchInfo : '';
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
  // 增强开关是即点即存的客户端态（toggleEnhance/persistEnhanced），不随 Save 提交——
  // 关卡后同步主页摘要框的增强显示（其余值等保存成功才动）。
  const m = S.activeMatchMode || 'romantic';
  if (matchContentEl(m)?.querySelector('.mp-box')) fillPlanBox(m, S.matchPrefs?.[m] || null);
}
window.closeFilterSheet = closeFilterSheet;

// 保存偏好 + 补充信息：按当前偏好面板模式取字段 PUT。
// （增强开关不经此端点：后端只认 /matching/start 的扣费路径，偏好端点拒收增强字段）
async function saveFilterPrefs(mode) {
  const m = (mode === 'friend' || mode === 'romantic') ? mode : currentMode();
  // 二次拦截：面板打开期间状态可能变成 searching（轮询/另一端进池）
  if (isMatchPoolActive(m)) { matchSettingsLockedToast(); window.closeFilterSheet(); return; }
  // 整卡加载失败：表单里是陈旧/他模式的值，拒存（保存键已禁用，此为兜底）
  if (prefsLoadFailed) {
    window.toast((window.getLang?.() === 'zh') ? '偏好还没加载成功，请关闭后重试' : 'Preferences failed to load — close and retry');
    return;
  }
  // 年龄/同校/同城为恋人/朋友共享输入控件（始终在 DOM）。增强字段不在此提交（只走 /matching/start 扣费路径）。
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
  // 补充信息（原 match-settings 抽屉字段，随本卡一并保存）：
  // 偏好没加载成功且用户没动过输入框时不带该字段，防空白覆盖服务器上已有文本
  const extraEl = document.getElementById('match-extra-info');
  const skipExtra = extraEl?.dataset.loadFailed === '1' && extraEl?.dataset.dirty !== '1';
  if (!skipExtra) prefs.extraMatchInfo = extraEl?.value || '';
  persistEnhanced(); // 增强开关客户端态落地（进池时才提交扣费）
  window.btnBusy('filter-save-btn', true);
  try {
    await window.api('/matching/preferences', 'PUT', prefs);
    // 主页摘要框缓存与显示就地刷新（仍停在该模式的 idle/searching 时）
    if (!S.matchPrefs || typeof S.matchPrefs !== 'object') S.matchPrefs = { romantic: null, friend: null };
    S.matchPrefs[m] = { ...(S.matchPrefs[m] || {}), ...prefs };
    window.toast('Preferences saved');
    window.closeFilterSheet();
    if ((S.activeMatchMode || 'romantic') === m && matchContentEl(m)?.querySelector('.mp-box')) {
      fillPlanBox(m, S.matchPrefs[m]);
    }
  } catch (e) {
    window.toast('Failed: ' + e.message);
  } finally {
    window.btnBusy('filter-save-btn', false);
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
async function toggleEnhance(mode) {
  ensureEnhancedShape();
  const m = mode === 'friend' ? 'friend' : 'romantic';
  const tg = document.getElementById(m + '-enhance-toggle');
  const turningOn = !S.enhanced[m].enabled;
  // await 期间把 checkbox 拉回受控状态并禁用，避免「显示开着但状态是关」的窗口（审计 #11）
  if (tg) { tg.checked = !!S.enhanced[m].enabled; tg.disabled = true; }
  try {
  if (turningOn) {
    // 先拉新鲜余额（S.energy 冷启动恒为 0，会误判）；不足则不翻转、不持久化
    await window.loadEnergyBar?.();
    const cost = m === 'romantic' ? 3 : (S.enhanced.friend.cells || 1);
    if ((S.energy?.availableEnergy ?? 0) < cost) {
      if (tg) tg.checked = false;
      window.toast('Not enough energy — top up');
      window.openEnergyModal?.();
      return;
    }
  }
  S.enhanced[m].enabled = turningOn;
  updateEnhanceUI(m);
  persistEnhanced();
  // 主页摘要框就地同步（复查：X 键/下拉关卡不走 closeFilterSheet，开关状态会陈旧到
  // 下一拍轮询——增强是即点即存的客户端态，改完立刻把框上的只读开关对齐）
  if (matchContentEl(m)?.querySelector('.mp-box')) { // 双面板常驻：该模式面板有框就同步（无需再看激活模式）
    fillPlanBox(m, S.matchPrefs?.[m] || null);
  }
  } finally { if (tg) tg.disabled = false; }
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
  persistEnhanced();
  // 摘要框副文案带档位（保底 N 位 · N 能量），拖滑块也要就地同步（同 toggleEnhance）
  if (matchContentEl('friend')?.querySelector('.mp-box')) {
    fillPlanBox('friend', S.matchPrefs?.friend || null);
  }
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

// （原 match-settings 左抽屉的 openMatchSettings/closeMatchSettings/saveMatchSettings 已删除：
//  内容并入 #filter-overlay 偏好卡，装载走 loadPrefsForMode、保存走 saveFilterPrefs。）
