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

async function doRegister() {
  const email = document.getElementById('register-email')?.value?.trim();
  const password = document.getElementById('register-password')?.value?.trim();
  const confirm = document.getElementById('register-password-confirm')?.value?.trim();
  if (!email || !password || !confirm) {
    window.toast('Please fill all fields');
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
      password
    });
    const data = res.data || res; // 后端响应被包了一层 {success, data, timestamp}
    localStorage.setItem('cl_token', data.token || data.access_token);
    S.currentUser = data.user || data;
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
