import { S } from '../state.js';

// ========================================
// AUTH FUNCTIONS
// ========================================
async function doLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value?.trim();
  if (!email || !password) {
    window.toast('Please fill all fields');
    return;
  }
  try {
    const res = await window.api('/auth/login', 'POST', {
      email,
      password
    });
    const data = res.data || res; // 后端响应被包了一层 {success, data, timestamp}
    localStorage.setItem('cl_token', data.token || data.access_token);
    S.currentUser = data.user || data;
    window.checkUserState();
  } catch (e) {
    window.toast('Login failed: ' + e.message);
  }
}
window.doLogin = doLogin;

// 注册：发送邮箱验证码（60s 冷却与后端一致；未配置 SMTP 时后端返回 devCode 供测试）
async function sendRegisterCode() {
  const email = document.getElementById('register-email')?.value?.trim();
  const zh = window.getLang && window.getLang() === 'zh';
  if (!email) {
    window.toast(zh ? '请先填写邮箱' : 'Enter your email first');
    return;
  }
  const btn = document.getElementById('register-sendcode-btn');
  if (btn?.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = zh ? '发送中…' : 'Sending…'; }
  try {
    const res = await window.api('/auth/register/send-code', 'POST', { email });
    const env = res?.data || res || {};
    const hint = document.getElementById('register-code-hint');
    if (hint) {
      // 未配置邮件服务 → 开发模式直接展示验证码；接好 SMTP 后后端不再返回 devCode
      hint.textContent = env.devCode
        ? (zh ? `开发模式（未接邮件服务）：验证码 ${env.devCode}` : `Dev mode (no email service yet): your code is ${env.devCode}`)
        : (zh ? '验证码已发送到你的邮箱，10 分钟内有效' : 'Code sent to your email, valid for 10 minutes');
      hint.setAttribute('data-no-i18n', '');
      hint.classList.remove('hidden');
    }
    window.toast(zh ? '验证码已发送' : 'Code sent');
    window.codeCooldown(btn, 60, 'Send code');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send code'; }
    window.toast((zh ? '发送失败：' : 'Failed to send: ') + (e?.message || ''));
  }
}
window.sendRegisterCode = sendRegisterCode;

async function doRegister() {
  const email = document.getElementById('register-email')?.value?.trim();
  const code = document.getElementById('register-code')?.value?.trim();
  const password = document.getElementById('register-password')?.value?.trim();
  const confirm = document.getElementById('register-password-confirm')?.value?.trim();
  const zh = window.getLang && window.getLang() === 'zh';
  if (!email || !code || !password || !confirm) {
    window.toast('Please fill all fields');
    return;
  }
  // 与后端 RegisterDto 的 Length(6,6) 对齐
  if (!/^\d{6}$/.test(code)) {
    window.toast(zh ? '请输入 6 位邮箱验证码' : 'Enter the 6-digit email verification code');
    return;
  }
  // 与后端 RegisterDto 的 MinLength(8) 对齐
  if (password.length < 8) {
    window.toast('Password must be at least 8 characters');
    return;
  }
  if (password !== confirm) {
    window.toast('Passwords do not match');
    return;
  }
  try {
    const res = await window.api('/auth/register', 'POST', {
      email,
      password,
      code
    });
    const data = res.data || res; // 后端响应被包了一层 {success, data, timestamp}
    localStorage.setItem('cl_token', data.token || data.access_token);
    S.currentUser = data.user || data;
    window.startRealtime?.();
    window.showPage('page-profile-setup');
  } catch (e) {
    window.toast('Registration failed: ' + e.message);
  }
}
window.doRegister = doRegister;

async function doLogout() {
  const ok = await window.confirmCard({
    title: 'Log out of Unimatcha?',
    confirmLabel: 'Log Out',
    danger: true,
  });
  if (!ok) return;
  window.stopMatchPolling();
  window.stopChatPolling();
  window.stopNotifPolling();
  window.stopCountdownTick();
  localStorage.removeItem('cl_token');
  // Wipe all user-scoped state and dismiss any open overlay so the next
  // account never sees the previous user's data.
  window.cleanupUserState();
  window.closeAllOverlays();
  window.showPage('page-auth');
}
window.doLogout = doLogout;

function switchAuthTab(tab, event) {
  if (event) event.preventDefault();
  // Hide all auth forms
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  // Reset all tab button styles
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.className = 'font-headline text-xs font-bold tracking-[0.2em] text-on-surface-variant hover:text-primary pb-2 border-b-2 border-transparent transition-all duration-300';
  });
  // Activate selected tab
  if (tab === 'signin') {
    document.getElementById('signin-form')?.classList.add('active');
    const btn = document.querySelector('[data-tab="signin"]');
    if (btn) btn.className = 'font-headline text-xs font-bold tracking-[0.2em] border-b-2 border-primary pb-2 text-primary transition-all duration-300';
  } else {
    document.getElementById('register-form')?.classList.add('active');
    const btn = document.querySelector('[data-tab="register"]');
    if (btn) btn.className = 'font-headline text-xs font-bold tracking-[0.2em] border-b-2 border-primary pb-2 text-primary transition-all duration-300';
  }
}

// ========================================
// PROFILE SETUP
// ========================================
window.switchAuthTab = switchAuthTab;

async function applyVerification() {
  const ok = await window.confirmCard({
    title: 'Apply for identity verification?',
    confirmLabel: 'Apply',
  });
  if (!ok) return;
  try {
    await window.api('/users/me/verification/apply', 'POST');
    window.toast('Verification applied!');
  } catch (e) {
    window.toast('Failed: ' + e.message);
  }
}
window.applyVerification = applyVerification;

async function showChangePassword() {
  // 后端现在要求校验当前密码（防止持令牌即可改密），先收当前密码再收新密码。
  const current = await window.promptCard({
    title: 'Change password',
    label: 'Current password',
    placeholder: 'Enter your current password',
    confirmLabel: 'Next',
  });
  if (current == null) return; // promptCard 取消返回 null；不提交。
  const pw = await window.promptCard({
    title: 'Change password',
    label: 'New password',
    placeholder: 'At least 8 characters',
    confirmLabel: 'Change',
  });
  if (pw == null) return;
  window.submitChangePassword(current.trim(), pw.trim());
}
window.showChangePassword = showChangePassword;

async function submitChangePassword(currentPw, pw) {
  if (!currentPw) {
    window.toast('Enter your current password');
    return;
  }
  // 与注册及后端 MinLength(8) 对齐，提交前做客户端长度校验。
  if (!pw || pw.length < 8) {
    window.toast('Password must be at least 8 characters');
    return;
  }
  try {
    // 后端字段：currentPassword（校验）+ password（新密码）
    await window.api('/auth/change-password', 'POST', {
      currentPassword: currentPw,
      password: pw,
    });
    window.toast('Password changed');
  } catch (e) {
    window.toast(e?.message || 'Failed to change password');
  }
}

// ========================================
// PRIVACY & SETTINGS TOGGLES
// ========================================
window.submitChangePassword = submitChangePassword;
