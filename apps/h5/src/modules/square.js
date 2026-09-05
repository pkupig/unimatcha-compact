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

// 三页翻页器辅助：按 tab 取 feed 容器 / 轨道定位。
// 页序固定 推荐 → 校园墙 → 置顶；「置顶」只在校园墙/置顶页时才在顶栏出现（见 syncPinnedSeg）。
// 主序即轨道顺序（DOM 顺序必须一致）：推荐 → 附近 → 探索 → 校园墙。
// 'pinned' 挂在最后：它不是主段，而是校园墙的子页（分段绝对定位在右外侧），
// 但仍需在数组里占位，否则 trackOffset 算不出它的偏移。
const SQUARE_PAGES = ['recommend', 'nearby', 'explore', 'campus_wall', 'pinned'];

// ── 「附近」定位 ────────────────────────────────────────────
// 坐标只在内存里存（S.geo），随请求发一次给服务端算距离，服务端不落库。
// **绝不写 localStorage**：共享设备上会跨账号残留（本仓库已有 S.matchPrefs
// 换账号泄显的教训）。cleanupUserState 里一并清。
const GEO_MAX_AGE_MS = 5 * 60 * 1000;

function getGeoFix() {
  // 命中新鲜缓存直接用，避免每次切页都弹系统定位
  if (S.geo && Date.now() - S.geo.at < GEO_MAX_AGE_MS) return Promise.resolve(S.geo);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        S.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() };
        resolve(S.geo);
      },
      (err) => {
        // 1=拒绝授权 2=定位不可用 3=超时。三者都不抛错——
        // 「附近」降级为同城即可，绝不用弹窗阻断（本仓库空态惯例）。
        S.geoError = err?.code || 0;
        resolve(null);
      },
      // 不开高精度：室内会慢到十几秒且耗电；5 分钟缓存够用
      { enableHighAccuracy: false, timeout: 8000, maximumAge: GEO_MAX_AGE_MS },
    );
  });
}
window.getGeoFix = getGeoFix;
function normTab(tab) {
  const t = tab || S.squareTab;
  return SQUARE_PAGES.includes(t) ? t : 'recommend';
}
function feedEl(tab) {
  if (tab === 'search') return document.getElementById('square-feed-search'); // 搜索页有自己的网格
  return document.getElementById('square-feed-' + normTab(tab));
}
function trackEl() { return document.getElementById('square-track'); }
function pagerWidth() {
  // 元素在但宽度为 0（广场页隐藏时）同样要回退——否则页偏移会退化成只剩页间距，
  // 轨道停在错误位置。|| 兼顾 null 与 0 两种情况。
  return document.getElementById('square-pager')?.clientWidth || window.innerWidth || 375;
}
const PAGE_GAP = 12; // 页间留白 = 2× 帖子间距（与 index.html 轨道 gap 保持一致）
function trackOffset(tab) { return -SQUARE_PAGES.indexOf(normTab(tab)) * (pagerWidth() + PAGE_GAP); }
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
  S.squareScrollPos = { recommend: 0, nearby: 0, explore: 0, campus_wall: 0, pinned: 0 };
  // 双页都加载：滑动时另一页已是真实内容
  syncPinnedSeg(S.squareTab); // 「置顶」段按当前页显隐
  // web 字体晚到会改变文字度量，字体就绪后再校一次基线（与下划线定位同理）
  if (document.fonts?.ready) document.fonts.ready.then(alignPinnedSegBaseline);
  syncSquareFab(S.squareTab);
  // 全页预热：拖动时相邻页要有真实内容而不是白板。
  // 遍历 SQUARE_PAGES 而非写死页名——加页时漏一行就是永久空白页。
  SQUARE_PAGES.forEach((t) => window.loadSquareTab2(t));
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

// 「置顶」分段只在校园墙/置顶页显示（用户口径：到了校园墙，置顶才从右边滑出来）。
// 段宽是从 0 过渡长出来的，下划线按 offsetLeft/offsetWidth 定位，故过渡结束后要再校一次。
// 置顶页藏发帖按钮：那页放的是学生会置顶信息，用户发不了；
// 留着它只会把帖子发到推荐流（openNewPost 按 S.squareTab 决定去向），与所在页面对不上。
function syncSquareFab(tab) {
  const fab = document.getElementById('square-fab');
  // 探索看的是外校的墙、置顶页是学生会内容——两者都不给发帖入口
  if (fab) fab.classList.toggle('hidden', tab === 'pinned' || tab === 'explore');
}

// 「置顶」段的字比另两段小，要让**文字底部**与校园墙齐，就得把两者的基线对上。
// 不能在 CSS 里写死偏移量：对齐量取决于字体的实际度量，而中文在本机与 iOS(PingFang SC)
// 落到的根本不是同一个字体，写死只会在一边准、另一边偏（用户在真机上看到的就是偏的）。
// 这里改为运行时实测：拿零尺寸 inline-block 探针取两段基线，把差值补进 padding-bottom。
// 幂等——校正到位后再调，delta≈0，加 0 无副作用。
function alignPinnedSegBaseline() {
  const wall = document.querySelector('#square-tabs .square-seg[data-tab="campus_wall"]');
  const pin = document.getElementById('square-seg-pinned');
  if (!wall || !pin) return;
  const baselineOf = (el) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    el.appendChild(probe);
    const b = probe.getBoundingClientRect().bottom;
    probe.remove();
    return b;
  };
  const wb = baselineOf(wall);
  const pb = baselineOf(pin);
  // 广场页隐藏时 rect 全 0，两个基线都是 0、delta 为 0：不会误改，等可见时再校
  if (!wb || !pb) return;
  const delta = pb - wb; // 正 = 置顶偏低，要往上抬
  if (Math.abs(delta) < 0.5) return;
  const cur = parseFloat(getComputedStyle(pin).paddingBottom) || 0;
  pin.style.paddingBottom = Math.max(0, cur + delta) + 'px';
}
window.alignPinnedSegBaseline = alignPinnedSegBaseline;

function syncPinnedSeg(tab) {
  const tabs = document.getElementById('square-tabs');
  if (!tabs) return;
  tabs.classList.toggle('show-pinned', tab === 'campus_wall' || tab === 'pinned');
  alignPinnedSegBaseline();
  setTimeout(() => { alignPinnedSegBaseline(); positionSquareInk(); }, 300);
}

// Switch the square header between [推荐 | 校园墙 | 置顶].
function switchSquareTab(el, tab) {
  if (!SQUARE_PAGES.includes(tab)) return;
  const prev = S.squareTab;
  // 两页滚动位置独立（用户反馈）：真正的滚动容器是 #tab-square 本身
  // （body overflow-hidden，window 不滚——8/10 生产实测），切换前记下离开页的位置
  const scroller = document.getElementById('tab-square') || document.scrollingElement || document.documentElement;
  if (prev !== tab) {
    S.squareScrollPos = S.squareScrollPos || {};
    S.squareScrollPos[prev] = scroller.scrollTop;
  }
  S.squareTab = tab;
  // 搜索已独立成页：两个 tab 永远是未过滤信息流，切页不再需要清关键词/清结果。
  // Toggle .active on the header segments (CSS .square-seg.active = neon underline).
  const container = el?.parentElement || document.getElementById('square-tabs');
  if (container) {
    container.querySelectorAll('.square-seg').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab || btn === el);
    });
  }
  syncPinnedSeg(tab); // 「置顶」段随页显隐（必须在定位下划线之前，段宽会变）
  syncSquareFab(tab);
  positionSquareInk(); // 下划线滑到新选中项
  setTrack(trackOffset(tab), true); // 轨道滑到目标页
  // 点赞/详情同步的缓存指针跟着当前页走（loadSquareTab2 维护 by-tab 存储）
  S.squarePosts = (S.squarePostsByTab && S.squarePostsByTab[tab]) || [];
  // 切换不再无条件重拉（保住独立位置与浏览进度）：仅目标页为空
  // 或上次渲染是搜索结果（切页语义 = 清搜索）时才刷新
  const targetEl = feedEl(tab);
  const hasContent = !!targetEl?.querySelector('[data-post-id],[data-ad-id]');
  if (!hasContent) window.loadSquareTab2(tab);
  // 恢复目标页自己的位置（进入页即时恢复，视觉焦点跟随新页）
  if (prev !== tab) scroller.scrollTop = (S.squareScrollPos && S.squareScrollPos[tab]) || 0;
}
window.switchSquareTab = switchSquareTab;

// 左右滑动切换 [推荐 | 校园墙]：双页轨道跟手拖动——拖动过程中另一页的
// 真实内容随之进入视口（ViewPager 式），松手过阈值滑到该页，否则弹回。
// 方向锁与竖向滚动/下拉刷新互不干扰。
// 横滑目标 = 当前页的相邻页（左滑下一页 / 右滑上一页），在两端夹住。
// 原来写死「dx<0 就是校园墙、否则推荐」，三页之后会滑错方向甚至跨两页。
// 另外：置顶页只从校园墙进——推荐页左滑一次只到校园墙，不会一路穿到置顶。
function swipeTarget(dx) {
  const i = SQUARE_PAGES.indexOf(normTab(S.squareTab));
  const next = Math.max(0, Math.min(SQUARE_PAGES.length - 1, i + (dx < 0 ? 1 : -1)));
  return SQUARE_PAGES[next];
}

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
    const target = swipeTarget(dx);
    const damp = target === S.squareTab ? 0.3 : 1; // 已在两端、没有下一页 → 橡皮筋
    setTrack(trackOffset(S.squareTab) + dx * damp, false);
  }, { passive: false });
  const settle = () => {
    if (!active) return;
    active = false;
    // 无条件复位（不受 !horiz 早退影响）：锁、标志、轨道都要回到位
    el.dataset.horizLock = '0';
    el.style.touchAction = '';
    if (!horiz) { setTrack(trackOffset(S.squareTab), true); return; }
    const target = swipeTarget(dx);
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

// Debounced search input handler: store the query and reload the search page.
function onSquareSearch(text) {
  S.squareSearchQuery = (text || '').trim();
  document.getElementById('square-search-clear')?.classList.toggle('hidden', !S.squareSearchQuery);
  clearTimeout(S._squareSearchTimer);
  S._squareSearchTimer = setTimeout(loadSquareSearch, 300);
}
window.onSquareSearch = onSquareSearch;

// ── 搜索：独立全屏页（用户要求，原为顶栏内嵌搜索条）──
// 结果不再写进推荐/校园墙的信息流，而是渲染在搜索页自己的网格里，
// 因此两个 tab 永远保持未过滤状态，切页也不必再为「清搜索」重拉。
// 搜索范围跨两个板块（不传 board），可见性由后端各自把关。
function openSquareSearch() {
  window.openOverlay?.('square-search-overlay');
  const c = feedEl('search');
  if (c && !c.children.length) renderSquareSearchIdle(); // 首次打开：引导态
  const input = document.getElementById('square-search');
  setTimeout(() => input?.focus(), 60);
}
window.openSquareSearch = openSquareSearch;

function closeSquareSearch() {
  document.getElementById('square-search')?.blur();
  window.closeOverlay?.('square-search-overlay');
  // 指针交还给当前信息流（搜索页打开期间它指向搜索结果）
  S.squarePosts = (S.squarePostsByTab && S.squarePostsByTab[S.squareTab]) || [];
}
window.closeSquareSearch = closeSquareSearch;

function runSquareSearch() {
  const input = document.getElementById('square-search');
  const q = (input?.value || '').trim();
  clearTimeout(S._squareSearchTimer);
  S.squareSearchQuery = q;
  document.getElementById('square-search-clear')?.classList.toggle('hidden', !q);
  input?.blur();
  loadSquareSearch();
}
window.runSquareSearch = runSquareSearch;

function clearSquareSearch() {
  const input = document.getElementById('square-search');
  if (input) input.value = '';
  clearTimeout(S._squareSearchTimer);
  S.squareSearchQuery = '';
  document.getElementById('square-search-clear')?.classList.add('hidden');
  renderSquareSearchIdle();
  input?.focus();
}
window.clearSquareSearch = clearSquareSearch;

// 空关键词时的引导态（也是搜索页首次打开的样子）
function renderSquareSearchIdle() {
  const c = feedEl('search');
  if (!c) return;
  c.innerHTML = `<div class="col-span-2 text-center py-24">
    ${window.flatEmptyIcon('search')}
    <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">Search the square</p>
    <p class="text-sm text-on-surface-variant mt-2">Find posts by title, content or tag</p>
  </div>`;
  layoutSquareMasonry(); // 1px 行网格：不排一次的话整块只占 1 行、内容看不见
}

async function loadSquareSearch() {
  const container = feedEl('search');
  if (!container) return;
  const q = (S.squareSearchQuery || '').trim();
  if (!q) { renderSquareSearchIdle(); return; }
  const seq = (S._squareSearchSeq = (S._squareSearchSeq || 0) + 1);
  container.innerHTML = `<div class="col-span-2 text-center py-24 text-sm text-on-surface-variant">Loading...</div>`;
  layoutSquareMasonry();
  try {
    const data = await window.api(`/square/v2/search?q=${encodeURIComponent(q)}&page=1&limit=20`);
    if (seq !== S._squareSearchSeq) return; // 被更新的一次搜索取代
    const raw = unwrap(data);
    const env = unwrap(raw.posts);
    const posts = Array.isArray(env) ? env : (env.items || env.posts || []);
    S.squarePostsByTab = S.squarePostsByTab || {};
    S.squarePostsByTab.search = posts;
    // 点赞/详情同步用的指针指向搜索结果，关闭搜索页时指回当前信息流
    S.squarePosts = posts;
    renderSquareFeed(posts, [], 'search');
  } catch (e) {
    if (seq !== S._squareSearchSeq) return;
    console.error('loadSquareSearch error:', e);
    container.innerHTML = `<div class="col-span-2 text-center py-24">
      ${window.flatEmptyIcon('cloud_off')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">Failed to load posts</p>
      <p class="text-sm text-on-surface-variant mt-2">Check your connection and try again</p>
      <button onclick="runSquareSearch()" class="mt-6 font-headline text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-black pb-1">Retry</button>
    </div>`;
    layoutSquareMasonry();
  }
}
window.loadSquareSearch = loadSquareSearch;

// ── 发帖按钮可拖动（用户反馈：不要固定死）──
// 拖动后位置记住（localStorage），点击仍是发帖；边缘吸附并夹在安全区内。
function bindFabDrag() {
  const fab = document.getElementById('square-fab');
  if (!fab || fab.dataset.dragBound) return;
  fab.dataset.dragBound = '1';
  const KEY = 'cl_fab_pos';
  // 上边界 = 顶栏下沿 + 8。原来写死 70，而顶栏实高 = 44 + 状态栏安全区，
  // 灵动岛机上顶栏下沿已到 103px——按钮能被拖到顶栏底下，之后每次进广场都停在那里，
  // 触点被顶栏抢走，既点不到也拖不回来。优先实测，页面不可见时（启动恢复走这条）按公式兜底。
  const minTop = () => {
    const b = document.querySelector('#tab-square > header')?.getBoundingClientRect().bottom || 0;
    if (b > 0) return b + 8;
    const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
    return 44 + sat + 8;
  };
  const place = (x, y) => {
    const w = fab.offsetWidth || 56, h2 = fab.offsetHeight || 56;
    const maxX = window.innerWidth - w - 8, maxY = window.innerHeight - h2 - 8;
    const cx = Math.max(8, Math.min(maxX, x)), cy = Math.max(minTop(), Math.min(maxY, y));
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
  const tab = normTab(tabArg);
  const container = feedEl(tab);
  if (!container) return;
  // 竞态守卫按 tab 分桶：三页并行加载互不覆盖
  // 按页分桶。**不能写死键名**：缺键时 ++undefined = NaN，而 NaN !== NaN 恒真，
  // 竞态守卫会把每一次加载都判成「已被更新的请求取代」而静默早退——页面永远空白且零报错。
  if (!S.squareReqSeqs) S.squareReqSeqs = {};
  if (typeof S.squareReqSeqs[tab] !== 'number') S.squareReqSeqs[tab] = 0;
  const seq = ++S.squareReqSeqs[tab];
  const endpoint = tab === 'pinned' ? '/square/v2/pinned'
    : tab === 'campus_wall' ? '/square/v2/campus-wall'
    : tab === 'nearby' ? '/square/v2/nearby'
    : tab === 'explore' ? '/square/v2/explore'
    : '/square/v2/recommend';
  try {
    // 搜索已独立成页（loadSquareSearch）：这里永远是未过滤信息流
    // 置顶页不分页（后台人工维护的少量信息，翻页反而看不全）
    let url = tab === 'pinned' ? endpoint : `${endpoint}?page=1&limit=20`;
    if (tab === 'explore') {
      // 未选学校时后端只回学校列表（needSchoolPick），选过之后才带 school 拉墙
      if (S.exploreSchool) url += `&school=${encodeURIComponent(S.exploreSchool)}`;
    }
    if (tab === 'nearby') {
      // **只有用户真的站在「附近」页时才请求定位权限**。四页是全量预热的，
      // 若在预热里请求，用户刚点进广场（还在推荐页）就会被弹系统定位授权框——
      // 既突兀又拿不到对价（他还没表达过想看附近）。
      if (S.squareTab === 'nearby') {
        const fix = await getGeoFix();
        if (seq !== S.squareReqSeqs[tab]) return; // 定位是异步的，期间可能已被更新的请求取代
        if (fix) url += `&lat=${encodeURIComponent(fix.lat)}&lng=${encodeURIComponent(fix.lng)}`;
      }
    }
    // 推荐流首页并行拉广告（ADMIN-REDESIGN §6）：校园墙不插广告，
    // 无学校资料不请求（fetchSquareAds 内部判定）。广告失败静默为空，不影响正常流。
    const wantAds = tab === 'recommend';
    const [data, ads] = await Promise.all([
      window.api(url),
      wantAds ? fetchSquareAds() : Promise.resolve([]),
    ]);
    if (seq !== S.squareReqSeqs[tab]) return; // superseded by a newer load
    const env = unwrap(data);
    S.squarePostsByTab = S.squarePostsByTab || {};
    // Campus wall asks the user to complete their school first.
    // 置顶页与校园墙同样要求先填学校（同校可见性口径一致）
    if ((tab === 'campus_wall' || tab === 'pinned') && env.needProfileSchool) {
      S.squarePostsByTab[tab] = [];
      if (tab === S.squareTab) S.squarePosts = [];
      renderSquareNeedSchool(tab);
      return;
    }
    // 探索：还没选学校 → 出选校列表（由后端按「墙上真有帖子的学校」聚合）
    if (tab === 'explore' && env.needSchoolPick) {
      S.exploreSchools = env.schools || [];
      S.squarePostsByTab[tab] = [];
      if (tab === S.squareTab) S.squarePosts = [];
      renderExplorePicker();
      return;
    }
    if (tab === 'explore') {
      S.exploreSchools = env.schools || S.exploreSchools || [];
      S.exploreVerified = !!env.verified;
    }
    // 附近：完全无位置信息（既没定位也没填城市）→ 引导，而不是空白
    if (tab === 'nearby' && env.needCity) {
      S.squarePostsByTab[tab] = [];
      if (tab === S.squareTab) S.squarePosts = [];
      renderNearbyNeedLocation();
      return;
    }
    const posts = Array.isArray(env) ? env : (env.items || env.posts || []);
    if (tab === 'nearby') S.nearbyMode = env.mode || null; // 'gps' | 'city'，渲染时提示降级
    S.squarePostsByTab[tab] = posts; // 各页各自缓存（切页时指针跟随）
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
// 探索：选学校。列表由后端按「墙上真有帖子的学校」聚合，永远非空、不列空学校。
function renderExplorePicker() {
  const container = feedEl('explore');
  if (!container) return;
  const zh = window.getLang?.() === 'zh';
  const list = S.exploreSchools || [];
  if (!list.length) {
    container.innerHTML = `<div class="col-span-2 text-center py-24">
      ${window.flatEmptyIcon('travel_explore')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface" data-no-i18n>${zh ? '还没有其它学校的墙' : 'No other campus walls yet'}</p>
      <p class="text-sm text-on-surface-variant mt-2" data-no-i18n>${zh ? '等更多学校的同学发帖后，这里就能逛了' : 'Once students from other schools start posting, you can browse here'}</p>
    </div>`;
    layoutSquareMasonry();
    return;
  }
  const rows = list.map((s) => {
    const label = window.metaLabel ? window.metaLabel(s.school) : s.school;
    const mine = s.isMine ? `<span class="text-[9px] font-bold tracking-widest text-black bg-neon rounded px-1.5 py-0.5 shrink-0" data-no-i18n>${zh ? '本校' : 'MINE'}</span>` : '';
    // 校名走 data 属性 + 事件委托：escapeHtml 不转义引号，直接拼进 onclick
    // 字符串时校名里一个撇号就能破掉结构（本仓库 8/30 记过这个坑）
    const attr = window.escapeHtml(String(s.school)).replace(/"/g, '&quot;');
    return `<button type="button" data-pick-school="${attr}" class="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface-container-low transition-colors border-b border-outline-variant/15">
      ${window.schoolBadgeHtml ? window.schoolBadgeHtml(s.school, { size: 'md' }) : ''}
      <span class="flex-1 min-w-0 font-headline font-bold text-sm truncate" data-no-i18n>${window.escapeHtml(label)}</span>
      ${mine}
      <span class="text-[11px] text-on-surface-variant shrink-0" data-no-i18n>${s.postCount}</span>
      <span class="material-symbols-outlined text-outline shrink-0" style="font-size:18px">chevron_right</span>
    </button>`;
  }).join('');
  container.innerHTML = `<div class="col-span-2">
    <p class="px-4 pt-4 pb-2 text-[10px] font-bold tracking-[0.2em] text-outline" data-no-i18n>${zh ? '选择一所学校' : 'PICK A SCHOOL'}</p>
    ${rows}
  </div>`;
  bindExplorePicker();
  layoutSquareMasonry();
}

// 选校委托：容器整段 innerHTML 重写，逐按钮绑事件会丢，必须委托且只绑一次
function bindExplorePicker() {
  const container = feedEl('explore');
  if (!container || container.dataset.pickBound) return;
  container.dataset.pickBound = '1';
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-school]');
    if (btn) pickExploreSchool(btn.dataset.pickSchool);
  });
}

function pickExploreSchool(school) {
  S.exploreSchool = school;
  window.loadSquareTab2('explore');
}
window.pickExploreSchool = pickExploreSchool;

/** 探索页顶部的「当前学校 + 换一所」条 */
function exploreHeaderHtml() {
  if (!S.exploreSchool) return '';
  const zh = window.getLang?.() === 'zh';
  const label = window.metaLabel ? window.metaLabel(S.exploreSchool) : S.exploreSchool;
  const readonly = S.exploreVerified === false
    ? `<span class="text-[10px] text-on-surface-variant" data-no-i18n>${zh ? '· 只读' : '· read-only'}</span>` : '';
  return `<div class="col-span-2 flex items-center gap-2 px-3 py-2.5 mb-1">
    ${window.schoolBadgeHtml ? window.schoolBadgeHtml(S.exploreSchool, { size: 'sm' }) : ''}
    <span class="font-headline font-bold text-[13px] truncate" data-no-i18n>${window.escapeHtml(label)}</span>
    ${readonly}
    <button type="button" class="ml-auto shrink-0 text-[10px] font-bold tracking-widest text-black border-b border-black pb-0.5" onclick="backToExplorePicker()" data-no-i18n>${zh ? '换一所' : 'CHANGE'}</button>
  </div>`;
}

function backToExplorePicker() {
  S.exploreSchool = null;
  window.loadSquareTab2('explore');
}
window.backToExplorePicker = backToExplorePicker;

// 附近：既无定位授权、资料里也没城市 —— 给两条出路而不是空白页
function renderNearbyNeedLocation() {
  const container = feedEl('nearby');
  if (!container) return;
  const denied = S.geoError === 1;
  container.innerHTML = `<div class="col-span-2 text-center py-24">
    ${window.flatEmptyIcon('location_off')}
    <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">${denied ? 'Location is off' : 'Turn on location'}</p>
    <p class="text-sm text-on-surface-variant mt-2">${denied
      ? 'Allow location in your browser settings, or add your city to see posts around you'
      : 'Allow location to see posts around you, or add your city in your profile'}</p>
    <button onclick="retryNearby()" class="mt-6 font-headline text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-black pb-1">Try again</button>
    <button onclick="window.switchTab('profile')" class="mt-4 block mx-auto font-headline text-[10px] font-bold tracking-[0.2em] text-outline">Add city instead</button>
  </div>`;
  layoutSquareMasonry();
}

function retryNearby() {
  S.geo = null; S.geoError = null; // 清缓存重新问一次定位
  window.loadSquareTab2('nearby');
}
window.retryNearby = retryNearby;

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
  // 广场搜索只出帖子（用户要求）：结果里不再混入「同学」，找人走好友面板/扫码
  const isSearch = tab === 'search';
  if (!posts.length && tab === 'pinned') {
    // 置顶页空态：说清楚这页是干什么的，避免用户以为加载失败
    container.innerHTML = `<div class="col-span-2 text-center py-24">
      ${window.flatEmptyIcon('push_pin')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">Nothing pinned yet</p>
      <p class="text-sm text-on-surface-variant mt-2">Your student union pins important notices here</p>
    </div>`;
    layoutSquareMasonry();
    return;
  }
  if (!posts.length) {
    container.innerHTML = `<div class="col-span-2 text-center py-24">
      ${window.flatEmptyIcon('grid_view')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">${
        isSearch ? 'No posts found' : 'No posts yet'
      }</p>
      <p class="text-sm text-on-surface-variant mt-2">${
        isSearch ? 'Try a different keyword' : 'Be the first to share a moment'
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
  // 探索页顶部固定一条「当前学校 + 换一所」，让用户随时知道自己在逛谁的墙
  let html = tab === 'explore' ? exploreHeaderHtml() : '';
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
  [...SQUARE_PAGES, 'search'].forEach((t) => {
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
  SQUARE_PAGES.forEach((t) => {
    const c = feedEl(t);
    if (c) Array.from(c.children).forEach((el) => masonryRO.observe(el));
  });
}

// Anonymous-aware author identity (§6.11 规则7). Anonymous posts render as
// 「匿名同学」with a placeholder avatar; the backend already nulls authorUser,
// this is the front-end fallback. Otherwise use authorUser.profile.
function postAuthorDisplay(p) {
  if (p?.anonymous) {
    // 化名由后端下发的 aliasSeed 在前端按当前语言渲染（中文态出中文名）；
    // 没有 seed 时退回后端那串英文，再没有才兜底。
    const seed = p.anonymousAuthor?.aliasSeed;
    const alias = seed != null ? window.aliasName(seed) : (p.anonymousAuthor?.nickname || 'Anonymous');
    // 匿名：绝不带 verifiedSchool/verificationStatus——挂上校标等于给匿名号盖「已认证」章，
    // 把作者候选集从全校缩到该校 verified 用户。school 字段是既有产品口径（帖子标学校），保留。
    return { name: alias, nickname: alias, avatarUrl: null, anonymous: true, aliasSeed: seed, school: p.school };
  }
  const prof = p?.authorUser?.profile || {};
  const au = p?.authorUser || {};
  return {
    name: prof.nickname || p?.admin?.name || p?.admin?.organizationName || 'User',
    nickname: prof.nickname,
    avatarUrl: prof.avatarUrl,
    anonymous: false,
    school: prof.school || p?.school,
    // 校标依据：认证快照（后端 select 已带），与可随意改的 profile.school 无关
    verificationStatus: au.verificationStatus || null,
    verifiedSchool: au.verifiedSchool || null,
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

// Pinned badge for campus-wall pinned posts (shapePost.isPinned；feed 已由后端按
// 置顶优先排序，这里只做视觉标注)。文案走词典（zh：置顶）。
function pinnedBadge(p) {
  if (!p?.isPinned) return '';
  return `<span class="pinned-badge">PINNED</span>`;
}

// Render a single avatar (image / initials / anonymous placeholder) at a size.
// `profile` is a {nickname,avatarUrl,anonymous?} shape (from postAuthorDisplay).
// sizeClass controls the box; extra applies ring/border classes.
// 从 Tailwind 的 w-N 反推容器像素（w-4 = 1rem = 16px），emoji 取其 62%——
// 太大就会顶到圆边被裁掉（用户反馈：信息流里的头像看着不完整）。
function emojiSizeFor(sizeClass) {
  const m = /(?:^|\s)w-(\d+(?:\.\d+)?)(?:\s|$)/.exec(sizeClass || '');
  const px = m ? parseFloat(m[1]) * 4 : 32;
  return Math.max(9, Math.round(px * 0.62));
}

function avatarChip(profile, fallbackName, sizeClass, textSize, extra) {
  // Anonymous → neutral person icon placeholder (no initials that could leak a name).
  if (profile?.anonymous) {
    // 匿名头像由 aliasSeed 决定（同一个人恒定，不是每次渲染都换）；绝不用首字母，那会泄露名字。
    // emoji 字号必须跟着容器走：信息流卡片上的头像只有 w-4(16px)，写死 16px 会把 emoji 挤爆、看起来缺一块。
    if (profile.aliasSeed != null) return window.aliasAvatarHtml(profile.aliasSeed, `${sizeClass} ${extra}`, emojiSizeFor(sizeClass));
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
// 门票能量计费：priceCents 数值 ≡ 能量数，用户按格支付 cells = ceil(priceCents/100)。
// 返回串含数字（动态），全局词典逐句匹配不了——按语言直接出文案（同 formatPostTime 惯例），
// 调用处包 data-no-i18n；'Free' 保持词典键可译。
function eventPrice(ev) {
  if (!ev.priceCents) return 'Free';
  const cells = Math.ceil(ev.priceCents / 100);
  return (window.getLang?.() || 'en') === 'zh'
    ? `${cells} 格能量`
    : `${cells} energy ${cells === 1 ? 'cell' : 'cells'}`;
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
    <span class="text-[11px] font-bold"${soldOut || !ev.priceCents ? '' : ' data-no-i18n'}>${soldOut ? 'Sold out' : eventPrice(ev)}</span>
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

// 门票能量计费：按格支付 cells = ceil(priceCents/100)。付费票先刷新余额校验，
// 不足引导充值；确认卡明示消耗格数（同 match.js 增强付费惯例，绝不静默扣）。
async function buyEventTicket(eventId) {
  // 取数路径：购票按钮只出现在帖子详情的活动块，ev 通常就在 S.pdPostData.event；
  // 缓存未命中（防御）再退列表缓存 → GET /events/:id
  let ev = S.pdPostData?.event?.id === eventId ? S.pdPostData.event : null;
  if (!ev) {
    for (const list of Object.values(S.squarePostsByTab || {})) {
      const hit = (list || []).find((p) => p?.event?.id === eventId);
      if (hit) { ev = hit.event; break; }
    }
  }
  if (!ev) {
    try { ev = unwrap(await window.api(`/events/${eventId}`)); } catch (e) { /* 拿不到票价：按免费文案走，后端仍会校验扣费 */ }
  }
  const cells = ev?.priceCents ? Math.ceil(ev.priceCents / 100) : 0;
  if (cells > 0) {
    // 新鲜余额再校验（S.energy 可能是冷启动默认 0 或旧值）
    await window.loadEnergyBar?.();
    const avail = S.energy?.availableEnergy ?? 0;
    if (avail < cells) {
      window.toast('Not enough energy — top up');
      window.openEnergyModal?.();
      return;
    }
    const zh = (window.getLang?.() || 'en') === 'zh';
    const ok = await window.confirmCard(zh ? {
      title: '购买这张门票？',
      body: `将消耗 ${cells} 格能量（当前 ${avail} 格），门票立即进入我的票夹。`,
      confirmLabel: `消耗 ${cells} 格购票`,
      cancelLabel: '取消',
    } : {
      title: 'Get this ticket?',
      body: `${cells} energy ${cells === 1 ? 'cell' : 'cells'} will be spent now (you have ${avail}). The ticket lands in My Tickets instantly.`,
      confirmLabel: `Spend ${cells} & get ticket`,
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
  } else {
    // 免费票沿用原确认文案
    const ok = await window.confirmCard({
      title: 'Get this ticket?',
      body: 'Payment is mocked in beta — the ticket lands in My Tickets instantly.',
      confirmLabel: 'Confirm',
    });
    if (!ok) return;
  }
  try {
    const data = await window.api(`/events/${eventId}/purchase`, 'POST', {});
    const res = unwrap(data);
    window.toast(`Ticket ${res.code || ''} added to My Tickets`);
    // 扣了能量：余额条即时刷新
    if (cells > 0) window.loadEnergyBar?.();
    // 详情里的余票/已售即时刷新
    if (S.currentPostId) window.loadPostDetail(S.currentPostId);
  } catch (e) {
    // 前置校验与后端扣费之间余额可能已变（并发消费）：同样引导充值
    if (/not enough energy/i.test(e?.message || '')) {
      window.toast('Not enough energy — top up');
      window.openEnergyModal?.();
      return;
    }
    window.toast(e?.message || 'Purchase failed');
  }
}
window.buyEventTicket = buyEventTicket;

function postLikeButton(p) {
  const liked = !!p.myLiked;
  // canInteract 由后端在探索作用域下发：外校墙未认证 → 只读，按钮置灰给提示，
  // 而不是让用户点下去吃一个 403
  if (p.canInteract === false) {
    return `<button class="flex items-center gap-1 shrink-0 opacity-40" onclick="event.stopPropagation();window.toast(window.getLang?.()==='zh'?'认证学生身份后可互动':'Get verified to interact')">
      <span class="material-symbols-outlined text-sm">favorite</span>
      <span class="text-xs font-bold">${p.likeCount || 0}</span>
    </button>`;
  }
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
      <span class="text-neutral-400 text-[11px] truncate">${window.escapeHtml(d.name)}</span>${window.badgeFor?.(d) || ''}
    </div>
    ${postLikeButton(p)}
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
  const pinned = pinnedBadge(p);
  // 卡片不再显示学校（用户反馈：信息太多）；官方/赞助徽标保留，置顶角标在前
  const header = (pinned || badge) ? `<div class="flex items-center gap-1.5 mb-3">${pinned}${badge}</div>` : '';
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
  const pinned = pinnedBadge(p);
  // 图片贴满卡片上/左/右边缘（卡片 overflow-hidden 裁出圆角）；右上角学校已去掉（用户反馈），
  // 底部只留 标题 + 头像/昵称 + 点赞；置顶角标与官方徽标同槽左上
  return `<article data-post-id="${p.id}" class="group cursor-pointer bg-surface-container-lowest rounded-[6px] overflow-hidden" onclick="openPostDetail('${p.id}')">
    <div class="relative overflow-hidden aspect-[4/5] bg-surface-container">
      <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="${window.safeUrl(img)}" onerror="this.style.display='none'">
      ${(pinned || badge) ? `<div class="absolute top-4 left-4 flex items-center gap-1.5">${pinned}${badge}</div>` : ''}
    </div>
    <div class="min-w-0 px-3 pt-2 pb-2">
      ${p.title ? `<h3 class="font-headline font-bold text-lg tracking-tight">${window.escapeHtml(p.title)}</h3>` : ''}
      ${eventStrip(p)}
      ${cardAuthorRow(p)}
    </div>
  </article>`;
}

// 纯文字卡的「荧光笔标题」：第一小段铺荧光绿底（模仿手帐划重点；按用户给的
// 截图风格，引号装饰不要）。CJK 最多取 6 字，拉丁最多 12 字符，碰到标点/空格截断。
// 必须先切分原文、再逐段 escapeHtml——先拼 HTML 再切会把标签切坏。
function highlightMarkHtml(text) {
  const t = String(text || '');
  let n = t.search(/[。，！？…、,.!?:;\s]/);
  const cap = t.charCodeAt(0) < 128 ? 12 : 6;
  if (n <= 0) n = t.length;
  n = Math.min(n, cap);
  const head = t.slice(0, n), rest = t.slice(n);
  // 荧光条盖住字形下部约 1/3，露出上部——linear-gradient 铺底、不引入额外元素
  return `<span style="background:linear-gradient(to top, rgba(204,255,0,.95) 32%, transparent 32%)">${window.escapeHtml(head)}</span>${window.escapeHtml(rest)}`;
}

// Card type 3 (recommend + USER): small square cards in a 2-col grid
// (gap-3, second one offset). School pill overlaid top-right.
function bentoSmallCard(p) {
  const img = (p.images || [])[0];
  const media = img
    // 图片卡高度随图片原始比例（小红书式瀑布流，本轮反馈5）；过长/过扁由 .rec-img 的 min/max-height 收敛
    ? `<div class="relative bg-surface-container overflow-hidden"><img class="rec-img" src="${window.safeUrl(img)}" onerror="this.parentElement.style.display='none'"></div>`
    // 纯文字小卡（本轮反馈5b）：文字居中、可爱字体、放大、随机低饱和浅色底；点开详情仍照旧。
    // 纯文字小卡（用户截图风格）：米白底、左对齐粗体、首段荧光绿划重点；
    // 原来的随机浅色底 + 可爱字体 + 居中排版一并退役。
    : `<div class="relative aspect-[3/4] overflow-hidden flex items-center p-5" style="background:#f6f1e7"><p class="font-headline font-extrabold tracking-tight" style="font-size:clamp(1.05rem,5.5vw,1.45rem);line-height:1.6;color:#3f3f3f;${clampStyle(5)}" data-no-i18n>${highlightMarkHtml(p.title || p.content || '')}</p></div>`;
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
        <p class="font-headline text-base font-bold truncate" data-no-i18n>${window.escapeHtml(d.name)}</p>${window.badgeFor?.({ ...d, badgeSize: 'md' }) || ''}
        <p class="text-[10px] text-neutral-400 font-medium tracking-widest" data-no-i18n>${window.formatPostTime(p.createdAt)}</p>
      </div>
      ${pinnedBadge(p)}
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
  // 同一帖可能同时存在于推荐/校园墙/搜索三份缓存里：全部同步，
  // 否则从搜索页点赞后返回信息流会看到旧状态。
  const lists = [S.squarePosts, ...Object.values(S.squarePostsByTab || {})];
  lists.forEach((list) => {
    const p = (list || []).find(x => x && x.id === postId);
    if (!p) return;
    p.myLiked = liked;
    if (likeCount != null) p.likeCount = likeCount;
  });
  if (S.pdPostData && S.pdPostData.id === postId) {
    S.pdPostData.myLiked = liked;
    if (likeCount != null) S.pdPostData.likeCount = likeCount;
  }
}

// Patch the rendered list card for a post in place (avoids full list reload).
// Used when the detail page changes a post's like/comment counts (A12/A14).
function patchSquareCard(postId, { liked, likeCount, commentCount } = {}) {
  // 搜索结果卡在搜索页的网格里（不在 #square-track 内），一并纳入
  const cards = [...document.querySelectorAll(
    '#square-track [data-post-id="' + postId + '"], #square-feed-search [data-post-id="' + postId + '"]'
  )];
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
  S.pdAnon = false; // 换一帖不继承上一帖的匿名选择
  document.getElementById('post-detail-overlay')?.classList.remove('pd-chrome-hidden'); // 每次打开都从展开态开始
  bindPdChromeAutoHide();
  const hdrAuthor = document.getElementById('pd-header-author');
  if (hdrAuthor) hdrAuthor.innerHTML = ''; // 清掉上一帖的人，避免加载期闪现错误作者
  window.clearPdImage?.(); // 待发的图同理，不能跟到下一帖
  window.syncPdAnonUI?.();
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
    row('forward', zh ? '转发到聊天' : 'Forward to chat', 'data-forward') +
    row('ios_share', zh ? '分享' : 'Share', 'data-share') +
    row('flag', zh ? '举报帖子' : 'Report post', 'data-report');
  const btn = document.getElementById('pd-report-btn');
  const r = btn ? btn.getBoundingClientRect() : { left: (ev?.clientX || 0), bottom: (ev?.clientY || 0) };
  menu.style.left = Math.max(8, Math.min(r.left - 100, window.innerWidth - 164)) + 'px';
  menu.style.top = (r.bottom + 6) + 'px';
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.querySelector('[data-forward]').onclick = () => {
    close();
    // 只传 postId：快照由服务端取，客户端自带内容就能伪造任意「帖子卡」
    window.openForwardPicker && window.openForwardPicker({ postId: S.currentPostId });
  };
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
  // 匿名评论：名字与头像都由后端下发的 aliasSeed 决定——名字跟随当前语言，
  // 头像是同 seed 恒定的动物头像。真实昵称/头像后端根本不下发。
  const aliasSeed = cm.anonymous ? cm.anonymousAuthor?.aliasSeed : null;
  const name = aliasSeed != null
    ? window.aliasName(aliasSeed)
    : (cm.user?.profile?.nickname || cm.user?.nickname || 'User');
  const avatar = cm.anonymous ? null : cm.user?.profile?.avatarUrl;
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
    ${aliasSeed != null
      ? window.aliasAvatarHtml(aliasSeed, avSize, emojiSizeFor(avSize))
      : (avatar
        ? `<img src="${window.safeUrl(avatar)}" class="${avSize} rounded-full object-cover shrink-0">`
        : `<div class="${avSize} rounded-full bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-outline text-base">person</span></div>`)}
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline justify-between gap-2">
        <span class="flex items-center gap-1.5 min-w-0"><span class="font-headline font-bold text-[13px] truncate" data-no-i18n>${window.escapeHtml(name)}</span>${window.badgeFor?.({ anonymous: !!cm.anonymous, verificationStatus: cm.user?.verificationStatus, verifiedSchool: cm.user?.verifiedSchool }) || ''}${authorTag}</span>
        <span class="text-[10px] text-on-surface-variant font-label tracking-widest shrink-0" data-no-i18n>${window.formatPostTime(cm.createdAt)}</span>
      </div>
      ${cm.content ? `<p class="text-on-surface text-sm leading-relaxed mt-1" data-no-i18n>${window.escapeHtml(cm.content)}</p>` : ''}
      ${cm.imageUrl ? `<button type="button" onclick="event.stopPropagation();window.openChatImage(this.querySelector('img').src)" class="block mt-2 active:opacity-80">
        <img src="${window.safeUrl(cm.imageUrl)}" class="max-w-[160px] max-h-[160px] rounded-[10px] object-cover" alt="">
      </button>` : ''}
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

// 页眉里的发帖人：头像 + 名字（+ 学校/官方徽标）。
// 匿名帖走同一套 postAuthorDisplay，所以页眉显示的也是化名与匿名头像，不会漏真身。
// 下滑看内容时收起页眉/页脚，上滑或接近顶部恢复（与底导同一套手感）。
// 阈值取 6px：小于它的抖动（惯性回弹、软键盘微调）不该触发收起/展开来回跳。
// 页脚已脱离文档流，滚动区靠 --pd-footer-h 补出等高的下内边距。
// 高度会随回复条/图片预览开合而变，所以在这些时点显式同步一次。
// 刻意不用 ResizeObserver 兜底：它的回调挂在渲染步骤上，页面不合成帧时根本不触发
// （本机预览窗格实测 0 次回调），把布局正确性押在它上面不可靠。
function syncPdFooterHeight() {
  const overlay = document.getElementById('post-detail-overlay');
  const footer = overlay?.querySelector('footer');
  if (!overlay || !footer) return;
  const h = Math.round(footer.getBoundingClientRect().height);
  if (h > 0) overlay.style.setProperty('--pd-footer-h', h + 'px');
}
window.syncPdFooterHeight = syncPdFooterHeight;

function bindPdChromeAutoHide() {
  const scroller = document.getElementById('pd-scroll');
  const overlay = document.getElementById('post-detail-overlay');
  if (!scroller || !overlay || scroller.dataset.chromeHideBound) return;
  scroller.dataset.chromeHideBound = '1';
  let lastY = 0;
  scroller.addEventListener('scroll', () => {
    const y = scroller.scrollTop;
    const dy = y - lastY;
    lastY = y;
    // 顶部区域恒显示：刚进页面就把页眉藏了会让人找不到返回键
    if (y < 40) { overlay.classList.remove('pd-chrome-hidden'); return; }
    if (dy > 6) overlay.classList.add('pd-chrome-hidden');
    else if (dy < -6) overlay.classList.remove('pd-chrome-hidden');
  }, { passive: true });
  // 点输入框写评论时必须把页脚放回来（此时手指可能正停在下滑后的收起态）
  document.getElementById('comment-input')?.addEventListener('focus', () => {
    overlay.classList.remove('pd-chrome-hidden');
  });
  syncPdFooterHeight();
}
window.bindPdChromeAutoHide = bindPdChromeAutoHide;

function renderPdHeaderAuthor(post, d, school, badge) {
  const box = document.getElementById('pd-header-author');
  if (!box) return;
  box.innerHTML = `
    ${avatarChip(d, d.name, 'w-8 h-8 shrink-0', 'text-[10px]', '')}
    <div class="min-w-0 leading-tight">
      <p class="font-headline font-bold text-[13px] truncate">${window.escapeHtml(d.name)}${window.badgeFor?.(d) || ''}</p>
      ${school ? `<p class="text-[10px] text-on-surface-variant truncate">${window.escapeHtml(window.metaLabel(school))}</p>` : ''}
    </div>
    ${badge ? `<div class="shrink-0">${badge}</div>` : ''}`;
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
  const school = d.school || post.school;
  const badge = officialBadge(post);
  const liked = !!post.myLiked;
  // 发帖人信息渲染到页眉（正文里不再重复一遍）
  renderPdHeaderAuthor(post, d, school, badge);
  c.innerHTML = `
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
      <!-- 日期与点赞/评论同一行，靠最右（用户反馈） -->
      <div class="flex items-center justify-between gap-4 py-3 border-t border-outline-variant/20 mt-6">
        <div class="flex items-center gap-8">
        <button id="pd-like-btn" class="flex items-center gap-2 group transition-all active:scale-90" onclick="likePdPost()">
          <span data-like-icon class="material-symbols-outlined text-xl ${liked ? 'text-neon-pink' : ''}" style="font-variation-settings:'FILL' ${liked ? 1 : 0};">favorite</span>
          <span data-like-count class="text-xs font-bold font-label tracking-tighter">${post.likeCount || 0}</span>
        </button>
        <button class="flex items-center gap-2 active:scale-90 transition-all" onclick="focusPdComposer()">
          <span class="material-symbols-outlined text-xl">chat_bubble</span>
          <span class="text-xs font-bold font-label tracking-tighter">${commentTotal}</span>
        </button>
        </div>
        <span class="text-[10px] text-on-surface-variant font-label tracking-widest shrink-0" data-no-i18n>${window.formatPostTime(post.createdAt)}</span>
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
  syncPdFooterHeight(); // 回复条出现→页脚变高
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
  syncPdFooterHeight(); // 回复条收起→页脚变矮
  // Drop focus so the user gets a clear visual cue the reply target is gone;
  // the typed draft is preserved and will post as a top-level comment (B21).
  document.getElementById('comment-input')?.blur();
}
window.cancelPdReply = cancelPdReply;

// 评论匿名开关：每条评论各自决定（与帖子是否匿名无关）。
// 发完一条即复位——匿名是每次都要主动选的动作，不该被上一条的选择悄悄延续。
function togglePdAnon() {
  S.pdAnon = !S.pdAnon;
  syncPdAnonUI();
}
window.togglePdAnon = togglePdAnon;

function syncPdAnonUI() {
  const btn = document.getElementById('pd-anon-toggle');
  if (!btn) return;
  const on = !!S.pdAnon;
  btn.classList.toggle('bg-neon', on);
  btn.classList.toggle('text-black', on);
  btn.classList.toggle('bg-surface-container-low', !on);
  btn.classList.toggle('text-outline', !on);
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = on ? 'visibility_off' : 'visibility';
  // 图标变色之外再改占位符：匿名与否是隐私状态，必须一眼看得出来，
  // 不能只靠一个小图标的颜色（发出去才发现没匿名就晚了）
  const input = document.getElementById('comment-input');
  if (input) {
    input.setAttribute('placeholder', on ? 'Commenting anonymously...' : 'Add an observation...');
    window.translatePlaceholders?.(input);
  }
}
window.syncPdAnonUI = syncPdAnonUI;

// 评论配图：选图后先本地预览，真正上传推迟到发送时（选了又不发不该占用服务器）
function handlePdImage(e) {
  const file = (e.target.files || [])[0];
  e.target.value = ''; // 允许连续选同一张
  if (!file) return;
  if (!/^image\//.test(file.type)) { window.toast('Only images are allowed'); return; }
  if (file.size > 8 * 1024 * 1024) { window.toast('Image too large (max 8MB)'); return; }
  S.pdImageFile = file;
  window.readFileAsDataUrl(file, (url) => {
    const box = document.getElementById('pd-image-preview');
    const thumb = document.getElementById('pd-image-thumb');
    if (thumb) thumb.src = url;
    box?.classList.remove('hidden');
    syncPdFooterHeight(); // 预览出现→页脚变高
  });
}
window.handlePdImage = handlePdImage;

function clearPdImage() {
  S.pdImageFile = null;
  const thumb = document.getElementById('pd-image-thumb');
  if (thumb) thumb.removeAttribute('src');
  document.getElementById('pd-image-preview')?.classList.add('hidden');
  syncPdFooterHeight(); // 预览收起→页脚变矮
}
window.clearPdImage = clearPdImage;

async function submitPdComment() {
  const input = document.getElementById('comment-input');
  const content = input?.value?.trim();
  // 只有图没有字也允许发（配图本身就是内容）；两样都没有才拦
  if ((!content && !S.pdImageFile) || !S.currentPostId) return;
  if (S.pdSending) return; // 上传可能要几秒，防连点发出多条
  S.pdSending = true;
  const sendBtn = document.getElementById('pd-send-btn');
  if (sendBtn) sendBtn.disabled = true;
  // 乐观清空前先留快照：失败要能把用户打的字和选的图原样还回去
  const snapshot = { content, file: S.pdImageFile, anon: !!S.pdAnon, reply: S.pdReplyTo };
  try {
    const body = {
      content: content || '',
      anonymous: !!S.pdAnon
    };
    // 上传推迟到这一刻：选了图又不发，不该在服务器上留垃圾
    if (S.pdImageFile) body.imageUrl = await window.uploadImageFile(S.pdImageFile);
    if (S.pdReplyTo?.id) body.parentCommentId = S.pdReplyTo.id;
    await window.api(`/square/v2/posts/${S.currentPostId}/comments`, 'POST', body);
    if (input) input.value = '';
    S.pdAnon = false; // 每条评论各自选择，发完复位
    clearPdImage();
    syncPdAnonUI();
    window.cancelPdReply();
    window.loadPostDetail(S.currentPostId);
  } catch (e) {
    // 还原草稿：内容/图/匿名选择都回来，否则失败一次就白打了
    if (input && !input.value) input.value = snapshot.content || '';
    S.pdImageFile = snapshot.file;
    S.pdAnon = snapshot.anon;
    syncPdAnonUI();
    window.toast('Failed: ' + (e?.message || 'try again'));
  } finally {
    S.pdSending = false;
    if (sendBtn) sendBtn.disabled = false;
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
  // 只有站在自己学校的墙上才发到墙；附近/探索/置顶一律发到推荐
  S.newPostBoard = S.squareTab === 'campus_wall' ? 'campus_wall' : 'recommend';
  S.newPostBoardOrigin = S.newPostBoard; // 取消投票时还原用
  S.newPostAnonymous = false;
  // 位置逐条选择上报，不继承上一条的选择
  S.newPostGeo = null;
  const locBox = document.getElementById('newpost-location');
  if (locBox) locBox.checked = false;
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
const POLL_MIN_OPTIONS = 2;
const POLL_MAX_OPTIONS = 6;

// values 可显式传入（删除某项时用），不传则从当前 DOM 读回——避免删除后其余输入内容丢失
function renderPollOptionInputs(count, values) {
  const list = document.getElementById('poll-option-list');
  if (!list) return;
  const existing = values || [...list.querySelectorAll('input')].map(i => i.value);
  const n = Math.min(POLL_MAX_OPTIONS, Math.max(POLL_MIN_OPTIONS, count));
  // 只有多于下限时才给删除键：留 2 个时删掉任何一个都会让投票不成立
  const removable = n > POLL_MIN_OPTIONS;
  list.innerHTML = Array.from({ length: n }, (_, i) => `
    <div class="flex items-center gap-2">
      <input type="text" maxlength="50" placeholder="Option ${i + 1}"
        class="poll-option-input flex-1 min-w-0 bg-surface-container-lowest rounded-[10px] border-0 px-3 py-2.5 focus:ring-1 focus:ring-neon focus:outline-none"/>
      ${removable ? `<button type="button" onclick="removePollOptionInput(${i})" aria-label="Remove option"
        class="poll-option-remove shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-outline active:scale-90 transition-transform">
        <span class="material-symbols-outlined" style="font-size:18px">close</span>
      </button>` : ''}
    </div>`).join('');
  // 值用属性赋值回填（不拼 HTML）：escapeHtml 不转义引号，含 " 的选项会截断属性甚至注入
  [...list.querySelectorAll('input')].forEach((el, i) => { el.value = existing[i] || ''; });
}

function addPollOptionInput() {
  const list = document.getElementById('poll-option-list');
  const cur = list ? list.querySelectorAll('input').length : POLL_MIN_OPTIONS;
  if (cur >= POLL_MAX_OPTIONS) { window.toast('Up to 6 options'); return; }
  renderPollOptionInputs(cur + 1);
}
window.addPollOptionInput = addPollOptionInput;

// 删除某个选项（用户要求：选项要可以减）。删除后整段重渲染 → placeholder 重新编号，
// 其余输入的值经 values 原样带过去，减到只剩 2 个时删除键自动消失。
function removePollOptionInput(idx) {
  const list = document.getElementById('poll-option-list');
  if (!list) return;
  const values = [...list.querySelectorAll('input')].map(i => i.value);
  if (values.length <= POLL_MIN_OPTIONS) { window.toast('At least 2 options'); return; }
  if (idx < 0 || idx >= values.length) return;
  values.splice(idx, 1);
  renderPollOptionInputs(values.length, values);
}
window.removePollOptionInput = removePollOptionInput;

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

// 「带上位置」开关：打开时就地取一次定位（在用户手势里请求授权，时机自然）。
// 取不到就把开关弹回并提示——不要让用户以为带上了位置、实际发出去没有。
async function toggleNewPostLocation(checked) {
  const box = document.getElementById('newpost-location');
  if (!checked) { S.newPostGeo = null; return; }
  const zh = window.getLang && window.getLang() === 'zh';
  const fix = await getGeoFix();
  if (!fix) {
    S.newPostGeo = null;
    if (box) box.checked = false;
    window.toast(zh ? '拿不到定位，可在系统设置里允许后重试' : "Couldn't get your location — allow it in settings and try again");
    return;
  }
  S.newPostGeo = { lat: fix.lat, lng: fix.lng };
}
window.toggleNewPostLocation = toggleNewPostLocation;

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
      anonymous: !!S.newPostAnonymous,
      // 位置快照：仅在用户本次打开了「带上位置」时才有值（服务端会截到 3 位小数）
      ...(S.newPostGeo ? { lat: S.newPostGeo.lat, lng: S.newPostGeo.lng } : {})
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
