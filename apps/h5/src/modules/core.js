import { S } from '../state.js';

// ========================================
// API HELPER FUNCTIONS
// ========================================
async function api(path, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  const token = localStorage.getItem('cl_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = {
    method,
    headers,
    // API 无 Cache-Control 时浏览器会启发式缓存 GET，导致「保存成功但重开读到旧值」
    cache: 'no-store'
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${S.API}${path}`, opts);
  if (!res.ok) {
    if (res.status === 401) {
      // Token expired/invalid: stop all background polling so we don't keep
      // firing token-less requests, fully reset user-scoped state, then bounce
      // to the auth page. Throw so callers' catch blocks can react instead of
      // continuing on with a null result (which previously crashed renderMatchTab).
      localStorage.removeItem('cl_token');
      window.stopMatchPolling?.();
      window.stopRealtime?.();
      window.stopChatPolling?.();
      window.stopNotifPolling?.();
      window.stopCountdownTick?.();
      window.cleanupUserState?.();
      window.closeAllOverlays?.();
      window.showPage('page-auth');
      throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `API ${res.status}`);
  }
  return await res.json();
}
window.api = api;

async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('cl_token');
  const res = await fetch(`${S.API}/uploads/image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Upload failed');
  return data.data?.url || data.url;
}

// ========================================
// AUTH FUNCTIONS
// ========================================
window.uploadImageFile = uploadImageFile;

// Clear every user-scoped field on S so a fresh login/anonymous session can
// never see the previous account's data (cross-user bleed on shared devices).
// ── SSE 实时通道：message/notification 事件到达即拉取，轮询降频为兜底 ──
// 服务端只推「失效通知」，数据仍走既有 REST；EventSource 自带断线重连。
function startRealtime() {
  stopRealtime();
  const token = localStorage.getItem('cl_token');
  if (!token || typeof EventSource === 'undefined') return;
  const es = new EventSource(`${S.API}/realtime/stream?token=${encodeURIComponent(token)}`);
  S.realtimeES = es;
  es.onopen = () => { S.realtimeUp = true; };
  // 断开期间轮询自动恢复原频率；EventSource 会自行重连
  es.onerror = () => { S.realtimeUp = false; };
  es.onmessage = (ev) => {
    let data = null;
    try { data = JSON.parse(ev.data); } catch (e) { return; }
    if (data.type === 'ready') { S.realtimeUp = true; return; }
    if (data.type === 'evicted') {
      // 服务端单用户连接上限挤掉了本连接：主动关闭、停在全频轮询，别再重连挤别人
      stopRealtime();
      return;
    }
    if (data.type === 'message') {
      // 正在看这个会话 → 立刻拉新消息；会话列表节流刷新（红点/预览，带 trailing 补刷）
      if (S.chatMatchId && data.matchId === S.chatMatchId) window.pollChatMessages?.();
      throttleWithTrailing('realtimeSess', 3000, () => window.loadSessions?.());
    } else if (data.type === 'message_like') {
      // 轮询是 afterId 单向游标，带不回「旧消息被点赞」，必须靠推送就地刷新
      if (S.chatMatchId && data.matchId === S.chatMatchId) window.refreshMessageLike?.(data.messageId);
    } else if (data.type === 'read') {
      // 对方读了我的消息：当前就在这个会话 → 立刻点亮「已读」
      if (S.chatMatchId && data.matchId === S.chatMatchId) window.refreshReadReceipts?.();
    } else if (data.type === 'notification') {
      // 与会话列表同款 3s 节流：热帖被连续点赞时不能一赞一全量拉
      throttleWithTrailing('realtimeNotif', 3000, () => window.notifPollTick?.());
    }
  };
}
window.startRealtime = startRealtime;

function stopRealtime() {
  if (S.realtimeES) { try { S.realtimeES.close(); } catch (e) { /* noop */ } S.realtimeES = null; }
  S.realtimeUp = false;
  // 清掉节流表里挂着的 trailing 定时器：否则登出后它们还会补发无令牌请求
  if (S.rtThrottle) {
    for (const k in S.rtThrottle) {
      if (S.rtThrottle[k] && S.rtThrottle[k].timer) clearTimeout(S.rtThrottle[k].timer);
    }
  }
  S.rtThrottle = {};
}

// leading+trailing 节流：窗口内首个调用立即执行，窗口内后续调用合并为窗口末尾补一次
// ——纯 leading 会让「3s 内连来 N 条」的最后一条状态一直陈旧到下个事件
function throttleWithTrailing(key, ms, fn) {
  S.rtThrottle = S.rtThrottle || {};
  const slot = S.rtThrottle[key] || (S.rtThrottle[key] = { last: 0, timer: null });
  const now = Date.now();
  if (now - slot.last >= ms) {
    slot.last = now;
    fn();
  } else if (!slot.timer) {
    slot.timer = setTimeout(() => {
      slot.timer = null;
      slot.last = Date.now();
      fn();
    }, ms - (now - slot.last));
  }
}
window.stopRealtime = stopRealtime;

function cleanupUserState() {
  // Tear down every background timer through its own stop helper so the
  // interval is actually cleared (not just the id nulled). This makes
  // cleanupUserState self-contained for callers that don't stop polling
  // first (e.g. checkUserState's logged-out branch), and guarantees no
  // previous account's timer survives into the next session.
  window.stopMatchPolling?.();
  window.stopChatPolling?.();
  window.stopNotifPolling?.();
  window.stopCountdownTick?.();
  window.stopRealtime?.();
  window.stopSessionCountdown?.();
  S.currentUser = null;
  S.userSettings = null;
  // Dual-mode: matchStatus is bucketed by mode ({romantic, friend}); reset to the
  // empty bucket shape (not null) so match.js can keep indexing S.matchStatus[mode].
  S.matchStatus = { romantic: null, friend: null };
  S.homeView = 'chat';
  S.activeMatchMode = 'romantic';
  S.isSubmittingProposal = false;
  // Enhanced/energy (§10.5): reset to state.js defaults. Without this, a different
  // account logging in on the same SPA session inherits the prior user's enhance
  // toggle + stale energy cache, so tapping "Join Matching Pool" could enrol them in
  // a paid enhanced match they never selected (ensureEnhancedShape rehydrates these).
  S.energy = { totalEnergy: 0, usedEnergy: 0, availableEnergy: 0 };
  S.enhanced = {
    romantic: { enabled: false, cost: 3 },
    friend: { enabled: false, cells: 1 },
  };
  S.matchBasis = 'both';
  S.matchExtraInfo = '';
  // 匹配页只读摘要框的偏好缓存（含 extraMatchInfo）：换账号必须清，
  // 否则上一账号的偏好/补充信息会短暂展示给下一账号。
  S.matchPrefs = { romantic: null, friend: null };
  // 「附近」定位缓存：共享设备上必须随登出清掉，否则下一个账号的第一屏
  // 会按上一个人的位置排序（同 S.matchPrefs 的换账号泄显教训）。
  S.geo = null;
  S.geoError = null;
  S.nearbyMode = null;
  // 探索：选中的学校与列表也随登出清（下一个账号不该继承上一个人在逛哪所学校）
  S.exploreSchool = null;
  S.exploreSchools = null;
  S.exploreVerified = null;
  // 本轮增强标记归零 + 在途偏好响应作废（复查：慢响应可把上一账号的偏好回填进下一账号）
  window.resetMatchPlanState?.();
  // match polling context (ids/counters reset by stopMatchPolling above,
  // re-asserted here as a defensive default)
  S.matchPollingId = null;
  S.matchPollFailCount = 0;
  // chat
  S.chatMatchId = null;
  S.chatPartnerId = null;
  S.chatPartnerName = null;
  S.chatMessages = [];
  S.chatPollingId = null;
  S.chatLastId = null;
  S.chatNextCursor = null;
  S.chatRenderFrom = 0;
  S.chatLoadingHistory = false;
  S.chatPollBusy = false;
  S.chatPollTick = 0;
  S.chatStreak = null;
  S.forwardPayload = null;
  S.newPostGeo = null;
  S.replyTo = null;
  // chat session list (§6.6)
  S.sessions = [];
  S.chatSessionType = null;
  S.chatMode = null;
  S.chatMyConfirmed = false;
  S.chatPartnerConfirmed = false;
  S.chatSessionStatus = null;
  S.sessionCountdownId = null;
  // countdown
  S.countdownInterval = null;
  // notifications (polling id reset by stopNotifPolling above; clear cache/paging)
  S.notifPollingId = null;
  S.notifList = [];
  S.notifPage = 1;
  S.notifHasMore = false;
  S.notifLoadingMore = false;
  // questionnaire (dual-mode buckets, §6.3)
  S.questionnaire = null;
  S.answers = {};
  S.romanticAnswers = {};
  S.friendAnswers = {};
  S.questionnaireMode = 'romantic';
  S.currentQuestion = 0;
  // square / post detail
  S.currentPostId = null;
  S.pdPostData = null;
  S.pdSortMode = 'time';
  S.pdReplyTo = null;
  S.pdPendingImgs = [];
  S.newPostImages = [];
  S.squarePosts = [];
  S.squareReqSeq = 0;
  S.isSubmittingPost = false;
  // profile editing
  S.editTags = [];
  S.setupTags = [];
  // UI state — reset to the same defaults declared in state.js so the next
  // account opens on a clean view instead of inheriting the prior user's tabs.
  S.activeTab = 'match';
  S.squareSection = 'recommended';
  // Square v2 (dual-mode §6.11): reset tab + new-post destination/anonymity so
  // the next account opens on the recommend tab with a clean compose form.
  S.squareTab = 'recommend';
  S.newPostBoard = 'recommend';
  S.newPostAnonymous = false;
  S.milestoneData = null;
  S.metadataCache = {};
  S.filterGender = 'all';
  S.filterStages = [];
}
window.cleanupUserState = cleanupUserState;

async function checkUserState() {
  const token = localStorage.getItem('cl_token');
  if (!token) {
    cleanupUserState();
    window.closeAllOverlays();
    window.showPage('page-auth');
    return;
  }
  try {
    const data = await window.api('/users/me');
    S.currentUser = data.data || data;
    const u = S.currentUser;
    if (u.status === 'BANNED') {
      window.closeAllOverlays();
      window.showPage('page-banned');
      return;
    }
    window.startRealtime?.();
    window.loadSchoolBadges?.(); // 校标元信息（失败自动降级为生成徽章，不阻断）
    const hasProfile = u.hasProfile != null ? u.hasProfile : !!(u.profile && u.profile.nickname);
    // G 规则：两份问卷均为选填（可都填 / 只填一个 / 都不填）。资料填完即进主页；
    // 问卷不作为进主页的门槛——在进入「恋人 / 朋友」匹配模式时再按该模式按需引导填写
    // （见 match.js switchHomeView 的完成度校验）。
    if (!hasProfile) {
      window.showPage('page-profile-setup');
    } else {
      window.showPage('page-home');
      window.switchTab('match');
    }
  } catch (e) {
    localStorage.removeItem('cl_token');
    window.showPage('page-auth');
  }
}

// ========================================
// PAGE NAVIGATION
// ========================================
window.checkUserState = checkUserState;

// ========================================
// PAGE NAVIGATION
// ========================================
function showPage(id) {
  // Hide all SPA pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Also hide all tab panels when navigating away from home
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.style.display = id === 'page-home' ? 'flex' : 'none';
}
window.showPage = showPage;

function switchTab(tab) {
  // 重按当前导航（目前仅广场用）：回顶 + 只刷当前信息流
  const reTap = S.activeTab === tab;
  window.stopMatchPolling();
  window.stopChatPolling();
  window.stopNotifPolling();
  window.stopCountdownTick();
  S.activeTab = tab;
  // Ensure page-home is active (provides the base layer)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const homeEl = document.getElementById('page-home');
  if (homeEl) homeEl.classList.add('active');
  // Show bottom nav
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.style.display = 'flex';
  // Update nav active state
  document.querySelectorAll('#bottom-nav .nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  // Toggle tab panels
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  const tabEl = document.getElementById(`tab-${tab}`);
  if (tabEl) tabEl.style.display = 'block';
  // Load tab content
  // 进入主页（match tab）：走主页顶部三切换（默认 S.homeView，A 规则 §6.2）。
  // Chat 视图列出全部对话；恋人/朋友视图各自匹配界面。不再直接 loadMatchTab。
  if (tab === 'match') window.switchHomeView(S.homeView || 'chat');
  else if (tab === 'square') {
    if (reTap) {
      // 重按广场导航 = 刷新（用户反馈）：回到顶部，只刷当前信息流——
      // 推荐/校园墙各刷各的，另一页内容与位置不动。
      // 滚动容器是 #tab-square 本身（body overflow-hidden，window 不滚）
      const sc = document.getElementById('tab-square');
      if (sc) { try { sc.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { sc.scrollTop = 0; } }
      if (S.squareScrollPos) S.squareScrollPos[S.squareTab] = 0;
      window.loadSquareTab2?.(S.squareTab);
    } else {
      window.loadSquareTab();
    }
  }
  else if (tab === 'profile') window.loadProfileTab();
}
window.switchTab = switchTab;

// ========================================
// OVERLAY HELPERS
// ========================================
function openOverlay(id) {
  document.getElementById(id)?.classList.add('active');
}
window.openOverlay = openOverlay;

function closeOverlay(id) {
  document.getElementById(id)?.classList.remove('active');
}
window.closeOverlay = closeOverlay;

function hideOverlay(id) {
  window.closeOverlay(id);
}
window.hideOverlay = hideOverlay;

// ── Styled confirm / prompt CARDS（本轮反馈6：替代浏览器原生 window.confirm/prompt）──
// 返回 Promise：confirmCard -> boolean；promptCard -> string|null（取消为 null）。无 emoji。
function appCardBackdrop() {
  const back = document.createElement('div');
  back.className = 'fixed inset-0 z-[120] flex items-center justify-center px-6 bg-black/40 backdrop-blur-[2px]';
  return back;
}

function confirmCard({ title = 'Are you sure?', body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const esc = window.escapeHtml || ((s) => s);
    const back = appCardBackdrop();
    back.innerHTML = `
      <div class="w-full max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6" role="dialog" aria-modal="true">
        <h3 class="font-headline font-extrabold text-lg tracking-tight text-on-surface mb-2">${esc(title)}</h3>
        ${body ? `<p class="font-body text-sm leading-relaxed text-on-surface-variant mb-6">${esc(body)}</p>` : '<div class="mb-6"></div>'}
        <div class="flex gap-3">
          <button data-card-cancel class="flex-1 py-3 rounded-[10px] border border-outline-variant text-on-surface font-bold text-xs tracking-widest active:scale-[0.98] transition-transform">${esc(cancelLabel)}</button>
          <button data-card-ok class="flex-1 py-3 rounded-[10px] ${danger ? 'bg-neon-pink text-white' : 'bg-neon text-black'} font-bold text-xs tracking-widest active:scale-[0.98] transition-transform">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const done = (val) => { back.remove(); resolve(val); };
    back.querySelector('[data-card-ok]').onclick = () => done(true);
    back.querySelector('[data-card-cancel]').onclick = () => done(false);
    // 点背景 = 中止（null），与显式点「取消」(false) 区分：调用方可据此不做降级动作
    back.onclick = (e) => { if (e.target === back) done(null); };
    document.body.appendChild(back);
  });
}
window.confirmCard = confirmCard;

function promptCard({ title = 'Enter a value', label = '', placeholder = '', value = '', confirmLabel = 'Save', cancelLabel = 'Cancel', multiline = false } = {}) {
  return new Promise((resolve) => {
    const esc = window.escapeHtml || ((s) => s);
    const back = appCardBackdrop();
    const fieldCls = 'w-full bg-transparent bg-surface-container-low rounded-[10px] border-0 px-3 py-2.5 focus:ring-1 focus:ring-neon focus:outline-none';
    const field = multiline
      ? `<textarea data-card-input rows="3" class="${fieldCls} resize-none" placeholder="${esc(placeholder)}"></textarea>`
      : `<input data-card-input type="text" class="${fieldCls}" placeholder="${esc(placeholder)}"/>`;
    back.innerHTML = `
      <div class="w-full max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6" role="dialog" aria-modal="true">
        <h3 class="font-headline font-extrabold text-lg tracking-tight text-on-surface mb-3">${esc(title)}</h3>
        ${label ? `<p class="text-[10px] font-bold tracking-[0.2em] text-outline uppercase mb-2">${esc(label)}</p>` : ''}
        ${field}
        <div class="flex gap-3 mt-6">
          <button data-card-cancel class="flex-1 py-3 rounded-[10px] border border-outline-variant text-on-surface font-bold text-xs tracking-widest active:scale-[0.98] transition-transform">${esc(cancelLabel)}</button>
          <button data-card-ok class="flex-1 py-3 rounded-[10px] bg-neon text-black font-bold text-xs tracking-widest active:scale-[0.98] transition-transform">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const input = back.querySelector('[data-card-input]');
    input.value = value || ''; // 用属性赋值避免引号转义问题
    const done = (val) => { back.remove(); resolve(val); };
    back.querySelector('[data-card-ok]').onclick = () => done(input.value);
    back.querySelector('[data-card-cancel]').onclick = () => done(null);
    back.onclick = (e) => { if (e.target === back) done(null); };
    if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    document.body.appendChild(back);
    setTimeout(() => input.focus(), 30);
  });
}
window.promptCard = promptCard;

function closeAllOverlays() {
  document.querySelectorAll('.overlay.active').forEach(o => o.classList.remove('active'));
}

// ========================================
// SPLASH & INITIALIZATION
// ========================================
window.closeAllOverlays = closeAllOverlays;

// ========================================
// SPLASH & INITIALIZATION
// ========================================
function hideSplash() {
  const s = document.getElementById('splash');
  if (s) {
    s.classList.add('hide');
    setTimeout(() => {
      s.style.display = 'none';
      window.checkUserState();
    }, 600);
  }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
window.hideSplash = hideSplash;

// ========================================
// UTILITY FUNCTIONS
// ========================================
function toast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }
}
window.toast = toast;

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}
window.escapeHtml = escapeHtml;

// ── 底部导航悬浮 + 滚动隐藏（本轮反馈4）──
// 各 tab 滚动容器下滑时收起底导（translateY 出屏），上滑/回顶恢复。
function bindNavAutoHide(container) {
  if (!container || container.dataset.navHideBound) return;
  container.dataset.navHideBound = '1';
  let lastY = 0;
  container.addEventListener('scroll', () => {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    const y = container.scrollTop;
    const dy = y - lastY;
    lastY = y;
    if (y < 40) { nav.classList.remove('nav-hide'); return; }
    if (dy > 6) nav.classList.add('nav-hide');
    else if (dy < -6) nav.classList.remove('nav-hide');
  }, { passive: true });
}
window.bindNavAutoHide = bindNavAutoHide;

// 平面简约空态图标（本轮反馈6）：圆角方块 + 图标，无圆环无描边。
// tone: 'neon'（行动引导，荧光绿底黑图标）| 'muted'（纯空态，浅灰底灰图标）。
// ── 下拉刷新（本轮反馈：match / square 页支持下拉刷新，带小动画）──
// container 为滚动容器（#tab-match / #tab-square 这类 overflow-y:auto 的固定层）。
// 顶部下拉时圆形指示器跟手下降并随进度旋转，过阈值松手 → 图标转圈 + 执行
// onRefresh()（返回 Promise），完成后收回。指示器动画最少展示 600ms 避免闪跳。
function attachPullToRefresh(container, onRefresh, contentSelector, opts) {
  if (!container || container.dataset.ptrBound) return;
  container.dataset.ptrBound = '1';
  // 可选下拉进度回调（profile 用它做背景模糊随拉距消散）：跟手期间每帧传当前
  // 下拉距离 px，复位/回弹时传 0，刷新持住阈值位时传 THRESH。
  const onPull = opts && typeof opts.onPull === 'function' ? opts.onPull : null;
  // 可选启用谓词（match 页用它把下拉刷新限定在 Chat 视图——匹配面板不做下拉刷新）
  const enabled = opts && typeof opts.enabled === 'function' ? opts.enabled : null;
  const ind = document.createElement('div');
  ind.className = 'ptr-indicator';
  ind.innerHTML = '<span class="material-symbols-outlined">refresh</span>';
  container.appendChild(ind);
  const iconEl = ind.querySelector('.material-symbols-outlined');
  // 内容跟手（用户反馈：页面也要随下拉滑动）；未传选择器则仅指示器动
  const getMovers = () => contentSelector ? [...container.querySelectorAll(contentSelector)] : [];
  const setContent = (y, animate) => getMovers().forEach((el) => {
    el.style.transition = animate ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none';
    el.style.transform = y ? 'translateY(' + y + 'px)' : '';
  });
  const THRESH = 70;    // 触发刷新的下拉距离
  const PULL_MAX = 180; // 橡皮筋上限：拉再多也不超过这个位移
  let startY = 0, pulling = false, dist = 0, refreshing = false;
  const setPos = (y, animate) => {
    ind.style.transition = animate ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.3s' : 'none';
    ind.style.transform = `translateX(-50%) translateY(${y}px)`;
  };
  const reset = () => {
    ind.classList.remove('ptr-ready', 'ptr-spinning');
    ind.style.opacity = '0';
    setPos(0, true);
    setContent(0, true);
    if (onPull) onPull(0);
  };
  // 内滚容器守卫：手势起点落在「内部可滚且未到顶」的元素（如匹配页摘要框 .mp-box）时
  // 不启动下拉——container.scrollTop 只代表自己，代表不了内滚容器（复查 high：否则框内
  // 往回滚会同时触发整页下拉，>70px 松手即整页刷新、框内滚动位置归零）。
  const innerScrolled = (t) => {
    for (let el = t instanceof Element ? t : null; el && el !== container; el = el.parentElement) {
      if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return true;
    }
    return false;
  };
  container.addEventListener('touchstart', (e) => {
    if (refreshing) return;
    if (enabled && !enabled()) return; // 当前视图未启用下拉刷新
    if (container.scrollTop <= 0 && !innerScrolled(e.target)) {
      startY = e.touches[0].clientY;
      pulling = true;
      dist = 0;
    }
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    // 横滑切换进行中（square 左右切 tab / 主页三视图）：下拉手势让位，避免双写 transform
    if (container.dataset.horizLock === '1') { dist = 0; ind.classList.remove('ptr-ready'); ind.style.opacity = '0'; return; } // 只藏指示器，内容 transform 归横滑手势管
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || container.scrollTop > 0 || innerScrolled(e.target)) { dist = 0; reset(); return; }
    // 橡皮筋阻尼（用户反馈：下拉太多不好看）：越拉越沉，渐进逼近 PULL_MAX 而
    // 永不超过——手感接近 iOS，也避免 profile 背景被拉伸过头。
    // dy=90→70(刚够触发)、dy=200→122、dy=400→160、dy→∞ 收敛到 180。
    dist = PULL_MAX * (1 - Math.exp(-dy / PULL_MAX));
    ind.style.opacity = String(Math.min(1, dist / 40));
    // 跟手下降 + 随进度旋转一圈
    setPos(dist, false);
    setContent(dist, false);
    if (onPull) onPull(dist);
    if (iconEl) iconEl.style.transform = `rotate(${(dist / THRESH) * 360}deg)`;
    ind.classList.toggle('ptr-ready', dist >= THRESH);
  }, { passive: true });
  const finish = async () => {
    if (!pulling || refreshing) return;
    pulling = false;
    if (dist < THRESH) { reset(); return; }
    refreshing = true;
    ind.classList.add('ptr-spinning');
    // 内容与指示器一起停在阈值位，刷新完成后 reset() 同步回弹
    setPos(THRESH, true);
    setContent(THRESH, true);
    if (onPull) onPull(THRESH);
    const started = Date.now();
    try { await Promise.resolve(onRefresh()); } catch (e) { /* 刷新失败由各自 loader 兜底提示 */ }
    // 动画最少停留 600ms，让用户看得到刷新发生了
    const wait = Math.max(0, 600 - (Date.now() - started));
    setTimeout(() => { refreshing = false; reset(); }, wait);
  };
  container.addEventListener('touchend', finish);
  container.addEventListener('touchcancel', () => { pulling = false; reset(); });
}
window.attachPullToRefresh = attachPullToRefresh;

// 底部弹层下拉关闭（用户反馈：偏好弹出后可向下拉关掉）。
// 抓手/头部区域跟手下拉，超过 110px 松手即关闭，否则弹回。
// onClose 可选：带关闭副作用的弹层（如偏好卡要同步主页摘要框）传自己的关闭函数，
// 否则退回通用 hideOverlay（复查：X/下拉两条路径绕过 closeFilterSheet 会让摘要框显示陈旧）。
function bindSheetDragClose(overlayId, onClose) {
  const overlay = document.getElementById(overlayId);
  const sheet = overlay?.querySelector('.bottom-sheet-transition');
  const header = sheet?.querySelector('header');
  if (!header || header.dataset.dragBound) return;
  header.dataset.dragBound = '1';
  let sy = 0, dy = 0, drag = false;
  header.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; dy = 0; drag = true; }, { passive: true });
  header.addEventListener('touchmove', (e) => {
    if (!drag) return;
    dy = Math.max(0, e.touches[0].clientY - sy);
    sheet.style.transition = 'none';
    sheet.style.transform = 'translateY(' + dy + 'px)';
  }, { passive: true });
  const end = () => {
    if (!drag) return;
    drag = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110) (onClose || (() => window.hideOverlay(overlayId)))();
  };
  header.addEventListener('touchend', end);
  header.addEventListener('touchcancel', end);
}
window.bindSheetDragClose = bindSheetDragClose;

// ── 滑动返回（仅限「左上角有返回按钮」的界面；面板跟手横移）──
// 判定：面板内存在返回箭头（arrow_back / arrow_forward 关闭键）才允许滑动退出。
const SWIPE_BACK_CLOSE = {
  'chat-overlay': () => window.closeChat?.(),
  'friend-hub-overlay': () => window.closeFriendHub?.(),
  'notifications-overlay': () => window.closeNotifications?.(),
  'post-detail-overlay': () => window.closePostDetail?.(),
  'milestone-overlay': () => window.closeOverlay?.('milestone-overlay'),
  // 由弹窗改为全屏页后，也要支持左滑返回
  'modal-energy-purchase': () => window.closeEnergyModal?.(),
  'square-search-overlay': () => window.closeSquareSearch?.(),
};
function topOpenOverlay() {
  const act = [...document.querySelectorAll('.overlay.active')].filter((el) => el.id);
  if (!act.length) return null;
  return act.reduce((a, b) =>
    (parseInt(getComputedStyle(b).zIndex, 10) || 0) >= (parseInt(getComputedStyle(a).zIndex, 10) || 0) ? b : a);
}
// 有返回按钮 = 面板内含 arrow_back（或通知面板的 arrow_forward 关闭键）
function hasBackButton(el) {
  if (!el) return false;
  return [...el.querySelectorAll('.material-symbols-outlined')]
    .some((i) => { const t = (i.textContent || '').trim(); return t === 'arrow_back' || t === 'arrow_forward'; });
}
// 跟手位移的面板节点（overlay 内的主内容容器）
// 跟手位移的节点：一律用 overlay/page 根节点。
// （不能取 firstElementChild——多数弹层的第一个子元素是 fixed 定位的页眉，
// 只位移它会出现「只有页眉在滑、内容不动」；根节点带 transform 后，其内部
// fixed 子元素也会随之移动，页眉与内容整体同步。）
function swipePanel(el) {
  return el;
}
(function bindEdgeSwipeBack() {
  let sx = 0, sy = 0, edge = false, target = null, panel = null, horiz = null, dx = 0;
  // 无条件复位：任何中断路径（多指、touchcancel、重入）都必须能把 inline 样式清干净，
  // 否则弹层会永久停在「偏移+半透明+不可滚动」状态（审计 #1/#16）。
  const resetPanel = (p) => {
    if (!p) return;
    p.style.transition = '';
    p.style.transform = '';
    p.style.opacity = '';
    p.style.touchAction = '';
  };
  document.addEventListener('touchstart', (e) => {
    // 手势进行中又落下第二根手指：忽略这次 touchstart，保留原手势状态
    if (panel && e.touches.length > 1) return;
    resetPanel(panel); // 上一轮若被中断，先清干净
    const t = e.touches[0];
    edge = t.clientX <= 30;
    sx = t.clientX; sy = t.clientY; horiz = null; dx = 0; target = null; panel = null;
    if (!edge) return;
    const ov = topOpenOverlay();
    if (ov && hasBackButton(ov)) { target = ov; panel = swipePanel(ov); }
    else if (!ov && document.getElementById('page-questionnaire')?.classList.contains('active')) {
      target = 'questionnaire'; panel = document.getElementById('page-questionnaire');
    }
  }, { passive: true });
  // 非 passive：手势锁定为水平后 preventDefault 掐断竖向滚动（只水平移动）
  document.addEventListener('touchmove', (e) => {
    if (!edge || !panel) return;
    const t = e.touches[0];
    dx = t.clientX - sx;
    const dy = Math.abs(t.clientY - sy);
    if (horiz === null && (Math.abs(dx) > 10 || dy > 10)) {
      horiz = Math.abs(dx) > dy;
      if (horiz) panel.style.touchAction = 'none';
    }
    if (!horiz) return;
    if (e.cancelable) e.preventDefault();
    if (dx <= 0) return;
    panel.style.transition = 'none';
    // 只位移不淡出（用户反馈：左滑退出过程中不要透明）
    panel.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: false });
  const finish = () => {
    const p = panel, tg = target, wasEdge = edge, wasHoriz = horiz, moved = dx;
    edge = false; panel = null; target = null;
    if (!p) return;
    // 先无条件解除滚动锁（不受 edge/horiz 早退影响）
    p.style.touchAction = '';
    if (!wasEdge || !wasHoriz) { resetPanel(p); return; }
    const W = window.innerWidth;
    if (moved >= 80) {
      p.style.transition = 'transform 0.2s ease-out';
      p.style.transform = 'translateX(' + W + 'px)';
      setTimeout(() => {
        resetPanel(p);
        if (tg === 'questionnaire') { window.showPage('page-home'); window.switchTab('match'); }
        else if (tg) (SWIPE_BACK_CLOSE[tg.id] || (() => window.hideOverlay(tg.id)))();
      }, 200);
    } else {
      p.style.transition = 'transform 0.25s cubic-bezier(0.22,1,0.36,1)';
      p.style.transform = 'translateX(0)';
      setTimeout(() => resetPanel(p), 280);
    }
  };
  document.addEventListener('touchend', finish, { passive: true });
  document.addEventListener('touchcancel', finish, { passive: true });
})();

// 保存按钮忙碌态：禁用 + 文案切到 Saving…，结束恢复（防连点 + 给出真实进行中反馈）
function btnBusy(id, busy) {
  const el = document.getElementById(id);
  if (!el) return;
  if (busy) {
    el.dataset.label = el.textContent;
    el.disabled = true;
    el.textContent = window.getLang && window.getLang() === 'zh' ? '保存中…' : 'Saving…';
  } else {
    el.disabled = false;
    if (el.dataset.label) el.textContent = el.dataset.label;
  }
}
window.btnBusy = btnBusy;

function flatEmptyIcon(icon, tone = 'muted') {
  const box = tone === 'neon' ? 'background:#CCFF00;color:#000' : 'background:#efefef;color:#8a8a8a';
  return `<div class="w-16 h-16 mx-auto mb-6 rounded-[18px] flex items-center justify-center" style="${box}">
    <span class="material-symbols-outlined" style="font-size:28px">${icon}</span>
  </div>`;
}
window.flatEmptyIcon = flatEmptyIcon;

// 清洗用户可控 URL 后再插入 HTML 属性（src/href/background）。
// escapeHtml 不转义引号，直接把 avatarUrl/图片 URL 塞进 src="${url}" 会被
// `"` 截断属性注入 onerror（存储型 XSS）；此函数：①拦截 javascript:/vbscript:/
// file: 及非图片 data: 等可执行 scheme，②转义属性破坏字符，使其在双/单引号属性中都安全。
function safeUrl(u) {
  if (u == null) return '';
  const s = String(u).trim();
  if (!s) return '';
  // 只允许安全 scheme：http(s)、相对 / 协议相对路径、图片 data:；其余一律拒绝。
  // 剥离浏览器会忽略的控制字符（如 "java\tscript:"）再判 scheme，防绕过。
  const stripped = s.replace(/[\u0000-\u0020]/g, '');
  if (/^(?:javascript|vbscript|file|blob):/i.test(stripped)) return '';
  if (/^data:/i.test(stripped) && !/^data:image\//i.test(stripped)) return '';
  return s.replace(/[&<>"'`]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]
  ));
}
window.safeUrl = safeUrl;

// 清洗用户 URL 后再嵌入 CSS url(...)（style 属性或 CSSOM background-image）。
// 此处 HTML 实体转义无用（CSS 上下文不解实体），改为剥离能突破 url() 的字符：
// 引号 / 括号 / 反斜杠 / 尖括号 / 空白换行，从而无法闭合 url() 注入额外声明。
function safeCssUrl(u) {
  if (u == null) return '';
  const s = String(u).trim();
  if (!s) return '';
  const stripped = s.replace(/[\u0000-\u0020]/g, '');
  if (/^(?:javascript|vbscript|file|blob):/i.test(stripped)) return '';
  if (/^data:/i.test(stripped) && !/^data:image\//i.test(stripped)) return '';
  return s.replace(/["'()\\<>]/g, '').replace(/[\u0000-\u0020]+/g, '');
}
window.safeCssUrl = safeCssUrl;

function readFileAsDataUrl(file, cb) {
  const r = new FileReader();
  r.onload = e => cb(e.target.result);
  r.readAsDataURL(file);
}
window.readFileAsDataUrl = readFileAsDataUrl;

// 验证码发送按钮的重发倒计时：期间禁用并显示「Ns」（语言中立，不经词典），
// 归零后恢复 idleLabel——词典观察器会按当前语言重新翻译该文案。
function codeCooldown(btn, seconds, idleLabel) {
  if (!btn) return;
  if (btn.__cdTimer) clearInterval(btn.__cdTimer);
  let left = seconds;
  btn.disabled = true;
  btn.textContent = left + 's';
  btn.__cdTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(btn.__cdTimer);
      btn.__cdTimer = null;
      btn.disabled = false;
      btn.textContent = idleLabel;
      return;
    }
    btn.textContent = left + 's';
  }, 1000);
}
window.codeCooldown = codeCooldown;

// ── 复制到剪贴板（带兜底）────────────────────────────────────
// navigator.clipboard 只在安全上下文存在：生产 https 没问题，但用手机连
// 局域网 IP 自测时（http://192.168.x.x）它是 undefined——不兜底就会以为功能坏了。
// iOS Safari 的 execCommand 兜底还必须用 readOnly+contentEditable+setSelectionRange，
// 直接 el.select() 在 iOS 上不生效。
// ⚠️ 必须在用户手势的同步栈内调用（iOS 要求），调用前不要 await 任何东西。
async function copyText(text) {
  const str = String(text ?? '');
  if (!str) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch (e) { /* 落到下面的兜底 */ }
  try {
    const el = document.createElement('textarea');
    el.value = str;
    el.readOnly = true;          // 防止 iOS 弹出软键盘
    el.contentEditable = 'true'; // iOS 需要它才肯让选区生效
    el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.setSelectionRange(0, str.length);
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch (e) {
    return false;
  }
}
window.copyText = copyText;
