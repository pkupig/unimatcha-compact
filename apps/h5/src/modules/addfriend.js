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
  // search 面板已不只是搜会话（还含找同学 + 可能认识的人），标题相应改名
  const titles = { menu: 'Chats', graph: 'Relationship Network', search: 'Search & discover', qr: 'Add by QR' };
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
  const base = 'af-seg flex-1 py-2 rounded-full font-headline text-xs font-bold tracking-wider transition-colors ';
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
      <text x="${p.x.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-family="'Plus Jakarta Sans',sans-serif" font-size="9" font-weight="600" fill="#1b1b1b">${label}</text>
    </g>`;
  }).join('');
  const selfEl = `<g>${graphAvatar({ id: 'self', nickname: 'You', avatarUrl: (g.self || {}).avatarUrl }, cx, cy, rSelf)}
    <text x="${cx}" y="${cy + rSelf + 12}" text-anchor="middle" font-family="'Plus Jakarta Sans',sans-serif" font-size="9" font-weight="700" fill="#000">You</text></g>`;
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
// 全局搜人的竞态令牌：慢的旧请求回来时不能覆盖新结果
let peopleSearchSeq = 0;

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
    // lastMessage 是后端 Message 对象——直接拼会变成 "[object Object]"（按消息内容
    // 搜索失效、搜 "object" 反而全命中），必须经 lastMsgText 提取文本
    const hay = [p.nickname, p.name, p.note, p.school, window.lastMsgText(s.lastMessage)].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(term);
  });

  // 空关键词 = 进入面板的默认态：上面列全部会话，下面挂「可能认识的人」。
  // 有关键词 = 上面是命中的会话，下面异步补全平台内搜到的同学。
  box.innerHTML = `
    <div id="friend-search-local">${renderChatSearchResults(sessions, !!term)}</div>
    <div id="friend-search-remote" class="mt-4"></div>`;

  const seq = ++peopleSearchSeq;
  if (!term) {
    loadSuggestions(seq);
  } else {
    searchPeople(term, seq);
  }
}
window.runFriendSearch = runFriendSearch;

// ── 找同学：GET /discovery/users ──────────────────────────────────
async function searchPeople(term, seq) {
  const box = document.getElementById('friend-search-remote');
  if (!box) return;
  box.innerHTML = sectionShell('FIND PEOPLE', `<p class="text-[11px] text-outline italic px-1 py-2">Searching…</p>`);
  try {
    const res = unwrapEnv(await window.api(`/discovery/users?q=${encodeURIComponent(term)}&limit=15`));
    if (seq !== peopleSearchSeq) return; // 已有更新的一次搜索
    const users = res.users || [];
    box.innerHTML = sectionShell(
      'FIND PEOPLE',
      users.length
        ? users.map((u) => window.userResultRow(u)).join('')
        : `<p class="text-[11px] text-outline italic px-1 py-2">No one found. Try a nickname, school or major.</p>`,
    );
  } catch (e) {
    if (seq !== peopleSearchSeq) return;
    box.innerHTML = sectionShell('FIND PEOPLE', `<p class="text-[11px] text-outline italic px-1 py-2">Search failed. Try again.</p>`);
  }
}

// ── 猜你认识：GET /discovery/suggestions ─────────────────────────
// 未开启 discoverable 时后端返回 enabled:false，这里出引导而不是空列表——
// 否则用户只会看到"没有推荐"，永远不知道功能是被自己的隐私开关关着的。
async function loadSuggestions(seq) {
  const box = document.getElementById('friend-search-remote');
  if (!box) return;
  try {
    const res = unwrapEnv(await window.api('/discovery/suggestions?limit=8'));
    if (seq !== peopleSearchSeq) return;
    if (res.enabled === false) {
      box.innerHTML = sectionShell(
        'PEOPLE YOU MAY KNOW',
        `<div class="px-1 py-2">
           <p class="text-[11px] text-outline leading-relaxed">Turn on discovery to see classmates you may know. Others only see you if you turn it on too.</p>
           <button onclick="window.closeFriendHub();window.openSettings&&window.openSettings();" class="mt-2 font-headline text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-neon pb-0.5">Open settings</button>
         </div>`,
      );
      return;
    }
    const items = res.items || [];
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML = sectionShell(
      'PEOPLE YOU MAY KNOW',
      items.map((u) => window.userResultRow(u, { dismissible: true })).join(''),
    );
  } catch (e) {
    if (seq !== peopleSearchSeq) return;
    box.innerHTML = ''; // 推荐失败静默：它是锦上添花，不该在搜索面板里报错
  }
}

function sectionShell(label, inner) {
  return `<div class="font-headline text-[10px] font-bold tracking-[0.2em] text-outline mb-1">${label}</div>${inner}`;
}

function unwrapEnv(d) { return (d && (d.data || d)) || {}; }

// ── 加为好友 / 忽略推荐 ──────────────────────────────────────────
async function connectToUser(userId, btn) {
  if (!userId) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const res = unwrapEnv(await window.api('/matching/connect-user', 'POST', { userId }));
    const matchId = res.matchId || res.match?.id;
    window.toast?.('Added');
    if (matchId) {
      closeFriendHub();
      if (window.openConnectionChat) window.openConnectionChat(matchId);
    } else {
      // 没拿到 matchId 也别把按钮留在 loading 态
      if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
    }
  } catch (e) {
    window.toast?.(e?.message || 'Failed to add');
    if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
  }
}
window.connectToUser = connectToUser;

async function dismissSuggestion(userId, el) {
  if (!userId) return;
  // 就地移除：忽略是明确的负反馈，等接口回来再消失会让人觉得"没点上"
  const row = el?.closest?.('[data-user-row]');
  if (row) row.remove();
  try {
    await window.api(`/discovery/suggestions/${encodeURIComponent(userId)}/dismiss`, 'POST');
  } catch (e) { /* 忽略失败不回滚：下次刷新自然会再出现 */ }
}
window.dismissSuggestion = dismissSuggestion;

/**
 * 一行"人"的通用组件：搜索结果与「猜你认识」共用。
 * opts.dismissible → 右侧带 ✕ 忽略；opts.compact → 广场搜索里的紧凑版。
 * 用户内容（昵称/学校/专业）一律标 data-no-i18n，否则会被全局词典观察器误翻。
 */
function userResultRow(u, opts = {}) {
  const esc = window.escapeHtml;
  const id = esc(String(u.id || ''));
  const name = u.nickname || 'Student';
  const av = u.avatarUrl || '';
  // 副行：优先展示推荐原因（更有说服力），没有原因时退回学校/专业
  const reasonText = (u.reasons || []).map(reasonLabel).filter(Boolean).join(' · ');
  const meta = [u.school, u.major].filter(Boolean).map((x) => window.metaLabel(x)).join(' · ');
  const sub = reasonText || meta || u.tagline || '';

  // 已经是好友/恋人的人不出「Add」按钮，出「Chat」——对已认识的人还显示"添加"很怪
  const rel = u.relationship || 'none';
  const action = rel === 'none'
    ? `<button onclick="event.stopPropagation();connectToUser('${id}', this)" class="shrink-0 px-3 py-1.5 rounded-full bg-neon text-black font-headline text-[10px] font-bold tracking-widest active:scale-95 transition-transform">Add</button>`
    : `<span class="shrink-0 text-[10px] font-headline font-bold tracking-widest text-outline">${
        rel === 'pending' ? 'PENDING' : rel === 'romantic' ? 'PARTNER' : 'FRIEND'
      }</span>`;

  const dismiss = opts.dismissible
    ? `<button onclick="event.stopPropagation();dismissSuggestion('${id}', this)" title="Not interested" class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-outline active:scale-90"><span class="material-symbols-outlined" style="font-size:16px">close</span></button>`
    : '';

  const avatar = av
    ? `<img src="${window.safeUrl(av)}" class="w-full h-full object-cover">`
    : '<span class="material-symbols-outlined text-outline" style="font-size:18px">person</span>';

  return `<div data-user-row class="w-full flex items-center gap-3 ${opts.compact ? 'px-4 py-2.5' : 'py-2'} text-left">
    <button onclick="window.viewPartnerProfile&&window.viewPartnerProfile('${id}')" class="flex items-center gap-3 min-w-0 flex-1 text-left active:opacity-70">
      <div class="w-9 h-9 rounded-full overflow-hidden bg-surface-container shrink-0 flex items-center justify-center">${avatar}</div>
      <div class="min-w-0 flex-1" data-no-i18n>
        <p class="text-sm font-bold text-on-surface truncate">${esc(name)}</p>
        ${sub ? `<p class="text-[10px] text-outline truncate">${esc(sub)}</p>` : ''}
      </div>
    </button>
    ${action}
    ${dismiss}
  </div>`;
}
window.userResultRow = userResultRow;

// 推荐原因码 → 展示文案。后端只下发 { code, count, value }，
// 文案在前端出，这样中英切换不需要后端参与。
function reasonLabel(r) {
  if (!r || !r.code) return '';
  // 语言取 i18n 的 getLang（读 localStorage.cl_lang）——不能看 documentElement.lang，
  // 本项目切换语言时并不写 html[lang]，那样判断恒为 false，中文态会漏译成英文。
  const zh = (window.getLang ? window.getLang() : localStorage.getItem('cl_lang')) === 'zh';
  const n = r.count || 0;
  const v = r.value ? window.metaLabel(r.value) : '';
  switch (r.code) {
    case 'mutualFriends': return zh ? `${n} 位共同好友` : `${n} mutual friend${n === 1 ? '' : 's'}`;
    case 'sameMajor':     return zh ? `同为${v}` : `Also studies ${v}`;
    case 'sameGrade':     return zh ? `同${v}` : `Same year · ${v}`;
    case 'sameSchool':    return zh ? `同校` : `Same school`;
    case 'sharedInterests': return zh ? `${n} 个共同兴趣` : `${n} shared interest${n === 1 ? '' : 's'}`;
    case 'coEngagement':  return zh ? `喜欢相似的帖子` : `Likes similar posts`;
    default: return '';
  }
}

function renderChatSearchResults(sessions, isSearching) {
  const esc = window.escapeHtml;
  if (!sessions.length) {
    // 有关键词却没命中会话是正常的（人可能在下面的「找同学」里），不该显得像出错
    return isSearching
      ? '<p class="text-[11px] text-outline italic px-1 pb-1">No conversations matched.</p>'
      : '<p class="text-[11px] text-outline italic px-1 pb-1">No conversations yet.</p>';
  }
  return sessions.map((s) => {
    const p = s.partner || {};
    const name = p.note || p.nickname || p.name || 'Partner';
    const sub = window.lastMsgText(s.lastMessage) || window.metaLabel(p.school || '');
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
