import { S } from '../state.js';
import { fetchSquareAds, adLargeCard, observeAdImpressions } from './ads.js';

// ========================================
// SQUARE TAB (v2 — DESIGN-DUAL-MODE §6.11)
// 两 tab [推荐 | 校园墙] + 三卡（官方大卡 / 校园墙中卡 / 推荐小卡）
// + 匿名渲染 + 学校标注。复用现有 bento 卡片基建改造。
// ========================================

// Official author types (authorType ≠ USER): student union / team / sponsor.
// Used to pick the large card and render the official / sponsored badge.
const OFFICIAL_AUTHOR_TYPES = ['STUDENT_UNION', 'TEAM', 'SPONSOR'];
function isOfficial(p) {
  return !!p && p.authorType && p.authorType !== 'USER';
}

async function loadSquareTab() {
  // 进入广场时先定位下划线（容器刚变可见，offset 此刻才可测）；
  // 300ms 后再校一次，防 web 字体晚到导致文字宽度变化错位
  requestAnimationFrame(positionSquareInk);
  setTimeout(positionSquareInk, 300);
  window.loadSquareTab2();
}
window.loadSquareTab = loadSquareTab;

// 滑动下划线：贴到当前 .square-seg.active 的位置/宽度（CSS transition 负责动画）
function positionSquareInk() {
  const ink = document.getElementById('square-tab-ink');
  const active = document.querySelector('#square-tabs .square-seg.active');
  if (!ink || !active) return;
  ink.style.left = active.offsetLeft + 'px';
  ink.style.width = active.offsetWidth + 'px';
}
window.positionSquareInk = positionSquareInk;
if (!window.__squareInkResizeBound) {
  window.__squareInkResizeBound = true;
  window.addEventListener('resize', () => requestAnimationFrame(positionSquareInk));
}

// Switch the square header between [推荐 | 校园墙] (tab ∈ recommend|campus_wall).
function switchSquareTab(el, tab) {
  if (tab !== 'recommend' && tab !== 'campus_wall') return;
  S.squareTab = tab;
  // The search box (#square-search) is shared by both tabs. Clear the query and
  // the input when switching so the new tab opens unfiltered instead of being
  // silently filtered by the previous tab's leftover search term. Also drop any
  // pending debounced search so it can't fire a stale query after the switch.
  clearTimeout(S._squareSearchTimer);
  S.squareSearchQuery = '';
  const searchEl = document.getElementById('square-search');
  if (searchEl) searchEl.value = '';
  // Toggle .active on the header segments (CSS .square-seg.active = neon underline).
  const container = el?.parentElement || document.getElementById('square-tabs');
  if (container) {
    container.querySelectorAll('.square-seg').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab || btn === el);
    });
  }
  positionSquareInk(); // 下划线滑到新选中项
  window.loadSquareTab2();
}
window.switchSquareTab = switchSquareTab;

// Normalize an API envelope that may be { data: {...} } or the payload itself.
function unwrap(data) {
  return (data && (data.data || data)) || {};
}

// Debounced search input handler: store the query and reload the feed.
function onSquareSearch(text) {
  S.squareSearchQuery = (text || '').trim();
  clearTimeout(S._squareSearchTimer);
  S._squareSearchTimer = setTimeout(() => {
    window.loadSquareTab2();
  }, 300);
}
window.onSquareSearch = onSquareSearch;

// Load the current tab's feed: GET /square/v2/recommend or /campus-wall.
// Campus wall with no profile.school → empty state prompting to complete it.
async function loadSquareTab2() {
  const container = document.getElementById('square-feed');
  if (!container) return;
  // Tab-switch race guard: tag this request; if a newer one starts (user
  // switched tab) before we resolve, drop this stale response.
  const seq = ++S.squareReqSeq;
  const tab = S.squareTab === 'campus_wall' ? 'campus_wall' : 'recommend';
  const search = (S.squareSearchQuery || '').trim();
  const endpoint = tab === 'campus_wall' ? '/square/v2/campus-wall' : '/square/v2/recommend';
  try {
    let url = `${endpoint}?page=1&limit=20`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    // 推荐流首页并行拉广告（ADMIN-REDESIGN §6）：校园墙不插广告，搜索态不插，
    // 无学校资料不请求（fetchSquareAds 内部判定）。广告失败静默为空，不影响正常流。
    const wantAds = tab === 'recommend' && !search;
    const [data, ads] = await Promise.all([
      window.api(url),
      wantAds ? fetchSquareAds() : Promise.resolve([]),
    ]);
    if (seq !== S.squareReqSeq) return; // superseded by a newer load
    const env = unwrap(data);
    // Campus wall asks the user to complete their school first.
    if (tab === 'campus_wall' && env.needProfileSchool) {
      S.squarePosts = [];
      renderSquareNeedSchool();
      return;
    }
    const posts = Array.isArray(env) ? env : (env.items || env.posts || []);
    S.squarePosts = posts;
    renderSquareFeed(posts, ads);
  } catch (e) {
    if (seq !== S.squareReqSeq) return; // superseded; don't clobber newer view
    console.error('loadSquareTab2 error:', e);
    container.innerHTML = `<div class="col-span-2 text-center py-24">
      ${window.flatEmptyIcon('cloud_off')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">Failed to load posts</p>
      <p class="text-sm text-on-surface-variant mt-2">Check your connection and try again</p>
      <button onclick="loadSquareTab2()" class="mt-6 font-headline text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-black pb-1">Retry</button>
    </div>`;
    layoutSquareMasonry();
  }
}
window.loadSquareTab2 = loadSquareTab2;
// Back-compat alias: other modules / inline handlers may still call loadSquarePosts.
window.loadSquarePosts = loadSquareTab2;

// Campus-wall gate: shown when the user has no school on their profile.
function renderSquareNeedSchool() {
  const container = document.getElementById('square-feed');
  if (!container) return;
  container.innerHTML = `<div class="col-span-2 text-center py-24">
    ${window.flatEmptyIcon('school')}
    <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">Add your school to view the campus wall</p>
    <p class="text-sm text-on-surface-variant mt-2">Set your school in your profile to unlock it</p>
    <button onclick="window.switchTab('profile')" class="mt-6 font-headline text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-black pb-1">Complete profile</button>
  </div>`;
  layoutSquareMasonry();
}

// Dispatch each item to a card type by authorType + board (§6.11 行2138-2142):
//  - official (authorType ≠ USER)          → bentoLargeCard (大卡 + 官方/Sponsored 徽标 + 学校)
//  - campus_wall + USER                     → bentoWideCard (中卡，单列，头像/学校在上)
//  - recommend  + USER                      → bentoSmallCard (小卡，双列网格 grid-cols-2 gap-3)
// Consecutive small cards are bucketed two-at-a-time into a 2-col grid.
function renderSquareFeed(posts, ads = []) {
  const container = document.getElementById('square-feed');
  if (!container) return;
  if (!posts.length) {
    container.innerHTML = `<div class="col-span-2 text-center py-24">
      ${window.flatEmptyIcon('grid_view')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">No posts yet</p>
      <p class="text-sm text-on-surface-variant mt-2">Be the first to share a moment</p>
    </div>`;
    layoutSquareMasonry();
    return;
  }
  const kindOf = (p) => {
    if (isOfficial(p)) return 'large';
    // 校园墙帖（board=campus_wall，API 返回大写）始终用竖排大卡——即使在推荐里也保持校园墙样式（本轮反馈5a）。
    if (String(p.board || '').toLowerCase() === 'campus_wall') return 'wide';
    return S.squareTab === 'campus_wall' ? 'wide' : 'small';
  };
  // 单一 dense 网格（容器在 index.html 设为 grid grid-cols-2 + grid-flow-row-dense）：
  // 小卡占 1 列（每行两个），官方大卡 / 校园墙卡跨 2 列（整行）。dense 自动回填空格，
  // 奇数小卡或被大卡打断都不再留视觉空位。
  // 广告插入规则（ADMIN-REDESIGN §6）：首屏第 3 个卡位后插 1 个，此后每 8 个小卡
  // 插 1 个；按拉取顺序轮换，本次渲染内不重复，用完即止。校园墙调用方传空 ads。
  let html = '';
  let adIdx = 0;             // 下一个待插广告下标
  let cardCount = 0;         // 总卡计数（首个广告在第 3 卡之后）
  let smallSinceAd = 0;      // 上个广告以来累计的小卡数（每满 8 再插）
  let firstAdPlaced = false;
  for (const p of posts) {
    const kind = kindOf(p);
    if (kind === 'large') html += `<div class="col-span-2">${bentoLargeCard(p)}</div>`;
    else if (kind === 'wide') html += `<div class="col-span-2">${bentoWideCard(p)}</div>`;
    else { html += bentoSmallCard(p); smallSinceAd++; }
    cardCount++;
    if (adIdx < ads.length) {
      if (!firstAdPlaced && cardCount >= 3) {
        html += `<div class="col-span-2">${adLargeCard(ads[adIdx++])}</div>`;
        firstAdPlaced = true;
        smallSinceAd = 0;
      } else if (firstAdPlaced && smallSinceAd >= 8) {
        html += `<div class="col-span-2">${adLargeCard(ads[adIdx++])}</div>`;
        smallSinceAd = 0;
      }
    }
  }
  // 帖子不足 3 条时也保证首个广告能露出（追加到末尾）
  if (ads.length && !firstAdPlaced) {
    html += `<div class="col-span-2">${adLargeCard(ads[adIdx++])}</div>`;
  }
  container.innerHTML = html;
  // 瀑布流布局（本轮反馈5）：卡片高度不再统一，用 grid row-span 按实际高度砌墙；
  // 图片加载完成后重排（图片卡高度随图而变）。
  layoutSquareMasonry();
  container.querySelectorAll('img').forEach(im => {
    // 竞态防护：图片可能在上面 layout 之后、挂监听之前就完成加载——
    // complete 时也补一次重排，而不是直接跳过。
    if (im.complete) { scheduleMasonry(); return; }
    im.addEventListener('load', scheduleMasonry, { once: true });
    im.addEventListener('error', scheduleMasonry, { once: true });
  });
  // 渲染完成后对广告卡挂曝光观察（≥50% 可见计 1 次，会话内去重）
  if (ads.length) observeAdImpressions(container);
}

// ── 瀑布流：#square-feed 为 grid-auto-rows:2px + row-gap:6px 的网格，
// 每张卡按自身内容高度换算 grid-row span（n ≥ (h+G)/(R+G)），列内自然错落。
let masonryRaf = null;
function scheduleMasonry() {
  if (masonryRaf) return;
  masonryRaf = requestAnimationFrame(() => {
    masonryRaf = null;
    layoutSquareMasonry();
  });
}
function layoutSquareMasonry() {
  const c = document.getElementById('square-feed');
  if (!c) return;
  const R = 2, G = 6; // auto-row 高 / row-gap（与 main.css #square-feed 保持一致）
  const items = Array.from(c.children);
  items.forEach(it => { it.style.gridRowEnd = 'auto'; });
  const heights = items.map(it => it.getBoundingClientRect().height);
  items.forEach((it, i) => {
    it.style.gridRowEnd = `span ${Math.max(1, Math.ceil((heights[i] + G) / (R + G)))}`;
  });
}
window.layoutSquareMasonry = layoutSquareMasonry;
if (!window.__masonryResizeBound) {
  window.__masonryResizeBound = true;
  window.addEventListener('resize', scheduleMasonry);
}

// Anonymous-aware author identity (§6.11 规则7). Anonymous posts render as
// 「匿名同学」with a placeholder avatar; the backend already nulls authorUser,
// this is the front-end fallback. Otherwise use authorUser.profile.
function postAuthorDisplay(p) {
  if (p?.anonymous) {
    // #4a：用后端下发的稳定有趣化名（Curious Otter 风），没有则兜底
    const alias = p.anonymousAuthor?.nickname || 'Anonymous';
    return { name: alias, nickname: alias, avatarUrl: p.anonymousAuthor?.avatarUrl || null, anonymous: true, school: p.school };
  }
  const prof = p?.authorUser?.profile || {};
  return {
    name: prof.nickname || p?.admin?.name || p?.admin?.organizationName || 'User',
    nickname: prof.nickname,
    avatarUrl: prof.avatarUrl,
    anonymous: false,
    school: prof.school || p?.school,
  };
}
window.postAuthorDisplay = postAuthorDisplay;

function postAuthorName(p) {
  return postAuthorDisplay(p).name;
}

// School pill for the top-right corner of every card (§6.11 规则6).
// 匿名帖学校只取 SquarePost.school，绝不回退到作者 profile，防止身份泄露
// （§8.1.1 风险 13c：学校来自 SquarePost.school，不经作者 profile）。
function schoolBadge(p) {
  const school = p?.anonymous ? p?.school : (p?.school || p?.authorUser?.profile?.school);
  if (!school) return '';
  return `<span class="school-badge">${window.escapeHtml(school)}</span>`;
}

// Official / sponsored badge for official posts (authorType ≠ USER).
function officialBadge(p) {
  if (!isOfficial(p)) return '';
  if (p.isSponsored || p.authorType === 'SPONSOR') {
    return `<span class="sponsored-badge">Sponsored</span>`;
  }
  const org = p.admin?.organizationName || p.admin?.name;
  const label = p.authorType === 'STUDENT_UNION' ? 'Student Union' : (p.authorType === 'TEAM' ? 'Official Team' : 'Official');
  return `<span class="official-badge">${window.escapeHtml(org ? `${label} · ${org}` : label)}</span>`;
}

// Render a single avatar (image / initials / anonymous placeholder) at a size.
// `profile` is a {nickname,avatarUrl,anonymous?} shape (from postAuthorDisplay).
// sizeClass controls the box; extra applies ring/border classes.
function avatarChip(profile, fallbackName, sizeClass, textSize, extra) {
  // Anonymous → neutral person icon placeholder (no initials that could leak a name).
  if (profile?.anonymous) {
    return `<div class="${sizeClass} rounded-full bg-surface-container flex items-center justify-center ${extra}"><span class="material-symbols-outlined text-outline ${textSize}">person</span></div>`;
  }
  const url = profile?.avatarUrl;
  const name = profile?.nickname || fallbackName || 'Anonymous';
  const initials = window.escapeHtml(name.substring(0, 2).toUpperCase());
  if (url) {
    return `<img src="${window.safeUrl(url)}" class="${sizeClass} rounded-full object-cover ${extra}">`;
  }
  return `<div class="${sizeClass} rounded-full bg-black flex items-center justify-center ${extra}"><span class="text-white ${textSize} font-bold">${initials}</span></div>`;
}

// Author avatar(s) for a post: single avatar normally, or a stacked pair when
// the post represents a couple match (post.coupleMatchId + match.userA/userB).
// Anonymous-aware via postAuthorDisplay. Used by both the feed card and the
// detail header so they stay consistent.
function renderAuthorAvatars(post) {
  const match = post?.match;
  const a = match?.userA;
  const b = match?.userB;
  if (!post?.anonymous && match && a && b) {
    return `<div class="relative w-10 h-10 shrink-0">
      ${avatarChip(a.profile, a.profile?.nickname, 'w-9 h-9', 'text-[10px]', '')}
      <div class="absolute -bottom-1 -right-1">${avatarChip(b.profile, b.profile?.nickname, 'w-6 h-6', 'text-[8px]', 'border-2 border-white')}</div>
    </div>`;
  }
  const d = postAuthorDisplay(post);
  return avatarChip(d, d.name, 'w-10 h-10', 'text-[10px]', '');
}
window.renderAuthorAvatars = renderAuthorAvatars;

function clampStyle(lines) {
  return `display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden;`;
}

// ── 投票块（卡片 + 详情共用）：选项行 + 占比条 + 我的选择高亮；未过审仅作者可见并带状态徽标 ──
function pollBlock(p) {
  if (p.postType !== 'poll') return '';
  const options = Array.isArray(p.pollOptions) ? p.pollOptions : [];
  if (!options.length) return '';
  const total = options.reduce((n, o) => n + (o.votes || 0), 0);
  const canVote = p.reviewStatus === 'approved';
  const my = typeof p.myVote === 'number' ? p.myVote : null;
  const review = p.reviewStatus === 'pending'
    ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] bg-surface-container-high text-on-surface-variant text-[9px] font-bold tracking-widest mb-1">UNDER REVIEW</span>'
    : (p.reviewStatus === 'rejected'
      ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] bg-neon-pink/15 text-neon-pink text-[9px] font-bold tracking-widest mb-1">REJECTED</span>'
      : '');
  const rows = options.map((o, i) => {
    const pct = total ? Math.round(((o.votes || 0) / total) * 100) : 0;
    const mine = my === i;
    return `<button type="button" class="poll-opt${mine ? ' poll-opt--mine' : ''}"
      ${canVote ? `onclick="event.stopPropagation();votePollOption('${p.id}',${i})"` : 'disabled'}>
      <span class="poll-opt-fill" style="width:${total ? pct : 0}%"></span>
      <span class="poll-opt-label" data-no-i18n>${window.escapeHtml(o.text || '')}</span>
      <span class="poll-opt-count" data-no-i18n>${total ? pct + '%' : ''}</span>
    </button>`;
  }).join('');
  return `<div class="poll-block my-3" data-poll-id="${p.id}">${review}${rows}
    <p class="text-[10px] text-outline tracking-widest mt-1.5" data-no-i18n>${total} vote${total === 1 ? '' : 's'}${my != null ? ' · tap to change' : ''}</p>
  </div>`;
}

async function votePollOption(postId, optionIndex) {
  try {
    const data = await window.api(`/square/v2/posts/${postId}/vote`, 'POST', { optionIndex });
    const res = unwrap(data);
    // 同步缓存（列表 + 详情），再原地重渲染对应投票块
    const apply = (p) => {
      if (p && p.id === postId) {
        p.pollOptions = res.pollOptions;
        p.myVote = res.myVote;
      }
    };
    (S.squarePosts || []).forEach(apply);
    apply(S.pdPostData);
    let src = (S.squarePosts || []).find(x => x && x.id === postId);
    if (!src && S.pdPostData?.id === postId) src = S.pdPostData;
    // 缓存未命中：票已在服务端落库，跳过原地重渲（下次加载会取到最新计数）
    if (!src) return;
    document.querySelectorAll(`[data-poll-id="${postId}"]`).forEach(el => {
      const wrap = document.createElement('div');
      wrap.innerHTML = pollBlock(src);
      if (wrap.firstElementChild) el.replaceWith(wrap.firstElementChild);
    });
    // 高度变化后瀑布流重排
    layoutSquareMasonry();
  } catch (e) {
    window.toast(e?.message || 'Vote failed');
  }
}
window.votePollOption = votePollOption;

// ── 活动信息（活动帖卡片行 + 详情购票块，本轮反馈2）──
function eventPrice(ev) {
  return ev.priceCents ? `¥${(ev.priceCents / 100).toFixed(ev.priceCents % 100 ? 2 : 0)}` : 'Free';
}
function eventTimeShort(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function eventStrip(p) {
  const ev = p.event;
  if (p.postType !== 'event' || !ev) return '';
  const soldOut = ev.capacity != null && ev.ticketsSold >= ev.capacity;
  // 根节点不挂 data-no-i18n（否则 Sold out/Free 等 UI 词永远不进中文态）；用户内容单独豁免
  return `<div class="flex items-center gap-2 flex-wrap mt-1">
    <span class="px-2 py-0.5 rounded-[8px] bg-neon text-black text-[9px] font-bold tracking-widest" data-no-i18n>EVENT</span>
    <span class="text-[11px] text-on-surface-variant font-medium" data-no-i18n>${eventTimeShort(ev.startAt)}${ev.venue ? ' · ' + window.escapeHtml(ev.venue) : ''}</span>
    <span class="text-[11px] font-bold">${soldOut ? 'Sold out' : eventPrice(ev)}</span>
  </div>`;
}
function eventDetailBlock(p) {
  const ev = p.event;
  if (p.postType !== 'event' || !ev) return '';
  const remaining = ev.capacity == null ? null : Math.max(0, ev.capacity - ev.ticketsSold);
  const soldOut = remaining != null && remaining <= 0;
  const ended = new Date(ev.endAt || ev.startAt) < new Date();
  const closed = ev.status !== 'published';
  const disabled = soldOut || ended || closed;
  // 可购时按钮拆成「可译词 + 价格」两个节点，让中文态能翻译 Get Ticket
  const label = closed ? 'Sales closed' : (ended ? 'Event ended' : (soldOut ? 'Sold out'
    : `<span>Get Ticket</span><span data-no-i18n>&nbsp;· ${eventPrice(ev)}</span>`));
  return `<div class="mt-6 rounded-[14px] border border-outline-variant/30 bg-surface-container-lowest p-5">
    <div class="flex items-center gap-2 mb-3" data-no-i18n>
      <span class="px-2 py-0.5 rounded-[8px] bg-neon text-black text-[9px] font-bold tracking-widest">EVENT</span>
      ${ev.school ? `<span class="text-[10px] text-outline tracking-widest">${window.escapeHtml(ev.school)}</span>` : ''}
    </div>
    <div class="space-y-1.5 text-sm" data-no-i18n>
      <p class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-outline">schedule</span>${eventTimeShort(ev.startAt)}${ev.endAt ? ' – ' + eventTimeShort(ev.endAt) : ''}</p>
      ${ev.venue ? `<p class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-outline">location_on</span>${window.escapeHtml(ev.venue)}</p>` : ''}
      <p class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-outline">confirmation_number</span>${eventPrice(ev)}${remaining != null ? ` · ${remaining} left` : ''} · ${ev.ticketsSold} sold</p>
    </div>
    <button class="btn-cta mt-5 flex items-center justify-center ${disabled ? 'opacity-50' : ''}" ${disabled ? 'disabled' : `onclick="buyEventTicket('${ev.id}')"`}>${label}</button>
  </div>`;
}

async function buyEventTicket(eventId) {
  const ok = await window.confirmCard({
    title: 'Get this ticket?',
    body: 'Payment is mocked in beta — the ticket lands in My Tickets instantly.',
    confirmLabel: 'Confirm',
  });
  if (!ok) return;
  try {
    const data = await window.api(`/events/${eventId}/purchase`, 'POST', {});
    const res = unwrap(data);
    window.toast(`Ticket ${res.code || ''} added to My Tickets`);
    // 详情里的余票/已售即时刷新
    if (S.currentPostId) window.loadPostDetail(S.currentPostId);
  } catch (e) {
    window.toast(e?.message || 'Purchase failed');
  }
}
window.buyEventTicket = buyEventTicket;

function postLikeButton(p) {
  const liked = !!p.myLiked;
  return `<button class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation();likePost('${p.id}', this)">
    <span data-like-icon class="material-symbols-outlined text-sm transition-colors ${liked ? 'text-neon-pink' : ''}" style="font-variation-settings:'FILL' ${liked ? 1 : 0};">favorite</span>
    <span class="text-xs font-bold" data-like-count>${p.likeCount || 0}</span>
  </button>`;
}

// Full-width text-only fallback card (also the no-image fallback for official
// posts). Shows official / Sponsored badge + school pill on a top header row.
function bentoTextCard(p) {
  const badge = officialBadge(p);
  const school = schoolBadge(p);
  const header = (badge || school)
    ? `<div class="flex items-center justify-between gap-2 mb-3">${badge || '<span></span>'}${school}</div>`
    : '';
  return `<article data-post-id="${p.id}" class="bg-surface-container-lowest p-4 border border-outline-variant/10 shadow-sm cursor-pointer rounded-[10px]" onclick="openPostDetail('${p.id}')">
    ${header}
    ${p.title ? `<h3 class="font-headline font-bold text-lg tracking-tight mb-2">${window.escapeHtml(p.title)}</h3>` : ''}
    ${eventStrip(p)}
    <p class="text-sm text-on-surface-variant leading-relaxed mb-4" style="${clampStyle(4)}">${window.escapeHtml(p.content || '')}</p>
    <div class="flex items-center justify-between">
      <p class="text-neutral-400 text-[10px] tracking-widest">${window.formatPostTime(p.createdAt)} • ${window.escapeHtml(postAuthorName(p))}</p>
      ${postLikeButton(p)}
    </div>
  </article>`;
}

// Card type 1 (official, authorType ≠ USER): large featured card (aspect 4/5)
// with official / Sponsored badge top-left and school pill top-right.
function bentoLargeCard(p) {
  const img = (p.images || [])[0];
  if (!img) return bentoTextCard(p);
  const badge = officialBadge(p);
  const school = schoolBadge(p);
  // 图片贴满卡片上/左/右边缘（卡片 overflow-hidden 裁出圆角）；只有底部文字+点赞留内边距，无边框（本轮反馈）
  return `<article data-post-id="${p.id}" class="group cursor-pointer bg-surface-container-lowest rounded-[10px] overflow-hidden" onclick="openPostDetail('${p.id}')">
    <div class="relative overflow-hidden aspect-[4/5] bg-surface-container">
      <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="${window.safeUrl(img)}" onerror="this.style.display='none'">
      ${badge ? `<div class="absolute top-4 left-4">${badge}</div>` : ''}
      ${school ? `<div class="absolute top-4 right-4">${school}</div>` : ''}
    </div>
    <div class="space-y-1 min-w-0 px-3 pt-2">
      ${p.title ? `<h3 class="font-headline font-bold text-lg tracking-tight">${window.escapeHtml(p.title)}</h3>` : ''}
      ${eventStrip(p)}
      <p class="text-neutral-500 text-sm italic" style="${clampStyle(2)}">${window.escapeHtml(p.content || '')}</p>
      <p class="text-neutral-400 text-[10px] tracking-widest">${window.formatPostTime(p.createdAt)} • ${window.escapeHtml(postAuthorName(p))}</p>
    </div>
    <div class="flex justify-end px-3 pb-2 mt-1">${postLikeButton(p)}</div>
  </article>`;
}

// 随机低饱和浅色底（按 post id 确定，纯文字小卡用，本轮反馈5b）
function pastelBg(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 42%, 90%)`;
}

// Card type 3 (recommend + USER): small square cards in a 2-col grid
// (gap-3, second one offset). School pill overlaid top-right.
function bentoSmallCard(p) {
  const img = (p.images || [])[0];
  const school = schoolBadge(p);
  const schoolOverlay = school ? `<div class="absolute top-2 right-2">${school}</div>` : '';
  const media = img
    // 图片卡高度随图片原始比例（小红书式瀑布流，本轮反馈5）；过长/过扁由 .rec-img 的 min/max-height 收敛
    ? `<div class="relative bg-surface-container overflow-hidden"><img class="rec-img" src="${window.safeUrl(img)}" onerror="this.parentElement.style.display='none'">${schoolOverlay}</div>`
    // 纯文字小卡（本轮反馈5b）：文字居中、可爱字体、放大、随机低饱和浅色底；点开详情仍照旧。
    : `<div class="relative aspect-[3/4] overflow-hidden flex items-center justify-center text-center p-4" style="background:${pastelBg(p.id)}">${schoolOverlay}<p class="font-cute" style="font-size:clamp(1.3rem,7vw,2rem);line-height:1.3;color:#3a3a3a;${clampStyle(5)}">${window.escapeHtml(p.title || p.content || '')}</p></div>`;
  // 图片/彩色文字块贴满卡片上/左/右边缘（卡片 overflow-hidden 裁圆角）；只有底部文字+点赞留内边距，无边框（本轮反馈）
  return `<article data-post-id="${p.id}" class="bg-surface-container-lowest rounded-[10px] overflow-hidden cursor-pointer" onclick="openPostDetail('${p.id}')">
    ${media}
    <div class="flex items-start justify-between gap-2 px-2 pb-2 pt-1.5">
      <div class="min-w-0">
        <p class="font-headline text-xs font-bold tracking-tighter truncate">${window.escapeHtml(p.title || (p.content || '').substring(0, 40))}</p>
        <p class="text-neutral-400 text-[10px] tracking-widest">${window.formatPostTime(p.createdAt)} • ${window.escapeHtml(postAuthorName(p))}</p>
      </div>
      ${postLikeButton(p)}
    </div>
  </article>`;
}

// Card type 2 (campus_wall + USER): wide single-column card with author header
// (avatar + name + school on top), big image, content, like + comment counts.
// Anonymous-aware (匿名同学 + placeholder avatar) and school pill in the header.
function bentoWideCard(p) {
  const img = (p.images || [])[0];
  const d = postAuthorDisplay(p);
  const school = d.school || p.school;
  // 竖排卡片（对齐截图）：作者头像行 + 全宽横图 + 标题/正文 + 点赞/评论
  return `<article data-post-id="${p.id}" class="bg-surface-container-lowest p-4 border border-outline-variant/10 shadow-sm cursor-pointer rounded-[10px]" onclick="openPostDetail('${p.id}')">
    <div class="flex items-center gap-3 mb-4">
      ${renderAuthorAvatars(p)}
      <div class="min-w-0 flex-1">
        <p class="font-headline text-base font-bold truncate">${window.escapeHtml(d.name)}</p>
        <p class="text-[10px] text-neutral-400 font-medium tracking-widest">${window.formatPostTime(p.createdAt)}</p>
      </div>
      ${school ? `<span class="school-badge shrink-0">${window.escapeHtml(school)}</span>` : ''}
    </div>
    ${img ? `<div class="aspect-video bg-surface-container overflow-hidden mb-2 rounded-[10px]"><img class="w-full h-full object-cover" src="${window.safeUrl(img)}" onerror="this.parentElement.style.display='none'"></div>` : ''}
    ${p.title ? `<p class="font-headline font-bold text-base tracking-tight mb-1">${window.escapeHtml(p.title)}</p>` : ''}
    <p class="text-sm text-on-surface-variant leading-relaxed mb-3" style="${clampStyle(3)}">${window.escapeHtml(p.content || '')}</p>
    ${pollBlock(p)}
    <div class="flex items-center justify-between">
      <span class="flex items-center gap-1 text-neutral-400"><span class="material-symbols-outlined text-sm">chat_bubble</span><span class="text-xs font-bold" data-comment-count>${p.commentCount || 0}</span></span>
      ${postLikeButton(p)}
    </div>
  </article>`;
}

// Apply a liked/count state to a like button's icon + count span.
function applyLikeButtonState(btn, liked, count) {
  if (!btn) return;
  const cnt = btn.querySelector('[data-like-count]');
  const icon = btn.querySelector('[data-like-icon]');
  if (cnt) cnt.textContent = String(Math.max(0, count));
  if (icon) {
    icon.style.fontVariationSettings = `'FILL' ${liked ? 1 : 0}`;
    icon.classList.toggle('text-neon-pink', !!liked);
  }
}

async function likePost(postId, btn) {
  try {
    const data = await window.api(`/square/v2/posts/${postId}/like`, 'POST');
    const res = unwrap(data);
    const cnt = btn?.querySelector('[data-like-count]');
    const n = parseInt(cnt?.textContent || '0', 10) || 0;
    const liked = !!res.liked;
    // Prefer the authoritative server count when present, else derive locally.
    const newCount = res.likeCount != null ? res.likeCount : (liked ? n + 1 : n - 1);
    applyLikeButtonState(btn, liked, newCount);
    // Keep cached list data + open detail view in sync so the like survives
    // a re-render and reflects in the detail page if it's currently open.
    syncPostLikeState(postId, liked, Math.max(0, newCount));
  } catch (e) {
    console.error('likePost error:', e);
    window.toast('Failed to like post');
  }
}

// Update the cached list entry (S.squarePosts) and, if the detail overlay is
// showing this post, its in-memory data so list/detail never disagree.
function syncPostLikeState(postId, liked, likeCount) {
  const p = (S.squarePosts || []).find(x => x && x.id === postId);
  if (p) {
    p.myLiked = liked;
    if (likeCount != null) p.likeCount = likeCount;
  }
  if (S.pdPostData && S.pdPostData.id === postId) {
    S.pdPostData.myLiked = liked;
    if (likeCount != null) S.pdPostData.likeCount = likeCount;
  }
}

// Patch the rendered list card for a post in place (avoids full list reload).
// Used when the detail page changes a post's like/comment counts (A12/A14).
function patchSquareCard(postId, { liked, likeCount, commentCount } = {}) {
  const container = document.getElementById('square-feed');
  if (!container) return;
  const card = container.querySelector(`[data-post-id="${postId}"]`);
  if (!card) return;
  if (liked != null || likeCount != null) {
    const btn = card.querySelector('[data-like-icon]')?.closest('button');
    if (btn) {
      const cntEl = btn.querySelector('[data-like-count]');
      const cur = parseInt(cntEl?.textContent || '0', 10) || 0;
      const curLiked = btn.querySelector('[data-like-icon]')?.classList.contains('text-neon-pink');
      applyLikeButtonState(btn, liked != null ? liked : curLiked, likeCount != null ? likeCount : cur);
    }
  }
  if (commentCount != null) {
    const cc = card.querySelector('[data-comment-count]');
    if (cc) cc.textContent = String(Math.max(0, commentCount));
  }
}

// ========================================
// POST DETAIL & COMMENTS
// ========================================
window.likePost = likePost;

// ========================================
// POST DETAIL & COMMENTS
// ========================================
async function openPostDetail(postId) {
  S.currentPostId = postId;
  window.openOverlay('post-detail-overlay');
  window.loadPostDetail(postId);
}
window.openPostDetail = openPostDetail;

function closePostDetail() {
  window.closeOverlay('post-detail-overlay');
  S.currentPostId = null;
  window.cancelPdReply();
}
window.closePostDetail = closePostDetail;

async function loadPostDetail(postId) {
  try {
    const data = await window.api(`/square/v2/posts/${postId}`);
    S.pdPostData = unwrap(data);
    window.renderPostDetail(S.pdPostData);
    // Reconcile the list card/cache with the authoritative detail data so
    // like/comment counts stay consistent when returning to the list (A12/A14).
    syncPostDetailToList(S.pdPostData);
  } catch (e) {
    console.error('loadPostDetail error:', e);
    window.toast('Failed to load post');
  }
}
window.loadPostDetail = loadPostDetail;

// Push the authoritative counts from a detail payload back into the cached
// list entry and the rendered list card.
function syncPostDetailToList(post) {
  if (!post || !post.id) return;
  const comments = post.comments || [];
  const commentTotal = post.commentCount != null
    ? post.commentCount
    : comments.reduce((n, cm) => n + 1 + (cm.replies || []).length, 0);
  const liked = !!post.myLiked;
  const likeCount = post.likeCount != null ? post.likeCount : null;
  const p = (S.squarePosts || []).find(x => x && x.id === post.id);
  if (p) {
    p.myLiked = liked;
    if (likeCount != null) p.likeCount = likeCount;
    p.commentCount = commentTotal;
  }
  patchSquareCard(post.id, { liked, likeCount, commentCount: commentTotal });
}

function renderPdImages(images) {
  if (!images.length) return '';
  if (images.length === 1) return `<section class="w-full bg-surface-container overflow-hidden"><img src="${window.safeUrl(images[0])}" class="w-full object-cover" onerror="this.parentElement.style.display='none'"></section>`;
  return `<section class="relative w-full bg-surface-container overflow-hidden">
    <div id="pd-carousel" class="flex w-full overflow-x-auto snap-x snap-mandatory hide-scrollbar" onscroll="pdCarouselScrolled(this)">
      ${images.map(img => `<div class="flex-none w-full snap-start"><img src="${window.safeUrl(img)}" class="w-full aspect-[4/5] object-cover" onerror="this.parentElement.style.display='none'"></div>`).join('')}
    </div>
    <button onclick="pdCarouselNav(-1)" class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 text-white flex items-center justify-center active:scale-90 transition-transform">
      <span class="material-symbols-outlined text-base">chevron_left</span>
    </button>
    <button onclick="pdCarouselNav(1)" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 text-white flex items-center justify-center active:scale-90 transition-transform">
      <span class="material-symbols-outlined text-base">chevron_right</span>
    </button>
    <div id="pd-carousel-dots" class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
      ${images.map((_, i) => `<div class="w-8 h-[2px] ${i === 0 ? 'bg-white' : 'bg-white/40'}"></div>`).join('')}
    </div>
  </section>`;
}

function pdCarouselNav(dir) {
  const el = document.getElementById('pd-carousel');
  if (!el) return;
  const w = el.clientWidth || 1;
  const last = Math.max(0, el.scrollWidth - el.clientWidth);
  const cur = Math.round(el.scrollLeft / w);
  // Clamp the target slide so left-swipe on the first image / right-swipe on
  // the last one don't scroll into a blank frame (B24).
  const target = Math.min(last, Math.max(0, (cur + dir) * w));
  if (Math.abs(target - el.scrollLeft) < 1) return;
  el.scrollTo({ left: target, behavior: 'smooth' });
}
window.pdCarouselNav = pdCarouselNav;

function pdCarouselScrolled(el) {
  const idx = Math.round(el.scrollLeft / el.clientWidth);
  const dots = document.getElementById('pd-carousel-dots');
  if (!dots) return;
  Array.from(dots.children).forEach((d, i) => {
    d.className = `w-8 h-[2px] ${i === idx ? 'bg-white' : 'bg-white/40'}`;
  });
}
window.pdCarouselScrolled = pdCarouselScrolled;

// replyTargetId: the top-level comment id this comment (or its replies) belongs to
// authorKey: how to identify the post author's own comments. For anonymous posts the
// backend strips authorUserId/userId and instead stamps the author's comments with a
// per-post opaque token (anonymousAuthorToken); for normal posts it's the authorUserId.
function renderPdComment(cm, replyTargetId, isReply, authorKey) {
  const name = cm.user?.profile?.nickname || cm.user?.nickname || 'User';
  const avatar = cm.user?.profile?.avatarUrl;
  // #1 作者在自己帖子下的评论显示 Author 标签。匿名帖用不透明 token 比对（真实 userId 已被后端剔除），
  // 普通帖沿用 authorUserId；缺少凭据时不显示徽标（绝不回退到匿名帖的真实作者 id）。
  const isAuthor = authorKey?.type === 'token'
    ? (!!authorKey.value && cm.anonymousAuthorToken === authorKey.value)
    : (!!authorKey?.value && cm.userId === authorKey.value);
  return `<div class="flex gap-4${isReply ? ' pl-12' : ''}">
    ${avatar
      ? `<img src="${window.safeUrl(avatar)}" class="w-8 h-8 rounded-full object-cover shrink-0">`
      : `<div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-outline text-base">person</span></div>`}
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline justify-between mb-2 gap-2">
        <span class="flex items-center gap-2 min-w-0"><span class="font-headline font-bold text-sm truncate">${window.escapeHtml(name)}</span>${isAuthor ? '<span class="shrink-0 px-1.5 py-0.5 rounded-[10px] bg-black text-neon text-[9px] font-bold tracking-widest">AUTHOR</span>' : ''}</span>
        <span class="text-[10px] text-on-surface-variant font-label tracking-widest shrink-0">${window.formatPostTime(cm.createdAt)}</span>
      </div>
      <p class="text-on-surface-variant text-sm leading-relaxed">${window.escapeHtml(cm.content || '')}</p>
      <button class="mt-3 text-[10px] font-bold tracking-widest text-primary/60 hover:text-primary" onclick="setPdReply('${cm.id}', '${replyTargetId}')">Reply</button>
    </div>
  </div>`;
}

function renderPostDetail(post) {
  const c = document.getElementById('pd-content');
  if (!c || !post) return;
  const images = post.images || [];
  const comments = post.comments || [];
  // #1/#6 标记楼主评论的凭据：匿名帖用后端下发的 per-post 不透明 token（真实 authorUserId 已被剔除），
  // 普通帖用 authorUserId。绝不对匿名帖使用 authorUserId（已被后端 strip，反解会泄露身份）。
  const authorKey = post.anonymous
    ? { type: 'token', value: post.anonymousAuthorToken }
    : { type: 'userId', value: post.authorUserId };
  const commentTotal = post.commentCount != null
    ? post.commentCount
    : comments.reduce((n, cm) => n + 1 + (cm.replies || []).length, 0);
  // Anonymous-aware author + school (§6.11 行2145). Official posts also show
  // their official / Sponsored badge next to the name.
  const d = postAuthorDisplay(post);
  const name = d.name;
  const school = d.school || post.school;
  const badge = officialBadge(post);
  const liked = !!post.myLiked;
  c.innerHTML = `
    ${renderPdImages(images)}
    <article class="px-6 py-10 bg-surface-container-lowest border-b border-outline-variant/10">
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-3 min-w-0">
          ${renderAuthorAvatars(post)}
          <div class="min-w-0">
            <p class="font-headline font-bold text-base leading-none truncate">${window.escapeHtml(name)}</p>
            ${badge ? `<div class="mt-1">${badge}</div>` : ''}
          </div>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          ${school ? `<span class="school-badge">${window.escapeHtml(school)}</span>` : ''}
          <p class="text-[10px] text-on-surface-variant font-label tracking-widest">${window.formatPostTime(post.createdAt)}</p>
        </div>
      </div>
      <div class="grid grid-cols-12 gap-6 items-start">
        <div class="col-span-12 min-w-0">
          ${post.title ? `<h2 class="font-headline text-3xl font-bold tracking-tighter mb-4 leading-none">${window.escapeHtml(post.title)}</h2>` : ''}
          <p class="text-on-surface-variant leading-relaxed text-lg font-light whitespace-pre-wrap">${window.escapeHtml(post.content || '')}</p>
          ${pollBlock(post)}
          ${eventDetailBlock(post)}
        </div>
      </div>
      <div class="flex items-center gap-8 py-5 border-y border-outline-variant/20 mt-8">
        <button id="pd-like-btn" class="flex items-center gap-2 group transition-all active:scale-90" onclick="likePdPost()">
          <span data-like-icon class="material-symbols-outlined text-xl ${liked ? 'text-neon-pink' : ''}" style="font-variation-settings:'FILL' ${liked ? 1 : 0};">favorite</span>
          <span data-like-count class="text-xs font-bold font-label tracking-tighter">${post.likeCount || 0}</span>
        </button>
        <span class="flex items-center gap-2">
          <span class="material-symbols-outlined text-xl">chat_bubble</span>
          <span class="text-xs font-bold font-label tracking-tighter">${commentTotal}</span>
        </span>
      </div>
    </article>
    <div class="px-6 pt-12 bg-surface">
      <h3 class="font-headline text-xs font-bold tracking-[0.2em] mb-10 text-on-surface-variant">Observations (${commentTotal})</h3>
      <div class="space-y-10">
        ${comments.map(cm => renderPdComment(cm, cm.id, false, authorKey) + (cm.replies || []).map(r => renderPdComment(r, cm.id, true, authorKey)).join('')).join('') || '<p class="text-sm text-outline italic">No observations yet. Share the first one.</p>'}
      </div>
    </div>`;
}
window.renderPostDetail = renderPostDetail;

// commentId: the comment whose author is being replied to; replyTargetId: top-level parent sent to the API
function setPdReply(commentId, replyTargetId) {
  const comments = S.pdPostData?.comments || [];
  let target = null;
  for (const cm of comments) {
    if (cm.id === commentId) { target = cm; break; }
    const r = (cm.replies || []).find(x => x.id === commentId);
    if (r) { target = r; break; }
  }
  // Enforce the invariant that parentCommentId is always a top-level comment id,
  // even if a caller passes a reply id by mistake — resolve to the owning
  // top-level comment so reply-to-reply nesting stays correct (B27).
  let parentId = replyTargetId;
  const topLevel = comments.find(cm => cm.id === replyTargetId);
  if (!topLevel) {
    const owner = comments.find(cm => (cm.replies || []).some(x => x.id === replyTargetId));
    if (owner) parentId = owner.id;
  }
  const nickname = target?.user?.profile?.nickname || target?.user?.nickname || 'User';
  S.pdReplyTo = { id: parentId, nickname };
  const bar = document.getElementById('pd-reply-bar');
  const label = document.getElementById('pd-reply-label');
  if (label) label.textContent = `Replying to ${nickname}`;
  if (bar) {
    bar.classList.remove('hidden');
    bar.classList.add('flex');
  }
  document.getElementById('comment-input')?.focus();
}
window.setPdReply = setPdReply;

function cancelPdReply() {
  S.pdReplyTo = null;
  const bar = document.getElementById('pd-reply-bar');
  if (bar) {
    bar.classList.add('hidden');
    bar.classList.remove('flex');
  }
  // Drop focus so the user gets a clear visual cue the reply target is gone;
  // the typed draft is preserved and will post as a top-level comment (B21).
  document.getElementById('comment-input')?.blur();
}
window.cancelPdReply = cancelPdReply;

async function submitPdComment() {
  const input = document.getElementById('comment-input');
  const content = input?.value?.trim();
  if (!content || !S.currentPostId) return;
  try {
    const body = {
      content
    };
    if (S.pdReplyTo?.id) body.parentCommentId = S.pdReplyTo.id;
    await window.api(`/square/v2/posts/${S.currentPostId}/comments`, 'POST', body);
    if (input) input.value = '';
    window.cancelPdReply();
    window.loadPostDetail(S.currentPostId);
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
}
window.submitPdComment = submitPdComment;

async function likePdPost() {
  if (!S.currentPostId) return;
  const postId = S.currentPostId;
  try {
    const data = await window.api(`/square/v2/posts/${postId}/like`, 'POST');
    const res = unwrap(data);
    const liked = !!res.liked;
    const btn = document.getElementById('pd-like-btn');
    const cntEl = btn?.querySelector('[data-like-count]');
    const n = parseInt(cntEl?.textContent || '0', 10) || 0;
    const newCount = res.likeCount != null ? res.likeCount : (liked ? n + 1 : n - 1);
    applyLikeButtonState(btn, liked, Math.max(0, newCount));
    // Keep cache + list card in sync so returning to the list shows the change
    // without a full reload (A12).
    syncPostLikeState(postId, liked, Math.max(0, newCount));
    patchSquareCard(postId, { liked, likeCount: Math.max(0, newCount) });
  } catch (e) {
    console.error('likePdPost error:', e);
    window.toast('Failed to like post');
  }
}

// ========================================
// NEW POST
// ========================================
window.likePdPost = likePdPost;

// ========================================
// NEW POST
// ========================================
function openNewPost() {
  S.newPostImages = [];
  // Default the new-post destination to the tab the user is currently viewing
  // (recommend or campus_wall), and reset the anonymous + poll toggles.
  S.newPostBoard = S.squareTab === 'campus_wall' ? 'campus_wall' : 'recommend';
  S.newPostAnonymous = false;
  S.newPostPoll = false;
  const titleEl = document.getElementById('post-title');
  const contentEl = document.getElementById('post-content');
  if (titleEl) titleEl.value = '';
  if (contentEl) contentEl.value = '';
  syncNewPostBoardUI();
  const anonEl = document.getElementById('newpost-anonymous');
  if (anonEl) anonEl.checked = false;
  const pollEl = document.getElementById('newpost-poll');
  if (pollEl) pollEl.checked = false;
  const pollBox = document.getElementById('newpost-poll-options');
  if (pollBox) pollBox.classList.add('hidden');
  renderPollOptionInputs(2);
  window.renderNewPostImages();
  window.openOverlay('overlay-new-post');
}
window.openNewPost = openNewPost;

// ── 校园墙投票（本轮反馈1）：发帖里开投票 → 强制校园墙 + 2–6 个选项，审核后展示 ──
function renderPollOptionInputs(count) {
  const list = document.getElementById('poll-option-list');
  if (!list) return;
  const existing = [...list.querySelectorAll('input')].map(i => i.value);
  const n = Math.min(6, Math.max(2, count));
  list.innerHTML = Array.from({ length: n }, (_, i) => `
    <input type="text" maxlength="50" placeholder="Option ${i + 1}"
      class="poll-option-input w-full bg-transparent border-0 border-b border-outline py-2 px-0 text-sm focus:ring-0 focus:border-b-2 focus:border-primary placeholder:text-outline-variant"/>`).join('');
  // 值用属性赋值回填（不拼 HTML）：escapeHtml 不转义引号，含 " 的选项会截断属性甚至注入
  [...list.querySelectorAll('input')].forEach((el, i) => { el.value = existing[i] || ''; });
}

function addPollOptionInput() {
  const list = document.getElementById('poll-option-list');
  const cur = list ? list.querySelectorAll('input').length : 2;
  if (cur >= 6) { window.toast('Up to 6 options'); return; }
  renderPollOptionInputs(cur + 1);
}
window.addPollOptionInput = addPollOptionInput;

function toggleNewPostPoll(checked) {
  S.newPostPoll = !!checked;
  const box = document.getElementById('newpost-poll-options');
  if (box) box.classList.toggle('hidden', !checked);
  if (checked) {
    // 投票只发校园墙
    selectNewPostBoard('campus_wall');
    if (!document.querySelectorAll('#poll-option-list input').length) renderPollOptionInputs(2);
  }
}
window.toggleNewPostPoll = toggleNewPostPoll;

// New-post destination radio [发到推荐 | 发到校园墙] → S.newPostBoard.
function selectNewPostBoard(board) {
  S.newPostBoard = board === 'campus_wall' ? 'campus_wall' : 'recommend';
  syncNewPostBoardUI();
}
window.selectNewPostBoard = selectNewPostBoard;

// Paint the active segment (neon-on-black) vs inactive for the board radio.
function syncNewPostBoardUI() {
  document.querySelectorAll('#newpost-board .newpost-board-seg').forEach(btn => {
    const active = btn.dataset.board === S.newPostBoard;
    btn.classList.toggle('bg-neon', active);
    btn.classList.toggle('text-black', active);
    btn.classList.toggle('text-on-surface-variant', !active);
  });
}

// Anonymous toggle → S.newPostAnonymous (post shows as 「匿名同学」, school kept).
function toggleNewPostAnonymous(checked) {
  S.newPostAnonymous = !!checked;
}
window.toggleNewPostAnonymous = toggleNewPostAnonymous;

function closeNewPostForm() {
  window.closeOverlay('overlay-new-post');
}
window.closeNewPostForm = closeNewPostForm;

function handlePostImages(e) {
  const files = Array.from(e.target.files || []);
  if (S.newPostImages.length + files.length > 4) {
    window.toast('Maximum 4 images');
    return;
  }
  files.forEach(f => window.readFileAsDataUrl(f, url => {
    S.newPostImages.push({
      file: f,
      preview: url
    });
    window.renderNewPostImages();
  }));
  e.target.value = '';
}
window.handlePostImages = handlePostImages;

function removeNewPostImage(idx) {
  S.newPostImages.splice(idx, 1);
  window.renderNewPostImages();
}
window.removeNewPostImage = removeNewPostImage;

function renderNewPostImages() {
  const c = document.getElementById('new-post-images');
  if (!c) return;
  c.innerHTML = S.newPostImages.map((img, i) => `<div class="relative aspect-square w-20 h-20 bg-surface-container-low rounded-[10px] overflow-hidden">
      <img src="${window.safeUrl(img.preview)}" class="w-full h-full object-cover">
      <button type="button" onclick="removeNewPostImage(${i})" class="absolute -top-1 -right-1 bg-primary text-white w-5 h-5 flex items-center justify-center hover:scale-110 transition-transform">
        <span class="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>`).join('') + (S.newPostImages.length < 4 ? `<button type="button" onclick="document.getElementById('post-image-input').click()" class="w-20 h-20 border border-dashed border-outline-variant flex items-center justify-center text-outline hover:border-primary hover:text-primary transition-all">
      <span class="material-symbols-outlined text-[24px] font-light">add</span>
    </button>` : '');
}
window.renderNewPostImages = renderNewPostImages;

async function submitNewPost() {
  // Guard against double submission while images upload + post is created (A15).
  if (S.isSubmittingPost) return;
  const title = document.getElementById('post-title')?.value?.trim() || '';
  const content = document.getElementById('post-content')?.value?.trim();
  if (!content) {
    window.toast('Please write something');
    return;
  }
  const publishBtn = document.querySelector('button[onclick="submitNewPost()"]');
  S.isSubmittingPost = true;
  if (publishBtn) publishBtn.disabled = true;
  try {
    const imageUrls = [];
    for (const img of S.newPostImages) {
      const url = await window.uploadImageFile(img.file);
      imageUrls.push(url);
    }
    const payload = {
      board: S.newPostBoard === 'campus_wall' ? 'campus_wall' : 'recommend',
      content,
      images: imageUrls,
      anonymous: !!S.newPostAnonymous
    };
    if (title) payload.title = title;
    // 投票帖：收集选项，强制校园墙，需审核
    if (S.newPostPoll) {
      const opts = [...document.querySelectorAll('#poll-option-list input')]
        .map(i => i.value.trim()).filter(Boolean);
      if (opts.length < 2) {
        window.toast('A poll needs at least 2 options');
        S.isSubmittingPost = false;
        if (publishBtn) publishBtn.disabled = false;
        return;
      }
      payload.postType = 'poll';
      payload.pollOptions = opts;
      payload.board = 'campus_wall';
    }
    await window.api('/square/v2/posts', 'POST', payload);
    window.toast(S.newPostPoll ? 'Poll submitted — it goes live after review' : 'Posted!');
    window.closeNewPostForm();
    S.newPostImages = [];
    const titleEl = document.getElementById('post-title');
    const contentEl = document.getElementById('post-content');
    if (titleEl) titleEl.value = '';
    if (contentEl) contentEl.value = '';
    // Switch the feed to the board we just posted to, then refresh.
    S.squareTab = payload.board;
    const segBtn = document.querySelector(`#square-tabs .square-seg[data-tab="${payload.board}"]`);
    if (segBtn) window.switchSquareTab(segBtn, payload.board);
    else window.loadSquareTab2();
  } catch (e) {
    window.toast('Post failed: ' + e.message);
  } finally {
    S.isSubmittingPost = false;
    if (publishBtn) publishBtn.disabled = false;
  }
}

// ========================================
// NOTIFICATIONS
// ========================================
window.submitNewPost = submitNewPost;

function formatPostTime(iso) {
  if (!iso) return '';
  const d = new Date(iso),
    now = new Date(),
    diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'M Ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'H Ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'D Ago';
  return d.toLocaleDateString();
}

// ========================================
// DOM INITIALIZATION
// ========================================
window.formatPostTime = formatPostTime;
