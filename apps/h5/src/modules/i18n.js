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
  Match: '匹配', 'Edit Profile': '编辑资料', 'Contact Us': '联系我们', Settings: '设置', 'Log Out': '退出登录',
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
  // ── 设置页（本轮反馈4：设置整页可中文化）──
  Account: '账号', Email: '邮箱', Password: '密码', 'Tap to change password': '点击修改密码',
  Preferences: '偏好', Privacy: '隐私',
  'Show my profile': '公开我的资料', 'Allow others to view your profile': '允许他人查看你的资料',
  'Show online status': '显示在线状态', 'Let your match see when you are active': '让匹配对象看到你的在线状态',
  'Show my moments': '公开我的动态', 'Display your moments to others': '向他人展示你的动态',
  'Push Notifications': '推送通知', 'Match results, messages and likes': '匹配结果、消息与点赞',
  Support: '支持', 'Help Center': '帮助中心', 'Safety Tips': '安全提示', 'Report a Problem': '问题反馈',
  Legal: '法律条款', 'Terms of Service': '用户协议', 'Privacy Policy': '隐私政策',
  Nudge: '拍一拍', 'When someone nudges you, it reads:': '别人拍你时显示为：', '…nudged me': '…拍了拍我',
  'e.g. "nudged me on the head" / "拍了拍我的头"': '例如：拍了拍我的头 / 拍了拍我并说晚安',
  // ── 匹配 / 空态 ──
  'Start Your Journey': '开始你的旅程', 'Find New Friends': '寻找新朋友',
  'Join Matching Pool': '加入匹配池', 'Leave Pool': '离开匹配池',
  'No Match This Week': '本周暂无匹配', 'No Friends This Round': '本轮暂无朋友候选',
  'Romantic Questionnaire': '恋人问卷', 'Friend Questionnaire': '朋友问卷',
  'Fill Out Questionnaire': '填写问卷', 'Retake Questionnaire': '重新填写问卷',
  'A few quick questions unlock romantic matching.': '花几分钟答题，解锁恋人匹配。',
  'A few quick questions unlock friend matching.': '花几分钟答题，解锁朋友匹配。',
  "This Week's Match": '本周匹配', 'Profile Unavailable': '资料暂不可用',
  'No conversations yet': '还没有会话',
  'Match in Romantic or Friend mode — chats appear here once you connect.': '去恋人或朋友模式匹配，连接成功后会话会出现在这里。',
  TEMPORARY: '临时会话', CONNECTIONS: '已连接',
  'Match Basis': '匹配依据', Questionnaire: '问卷', Both: '两者', 'Extra Info': '补充信息',
  'Enhanced Mode': '增强模式', 'Romantic Enhance': '恋人增强', 'Friend Enhance': '朋友增强',
  'Target Gender': '目标性别', Male: '男', Female: '女', All: '不限',
  'Age Range': '年龄范围', 'Any age': '不限年龄', 'School Filter': '学校筛选',
  'Only Same School': '仅限同校', 'Same City': '同城优先', 'University Stage': '学业阶段',
  Undergraduate: '本科', Master: '硕士', PhD: '博士', 'Interest Priority': '兴趣优先级',
  // ── 广场 ──
  Recommend: '推荐', 'Campus Wall': '校园墙', 'Be the first to share a moment': '来发布第一条动态吧',
  Publish: '发布', 'To Recommend': '发到推荐', 'To Campus Wall': '发到校园墙',
  'Post anonymously': '匿名发布', 'Failed to load posts': '帖子加载失败',
  'Check your connection and try again': '请检查网络后重试', Retry: '重试',
  // ── 能量购买 ──
  cells: '格', 'Select a package': '请选择套餐', 'Select a payment method': '请选择支付方式',
  'WeChat Pay': '微信支付', Alipay: '支付宝', 'Card (Stripe)': '银行卡 (Stripe)',
  // ── 投票 / 活动 / 票夹 ──
  'Create a poll': '发起投票', 'Campus wall only · goes live after review': '仅校园墙 · 审核通过后展示',
  '+ Add option': '+ 添加选项', 'My Tickets': '我的票夹', 'No tickets yet': '还没有门票',
  'Tickets you get for campus events appear here.': '购买的校园活动门票会出现在这里。',
  'Show this QR at the entrance': '入场时出示此二维码',
  'Get Ticket': '购票', 'Sold out': '已售罄', 'Sales closed': '停止售票', 'Event ended': '活动已结束',
  Free: '免费', 'UNDER REVIEW': '审核中', 'REJECTED': '已驳回',
  // ── 注册分步向导 ──
  'What should we call you?': '怎么称呼你？', 'Your nickname is what others see.': '昵称是别人看到的名字。',
  'Your real name': '你的真实姓名', 'Only shown to confirmed partners.': '仅对确认的伴侣可见。',
  'How do you identify?': '你的性别是？', 'Used for matching. Not shown publicly.': '仅用于匹配，不公开展示。',
  'When were you born?': '你的生日是？', 'We show your age, never your birthday.': '我们只展示年龄，不展示生日。',
  Next: '下一步', Back: '上一步', Continue: '继续',
  'One thoughtful match, every week.': '每周一次，用心匹配。',
  // ── 登录 / 注册 / 资料 ──
  'Sign In': '登录', Register: '注册', 'Welcome Back': '欢迎回来', 'Join Unimatcha': '加入 Unimatcha',
  'Email Address': '邮箱地址', 'Confirm Password': '确认密码', 'Forgot Password?': '忘记密码？',
  'Profile Setup': '完善资料', 'Basic Info': '基本信息', Nickname: '昵称', 'Real name': '真实姓名',
  'University / School': '学校', City: '城市', Major: '专业', Nationality: '国籍',
  Gender: '性别', 'Looking For': '想认识', Birthday: '生日', 'Academic Year': '学业阶段',
  Interests: '兴趣', Bio: '个人简介', 'Confirm Profile': '完成资料',
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
