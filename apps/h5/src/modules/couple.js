// 情侣空间（本轮反馈2 改版）：恋人确认后匹配页变成这里。
// 数据来自 GET /couple/:matchId；写操作返回最新 space，直接重渲。无 emoji。
import { S } from '../state.js';

const esc = (s) => window.escapeHtml(s == null ? '' : String(s));

// 今日状态预设（情绪向，本轮反馈6c）：每个带 Material Symbol 图标
const STATUS_PRESETS = [
  { label: 'Happy', icon: 'sentiment_very_satisfied' },
  { label: 'Loved', icon: 'favorite' },
  { label: 'Excited', icon: 'celebration' },
  { label: 'Tired', icon: 'bedtime' },
  { label: 'Sad', icon: 'sentiment_dissatisfied' },
  { label: 'Awkward', icon: 'sentiment_stressed' },
  { label: 'Anxious', icon: 'sentiment_worried' },
  { label: 'Angry', icon: 'mood_bad' },
];
const statusIcon = (label) => {
  const p = STATUS_PRESETS.find((x) => x.label.toLowerCase() === String(label || '').trim().toLowerCase());
  return p ? p.icon : '';
};

// 多图：可删缩略图条（编辑态，本轮反馈4）。urls 为引用数组，点 × 直接改数组并重渲。
function renderThumbStrip(container, urls) {
  if (!container) return;
  container.innerHTML = urls.length
    ? `<div class="flex flex-wrap gap-2">${urls
        .map(
          (u, i) => `<div class="relative w-20 h-20">
            <img src="${window.safeUrl(u)}" class="w-full h-full object-cover rounded-[10px] border border-outline-variant/40" onerror="this.style.display='none'">
            <button type="button" data-rm="${i}" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><span class="material-symbols-outlined" style="font-size:13px">close</span></button>
          </div>`,
        )
        .join('')}</div>`
    : '';
  container.querySelectorAll('[data-rm]').forEach((b) => {
    b.onclick = () => {
      urls.splice(parseInt(b.dataset.rm, 10), 1);
      renderThumbStrip(container, urls);
    };
  });
}

// 多图：只读相册（查看态，本轮反馈4）
function renderThumbGallery(urls) {
  if (!urls || !urls.length) return '';
  return `<div class="grid grid-cols-3 gap-2 mb-3">${urls
    .map((u) => `<img src="${window.safeUrl(u)}" class="w-full h-24 object-cover rounded-[10px] border border-outline-variant/40" onerror="this.style.display='none'">`)
    .join('')}</div>`;
}

// 多图：选择多张并依次上传，完成后把 URL 数组交给回调（本轮反馈4）
function pickAndUploadImages(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.multiple = true;
  inp.onchange = async () => {
    const files = Array.from(inp.files || []);
    if (!files.length) return;
    window.toast('Uploading…');
    const urls = [];
    for (const f of files) {
      try {
        urls.push(await window.uploadImageFile(f));
      } catch (e) {
        /* 跳过单张失败 */
      }
    }
    if (!urls.length) {
      window.toast('Upload failed');
      return;
    }
    // 部分失败也要如实告知用户（本轮反馈4）：不能再「全部成功」式静默吞掉失败张数。
    if (urls.length < files.length) {
      window.toast(`Uploaded ${urls.length} of ${files.length} (${files.length - urls.length} failed)`);
    }
    onDone(urls);
  };
  inp.click();
}

function fmtTime(d) {
  try {
    return new Date(d).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
}

async function renderCoupleSpace(container, matchId, partner) {
  S.coupleMatchId = matchId;
  S.couplePartner = partner || {};
  S.coupleContainer = container || document.getElementById('match-content');
  const host = S.coupleContainer;
  if (!host) return;
  host.innerHTML = `<div class="w-full max-w-xl mx-auto py-10 text-center text-outline text-sm">Loading your space…</div>`;
  await loadCoupleSpace();
}
window.renderCoupleSpace = renderCoupleSpace;

async function loadCoupleSpace() {
  const matchId = S.coupleMatchId;
  const host = S.coupleContainer || document.getElementById('match-content');
  if (!matchId || !host) return;
  try {
    const res = await window.api('/couple/' + matchId);
    S.coupleSpace = res?.data || res;
    host.innerHTML = renderCoupleHub(S.coupleSpace);
  } catch (e) {
    host.innerHTML = `<div class="w-full max-w-xl mx-auto py-10 text-center text-outline text-sm">Couldn't load your space. <button class="underline" onclick="loadCoupleSpace()">Retry</button></div>`;
  }
}
window.loadCoupleSpace = loadCoupleSpace;

// 小标题（本轮反馈3：去掉前面的破折号）
function section(title, addBtn, body) {
  return `<div class="mb-5">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-headline font-extrabold text-[11px] tracking-[0.2em] text-on-surface uppercase">${esc(title)}</h2>
      ${addBtn || ''}
    </div>
    ${body}
  </div>`;
}

function schedEntry(e, mine) {
  const t = `${fmtTime(e.startAt)} – ${fmtTime(e.endAt)}`;
  return `<div class="rounded-[10px] border ${e.expired ? 'border-outline-variant/20 bg-surface-container' : 'border-neon bg-neon/10'} p-2 mb-2">
    <div class="flex items-start justify-between gap-1">
      <p class="text-xs font-bold ${e.expired ? 'line-through text-outline' : 'text-on-surface'}">${esc(e.text)}</p>
      ${mine && !e.expired ? `<button onclick="coupleDelSchedule('${e.id}')" class="text-outline shrink-0"><span class="material-symbols-outlined" style="font-size:14px">close</span></button>` : ''}
    </div>
    <p class="text-[10px] ${e.expired ? 'text-outline' : 'text-on-surface-variant'} tracking-wider mt-0.5">${t}${e.expired ? ' · record' : ''}</p>
  </div>`;
}

function renderCoupleHub(space) {
  const partner = space.partner || {};
  const days = space.daysTogether;
  const status = space.status || { me: '', partner: '' };
  const craving = space.craving || { me: { current: '', history: [] }, partner: { current: '' } };
  const schedule = space.schedule || { me: [], partner: [] };
  const annis = space.anniversaries || [];
  const bucket = space.bucket || [];
  const pAvatar = partner.avatarUrl || '';
  const pName = partner.nickname || 'Partner';
  const pUp = esc(pName.toUpperCase());
  const cover = space.cover || ''; // 各自的情侣封面（本轮反馈4）
  const ly = space.loveYou || { me: { count: 0, sentToday: false }, partner: { count: 0 } };

  // 顶部卡片：可编辑封面图（各自不同，点空白处编辑）+ 今日状态 + 对方 bio
  const heroIcon = (label) => (statusIcon(label) ? `<span class="material-symbols-outlined" style="font-size:16px">${statusIcon(label)}</span>` : '');
  const header = `
    <div class="relative rounded-[10px] overflow-hidden p-6 mb-5 text-white cursor-pointer" onclick="coupleEditCover(event)" style="${cover ? `background-image:linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.6)),url('${window.safeCssUrl(cover)}');background-size:cover;background-position:center;` : 'background:#2e1a3a;'}">
      <span class="absolute top-3 right-3 material-symbols-outlined text-white/55 pointer-events-none" style="font-size:18px">edit</span>
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-full overflow-hidden ring-2 ring-neon shrink-0 bg-surface-container flex items-center justify-center">
          ${pAvatar ? `<img src="${window.safeUrl(pAvatar)}" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-outline">person</span>'}
        </div>
        <div class="min-w-0">
          <p class="text-[10px] tracking-[0.2em] text-neon font-bold">IN A RELATIONSHIP</p>
          <h2 class="font-headline font-extrabold text-xl tracking-tight truncate">You &amp; ${esc(pName)}</h2>
        </div>
      </div>
      ${partner.bio ? `<p class="text-xs text-white/70 mt-3 leading-relaxed" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(partner.bio)}</p>` : ''}
      ${days != null ? `<div class="mt-4 flex items-end gap-2"><span class="font-headline font-extrabold text-5xl leading-none text-neon">${days}</span><span class="text-xs tracking-widest text-white/70 mb-1">DAY${days === 1 ? '' : 'S'} TOGETHER</span></div>` : ''}
      <div class="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/15">
        <button onclick="coupleEditStatus()" class="text-left active:opacity-70">
          <p class="text-[9px] font-bold tracking-widest text-neon mb-0.5">YOU · TODAY</p>
          <p class="text-sm flex items-center gap-1 ${status.me ? 'text-white' : 'text-white/50 italic'}">${status.me ? heroIcon(status.me) + esc(status.me) : 'Set your status'}</p>
        </button>
        <div>
          <p class="text-[9px] font-bold tracking-widest text-white/60 mb-0.5">${pUp} · TODAY</p>
          <p class="text-sm flex items-center gap-1 ${status.partner ? 'text-white' : 'text-white/40 italic'}">${status.partner ? heroIcon(status.partner) + esc(status.partner) : 'No update'}</p>
        </div>
      </div>
    </div>`;

  // 纪念日：卡片样式 + 过去/未来不同底色 + 主页只显示2将来+1过去 + 看全部按钮 + 点进详情可改图文（本轮反馈6b）
  const anniCard = (a) => {
    const du = a.daysUntil;
    const future = du >= 0;
    const label = du > 0 ? `${du} day${du === 1 ? '' : 's'} to go` : du === 0 ? 'Today' : `${-du} day${du === -1 ? '' : 's'} ago`;
    const bg = future ? 'bg-neon-pink/10 border-neon-pink/30' : 'bg-surface-container border-outline-variant/20';
    const imgs = a.images || [];
    const thumb = imgs[0] ? `<div class="relative w-12 h-12 rounded-[8px] overflow-hidden shrink-0 bg-surface-container"><img src="${window.safeUrl(imgs[0])}" class="w-full h-full object-cover" onerror="this.parentElement.style.display='none'">${imgs.length > 1 ? `<span class="absolute bottom-0 right-0 px-1 bg-black/65 text-white text-[9px] font-bold rounded-tl-[6px]">${imgs.length}</span>` : ''}</div>` : '';
    return `<button onclick="openAnniversaryDetail('${a.id}')" class="w-full text-left ${bg} border rounded-[10px] p-4 flex items-center justify-between gap-3 active:scale-[0.99]">
      <div class="flex items-center gap-3 min-w-0">${thumb}<div class="min-w-0"><p class="text-sm font-bold text-on-surface truncate">${esc(a.title)}</p><p class="text-[10px] text-outline tracking-wider mt-0.5">${esc(String(a.date).slice(0, 10))}${a.note ? ' · note' : ''}</p></div></div>
      <span class="text-xs font-bold ${future ? 'text-neon-pink' : 'text-outline'} tracking-widest shrink-0">${label}</span>
    </button>`;
  };
  const anniUpcoming = annis.filter((a) => a.daysUntil >= 0).sort((a, b) => a.daysUntil - b.daysUntil);
  const anniPast = annis.filter((a) => a.daysUntil < 0).sort((a, b) => b.daysUntil - a.daysUntil);
  const anniShown = [...anniUpcoming.slice(0, 2), ...anniPast.slice(0, 1)];
  const anniBody = annis.length
    ? `<div class="grid grid-cols-1 gap-3">${anniShown.map(anniCard).join('')}</div>`
    : `<p class="text-sm text-outline italic">No anniversaries yet.</p>`;
  const anniSection = section(
    'Anniversaries',
    `<div class="flex items-center gap-1">${annis.length ? `<button onclick="openAnniversaryAll()" class="text-on-surface hover:text-neon-pink" title="View all"><span class="material-symbols-outlined" style="font-size:20px">list</span></button>` : ''}<button onclick="openAddAnniversary()" class="text-on-surface hover:text-neon-pink"><span class="material-symbols-outlined" style="font-size:20px">add</span></button></div>`,
    anniBody,
  );

  // 今天想吃（左右并列 + 历史快速选）
  const myHist = (craving.me.history || []).filter((h) => h && h !== craving.me.current);
  const cravingBody = `
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-3">
        <div class="flex items-center justify-between mb-1"><p class="text-[9px] font-bold tracking-widest text-outline">YOU</p><button onclick="coupleEditCraving()" class="text-outline"><span class="material-symbols-outlined" style="font-size:15px">edit</span></button></div>
        <p class="text-sm ${craving.me.current ? 'text-on-surface' : 'text-outline italic'}">${craving.me.current ? esc(craving.me.current) : 'Tap edit'}</p>
        ${myHist.length ? `<div class="flex flex-wrap gap-1 mt-2">${myHist.slice(0, 5).map((h) => `<button onclick="coupleQuickCraving('${encodeURIComponent(h)}')" class="px-2 py-0.5 rounded-[10px] bg-surface-container text-[10px] text-on-surface-variant">${esc(h)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-3">
        <p class="text-[9px] font-bold tracking-widest text-outline mb-1">${pUp}</p>
        <p class="text-sm ${craving.partner.current ? 'text-on-surface' : 'text-outline italic'}">${craving.partner.current ? esc(craving.partner.current) : 'No update'}</p>
      </div>
    </div>`;
  const cravingSection = section('Craving today', '', cravingBody);

  // 近期安排（左右并列 + 起止时间，过期变灰成记录）
  // 最多显示约4条，多余滚动查看（本轮反馈4）
  const schedCol = (list, mine) =>
    list.length
      ? `<div class="${list.length > 4 ? 'max-h-64 overflow-y-auto pr-1' : ''}">${list.map((e) => schedEntry(e, mine)).join('')}</div>`
      : `<p class="text-[11px] text-outline italic">${mine ? "Add what you're up to" : 'No update'}</p>`;
  const scheduleBody = `
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-3">
        <div class="flex items-center justify-between mb-2"><p class="text-[9px] font-bold tracking-widest text-outline">YOU</p><button onclick="openAddSchedule()" class="text-outline hover:text-neon-pink"><span class="material-symbols-outlined" style="font-size:16px">add</span></button></div>
        ${schedCol(schedule.me, true)}
      </div>
      <div class="bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-3">
        <p class="text-[9px] font-bold tracking-widest text-outline mb-2">${pUp}</p>
        ${schedCol(schedule.partner, false)}
      </div>
    </div>`;
  const scheduleSection = section("What I'm up to", '', scheduleBody);

  // 礼物罐（小卡片，点进去才看对方想要的；自己的不显示）
  const giftSection = `<div class="mb-5"><button onclick="openGiftJar()" class="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-4 flex items-center justify-between active:scale-[0.99]">
    <div class="flex items-center gap-3"><span class="material-symbols-outlined text-neon-pink">redeem</span><div class="text-left"><p class="text-sm font-bold text-on-surface">Gift jar</p><p class="text-[10px] text-outline">See what ${esc(pName)} wants</p></div></div>
    <span class="material-symbols-outlined text-outline">chevron_right</span>
  </button></div>`;

  // 打卡清单（已完成不可删；打勾弹卡片+可加图文；点已完成查看记录）
  const bucketBody = bucket.length
    ? bucket
        .map((b) => {
          const hasRecord = b.done && (b.doneNote || (b.doneImages && b.doneImages.length));
          return `<div class="flex items-center gap-3 py-2 border-b border-outline-variant/15 last:border-0">
        <button onclick="coupleTickBucket('${b.id}', ${b.done ? 'true' : 'false'})" class="shrink-0 w-5 h-5 rounded-[6px] border ${b.done ? 'bg-neon border-neon' : 'border-outline'} flex items-center justify-center">${b.done ? '<span class="material-symbols-outlined text-black" style="font-size:16px">check</span>' : ''}</button>
        <button onclick="coupleViewBucket('${b.id}')" class="flex-1 text-left ${b.done ? '' : 'pointer-events-none'}"><p class="text-sm ${b.done ? 'line-through text-outline' : 'text-on-surface'}">${esc(b.text)}${hasRecord ? ' <span class="material-symbols-outlined text-neon-pink align-middle" style="font-size:14px">photo</span>' : ''}</p></button>
        ${b.done ? '' : `<button onclick="coupleDelBucket('${b.id}')" class="text-outline hover:text-neon-pink shrink-0"><span class="material-symbols-outlined" style="font-size:18px">close</span></button>`}
      </div>`;
        })
        .join('')
    : `<p class="text-sm text-outline italic">Nothing planned yet.</p>`;
  const bucketSection = section(
    'Plans & checklist',
    `<button onclick="coupleAddBucket()" class="text-on-surface hover:text-neon-pink"><span class="material-symbols-outlined" style="font-size:20px">add</span></button>`,
    `<div class="bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-3">${bucketBody}</div>`,
  );

  // 主按钮：发送我爱你（每天一次）。Open Chat 已移除（本轮反馈4）；底部仅保留结束关系
  const actions = `
    <button class="btn-cta ${ly.me.sentToday ? 'bg-surface-container text-outline' : 'bg-neon text-black'} shadow-lg" ${ly.me.sentToday ? 'disabled' : ''} onclick="coupleSendLoveYou()">${ly.me.sentToday ? 'Sent today — see you tomorrow' : 'Send I love you'}</button>
    <button class="w-full py-2 mt-3 text-[10px] text-neon-pink font-medium underline underline-offset-4 tracking-widest" onclick="dissolveMatch('${esc(space.matchId)}')">End Relationship</button>`;

  return `<div class="w-full max-w-xl mx-auto py-4">${header}${anniSection}${cravingSection}${scheduleSection}${bucketSection}${giftSection}${actions}</div>`;
}

// ── 写操作（均返回最新 space，直接重渲）──
async function coupleApi(path, method, body) {
  try {
    const res = await window.api('/couple/' + S.coupleMatchId + path, method, body);
    S.coupleSpace = res?.data || res;
    const host = S.coupleContainer || document.getElementById('match-content');
    if (host) host.innerHTML = renderCoupleHub(S.coupleSpace);
  } catch (e) {
    window.toast('Failed: ' + (e?.message || 'try again'));
  }
}

// 发送我爱你（每天一次；后端在聊天发一条「我爱你」，彩蛋满100×100发里程碑，用户无感）
// in-flight 标记 + 禁用 CTA，防止连点重复 POST（本轮反馈5）。
let loveYouInFlight = false;
async function coupleSendLoveYou() {
  if (loveYouInFlight) return;
  loveYouInFlight = true;
  const cta = document.querySelector('button[onclick="coupleSendLoveYou()"]');
  if (cta) cta.disabled = true;
  try {
    const res = await window.api('/couple/' + S.coupleMatchId + '/love-you', 'POST', {});
    S.coupleSpace = res?.data || res;
    const host = S.coupleContainer || document.getElementById('match-content');
    if (host) host.innerHTML = renderCoupleHub(S.coupleSpace);
    window.toast('Sent I love you');
  } catch (e) {
    window.toast(e?.message || 'Already sent today');
  } finally {
    loveYouInFlight = false;
    // 成功路径已重渲 hub（按钮变为「Sent today」disabled 态）；失败/未重渲时复位旧按钮。
    const stillThere = document.querySelector('button[onclick="coupleSendLoveYou()"]');
    if (stillThere) stillThere.disabled = false;
  }
}
window.coupleSendLoveYou = coupleSendLoveYou;

// 编辑情侣封面（各自一张，点卡片空白处触发；点按钮不触发，本轮反馈4）
function coupleEditCover(ev) {
  if (ev && ev.target && ev.target.closest('button, a')) return;
  const hasCover = !!(S.coupleSpace && S.coupleSpace.cover);
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-1">Couple cover</h3>
    <p class="text-sm text-on-surface-variant mb-5">Set your own cover for this space — your partner sets theirs separately.</p>
    <div class="flex flex-col gap-3">
      <button data-pick class="w-full py-3 rounded-[10px] bg-neon text-black text-xs font-bold tracking-widest">Choose photo</button>
      ${hasCover ? `<button data-remove class="w-full py-3 rounded-[10px] border border-neon-pink text-neon-pink text-xs font-bold tracking-widest">Remove</button>` : ''}
      <button data-x class="w-full py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Cancel</button>
    </div>`);
  back.querySelector('[data-x]').onclick = () => back.remove();
  const rm = back.querySelector('[data-remove]');
  if (rm) rm.onclick = async () => { back.remove(); await coupleApi('/cover', 'PUT', { imageUrl: null }); };
  back.querySelector('[data-pick]').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      window.toast('Uploading…');
      try {
        const url = await window.uploadImageFile(f);
        back.remove();
        await coupleApi('/cover', 'PUT', { imageUrl: url });
      } catch (e) {
        window.toast('Upload failed');
      }
    };
    inp.click();
  };
}
window.coupleEditCover = coupleEditCover;

// 通用弹卡片容器
function couplePopup(innerHtml) {
  const back = document.createElement('div');
  back.className = 'fixed inset-0 z-[120] flex items-center justify-center px-6 bg-black/40 backdrop-blur-[2px]';
  back.innerHTML = `<div class="w-full max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6 max-h-[85vh] overflow-y-auto">${innerHtml}</div>`;
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  document.body.appendChild(back);
  return back;
}

// 今日状态：预设(带图标)可选 + 自写（本轮反馈6c）
function coupleEditStatus() {
  const cur = (S.coupleSpace?.status?.me) || '';
  const chips = STATUS_PRESETS.map((p) => `<button data-preset="${esc(p.label)}" class="flex flex-col items-center gap-1 p-2 rounded-[10px] border ${cur === p.label ? 'border-neon bg-neon/10' : 'border-outline-variant/30'} active:scale-95">
      <span class="material-symbols-outlined text-on-surface" style="font-size:22px">${p.icon}</span>
      <span class="text-[10px] font-bold text-on-surface">${esc(p.label)}</span>
    </button>`).join('');
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-4">Today's status</h3>
    <div class="grid grid-cols-4 gap-2 mb-5">${chips}</div>
    <p class="text-[9px] font-bold tracking-widest text-outline mb-1">OR WRITE YOUR OWN</p>
    <input id="cp-status-input" type="text" placeholder="Custom status…" class="w-full bg-transparent border-0 border-b border-outline py-2 text-sm focus:ring-0 focus:border-b-2 focus:border-primary mb-5"/>
    <div class="flex gap-3">
      <button data-x class="flex-1 py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Cancel</button>
      <button data-ok class="flex-1 py-3 rounded-[10px] bg-neon text-black text-xs font-bold tracking-widest">Save</button>
    </div>`);
  const input = back.querySelector('#cp-status-input');
  input.value = cur && !statusIcon(cur) ? cur : '';
  back.querySelectorAll('[data-preset]').forEach((b) => {
    b.onclick = async () => { back.remove(); await coupleApi('/status', 'PUT', { status: b.dataset.preset }); };
  });
  back.querySelector('[data-x]').onclick = () => back.remove();
  back.querySelector('[data-ok]').onclick = async () => {
    const v = input.value.trim();
    back.remove();
    await coupleApi('/status', 'PUT', { status: v });
  };
}
window.coupleEditStatus = coupleEditStatus;

// 今天想吃
async function coupleEditCraving() {
  const v = await window.promptCard({ title: 'Craving today', label: 'What do you want to eat?', placeholder: 'e.g. Ramen' });
  if (v === null || !v.trim()) return;
  await coupleApi('/craving', 'POST', { text: v.trim() });
}
window.coupleEditCraving = coupleEditCraving;

async function coupleQuickCraving(enc) {
  const text = decodeURIComponent(enc);
  await coupleApi('/craving', 'POST', { text });
}
window.coupleQuickCraving = coupleQuickCraving;

// 近期安排（起止时间）
function openAddSchedule() {
  const fld = 'w-full bg-transparent border-0 border-b border-outline py-2 text-sm focus:ring-0 focus:border-b-2 focus:border-primary';
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-4">What are you up to?</h3>
    <input id="cp-sch-text" type="text" placeholder="e.g. Library then gym" class="${fld} mb-4"/>
    <p class="text-[9px] font-bold tracking-widest text-outline mb-1">START</p>
    <input id="cp-sch-start" type="datetime-local" class="${fld} mb-4"/>
    <p class="text-[9px] font-bold tracking-widest text-outline mb-1">END</p>
    <input id="cp-sch-end" type="datetime-local" class="${fld} mb-6"/>
    <div class="flex gap-3">
      <button data-x class="flex-1 py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Cancel</button>
      <button data-ok class="flex-1 py-3 rounded-[10px] bg-neon text-black text-xs font-bold tracking-widest">Add</button>
    </div>`);
  back.querySelector('[data-x]').onclick = () => back.remove();
  back.querySelector('[data-ok]').onclick = async () => {
    const text = back.querySelector('#cp-sch-text').value.trim();
    const startAt = back.querySelector('#cp-sch-start').value;
    const endAt = back.querySelector('#cp-sch-end').value;
    if (!text || !startAt || !endAt) { window.toast('Fill in activity and times'); return; }
    back.remove();
    await coupleApi('/schedule', 'POST', { text, startAt, endAt });
  };
}
window.openAddSchedule = openAddSchedule;

async function coupleDelSchedule(id) {
  await coupleApi('/schedule/' + id, 'DELETE');
}
window.coupleDelSchedule = coupleDelSchedule;

// 纪念日（日历选日期）
function openAddAnniversary() {
  const fld = 'w-full bg-transparent border-0 border-b border-outline py-2 text-sm focus:ring-0 focus:border-b-2 focus:border-primary';
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-4">New anniversary</h3>
    <input id="cp-anni-title" type="text" placeholder="e.g. First date" class="${fld} mb-4"/>
    <p class="text-[9px] font-bold tracking-widest text-outline mb-1">DATE</p>
    <input id="cp-anni-date" type="date" class="${fld} mb-6"/>
    <div class="flex gap-3">
      <button data-x class="flex-1 py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Cancel</button>
      <button data-ok class="flex-1 py-3 rounded-[10px] bg-neon text-black text-xs font-bold tracking-widest">Add</button>
    </div>`);
  back.querySelector('[data-x]').onclick = () => back.remove();
  back.querySelector('[data-ok]').onclick = async () => {
    const title = back.querySelector('#cp-anni-title').value.trim();
    const date = back.querySelector('#cp-anni-date').value;
    if (!title || !date) { window.toast('Title and date required'); return; }
    back.remove();
    await coupleApi('/anniversary', 'POST', { title, date });
  };
}
window.openAddAnniversary = openAddAnniversary;

async function coupleDelAnniversary(id) {
  const ok = await window.confirmCard({ title: 'Remove anniversary?', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  await coupleApi('/anniversary/' + id, 'DELETE');
}
window.coupleDelAnniversary = coupleDelAnniversary;

// 纪念日详情：查看/编辑标题+日期+图文，删除（确认）也在这里（本轮反馈6b）
function openAnniversaryDetail(id) {
  const a = (S.coupleSpace?.anniversaries || []).find((x) => x.id === id);
  if (!a) return;
  const urls = (a.images || []).slice(); // 多图（本轮反馈4）
  const fld = 'w-full bg-transparent border-0 border-b border-outline py-2 text-sm focus:ring-0 focus:border-b-2 focus:border-primary';
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-4">Anniversary</h3>
    <input id="cp-anni-title" type="text" value="${esc(a.title)}" class="${fld} mb-4"/>
    <p class="text-[9px] font-bold tracking-widest text-outline mb-1">DATE</p>
    <input id="cp-anni-date" type="date" value="${esc(String(a.date).slice(0, 10))}" class="${fld} mb-4"/>
    <textarea id="cp-anni-note" rows="2" placeholder="Add a note (optional)" class="${fld} resize-none mb-3">${esc(a.note || '')}</textarea>
    <div id="cp-anni-preview" class="mb-3"></div>
    <button data-photo class="text-[11px] font-bold tracking-widest text-on-surface underline underline-offset-2 mb-5 inline-flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:16px">add_a_photo</span>Add photos</button>
    <div class="flex gap-3">
      <button data-del class="px-4 py-3 rounded-[10px] border border-neon-pink text-neon-pink text-xs font-bold tracking-widest">Delete</button>
      <button data-ok class="flex-1 py-3 rounded-[10px] bg-neon text-black text-xs font-bold tracking-widest">Save</button>
    </div>
    <button data-x class="w-full mt-3 text-[10px] text-outline tracking-widest">Close</button>`);
  const preview = back.querySelector('#cp-anni-preview');
  renderThumbStrip(preview, urls);
  back.querySelector('[data-photo]').onclick = () =>
    pickAndUploadImages((newUrls) => {
      urls.push(...newUrls);
      renderThumbStrip(preview, urls);
    });
  back.querySelector('[data-x]').onclick = () => back.remove();
  back.querySelector('[data-del]').onclick = async () => {
    const ok = await window.confirmCard({ title: 'Delete anniversary?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    back.remove();
    await coupleApi('/anniversary/' + id, 'DELETE');
  };
  back.querySelector('[data-ok]').onclick = async () => {
    const title = back.querySelector('#cp-anni-title').value.trim();
    const date = back.querySelector('#cp-anni-date').value;
    const note = back.querySelector('#cp-anni-note').value.trim();
    if (!title || !date) { window.toast('Title and date required'); return; }
    back.remove();
    await coupleApi('/anniversary/' + id, 'PATCH', { title, date, note, images: urls });
  };
}
window.openAnniversaryDetail = openAnniversaryDetail;

// 查看全部纪念日
function openAnniversaryAll() {
  const annis = (S.coupleSpace?.anniversaries || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const rows = annis.length
    ? annis.map((a) => {
        const du = a.daysUntil;
        const future = du >= 0;
        const label = du > 0 ? `${du}d` : du === 0 ? 'Today' : `${-du}d ago`;
        return `<button onclick="document.querySelectorAll('.cp-all-pop').forEach((e)=>e.remove());openAnniversaryDetail('${a.id}')" class="w-full text-left flex items-center justify-between gap-3 py-2.5 border-b border-outline-variant/15 last:border-0">
          <div class="min-w-0"><p class="text-sm font-bold text-on-surface truncate">${esc(a.title)}</p><p class="text-[10px] text-outline">${esc(String(a.date).slice(0, 10))}</p></div>
          <span class="text-xs font-bold ${future ? 'text-neon-pink' : 'text-outline'} shrink-0">${label}</span>
        </button>`;
      }).join('')
    : '<p class="text-sm text-outline italic">No anniversaries.</p>';
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-3">All anniversaries</h3>
    <div>${rows}</div>
    <button data-x class="w-full mt-5 py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Close</button>`);
  back.classList.add('cp-all-pop');
  back.querySelector('[data-x]').onclick = () => back.remove();
}
window.openAnniversaryAll = openAnniversaryAll;

// 礼物罐：只看对方想要的
function openGiftJar() {
  const gifts = (S.coupleSpace?.gifts?.partner) || [];
  const pName = S.coupleSpace?.partner?.nickname || 'Partner';
  const list = gifts.length
    ? `<div class="flex flex-wrap gap-2">${gifts.map((g) => `<span class="px-3 py-1.5 rounded-[10px] bg-surface-container text-sm text-on-surface">${esc(g)}</span>`).join('')}</div>`
    : `<p class="text-sm text-outline italic">They haven't added any gifts yet.</p>`;
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-1">Gift jar</h3>
    <p class="text-[10px] font-bold tracking-widest text-outline mb-3">${esc(pName.toUpperCase())} WANTS</p>
    ${list}
    <button data-x class="w-full mt-6 py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Close</button>`);
  back.querySelector('[data-x]').onclick = () => back.remove();
}
window.openGiftJar = openGiftJar;

// 打卡清单
async function coupleAddBucket() {
  const text = await window.promptCard({ title: 'Add to checklist', label: 'Plan', placeholder: 'e.g. Watch the sunrise together' });
  if (text === null || !text.trim()) return;
  await coupleApi('/bucket', 'POST', { text: text.trim() });
}
window.coupleAddBucket = coupleAddBucket;

async function coupleTickBucket(id, currentDone) {
  const done = currentDone === true || currentDone === 'true';
  if (done) {
    const ok = await window.confirmCard({ title: 'Mark as not done?', confirmLabel: 'Yes' });
    if (ok) await coupleApi('/bucket/' + id, 'PATCH', { done: false });
    return;
  }
  const item = (S.coupleSpace?.bucket || []).find((b) => b.id === id);
  openCompleteBucket(id, item ? item.text : '');
}
window.coupleTickBucket = coupleTickBucket;

// 打勾完成卡片：确认 + 可加图文
function openCompleteBucket(id, text) {
  const urls = []; // 多图（本轮反馈4）
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-1">Mark done</h3>
    <p class="text-sm text-on-surface-variant mb-4">${esc(text)}</p>
    <textarea id="cp-bk-note" rows="2" placeholder="Add a note (optional)" class="w-full bg-transparent border-0 border-b border-outline py-2 text-sm resize-none focus:ring-0 focus:border-b-2 focus:border-primary mb-3"></textarea>
    <div id="cp-bk-preview" class="mb-3"></div>
    <button data-photo class="text-[11px] font-bold tracking-widest text-on-surface underline underline-offset-2 mb-5 inline-flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:16px">add_a_photo</span>Add photos</button>
    <div class="flex gap-3">
      <button data-x class="flex-1 py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Cancel</button>
      <button data-ok class="flex-1 py-3 rounded-[10px] bg-neon text-black text-xs font-bold tracking-widest">Done</button>
    </div>`);
  const preview = back.querySelector('#cp-bk-preview');
  back.querySelector('[data-photo]').onclick = () =>
    pickAndUploadImages((newUrls) => {
      urls.push(...newUrls);
      renderThumbStrip(preview, urls);
    });
  back.querySelector('[data-x]').onclick = () => back.remove();
  back.querySelector('[data-ok]').onclick = async () => {
    const note = back.querySelector('#cp-bk-note').value.trim();
    back.remove();
    await coupleApi('/bucket/' + id, 'PATCH', { done: true, note, images: urls });
  };
}

function coupleViewBucket(id) {
  const item = (S.coupleSpace?.bucket || []).find((b) => b.id === id);
  if (!item || !item.done) return;
  const img = renderThumbGallery(item.doneImages);
  const note = item.doneNote ? `<p class="text-sm leading-relaxed text-on-surface">${esc(item.doneNote)}</p>` : '<p class="text-sm text-outline italic">No note added.</p>';
  const back = couplePopup(`
    <h3 class="font-headline font-extrabold text-lg mb-1">${esc(item.text)}</h3>
    <p class="text-[10px] font-bold tracking-widest text-neon-pink mb-3">COMPLETED</p>
    ${img}${note}
    <button data-x class="w-full mt-6 py-3 rounded-[10px] border border-outline-variant text-on-surface text-xs font-bold tracking-widest">Close</button>`);
  back.querySelector('[data-x]').onclick = () => back.remove();
}
window.coupleViewBucket = coupleViewBucket;

async function coupleDelBucket(id) {
  const ok = await window.confirmCard({ title: 'Delete this plan?', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  await coupleApi('/bucket/' + id, 'DELETE');
}
window.coupleDelBucket = coupleDelBucket;
