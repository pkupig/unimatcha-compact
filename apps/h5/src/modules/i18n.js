// 深色模式 + 中英切换（本轮反馈2）。
// 深色：html.dark（CSS 在 main.css）。中文：批次1 字典 + DOM 文本节点匹配翻译（未覆盖的保持英文，逐步扩充）。
const THEME_KEY = 'cl_theme';
const LANG_KEY = 'cl_lang';

// ── 深色模式 ──
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
function getTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { return 'light'; }
}
function toggleDarkMode() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme(next);
  window.toast && window.toast(next === 'dark' ? 'Dark mode on' : 'Light mode on');
}
window.toggleDarkMode = toggleDarkMode;
window.isDarkMode = () => getTheme() === 'dark';

// ── i18n（批次1：常见导航/按钮/标签）──
const ZH = {
  Chat: '聊天', Romantic: '恋人', Friend: '朋友', Square: '广场', Profile: '我的',
  'Edit Profile': '编辑资料', 'Contact Us': '联系我们', Settings: '设置', 'Log Out': '退出登录',
  ENERGY: '能量', 'Get Energy': '获取能量', 'Open Chat': '打开聊天', 'End Relationship': '解除关系',
  Send: '发送', 'Match Settings': '匹配设置', Friends: '好友', Chats: '聊天', 'Search chats': '搜索会话',
  'Relationship Network': '关系网', 'Add by QR': '扫码添加', 'My QR': '我的二维码', Scan: '扫一扫',
  Save: '保存', Cancel: '取消', Delete: '删除', Remove: '移除', Add: '添加', Close: '关闭', Done: '完成',
  Anniversaries: '纪念日', 'Craving today': '今天想吃', 'Gift jar': '礼物罐', 'Plans & checklist': '计划清单',
  "Today's status": '今日状态', 'Find Friends': '查找好友', Verify: '认证', Pending: '审核中',
  Notifications: '通知', 'No posts yet': '还没有帖子', 'Send Message': '发消息', 'Match Again': '重新匹配',
  'Modify Preferences': '修改偏好', 'Set note': '设置备注', 'Chat background': '聊天背景',
  'Dark mode': '深色模式', Language: '语言', 'Payment Method': '支付方式', 'Confirm as Friend': '确认为好友',
  'Confirm as Partner': '确认为恋人', 'Enter Chat': '进入聊天', 'Cancel connection': '取消连接',
};
let observer = null;
function getLang() {
  try { return localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { return 'en'; }
}
// 用户生成内容（聊天气泡 / 昵称 / 备注 / 帖子标题正文等）可能恰好等于某个 UI
// 字符串，按文本节点裸匹配翻译会把它们误译、污染数据。凡是位于带 data-no-i18n
// 标记的元素子树内的文本，一律跳过翻译。各渲染模块给用户内容元素加该标记即可。
function isInNoI18n(node) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el) {
    if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-no-i18n')) return true;
    el = el.parentElement;
  }
  return false;
}
function translateTextNode(node) {
  if (isInNoI18n(node)) return;
  const t = node.nodeValue;
  if (!t) return;
  const trimmed = t.trim();
  if (trimmed && ZH[trimmed]) node.nodeValue = t.replace(trimmed, ZH[trimmed]);
}
function translateTree(root) {
  // 整个子树被标记为用户内容时直接跳过，连遍历都省掉。
  if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('data-no-i18n')) return;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => isInNoI18n(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(translateTextNode);
  } catch (e) {}
}
function startI18n() {
  if (getLang() !== 'zh') return;
  translateTree(document.body);
  observer = new MutationObserver((muts) => {
    muts.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 3) translateTextNode(node);
        else if (node.nodeType === 1) translateTree(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
function toggleLang() {
  const next = getLang() === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
  window.location.reload(); // 重载后干净地应用/还原
}
window.toggleLang = toggleLang;
window.getLang = getLang;

// boot
applyTheme(getTheme());
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startI18n);
} else {
  startI18n();
}
