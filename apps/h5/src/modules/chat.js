import { S } from '../state.js';

// ========================================
// CHAT
// ========================================
const CHAT_PAGE_SIZE = 50;
const CHAT_RENDER_CHUNK = 30;

// ========================================
// CHAT SESSION LIST (§6.6 — Chat 主视图列表层)
// ========================================
// Mode badge (角标) for a session row. romantic -> auto_awesome 图标, friend -> group 图标;
// the label distinguishes "候选" (temp) from the confirmed relationship.
function sessionModeBadge(mode, sessionType) {
  const friend = mode === 'friend';
  const icon = friend ? 'group' : 'auto_awesome';
  let label;
  if (sessionType === 'temp') label = friend ? 'Friend Candidate' : 'Partner Candidate';
  else label = friend ? 'Friend' : 'Partner';
  // 朋友/恋人统一荧光绿点缀，靠图标+文字区分（不再用颜色区分模式）。
  const tint = friend ? 'text-on-surface-variant' : 'text-neon';
  return `<span class="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest ${tint}">
      <span class="material-symbols-outlined" style="font-size:12px;line-height:1">${icon}</span>${window.escapeHtml(label)}</span>`;
}

// Round remainingMs up to whole hours for the "剩余Xh" badge. <1h shows minutes.
function formatRemainingShort(ms) {
  if (ms <= 0) return 'Expiring';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m left`;
  return `${Math.ceil(mins / 60)}h left`;
}

// Small round avatar for a session row, with an initial-letter fallback (reuses
// the existing .chat-avatar styling).
function sessionAvatarHtml(partner, cls = 'chat-avatar') {
  const url = partner?.avatarUrl || partner?.avatar || '';
  if (url) return `<img src="${window.safeUrl(url)}" alt="" loading="lazy" class="${cls}"/>`;
  const name = partner?.nickname || partner?.name || 'P';
  const initial = String(name).trim().charAt(0).toUpperCase() || '·';
  return `<div class="${cls} chat-avatar--fallback" aria-hidden="true" data-no-i18n>${window.escapeHtml(initial)}</div>`;
}

// A single session row. data-matchid lets the local countdown tick update just
// the badge without re-rendering the whole list.
// lastMessage 后端是 Message 对象（{content,imageUrl,...}），取其文本，避免显示 [object Object]
function lastMsgText(lm) {
  if (!lm) return '';
  if (typeof lm === 'string') return lm;
  if (lm.content) return lm.content;
  if (lm.imageUrl) return '[Photo]';
  return '';
}
window.lastMsgText = lastMsgText;

function sessionRowHtml(s) {
  const partner = s.partner || {};
  // 昵称为主名；备注作为名字后的小标签（本轮反馈5）
  const name = partner.nickname || partner.name || 'Partner';
  const zh = (window.getLang?.() === 'zh');
  // 用户内容（昵称/备注/消息预览）标 data-no-i18n 防全局词典误翻；
  // 预览里的 UI 词（[Photo]/开场提示）改为按语言直出
  const lastRaw = lastMsgText(s.lastMessage);
  const last = lastRaw === '[Photo]' ? (zh ? '[图片]' : '[Photo]') : lastRaw;
  const lastTrunc = last.length > 28 ? last.slice(0, 28) + '…' : last;
  const lastAt = s.lastMessage?.createdAt ? window.formatPostTime(s.lastMessage.createdAt) : '';
  const unread = Number(s.unreadCount) || 0;
  const temp = s.sessionType === 'temp';
  const expired = temp && Number(s.remainingMs) <= 0;
  let badge = '';
  if (temp) {
    const ms = Number(s.remainingMs) || 0;
    // Near-zero (<1h) turns neon-pink/red; expired greys out.
    const near = ms > 0 && ms < 3600000;
    const cls = expired
      ? 'bg-surface-container text-outline'
      : near
        ? 'bg-neon-pink/15 text-neon-pink'
        : 'bg-neon/15 text-on-surface';
    badge = `<span class="session-countdown text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-[10px] ${cls}"
        data-remaining="${ms}">${window.escapeHtml(formatRemainingShort(ms))}</span>`;
  }
  const dot = unread > 0
    ? `<span class="w-2 h-2 rounded-full bg-neon-pink flex-shrink-0"></span>`
    : '';
  // 微信式行（用户反馈）：去卡片底/描边/圆角；分隔线画在文字列上（.session-row 的
  // ::after 从头像右侧起笔），不再延伸到头像下方；临时会话带淡荧光绿底，
  // 与退款横幅同色，一眼区分且不需要分组标题。
  return `<button type="button"
      class="session-row${temp ? ' session-row--temp' : ''} w-full flex items-center text-left active:opacity-70 transition-opacity ${expired ? 'opacity-50' : ''}"
      data-matchid="${attrEscape(s.matchId)}" onclick="openSessionById('${attrEscape(s.matchId)}')">
      ${sessionAvatarHtml(partner, 'chat-avatar chat-avatar--lg')}
      <div class="flex-grow min-w-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="font-headline font-bold text-[15px] text-on-surface truncate" data-no-i18n>${window.escapeHtml(name)}</span>
          ${partner.note ? `<span class="shrink-0 px-1.5 py-0.5 rounded-[10px] bg-surface-container text-[10px] font-medium text-on-surface-variant truncate max-w-[45%]" data-no-i18n>${window.escapeHtml(partner.note)}</span>` : ''}
        </div>
        <p class="text-xs text-on-surface-variant truncate mt-1" data-no-i18n>${window.escapeHtml(lastTrunc) || `<span class="opacity-50">${zh ? '开始聊天吧…' : 'Start the conversation…'}</span>`}</p>
      </div>
      <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
        ${lastAt ? `<span class="text-[10px] text-outline" data-no-i18n>${window.escapeHtml(lastAt)}</span>` : ''}
        ${badge}
        ${dot}
      </div>
    </button>`;
}

function renderSessions() {
  const sessions = Array.isArray(S.sessions) ? S.sessions : [];
  const tempBox = document.getElementById('chat-sessions-temp');
  const confirmedBox = document.getElementById('chat-sessions-confirmed');
  const tempSection = document.getElementById('chat-sessions-temp-section');
  const confirmedSection = document.getElementById('chat-sessions-confirmed-section');
  const emptyBox = document.getElementById('chat-sessions-empty');
  // D 规则：过期 / 解除 / 拒绝的会话应从列表彻底消失（对话删除），不能显示。
  // 后端 /chat/sessions 正常不返回这些终态，但做客户端兜底过滤，避免后端偶发返回时
  // 把已死会话渲染出来。临时会话再加 remainingMs>0 守卫（剩余<=0 视为已过期）。
  const TERMINAL = new Set(['EXPIRED', 'DISSOLVED', 'REJECTED']);
  const isTerminal = s => TERMINAL.has(String(s.status || '').toUpperCase());
  const temp = sessions.filter(s =>
    s.sessionType === 'temp' && !isTerminal(s) && Number(s.remainingMs) > 0);
  const confirmed = sessions.filter(s => s.sessionType === 'confirmed' && !isTerminal(s));
  // #3：情侣(恋人)会话始终置顶（不再用图标区分模式，靠置顶区分）
  confirmed.sort((a, b) => (b.mode === 'romantic' ? 1 : 0) - (a.mode === 'romantic' ? 1 : 0));
  if (tempBox) tempBox.innerHTML = temp.map(sessionRowHtml).join('');
  if (confirmedBox) confirmedBox.innerHTML = confirmed.map(sessionRowHtml).join('');
  // 两组已合并为一条连续列表（无分组标题），临时组恒在上；空组整段隐藏，
  // 避免留下空白间隙
  if (tempSection) tempSection.classList.toggle('hidden', temp.length === 0);
  if (confirmedSection) confirmedSection.classList.toggle('hidden', confirmed.length === 0);
  if (emptyBox) {
    const empty = temp.length === 0 && confirmed.length === 0;
    emptyBox.classList.toggle('hidden', !empty);
    if (empty) {
      // 平面简约空态（本轮反馈6）：浅灰圆角方块图标 + 一句纯文本提示
      emptyBox.innerHTML = `<div class="flex flex-col items-center text-center pt-24">
          ${window.flatEmptyIcon('forum')}
          <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">No conversations yet</p>
          <p class="font-body text-sm text-on-surface-variant mt-2 max-w-[16rem] leading-relaxed">Match in Romantic or Friend mode — chats appear here once you connect.</p>
        </div>`;
    }
  }
  startSessionCountdown();
}
window.renderSessions = renderSessions;

// Local 1s ticker that decrements the "剩余Xh" badges in place. Stops itself
// when there are no live temp sessions left.
function startSessionCountdown() {
  stopSessionCountdown();
  const tick = () => {
    const els = document.querySelectorAll('#chat-sessions-temp .session-countdown');
    if (!els.length) { stopSessionCountdown(); return; }
    els.forEach(el => {
      let ms = Number(el.dataset.remaining) || 0;
      ms = Math.max(0, ms - 1000);
      el.dataset.remaining = ms;
      el.textContent = formatRemainingShort(ms);
      if (ms <= 0) {
        el.className = 'session-countdown text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-[10px] bg-surface-container text-outline';
        const row = el.closest('.session-row');
        if (row) row.classList.add('opacity-50');
      } else if (ms < 3600000) {
        el.className = 'session-countdown text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-[10px] bg-neon-pink/15 text-neon-pink';
      }
    });
  };
  S.sessionCountdownId = setInterval(tick, 1000);
}
function stopSessionCountdown() {
  if (S.sessionCountdownId) {
    clearInterval(S.sessionCountdownId);
    S.sessionCountdownId = null;
  }
}
window.stopSessionCountdown = stopSessionCountdown;

// Load the full conversation list (temp + confirmed) for the Chat home view.
// Called on switchHomeView('chat') and after confirm / dissolve / expiry.
async function loadSessions() {
  try {
    // limit=100（后端上限）而非默认 50：搜索已收窄成「只搜已有联系人」，
    // 联系人如果没进这个列表就彻底搜不到了——不能让第 51 个联系人凭空消失。
    const data = await window.api('/chat/sessions?mode=all&limit=100');
    const env = data?.data || data || {};
    S.sessions = Array.isArray(env) ? env : env.sessions || [];
  } catch (e) {
    console.warn('loadSessions failed:', e);
    S.sessions = Array.isArray(S.sessions) ? S.sessions : [];
    window.toast('Failed to load conversations');
  }
  renderSessions();
  // §6.6 / §10.4 J 规则：进入 Chat 列表时主动检查是否有未展示的退款通知，
  // 把退款横幅顶到列表上方（通知轮询仅在通知面板打开时运行，故此处兜底）。
  checkRefundOnSessions();
}
window.loadSessions = loadSessions;

// 退款不再在会话列表顶部弹横幅（用户反馈：通知里告知即可）——通知中心本就
// 会收到 energy_refunded，这里只保留一次余额刷新，让能量数字及时对上。
async function checkRefundOnSessions() {
  try {
    window.refreshEnergyBalance?.();
  } catch (e) {
    console.warn('refreshEnergyBalance failed:', e);
  }
}
window.checkRefundOnSessions = checkRefundOnSessions;

// Open a conversation from a list row. Records the session-level metadata that
// drives the in-chat confirm/dissolve header, then hands off to openChat()
// (which already resets per-conversation polling/state, chat.js A9 guards).
function openSession(session) {
  if (!session || !session.matchId) return;
  const partner = session.partner || {};
  S.chatSessionType = session.sessionType || null;
  S.chatMode = session.mode || null;
  S.chatSessionStatus = session.status || null;
  // myConfirmed / partnerConfirmed: prefer explicit flags from the session
  // payload; otherwise infer from status so the header doesn't re-offer the
  // confirm button to someone already in the "confirming" (waiting) state.
  const confirmingStatus = String(session.status || '').toUpperCase().includes('CONFIRMING');
  const explicitMine = session.myConfirmed ?? session.confirmedByMe;
  S.chatMyConfirmed = explicitMine != null ? !!explicitMine : confirmingStatus;
  S.chatPartnerConfirmed = !!(session.partnerConfirmed ?? session.confirmedByPartner);
  // Seed the conversation identity from the list item so openChat() — which
  // normally reads S.matchStatus — has everything it needs for any session.
  S.chatMatchId = session.matchId;
  S.chatPartnerName = partner.nickname || partner.name || 'Partner';
  S.chatPartnerId = partner.userId || partner.id || null;
  S.chatPartnerAvatar = partner.avatarUrl || partner.avatar || '';
  S.chatPartnerSchool = partner.school || '';
  S.chatBackground = session.chatBackground || null; // #7 各自的聊天背景
  openChat({ fromSession: true });
}
window.openSession = openSession;

// onclick shim: rows carry only the matchId, so look the session up by id.
function openSessionById(matchId) {
  const s = (S.sessions || []).find(x => String(x.matchId) === String(matchId));
  if (s) openSession(s);
}
window.openSessionById = openSessionById;

// Render the in-chat header confirm/dissolve controls (§6.6 D rule). Shown only
// for temp sessions; confirmed sessions still get the "删除关系" entry.
function renderChatHeaderActions() {
  const box = document.getElementById('chat-header-actions');
  if (!box) return;
  const type = S.chatSessionType;
  const friend = S.chatMode === 'friend';
  // No session metadata (e.g. legacy openChat from match flow): render nothing.
  if (!type) { box.innerHTML = ''; return; }
  let html = '';
  if (type === 'temp') {
    if (S.chatMyConfirmed) {
      html += `<button type="button" disabled
          class="px-3 py-2 rounded-[10px] border border-outline-variant/40 text-outline font-headline text-[10px] font-bold tracking-widest opacity-60">Waiting for them…</button>`;
    } else {
      const icon = friend ? 'group' : 'auto_awesome';
      const label = friend ? 'Confirm as Friend' : 'Confirm as Partner';
      html += `<button type="button"
          class="inline-flex items-center gap-1 px-3 py-2 rounded-[10px] bg-neon text-black font-headline text-[10px] font-bold tracking-widest active:scale-95 transition-transform"
          onclick="confirmRelationship('${attrEscape(S.chatMatchId)}')"><span class="material-symbols-outlined" style="font-size:14px">${icon}</span>${label}</button>`;
    }
  }
  // 删除关系 (恋人/朋友通用) — present for both temp and confirmed.
  html += `<button type="button" aria-label="Delete Relationship"
      class="p-2 rounded-[10px] text-outline hover:text-neon-pink transition-colors"
      onclick="dissolveRelationship('${attrEscape(S.chatMatchId)}')">
      <span class="material-symbols-outlined text-lg">link_off</span></button>`;
  box.innerHTML = html;
}

// #7 把当前会话的背景图作为模糊背景铺在消息区后面
function applyChatBackground() {
  const el = document.getElementById('chat-bg');
  if (!el) return;
  const url = S.chatBackground;
  if (url) {
    el.style.backgroundImage = `url("${url}")`;
    el.style.display = 'block';
  } else {
    el.style.backgroundImage = '';
    el.style.display = 'none';
  }
}
window.applyChatBackground = applyChatBackground;

// #7 编辑聊天背景（仅已确认对话）：选图 -> 上传 -> PUT /chat/:id/background -> 应用
async function editChatWallpaper() {
  const matchId = S.chatMatchId;
  if (!matchId) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    window.toast('Uploading…');
    try {
      const url = await window.uploadImageFile(f);
      await window.api('/chat/' + matchId + '/background', 'PUT', { imageUrl: url });
      S.chatBackground = url;
      applyChatBackground();
      window.toast('Wallpaper set');
    } catch (e) {
      window.toast('Failed: ' + (e?.message || 'try again'));
    }
  };
  inp.click();
}
window.editChatWallpaper = editChatWallpaper;
window.renderChatHeaderActions = renderChatHeaderActions;

// 防止确认/删除按钮被连点重复 POST（mirror match.js 的 setProposalButtonsDisabled 思路）。
// header 按钮无稳定 id，直接禁用整块 chat-header-actions 内的按钮即可。
let chatActionInFlight = false;
function setChatActionButtonsDisabled(disabled) {
  const box = document.getElementById('chat-header-actions');
  if (!box) return;
  box.querySelectorAll('button').forEach((btn) => { btn.disabled = disabled; });
}

// Confirm becoming partner/friend from inside the conversation (D rule). The
// endpoint auto-routes by Match.mode; on success we read the backend response —
// if the relationship is already final/confirmed we surface its official message
// and flip the confirmed flags, otherwise we fall back to the optimistic
// "waiting" state and refresh the session list + match status.
async function confirmRelationship(matchId) {
  if (!matchId || chatActionInFlight) return;
  chatActionInFlight = true;
  setChatActionButtonsDisabled(true);
  try {
    const res = await window.api(`/matching/${matchId}/confirm-relationship`, 'POST');
    const data = res?.data || res || {};
    const status = String(data.status || '').toUpperCase();
    const finalized = ['CONFIRMED', 'MATCHED', 'RELATIONSHIP', 'FINAL', 'ACTIVE'].includes(status);
    S.chatMyConfirmed = true;
    if (finalized) {
      // 关系已成立：取消「等待对方确认」乐观态，标记双方已确认并展示后端正式文案。
      S.chatPartnerConfirmed = true;
      if (data.status) S.chatSessionStatus = data.status;
    }
    renderChatHeaderActions();
    window.toast(data.message || (finalized ? 'You are connected now' : 'Confirmed. Waiting for them to confirm'));
    await loadSessions();
    // loadSessions 刷新了 S.sessions：用最新会话数据回灌当前打开对话的确认/状态字段，
    // 避免 header 停在乐观态（例如对方此前已确认、关系已成立时应取消「等待对方确认」）。
    syncOpenSessionFromList(matchId);
    // Keep the match-tab status fresh so the candidate card reflects the change.
    window.loadMatchTab?.();
  } catch (e) {
    console.warn('confirmRelationship failed:', e);
    window.toast(e?.message || 'Failed to confirm');
  } finally {
    chatActionInFlight = false;
    // 重渲 header 而非盲目启用：避免把「等待对方确认」这类本应 disabled 的按钮重新启用。
    renderChatHeaderActions();
  }
}
window.confirmRelationship = confirmRelationship;

// 用 S.sessions 中 matchId 对应的最新会话，回灌当前打开对话的状态/确认字段并重渲 header。
// 仅当该对话仍是当前打开对话时生效（避免确认期间用户切走导致串话）。复用 openSession
// 的字段解析逻辑：myConfirmed/partnerConfirmed 优先取显式标记，否则按 status 推断。
function syncOpenSessionFromList(matchId) {
  if (!matchId || String(S.chatMatchId) !== String(matchId)) return;
  const s = (S.sessions || []).find(x => String(x.matchId) === String(matchId));
  if (!s) return;
  S.chatSessionType = s.sessionType || S.chatSessionType;
  S.chatMode = s.mode || S.chatMode;
  S.chatSessionStatus = s.status || S.chatSessionStatus;
  const confirmingStatus = String(s.status || '').toUpperCase().includes('CONFIRMING');
  const explicitMine = s.myConfirmed ?? s.confirmedByMe;
  S.chatMyConfirmed = explicitMine != null ? !!explicitMine : (confirmingStatus || S.chatMyConfirmed);
  S.chatPartnerConfirmed = !!(s.partnerConfirmed ?? s.confirmedByPartner);
  renderChatHeaderActions();
}
window.syncOpenSessionFromList = syncOpenSessionFromList;

// Dissolve a connection (恋人/朋友通用, E rule) with a second confirmation.
// On success the session leaves the list and the chat closes.
async function dissolveRelationship(matchId) {
  if (!matchId || chatActionInFlight) return;
  const ok = await window.confirmCard({
    title: 'Delete this relationship?',
    body: 'They will be notified and neither of you can send messages anymore.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  if (chatActionInFlight) return;
  chatActionInFlight = true;
  setChatActionButtonsDisabled(true);
  try {
    await window.api(`/matching/${matchId}/dissolve`, 'POST', { reason: 'user_dissolved' });
    window.toast('Relationship deleted');
    // Reflect dissolution locally so the composer locks if the chat stays open.
    // Dual-mode: the open conversation's send-ability is driven by the per-session
    // status (S.chatSessionStatus), not the removed top-level S.matchStatus.match.
    if (String(S.chatMatchId) === String(matchId)) {
      S.chatSessionStatus = 'DISSOLVED';
      applyChatComposerState();
    }
    // Drop the row immediately for snappy feedback, close the overlay, then
    // reconcile with the server. (closeChat may also refresh; loadSessions is
    // idempotent so a possible double-fetch is harmless.)
    S.sessions = (S.sessions || []).filter(s => String(s.matchId) !== String(matchId));
    renderSessions();
    closeChat();
    await loadSessions();
    window.loadMatchTab?.();
  } catch (e) {
    console.warn('dissolveRelationship failed:', e);
    window.toast(e?.message || 'Failed to remove connection');
  } finally {
    chatActionInFlight = false;
    // 成功路径已 closeChat()，header 可能已不存在；renderChatHeaderActions 内部已做空判断，
    // 失败时则按当前状态重渲，恢复按钮可点。
    renderChatHeaderActions();
  }
}
window.dissolveRelationship = dissolveRelationship;

// ---- Energy-refund banner (§6.6 / §10.4 J rule) ----
// Notifications of type energy_refunded are surfaced as a dismissible banner at
// the top of the Chat list. Text varies by metadata.refundReason; clicking opens
// the recharge page; arrival refreshes S.energy (re-fetch /energy/balance).
function refundBannerText(meta) {
  const n = Number(meta?.energy) || 0;
  if (meta?.refundReason === 'unconfirmed_48h') {
    return `Boost match unconfirmed after 48h — ${n} energy refunded`;
  }
  // Default: empty_pool (本轮无可配对象)
  return `No match available this round — ${n} energy refunded`;
}

function showRefundBanner(notif) {
  const box = document.getElementById('chat-banner');
  if (!box) return;
  const meta = notif?.metadata || notif?.meta || {};
  box.innerHTML = `<div class="flex items-center gap-3 px-4 py-3 rounded-[10px] bg-neon/15 border border-neon/40 cursor-pointer"
      onclick="openEnergyModal?.()">
      <span class="material-symbols-outlined text-neon">bolt</span>
      <p class="flex-grow text-[12px] font-medium text-on-surface">${window.escapeHtml(refundBannerText(meta))}</p>
      <span class="material-symbols-outlined text-outline text-base"
        onclick="event.stopPropagation();document.getElementById('chat-banner').classList.add('hidden')">close</span>
    </div>`;
  box.classList.remove('hidden');
  // Refund landed -> resync balance so the energy bar + enhance gating are correct.
  refreshEnergyBalance();
}
window.showRefundBanner = showRefundBanner;

// Refresh S.energy from the backend, preferring profile.js's loadEnergyBar()
// (which also re-renders the bar) when it exists, with a direct fetch fallback.
async function refreshEnergyBalance() {
  if (typeof window.loadEnergyBar === 'function') {
    try { await window.loadEnergyBar(); return; } catch (e) { /* fall through */ }
  }
  try {
    const data = await window.api('/energy/balance');
    S.energy = data?.data || data || S.energy;
  } catch (e) {
    console.warn('refreshEnergyBalance failed:', e);
  }
}
window.refreshEnergyBalance = refreshEnergyBalance;

// True when the OPEN conversation can no longer accept new messages (the
// backend rejects sends on dissolved/expired/rejected matches, chat.service.ts).
// Used to gate sending and to disable the composer (A10).
//
// Dual-mode contract: S.matchStatus is bucketed by mode ({romantic, friend}) and
// never carries a top-level .match, so the old `S.matchStatus.match.status` read
// was always undefined. The open chat may also be ANY session (not the active
// mode's current match), so the authoritative source is the per-session status
// captured by openSession() in S.chatSessionStatus. We treat every terminal
// session status as "can't send".
const TERMINAL_CHAT_STATUSES = new Set(['DISSOLVED', 'EXPIRED', 'REJECTED']);
function isChatDissolved() {
  return TERMINAL_CHAT_STATUSES.has(String(S.chatSessionStatus || '').toUpperCase());
}
window.isChatDissolved = isChatDissolved;

async function openChat(opts = {}) {
  // Two entry points (§6.6): from a Chat-list session (openSession seeds the
  // S.chat* fields + matchId up front) or from the match flow (read S.matchStatus).
  const fromSession = opts && opts.fromSession;
  if (!fromSession) {
    // Dual-mode contract: S.matchStatus is bucketed by mode ({romantic, friend}),
    // so read the active mode's bucket — the old top-level S.matchStatus.partner /
    // .match never exist and made this branch always bail with "No active
    // connection" (breaking the partner-profile "Send Message" entry).
    const mode = S.activeMatchMode || 'romantic';
    const bucket = (S.matchStatus && S.matchStatus[mode]) || null;
    const partner = bucket?.partner;
    if (!partner && !bucket?.match) {
      window.toast('No active connection');
      return;
    }
    const m = bucket?.match || {};
    S.chatMatchId = m.id || bucket?.matchId || null;
    S.chatPartnerName = partner?.nickname || partner?.name || 'Partner';
    S.chatPartnerId = partner?.userId || partner?.id || null;
    S.chatPartnerAvatar = partner?.avatarUrl || partner?.avatar || '';
    S.chatPartnerSchool = partner?.school || '';
    // Match-flow open carries no session-list metadata; clear the header
    // confirm/dissolve controls, but seed the per-session status from the
    // bucket's match so the composer gate (isChatDissolved) is accurate.
    S.chatSessionType = null;
    S.chatMode = mode;
    S.chatMyConfirmed = false;
    S.chatPartnerConfirmed = false;
    S.chatSessionStatus = m.status || null;
    S.chatBackground = null;
  }
  const matchId = S.chatMatchId;
  if (!matchId) { window.toast('No active connection'); return; }
  const nameEl = document.getElementById('chat-partner-name');
  if (nameEl) nameEl.textContent = S.chatPartnerName || 'Partner';
  const locEl = document.getElementById('chat-partner-location');
  if (locEl) locEl.textContent = window.metaLabel ? window.metaLabel(S.chatPartnerSchool || '') : (S.chatPartnerSchool || '');
  // 头部头像：复用会话行的渲染（无头像走首字母兜底，不再出现空的破图框）
  const avEl = document.getElementById('chat-partner-avatar');
  if (avEl) {
    avEl.innerHTML = sessionAvatarHtml(
      { avatarUrl: S.chatPartnerAvatar, nickname: S.chatPartnerName },
      'w-9 h-9 rounded-full object-cover',
    );
  }
  // In-chat confirm / dissolve controls (§6.6 D rule).
  renderChatHeaderActions();
  // Switching conversations: stop any in-flight polling from the previous
  // match before resetting state, so a stale poll response cannot leak into
  // the new conversation (A9). chatPollBusy is reset so the next tick runs.
  window.stopChatPolling();
  S.chatPollBusy = false;
  // Reset chat state for a fresh conversation view
  S.chatMessages = [];
  S.chatLastId = null;
  S.chatNextCursor = null;
  S.chatRenderFrom = 0;
  const c = document.getElementById('chat-messages');
  if (c) c.innerHTML = '';
  // Reflect the connection's send-ability in the composer (A10).
  applyChatComposerState();
  applyChatBackground();
  bindChatScrollHandler();
  window.openOverlay('chat-overlay');
  await window.loadChatHistory();
  // History load awaited the network; bail out of the rest if the user
  // switched conversations in the meantime (A9).
  if (S.chatMatchId !== matchId) return;
  window.markChatRead();
  window.startChatPolling();
}
window.openChat = openChat;

// #3a：聊天头部头像点击 → 查看对方公开资料
function openChatPartnerProfile() {
  if (S.chatPartnerId) window.viewPartnerProfile(S.chatPartnerId, S.chatMatchId);
}
window.openChatPartnerProfile = openChatPartnerProfile;

function closeChat() {
  window.stopChatPolling();
  // 清掉会话指针：openChat 的历史加载还在途时用户关掉聊天，await 后的
  // 「S.chatMatchId !== matchId」守卫得以生效——不再重启轮询、不再把
  // 来信静默标记已读；发送路径的 matchId 守卫同理。
  S.chatMatchId = null;
  window.closeOverlay('chat-overlay');
  // Returning to the list: refresh so unread counts / lastMessage / countdowns
  // reflect what happened in the conversation (§6.6). Only when the Chat home
  // view is active so we don't fetch needlessly from the match flow.
  if (S.homeView === 'chat' && document.getElementById('home-chat-view')) {
    loadSessions();
  }
}
window.closeChat = closeChat;

// Enable/disable the composer based on the connection status (A10). When the
// relationship is dissolved the textarea + Send are disabled and a notice is
// shown; otherwise everything is re-enabled.
function applyChatComposerState() {
  const dissolved = isChatDissolved();
  const input = document.getElementById('chat-input');
  const sendBtn = document.querySelector('#chat-overlay button[onclick="sendChatMessage()"]');
  const imgBtn = document.getElementById('chat-image-input');
  const notice = document.getElementById('chat-dissolved-notice');
  if (input) {
    input.disabled = dissolved;
    // 按语言直写占位符：i18n 观察器只翻文本节点不监听属性变更，
    // 这里写英文串会把中文态占位符永久打回英文（bug 修复）
    const zh = (window.getLang?.() === 'zh');
    if (dissolved) input.placeholder = zh ? '关系已解除，无法再发送消息' : 'Relationship ended — you can no longer send messages';
    else input.placeholder = zh ? '输入消息…' : 'Type your response...';
  }
  if (sendBtn) sendBtn.disabled = dissolved;
  if (imgBtn) imgBtn.disabled = dissolved;
  if (notice) notice.classList.toggle('hidden', !dissolved);
}
window.applyChatComposerState = applyChatComposerState;

// Full history load: backend cursor pages oldest -> newest, so walk
// nextCursor until exhausted, then render only the latest chunk.
async function loadChatHistory() {
  const currentMatchId = S.chatMatchId;
  if (!currentMatchId) return;
  try {
    const all = [];
    let cursor = null;
    for (let i = 0; i < 100; i++) {
      // Abort paging if the user switched conversations mid-load (A9/B16):
      // continuing would request/commit pages for the wrong match.
      if (S.chatMatchId !== currentMatchId) return;
      const qs = `limit=${CHAT_PAGE_SIZE}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const data = await window.api(`/chat/${currentMatchId}/messages?${qs}`);
      const env = data?.data || data || {};
      const msgs = Array.isArray(env) ? env : env.messages || [];
      all.push(...msgs);
      cursor = Array.isArray(env) ? null : env.nextCursor || null;
      if (!cursor || !msgs.length) break;
    }
    // Final guard before committing: drop the result if the conversation
    // changed while the last page was in flight (A9/B16).
    if (S.chatMatchId !== currentMatchId) return;
    S.chatNextCursor = cursor;
    S.chatMessages = all;
    S.chatLastId = all.length ? all[all.length - 1].id : null;
    S.chatRenderFrom = Math.max(0, all.length - CHAT_RENDER_CHUNK);
    window.renderChatMessages(true);
  } catch (e) {
    // A11: surface the failure instead of swallowing it silently.
    console.warn('loadChatHistory failed:', e);
    window.toast('Failed to load messages');
  }
}
window.loadChatHistory = loadChatHistory;

function attrEscape(v) {
  return String(v || '').replace(/"/g, '&quot;');
}

// Visual-only avatar next to each bubble (Ivory & Ink design). Falls back to
// an initial letter when no photo is available.
function avatarHtml(mine) {
  const url = mine
    ? (S.currentUser?.profile?.avatarUrl || '')
    : (S.chatPartnerAvatar || '');
  // 对方头像（非自己）可点：弹出小卡片（设置备注 / 编辑聊天背景，本轮反馈2）
  const click = mine ? '' : ' onclick="openChatAvatarMenu(event)" style="cursor:pointer"';
  if (url) {
    return `<img src="${window.safeUrl(url)}" alt="" loading="lazy" class="chat-avatar"${click}/>`;
  }
  const name = mine
    ? (S.currentUser?.profile?.nickname || 'Me')
    : (S.chatPartnerName || 'P');
  const initial = String(name).trim().charAt(0).toUpperCase() || '·';
  return `<div class="chat-avatar chat-avatar--fallback" aria-hidden="true"${click}>${window.escapeHtml(initial)}</div>`;
}

// 点对话内对方头像 → 头像旁弹一个很小的卡片（本轮反馈2）：设置备注 + 编辑聊天背景。
function openChatAvatarMenu(ev) {
  ev.stopPropagation();
  document.querySelectorAll('.chat-avatar-menu').forEach((e) => e.remove());
  const menu = document.createElement('div');
  menu.className = 'chat-avatar-menu fixed z-[130] bg-surface-container-lowest border border-outline-variant/30 rounded-[10px] shadow-2xl py-1 text-sm overflow-hidden';
  menu.style.left = Math.min(ev.clientX, window.innerWidth - 190) + 'px';
  menu.style.top = (ev.clientY + 8) + 'px';
  const confirmed = S.chatSessionType === 'confirmed';
  menu.innerHTML = `
    ${confirmed ? `<button class="w-full text-left px-4 py-2.5 hover:bg-surface-container flex items-center gap-2" data-nudge><span class="material-symbols-outlined text-outline" style="font-size:18px">waving_hand</span>Nudge</button>` : ''}
    <button class="w-full text-left px-4 py-2.5 hover:bg-surface-container flex items-center gap-2" data-note><span class="material-symbols-outlined text-outline" style="font-size:18px">edit_note</span>Set note</button>
    ${confirmed ? `<button class="w-full text-left px-4 py-2.5 hover:bg-surface-container flex items-center gap-2" data-bg><span class="material-symbols-outlined text-outline" style="font-size:18px">wallpaper</span>Chat background</button>` : ''}`;
  menu.querySelector('[data-note]').onclick = () => { menu.remove(); S.viewingProfileId = S.chatPartnerId; window.promptSetNote(); };
  const bgBtn = menu.querySelector('[data-bg]');
  if (bgBtn) bgBtn.onclick = () => { menu.remove(); editChatWallpaper(); };
  const nudgeBtn = menu.querySelector('[data-nudge]');
  if (nudgeBtn) nudgeBtn.onclick = () => { menu.remove(); chatNudge(); };
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function close() { menu.remove(); document.removeEventListener('click', close); }), 10);
}
window.openChatAvatarMenu = openChatAvatarMenu;

// 拍一拍（本轮反馈3）：发一条系统消息，刷新对话即可看到
async function chatNudge() {
  const matchId = S.chatMatchId;
  if (!matchId) return;
  try {
    await window.api('/chat/' + matchId + '/nudge', 'POST', {});
    await window.loadChatHistory();
  } catch (e) {
    window.toast('Failed: ' + (e?.message || 'try again'));
  }
}
window.chatNudge = chatNudge;

// 微信式时间戳：不再每条消息下挂时间，间隔 ≥10 分钟时在流里插一条居中时间条。
// 同日显示 HH:MM，昨天带「昨天」，更早带日期（跟随语言）。
function formatChatStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const zh = (window.getLang?.() === 'zh');
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff <= 0) return hm;
  if (dayDiff === 1) return (zh ? '昨天 ' : 'Yesterday ') + hm;
  const md = zh ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${md} ${hm}`;
}

const CHAT_STAMP_GAP_MS = 10 * 60000;
function timeSepHtml(iso) {
  return `<div class="chat-time-sep" data-no-i18n>${window.escapeHtml(formatChatStamp(iso))}</div>`;
}

function messageHtml(m, myId) {
  const mine = m.senderId === myId;
  const text = m.content || '';
  // 拍一拍系统消息：居中淡色，不作气泡（本轮反馈3）。后端现在用 Message.kind==='nudge' 标记，
  // 仅在缺少 kind 的旧消息上回退到内容子串匹配（后端内容为 "X nudged Y"），避免误伤普通消息。
  const isNudge = (m.kind === 'nudge') || (!m.kind && text.indexOf('nudged') !== -1);
  if (!m.imageUrl && isNudge) {
    return `<div data-id="${attrEscape(m.id)}" data-no-i18n class="w-full text-center text-[11px] text-on-surface-variant py-1.5 italic">${window.escapeHtml(text)}</div>`;
  }
  let body = '';
  if (m.imageUrl) {
    body += `<img src="${window.safeUrl(m.imageUrl)}" alt="Photo" loading="lazy"
      class="chat-image"
      onclick="openChatImage(this.src)"/>`;
  }
  if (text) {
    body += `<div class="chat-bubble ${mine ? 'mine' : ''}" data-no-i18n>${window.escapeHtml(text)}</div>`;
  }
  // 微信式：头像贴每条气泡旁（对方在左、自己在右）；已读回执改为气泡下小字
  // （.chat-read 为回执逻辑依赖，markRowRead/refreshReadReceipts 按它定位）
  const zh = (window.getLang?.() === 'zh');
  const read = mine
    ? `<div class="chat-read"${m.isRead ? ' data-read="1"' : ' style="display:none"'} data-no-i18n>${zh ? '已读' : 'Read'}</div>`
    : '';
  const av = avatarHtml(mine);
  return `<div class="chat-row ${mine ? 'mine' : ''}" data-id="${attrEscape(m.id)}">
    ${mine ? '' : av}
    <div class="chat-col">
      ${body}
      ${read}
    </div>
    ${mine ? av : ''}
  </div>`;
}

// 把消息数组渲染为「时间条 + 气泡」流；prevIso 为上一条已渲染消息的时间（无则视图首条前必插时间条）
function chatStreamHtml(msgs, myId, prevIso) {
  let html = '';
  let prev = prevIso ? new Date(prevIso).getTime() : null;
  for (const m of msgs) {
    const t = new Date(m.createdAt).getTime();
    if (!isNaN(t) && (prev === null || t - prev >= CHAT_STAMP_GAP_MS)) html += timeSepHtml(m.createdAt);
    if (!isNaN(t)) prev = t;
    html += messageHtml(m, myId);
  }
  return html;
}

function renderChatMessages(stickToBottom = true) {
  const c = document.getElementById('chat-messages');
  if (!c) return;
  const myId = S.currentUser?.id;
  c.innerHTML = chatStreamHtml(S.chatMessages.slice(S.chatRenderFrom), myId, null);
  if (stickToBottom) c.scrollTop = c.scrollHeight;
}
window.renderChatMessages = renderChatMessages;

// prevMsg：追加批次之前最后一条已渲染消息（时间条按与它的间隔决定是否插入）
function appendChatMessages(msgs, prevMsg) {
  const c = document.getElementById('chat-messages');
  if (!c) return;
  const myId = S.currentUser?.id;
  c.insertAdjacentHTML('beforeend', chatStreamHtml(msgs, myId, prevMsg?.createdAt || null));
}

// Prepend an earlier chunk when scrolled to top, keeping scroll position.
function loadEarlierChatMessages() {
  if (S.chatLoadingHistory || S.chatRenderFrom <= 0) return;
  const c = document.getElementById('chat-messages');
  if (!c) return;
  S.chatLoadingHistory = true;
  const prevHeight = c.scrollHeight;
  const prevTop = c.scrollTop;
  S.chatRenderFrom = Math.max(0, S.chatRenderFrom - CHAT_RENDER_CHUNK);
  window.renderChatMessages(false);
  c.scrollTop = c.scrollHeight - prevHeight + prevTop;
  S.chatLoadingHistory = false;
}
window.loadEarlierChatMessages = loadEarlierChatMessages;

function bindChatScrollHandler() {
  const c = document.getElementById('chat-messages');
  if (!c || c.dataset.scrollBound) return;
  c.dataset.scrollBound = '1';
  c.addEventListener('scroll', () => {
    if (c.scrollTop <= 10) window.loadEarlierChatMessages();
  });
}

function appendOwnMessage(msg) {
  const prevMsg = S.chatMessages[S.chatMessages.length - 1] || null;
  S.chatMessages.push(msg);
  // 刻意不把轮询游标推进到自己这条（它是全会话最新消息）：否则对方在上次轮询
  // 之后、我发送之前发来的消息会被游标永久跳过。游标留在原地，下次轮询会带回
  // 对方的消息 + 自己这条（已在 S.chatMessages，靠 id 去重不会重复渲染）。
  appendChatMessages([msg], prevMsg);
  const c = document.getElementById('chat-messages');
  if (c) c.scrollTop = c.scrollHeight;
}

// A11: distinguish "relationship dissolved" (backend 403) from generic
// failures so the user gets an accurate reason instead of "Failed to send".
function handleChatSendError(e, fallback) {
  console.warn('chat send failed:', e);
  // 后端只读状态发送被拒返回 "This chat has ended, you cannot send new messages" (chat.service.ts:105)。
  const msg = (e && e.message) || '';
  if (msg.includes('has ended') || msg.includes('cannot send') || msg.includes('no longer')) {
    window.toast('Relationship ended — you can no longer send messages');
    // Sync local status + lock the composer so further attempts are blocked.
    // Dual-mode: lock via the per-session status the composer gate reads.
    S.chatSessionStatus = 'DISSOLVED';
    applyChatComposerState();
  } else {
    window.toast(fallback);
  }
}

// 发送并发守卫：慢网下重复点击/回车不再把同一条消息发两遍（确认/解除早有
// chatActionInFlight 守卫，发送路径此前漏了）
let chatSendInFlight = false;

async function sendChatMessage() {
  if (chatSendInFlight) return;
  const input = document.getElementById('chat-input');
  const text = input?.value?.trim();
  const pending = S.chatPendingFile;
  // A9：入口快照会话 id——图片上传可达数秒，期间切换会话不能把消息发给错误的人；
  // 后续所有请求与渲染都用这个快照，不再重读 S.chatMatchId
  const matchId = S.chatMatchId;
  if ((!text && !pending) || !matchId) return;
  // A10: block sending when the relationship is already known to be dissolved.
  if (isChatDissolved()) {
    window.toast('Relationship ended — you can no longer send messages');
    applyChatComposerState();
    return;
  }
  chatSendInFlight = true;
  // 乐观清空：立即清输入框/图片预览，网络往返期间用户新打的字不会被事后覆盖清掉；
  // 失败时在 catch 里恢复草稿
  if (input) input.value = '';
  if (pending) clearChatPendingImage();
  const stillHere = () => S.chatMatchId === matchId;
  try {
    // #5：先发图片（若有预览），再把文字作为附带说明发出
    if (pending) {
      window.toast('Uploading image…');
      const url = await window.uploadImageFile(pending);
      const d = await window.api(`/chat/${matchId}/messages`, 'POST', { imageUrl: url });
      const m = d?.data || d;
      if (stillHere()) { if (m && m.id) appendOwnMessage(m); else await window.loadChatHistory(); }
    }
    if (text) {
      const d = await window.api(`/chat/${matchId}/messages`, 'POST', { content: text });
      const m = d?.data || d;
      if (stillHere()) { if (m && m.id) appendOwnMessage(m); else await window.loadChatHistory(); }
    }
  } catch (e) {
    // 恢复草稿：仅当用户还在同一会话且没开始打新内容
    if (stillHere()) {
      if (input && !input.value && text) input.value = text;
      if (pending && !S.chatPendingFile) restoreChatPendingImage(pending);
    }
    handleChatSendError(e, 'Failed to send');
  } finally {
    chatSendInFlight = false;
  }
}
window.sendChatMessage = sendChatMessage;

// ---- Image messages (#5：选图后先预览，可加文字再发) ----
function onChatImagePicked(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  S.chatPendingFile = file;
  const prev = document.getElementById('chat-pending-image');
  const thumb = document.getElementById('chat-pending-thumb');
  if (thumb) thumb.src = URL.createObjectURL(file);
  if (prev) prev.classList.remove('hidden');
  document.getElementById('chat-input')?.focus();
}
window.onChatImagePicked = onChatImagePicked;

function clearChatPendingImage() {
  S.chatPendingFile = null;
  const prev = document.getElementById('chat-pending-image');
  const thumb = document.getElementById('chat-pending-thumb');
  if (thumb && thumb.src.startsWith('blob:')) URL.revokeObjectURL(thumb.src);
  if (prev) prev.classList.add('hidden');
}
window.clearChatPendingImage = clearChatPendingImage;

// 发送失败时把待发图片还原回预览（乐观清空的逆操作）
function restoreChatPendingImage(file) {
  if (!file) return;
  S.chatPendingFile = file;
  const prev = document.getElementById('chat-pending-image');
  const thumb = document.getElementById('chat-pending-thumb');
  if (thumb) thumb.src = URL.createObjectURL(file);
  if (prev) prev.classList.remove('hidden');
}

async function sendChatImage(file) {
  const matchId = S.chatMatchId; // A9 快照：上传期间切会话不得发错人
  if (!file || !matchId) return;
  // A10: block sending when the relationship is already known to be dissolved.
  if (isChatDissolved()) {
    window.toast('Relationship ended — you can no longer send messages');
    applyChatComposerState();
    return;
  }
  try {
    window.toast('Uploading image...');
    const url = await window.uploadImageFile(file);
    const data = await window.api(`/chat/${matchId}/messages`, 'POST', { imageUrl: url });
    const msg = data?.data || data;
    if (S.chatMatchId !== matchId) return;
    if (msg && msg.id) appendOwnMessage(msg);
    else window.loadChatHistory();
  } catch (e) {
    handleChatSendError(e, 'Failed to send image');
  }
}
window.sendChatImage = sendChatImage;

function openChatImage(url) {
  const img = document.getElementById('chat-image-viewer-img');
  if (img) img.src = url;
  window.openOverlay('chat-image-viewer');
}
window.openChatImage = openChatImage;

// ---- Read receipts ----
// B19: guard against PUT /read spamming. Skip if a mark-read request for this
// match is already in flight so rapid polls can't fire a burst of calls.
let markReadInFlight = false;
async function markChatRead() {
  if (!S.chatMatchId || markReadInFlight) return;
  const matchId = S.chatMatchId;
  markReadInFlight = true;
  try {
    await window.api(`/chat/${matchId}/messages/read`, 'PUT');
  } catch (e) {
    // A11: read-receipt sync is non-critical, but log for diagnosis.
    console.warn('markChatRead failed:', e);
  } finally {
    markReadInFlight = false;
  }
}
window.markChatRead = markChatRead;

function markRowRead(id) {
  const el = document.querySelector(`#chat-messages .chat-row[data-id="${id}"] .chat-read`);
  if (el && !el.dataset.read) {
    el.dataset.read = '1';
    el.style.display = '';
  }
}

// Re-fetch the tail of the conversation to pick up partner read receipts.
async function refreshReadReceipts() {
  const myId = S.currentUser?.id;
  if (!myId || !S.chatMatchId) return;
  const idx = S.chatMessages.findIndex(m => m.senderId === myId && !m.isRead);
  if (idx === -1) return;
  try {
    const cursorId = idx > 0 ? S.chatMessages[idx - 1].id : null;
    const qs = `limit=100` + (cursorId ? `&cursor=${encodeURIComponent(cursorId)}` : '');
    const data = await window.api(`/chat/${S.chatMatchId}/messages?${qs}`);
    const env = data?.data || data || {};
    const msgs = Array.isArray(env) ? env : env.messages || [];
    const readIds = new Set(msgs.filter(m => m.isRead).map(m => m.id));
    S.chatMessages.forEach(m => {
      if (m.senderId === myId && !m.isRead && readIds.has(m.id)) {
        m.isRead = true;
        markRowRead(m.id);
      }
    });
  } catch (e) {
    // A11: non-critical read-receipt refresh; log instead of swallowing.
    console.warn('refreshReadReceipts failed:', e);
  }
}

// ---- Incremental polling ----
async function pollChatMessages() {
  if (!S.chatMatchId) return;
  if (S.chatPollBusy) {
    // SSE 事件恰逢一次 poll 在途时不能静默丢（在途请求可能不含最新消息，
    // 兜底轮询已降到 30s）：置 pending，busy 释放后立刻补拉一轮
    S.chatPollPending = true;
    return;
  }
  // A9: snapshot the conversation + cursor up front so a response that lands
  // after the user switched conversations can be discarded instead of leaking
  // into the new conversation's state/DOM.
  const currentMatchId = S.chatMatchId;
  const lastId = S.chatLastId;
  S.chatPollBusy = true;
  try {
    // B18: only filter by afterId when we actually have one. A brand-new
    // conversation (lastId === null) intentionally pulls the current set once;
    // the dedupe below keeps it from double-rendering.
    const qs = lastId ? `?afterId=${encodeURIComponent(lastId)}` : '';
    const data = await window.api(`/chat/${currentMatchId}/messages/poll${qs}`);
    // A9: drop the response if the conversation changed while awaiting.
    if (S.chatMatchId !== currentMatchId) return;
    const env = data?.data || data || {};
    const msgs = Array.isArray(env) ? env : env.messages || [];
    if (msgs.length) {
      const known = new Set(S.chatMessages.map(m => m.id));
      const fresh = msgs.filter(m => !known.has(m.id));
      // Advance the cursor only over messages we accept for this match, so a
      // discarded/duplicate batch can't corrupt the next poll's afterId.
      S.chatLastId = msgs[msgs.length - 1].id;
      if (fresh.length) {
        const c = document.getElementById('chat-messages');
        const nearBottom = c ? c.scrollHeight - c.scrollTop - c.clientHeight < 120 : true;
        const prevMsg = S.chatMessages[S.chatMessages.length - 1] || null;
        S.chatMessages.push(...fresh);
        appendChatMessages(fresh, prevMsg);
        if (nearBottom && c) c.scrollTop = c.scrollHeight;
        // B19: only mark read when a genuinely new, unread partner message
        // arrived. markChatRead itself dedupes concurrent calls.
        const myId = S.currentUser?.id;
        if (fresh.some(m => m.senderId !== myId && !m.isRead)) window.markChatRead();
      }
    }
    S.chatPollTick = (S.chatPollTick + 1) % 3;
    if (S.chatPollTick === 0 && S.chatMatchId === currentMatchId) await refreshReadReceipts();
  } catch (e) {
    // A11: log polling failures instead of swallowing them. The 5s interval
    // keeps retrying, so no user-facing toast here to avoid spamming.
    console.warn('pollChatMessages failed:', e);
  } finally {
    S.chatPollBusy = false;
    if (S.chatPollPending) {
      S.chatPollPending = false;
      window.pollChatMessages();
    }
  }
}
window.pollChatMessages = pollChatMessages;

function startChatPolling() {
  window.stopChatPolling();
  // A9: capture the conversation this timer belongs to; if the active chat
  // changed but the old timer somehow survived, its ticks become no-ops.
  const matchId = S.chatMatchId;
  let tick = 0;
  S.chatPollingId = setInterval(() => {
    if (S.chatMatchId !== matchId) return;
    // SSE 在线时新消息是推过来的，本轮询降为 30s 兜底（每 6 跳跑 1 跳）
    tick += 1;
    if (S.realtimeUp && tick % 6 !== 0) return;
    window.pollChatMessages();
  }, 5000);
}
window.startChatPolling = startChatPolling;

function stopChatPolling() {
  if (S.chatPollingId) {
    clearInterval(S.chatPollingId);
    S.chatPollingId = null;
  }
}
window.stopChatPolling = stopChatPolling;

// SSE read 事件（core.js）需要在收到对方已读时点亮回执
window.refreshReadReceipts = refreshReadReceipts;
