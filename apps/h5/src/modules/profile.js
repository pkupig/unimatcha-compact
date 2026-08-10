import { S } from '../state.js';

// 兴趣 chip 统一主色荧光绿（#CCFF00 实心 + 黑字），不再使用多色调色板。
const NEON = '#CCFF00';

// ========================================
// METADATA (cached dropdown options)
// ========================================
// 统一年级词表：Profile Setup 的分段按钮（data-year）与 Edit Profile 下拉必须使用
// 完全相同的值，否则 setup 存的 grade 在 Edit Profile 里无法正确回填/对齐。
const GRADE_OPTIONS = ['Freshman', 'Undergraduate', 'Postgraduate', 'Doctorate'];

// 把任意历史/大小写不一致的 grade 值规整到 GRADE_OPTIONS 中的标准写法，
// 保证 setup → edit 的回填能精确命中下拉项（fillMetaSelect 用精确匹配选中）。
function normalizeGrade(raw) {
  if (!raw) return '';
  const v = String(raw).trim().toLowerCase();
  const hit = GRADE_OPTIONS.find(o => o.toLowerCase() === v);
  return hit || raw;
}

async function fetchMetadata(path) {
  if (S.metadataCache[path]) return S.metadataCache[path];
  try {
    const res = await window.api(`/metadata/${path}`);
    const items = res?.data?.items || res?.items || [];
    // Only cache successful, non-empty results so a transient empty/failed
    // response doesn't get frozen in for the rest of the session.
    if (items.length) S.metadataCache[path] = items;
    return items;
  } catch (e) {
    // A17: don't silently swallow load failures — surface them so the user
    // knows the dropdown is empty due to an error (not "no data"), and so the
    // failed result is never cached (cache only holds successful results).
    console.error(`Metadata fetch failed (${path}):`, e.message);
    throw e;
  }
}
window.fetchMetadata = fetchMetadata;

function fillMetaSelect(id, items, current, placeholder) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const list = [...items];
  // Keep the stored value selectable even if it's not in the list
  if (current && !list.includes(current)) list.unshift(current);
  // 值存英文原文不变，显示文案走 metaLabel（中文态映射学校/城市/专业/国籍/年级）
  const label = (v) => window.metaLabel ? window.metaLabel(v) : v;
  sel.innerHTML = `<option value="">${placeholder}</option>` + list.map(v => `<option value="${window.escapeHtml(v)}"${v === current ? ' selected' : ''}>${window.escapeHtml(label(v))}</option>`).join('');
}
window.fillMetaSelect = fillMetaSelect;

// ─── 注册必填信息分步向导（本轮反馈3：每项一屏）────────────────
// 步骤：0 昵称 → 1 真实姓名 → 2 性别 → 3 生日 → 完成后显示其余选填资料表单。
let setupWizardStep = 0;

function setupWizardGo(i) {
  setupWizardStep = i;
  document.querySelectorAll('#setup-wizard .setup-step').forEach(el => {
    el.classList.toggle('hidden', Number(el.dataset.step) !== i);
  });
  const num = document.getElementById('setup-step-num');
  if (num) num.textContent = `${i + 1} / 4`;
  const bar = document.getElementById('setup-step-bar');
  if (bar) bar.style.width = `${(i + 1) * 25}%`;
  const prev = document.getElementById('setup-prev-btn');
  if (prev) prev.classList.toggle('hidden', i === 0);
  const next = document.getElementById('setup-next-btn');
  if (next) next.textContent = i === 3 ? 'Continue' : 'Next';
}

function setupWizardValidate(i) {
  if (i === 0) {
    if (!document.getElementById('setup-nickname')?.value?.trim()) {
      window.toast('Please enter a nickname');
      return false;
    }
  } else if (i === 1) {
    const gn = document.getElementById('setup-givenname')?.value?.trim();
    const fn = document.getElementById('setup-familyname')?.value?.trim();
    if (!gn || !fn) {
      window.toast('Please enter your real name');
      return false;
    }
  } else if (i === 2) {
    if (!document.querySelector('.gender-btn[data-selected="true"]')) {
      window.toast('Please select your gender');
      return false;
    }
  } else if (i === 3) {
    const b = document.getElementById('setup-birthday')?.value;
    if (!b) {
      window.toast('Please select your birthday');
      return false;
    }
    const age = ageFromBirthday(b);
    if (age == null || age < 16 || age > 40) {
      window.toast('Unimatcha is for students aged 16–40');
      return false;
    }
  }
  return true;
}

function setupWizardNext() {
  if (!setupWizardValidate(setupWizardStep)) return;
  if (setupWizardStep < 3) {
    setupWizardGo(setupWizardStep + 1);
    return;
  }
  // 必填四项收齐 → 展示其余选填资料
  document.getElementById('setup-wizard')?.classList.add('hidden');
  document.getElementById('setup-rest')?.classList.remove('hidden');
  document.getElementById('page-profile-setup')?.scrollTo({ top: 0 });
}
window.setupWizardNext = setupWizardNext;

function setupWizardPrev() {
  if (setupWizardStep > 0) setupWizardGo(setupWizardStep - 1);
}
window.setupWizardPrev = setupWizardPrev;

function setupWizardReset() {
  document.getElementById('setup-wizard')?.classList.remove('hidden');
  document.getElementById('setup-rest')?.classList.add('hidden');
  setupWizardGo(0);
}

let setupInitInFlight = false;
async function initProfileSetupPage() {
  setupWizardReset();
  // B33: guard against concurrent double-init (showPage may fire more than once
  // before metadata fetches resolve). Cached fetches make a repeat call cheap,
  // but this avoids redundant parallel network round-trips.
  if (setupInitInFlight) return;
  setupInitInFlight = true;
  const p = S.currentUser?.profile || {};
  // 已有资料时把标签同步进 setup 草稿，再渲染（否则重进 setup 看不到已填兴趣）。
  if (Array.isArray(p.interests) && p.interests.length && !S.setupTags.length) {
    S.setupTags = [...p.interests];
  }
  window.renderSetupTags();
  // Restore text fields if the user already has a profile (re-entering setup).
  const nickEl = document.getElementById('setup-nickname');
  if (nickEl && !nickEl.value) nickEl.value = p.nickname || '';
  const gnEl = document.getElementById('setup-givenname');
  if (gnEl && !gnEl.value) gnEl.value = p.givenName || '';
  const fnEl = document.getElementById('setup-familyname');
  if (fnEl && !fnEl.value) fnEl.value = p.familyName || '';
  const bioEl = document.getElementById('setup-bio');
  if (bioEl && !bioEl.value) bioEl.value = p.bio || '';
  // Live bio character counter (index.html 未绑定 oninput，这里补上）。
  if (bioEl && !bioEl.dataset.countBound) {
    bioEl.dataset.countBound = '1';
    const countEl = document.getElementById('setup-bio-count');
    const sync = () => { if (countEl) countEl.textContent = bioEl.value.length; };
    bioEl.addEventListener('input', sync);
    sync();
  }
  // Restore birthday + gender + preferred-gender selections if the user already has a profile.
  fillSetupBirthday(p);
  if (p.gender) {
    const gEl = document.querySelector(`.gender-btn[data-gender="${p.gender}"]`);
    if (gEl) selectSetupGender(gEl);
  }
  if (p.genderPref) {
    const gpEl = document.querySelector(`.genderpref-btn[data-genderpref="${p.genderPref}"]`);
    if (gpEl) selectSetupGenderPref(gpEl);
  }
  // Restore Academic Year segment (grade) — 统一词表后可精确命中按钮。
  const g = normalizeGrade(p.grade);
  if (g) {
    const yEl = document.querySelector(`.segment-btn[data-year="${g.toLowerCase()}"]`);
    if (yEl) selectYear(yEl);
  }
  const currentOf = (id, fallback) => document.getElementById(id)?.value || fallback || '';
  try {
    const [unis, cities, majors, mbtiTypes, nationalities] = await Promise.all([
      fetchMetadata('uk/universities'),
      fetchMetadata('uk/cities'),
      fetchMetadata('uk/majors'),
      fetchMetadata('mbti-types'),
      fetchMetadata('nationalities')
    ]);
    fillMetaSelect('setup-school', unis, currentOf('setup-school', p.school), 'Select Institution');
    fillMetaSelect('setup-city', cities, currentOf('setup-city', p.city), 'Select City');
    fillMetaSelect('setup-major', majors, currentOf('setup-major', p.major), 'Select Major');
    fillMetaSelect('setup-mbti', mbtiTypes, currentOf('setup-mbti', p.mbti), 'Select MBTI');
    fillMetaSelect('setup-nationality', nationalities, currentOf('setup-nationality', p.nationality), 'Select Nationality');
  } catch (e) {
    // A17: a real load failure (network/server) — tell the user instead of
    // leaving silently-empty dropdowns. Cache stays clean so a later open retries.
    window.toast('Failed to load options. Please try again.');
  } finally {
    setupInitInFlight = false;
  }
}
window.initProfileSetupPage = initProfileSetupPage;

// ========================================
// PROFILE SETUP
// ========================================
function addSetupTag() {
  const input = document.getElementById('setup-tag-input');
  // B35: single owner for the dedup/cap rules — delegate the push to
  // addSetupTagValue so the two entry points can't drift apart.
  addSetupTagValue(input?.value);
  if (input) input.value = '';
}
window.addSetupTag = addSetupTag;

function addSetupTagValue(tag) {
  tag = (tag || '').trim();
  if (!tag || S.setupTags.length >= 8 || S.setupTags.includes(tag)) return;
  S.setupTags.push(tag);
  window.renderSetupTags();
}
window.addSetupTagValue = addSetupTagValue;

function removeSetupTag(i) {
  S.setupTags.splice(i, 1);
  window.renderSetupTags();
}
window.removeSetupTag = removeSetupTag;

function getSetupTags() {
  return S.setupTags;
}
window.getSetupTags = getSetupTags;

function renderSetupTags() {
  const c = document.getElementById('setup-tags-list');
  if (!c) return;
  c.innerHTML = S.setupTags.map((t, i) => {
    return `<span class="tag-chip" style="background-color: ${NEON}; color: #000000; border-color: ${NEON};">${window.escapeHtml(t)} <span class="tag-remove" onclick="removeSetupTag(${i})">×</span></span>`;
  }).join('') + '<span class="tag-chip add-tag" onclick="document.getElementById(\'setup-tag-input\')?.focus()">+ Add New</span>';
}
window.renderSetupTags = renderSetupTags;

function selectYear(el) {
  document.querySelectorAll('.segment-btn').forEach(b => {
    b.className = 'segment-btn py-3 px-4 rounded-[10px] border border-outline-variant text-sm font-label tracking-wider hover:bg-neon hover:text-black transition-all active:scale-95';
    b.dataset.selected = '';
  });
  el.className = 'segment-btn py-3 px-4 rounded-[10px] bg-neon text-black text-sm font-label tracking-wider active:scale-95';
  el.dataset.selected = 'true';
}
window.selectYear = selectYear;

// Generic single-select toggle for setup segment groups (gender / preferred gender).
// Active button gets the ink-filled style; the rest keep the outlined look.
function selectSetupSegment(el, groupClass) {
  document.querySelectorAll('.' + groupClass).forEach(b => {
    b.className = groupClass + ' py-3 px-4 rounded-[10px] border border-outline-variant text-sm font-label tracking-wider hover:bg-neon hover:text-black transition-all active:scale-95';
    b.dataset.selected = '';
  });
  el.className = groupClass + ' py-3 px-4 rounded-[10px] bg-neon text-black text-sm font-label tracking-wider active:scale-95';
  el.dataset.selected = 'true';
}

function selectSetupGender(el) {
  selectSetupSegment(el, 'gender-btn');
}
window.selectSetupGender = selectSetupGender;

function selectSetupGenderPref(el) {
  selectSetupSegment(el, 'genderpref-btn');
}
window.selectSetupGenderPref = selectSetupGenderPref;

// 生日输入（替代年龄下拉）：限定可选区间为「今天往前 40 年 ~ 16 年」，与后端
// age 16-40 的校验一致；已有生日则回填。
function fillSetupBirthday(p) {
  const el = document.getElementById('setup-birthday');
  if (!el) return;
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  el.min = iso(new Date(now.getFullYear() - 40, now.getMonth(), now.getDate()));
  el.max = iso(new Date(now.getFullYear() - 16, now.getMonth(), now.getDate()));
  if (!el.value && p?.birthday) el.value = p.birthday;
}

// 按生日算周岁。生日无效返回 null。
function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday + 'T00:00:00');
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

async function saveProfile() {
  const nickname = document.getElementById('setup-nickname')?.value?.trim();
  const school = document.getElementById('setup-school')?.value;
  const bio = document.getElementById('setup-bio')?.value?.trim();
  const year = document.querySelector('.segment-btn[data-selected="true"]')?.dataset?.year || document.querySelector('.segment-btn.bg-neon')?.dataset?.year;
  const gender = document.querySelector('.gender-btn[data-selected="true"]')?.dataset?.gender || document.querySelector('.gender-btn.bg-neon')?.dataset?.gender;
  const genderPref = document.querySelector('.genderpref-btn[data-selected="true"]')?.dataset?.genderpref || document.querySelector('.genderpref-btn.bg-neon')?.dataset?.genderpref;
  const birthday = document.getElementById('setup-birthday')?.value || '';
  const age = ageFromBirthday(birthday);
  const givenName = document.getElementById('setup-givenname')?.value?.trim();
  const familyName = document.getElementById('setup-familyname')?.value?.trim();
  if (!nickname) {
    window.toast('Please enter a nickname');
    return;
  }
  // 真实姓名（名 + 姓）必填（用户要求：注册填资料时必填）
  if (!givenName || !familyName) {
    window.toast('Please enter your real name (given + family name)');
    return;
  }
  // Gender + age are required for the matching pool (backend filters out users
  // missing gender/genderPref/age). Block setup completion until they're set.
  if (!gender) {
    window.toast('Please select your gender');
    return;
  }
  if (!birthday || age == null) {
    window.toast('Please select your birthday');
    return;
  }
  // 与后端 age 16-40 校验一致，提前给出可读提示
  if (age < 16 || age > 40) {
    window.toast('Unimatcha is for students aged 16–40');
    return;
  }
  try {
    const payload = {
      nickname,
      givenName,
      familyName,
      realName: [givenName, familyName].filter(Boolean).join(' '),
      school,
      // 规整年级到统一词表，保证 Edit Profile 下拉能精确回填这个值。
      grade: normalizeGrade(year),
      gender,
      genderPref: genderPref || 'any',
      age,
      birthday,
      bio: bio?.substring(0, 250) || '',
      interests: S.setupTags
    };
    const selVal = id => document.getElementById(id)?.value || '';
    const extra = {
      city: selVal('setup-city'),
      major: selVal('setup-major'),
      mbti: selVal('setup-mbti'),
      nationality: selVal('setup-nationality')
    };
    Object.entries(extra).forEach(([k, v]) => {
      if (v) payload[k] = v;
    });
    await window.api('/profiles/me', 'PUT', payload);
    // 关键：把刚提交的资料同步进本地 S.currentUser.profile，否则随后打开
    // Edit Profile（从 S.currentUser.profile 读取回填）会读到注册时的旧空值，
    // 表现为「注册后填的资料没同步到 Edit Profile」。
    if (S.currentUser) {
      S.currentUser.profile = { ...(S.currentUser.profile || {}), ...payload };
    }
    // G rule (§6.3): after profile setup, enter home and surface the two
    // optional questionnaire cards (romantic / friend) instead of forcing a
    // single questionnaire. Both are optional and gate their own match mode.
    window.showPage('page-home');
    if (typeof window.switchHomeView === 'function') {
      window.switchHomeView('chat');
    } else {
      window.switchTab('match');
    }
    window.renderQuestionnaireCards();
  } catch (e) {
    window.toast('Save failed: ' + e.message);
  }
}
window.saveProfile = saveProfile;

async function handleAvatarFile(event, target = 'setup') {
  const file = event.target.files?.[0];
  if (!file) return;
  const el = document.getElementById(target === 'setup' ? 'setup-avatar' : 'edit-avatar');
  try {
    const url = await window.uploadImageFile(file);
    await window.api('/uploads/avatar', 'POST', { url });
    if (S.currentUser) S.currentUser.profile = { ...(S.currentUser.profile || {}), avatarUrl: url };
    if (el) el.innerHTML = `<img src="${window.safeUrl(url)}" class="w-full h-full object-cover rounded-full">`;
    window.toast('Avatar updated');
  } catch (e) {
    window.toast('Avatar upload failed: ' + e.message);
  }
}

// ========================================
// QUESTIONNAIRE
// ========================================
window.handleAvatarFile = handleAvatarFile;

// ========================================
// PROFILE TAB
// ========================================
async function loadProfileTab() {
  // §6.10 / §10.5(1): refresh the top energy bar every time Profile opens.
  // Fire-and-forget — a balance fetch failure must not block the rest of the
  // profile render (loadEnergyBar swallows its own errors).
  window.loadEnergyBar();
  const profile = S.currentUser?.profile || {};
  const avatar = profile.avatarUrl || '';
  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl) avatarEl.innerHTML = avatar
    ? `<img src="${window.safeUrl(avatar)}" alt="User Avatar" class="w-full h-full object-cover">`
    : '<div class="w-full h-full flex items-center justify-center"><span class="material-symbols-outlined text-5xl text-outline-variant">person</span></div>';
  const nameEl = document.getElementById('profile-name');
  if (nameEl) nameEl.textContent = (profile.nickname || 'Your Name');
  const metaEl = document.getElementById('profile-meta');
  if (metaEl) metaEl.innerHTML = `<span class="px-3 py-1 rounded-[10px] bg-neon text-black text-[9px] font-bold tracking-widest" data-no-i18n>${window.escapeHtml(window.metaLabel(profile.school || 'University'))}</span>`;
  // 学生认证按钮（右上角）状态
  window.renderVerifyButton();
  // （匹配状态条已按用户要求从 profile 移除，随之取消两路 /matching/status 查询）
  // Dynamic profile background: driven by the cover set in Edit Profile.
  // Targets #profile-bg if present, else the cover image inside #tab-profile.
  // Always set a visible source: cover when available, else a neutral gray
  // placeholder so the background area is never blank (index.html mask is now
  // semi-transparent and would otherwise reveal an empty/broken image).
  const PROFILE_BG_PLACEHOLDER = 'data:image/svg+xml;charset=utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#d4d4d4"/></svg>');
  const coverUrl = S.currentUser?.profile?.coverUrl;
  const bgSrc = coverUrl || PROFILE_BG_PLACEHOLDER;
  // Unified lookup: the background element always carries id="profile-bg".
  // Fallback to the explicit alt-attr selector only (never a generic
  // ".relative img", which could mis-match the avatar img inside a relative div).
  const bgEl = document.getElementById('profile-bg')
    || document.querySelector('#tab-profile main img[alt="Campus Background"]');
  if (bgEl) {
    if (bgEl.tagName === 'IMG') {
      bgEl.src = bgSrc;
    } else {
      bgEl.style.backgroundImage = `url(${window.safeCssUrl(bgSrc)})`;
      bgEl.style.backgroundSize = 'cover';
      bgEl.style.backgroundPosition = 'center';
    }
  }
  // Own profile (tab-profile) does not show the Photo Portfolio strip.
  // Partner profile "TA'S Moments" and the edit-page album are unaffected.
  const photosStrip = document.getElementById('profile-photos-strip');
  if (photosStrip) {
    photosStrip.style.display = 'none';
    photosStrip.innerHTML = '';
  }
  window.setupBgPullReveal && window.setupBgPullReveal();
}

// ========================================
// EDIT PROFILE
// ========================================
window.loadProfileTab = loadProfileTab;

// ─── 学生认证（profile 右上角按钮）──────────────────────────────
// 状态机：unverified/rejected → 「Verify」(可点) → pending 「Pending」(灰禁) →
// 管理员审核通过 → verified 显示荧光绿圆形对号。状态取自 S.currentUser.verificationStatus。
function renderVerifyButton() {
  const btn = document.getElementById('verify-btn');
  if (!btn) return;
  const status = S.currentUser?.verificationStatus || 'unverified';
  if (status === 'verified') {
    btn.className = 'absolute top-6 right-6 z-30 w-9 h-9 rounded-full bg-neon text-black flex items-center justify-center shadow-lg';
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px;font-variation-settings:'FILL' 1">check</span>`;
    btn.disabled = true;
    btn.onclick = null;
    btn.title = 'Verified';
  } else if (status === 'pending') {
    btn.className = 'absolute top-6 right-6 z-30 inline-flex items-center gap-1.5 bg-black/35 backdrop-blur-md text-white rounded-full px-3 py-1.5 shadow';
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">hourglass_top</span><span class="text-[10px] font-bold tracking-widest">Pending</span>`;
    btn.disabled = true;
    btn.onclick = null;
    btn.title = 'Verification under review';
  } else {
    btn.className = 'absolute top-6 right-6 z-30 inline-flex items-center gap-1.5 bg-black/35 backdrop-blur-md text-white rounded-full px-3 py-1.5 shadow active:scale-95 transition-transform';
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">verified_user</span><span class="text-[10px] font-bold tracking-widest">Verify</span>`;
    btn.disabled = false;
    btn.onclick = window.openVerify;
    btn.title = 'Get student verified';
  }
}
window.renderVerifyButton = renderVerifyButton;

// 打开学生认证弹窗（上传学生卡 + 学校邮箱验证码 → pending → 管理员审核）
function openVerify() {
  const st = S.currentUser?.verificationStatus;
  if (st === 'pending' || st === 'verified') return;
  S.verifyCardUrl = null;
  const prev = document.getElementById('verify-card-preview');
  if (prev) prev.innerHTML = '<span class="material-symbols-outlined text-3xl">add_a_photo</span><span class="text-[10px] font-bold tracking-widest mt-1">Tap to upload</span>';
  ['verify-email', 'verify-code'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  const hint = document.getElementById('verify-code-hint');
  if (hint) { hint.classList.add('hidden'); hint.textContent = ''; }
  window.openOverlay('verify-overlay');
}
window.openVerify = openVerify;

function closeVerify() { window.closeOverlay('verify-overlay'); }
window.closeVerify = closeVerify;

async function handleStudentCardFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const prev = document.getElementById('verify-card-preview');
  if (prev) prev.innerHTML = '<span class="material-symbols-outlined text-2xl cl-pulse">hourglass_top</span>';
  try {
    const url = await window.uploadImageFile(file);
    S.verifyCardUrl = url;
    if (prev) prev.innerHTML = `<img src="${window.safeUrl(url)}" class="w-full h-full object-cover" alt="Student card">`;
  } catch (e) {
    S.verifyCardUrl = null;
    if (prev) prev.innerHTML = '<span class="material-symbols-outlined text-3xl">add_a_photo</span><span class="text-[10px] font-bold tracking-widest mt-1">Tap to upload</span>';
    window.toast('Upload failed: ' + (e?.message || 'try again'));
  } finally {
    event.target.value = '';
  }
}
window.handleStudentCardFile = handleStudentCardFile;

async function sendVerifyCode() {
  const email = document.getElementById('verify-email')?.value?.trim();
  if (!email) { window.toast('Enter your school email'); return; }
  const btn = document.getElementById('verify-sendcode-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const res = await window.api('/users/me/verification/send-code', 'POST', { schoolEmail: email });
    const env = res?.data || res || {};
    const hint = document.getElementById('verify-code-hint');
    if (hint) {
      // 无邮件服务 → 开发模式直接展示验证码，方便测试（接 SMTP 后后端不再返回 devCode）。
      hint.textContent = env.devCode
        ? `Dev mode (no email service yet): your code is ${env.devCode}`
        : (env.message || 'Code sent');
      hint.classList.remove('hidden');
    }
    window.toast(env.message || 'Code sent');
  } catch (e) {
    window.toast('Failed: ' + (e?.message || 'try again'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send code'; }
  }
}
window.sendVerifyCode = sendVerifyCode;

async function submitVerification() {
  if (!S.verifyCardUrl) { window.toast('Upload your student ID card first'); return; }
  const schoolEmail = document.getElementById('verify-email')?.value?.trim();
  const code = document.getElementById('verify-code')?.value?.trim();
  if (!schoolEmail) { window.toast('Enter your school email'); return; }
  if (!code) { window.toast('Enter the verification code'); return; }
  try {
    const res = await window.api('/users/me/verification/submit', 'POST', { studentCardUrl: S.verifyCardUrl, schoolEmail, code });
    const env = res?.data || res || {};
    if (S.currentUser) S.currentUser.verificationStatus = env.verificationStatus || 'pending';
    window.toast(env.message || 'Submitted — pending review');
    closeVerify();
    renderVerifyButton();
  } catch (e) {
    window.toast('Failed: ' + (e?.message || 'try again'));
  }
}
window.submitVerification = submitVerification;

// profile 下拉刷新：与 match/square 完全同一组件同一手感（用户要求一致、不做自定义幅度控制）。
// 内容（头像+功能区）整体跟手，背景 hero 层固定；松手过阈值刷新资料。
// 背景模糊随下拉消散（用户反馈）：拉距 0→140px 内 blur-mask 透明度 1→0，
// 跟手期间关掉过渡逐帧写值，松手/复位还原空值走 CSS 0.45s 弹回。
const BLUR_REVEAL_DIST = 140;
const BG_ZOOM_DIST = 160; // 拉到此距离时背景图放大到上限 1.3×
function setupBgPullReveal() {
  const scroller = document.getElementById('profile-scroll');
  if (!scroller || scroller.dataset.pullBound) return;
  window.attachPullToRefresh(scroller, () => window.loadProfileTab(), '#profile-menu-inner', {
    onPull: (dist) => {
      const m = document.querySelector('#tab-profile .profile-blur-mask');
      const bg = document.getElementById('profile-bg');
      if (dist > 0) {
        // 模糊随拉距消散
        if (m) {
          m.style.transition = 'none';
          m.style.opacity = String(Math.max(0, 1 - dist / BLUR_REVEAL_DIST));
        }
        // 背景图跟手放大（拉满 BG_ZOOM_DIST 时到 1.3 倍，再拉不继续涨）
        if (bg) {
          bg.style.transition = 'none';
          const k = Math.min(dist, BG_ZOOM_DIST) / BG_ZOOM_DIST;
          bg.style.transform = `scale(${(1 + k * 0.3).toFixed(4)})`;
        }
      } else {
        // 清空 inline 值 → 恢复 CSS 过渡，平滑弹回
        if (m) { m.style.transition = ''; m.style.opacity = ''; }
        if (bg) { bg.style.transition = ''; bg.style.transform = ''; }
      }
    }
  });
}
window.setupBgPullReveal = setupBgPullReveal;

// ========================================
// EDIT PROFILE
// ========================================
async function openEditProfile() {
  const p = S.currentUser?.profile || {};
  const nicknameEl = document.getElementById('edit-nickname');
  if (nicknameEl) nicknameEl.value = p.nickname || '';
  const givenNameEl = document.getElementById('edit-givenname');
  if (givenNameEl) givenNameEl.value = p.givenName || '';
  const familyNameEl = document.getElementById('edit-familyname');
  if (familyNameEl) familyNameEl.value = p.familyName || '';
  const wishGifts = p.wishGifts || [];
  for (let i = 0; i < 5; i++) {
    const gEl = document.getElementById('edit-gift-' + i);
    if (gEl) gEl.value = wishGifts[i] || '';
  }
  const bioEl = document.getElementById('edit-bio');
  if (bioEl) bioEl.value = p.bio || '';
  const bioCountEl = document.getElementById('edit-bio-count');
  if (bioCountEl) bioCountEl.textContent = (p.bio || '').length;
  // Live bio counter（index.html 未绑定 oninput，这里补上，只绑一次）。
  if (bioEl && bioCountEl && !bioEl.dataset.countBound) {
    bioEl.dataset.countBound = '1';
    bioEl.addEventListener('input', () => { bioCountEl.textContent = bioEl.value.length; });
  }
  // Description（映射到 profile.signature，≤100 字）
  const sigEl = document.getElementById('edit-signature');
  if (sigEl) sigEl.value = p.signature || '';
  const sigCountEl = document.getElementById('edit-signature-count');
  if (sigCountEl) sigCountEl.textContent = (p.signature || '').length;
  if (sigEl && sigCountEl && !sigEl.dataset.countBound) {
    sigEl.dataset.countBound = '1';
    sigEl.addEventListener('input', () => { sigCountEl.textContent = sigEl.value.length; });
  }
  // 性别 + 生日（此前编辑页缺失，只有注册能填）：生日限 16–40 岁，改动时联动年龄提示
  const genderEl = document.getElementById('edit-gender');
  if (genderEl) genderEl.value = p.gender || '';
  const bdayEl = document.getElementById('edit-birthday');
  const ageHintEl = document.getElementById('edit-age-hint');
  const syncAgeHint = () => {
    if (!ageHintEl) return;
    const a = ageFromBirthday(bdayEl?.value);
    const zh = (window.getLang?.() || 'en') === 'zh';
    ageHintEl.textContent = a != null ? (zh ? `${a} 岁` : `Age ${a}`) : '';
  };
  if (bdayEl) {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    bdayEl.min = iso(new Date(now.getFullYear() - 40, now.getMonth(), now.getDate()));
    bdayEl.max = iso(new Date(now.getFullYear() - 16, now.getMonth(), now.getDate()));
    bdayEl.value = p.birthday ? String(p.birthday).slice(0, 10) : '';
    if (!bdayEl.dataset.hintBound) {
      bdayEl.dataset.hintBound = '1';
      bdayEl.addEventListener('change', syncAgeHint);
      bdayEl.addEventListener('input', syncAgeHint);
    }
  }
  syncAgeHint();
  S.editTags = [...(p.interests || [])];
  window.renderEditTags();
  const avatarEl = document.getElementById('edit-avatar');
  if (avatarEl) avatarEl.innerHTML = p.avatarUrl
    ? `<img alt="Profile photo" src="${window.safeUrl(p.avatarUrl)}" class="w-full h-full object-cover">`
    : '<div class="w-full h-full flex flex-col items-center justify-center text-outline"><span class="material-symbols-outlined text-3xl">add_a_photo</span><span class="text-[9px] font-bold tracking-widest mt-1">Add Photo</span></div>';
  const cover = S.currentUser?.profile?.coverUrl;
  const coverImg = document.querySelector('#edit-cover-preview img');
  if (coverImg) coverImg.src = cover ? cover : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%278%27 height=%278%27%3E%3Crect width=%278%27 height=%278%27 fill=%27%23e5e5e5%27/%3E%3C/svg%3E';
  window.renderPhotoSlots();
  window.openOverlay('edit-profile-overlay');
  // Populate dropdowns (cached after first load) and select current values
  fillMetaSelect('edit-grade', GRADE_OPTIONS, normalizeGrade(p.grade), 'Select Grade');
  try {
    const [unis, cities, majors, mbtiTypes, nationalities] = await Promise.all([
      fetchMetadata('uk/universities'),
      fetchMetadata('uk/cities'),
      fetchMetadata('uk/majors'),
      fetchMetadata('mbti-types'),
      fetchMetadata('nationalities')
    ]);
    fillMetaSelect('edit-school', unis, p.school || '', 'Select School');
    fillMetaSelect('edit-city', cities, p.city || '', 'Select City');
    fillMetaSelect('edit-major', majors, p.major || '', 'Select Major');
    fillMetaSelect('edit-mbti', mbtiTypes, p.mbti || '', 'Select MBTI');
    fillMetaSelect('edit-nationality', nationalities, p.nationality || '', 'Select Nationality');
  } catch (e) {
    // A17: surface load failure rather than leaving silently-empty dropdowns.
    window.toast('Failed to load options. Please try again.');
  }
}
window.openEditProfile = openEditProfile;

function closeEditProfile() {
  window.closeOverlay('edit-profile-overlay');
}
window.closeEditProfile = closeEditProfile;

async function saveEditProfile() {
  const nickname = document.getElementById('edit-nickname')?.value?.trim();
  const bio = document.getElementById('edit-bio')?.value?.trim();
  // 校验先行（此前 btnBusy(true) 在早退前执行，昵称为空时保存键会永久卡在禁用态）
  if (!nickname) {
    window.toast('Nickname required');
    return;
  }
  const birthday = document.getElementById('edit-birthday')?.value || '';
  const age = birthday ? ageFromBirthday(birthday) : null;
  if (birthday && (age == null || age < 16 || age > 40)) {
    window.toast('Unimatcha is for students aged 16–40');
    return;
  }
  window.btnBusy('edit-save-btn', true);
  try {
    const payload = {
      nickname,
      bio,
      signature: document.getElementById('edit-signature')?.value?.trim() || '',
      interests: S.editTags
    };
    // A18: include a field only when its control is actually present in the
    // overlay, but include it even when empty so the user can CLEAR a value
    // (empty string clears it server-side). Fields whose control isn't rendered
    // are left out of the payload, so they keep their stored value instead of
    // being wiped. realPhotos / coverUrl have their own dedicated save paths
    // and are intentionally not part of this payload.
    [
      ['school', 'edit-school'],
      ['grade', 'edit-grade'],
      ['city', 'edit-city'],
      ['major', 'edit-major'],
      ['mbti', 'edit-mbti'],
      ['nationality', 'edit-nationality']
    ].forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) payload[key] = el.value || '';
    });
    // 真实姓名拆成 名/姓 两个输入（本轮反馈）；合成 realName 给已有展示路径用（名在前，英文习惯）
    const givenName = document.getElementById('edit-givenname')?.value?.trim() || '';
    const familyName = document.getElementById('edit-familyname')?.value?.trim() || '';
    // A18: 只在至少有一个姓名输入非空时才下发，避免编辑页两个框都留空时
    // 把已存储的真实姓名清掉（注册要求填写、编辑不要求）。
    if (givenName || familyName) {
      payload.givenName = givenName;
      payload.familyName = familyName;
      payload.realName = [givenName, familyName].filter(Boolean).join(' ');
    }
    // 性别/生日：留空则不下发（gender 是后端枚举，空串会被拒；生日留空不清除已存值）
    const gender = document.getElementById('edit-gender')?.value || '';
    if (gender) payload.gender = gender;
    if (birthday && age != null) {
      payload.birthday = birthday;
      payload.age = age;
    }
    // 礼物罐子（本轮反馈2-5）：收集 5 个输入，非空入数组
    const wishGifts = [];
    for (let i = 0; i < 5; i++) {
      const gv = document.getElementById('edit-gift-' + i)?.value?.trim();
      if (gv) wishGifts.push(gv);
    }
    payload.wishGifts = wishGifts;
    await window.api('/profiles/me', 'PUT', payload);
    if (S.currentUser) S.currentUser.profile = { ...(S.currentUser.profile || {}), ...payload };
    window.toast('Profile saved!');
    window.closeEditProfile();
    window.loadProfileTab();
  } catch (e) {
    window.toast('Failed: ' + e.message);
  } finally {
    window.btnBusy('edit-save-btn', false);
  }
}

// ========================================
// EDIT HOMEPAGE
// ========================================
window.saveEditProfile = saveEditProfile;

// ========================================
// EDIT HOMEPAGE
// ========================================
function openEditHomepage() {
  window.openEditProfile();
}
window.openEditHomepage = openEditHomepage;

function closeEditHomepage() {
  window.closeOverlay('edit-profile-overlay');
}
window.closeEditHomepage = closeEditHomepage;

async function saveEditHomepage() {
  window.saveEditProfile();
}

// ========================================
// TAG MANAGEMENT
// ========================================
window.saveEditHomepage = saveEditHomepage;

// ========================================
// TAG MANAGEMENT
// ========================================
function renderEditTags() {
  const c = document.getElementById('edit-tags-list');
  if (!c) return;
  c.innerHTML = S.editTags.map((t, i) => {
    return `<span class="tag-chip" style="background-color: ${NEON}; color: #000000; border-color: ${NEON};">${window.escapeHtml(t)} <span class="tag-remove" onclick="removeEditTag(${i})">×</span></span>`;
  }).join('') + '<span class="tag-chip add-tag" onclick="openAddInterest()">+ Add</span>';
}
window.renderEditTags = renderEditTags;

// 添加兴趣：唯一入口 = 点「+ Add」弹出卡片（add-interest-overlay）。
function openAddInterest() {
  if (S.editTags.length >= 8) { window.toast('Up to 8 interests'); return; }
  const input = document.getElementById('add-interest-input');
  if (input) input.value = '';
  window.openOverlay('add-interest-overlay');
  setTimeout(() => input?.focus(), 60);
}
window.openAddInterest = openAddInterest;

function closeAddInterest() {
  window.closeOverlay('add-interest-overlay');
}
window.closeAddInterest = closeAddInterest;

function addInterestValue(tag) {
  const t = (tag || '').trim();
  if (!t) return;
  if (S.editTags.length >= 8) { window.toast('Up to 8 interests'); return; }
  if (!S.editTags.includes(t)) S.editTags.push(t);
  window.renderEditTags();
  window.closeAddInterest();
}
window.addInterestValue = addInterestValue;

function confirmAddInterest() {
  addInterestValue(document.getElementById('add-interest-input')?.value);
}
window.confirmAddInterest = confirmAddInterest;

function removeEditTag(i) {
  S.editTags.splice(i, 1);
  window.renderEditTags();
}

// ========================================
// SETTINGS
// ========================================
window.removeEditTag = removeEditTag;

// ========================================
// COVER & PHOTO MANAGEMENT
// ========================================
function triggerCoverUpload() {
  document.getElementById('edit-cover-file')?.click();
}
window.triggerCoverUpload = triggerCoverUpload;

async function handleCoverFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const url = await window.uploadImageFile(file);
    await window.api('/profiles/me', 'PUT', { coverUrl: url });
    if (S.currentUser) S.currentUser.profile = { ...(S.currentUser.profile || {}), coverUrl: url };
    const img = document.querySelector('#edit-cover-preview img');
    if (img) img.src = window.safeUrl ? url : url;
    window.toast('Cover updated');
  } catch (e) {
    window.toast('Cover upload failed: ' + e.message);
  }
}
window.handleCoverFile = handleCoverFile;

function getStoredPhotos() {
  return S.currentUser?.profile?.realPhotos || [];
}
window.getStoredPhotos = getStoredPhotos;

async function saveStoredPhotos(p) {
  if (S.currentUser) S.currentUser.profile = { ...(S.currentUser.profile || {}), realPhotos: p };
  await window.api('/profiles/me', 'PUT', { realPhotos: p });
}
window.saveStoredPhotos = saveStoredPhotos;

function renderProfilePhotosStrip() {
  // Own profile (tab-profile) intentionally hides the Photo Portfolio strip.
  // Kept hidden even when re-invoked after a photo upload/remove in Edit Profile.
  const c = document.getElementById('profile-photos-strip');
  if (!c) return;
  c.style.display = 'none';
  c.innerHTML = '';
}
window.renderProfilePhotosStrip = renderProfilePhotosStrip;

function renderPhotoSlots() {
  const photos = window.getStoredPhotos();
  const c = document.getElementById('edit-photo-grid');
  if (!c) return;
  let html = '';
  for (let i = 0; i < 6; i++) {
    if (photos[i]) {
      html += `<div class="relative aspect-square overflow-hidden border border-outline-variant/40 bg-surface-container rounded-[10px]"><img src="${window.safeUrl(photos[i])}" alt="Photo" class="w-full h-full object-cover"><span onclick="removeProfilePhoto(${i})" class="absolute top-1 right-1 w-5 h-5 bg-primary/70 text-white flex items-center justify-center text-xs cursor-pointer">×</span></div>`;
    } else {
      html += `<div onclick="triggerProfilePhotoUpload()" class="aspect-square border border-dashed border-outline-variant rounded-[10px] flex items-center justify-center cursor-pointer text-outline hover:border-primary hover:text-primary transition-colors active:scale-[0.98]"><span class="material-symbols-outlined">add</span></div>`;
    }
  }
  c.innerHTML = html;
}
window.renderPhotoSlots = renderPhotoSlots;

let photoUploadBusy = false;
function triggerProfilePhotoUpload() {
  // B32: serialize uploads — a second click before the first finishes would
  // run a parallel chain whose API response could land out of order and
  // overwrite realPhotos with a stale/duplicated list.
  if (photoUploadBusy) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (window.getStoredPhotos().length >= 6) {
      window.toast('Maximum 6 photos');
      return;
    }
    photoUploadBusy = true;
    try {
      const url = await window.uploadImageFile(f);
      const res = await window.api('/uploads/real-photo', 'POST', { url });
      const photos = (res.data && res.data.realPhotos) || res.realPhotos || [...window.getStoredPhotos(), url];
      if (S.currentUser) S.currentUser.profile = { ...(S.currentUser.profile || {}), realPhotos: photos };
      window.renderPhotoSlots();
      window.renderProfilePhotosStrip();
    } catch (err) {
      window.toast('Photo upload failed: ' + err.message);
    } finally {
      photoUploadBusy = false;
    }
  };
  inp.click();
}
window.triggerProfilePhotoUpload = triggerProfilePhotoUpload;

async function removeProfilePhoto(i) {
  const p = [...window.getStoredPhotos()];
  p.splice(i, 1);
  try {
    await window.saveStoredPhotos(p);
    window.renderPhotoSlots();
    window.renderProfilePhotosStrip();
  } catch (err) {
    window.toast('Delete failed: ' + err.message);
  }
}

// ========================================
// PREVIEW
// ========================================
window.removeProfilePhoto = removeProfilePhoto;

// ========================================
// PREVIEW
// ========================================
function openPreview() {
  window.renderPreviewPage();
  window.openOverlay('milestone-overlay');
}
window.openPreview = openPreview;

function closePreview() {
  window.closeOverlay('milestone-overlay');
}
window.closePreview = closePreview;

function renderPreviewPage() {
  const p = S.currentUser?.profile || {};
  const avatar = S.currentUser?.profile?.avatarUrl;
  const c = document.getElementById('preview-content');
  if (!c) return;
  c.innerHTML = window.renderPublicProfileCard(p, {
    avatar
  });
}
window.renderPreviewPage = renderPreviewPage;

function renderPublicProfileCard(p, opts = {}) {
  const esc = window.escapeHtml;
  const avatar = opts.avatar || p.avatar;
  const meta = [p.school, p.grade].filter(Boolean).map(v => esc(window.metaLabel(v))).join(' · ');
  return `<div class="flex flex-col items-center text-center px-6 py-10">
    <div class="w-24 h-24 rounded-full p-[3px] bg-primary mb-4">
      <div class="w-full h-full rounded-full overflow-hidden bg-surface-container-high ring-2 ring-white flex items-center justify-center">
        ${avatar ? `<img src="${window.safeUrl(avatar)}" alt="Avatar" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-4xl text-outline">person</span>'}
      </div>
    </div>
    <h2 class="font-headline text-3xl font-extrabold tracking-tight">${esc(p.nickname || '')}</h2>
    ${meta ? `<p class="font-label text-xs font-medium tracking-widest text-on-surface-variant mt-2">${meta}</p>` : ''}
    ${p.interests?.length ? `<div class="flex flex-wrap gap-2 justify-center mt-6">${p.interests.map(t => `<span class="px-4 py-2 rounded-[10px] bg-neon text-black text-[10px] font-bold tracking-widest">${esc(t)}</span>`).join('')}</div>` : ''}
    ${p.bio ? `<p class="mt-6 text-sm italic leading-relaxed text-on-surface-variant max-w-xs">"${esc(p.bio)}"</p>` : ''}
  </div>`;
}

// ========================================
// FILTER / PREFERENCES
// ========================================
window.renderPublicProfileCard = renderPublicProfileCard;

function selectGenderSegment(val) {
  S.filterGender = val;
  window.updateGenderUI();
}
window.selectGenderSegment = selectGenderSegment;

function updateGenderUI() {
  document.querySelectorAll('.gender-seg').forEach(el => {
    if (el.dataset.value === S.filterGender) {
      el.style.background = '#CCFF00';
      el.style.color = '#000';
    } else {
      el.style.background = 'transparent';
      el.style.color = '#1b1b1b';
    }
  });
}
window.updateGenderUI = updateGenderUI;

// University-stage selection is a MULTI-select owned solely by match.js
// (window.selectStage / window.toggleStage / window.updateStageUI over the
// S.filterStages array). The old single-select implementation that lived here
// (S.filterStage) was dead — match.js loads after this module and overwrote the
// window.* bindings — so it was removed to keep one source of truth and avoid
// the singular/plural-state conflict.

function updateAgeDisplay() {
  const min = document.getElementById('filter-age-min')?.value || 18,
    max = document.getElementById('filter-age-max')?.value || 24;
  const el = document.getElementById('age-range-display');
  if (el) el.textContent = `${min} — ${max}`;
}
window.updateAgeDisplay = updateAgeDisplay;

// Age slider linkage: keep min <= max at all times.
// Dragging Min above Max pushes Max up to equal Min; dragging Max below Min pulls Min down to equal Max.
function onAgeMinInput() {
  const minEl = document.getElementById('filter-age-min');
  const maxEl = document.getElementById('filter-age-max');
  if (minEl && maxEl) {
    const min = parseInt(minEl.value, 10);
    const max = parseInt(maxEl.value, 10);
    if (min > max) maxEl.value = String(min);
  }
  window.updateAgeDisplay();
}
window.onAgeMinInput = onAgeMinInput;

function onAgeMaxInput() {
  const minEl = document.getElementById('filter-age-min');
  const maxEl = document.getElementById('filter-age-max');
  if (minEl && maxEl) {
    const min = parseInt(minEl.value, 10);
    const max = parseInt(maxEl.value, 10);
    if (max < min) minEl.value = String(max);
  }
  window.updateAgeDisplay();
}
window.onAgeMaxInput = onAgeMaxInput;

function savePreferences() {
  window.saveFilterPrefs();
}

// ========================================
// OVERLAY HELPERS
// ========================================
window.savePreferences = savePreferences;

// ========================================
// PARTNER PROFILE (enhanced renderer)
// ========================================
// ========================================
// ENERGY (§6.10 行2111-2123 + §10.5 行2882-3000)
// Balance bar, purchase overlay, claim. All responses pass through the
// TransformInterceptor → window.api() returns the raw {success,data,...}
// envelope, so we read `res.data` (with a `|| res` fallback for safety).
// window.api(path, method, body) is POSITIONAL in this codebase — NOT
// the {method,body} object form shown in the design snippet.
// ========================================

// Render the Profile-top ENERGY bar from S.energy. 方形带圆角小方块（.energy-cell）：
// 可用能量=荧光绿实心格，已用能量=灰描边空心格，最多渲染 5 格，超出用 +N。
const ENERGY_MAX_CELLS = 5;
function renderEnergyDisplay() {
  const box = document.getElementById('energy-display');
  if (!box) return;
  const avail = Math.max(0, S.energy?.availableEnergy || 0);
  const total = Math.max(avail, S.energy?.totalEnergy || 0);
  box.innerHTML = '';
  // 先渲染实心（可用）格，再补已用的空心格，总数封顶 5（用户反馈）。
  const filled = Math.min(avail, ENERGY_MAX_CELLS);
  const empty = Math.min(Math.max(total - avail, 0), ENERGY_MAX_CELLS - filled);
  for (let i = 0; i < filled; i++) {
    const cell = document.createElement('div');
    cell.className = 'energy-cell shrink-0';
    box.appendChild(cell);
  }
  for (let i = 0; i < empty; i++) {
    const cell = document.createElement('div');
    cell.className = 'energy-cell energy-cell--empty shrink-0';
    box.appendChild(cell);
  }
  if (total > ENERGY_MAX_CELLS) { // 超出显示 +N（按总量计）
    const more = document.createElement('span');
    more.className = 'text-[10px] text-outline ml-1 shrink-0';
    more.textContent = `+${total - ENERGY_MAX_CELLS}`;
    box.appendChild(more);
  }
  if (filled === 0 && empty === 0) {
    // Empty state: a muted "0" so the bar never reads as broken/blank.
    const zero = document.createElement('span');
    zero.className = 'text-[10px] text-outline shrink-0';
    zero.textContent = '0';
    box.appendChild(zero);
  }
}
window.renderEnergyDisplay = renderEnergyDisplay;

// GET /energy/balance → data{totalEnergy,usedEnergy,availableEnergy}. Caches into
// S.energy and re-renders the bar. Call on: entering Profile, after a successful
// recharge confirm, after a claim, and after an energy_refunded notification.
async function loadEnergyBar() {
  try {
    const res = await window.api('/energy/balance');
    const d = res?.data || res;
    // 后端通常直接返回 availableEnergy；若缺失则客户端按 total-used 兜底计算，
    // 避免能量条因字段缺失而读到旧值（§6.10）。
    if (d && typeof d.availableEnergy === 'number') {
      S.energy = d;
    } else if (d) {
      S.energy = { ...d, availableEnergy: (d.totalEnergy || 0) - (d.usedEnergy || 0) };
    }
  } catch (e) {
    // Non-fatal: keep whatever balance we already had cached. Don't toast on the
    // passive Profile-open path; the bar simply shows the last known value.
    console.error('Energy balance load failed:', e.message);
  }
  renderEnergyDisplay();
}
window.loadEnergyBar = loadEnergyBar;

// Currently selected package id within the open purchase overlay. Cleared on
// open/close so a stale selection from a previous session can't be paid for.
let selectedEnergyPkg = null;
let energyPurchaseBusy = false;

// Refresh the three package cards from GET /energy/packages → data[{packageId,cells,priceCny}].
// Falls back silently to the hard-coded markup if the fetch fails.
async function loadEnergyPackages() {
  let pkgs;
  try {
    const res = await window.api('/energy/packages');
    pkgs = res?.data || res;
  } catch (e) {
    console.error('Energy packages load failed:', e.message);
    return; // keep the static fallback cards from index.html
  }
  if (!Array.isArray(pkgs) || !pkgs.length) return;
  S.energyPackages = pkgs.map(p => ({ id: p.packageId, cells: p.cells, price: `¥${p.priceCny}` }));
  const grid = document.getElementById('energy-packages');
  if (!grid) return;
  grid.innerHTML = pkgs.map(p => `
    <button class="energy-package flex flex-col items-center justify-center gap-1 py-5 border border-outline-variant rounded-[10px] transition-all active:scale-[0.98] hover:border-black"
            data-pkg="${window.escapeHtml(p.packageId)}" data-cells="${p.cells}" data-price="${p.priceCny}" onclick="selectEnergyPackage('${window.escapeHtml(p.packageId)}', this)">
      <span class="text-2xl font-headline font-extrabold text-black">${p.cells}</span>
      <span class="text-[10px] tracking-widest text-outline">cells</span>
      <span class="text-xs font-bold text-black mt-1">¥${p.priceCny}</span>
    </button>`).join('');
}
window.loadEnergyPackages = loadEnergyPackages;

function openEnergyModal() {
  selectedEnergyPkg = null;
  selectedPayMethod = null;
  highlightEnergyPackage(null);
  highlightPayMethod(null);
  updateEnergyPayButton();
  window.openOverlay('modal-energy-purchase');
  // Refresh package cards (cells/price) from the API every open.
  window.loadEnergyPackages();
}
window.openEnergyModal = openEnergyModal;

function closeEnergyModal() {
  selectedEnergyPkg = null;
  selectedPayMethod = null;
  window.closeOverlay('modal-energy-purchase');
}
window.closeEnergyModal = closeEnergyModal;

// Visually mark the chosen package card; pass null to clear all highlights.
function highlightEnergyPackage(el) {
  document.querySelectorAll('#energy-packages .energy-package').forEach(b => {
    b.classList.remove('border-black', 'border-2', 'bg-neon/10');
    b.classList.add('border-outline-variant');
  });
  if (el) {
    el.classList.remove('border-outline-variant');
    el.classList.add('border-black', 'border-2', 'bg-neon/10');
  }
}

// ── 购买流程重做（本轮反馈8）：选套餐 → 选支付方式 → 「去支付」统一确认。
// 下单（POST /energy/purchase）推迟到点支付按钮时才发，选套餐不再产生半截订单。
let selectedPayMethod = null;

function updateEnergyPayButton() {
  const btn = document.getElementById('energy-pay-btn');
  if (!btn) return;
  if (!selectedEnergyPkg) {
    btn.disabled = true;
    btn.textContent = 'Select a package';
  } else if (!selectedPayMethod) {
    btn.disabled = true;
    btn.textContent = 'Select a payment method';
  } else {
    btn.disabled = false;
    btn.textContent = `Pay ¥${selectedEnergyPkg.price} · ${selectedEnergyPkg.cells} cells`;
  }
}

// Step 1: pick a package (selection only — no order created yet).
function selectEnergyPackage(pkgId, el) {
  if (energyPurchaseBusy) return;
  highlightEnergyPackage(el || null);
  selectedEnergyPkg = {
    packageId: pkgId,
    cells: el?.dataset?.cells || '',
    price: el?.dataset?.price || '',
  };
  updateEnergyPayButton();
}
window.selectEnergyPackage = selectEnergyPackage;

function highlightPayMethod(el) {
  document.querySelectorAll('#payment-methods .pay-method').forEach(b => {
    const active = b === el;
    b.classList.toggle('border-black', active);
    b.classList.toggle('border-2', active);
    b.classList.toggle('border-outline-variant', !active);
    const check = b.querySelector('.pay-check');
    if (check) check.classList.toggle('opacity-0', !active);
  });
}

// Step 2: pick a payment channel (selection only).
function selectPaymentMethod(method, el) {
  if (energyPurchaseBusy) return;
  selectedPayMethod = method;
  highlightPayMethod(el || null);
  updateEnergyPayButton();
}
window.selectPaymentMethod = selectPaymentMethod;

// Step 3: confirm. Creates the order then confirms it. MOCK for this milestone —
// no real WeChat/Alipay/Stripe SDK; when real channels land, the SDK callback
// slots in between purchase and confirm.
async function confirmEnergyPurchase() {
  if (energyPurchaseBusy) return;
  if (!selectedEnergyPkg?.packageId) { window.toast('Please select a package first'); return; }
  if (!selectedPayMethod) { window.toast('Please select a payment method'); return; }
  energyPurchaseBusy = true;
  const btn = document.getElementById('energy-pay-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
  try {
    const orderRes = await window.api('/energy/purchase', 'POST', { packageId: selectedEnergyPkg.packageId });
    const order = orderRes?.data || orderRes;
    if (!order?.orderId) throw new Error('No order id returned');
    // POST /energy/purchase/confirm{orderId,packageId} → data{success,availableEnergy}
    const res = await window.api('/energy/purchase/confirm', 'POST', {
      orderId: order.orderId,
      packageId: selectedEnergyPkg.packageId
      // transactionId omitted in mock; real SDK supplies it on the confirm
    });
    const d = res?.data || res;
    if (d && typeof d.availableEnergy === 'number') {
      S.energy = { ...S.energy, availableEnergy: d.availableEnergy };
    }
    window.closeEnergyModal();
    await window.loadEnergyBar(); // re-sync from server (totalEnergy/usedEnergy too)
    window.toast('Recharge successful');
  } catch (e) {
    window.toast('Payment failed: ' + e.message);
    updateEnergyPayButton();
  } finally {
    energyPurchaseBusy = false;
  }
}
window.confirmEnergyPurchase = confirmEnergyPurchase;

// POST /energy/claim{claimType} — free-energy claims (e.g. daily/sign-up bonus).
// Refreshes the bar on success.
async function claimEnergy(claimType) {
  try {
    await window.api('/energy/claim', 'POST', { claimType });
    await window.loadEnergyBar();
    window.toast('Claimed successfully');
  } catch (e) {
    window.toast('Claim failed: ' + e.message);
  }
}
window.claimEnergy = claimEnergy;

// ========================================
// MY TICKETS（票夹：活动门票 + 二维码，本轮反馈2）
// ========================================
function openTickets() {
  window.openOverlay('tickets-overlay');
  loadMyTickets();
}
window.openTickets = openTickets;

async function loadMyTickets() {
  const c = document.getElementById('tickets-content');
  if (!c) return;
  c.innerHTML = '<p class="text-center text-sm text-on-surface-variant pt-16">Loading…</p>';
  let tickets = [];
  try {
    const res = await window.api('/events/tickets/mine');
    tickets = (res?.data || res)?.tickets || [];
  } catch (e) {
    c.innerHTML = `<div class="text-center pt-16">${window.flatEmptyIcon('cloud_off')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">Failed to load tickets</p>
      <button onclick="loadMyTickets()" class="mt-6 font-headline text-[10px] font-bold tracking-[0.2em] text-black border-b-2 border-black pb-1">Retry</button>
    </div>`;
    return;
  }
  if (!tickets.length) {
    c.innerHTML = `<div class="text-center pt-16">${window.flatEmptyIcon('confirmation_number')}
      <p class="font-headline text-base font-extrabold tracking-tight text-on-surface">No tickets yet</p>
      <p class="font-body text-sm text-on-surface-variant mt-2">Tickets you get for campus events appear here.</p>
    </div>`;
    return;
  }
  const fmtTime = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const statusBadge = (t) => {
    if (t.status === 'used') return '<span class="px-2 py-0.5 rounded-[8px] bg-surface-container-high text-on-surface-variant text-[9px] font-bold tracking-widest">USED</span>';
    if (t.status === 'cancelled') return '<span class="px-2 py-0.5 rounded-[8px] bg-surface-container-high text-on-surface-variant text-[9px] font-bold tracking-widest">CANCELLED</span>';
    return '<span class="px-2 py-0.5 rounded-[8px] bg-neon text-black text-[9px] font-bold tracking-widest">VALID</span>';
  };
  c.innerHTML = tickets.map((t, i) => `
    <article class="ticket-card mb-5 rounded-[14px] bg-surface-container-lowest border border-outline-variant/20 overflow-hidden ${t.status !== 'valid' ? 'opacity-60' : ''}">
      <div class="p-5 pb-4">
        <div class="flex items-start justify-between gap-3 mb-1.5">
          <h3 class="font-headline font-extrabold text-base tracking-tight" data-no-i18n>${window.escapeHtml(t.event?.title || 'Event')}</h3>
          ${statusBadge(t)}
        </div>
        <p class="text-xs text-on-surface-variant" data-no-i18n>${fmtTime(t.event?.startAt)}${t.event?.venue ? ' · ' + window.escapeHtml(t.event.venue) : ''}</p>
        ${t.event?.school ? `<p class="text-[10px] text-outline tracking-widest mt-1" data-no-i18n>${window.escapeHtml(t.event.school)}</p>` : ''}
      </div>
      <div class="ticket-divider"></div>
      <div class="p-5 pt-4 flex items-center gap-5">
        <div id="ticket-qr-${i}" class="w-[104px] h-[104px] bg-white p-1.5 rounded-[10px] border border-outline-variant/30 shrink-0"></div>
        <div class="min-w-0">
          <p class="text-[10px] tracking-[0.2em] text-outline mb-1">TICKET CODE</p>
          <p class="font-mono text-sm font-bold tracking-wider select-all" data-no-i18n>${window.escapeHtml(t.code)}</p>
          <p class="text-[10px] text-outline mt-2 leading-relaxed">Show this QR at the entrance</p>
        </div>
      </div>
    </article>`).join('');
  // 渲染二维码（qrcodejs 已全局加载；核销扫的就是票码）
  tickets.forEach((t, i) => {
    const box = document.getElementById(`ticket-qr-${i}`);
    if (box && window.QRCode) {
      new window.QRCode(box, { text: t.code, width: 92, height: 92, correctLevel: window.QRCode.CorrectLevel.M });
    }
  });
}
window.loadMyTickets = loadMyTickets;

// 对方资料渲染器由 match.js 统一负责（renderPartnerProfile 全屏版）；此处仅扩展 showPage。
setTimeout(() => {
  const baseShowPage = window.showPage;
  window.showPage = function (id) {
    baseShowPage(id);
    if (id === 'page-profile-setup') window.initProfileSetupPage();
  };
}, 0);
