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
    headers
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
  // a paid enhanced match they never selected (only openMatchSettings rehydrates these).
  S.energy = { totalEnergy: 0, usedEnergy: 0, availableEnergy: 0 };
  S.enhanced = {
    romantic: { enabled: false, cost: 3 },
    friend: { enabled: false, cells: 1 },
  };
  S.matchBasis = 'both';
  S.matchExtraInfo = '';
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
  else if (tab === 'square') window.loadSquareTab();
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
    back.onclick = (e) => { if (e.target === back) done(false); };
    document.body.appendChild(back);
  });
}
window.confirmCard = confirmCard;

function promptCard({ title = 'Enter a value', label = '', placeholder = '', value = '', confirmLabel = 'Save', cancelLabel = 'Cancel', multiline = false } = {}) {
  return new Promise((resolve) => {
    const esc = window.escapeHtml || ((s) => s);
    const back = appCardBackdrop();
    const fieldCls = 'w-full bg-transparent border-0 border-b border-outline focus:border-primary focus:border-b-2 focus:ring-0 focus:outline-none py-2 text-sm font-body';
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
function attachPullToRefresh(container, onRefresh, contentSelector) {
  if (!container || container.dataset.ptrBound) return;
  container.dataset.ptrBound = '1';
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
  const THRESH = 70; // 触发刷新的下拉距离（下拉距离不设上限，阻尼跟手）
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
  };
  container.addEventListener('touchstart', (e) => {
    if (refreshing) return;
    if (container.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      pulling = true;
      dist = 0;
    }
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || container.scrollTop > 0) { dist = 0; reset(); return; }
    dist = dy * 0.5; // 阻尼，不设上限（用户反馈：拉多少都行）
    ind.style.opacity = String(Math.min(1, dist / 40));
    // 跟手下降 + 随进度旋转一圈
    setPos(dist, false);
    setContent(dist, false);
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
