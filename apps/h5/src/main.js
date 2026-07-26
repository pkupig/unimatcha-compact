import './styles/main.css';
import { S } from './state.js';
import './modules/core.js';
import './modules/i18n.js';
import './modules/auth.js';
import './modules/questionnaire.js';
import './modules/profile.js';
import './modules/match.js';
import './modules/couple.js';
import './modules/addfriend.js';
import './modules/chat.js';
import './modules/square.js';
import './modules/notifications.js';
import './modules/settings.js';
import './modules/milestone.js';

// 启动成功标记（index.html 的看门狗据此判断是否需要自愈重载）
window.__appBooted = true;

// ---- bootstrap ----
// ========================================
// DOM INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(window.hideSplash, 3000);
  const setupBio = document.getElementById('setup-bio');
  if (setupBio) {
    setupBio.addEventListener('input', e => {
      const c = document.getElementById('setup-bio-count');
      if (c) c.textContent = e.target.value.length;
    });
  }
  const editBio = document.getElementById('edit-bio');
  if (editBio) {
    editBio.addEventListener('input', e => {
      const c = document.getElementById('edit-bio-count');
      if (c) c.textContent = e.target.value.length;
    });
  }
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') window.sendChatMessage();
    });
  }
  const pdInput = document.getElementById('comment-input');
  if (pdInput) {
    pdInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') window.submitPdComment();
    });
  }
  const postImgInput = document.getElementById('post-image-input');
  if (postImgInput) {
    postImgInput.addEventListener('change', window.handlePostImages);
  }
  window.renderSetupTags();
  // 下拉刷新：match 页按当前视图刷新（chat 列表 / 匹配状态），square 页刷新当前信息流
  window.attachPullToRefresh(document.getElementById('tab-match'), () => {
    const v = S.homeView || 'chat';
    return v === 'chat' ? window.loadSessions?.() : window.loadMatchTab?.();
  }, '#home-chat-view, #home-match-view');
  window.attachPullToRefresh(document.getElementById('tab-square'), () => window.loadSquareTab2?.(), 'main');
  // 底部导航滚动隐藏（三个 tab 滚动容器都绑）
  window.bindSheetDragClose('filter-overlay');
  ['tab-match', 'tab-square', 'tab-profile'].forEach(id =>
    window.bindNavAutoHide(document.getElementById(id)));
});
