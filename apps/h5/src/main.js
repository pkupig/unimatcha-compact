import './styles/main.css';
import './state.js';
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
});
