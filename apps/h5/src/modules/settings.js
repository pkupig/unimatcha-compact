import { S } from '../state.js';

// ========================================
// SETTINGS
// ========================================
function openSettings() {
  const email = S.currentUser?.email || 'user@example.edu';
  const el = document.getElementById('settings-email');
  if (el) el.textContent = email;
  window.renderSettingsToggles();
  window.openOverlay('settings-overlay');
  loadUserSettings();
  const nudgeEl = document.getElementById('settings-nudge-suffix');
  if (nudgeEl) nudgeEl.value = (S.currentUser?.settings?.nudgeSuffix) || '';
}
window.openSettings = openSettings;

// 保存「别人拍我」时显示的后缀（本轮反馈3）
async function saveNudgeSuffix() {
  const v = document.getElementById('settings-nudge-suffix')?.value || '';
  try {
    await window.api('/chat/nudge-suffix', 'PUT', { suffix: v });
    if (S.currentUser) S.currentUser.settings = { ...(S.currentUser.settings || {}), nudgeSuffix: v };
    window.toast('Saved');
  } catch (e) {
    window.toast('Failed: ' + (e?.message || 'try again'));
  }
}
window.saveNudgeSuffix = saveNudgeSuffix;

function closeSettings() {
  window.closeOverlay('settings-overlay');
}
window.closeSettings = closeSettings;

// ========================================
// USER SETTINGS (push + privacy, server-backed)
// ========================================
const DEFAULT_SETTINGS = {
  pushEnabled: true,
  privacy: { showProfile: true, showOnline: true, showMoments: true },
};

function getSettingValue(key) {
  const s = S.userSettings || DEFAULT_SETTINGS;
  if (key.startsWith('privacy.')) {
    const v = s.privacy?.[key.split('.')[1]];
    return typeof v === 'boolean' ? v : true;
  }
  return typeof s[key] === 'boolean' ? s[key] : true;
}

async function loadUserSettings() {
  try {
    const data = await window.api('/users/me/settings');
    // B29: only adopt the server snapshot if the user hasn't started toggling
    // (a pending optimistic write would otherwise be clobbered by this fetch,
    // which was issued before that toggle). The toggle's own re-render covers
    // the live state; this fetch just refreshes the at-rest values.
    if (!Object.values(settingSaving).some(Boolean)) {
      S.userSettings = data.data || data;
    }
    window.renderSettingsToggles();
  } catch (e) {
    // keep defaults on failure
  }
}
window.loadUserSettings = loadUserSettings;

const settingSaving = {};
function applySettingValue(key, val) {
  if (key.startsWith('privacy.')) {
    const k = key.split('.')[1];
    S.userSettings.privacy = { ...(S.userSettings.privacy || {}), [k]: val };
  } else {
    S.userSettings[key] = val;
  }
}

async function toggleSetting(key) {
  if (!S.userSettings) S.userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  // B28: ignore re-clicks on the same toggle while its PUT is in flight, so we
  // don't queue conflicting writes for one key.
  if (settingSaving[key]) return;
  const next = !getSettingValue(key);
  const payload = key.startsWith('privacy.')
    ? { privacy: { [key.split('.')[1]]: next } }
    : { [key]: next };
  applySettingValue(key, next);
  window.renderSettingsToggles();
  settingSaving[key] = true;
  try {
    await window.api('/users/me/settings', 'PUT', payload);
    // B28: keep the optimistic local state instead of overwriting the whole
    // settings object with this PUT's echo — that echo only reflects this one
    // key and would clobber any other toggle the user flipped meanwhile.
  } catch (e) {
    // Revert just this key on failure (other keys' optimistic state is untouched).
    applySettingValue(key, !next);
    window.toast('Failed to save setting');
  } finally {
    settingSaving[key] = false;
  }
  window.renderSettingsToggles();
}
window.toggleSetting = toggleSetting;

function renderSettingsToggles() {
  document.querySelectorAll('.setting-toggle[data-key]').forEach(el => {
    const on = getSettingValue(el.dataset.key);
    el.classList.toggle('bg-neon', on);
    el.classList.toggle('bg-surface-container-high', !on);
    const knob = el.firstElementChild;
    if (knob) knob.className = `absolute top-0.5 w-4 h-4 rounded-full transition-all ${on ? 'right-0.5 bg-white' : 'left-0.5 bg-outline-variant'}`;
  });
}
window.renderSettingsToggles = renderSettingsToggles;

// ========================================
// STATIC CONTENT PAGES
// ========================================
const faqItem = (q, a) => `<div class="py-5 border-b border-outline-variant/20">
  <p class="font-headline text-sm font-bold tracking-tight mb-2">${q}</p>
  <p class="text-sm text-on-surface-variant leading-relaxed">${a}</p>
</div>`;

const docSection = (h, body) => `<section class="mb-8">
  <h2 class="font-headline text-xs font-black tracking-[0.2em] mb-3 text-on-surface">${h}</h2>
  <p class="text-sm text-on-surface-variant leading-relaxed">${body}</p>
</section>`;

const lastUpdated = '<p class="text-[10px] text-outline tracking-[0.2em] mb-8">Last updated: June 2026</p>';

const CONTENT_PAGES = {
  help: {
    title: 'Help Center',
    html: `
      <p class="text-sm text-on-surface-variant leading-relaxed mb-6">Answers to the questions we hear most often. Still stuck? Reach us via Contact Us or Report a Problem in Settings.</p>
      ${faqItem('How does weekly matching work?', 'Once you join the matching pool, our system pairs you with one carefully selected student per matching round based on your questionnaire answers, profile and preferences. Quality over quantity — you receive one proposal at a time, not an endless swipe deck.')}
      ${faqItem('Why have I not received a match yet?', 'Matches are released on a schedule, and a round may pass without a suitable candidate if the pool in your area is small or your filters are strict. Try widening your age range or disabling the same-school / same-city filters, and make sure your profile and questionnaire are complete.')}
      ${faqItem('How do I confirm or decline a match proposal?', 'When a proposal arrives, open the Match tab to view your candidate’s profile. You have 48 hours to confirm or pass. If you pass or the timer expires, you return to the pool for the next round.')}
      ${faqItem('What happens when both of us confirm?', 'You enter relationship mode: a private chat opens and you unlock the couple square to share moments together.')}
      ${faqItem('How do I edit my profile or matching preferences?', 'Go to Profile → Edit Profile to update your photos, bio and interests. Matching preferences (gender, age range, school filters) live behind the filter icon on the Match tab.')}
      ${faqItem('How do I end a connection?', 'Open your partner’s profile from the Match tab and choose Unmatch. This is permanent: the chat closes and both of you return to the matching pool.')}
      ${faqItem('How do I verify my student status?', 'Register with your university email address. Additional campus verification options are rolling out — verified profiles get a badge and priority in matching.')}
      ${faqItem('How do I delete my account?', 'Contact us at contact@unimatcha.ai from your registered email and we will remove your account and data in line with our Privacy Policy.')}
    `,
  },
  safety: {
    title: 'Safety Tips',
    html: `
      <p class="text-sm text-on-surface-variant leading-relaxed mb-6">Your safety matters more than any match. Keep these guidelines in mind when connecting with someone new.</p>
      ${faqItem('Keep conversations in the app', 'Chat within Unimatcha until you trust the other person. Moving to other platforms too early makes it harder for us to help if something goes wrong.')}
      ${faqItem('Take your time before meeting', 'There is no rush. Video call or chat for a while first, and be wary of anyone pressuring you to meet immediately.')}
      ${faqItem('Meet in public places', 'For first dates, choose busy campus spots, cafes or public venues during the day. Avoid private residences until you know each other well.')}
      ${faqItem('Tell a friend your plans', 'Share who you are meeting, where and when with a friend or flatmate, and check in with them during the date.')}
      ${faqItem('Arrange your own transport', 'Get to and from the date independently so you can leave whenever you want.')}
      ${faqItem('Never send money or financial details', 'No genuine match will ask you for money, gift cards, bank details or cryptocurrency. Treat any such request as a scam and report it immediately.')}
      ${faqItem('Trust your instincts', 'If something feels off — inconsistent stories, refusal to video call, guilt-tripping — it probably is. You never owe anyone a meeting or a reply.')}
      ${faqItem('Report and block', 'Use Report a Problem in Settings to flag suspicious or abusive behaviour. Reports are confidential and reviewed by our team.')}
    `,
  },
  terms: {
    title: 'Terms of Service',
    html: `
      ${lastUpdated}
      ${docSection('1. Acceptance of Terms', 'By creating an account or using Unimatcha (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. We may update these Terms from time to time; continued use after changes take effect constitutes acceptance of the revised Terms.')}
      ${docSection('2. Eligibility', 'The Service is intended for currently enrolled university students aged 18 or over. You must register with a valid university email address and provide truthful information about yourself. You may maintain only one account, and you may not use the Service if you have previously been removed for violating these Terms.')}
      ${docSection('3. Your Account', 'You are responsible for safeguarding your login credentials and for all activity under your account. Notify us immediately at contact@unimatcha.ai if you suspect unauthorised access. We are not liable for losses arising from your failure to protect your account.')}
      ${docSection('4. Acceptable Use', 'You agree not to: impersonate any person or misrepresent your identity, age or student status; harass, threaten, defame or abuse other users; post content that is unlawful, hateful, sexually explicit or infringes the rights of others; solicit money or commercial services from other users; use bots, scrapers or other automated means to access the Service; or attempt to interfere with the proper functioning of the Service.')}
      ${docSection('5. User Content', 'You retain ownership of the photos, posts and messages you submit, but you grant Unimatcha a non-exclusive, worldwide, royalty-free licence to host, display and distribute that content within the Service for the purpose of operating its features. You represent that you have all rights necessary to share the content you upload, and that it does not violate any law or third-party right.')}
      ${docSection('6. Matching', 'Match proposals are generated algorithmically based on your questionnaire answers, profile and preferences. We do not guarantee any particular number, frequency or quality of matches, nor any outcome from a match. Decisions to confirm, decline or unmatch are entirely yours.')}
      ${docSection('7. Safety', 'We do not conduct criminal background checks on users. You are solely responsible for your interactions with other users, both online and offline. Always exercise caution and review our Safety Tips before meeting anyone in person.')}
      ${docSection('8. Termination', 'We may suspend or terminate your account at our discretion if we reasonably believe you have violated these Terms, applicable law or the spirit of the community. You may stop using the Service and request account deletion at any time.')}
      ${docSection('9. Disclaimers and Liability', 'The Service is provided "as is" without warranties of any kind, express or implied. To the maximum extent permitted by law, Unimatcha shall not be liable for any indirect, incidental or consequential damages arising from your use of the Service, including interactions with other users.')}
      ${docSection('10. Contact', 'Questions about these Terms? Email us at contact@unimatcha.ai.')}
    `,
  },
  privacy: {
    title: 'Privacy Policy',
    html: `
      ${lastUpdated}
      ${docSection('1. Introduction', 'This Privacy Policy explains how Unimatcha ("we", "us") collects, uses and protects your personal information when you use our matching service. We are committed to handling your data responsibly and transparently.')}
      ${docSection('2. Information We Collect', 'Account information: your university email address and password (stored as a salted hash). Profile information: nickname, age, gender, school, degree stage, photos, bio, interests and other details you choose to add. Questionnaire answers: your responses used to compute match compatibility. Usage data: messages you send within the app, posts and comments in the square, likes, and basic interaction logs. Technical data: device type, IP address and approximate region, used for security and service operation.')}
      ${docSection('3. How We Use Your Information', 'We use your data to: operate the matching algorithm and propose compatible partners; display your profile to your match candidates and, where you allow it, to other users; deliver chat, square and notification features; respond to your support requests and reports; keep the Service safe by detecting fraud, spam and abusive behaviour; and improve the Service through aggregated, de-identified analytics.')}
      ${docSection('4. What Other Users See', 'Your profile (photos, nickname, school, interests) is visible to users you are matched with, and to other users where features such as the square apply. You can control visibility through the privacy toggles in Settings: Show my profile, Show online status and Show my moments. Your email address and questionnaire answers are never shown to other users.')}
      ${docSection('5. Sharing', 'We do not sell your personal data. We share data only with service providers who process it on our behalf (such as hosting and image storage) under confidentiality obligations, or when required by law, or to protect the rights and safety of our users.')}
      ${docSection('6. Data Retention', 'We keep your data while your account is active. If you delete your account, we remove or anonymise your personal data within 30 days, except where we must retain limited records to comply with legal obligations or resolve disputes.')}
      ${docSection('7. Security', 'We protect your data with encryption in transit, hashed passwords, access controls and regular reviews. No system is perfectly secure, so please use a strong, unique password and report any suspected breach to us immediately.')}
      ${docSection('8. Your Rights', 'Depending on your jurisdiction, you may have the right to access, correct, export or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us from your registered email address.')}
      ${docSection('9. Changes to This Policy', 'We may update this Policy as the Service evolves. Material changes will be announced in the app before they take effect.')}
      ${docSection('10. Contact', 'For privacy questions or requests, email contact@unimatcha.ai.')}
    `,
  },
};

function openContentPage(key) {
  const page = CONTENT_PAGES[key];
  if (!page) return;
  const titleEl = document.getElementById('content-title');
  const bodyEl = document.getElementById('content-body');
  if (titleEl) titleEl.textContent = page.title;
  if (bodyEl) bodyEl.innerHTML = page.html;
  const ov = document.getElementById('content-overlay');
  if (ov) ov.scrollTop = 0;
  window.openOverlay('content-overlay');
}
window.openContentPage = openContentPage;

// ========================================
// CONTACT US
// ========================================
function openContactUs() {
  window.openOverlay('contact-overlay');
}
window.openContactUs = openContactUs;

// ========================================
// REPORT A PROBLEM
// ========================================
function openReportProblem() {
  const cat = document.getElementById('report-category');
  const content = document.getElementById('report-content');
  const contact = document.getElementById('report-contact');
  if (cat) cat.value = 'bug';
  if (content) content.value = '';
  if (contact) contact.value = '';
  window.openOverlay('report-overlay');
}
window.openReportProblem = openReportProblem;

async function submitReport() {
  const category = document.getElementById('report-category')?.value || 'other';
  const content = document.getElementById('report-content')?.value.trim();
  const contact = document.getElementById('report-contact')?.value.trim();
  if (!content) {
    window.toast('Please describe the problem');
    return;
  }
  const btn = document.getElementById('report-submit');
  if (btn) btn.disabled = true;
  try {
    const body = { category, content };
    if (contact) body.contact = contact;
    await window.api('/reports', 'POST', body);
    window.toast('Report submitted. Thank you!');
    window.hideOverlay('report-overlay');
  } catch (e) {
    window.toast(e.message || 'Failed to submit report');
  }
  if (btn) btn.disabled = false;
}
window.submitReport = submitReport;

// ========================================
// LOVE MODE (couple space, unlocks in relationship mode)
// ========================================
async function openLoveMode() {
  // Dual-mode: S.matchStatus is bucketed by mode ({romantic, friend}); the real
  // per-mode status object (with .state) lives at S.matchStatus[mode]. Reading the
  // bucket itself (which is always truthy and has no .state) meant the locked
  // toast always fired and the couple space never opened even in a relationship.
  const mode = S.activeMatchMode || 'romantic';
  if (!S.matchStatus || typeof S.matchStatus !== 'object') {
    S.matchStatus = { romantic: null, friend: null };
  }
  let st = S.matchStatus[mode];
  if (!st) {
    try {
      // Always pass the required mode param (matches every other /matching/status
      // call site) and store back into the bucket slot — never overwrite the bucket.
      const data = await window.api('/matching/status?mode=' + encodeURIComponent(mode));
      st = data.data || data;
      S.matchStatus[mode] = st;
    } catch (e) {
      // fall through to locked toast
    }
  }
  if (st && st.state === 'relationship') {
    if (window.loadMilestone) window.loadMilestone();
    window.openOverlay('milestone-overlay');
  } else {
    window.toast("Unlocks when you're matched");
  }
}
window.openLoveMode = openLoveMode;
