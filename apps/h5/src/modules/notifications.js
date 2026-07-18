import { S } from '../state.js';

// ========================================
// NOTIFICATIONS
// ========================================
async function openNotifications() {
  window.openOverlay('notifications-overlay');
  // Reset pagination on each open so a fresh session (incl. after re-login) starts clean.
  S.notifList = [];
  S.notifPage = 1;
  S.notifHasMore = false;
  S.notifLoadingMore = false;
  window.loadNotifications();
  window.refreshUnreadBadge();
  window.startNotifPolling();
}
window.openNotifications = openNotifications;

function closeNotifications() {
  window.stopNotifPolling();
  window.closeOverlay('notifications-overlay');
}
window.closeNotifications = closeNotifications;

const NOTIF_PAGE_SIZE = 20;

// Shared icon map (list rows + detail view stay consistent).
const NOTIF_ICONS = {
  like: 'favorite',
  comment: 'chat_bubble',
  match_result: 'auto_awesome',
  no_match: 'hourglass_empty',
  match_expired: 'hourglass_disabled',
  energy_refunded: 'bolt',
  system: 'info'
};

// §6.6 J rule: when an energy_refunded notification arrives, surface it as the
// Chat-list banner and resync the energy balance. Dedupe by notification id so
// the 15s poll doesn't re-banner the same refund.
let lastRefundNotifId = null;
function maybeSurfaceRefund(notifs) {
  if (!Array.isArray(notifs)) return;
  const refund = notifs.find(n => (n.type || '') === 'energy_refunded');
  if (!refund || refund.id === lastRefundNotifId) return;
  lastRefundNotifId = refund.id;
  window.showRefundBanner?.(refund);
}

// Fetch one page of notifications. Returns { notifs, hasMore } or null on error.
async function fetchNotifPage(page) {
  const data = await window.api(`/notifications?page=${page}&limit=${NOTIF_PAGE_SIZE}`);
  const env = data.data || data || {};
  const notifs = Array.isArray(env) ? env : env.items || [];
  const total = Array.isArray(env) ? notifs.length : Number(env.total) || 0;
  const hasMore = !Array.isArray(env) && page * NOTIF_PAGE_SIZE < total;
  return { notifs, hasMore };
}

// Fresh load (open + poll): resets pagination to page 1.
async function loadNotifications() {
  const c = document.getElementById('notifications-content');
  if (!c) return;
  try {
    const { notifs, hasMore } = await fetchNotifPage(1);
    S.notifList = notifs;
    S.notifPage = 1;
    S.notifHasMore = hasMore;
    maybeSurfaceRefund(notifs);
    renderNotifications();
  } catch (e) {
    console.error('Failed to load notifications:', e);
    // Keep already-rendered content on poll failure; only show error if empty.
    if (!S.notifList.length) {
      c.innerHTML = `<div class="flex flex-col items-center text-center pt-24">
        ${window.flatEmptyIcon('cloud_off')}
        <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">Failed to load</p>
        <p class="font-body text-sm text-on-surface-variant mt-2">Check your connection and try again</p>
      </div>`;
    }
  }
}
window.loadNotifications = loadNotifications;

// Append the next page of older notifications.
async function loadMoreNotifications() {
  if (S.notifLoadingMore || !S.notifHasMore) return;
  S.notifLoadingMore = true;
  const btn = document.getElementById('notif-load-more');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Loading...';
  }
  try {
    const { notifs, hasMore } = await fetchNotifPage(S.notifPage + 1);
    // De-dupe in case items shifted between pages.
    const seen = new Set(S.notifList.map(n => n.id));
    S.notifList = S.notifList.concat(notifs.filter(n => !seen.has(n.id)));
    S.notifPage += 1;
    S.notifHasMore = hasMore;
    renderNotifications();
  } catch (e) {
    console.error('Failed to load more notifications:', e);
    window.toast('Failed to load more notifications');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Load More';
    }
  } finally {
    S.notifLoadingMore = false;
  }
}
window.loadMoreNotifications = loadMoreNotifications;

function renderNotifications() {
  const c = document.getElementById('notifications-content');
  if (!c) return;
  const notifs = S.notifList;
  if (!notifs.length) {
    // 平面简约空态（与全站 flatEmptyIcon 统一）
    c.innerHTML = `<div class="flex flex-col items-center text-center pt-24">
        ${window.flatEmptyIcon('notifications')}
        <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">No notifications</p>
        <p class="font-body text-sm text-on-surface-variant mt-2">You're all caught up</p>
      </div>`;
    return;
  }
  {
    const today = [],
      yesterday = [],
      older = [];
    const now = new Date();
    notifs.forEach(n => {
      const d = new Date(n.createdAt || n.created_at);
      const diff = (now - d) / 86400000;
      if (diff < 1) today.push(n);else if (diff < 2) yesterday.push(n);else older.push(n);
    });
    const icons = NOTIF_ICONS;
    // Editorial item (Ivory & Ink): icon plate left, headline + timestamp row, body copy.
    // .notif-item / .unread / onclick are load-bearing — do not rename.
    const renderItem = n => {
      const type = n.type || 'system';
      const icon = icons[type] || 'info';
      const filled = type === 'like' || type === 'match_result';
      return `<div class="notif-item ${n.isRead ? '' : 'unread'} relative flex items-start gap-6 group cursor-pointer" onclick="openNotificationDetail('${n.id}')">
        <div class="notif-dot absolute -left-3 top-2 w-1.5 h-1.5 rounded-full bg-neon-pink"></div>
        <div class="notif-icon-plate flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-[14px]">
          <span class="material-symbols-outlined"${filled ? ` style="font-variation-settings: 'FILL' 1;"` : ''}>${icon}</span>
        </div>
        <div class="flex-grow space-y-1 pt-1 min-w-0">
          <div class="flex justify-between items-start gap-4">
            <h4 class="font-headline text-base font-bold text-primary">${window.escapeHtml(n.title || type)}</h4>
            <span class="font-label text-[10px] text-on-surface-variant tracking-tighter whitespace-nowrap">${window.formatPostTime(n.createdAt || n.created_at)}</span>
          </div>
          <p class="font-body text-sm text-on-surface-variant leading-relaxed">${window.escapeHtml(n.body || n.message || n.content || '')}</p>
        </div>
      </div>`;
    };
    const renderSection = (label, items) => `<section class="mb-16">
      <h3 class="notif-section-label font-headline text-sm font-bold tracking-widest mb-8 text-neutral-400 pl-4">${label}</h3>
      <div class="space-y-12">${items.map(renderItem).join('')}</div>
    </section>`;
    let html = '';
    if (today.length) html += renderSection('Today', today);
    if (yesterday.length) html += renderSection('Yesterday', yesterday);
    if (older.length) html += renderSection('Earlier', older);
    if (S.notifHasMore) {
      html += `<div class="flex justify-center pt-2 pb-8">
        <button id="notif-load-more" class="px-10 py-4 border border-outline-variant/40 text-on-surface-variant font-headline text-[10px] font-bold tracking-[0.2em] hover:text-primary hover:border-primary active:scale-95 transition-all" onclick="loadMoreNotifications()">Load More</button>
      </div>`;
    }
    c.innerHTML = html;
  }
}
window.renderNotifications = renderNotifications;

async function markNotificationRead(id, el) {
  try {
    await window.api(`/notifications/${id}/read`, 'PUT');
    if (el) el.classList.remove('unread');
    // Keep accumulated state in sync so a poll/re-render doesn't resurrect the unread style.
    const n = S.notifList.find(x => x.id === id);
    if (n) n.isRead = true;
    window.refreshUnreadBadge();
  } catch (e) {
    console.error('Failed to mark notification read:', e);
    window.toast('Failed to mark notification as read');
    if (el) el.classList.add('unread');
  }
}
window.markNotificationRead = markNotificationRead;

// Open a notification's full detail. Renders into #notif-detail-content,
// marks it read, then slides the detail overlay up.
function openNotificationDetail(id) {
  const n = S.notifList.find(x => x.id === id);
  if (!n) return;
  const c = document.getElementById('notif-detail-content');
  if (c) {
    const type = n.type || 'system';
    const icon = NOTIF_ICONS[type] || 'info';
    const filled = type === 'like' || type === 'match_result';
    c.innerHTML = `<article class="space-y-10">
        <div class="flex items-center gap-6">
          <div class="notif-icon-plate flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-[14px]">
            <span class="material-symbols-outlined"${filled ? ` style="font-variation-settings: 'FILL' 1;"` : ''}>${icon}</span>
          </div>
          <span class="font-label text-[10px] text-on-surface-variant tracking-tighter whitespace-nowrap">${window.formatPostTime(n.createdAt || n.created_at)}</span>
        </div>
        <h2 class="font-headline text-3xl font-bold tracking-tighter leading-none text-primary">${window.escapeHtml(n.title || type)}</h2>
        <p class="font-body text-lg text-on-surface-variant leading-relaxed whitespace-pre-wrap">${window.escapeHtml(n.body || n.message || n.content || '')}</p>
      </article>`;
  }
  // Mark read (also syncs S.notifList + the unread badge).
  window.markNotificationRead(id);
  // Reflect read-state on the list row immediately, in case the user goes back.
  const row = document.querySelector(`.notif-item[onclick*="${id}"]`);
  if (row) row.classList.remove('unread');
  window.openOverlay('notif-detail-overlay');
}
window.openNotificationDetail = openNotificationDetail;

function closeNotificationDetail() {
  window.closeOverlay('notif-detail-overlay');
}
window.closeNotificationDetail = closeNotificationDetail;

async function refreshUnreadBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (!localStorage.getItem('cl_token')) {
    badge.classList.add('hidden');
    return;
  }
  try {
    const data = await window.api('/notifications/unread-count');
    const env = (data && data.data) || data || {};
    const count = Number(env.unreadCount) || 0;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) {
    console.error('Failed to refresh unread badge:', e);
  }
}
window.refreshUnreadBadge = refreshUnreadBadge;

// Poll refresh: re-fetch the pages the user has already loaded so the expanded
// view (Load More) is preserved while read-states stay current.
async function refreshNotifications() {
  if (S.notifLoadingMore) return;
  try {
    const pages = Math.max(1, S.notifPage);
    const merged = [];
    const seen = new Set();
    let hasMore = false;
    for (let p = 1; p <= pages; p++) {
      const res = await fetchNotifPage(p);
      hasMore = res.hasMore;
      res.notifs.forEach(n => {
        if (!seen.has(n.id)) { seen.add(n.id); merged.push(n); }
      });
    }
    S.notifList = merged;
    S.notifHasMore = hasMore;
    maybeSurfaceRefund(merged);
    renderNotifications();
  } catch (e) {
    console.error('Failed to refresh notifications:', e);
  }
}

function notifPollTick() {
  refreshNotifications();
  window.refreshUnreadBadge();
}

function startNotifPolling() {
  window.stopNotifPolling();
  S.notifPollingId = setInterval(notifPollTick, 15000);
}
window.startNotifPolling = startNotifPolling;

function stopNotifPolling() {
  if (S.notifPollingId) {
    clearInterval(S.notifPollingId);
    S.notifPollingId = null;
  }
}

// ========================================
// PROFILE TAB
// ========================================
window.stopNotifPolling = stopNotifPolling;

// Refresh badge once on app startup (no-op when logged out)
document.addEventListener('DOMContentLoaded', () => {
  window.refreshUnreadBadge();
});
