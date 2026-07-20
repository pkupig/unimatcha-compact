import { S } from '../state.js';

// ========================================
// 扫码加好友（Add Friend）
// 顶栏左上角按钮 → 弹窗：我的二维码 / 扫一扫(摄像头) / 手输码兜底。
// 加成功 = 在两人之间建一条已确认朋友 Match → 直接进聊天。
// ========================================

let afScanner = null;
let afConnecting = false;

function openFriendHub() {
  S.friendHubDirect = false; // 经列表进入：返回键先回列表再关闭
  window.openOverlay('friend-hub-overlay');
  const inp = document.getElementById('friend-search-input');
  if (inp) inp.value = '';
  const results = document.getElementById('friend-search-results');
  if (results) results.innerHTML = '';
  friendHubShow('menu'); // 本轮反馈1：先显示功能列表
}
window.openFriendHub = openFriendHub;

// 在 hub 内的功能列表 ↔ 各功能卡片之间切换
function friendHubShow(view) {
  S.friendHubView = view;
  const panels = { graph: 'friend-hub-panel-graph', search: 'friend-hub-panel-search', qr: 'friend-hub-panel-qr' };
  const titles = { menu: 'Chats', graph: 'Relationship Network', search: 'Search chats', qr: 'Add by QR' };
  const menu = document.getElementById('friend-hub-menu');
  if (menu) menu.classList.toggle('hidden', view !== 'menu');
  Object.keys(panels).forEach((k) => {
    const el = document.getElementById(panels[k]);
    if (el) el.classList.toggle('hidden', view !== k);
  });
  const title = document.getElementById('friend-hub-title');
  if (title) title.textContent = titles[view] || 'Friends';
  if (view !== 'qr') stopAfScan();
  if (view === 'graph') loadFriendGraph();
  if (view === 'qr') { switchAddFriendView('qr'); renderMyQR(); }
  if (view === 'search') {
    const i = document.getElementById('friend-search-input');
    if (i) { i.value = ''; setTimeout(() => i.focus(), 50); }
    // 进入即列出全部会话；会话未加载则先拉一次
    if (!(S.sessions && S.sessions.length) && window.loadSessions) {
      Promise.resolve(window.loadSessions()).then(() => runFriendSearch(''));
    } else {
      runFriendSearch('');
    }
  }
}
window.friendHubShow = friendHubShow;

// 顶部返回 = 一步关闭回聊天（本轮反馈：返回逻辑）。
// 入口已统一为加号小卡直达各面板，旧「功能列表」中间页从 UI 不可达，
// 返回不再经过它，避免「点返回却弹出另一个菜单」的困惑。
function friendHubBack() {
  closeFriendHub();
}
window.friendHubBack = friendHubBack;
// 兼容旧入口名（顶栏按钮、扫码成功后关闭等仍可调用）
function openAddFriend() { openFriendHub(); }
window.openAddFriend = openAddFriend;

// 直接进入指定功能面板（本轮反馈7：加号小卡菜单点选后跳过 menu 列表）
function openFriendHubAt(view) {
  S.friendHubDirect = true; // 返回键直接关闭，不回中间列表
  window.openOverlay('friend-hub-overlay');
  const inp = document.getElementById('friend-search-input');
  if (inp) inp.value = '';
  const results = document.getElementById('friend-search-results');
  if (results) results.innerHTML = '';
  friendHubShow(view);
}
window.openFriendHubAt = openFriendHubAt;

function closeFriendHub() {
  stopAfScan();
  window.closeOverlay('friend-hub-overlay');
}
window.closeFriendHub = closeFriendHub;
function closeAddFriend() { closeFriendHub(); }
window.closeAddFriend = closeAddFriend;

function switchAddFriendView(view) {
  const isScan = view === 'scan';
  const base = 'af-seg flex-1 py-2 rounded-[10px] font-headline text-xs font-bold tracking-wider transition-colors ';
  document.getElementById('af-view-qr')?.classList.toggle('hidden', isScan);
  document.getElementById('af-view-scan')?.classList.toggle('hidden', !isScan);
  const segQr = document.getElementById('af-seg-qr');
  const segScan = document.getElementById('af-seg-scan');
  if (segQr) segQr.className = base + (!isScan ? 'bg-neon text-black' : 'text-on-surface');
  if (segScan) segScan.className = base + (isScan ? 'bg-neon text-black' : 'text-on-surface');
  if (isScan) startAfScan(); else stopAfScan();
}
window.switchAddFriendView = switchAddFriendView;

async function renderMyQR() {
  const box = document.getElementById('addfriend-qr');
  const codeEl = document.getElementById('addfriend-mycode');
  if (!box) return;
  box.innerHTML = '';
  try {
    const res = await window.api('/users/me/connect-code');
    const code = (res?.data || res || {}).connectCode;
    if (codeEl) codeEl.textContent = code || '—';
    if (code && window.QRCode) {
      // eslint-disable-next-line no-new
      new window.QRCode(box, { text: code, width: 176, height: 176, colorDark: '#000000', colorLight: '#ffffff' });
    } else if (!window.QRCode) {
      box.innerHTML = '<span class="material-symbols-outlined text-outline" style="font-size:48px">qr_code_2</span>';
    }
  } catch (e) {
    if (codeEl) codeEl.textContent = 'unavailable';
    window.toast && window.toast('Failed to load your code');
  }
}

async function startAfScan() {
  const el = document.getElementById('addfriend-reader');
  const errEl = document.getElementById('addfriend-cam-error');
  if (!el) return;
  if (!window.Html5Qrcode) { if (errEl) errEl.classList.remove('hidden'); return; }
  await stopAfScan();
  try {
    afScanner = new window.Html5Qrcode('addfriend-reader');
    await afScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 200 },
      (decoded) => { connectWithCode(decoded); },
      () => {},
    );
    if (errEl) errEl.classList.add('hidden');
  } catch (e) {
    // 无摄像头权限 / 非安全上下文(局域网 http) → 退到手输码
    if (errEl) errEl.classList.remove('hidden');
    afScanner = null;
  }
}

async function stopAfScan() {
  if (afScanner) {
    try { await afScanner.stop(); } catch {}
    try { afScanner.clear(); } catch {}
    afScanner = null;
  }
}

function submitConnectCode() {
  connectWithCode(document.getElementById('addfriend-code-input')?.value);
}
window.submitConnectCode = submitConnectCode;

async function connectWithCode(code) {
  const c = (code || '').trim();
  if (!c || afConnecting) return;
  afConnecting = true;
  try {
    await stopAfScan();
    const res = await window.api('/matching/connect', 'POST', { code: c });
    const env = res?.data || res || {};
    if (!env.matchId) throw new Error(env.message || 'Connect failed');
    window.toast(env.message || 'Connected!');
    closeAddFriend();
    if (window.openConnectionChat) window.openConnectionChat(env.matchId);
  } catch (e) {
    window.toast('Failed: ' + (e?.message || 'try again'));
  } finally {
    afConnecting = false;
  }
}

// ── 关系网图谱（本轮反馈3）：只含我的直接关系，线粗=亲密度 ──
async function loadFriendGraph() {
  const box = document.getElementById('friend-graph');
  if (!box) return;
  box.innerHTML = '<span class="text-outline text-sm">Loading…</span>';
  try {
    const res = await window.api('/relationships/graph');
    box.innerHTML = renderGraphSvg(res?.data || res || {});
  } catch (e) {
    box.innerHTML = '<span class="text-outline text-sm">Couldn\'t load network.</span>';
  }
}
window.loadFriendGraph = loadFriendGraph;

function graphAvatar(node, cx, cy, r) {
  const esc = window.escapeHtml;
  const clip = 'clip-' + String(node.id || 'self').replace(/[^a-zA-Z0-9]/g, '');
  if (node.avatarUrl) {
    return `<clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <image href="${esc(node.avatarUrl)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#000" stroke-width="1.5"/>`;
  }
  const initial = esc((node.nickname || '?').slice(0, 1).toUpperCase());
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ececec" stroke="#000" stroke-width="1.5"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="'Plus Jakarta Sans',sans-serif" font-weight="700" font-size="${(r * 0.8).toFixed(0)}" fill="#1b1b1b">${initial}</text>`;
}

function renderGraphSvg(g) {
  const esc = window.escapeHtml;
  const nodes = (g && g.nodes) || [];
  const edges = (g && g.edges) || [];
  if (!nodes.length) {
    return '<div class="py-12 text-center text-outline text-sm">No connections yet — add a friend below.</div>';
  }
  const cx = 160, cy = 160, R = 112, rSelf = 26, rNode = 20;
  const pos = {};
  const n = nodes.length;
  nodes.forEach((node, i) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos[node.id] = { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
  });
  const lines = edges.map((e) => {
    const p = pos[e.b];
    if (!p) return '';
    const node = nodes.find((x) => x.id === e.b);
    const color = node && node.kind === 'romantic' ? '#FF2EC4' : '#000000';
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${color}" stroke-width="${e.weight}" stroke-linecap="round" opacity="0.7"/>`;
  }).join('');
  const nodeEls = nodes.map((node) => {
    const p = pos[node.id];
    const label = esc((node.nickname || '').slice(0, 10));
    const ty = p.y > cy ? p.y + rNode + 12 : p.y - rNode - 6;
    return `<g style="cursor:pointer" onclick="openConnectionChatFromGraph('${esc(node.id)}')">
      ${graphAvatar(node, p.x, p.y, rNode)}
      <text x="${p.x.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-family="'Be Vietnam Pro',sans-serif" font-size="9" font-weight="600" fill="#1b1b1b">${label}</text>
    </g>`;
  }).join('');
  const selfEl = `<g>${graphAvatar({ id: 'self', nickname: 'You', avatarUrl: (g.self || {}).avatarUrl }, cx, cy, rSelf)}
    <text x="${cx}" y="${cy + rSelf + 12}" text-anchor="middle" font-family="'Be Vietnam Pro',sans-serif" font-size="9" font-weight="700" fill="#000">You</text></g>`;
  return `<svg viewBox="0 0 320 320" width="100%" xmlns="http://www.w3.org/2000/svg">${lines}${nodeEls}${selfEl}</svg>`;
}

// 图谱里点节点 → 用缓存会话的 matchId 打开对话；没有则查看资料
async function openConnectionChatFromGraph(userId) {
  const s = (S.sessions || []).find((x) => {
    const pp = x.partner || {};
    return String(pp.userId || pp.id) === String(userId);
  });
  closeFriendHub();
  if (s && s.matchId) {
    window.openConnectionChat(s.matchId);
  } else if (window.viewPartnerProfile) {
    window.viewPartnerProfile(userId);
  }
}
window.openConnectionChatFromGraph = openConnectionChatFromGraph;

// ── 搜索现有会话（本轮反馈5a）：在已有好友/对话里搜，点了直接打开对话，不再加新好友。
//    加新好友只留在「Add by QR」面板。
let friendSearchTimer = null;
function onFriendSearchInput() {
  clearTimeout(friendSearchTimer);
  const q = document.getElementById('friend-search-input')?.value || '';
  friendSearchTimer = setTimeout(() => runFriendSearch(q), 120);
}
window.onFriendSearchInput = onFriendSearchInput;

function runFriendSearch(q) {
  const box = document.getElementById('friend-search-results');
  if (!box) return;
  const term = (q || '').trim().toLowerCase();
  const sessions = (S.sessions || []).filter((s) => {
    const p = s.partner || {};
    const hay = [p.nickname, p.name, p.note, p.school, s.lastMessage].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(term);
  });
  box.innerHTML = renderChatSearchResults(sessions);
}
window.runFriendSearch = runFriendSearch;

function renderChatSearchResults(sessions) {
  const esc = window.escapeHtml;
  if (!sessions.length) return '<p class="text-[11px] text-outline italic">No conversations found.</p>';
  return sessions.map((s) => {
    const p = s.partner || {};
    const name = p.note || p.nickname || p.name || 'Partner';
    const sub = window.lastMsgText(s.lastMessage) || (p.school || '');
    const av = p.avatarUrl || p.avatar || '';
    return `<button onclick="openChatFromSearch('${esc(String(s.matchId))}')" class="w-full flex items-center gap-3 py-2 text-left active:opacity-70">
      <div class="w-9 h-9 rounded-full overflow-hidden bg-surface-container shrink-0 flex items-center justify-center">${av ? `<img src="${window.safeUrl(av)}" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-outline" style="font-size:18px">person</span>'}</div>
      <div class="min-w-0 flex-1"><p class="text-sm font-bold text-on-surface truncate">${esc(name)}</p><p class="text-[10px] text-outline truncate">${esc(sub)}</p></div>
      <span class="material-symbols-outlined text-outline shrink-0">chevron_right</span>
    </button>`;
  }).join('');
}

async function openChatFromSearch(matchId) {
  closeFriendHub();
  if (window.openConnectionChat) window.openConnectionChat(matchId);
  else if (window.openSessionById) window.openSessionById(matchId);
}
window.openChatFromSearch = openChatFromSearch;
