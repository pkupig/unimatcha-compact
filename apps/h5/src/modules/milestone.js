import { S } from '../state.js';

// ========================================
// MILESTONES (relationship stats overlay)
// ========================================
async function openMilestones() {
  window.openOverlay('milestone-overlay');
  await loadMilestone();
}
window.openMilestones = openMilestones;

async function loadMilestone() {
  const c = document.getElementById('milestone-content');
  if (!c) return;
  c.innerHTML = `<div class="text-center pt-24 text-on-surface-variant text-sm tracking-widest">Loading...</div>`;
  let data = null;
  try {
    const res = await window.api('/matching/milestones');
    data = res?.data || res;
  } catch (e) {
    data = null;
  }
  if (!data || data.state !== 'relationship') {
    S.milestoneData = null;
    c.innerHTML = renderMilestoneEmpty();
    return;
  }
  S.milestoneData = data;
  // Best-effort partner info for the header (avatars + names)
  if (!S.matchStatus) {
    try {
      const st = await window.api('/matching/status');
      S.matchStatus = st?.data || st;
    } catch (e) {}
  }
  c.innerHTML = renderMilestone(data);
}
window.loadMilestone = loadMilestone;

function msAvatar(url) {
  return `<div class="w-24 h-24 rounded-full border border-primary p-1 bg-surface shadow-sm overflow-hidden shrink-0">
    ${url
      ? `<img src="${window.safeUrl(url)}" class="w-full h-full rounded-full object-cover">`
      : `<div class="w-full h-full rounded-full bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined text-outline text-2xl">person</span></div>`}
  </div>`;
}

// Timeline entry (design: rotated-square marker on a thin ink spine)
function msTimelineItem(eyebrow, title, body) {
  return `<div class="pl-8 relative">
    <div class="absolute left-[-4.5px] top-1 w-2 h-2 bg-primary rounded-full"></div>
    <p class="font-label text-[10px] tracking-widest text-on-surface-variant mb-1">${eyebrow}</p>
    <h4 class="font-headline text-lg font-extrabold tracking-tight mb-2">${title}</h4>
    <p class="text-sm text-on-surface-variant leading-relaxed">${body}</p>
  </div>`;
}

function renderMilestone(d) {
  const me = S.currentUser?.profile || {};
  const partner = S.matchStatus?.partner || S.matchStatus?.match || {};
  const myName = me.nickname || 'You';
  const partnerName = partner.nickname || partner.name || 'Partner';
  const since = d.startedAt
    ? new Date(d.startedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const msgs = (d.messageCount || 0).toLocaleString('en-US');
  const posts = (d.postCount || 0).toLocaleString('en-US');
  const days = d.daysTogether || 0;
  const shared = d.sharedInterests || [];
  return `
    <div class="absolute top-40 -right-20 w-64 h-64 border-[0.5px] border-outline-variant rounded-full pointer-events-none opacity-15 z-0"></div>
    <div class="relative z-10">
      <!-- Connection -->
      <section class="flex flex-col items-center mb-16">
        <div class="flex items-center justify-center gap-12 relative">
          ${msAvatar(me.avatarUrl)}
          <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <svg class="text-primary/60" fill="none" height="24" viewBox="0 0 48 24" width="48" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 12C6 12 6 6 12 6C18 6 18 18 24 18C30 18 30 6 36 6C42 6 42 12 48 12" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path>
            </svg>
          </div>
          ${msAvatar(partner.avatarUrl || partner.avatar)}
        </div>
        <div class="mt-8 text-center">
          <p class="font-headline text-xs tracking-[0.2em] font-bold text-on-surface-variant">${since ? `Together Since ${since}` : 'Active Connection'}</p>
          <h2 class="font-headline text-3xl font-extrabold tracking-tighter mt-1">${window.escapeHtml(myName)} &amp; ${window.escapeHtml(partnerName)}</h2>
        </div>
      </section>
      <!-- Stats grid -->
      <section class="grid grid-cols-2 gap-4 mb-20">
        <div class="bg-surface-container-lowest/80 backdrop-blur-sm p-6 flex flex-col justify-between h-32 border border-outline-variant/10 rounded-[10px]">
          <span class="font-label text-[10px] tracking-widest text-on-surface-variant">Messages</span>
          <span class="font-headline text-2xl font-black">${msgs}</span>
        </div>
        <div class="bg-surface-container-lowest/80 backdrop-blur-sm p-6 flex flex-col justify-between h-32 border border-outline-variant/10 rounded-[10px]">
          <span class="font-label text-[10px] tracking-widest text-on-surface-variant">Days Matched</span>
          <span class="font-headline text-2xl font-black">${days}</span>
        </div>
        <div class="col-span-2 bg-primary text-on-primary p-6 flex items-center justify-between rounded-[10px]">
          <span class="font-label text-[10px] tracking-widest">Moments Shared</span>
          <span class="font-headline text-3xl font-black">${posts}</span>
        </div>
      </section>
      <!-- Timeline -->
      <section class="mb-20">
        <h3 class="font-headline text-xs tracking-[0.3em] font-bold mb-12 text-center">The Story So Far</h3>
        <div class="space-y-16 relative">
          ${msTimelineItem(since || 'The Beginning', 'First Match', 'Two trajectories intersected within the campus matching archive.')}
          ${msTimelineItem('The Correspondence', `${msgs} Messages Exchanged`, 'An ongoing conversation, growing one inquiry at a time.')}
          ${msTimelineItem('The Couple Square', `${posts} Moments Archived`, 'Shared fragments published to your private gallery.')}
          ${msTimelineItem('Today', `Day ${days}`, 'The story continues — still being written.')}
        </div>
      </section>
      <!-- Shared interests -->
      <section class="mb-20 bg-surface-container-low/90 backdrop-blur-sm p-8 border border-outline-variant/20 rounded-[10px]">
        <h3 class="font-headline text-[10px] tracking-[0.3em] font-bold mb-8 border-b border-outline-variant pb-4">Shared Interests (${shared.length})</h3>
        ${shared.length
          ? `<div class="flex flex-wrap gap-2">${shared.map(t => `<span class="btn-tag">${window.escapeHtml(t)}</span>`).join('')}</div>`
          : `<p class="text-sm text-on-surface-variant italic">No shared interests yet — keep exploring together.</p>`}
      </section>
      <!-- Editorial footer -->
      <footer class="text-center">
        <p class="font-body italic text-[11px] text-on-surface-variant px-12 leading-relaxed bg-surface/40 backdrop-blur-[2px] inline-block">
          "In the silence between words, we found a language composed of ink and shared curiosity."
        </p>
        <div class="mt-4 flex justify-center gap-1">
          <div class="w-1 h-1 bg-primary"></div>
          <div class="w-1 h-1 bg-primary"></div>
          <div class="w-1 h-1 bg-primary"></div>
        </div>
      </footer>
    </div>`;
}

function renderMilestoneEmpty() {
  return `<div class="flex flex-col items-center text-center pt-20 px-6">
    <div class="w-20 h-20 border border-outline-variant rounded-full flex items-center justify-center mb-10">
      <span class="material-symbols-outlined text-outline text-3xl">auto_awesome</span>
    </div>
    <h2 class="font-headline text-lg font-extrabold tracking-[0.2em] mb-3">No Milestones Yet</h2>
    <p class="text-sm text-on-surface-variant leading-relaxed max-w-xs">Milestones unlock once you and your match enter relationship mode. Find your match to start the journey.</p>
    <button class="mt-10 px-10 py-4 rounded-[10px] bg-neon text-black font-headline text-[10px] font-bold tracking-[0.2em] active:scale-95 transition-all" onclick="hideOverlay('milestone-overlay');switchTab('match')">Go To Matching</button>
  </div>`;
}
