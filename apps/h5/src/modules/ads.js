import { S } from '../state.js';

// ========================================
// SQUARE ADS (ADMIN-REDESIGN §6)
// 推荐流广告：GET /ads/feed 拉当日可投广告 → bentoLargeCard 形态渲染
// 曝光（IntersectionObserver ≥50%，每卡每会话最多 1 次）+ 点击埋点
// 内存队列每 10s / 页面隐藏时批量 POST /ads/events
// 校园墙不插广告；无学校资料不请求（由 square.js 调用侧保证 tab 条件）。
// ========================================

// —— 模块级会话状态 ——
let adQueue = [];                    // 待上报事件 [{campaignId, school, type}]
let flushTimer = null;               // 10s 批量上报定时器
let adObserver = null;               // 曝光观察器（≥50% 可见）
const seenImpressions = new Set();   // 本次会话已计曝光的 campaignId（去重）
let adsById = {};                    // 本次拉取的广告缓存（点击/详情浮层查用）
let adSchool = '';                   // 事件上报用的学校名（与拉取时一致）
const AD_QUEUE_MAX = 200;            // 队列上限，防止离线时无限增长

// 用户学校：广告定向 + 事件上报都用它；无学校 = 不请求广告
function adUserSchool() {
  return S.currentUser?.profile?.school || '';
}

// 会话归属：SPA 内换账号（登出/重登不刷新页面）时必须重置广告会话状态，
// 否则旧账号的曝光去重集合会让新账号的 CPM 曝光被漏计、旧队列串号上报。
let adSessionToken = null;
function ensureAdSession() {
  const token = localStorage.getItem('cl_token') || '';
  if (adSessionToken === null) { adSessionToken = token; return; }
  if (token !== adSessionToken) {
    adSessionToken = token;
    adQueue = [];
    seenImpressions.clear();
    adsById = {};
    adSchool = '';
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    if (adObserver) { adObserver.disconnect(); }
  }
}

// 拉取该校当日可展示广告（后端随机轮换，卡片形状同官方大卡）。
// 失败静默返回空数组——广告挂了绝不能影响正常信息流。
export async function fetchSquareAds() {
  ensureAdSession();
  const school = adUserSchool();
  if (!school) return [];
  try {
    const data = await window.api(`/ads/feed?school=${encodeURIComponent(school)}&limit=3`);
    const env = (data && (data.data || data)) || {};
    const ads = (Array.isArray(env) ? env : (env.items || env.ads || [])).filter(a => a && a.id);
    adSchool = school;
    adsById = {};
    ads.forEach(a => { adsById[a.id] = a; });
    return ads;
  } catch (e) {
    console.error('fetchSquareAds error:', e);
    return [];
  }
}

// 广告大卡：视觉形态同 bentoLargeCard（外层由 square.js 包 col-span-2），
// Sponsored 霓虹徽章左上 + advertiserName 作者行；无点赞、不进普通帖详情。
export function adLargeCard(ad) {
  const esc = window.escapeHtml;
  const img = (ad.images || [])[0];
  const media = img
    ? `<div class="relative overflow-hidden aspect-[4/5] bg-surface-container">
        <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="${window.safeUrl(img)}" onerror="this.style.display='none'">
        <div class="absolute top-4 left-4"><span class="sponsored-badge">Sponsored</span></div>
      </div>`
    // 后端 schema 要求至少 1 图，这里仍兜底：无图时徽章走顶部标题行
    : `<div class="px-3 pt-3"><span class="sponsored-badge">Sponsored</span></div>`;
  return `<article data-ad-id="${ad.id}" class="group cursor-pointer bg-surface-container-lowest rounded-[6px] overflow-hidden" onclick="onAdClick('${ad.id}')">
    ${media}
    <div class="space-y-1 min-w-0 px-3 pt-2 pb-3">
      ${ad.title ? `<h3 class="font-headline font-bold text-lg tracking-tight">${esc(ad.title)}</h3>` : ''}
      <p class="text-neutral-500 text-sm italic" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(ad.content || '')}</p>
      <p class="text-neutral-400 text-[10px] tracking-widest">${esc(ad.advertiserName || 'Sponsor')}</p>
    </div>
  </article>`;
}

// 点击：整卡 tap 计 1 次 click；有 landingUrl 开新页（noopener），无则展示详情浮层。
function onAdClick(adId) {
  const ad = adsById[adId];
  if (!ad) return;
  queueAdEvent(ad.id, 'click');
  if (ad.landingUrl) {
    window.open(ad.landingUrl, '_blank', 'noopener');
  } else {
    showAdDetail(ad);
  }
}
window.onAdClick = onAdClick;

// 无外链广告的极简详情浮层（标题/图片/文案）。动态挂到 body，
// 视觉沿用 post-detail-overlay 的全屏白底 + 返回头部形态，关闭即移除。
function showAdDetail(ad) {
  closeAdDetail();
  const esc = window.escapeHtml;
  const wrap = document.createElement('div');
  wrap.id = 'ad-detail-overlay';
  wrap.className = 'fixed inset-0 z-[60] bg-surface overflow-y-auto';
  wrap.innerHTML = `
    <header class="sticky top-0 z-10 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 flex items-center px-6 h-16">
      <button class="flex items-center gap-3" onclick="closeAdDetail()">
        <span class="material-symbols-outlined text-2xl text-on-surface">arrow_back</span>
        <span class="font-headline font-bold tracking-[0.15em] text-on-surface text-[10px] mt-0.5">Sponsored</span>
      </button>
    </header>
    <main class="w-full max-w-screen-md mx-auto pb-16">
      ${(ad.images || []).map(img => `<img src="${window.safeUrl(img)}" class="w-full object-cover" onerror="this.style.display='none'">`).join('')}
      <div class="px-6 py-8">
        <div class="mb-4"><span class="sponsored-badge">Sponsored</span></div>
        ${ad.title ? `<h2 class="font-headline text-3xl font-bold tracking-tighter mb-4 leading-none">${esc(ad.title)}</h2>` : ''}
        <p class="text-on-surface-variant leading-relaxed text-lg font-light whitespace-pre-wrap">${esc(ad.content || '')}</p>
        <p class="text-neutral-400 text-[10px] tracking-widest mt-6">${esc(ad.advertiserName || 'Sponsor')}</p>
      </div>
    </main>`;
  document.body.appendChild(wrap);
}

function closeAdDetail() {
  document.getElementById('ad-detail-overlay')?.remove();
}
window.closeAdDetail = closeAdDetail;

// 曝光观察：feed 渲染完成后对容器内的广告卡挂 IntersectionObserver，
// ≥50% 可见即计 1 次曝光并 unobserve；同一 campaign 本次会话不再重复计。
export function observeAdImpressions(container) {
  if (!('IntersectionObserver' in window)) return;
  if (!adObserver) {
    adObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting || en.intersectionRatio < 0.5) continue;
        adObserver.unobserve(en.target);
        const id = en.target.dataset.adId;
        if (!id || seenImpressions.has(id)) continue;
        seenImpressions.add(id);
        queueAdEvent(id, 'impression');
      }
    }, { threshold: 0.5 });
  } else {
    // 每次重渲染前清掉旧卡的观察（innerHTML 替换后旧元素已脱离文档）
    adObserver.disconnect();
  }
  container.querySelectorAll('[data-ad-id]').forEach(el => {
    const id = el.dataset.adId;
    if (id && !seenImpressions.has(id)) adObserver.observe(el);
  });
}

// 事件入内存队列，并确保 10s 批量上报循环已启动。
function queueAdEvent(campaignId, type) {
  ensureAdSession();
  if (!campaignId || !adSchool) return;
  if (adQueue.length >= AD_QUEUE_MAX) adQueue.shift();
  adQueue.push({ campaignId, school: adSchool, type });
  if (!flushTimer) flushTimer = setInterval(flushAdEvents, 10000);
}

// 批量上报 POST /ads/events {events:[...]}，后端单批上限 100 条，超出须分片
// （整批 >100 会被 DTO 校验 400 拒收，可计费点击将全部丢失）。
// 该端点走用户 JWT（AdsPublicController），sendBeacon 无法携带 Authorization 头，
// 故按设计降级方案统一用 fetch keepalive —— 页面隐藏/卸载时请求仍可靠送达。
const AD_BATCH_MAX = 100;
async function flushAdEvents() {
  ensureAdSession();
  if (!adQueue.length) return;
  const pending = adQueue.splice(0, adQueue.length);
  const token = localStorage.getItem('cl_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let i = 0; i < pending.length; i += AD_BATCH_MAX) {
    const events = pending.slice(i, i + AD_BATCH_MAX);
    try {
      const res = await fetch(`${S.API}/ads/events`, {
        method: 'POST',
        keepalive: true,
        headers,
        body: JSON.stringify({ events }),
      });
      // 5xx 服务端故障回队重试；4xx（校验/鉴权）重试也不会成功，丢弃防死循环
      if (!res.ok && res.status >= 500) adQueue = adQueue.concat(events);
    } catch (e) {
      // 网络失败回队，等下个 10s 周期重试（队列有上限，不会无限膨胀）
      adQueue = adQueue.concat(events);
      console.error('flushAdEvents error:', e);
    }
  }
}

// 页面隐藏/离开时立即冲队列（visibilitychange 为主，pagehide 兜底 iOS Safari）。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAdEvents();
});
window.addEventListener('pagehide', () => flushAdEvents());
