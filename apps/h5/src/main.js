import './styles/main.css';
import { S } from './state.js';
import './modules/core.js';
import './modules/schoolbadge.js';
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
      if (e.key === 'Enter' && !e.shiftKey) {
        // textarea 的回车默认插入换行：不阻止的话空输入按回车会积累不可见
        // 换行（占位符消失、trim 后永远发不出去），发送中/失败时正文后也挂着换行
        e.preventDefault();
        window.sendChatMessage();
      }
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
  // 下拉刷新：只保留 Chat 会话列表（匹配面板的下拉刷新已按用户要求移除——
  // enabled 门 + movers 只挂 chat 面板）；square 页照旧刷新当前信息流
  window.attachPullToRefresh(document.getElementById('tab-match'), () => window.loadSessions?.(), '#home-chat-view', {
    enabled: () => (S.homeView || 'chat') === 'chat',
  });
  window.attachPullToRefresh(document.getElementById('tab-square'), () => window.loadSquareTab2?.(), 'main');
  // 主页三视图左右滑切换（Chat ↔ 恋人 ↔ 朋友，广场同款轨道跟手）
  window.bindHomeViewSwipe?.();
  // 底部导航滚动隐藏。注意 #tab-match 已不是滚动容器（横滑轨道 overflow:hidden），
  // 会话列表的滚动发生在 #home-chat-view 面板上——绑它。
  // 偏好卡的下拉关闭走 closeFilterSheet：关卡要同步主页摘要框的增强显示
  window.bindSheetDragClose('filter-overlay', () => window.closeFilterSheet());
  ['home-chat-view', 'tab-square', 'tab-profile'].forEach(id =>
    window.bindNavAutoHide(document.getElementById(id)));
});
