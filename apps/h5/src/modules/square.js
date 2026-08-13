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

// 双页翻页器辅助：按 tab 取 feed 容器 / 轨道定位
function feedEl(tab) {
  const t = (tab || S.squareTab) === 'campus_wall' ? 'campus_wall' : 'recommend';
  return document.getElementById('square-feed-' + t);
}
function trackEl() { return document.getElementById('square-track'); }
function pagerWidth() { return document.getElementById('square-pager')?.clientWidth || window.innerWidth; }
const PAGE_GAP = 12; // 两页之间留白 = 2× 帖子间距（与 index.html 轨道 gap 保持一致）
function trackOffset(tab) { return tab === 'campus_wall' ? -(pagerWidth() + PAGE_GAP) : 0; }
function setTrack(x, animate) {
  const t = trackEl();
  if (!t) return;
  t.style.transition = animate ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : 'none';
  t.style.transform = 'translateX(' + x + 'px)';
}
if (!window.__squarePagerResizeBound) {
  window.__squarePagerResizeBound = true;
  window.addEventListener('resize', () => setTrack(trackOffset(S.squareTab), false));
}

async function loadSquareTab() {
  // 进入广场时先定位下划线（容器刚变可见，offset 此刻才可测）；
  // 300ms 后再校一次，防 web 字体晚到导致文字宽度变化错位
  requestAnimationFrame(positionSquareInk);
  setTimeout(positionSquareInk, 300);
  setTrack(trackOffset(S.squareTab), false);
  // 每次进入广场是全新会话：两页各自的滚动位置记忆清零（隐藏期间 window 滚动已复位）
  S.squareScrollPos = { recommend: 0, campus_wall: 0 };
  // 双页都加载：滑动时另一页已是真实内容
  window.loadSquareTab2('recommend');
  window.loadSquareTab2('campus_wall');
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
  const prev = S.squareTab;
  // 两页滚动位置独立（用户反馈）：真正的滚动容器是 #tab-square 本身
  // （body overflow-hidden，window 不滚——8/10 生产实测），切换前记下离开页的位置
  const scroller = document.getElementById('tab-square') || document.scrollingElement || document.documentElement;
  if (prev !== tab) {
    S.squareScrollPos = S.squareScrollPos || {};
    S.squareScrollPos[prev] = scroller.scrollTop;
  }
  S.squareTab = tab;
  // The search box (#square-search) is shared by both tabs. Clear the query and
  // the input when switching so the new tab opens unfiltered instead of being
  // silently filtered by the previous tab's leftover search term. Also drop any
  // pending debounced search so it can't fire a stale query after the switch.
  clearTimeout(S._squareSearchTimer);
  S.squareSearchQuery = '';
  S.squareSearchUsers = []; // 同时清掉「同学」结果，否则切页后它会残留在新页顶部
  const searchEl = document.getElementById('square-search');
  if (searchEl) searchEl.value = '';
  // 关键词清空后右上角的「筛选中」高亮也要跟着灭
  const sBtn = document.getElementById('square-search-btn');
  if (sBtn) sBtn.style.color = '';
  const sClear = document.getElementById('square-search-clear');
  if (sClear) sClear.classList.add('hidden');
  // Toggle .active on the header segments (CSS .square-seg.active = neon underline).
  const container = el?.parentElement || document.getElementById('square-tabs');
  if (container) {
    container.querySelectorAll('.square-seg').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab || btn === el);
    });
  }
  positionSquareInk(); // 下划线滑到新选中项
  setTrack(trackOffset(tab), true); // 轨道滑到目标页
  // 点赞/详情同步的缓存指针跟着当前页走（loadSquareTab2 维护 by-tab 存储）
  S.squarePosts = (S.squarePostsByTab && S.squarePostsByTab[tab]) || [];
  // 切换不再无条件重拉（保住独立位置与浏览进度）：仅目标页为空
  // 或上次渲染是搜索结果（切页语义 = 清搜索）时才刷新
  const targetEl = feedEl(tab);
  const hasContent = !!targetEl?.querySelector('[data-post-id],[data-ad-id]');
  if (!hasContent || (S.squareRenderedSearch && S.squareRenderedSearch[tab])) {
    window.loadSquareTab2(tab);
  }
  // 恢复目标页自己的位置（进入页即时恢复，视觉焦点跟随新页）
  if (prev !== tab) scroller.scrollTop = (S.squareScrollPos && S.squareScrollPos[tab]) || 0;
}
window.switchSquareTab = switchSquareTab;

// 左右滑动切换 [推荐 | 校园墙]：双页轨道跟手拖动——拖动过程中另一页的
// 真实内容随之进入视口（ViewPager 式），松手过阈值滑到该页，否则弹回。
// 方向锁与竖向滚动/下拉刷新互不干扰。
function bindSquareSwipe() {
  const el = document.getElementById('tab-square');
  if (!el || el.dataset.swipeBound) return;
  el.dataset.swipeBound = '1';
  let sx = 0, sy = 0, active = false, horiz = null, dx = 0;
  el.addEventListener('touchstart', (e) => {
    if (active && e.touches.length > 1) return; // 手势中多指：忽略，不重置状态
    if (window.__fabDragging) { active = false; return; } // 正在拖动加号：不切页
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    active = true; horiz = null; dx = 0;
  }, { passive: true });
  // 非 passive：判定为横滑后 preventDefault 掐断竖向滚动，保证只水平移动（用户反馈）
  el.addEventListener('touchmove', (e) => {
    if (!active) return;
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (horiz === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      horiz = Math.abs(dx) > Math.abs(dy);
      el.dataset.horizLock = horiz ? '1' : '0';
      if (horiz) el.style.touchAction = 'none';
    }
    if (!horiz) return;
    if (e.cancelable) e.preventDefault();
    const target = dx < 0 ? 'campus_wall' : 'recommend';
    const damp = target === S.squareTab ? 0.3 : 1; // 越界方向橡皮筋
    setTrack(trackOffset(S.squareTab) + dx * damp, false);
  }, { passive: false });
  const settle = () => {
    if (!active) return;
    active = false;
    // 无条件复位（不受 !horiz 早退影响）：锁、标志、轨道都要回到位
    el.dataset.horizLock = '0';
    el.style.touchAction = '';
    if (!horiz) { setTrack(trackOffset(S.squareTab), true); return; }
    const target = dx < 0 ? 'campus_wall' : 'recommend';
    if (Math.abs(dx) >= 70 && target !== S.squareTab) {
      const btn = document.querySelector('#square-tabs .square-seg[data-tab="' + target + '"]');
      window.switchSquareTab(btn, target); // 内部会把轨道动画滑到目标页
    } else {
      setTrack(trackOffset(S.squareTab), true); // 弹回当前页
    }
  };
  // 绑到 document：触点所在卡片被 innerHTML 替换后事件不再冒泡到 #tab-square（审计 #2）
  document.addEventListener('touchend', settle, { passive: true });
  document.addEventListener('touchcancel', settle, { passive: true });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindSquareSwipe);
} else {
  bindSquareSwipe();
}

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

// ── 搜索：右上角图标展开搜索条，输入后点「Search」或回车执行（用户反馈：需要搜索按钮）──
function toggleSquareSearch(force) {
  const bar = document.getElementById('square-search-bar');
  if (!bar) return;
  const show = force != null ? force : bar.classList.contains('hidden');
  bar.classList.toggle('hidden', !show);
  const input = document.getElementById('square-search');
  if (show) setTimeout(() => input?.focus(), 50);
  // 收起只隐藏：保留关键词与结果（审计 #4/#5/#15——此前收起即清空，
  // 点搜索结果进详情返回后结果全没了）。清空只由 X 按钮触发。
  syncSearchPadding();
  window.positionSquareInk?.();
}

// 搜索条展开会撑高顶栏：同步内容区上边距，避免首行结果被压在顶栏下（审计 #6/#8/#13/#17）
function syncSearchPadding() {
  const header = document.querySelector('#tab-square header');
  const main = document.querySelector('#tab-square main');
  if (!header || !main) return;
  requestAnimationFrame(() => {
    main.style.paddingTop = (header.offsetHeight + 6) + 'px';
  });
}
window.syncSearchPadding = syncSearchPadding;
window.toggleSquareSearch = toggleSquareSearch;

function runSquareSearch() {
  const input = document.getElementById('square-search');
  const q = (input?.value || '').trim();
  clearTimeout(S._squareSearchTimer);
  S.squareSearchQuery = q;
  document.getElementById('square-search-clear')?.classList.toggle('hidden', !q);
  // 搜索条收起后信息流仍是过滤结果：右上角图标变荧光绿提示「当前有筛选」
  const btn = document.getElementById('square-search-btn');
  if (btn) btn.style.color = q ? '#CCFF00' : '';
  input?.blur();
  window.loadSquareTab2(S.squareTab);
}
window.runSquareSearch = runSquareSearch;

function clearSquareSearch() {
  const input = document.getElementById('square-search');
  if (input) input.value = '';
  runSquareSearch();
  input?.focus();
}
window.clearSquareSearch = clearSquareSearch;

// 点搜索区域以外 → 收起搜索条（用户反馈）
if (!window.__squareSearchOutsideBound) {
  window.__squareSearchOutsideBound = true;
  document.addEventListener('click', (e) => {
    const bar = document.getElementById('square-search-bar');
    if (!bar || bar.classList.contains('hidden')) return;
    if (bar.contains(e.target)) return;
    if (document.getElementById('square-search-btn')?.contains(e.target)) return;
    if (document.getElementById('square-pager')?.contains(e.target)) return; // 点信息流不收起
    window.toggleSquareSearch(false);
  }, true);
}

// ── 发帖按钮可拖动（用户反馈：不要固定死）──
// 拖动后位置记住（localStorage），点击仍是发帖；边缘吸附并夹在安全区内。
function bindFabDrag() {
  const fab = document.getElementById('square-fab');
  if (!fab || fab.dataset.dragBound) return;
  fab.dataset.dragBound = '1';
  const KEY = 'cl_fab_pos';
  const place = (x, y) => {
    const w = fab.offsetWidth || 56, h2 = fab.offsetHeight || 56;
    const maxX = window.innerWidth - w - 8, maxY = window.innerHeight - h2 - 8;
    const cx = Math.max(8, Math.min(maxX, x)), cy = Math.max(70, Math.min(maxY, y));
    fab.style.left = cx + 'px';
    fab.style.top = cy + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    return { x: cx, y: cy };
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved.x === 'number') place(saved.x, saved.y);
  } catch (e) {}
  let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
  fab.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    const t = e.touches[0];
    const r = fab.getBoundingClientRect();
    sx = t.clientX; sy = t.clientY; ox = r.left; oy = r.top;
    moved = false; dragging = true;
    window.__fabDragging = true; // 拖加号期间禁用页面横滑切页（用户反馈：不能同时进行）
    fab.style.transition = 'none';
  }, { passive: true });
  fab.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.stopPropagation();
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return; // 小抖动仍算点击
    moved = true;
    if (e.cancelable) e.preventDefault(); // 拖动时不滚页面
    place(ox + dx, oy + dy);
  }, { passive: false });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    window.__fabDragging = false;
    fab.style.transition = '';
    if (!moved) return;
    // 左右就近吸附
    const r = fab.getBoundingClientRect();
    const toRight = r.left + r.width / 2 > window.innerWidth / 2;
    fab.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
    const pos = place(toRight ? window.innerWidth - r.width - 20 : 20, r.top);
    try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch (e) {}
    setTimeout(() => { fab.style.transition = ''; }, 220);
  };
  fab.addEventListener('touchend', end);
  fab.addEventListener('touchcancel', end);
  // 拖动过后的这次 touch 不触发点击
  fab.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  window.addEventListener('resize', () => {
    // 广场页隐藏时 rect 全 0，按它重排会把按钮甩到左上角（审计 #9/#14）
    if (!fab.offsetParent) return;
    const r = fab.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (fab.style.left) place(r.left, r.top);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindFabDrag);
else bindFabDrag();

// Load the current tab's feed: GET /square/v2/recommend or /campus-wall.
// Campus wall with no profile.school → empty state prompting to complete it.
async function loadSquareTab2(tabArg) {
  const tab = (tabArg || S.squareTab) === 'campus_wall' ? 'campus_wall' : 'recommend';
  const container = feedEl(tab);
  if (!container) return;
  // 竞态守卫按 tab 分桶：两页并行加载互不覆盖
  if (!S.squareReqSeqs) S.squareReqSeqs = { recommend: 0, campus_wall: 0 };
  const seq = ++S.squareReqSeqs[tab];
  const search = (S.squareSearchQuery || '').trim();
  const endpoint = tab === 'campus_wall' ? '/square/v2/campus-wall' : '/square/v2/recommend';
  try {
    // 搜索态走统一搜索端点：一次返回「帖子 + 同学」两组结果。
    // 非搜索态仍走原信息流端点，混排/广告逻辑完全不变。
    const url = search
      ? `/square/v2/search?q=${encodeURIComponent(search)}&board=${tab}&page=1&limit=20`
      : `${endpoint}?page=1&limit=20`;
    // 推荐流首页并行拉广告（ADMIN-REDESIGN §6）：校园墙不插广告，搜索态不插，
    // 无学校资料不请求（fetchSquareAds 内部判定）。广告失败静默为空，不影响正常流。
    const wantAds = tab === 'recommend' && !search;
    const [data, ads] = await Promise.all([
      window.api(url),
      wantAds ? fetchSquareAds() : Promise.resolve([]),
    ]);
    if (seq !== S.squareReqSeqs[tab]) return; // superseded by a newer load
    const raw = unwrap(data);
    // 统一搜索的外层是 { query, posts: {...}, users: [...] }，信息流是 { items: [...] }
    const env = search ? unwrap(raw.posts) : raw;
    S.squareSearchUsers = search ? (raw.users || []) : [];
    // 记录本次渲染是否为搜索结果（切页时据此决定是否重拉为未过滤流）
    S.squareRenderedSearch = S.squareRenderedSearch || {};
    S.squareRenderedSearch[tab] = !!search;
    S.squarePostsByTab = S.squarePostsByTab || {};
    // Campus wall asks the user to complete their school first.
    if (tab === 'campus_wall' && env.needProfileSchool) {
      S.squarePostsByTab[tab] = [];
      if (tab === S.squareTab) S.squarePosts = [];
      renderSquareNeedSchool(tab);
      return;
    }
    const posts = Array.isArray(env) ? env : (env.items || env.posts || []);
    S.squarePostsByTab[tab] = posts; // 两页各自缓存（切页时指针跟随）
    if (tab === S.squareTab) S.squarePosts = posts; // 缓存当前页数据（点赞/详情同步用）
    renderSquareFeed(posts, ads, tab);
  } catch (e) {
    if (seq !== S.squareReqSeqs[tab]) return; // superseded; don't clobber newer view
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
function renderSquareNeedSchool(tab) {
  const container = feedEl(tab);
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
function renderSquareFeed(posts, ads = [], tab) {
  const container = feedEl(tab);
  if (!container) return;
  // 搜索到的同学：整行卡片置于结果最上方（非搜索态为空串，信息流完全不受影响）
  const peopleBlock = renderSearchPeople();
  if (!posts.length) {
    container.innerHTML = peopleBlock + `<div class="col-span-2 text-center py-24">
      ${window.flatEmptyIcon('grid_view')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">${
        (S.squareSearchQuery || '').trim() ? 'No posts found' : 'No posts yet'
      }</p>
      <p class="text-sm text-on-surface-variant mt-2">${
        (S.squareSearchQuery || '').trim()
          ? 'Try a different keyword'
          : 'Be the first to share a moment'
      }</p>
    </div>`;
    layoutSquareMasonry();
    return;
  }
  const kindOf = (p) => {
    if (isOfficial(p)) return 'large';
    // 校园墙帖（board=campus_wall，API 返回大写）始终用竖排大卡——即使在推荐里也保持校园墙样式（本轮反馈5a）。
    if (String(p.board || '').toLowerCase() === 'campus_wall') return 'wide';
    return ((tab || S.squareTab) === 'campus_wall') ? 'wide' : 'small';
  };
  // 单一 dense 网格（容器在 index.html 设为 grid grid-cols-2 + grid-flow-row-dense）：
  // 小卡占 1 列（每行两个），官方大卡 / 校园墙卡跨 2 列（整行）。dense 自动回填空格，
  // 奇数小卡或被大卡打断都不再留视觉空位。
  // 广告插入规则（ADMIN-REDESIGN §6）：首屏第 3 个卡位后插 1 个，此后每 8 个小卡
  // 插 1 个；按拉取顺序轮换，本次渲染内不重复，用完即止。校园墙调用方传空 ads。
  let html = peopleBlock;
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
  // 后发尺寸变化（容器宽度迟定/图片/翻译/字体）自动重排——间距 bug 根修
  observeMasonryItems();
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

// ── 瀑布流：#square-feed 为 grid-auto-rows:1px + row-gap:0 的网格，
// 每张卡按自身内容高度 + 6px 间距换算 grid-row span（n = ⌈h⌉+SP），
// 卡片垂直间距恒为 6px（旧 2px 行 + 6px 行距方案取整后会浮动到 6–13px）。
let masonryRaf = null;
let masonryRafFallback = null;
function scheduleMasonry() {
  if (masonryRaf) return;
  masonryRaf = requestAnimationFrame(() => {
    masonryRaf = null;
    if (masonryRafFallback) { clearTimeout(masonryRafFallback); masonryRafFallback = null; }
    layoutSquareMasonry();
  });
  // rAF 在页面不可见/渲染暂停时不触发，重排会被无限搁置（后台加载完的图片
  // 回到前台前 span 一直是错的）→ 超时兜底保证最终一定重排一次。
  if (!masonryRafFallback) {
    masonryRafFallback = setTimeout(() => {
      masonryRafFallback = null;
      if (masonryRaf) { cancelAnimationFrame(masonryRaf); masonryRaf = null; }
      layoutSquareMasonry();
    }, 250);
  }
}
function layoutSquareMasonry() {
  const SP = 6; // 卡片垂直间距（1px auto-row / row-gap 0，与 main.css .square-feed-grid 绑定）
  ['recommend', 'campus_wall'].forEach((t) => {
    const c = feedEl(t);
    if (!c) return;
    const items = Array.from(c.children);
    if (!items.length) return;
    items.forEach(it => { it.style.gridRowEnd = 'auto'; });
    const heights = items.map(it => it.getBoundingClientRect().height);
    // 显式列/行定位（真瀑布流，行距 bug 根修）：此前靠 grid dense 自动回填，
    // 它按「最早可用行」而非「最短列」选位——两列高度不平衡时，后面的跨栏卡
    // （校园墙卡/官方卡/广告）会把长列旁的空洞整段封死，表现为帖子间大段留白。
    // 改为 JS 自排：单列卡进较短列；跨栏卡压在两列最大行之后，它抬高短列时产生
    // 的洞记入 holes，后续放得下的单列卡优先回填（视觉顺序微调，换来无大段留白）。
    let col1 = 1, col2 = 1; // 两列各自的下一空行（1-based grid row）
    const holes = []; // { col: 1|2, start, size }（单位 = 1px grid row）
    const place = (it, col, row, n) => {
      it.style.gridColumn = col === 0 ? '1 / -1' : String(col);
      it.style.gridRowStart = String(row);
      it.style.gridRowEnd = `span ${n}`;
    };
    items.forEach((it, i) => {
      const n = Math.max(1, Math.ceil(heights[i]) + SP);
      if (it.classList.contains('col-span-2')) {
        const row = Math.max(col1, col2);
        if (row - col1 > 0) holes.push({ col: 1, start: col1, size: row - col1 });
        if (row - col2 > 0) holes.push({ col: 2, start: col2, size: row - col2 });
        place(it, 0, row, n);
        col1 = col2 = row + n;
      } else {
        const hi = holes.findIndex(h => h.size >= n);
        if (hi >= 0) {
          const h = holes[hi];
          place(it, h.col, h.start, n);
          h.start += n; h.size -= n;
          if (h.size < 30) holes.splice(hi, 1); // 剩口塞不下最矮卡，不再尝试
        } else {
          const useFirst = col1 <= col2;
          const row = useFirst ? col1 : col2;
          place(it, useFirst ? 1 : 2, row, n);
          if (useFirst) col1 = row + n; else col2 = row + n;
        }
      }
    });
  });
}
window.layoutSquareMasonry = layoutSquareMasonry;
if (!window.__masonryResizeBound) {
  window.__masonryResizeBound = true;
  window.addEventListener('resize', scheduleMasonry);
  // 字体晚到会改文字卡高度，span 过期 → 字体就绪后补一次重排
  if (document.fonts?.ready) document.fonts.ready.then(() => scheduleMasonry());
}

// ── 卡片尺寸观察（间距 bug 根修）：span 只在 layout 一瞬按当时高度算，此后任何
// 尺寸变化（容器宽度迟定、图片加载、翻译换行、字体替换、隐藏→显示）都会让 span
// 过期 → 行距忽大忽小。ResizeObserver 盯每张卡，尺寸一变就重排。
// 注意：不 observe 容器本身（写 span 会改容器高，观察容器会无限循环）；
// 卡片自身高度与 span 无关（items-start），写 span 不触发回调，不会循环。
let masonryRO = null;
function observeMasonryItems() {
  if (typeof ResizeObserver === 'undefined') return;
  if (!masonryRO) masonryRO = new ResizeObserver(() => scheduleMasonry());
  // 每次渲染整体重挂：旧卡已被 innerHTML 替换（RO 对失联节点持强引用，先断开防泄漏）
  masonryRO.disconnect();
  ['recommend', 'campus_wall'].forEach((t) => {
    const c = feedEl(t);
    if (c) Array.from(c.children).forEach((el) => masonryRO.observe(el));
  });
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
  return `<span class="school-badge" data-no-i18n>${window.escapeHtml(window.metaLabel(school))}</span>`;
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
      ${ev.school ? `<span class="text-[10px] text-outline tracking-widest">${window.escapeHtml(window.metaLabel(ev.school))}</span>` : ''}
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

// 卡片底部作者行（用户反馈：卡片只留 标题 + 头像/昵称 + 点赞，去掉时间与学校）
function cardAuthorRow(p) {
  const d = postAuthorDisplay(p);
  return `<div class="flex items-center justify-between gap-2 mt-1.5">
    <div class="flex items-center gap-1.5 min-w-0" data-no-i18n>
      ${avatarChip(d, d.name, 'w-4 h-4 shrink-0', 'text-[7px]', '')}
      <span class="text-neutral-400 text-[11px] truncate">${window.escapeHtml(d.name)}</span>
    </div>
    ${postLikeButton(p)}
  </div>`;
}

// ── 搜索结果里的「同学」区（整行，置于帖子结果之上）─────────────────
// 数据来自 GET /square/v2/search 的 users 字段；非搜索态 S.squareSearchUsers 为空，
// 返回空串，普通信息流的 DOM 完全不变。
function renderSearchPeople() {
  const users = S.squareSearchUsers || [];
  if (!users.length) return '';
  const rows = users.map((u) => window.userResultRow(u, { compact: true })).join('');
  return `<div class="col-span-2 mb-1.5">
    <div class="bg-surface-container-lowest border border-outline-variant/10 rounded-[6px] overflow-hidden">
      <div class="px-4 pt-3 pb-1 font-headline text-[10px] font-bold tracking-[0.2em] text-outline">PEOPLE</div>
      ${rows}
    </div>
  </div>`;
}

// 命中评论时的片段行（P1-9）：只有搜索命中的是评论、而帖子本身没命中时后端才下发
// commentSnippet，用来回答「我搜的词明明不在这帖里，为什么搜到它」。
// 片段是用户内容 → data-no-i18n，防被全局词典误翻。
function commentSnippetLine(p) {
  if (!p.commentSnippet) return '';
  // data-no-i18n 只包住评论正文，不能包整行——否则会连带把「COMMENT」标签也挡在
  // 词典之外，中文态标签漏译成英文（实测踩过）。标签在外层保持可译。
  return `<p class="text-[11px] text-outline leading-snug mt-1 pl-2 border-l-2 border-neon/60" style="${clampStyle(2)}">
    <span class="font-headline text-[9px] font-bold tracking-[0.15em] mr-1">COMMENT</span><span data-no-i18n>${window.escapeHtml(p.commentSnippet)}</span>
  </p>`;
}

// Full-width text-only fallback card (also the no-image fallback for official
// posts). Shows official / Sponsored badge + school pill on a top header row.
function bentoTextCard(p) {
  const badge = officialBadge(p);
  // 卡片不再显示学校（用户反馈：信息太多）；官方/赞助徽标保留
  const header = badge ? `<div class="flex items-center gap-2 mb-3">${badge}</div>` : '';
  return `<article data-post-id="${p.id}" class="bg-surface-container-lowest p-4 border border-outline-variant/10 shadow-sm cursor-pointer rounded-[6px]" onclick="openPostDetail('${p.id}')">
    ${header}
    ${p.title ? `<h3 class="font-headline font-bold text-lg tracking-tight mb-2">${window.escapeHtml(p.title)}</h3>` : ''}
    ${eventStrip(p)}
    <p class="text-sm text-on-surface-variant leading-relaxed mb-2" style="${clampStyle(4)}">${window.escapeHtml(p.content || '')}</p>
    ${cardAuthorRow(p)}
  </article>`;
}

// Card type 1 (official, authorType ≠ USER): large featured card (aspect 4/5)
// with official / Sponsored badge top-left and school pill top-right.
function bentoLargeCard(p) {
  const img = (p.images || [])[0];
  if (!img) return bentoTextCard(p);
  const badge = officialBadge(p);
  // 图片贴满卡片上/左/右边缘（卡片 overflow-hidden 裁出圆角）；右上角学校已去掉（用户反馈），
  // 底部只留 标题 + 头像/昵称 + 点赞
  return `<article data-post-id="${p.id}" class="group cursor-pointer bg-surface-container-lowest rounded-[6px] overflow-hidden" onclick="openPostDetail('${p.id}')">
    <div class="relative overflow-hidden aspect-[4/5] bg-surface-container">
      <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="${window.safeUrl(img)}" onerror="this.style.display='none'">
      ${badge ? `<div class="absolute top-4 left-4">${badge}</div>` : ''}
    </div>
    <div class="min-w-0 px-3 pt-2 pb-2">
      ${p.title ? `<h3 class="font-headline font-bold text-lg tracking-tight">${window.escapeHtml(p.title)}</h3>` : ''}
      ${eventStrip(p)}
      ${cardAuthorRow(p)}
    </div>
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
  const media = img
    // 图片卡高度随图片原始比例（小红书式瀑布流，本轮反馈5）；过长/过扁由 .rec-img 的 min/max-height 收敛
    ? `<div class="relative bg-surface-container overflow-hidden"><img class="rec-img" src="${window.safeUrl(img)}" onerror="this.parentElement.style.display='none'"></div>`
    // 纯文字小卡（本轮反馈5b）：文字居中、可爱字体、放大、随机低饱和浅色底；点开详情仍照旧。
    : `<div class="relative aspect-[3/4] overflow-hidden flex items-center justify-center text-center p-4" style="background:${pastelBg(p.id)}"><p class="font-cute" style="font-size:clamp(1.3rem,7vw,2rem);line-height:1.3;color:#3a3a3a;${clampStyle(5)}">${window.escapeHtml(p.title || p.content || '')}</p></div>`;
  // 底部只留 标题 + 头像/昵称 + 点赞（用户反馈：学校/时间去掉，信息太多）
  // 标题放大到 13px 并允许两行，白色文字区留白加大（用户反馈）
  return `<article data-post-id="${p.id}" class="bg-surface-container-lowest rounded-[6px] overflow-hidden cursor-pointer" onclick="openPostDetail('${p.id}')">
    ${media}
    <div class="px-2.5 pb-2.5 pt-2">
      <p class="font-headline text-[13px] font-bold tracking-tight leading-snug" style="${clampStyle(2)}" data-no-i18n>${window.escapeHtml(p.title || (p.content || '').substring(0, 60))}</p>
      ${commentSnippetLine(p)}
      ${cardAuthorRow(p)}
    </div>
  </article>`;
}

// Card type 2 (campus_wall + USER): wide single-column card with author header
// (avatar + name on top), big image, content, like + comment counts.
// Anonymous-aware (匿名同学 + placeholder avatar)；学校徽标已按用户反馈移除（详情页仍显示）。
function bentoWideCard(p) {
  const img = (p.images || [])[0];
  const d = postAuthorDisplay(p);
  // 竖排卡片（对齐截图）：作者头像行 + 全宽横图 + 标题/正文 + 点赞/评论
  return `<article data-post-id="${p.id}" class="bg-surface-container-lowest p-4 border border-outline-variant/10 shadow-sm cursor-pointer rounded-[6px]" onclick="openPostDetail('${p.id}')">
    <div class="flex items-center gap-3 mb-4">
      ${renderAuthorAvatars(p)}
      <div class="min-w-0 flex-1">
        <p class="font-headline text-base font-bold truncate" data-no-i18n>${window.escapeHtml(d.name)}</p>
        <p class="text-[10px] text-neutral-400 font-medium tracking-widest" data-no-i18n>${window.formatPostTime(p.createdAt)}</p>
      </div>
    </div>
    ${img ? `<div class="aspect-video bg-surface-container overflow-hidden mb-2 rounded-[6px]"><img class="w-full h-full object-cover" src="${window.safeUrl(img)}" onerror="this.parentElement.style.display='none'"></div>` : ''}
    ${p.title ? `<p class="font-headline font-bold text-base tracking-tight mb-1">${window.escapeHtml(p.title)}</p>` : ''}
    <p class="text-sm text-on-surface-variant leading-relaxed mb-1" style="${clampStyle(3)}">${window.escapeHtml(p.content || '')}</p>
    ${commentSnippetLine(p)}
    <div class="mb-3"></div>
    ${pollBlock(p)}
    <div class="flex items-center justify-between">
      <button class="flex items-center gap-1 text-neutral-400 active:scale-95 transition-transform" onclick="event.stopPropagation();openPostDetail('${p.id}', true)"><span class="material-symbols-outlined text-sm">chat_bubble</span><span class="text-xs font-bold" data-comment-count>${p.commentCount || 0}</span></button>
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
  const cards = [...document.querySelectorAll('#square-track [data-post-id="' + postId + '"]')];
  if (!cards.length) return;
  cards.forEach((card) => {
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
  });
}

// ========================================
// POST DETAIL & COMMENTS
// ========================================
window.likePost = likePost;

// ========================================
// POST DETAIL & COMMENTS
// ========================================
async function openPostDetail(postId, focusComposer = false) {
  S.currentPostId = postId;
  window.openOverlay('post-detail-overlay');
  await window.loadPostDetail(postId);
  // 从卡片评论数点进来：内容渲染完后直接跳到评论输入条
  if (focusComposer && S.currentPostId === postId) focusPdComposer();
}
window.openPostDetail = openPostDetail;

// 评论数点击 → 滚到评论区并聚焦输入框。
// 输入条现在是固定页脚（恒可见），所以滚的是评论区标题而不是输入条本身。
function focusPdComposer() {
  const head = document.querySelector('#pd-content [data-pd-comments]');
  if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('comment-input')?.focus({ preventScroll: true });
}
window.focusPdComposer = focusPdComposer;

// ── 举报（帖子 / 评论）──
// 防误触：两步交互——先确认卡（说明后果），再填原因卡；任一步取消即中止。
async function askReportReason(titleZh, titleEn) {
  const zh = (window.getLang?.() === 'zh');
  const ok = await window.confirmCard({
    title: zh ? titleZh : titleEn,
    body: zh
      ? '举报会交由管理员人工审核。恶意或重复的虚假举报可能影响你的账号。'
      : 'Reports are reviewed by our moderators. Repeated false reports may limit your account.',
    confirmLabel: zh ? '继续举报' : 'Continue',
    cancelLabel: zh ? '取消' : 'Cancel',
    danger: true,
  });
  if (!ok) return null;
  const reason = await window.promptCard({
    title: zh ? '举报原因' : 'Report reason',
    label: zh ? '垃圾广告 / 骚扰辱骂 / 不适内容 / 虚假信息' : 'Spam · Harassment · Explicit · False info',
    placeholder: zh ? '简单说明原因（可留空）' : 'Briefly describe the issue (optional)',
    confirmLabel: zh ? '提交举报' : 'Submit report',
    cancelLabel: zh ? '取消' : 'Cancel',
    multiline: true,
  });
  if (reason === null) return null; // 第二步取消
  return (reason || '').trim() || (zh ? '未填写原因' : 'No reason given');
}

function reportDoneToast(err) {
  const zh = (window.getLang?.() === 'zh');
  if (err) window.toast(err?.message || (zh ? '举报失败，请重试' : 'Failed to report'));
  else window.toast(zh ? '举报已提交，我们会尽快处理' : 'Report submitted — thanks for flagging');
}

// 帖子操作卡（页眉「更多」弹出）：分享 / 举报，与评论长按卡同一形式
function openPdPostMenu(ev) {
  document.querySelectorAll('.pd-cm-menu').forEach((e) => e.remove());
  const zh = (window.getLang?.() === 'zh');
  const row = (icon, label, attr) =>
    `<button ${attr} class="w-full text-left px-4 py-2.5 flex items-center gap-2.5 active:bg-surface-container transition-colors">
      <span class="material-symbols-outlined text-outline" style="font-size:18px">${icon}</span>
      <span class="text-sm text-on-surface" data-no-i18n>${label}</span>
    </button>`;
  const menu = document.createElement('div');
  menu.className = 'pd-cm-menu fixed z-[130] min-w-[148px] bg-surface-container-lowest border border-outline-variant/30 rounded-[12px] shadow-2xl py-1 overflow-hidden';
  menu.innerHTML =
    row('ios_share', zh ? '分享' : 'Share', 'data-share') +
    row('flag', zh ? '举报帖子' : 'Report post', 'data-report');
  const btn = document.getElementById('pd-report-btn');
  const r = btn ? btn.getBoundingClientRect() : { left: (ev?.clientX || 0), bottom: (ev?.clientY || 0) };
  menu.style.left = Math.max(8, Math.min(r.left - 100, window.innerWidth - 164)) + 'px';
  menu.style.top = (r.bottom + 6) + 'px';
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.querySelector('[data-share]').onclick = () => { close(); sharePdPost(); };
  menu.querySelector('[data-report]').onclick = () => { close(); reportPdPost(); };
  setTimeout(() => document.addEventListener('click', function once() {
    close(); document.removeEventListener('click', once);
  }), 10);
}
window.openPdPostMenu = openPdPostMenu;

async function sharePdPost() {
  const zh = (window.getLang?.() === 'zh');
  const p = S.pdPostData || {};
  const title = p.title || 'Unimatcha';
  const text = p.content ? String(p.content).slice(0, 140) : title;
  const url = location.origin || 'https://app.unimatcha.ai';
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
    window.toast(zh ? '已复制到剪贴板' : 'Copied to clipboard');
  } catch (e) {
    if (e?.name === 'AbortError') return;
    window.toast(zh ? '分享失败' : 'Share failed');
  }
}
window.sharePdPost = sharePdPost;

async function reportPdPost() {
  const postId = S.currentPostId;
  if (!postId) return;
  const reason = await askReportReason('举报这条帖子？', 'Report this post?');
  if (reason === null) return;
  try {
    await window.api(`/square/v2/posts/${postId}/report`, 'POST', { reason });
    reportDoneToast();
  } catch (e) { reportDoneToast(e); }
}
window.reportPdPost = reportPdPost;

// 取楼层正文（举报内容里带摘要，便于后台定位）
function pdCommentText(commentId) {
  for (const cm of (S.pdPostData?.comments || [])) {
    if (cm.id === commentId) return cm.content || '';
    const r = (cm.replies || []).find(x => x.id === commentId);
    if (r) return r.content || '';
  }
  return '';
}

// 评论举报走通用 /reports（category=content）：后端没有评论专用举报接口，
// 内容里带 commentId/postId + 正文摘要，管理后台「用户反馈」可直接定位。
async function reportPdComment(commentId) {
  if (!commentId) return;
  // 入口快照：确认卡期间用户可能已关掉详情页（S.currentPostId/pdPostData 被清）
  const postId = S.currentPostId || '';
  const snippet = pdCommentText(commentId).slice(0, 300);
  const reason = await askReportReason('举报这条评论？', 'Report this comment?');
  if (reason === null) return;
  try {
    await window.api('/reports', 'POST', {
      category: 'content',
      content: `[comment] commentId=${commentId} postId=${postId}\nreason: ${reason}\ntext: ${snippet}`,
    });
    reportDoneToast();
  } catch (e) { reportDoneToast(e); }
}
window.reportPdComment = reportPdComment;

// ── 评论点赞 ──
// 在 S.pdPostData 的楼层树里就地更新点赞态（父楼 + 回复都覆盖）
function applyPdCommentLike(commentId, liked, likeCount) {
  const walk = (c) => {
    if (!c) return false;
    if (c.id === commentId) { c.myLiked = liked; c.likeCount = likeCount; return true; }
    return (c.replies || []).some(walk);
  };
  (S.pdPostData?.comments || []).some(walk);
}

function findPdComment(commentId) {
  for (const cm of (S.pdPostData?.comments || [])) {
    if (cm.id === commentId) return cm;
    const r = (cm.replies || []).find(x => x.id === commentId);
    if (r) return r;
  }
  return null;
}

async function likePdComment(commentId, btn) {
  if (!commentId) return;
  try {
    const data = await window.api(`/square/v2/comments/${commentId}/like`, 'POST');
    const res = unwrap(data);
    const liked = !!res.liked;
    const count = res.likeCount != null ? res.likeCount : 0;
    applyPdCommentLike(commentId, liked, count);
    // 就地刷新按钮（不整页重渲染，保住滚动位置）
    const row = document.querySelector(`[data-comment-id="${commentId}"]`);
    const icon = (btn || row)?.querySelector?.('[data-cm-like-icon]') || row?.querySelector('[data-cm-like-icon]');
    const cnt = (btn || row)?.querySelector?.('[data-cm-like-count]') || row?.querySelector('[data-cm-like-count]');
    if (icon) {
      icon.style.fontVariationSettings = `'FILL' ${liked ? 1 : 0}`;
      icon.classList.toggle('text-neon-pink', liked);
    }
    if (cnt) cnt.textContent = String(count);
  } catch (e) {
    window.toast(e?.message || 'Failed to like');
  }
}
window.likePdComment = likePdComment;

// ── 评论分享 ──
// 优先系统分享面板（移动端），不支持则复制到剪贴板。
async function sharePdComment(commentId) {
  const zh = (window.getLang?.() === 'zh');
  const text = pdCommentText(commentId);
  const title = S.pdPostData?.title || 'Unimatcha';
  const url = location.origin || 'https://app.unimatcha.ai';
  const payload = `${text}\n— ${title} · Unimatcha\n${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
    await navigator.clipboard.writeText(payload);
    window.toast(zh ? '已复制到剪贴板' : 'Copied to clipboard');
  } catch (e) {
    if (e?.name === 'AbortError') return; // 用户在系统面板里取消
    window.toast(zh ? '分享失败' : 'Share failed');
  }
}
window.sharePdComment = sharePdComment;

// ── 评论操作卡（长按弹出）：分享 / 点赞 / 举报 ──
function openPdCommentMenu(commentId, x, y) {
  document.querySelectorAll('.pd-cm-menu').forEach((e) => e.remove());
  const zh = (window.getLang?.() === 'zh');
  const cm = findPdComment(commentId);
  const liked = !!cm?.myLiked;
  const row = (icon, label, attr) =>
    `<button ${attr} class="w-full text-left px-4 py-2.5 flex items-center gap-2.5 active:bg-surface-container transition-colors">
      <span class="material-symbols-outlined text-outline" style="font-size:18px">${icon}</span>
      <span class="text-sm text-on-surface" data-no-i18n>${label}</span>
    </button>`;
  const menu = document.createElement('div');
  menu.className = 'pd-cm-menu fixed z-[130] min-w-[148px] bg-surface-container-lowest border border-outline-variant/30 rounded-[12px] shadow-2xl py-1 overflow-hidden';
  menu.innerHTML =
    row('ios_share', zh ? '分享' : 'Share', 'data-share') +
    row(liked ? 'heart_minus' : 'favorite', liked ? (zh ? '取消点赞' : 'Unlike') : (zh ? '点赞' : 'Like'), 'data-like') +
    row('flag', zh ? '举报' : 'Report', 'data-report');
  // 贴着长按点弹出，右/下边界内收避免溢出屏幕
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - 164)) + 'px';
  menu.style.top = Math.max(8, Math.min(y + 8, window.innerHeight - 150)) + 'px';
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.querySelector('[data-share]').onclick = () => { close(); sharePdComment(commentId); };
  menu.querySelector('[data-like]').onclick = () => { close(); likePdComment(commentId); };
  menu.querySelector('[data-report]').onclick = () => { close(); reportPdComment(commentId); };
  // 下一帧再挂全局关闭，避免本次 touchend/click 立刻把菜单关掉
  setTimeout(() => document.addEventListener('click', function once() {
    close(); document.removeEventListener('click', once);
  }), 10);
}
window.openPdCommentMenu = openPdCommentMenu;

// 评论长按 600ms 弹操作卡：事件委托绑在 #pd-content 上（只绑一次，渲染重置不受影响）。
// 手指移动 >10px 视为滚动，取消长按；桌面右键同样触发。
function bindPdCommentLongPress() {
  const root = document.getElementById('pd-content');
  if (!root || root.dataset.lpBound) return;
  root.dataset.lpBound = '1';
  let timer = null, sx = 0, sy = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  root.addEventListener('touchstart', (e) => {
    cancel();
    const el = e.target.closest?.('[data-comment-id]');
    // 点赞/回复按钮上不触发长按（避免与直接点击冲突）
    if (!el || e.target.closest?.('button')) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    const id = el.dataset.commentId;
    timer = setTimeout(() => {
      timer = null;
      try { navigator.vibrate?.(15); } catch (err) { /* 不支持震动：忽略 */ }
      openPdCommentMenu(id, sx, sy);
    }, 600);
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancel();
  }, { passive: true });
  root.addEventListener('touchend', cancel, { passive: true });
  root.addEventListener('touchcancel', cancel, { passive: true });
  root.addEventListener('contextmenu', (e) => {
    const el = e.target.closest?.('[data-comment-id]');
    if (!el) return;
    e.preventDefault();
    openPdCommentMenu(el.dataset.commentId, e.clientX, e.clientY);
  });
}
window.bindPdCommentLongPress = bindPdCommentLongPress;

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
  // 楼层收紧：回复行头像缩小并缩进到父楼内容起点（32px 头像 + 12px 间距）
  const avSize = isReply ? 'w-7 h-7' : 'w-8 h-8';
  const liked = !!cm.myLiked;
  const likeCount = cm.likeCount || 0;
  // 楼主标记改为名字后的小圆点 + 「作者」轻字（原黑底徽标过重）
  const authorTag = isAuthor
    ? `<span class="shrink-0 inline-flex items-center gap-1 text-[10px] text-primary/70 font-medium" data-no-i18n><span class="w-1 h-1 rounded-full bg-primary/60"></span><span>${(window.getLang?.() === 'zh') ? '作者' : 'Author'}</span></span>`
    : '';
  // data-comment-id：长按弹操作卡的事件委托靠它定位楼层（bindPdCommentLongPress）
  return `<div class="pd-comment flex gap-3${isReply ? ' pl-11' : ''}" data-comment-id="${cm.id}">
    ${avatar
      ? `<img src="${window.safeUrl(avatar)}" class="${avSize} rounded-full object-cover shrink-0">`
      : `<div class="${avSize} rounded-full bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-outline text-base">person</span></div>`}
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline justify-between gap-2">
        <span class="flex items-center gap-1.5 min-w-0"><span class="font-headline font-bold text-[13px] truncate" data-no-i18n>${window.escapeHtml(name)}</span>${authorTag}</span>
        <span class="text-[10px] text-on-surface-variant font-label tracking-widest shrink-0" data-no-i18n>${window.formatPostTime(cm.createdAt)}</span>
      </div>
      <p class="text-on-surface text-sm leading-relaxed mt-1" data-no-i18n>${window.escapeHtml(cm.content || '')}</p>
      <div class="flex items-center gap-4 mt-1.5">
        <button class="text-[10px] font-bold tracking-widest text-outline hover:text-primary" onclick="setPdReply('${cm.id}', '${replyTargetId}')">Reply</button>
        <button class="flex items-center gap-1 text-outline active:scale-90 transition-transform" onclick="event.stopPropagation();likePdComment('${cm.id}', this)" aria-label="Like">
          <span data-cm-like-icon class="material-symbols-outlined text-[15px] ${liked ? 'text-neon-pink' : ''}" style="font-variation-settings:'FILL' ${liked ? 1 : 0};">favorite</span>
          <span data-cm-like-count class="text-[10px] font-bold" data-no-i18n>${likeCount}</span>
        </button>
      </div>
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
    <!-- 作者行提到图片上方（用户反馈）：头像 + 名字/学校 在左，时间在右 -->
    <div class="flex items-center justify-between gap-3 px-3 pt-5 pb-4 bg-surface-container-lowest">
      <div class="flex items-center gap-3 min-w-0">
        ${renderAuthorAvatars(post)}
        <div class="min-w-0" data-no-i18n>
          <p class="font-headline font-bold text-base leading-tight truncate">${window.escapeHtml(name)}</p>
          ${school ? `<p class="text-[11px] text-on-surface-variant truncate mt-0.5">${window.escapeHtml(window.metaLabel(school))}</p>` : ''}
        </div>
        ${badge ? `<div class="shrink-0">${badge}</div>` : ''}
      </div>
      <p class="text-[10px] text-on-surface-variant font-label tracking-widest shrink-0" data-no-i18n>${window.formatPostTime(post.createdAt)}</p>
    </div>
    ${renderPdImages(images)}
    <article class="px-3 pt-5 pb-4 bg-surface-container-lowest">
      <div class="grid grid-cols-12 gap-6 items-start">
        <div class="col-span-12 min-w-0">
          ${post.title ? `<h2 class="font-headline text-3xl font-bold tracking-tighter mb-4 leading-none">${window.escapeHtml(post.title)}</h2>` : ''}
          <p class="text-on-surface-variant leading-relaxed text-lg font-light whitespace-pre-wrap">${window.escapeHtml(post.content || '')}</p>
          ${pollBlock(post)}
          ${eventDetailBlock(post)}
        </div>
      </div>
      <!-- 去掉行下横线、留白收紧；评论数可点击 → 跳到评论输入条 -->
      <div class="flex items-center gap-8 py-3 border-t border-outline-variant/20 mt-6">
        <button id="pd-like-btn" class="flex items-center gap-2 group transition-all active:scale-90" onclick="likePdPost()">
          <span data-like-icon class="material-symbols-outlined text-xl ${liked ? 'text-neon-pink' : ''}" style="font-variation-settings:'FILL' ${liked ? 1 : 0};">favorite</span>
          <span data-like-count class="text-xs font-bold font-label tracking-tighter">${post.likeCount || 0}</span>
        </button>
        <button class="flex items-center gap-2 active:scale-90 transition-all" onclick="focusPdComposer()">
          <span class="material-symbols-outlined text-xl">chat_bubble</span>
          <span class="text-xs font-bold font-label tracking-tighter">${commentTotal}</span>
        </button>
      </div>
    </article>
    <div class="px-3 pt-5 pb-6 bg-surface" data-pd-comments>
      <h3 class="font-headline text-xs font-bold tracking-[0.2em] mb-6 text-on-surface-variant"><span>Observations</span> <span data-no-i18n>(${commentTotal})</span> <span class="font-normal tracking-normal text-outline normal-case" data-pd-lp-hint data-no-i18n></span></h3>
      <div class="space-y-7">
        ${comments.map(cm => `<div class="space-y-4">${renderPdComment(cm, cm.id, false, authorKey)}${(cm.replies || []).map(r => renderPdComment(r, cm.id, true, authorKey)).join('')}</div>`).join('')
          || `<div class="py-10 text-center">
                <span class="material-symbols-outlined text-outline-variant" style="font-size:28px">forum</span>
                <p class="text-sm text-outline mt-2">No observations yet. Share the first one.</p>
              </div>`}
      </div>
    </div>`;
  // 长按举报提示（有评论时才提示）+ 事件委托绑定（只绑一次）
  const hint = c.querySelector('[data-pd-lp-hint]');
  if (hint && comments.length) {
    hint.textContent = (window.getLang?.() === 'zh') ? '· 长按更多操作' : '· long-press for options';
  }
  bindPdCommentLongPress();
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
  // 校园墙需要学校：无学校时直接引导补资料，避免图片白传后被后端拒（审计 #19）
  if (S.squareTab === 'campus_wall' && !(S.currentUser?.profile?.school)) {
    window.toast('Add your school in your profile first');
    window.switchTab('profile');
    return;
  }
  S.newPostImages = [];
  // Default the new-post destination to the tab the user is currently viewing
  // (recommend or campus_wall), and reset the anonymous + poll toggles.
  S.newPostBoard = S.squareTab === 'campus_wall' ? 'campus_wall' : 'recommend';
  S.newPostBoardOrigin = S.newPostBoard; // 取消投票时还原用
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
  // 投票仅校园墙可用：从推荐页打开时整行隐藏（用户反馈）
  const pollRow = document.getElementById('newpost-poll-row');
  if (pollRow) pollRow.classList.toggle('hidden', S.newPostBoard !== 'campus_wall');
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
      class="poll-option-input w-full bg-surface-container-lowest rounded-[10px] border-0 px-3 py-2.5 focus:ring-1 focus:ring-neon focus:outline-none"/>`).join('');
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
  if (!checked) {
    // 取消投票：去向还原为打开发帖时所在的页面（审计 #7/#18）
    selectNewPostBoard(S.newPostBoardOrigin || 'recommend');
    return;
  }
  if (checked) {
    // 投票只发校园墙
    selectNewPostBoard('campus_wall');
    if (!document.querySelectorAll('#poll-option-list input').length) renderPollOptionInputs(2);
  }
}
window.toggleNewPostPoll = toggleNewPostPoll;

// 发帖去向：由打开发帖时所在的广场页面决定（不可切换）。
// 保留函数名——投票开关等内部调用仍会强制指定去向。
function selectNewPostBoard(board) {
  S.newPostBoard = board === 'campus_wall' ? 'campus_wall' : 'recommend';
  syncNewPostBoardUI();
}
window.selectNewPostBoard = selectNewPostBoard;

// 只读提示：显示本次发帖的去向（Recommend / Campus Wall）
function syncNewPostBoardUI() {
  const label = document.getElementById('newpost-board-label');
  if (label) label.textContent = S.newPostBoard === 'campus_wall' ? 'Campus Wall' : 'Recommend';
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
  // 相对时间含数字，全局词典逐句匹配不了，这里直接按语言出文案
  const zh = (window.getLang?.() || 'en') === 'zh';
  if (diff < 60000) return zh ? '刚刚' : 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + (zh ? ' 分钟前' : 'M Ago');
  if (diff < 86400000) return Math.floor(diff / 3600000) + (zh ? ' 小时前' : 'H Ago');
  if (diff < 604800000) return Math.floor(diff / 86400000) + (zh ? ' 天前' : 'D Ago');
  return d.toLocaleDateString(zh ? 'zh-CN' : undefined);
}

// ========================================
// DOM INITIALIZATION
// ========================================
window.formatPostTime = formatPostTime;
