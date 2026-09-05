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
  'Delete Account': '注销账号',
  'Delete your account?': '确定要注销账号吗？',
  'This permanently deletes your profile, photos and personal information. Your existing chats and matches keep working for the other person, but you will no longer be able to sign in. This cannot be undone.':
    '这将永久删除你的资料、照片与个人信息。你已有的聊天和匹配记录仍会保留在对方那边，但你之后将无法再登录。此操作不可撤销。',
  'Confirm your password': '请确认密码',
  Password: '密码',
  'Enter your password to continue': '输入密码以继续',
  'Password is required': '请输入密码',
  'Your account has been deleted': '你的账号已注销',
  'Failed to delete account': '注销失败',
  ENERGY: '能量', 'Get Energy': '获取能量', 'Open Chat': '打开聊天', 'End Relationship': '解除关系',
  Send: '发送', Friends: '好友', Chats: '聊天', 'Search chats': '搜索会话',
  'Relationship Network': '关系网', 'Add by QR': '扫码添加', 'My QR': '我的二维码', Scan: '扫一扫',
  // ── 搜索面板（只搜已有联系人；找同学/猜你认识两区已按产品要求移除）──
  'Search & discover': '搜索与发现', COMMENT: '评论',
  'No conversations matched.': '没有匹配的会话。', 'No conversations yet.': '还没有会话。',
  'No posts found': '没有找到帖子', 'Try a different keyword': '换个关键词试试',
  'Search the square': '搜索广场', 'Find posts by title, content or tag': '按标题、正文或标签搜索帖子',
  'Optional — leave blank to skip': '选填，可留空跳过', 'Select all that apply': '可多选',
  'Questionnaire updated — refill for better matches': '问卷已更新，重新填写让匹配更准', Refill: '去填写',
  'Up to 6 options': '最多 6 个选项', 'At least 2 options': '至少保留 2 个选项',
  'A poll needs at least 2 options': '投票至少需要 2 个选项',
  PENDING: '待确认', PARTNER: '恋人', FRIEND: '好友',
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
  // ── 匹配页计划页（新版：标题/副文案；框内动态值走 zh 三元 + data-no-i18n）──
  'Matching in Progress': '匹配进行中',
  "Join this week's pool — the algorithm will watch the crowd for someone on your wavelength.": '加入本周匹配池，让算法在人海里为你留意那个同频的人。',
  "Join this week's pool — the algorithm will scan the crowd for 5 friends on your wavelength.": '加入本周匹配池，让算法在人海里为你留意 5 位同频的新朋友。',
  'Names are revealed Friday 17:00 — someone on your wavelength is walking toward you.': '名字会在周五 17:00 准时揭晓——同频的人，正穿过人海向你走来。',
  'Names are revealed Friday 17:00 — friends on your wavelength are on the way.': '名单会在周五 17:00 准时揭晓——同频的朋友们，正穿过人海向你走来。',
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
  Recommend: '推荐', Nearby: '附近', Explore: '探索', 'Campus Wall': '校园墙', Pinned: '置顶',
  // 附近：定位空态
  'Location is off': '定位未开启', 'Turn on location': '开启定位',
  'Allow location in your browser settings, or add your city to see posts around you': '请在浏览器设置里允许定位，或在资料里填写城市，来看看附近的动态',
  'Allow location to see posts around you, or add your city in your profile': '开启定位即可看到附近的动态，也可以在资料里填写城市',
  'Try again': '重试', 'Add city instead': '改为填写城市',
  // 探索：选校与只读态
  'No other campus walls yet': '还没有其它学校的墙',
  'Get verified to interact': '认证学生身份后可互动',
  // 聊天：只收 toast 文案。长按菜单项（引用/转发/复制/点赞）、被删原消息占位、
  // 帖子卡占位标题一律在调用点用 zh?:'' 三元产出，**不进全局词典**——
  // Quote / Forward / Copy / Like 这种通用短词一旦进词典，哪段用户内容漏了
  // data-no-i18n 就会被整词替换（8/13 教训）。
  'Copied to clipboard': '已复制到剪贴板', 'Copy failed': '复制失败',
  // 转发选择器（这两条是 toast，同样只在调用点用；保留 toast 两条即可）
  Forwarded: '已转发', 'Forward failed': '转发失败',
  // 发帖：带上位置
  'Add location': '带上位置', 'Lets people nearby find this post': '让附近的人能看到这条',
  'Nothing pinned yet': '还没有置顶内容',
  'Your student union pins important notices here': '学生会会把重要通知置顶在这里', Search: '搜索', 'Be the first to share a moment': '来发布第一条动态吧',
  Publish: '发布', 'To Recommend': '发到推荐', 'To Campus Wall': '发到校园墙',
  'Post anonymously': '匿名发布', 'Comment anonymously': '匿名评论', 'Posting to': '发布到', 'Failed to load posts': '帖子加载失败',
  'Check your connection and try again': '请检查网络后重试', Retry: '重试',
  // ── 能量购买 ──
  cells: '格', 'Select a package': '请选择套餐', 'Select a payment method': '请选择支付方式',
  'WeChat Pay': '微信支付', Alipay: '支付宝', 'Card (Stripe)': '银行卡 (Stripe)',
  // ── 投票 / 活动 / 票夹 ──
  'Create a poll': '发起投票', 'Goes live after review': '审核通过后展示',
  '+ Add option': '+ 添加选项', 'My Tickets': '我的票夹', 'No tickets yet': '还没有门票',
  Ticket: '门票', 'Tap to open': '点击查看', 'Add to Apple Wallet': '添加到 Apple Wallet',
  'Tickets you get for campus events appear here.': '购买的校园活动门票会出现在这里。',
  'Show this QR at the entrance': '入场时出示此二维码',
  'Get Ticket': '购票', 'Sold out': '已售罄', 'Sales closed': '停止售票', 'Event ended': '活动已结束',
  Free: '免费', 'UNDER REVIEW': '审核中', 'REJECTED': '已驳回',
  'Not enough energy — top up': '能量不足，请先充值',
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
  'Non-binary': '非二元', 'Select Gender': '选择性别',
  'Select School': '选择学校', 'Select Institution': '选择学校', 'Select Grade': '选择年级',
  'Select City': '选择城市', 'Select Major': '选择专业', 'Select MBTI': '选择 MBTI',
  'Select Nationality': '选择国籍', 'Student ID': '学生卡号',
  // 编辑资料里的 signature 字段（原标签 Description，语义不清）
  Signature: '个性签名',
  Interests: '兴趣', Bio: '个人简介', 'Confirm Profile': '完成资料',
  // ── 中文态补漏（本轮反馈）──
  'Enter your academic credentials': '输入你的账号信息',
  'Create your academic profile': '创建你的账号',
  'Welcome Back': '欢迎回来', 'Academic Manifesto': '关于我',
  'Your Academic Identity': '你的头像',
  'By continuing, you agree to the Academic Code of Conduct.': '继续即表示你同意社区行为准则。',
  Upload: '上传', Start: '开始', 'Maybe Later': '稍后再说',
  'Complete Your Match Profile': '完善匹配资料',
  'Complete a questionnaire to unlock that mode.': '完成问卷即可解锁对应模式的匹配。',
  'Next cycle in': '距下轮公布',
  'No suitable match this week. See you next Friday.': '本周暂无合适匹配，下周五见。',
  'Both of you must tap "Confirm Partner" in chat within 48 hours': '48 小时内双方都在聊天中点「确认为恋人」即可',
  'Both must tap "Confirm Friend" in chat within 48 hours': '48 小时内双方都点「确认为好友」即可',
  '3 cells · refunded if no match': '3 格能量 · 未匹配到全额退回',
  '1 cell per guaranteed match · refunded if short': '每保底 1 人 1 格 · 不足退回',
  'Student Verification': '学生认证', 'Student ID Card': '学生卡',
  'Tap to upload': '点击上传', 'School Email': '学校邮箱', 'Verification Code': '验证码',
  'Send code': '发验证码', 'Submit for review': '提交审核',
  'Upload a clear photo of your student ID — an admin will review it.': '上传清晰的学生卡照片，管理员将进行审核。',
  Category: '类别', Description: '描述', 'Contact (optional)': '联系方式（选填）',
  'App bug': '应用问题', 'Report a user': '举报用户', 'Inappropriate content': '不当内容', Other: '其他',
  'Submit Report': '提交反馈',
  'Questions, feedback or partnership inquiries:': '咨询、反馈或合作请联系：',
  'Send Email': '发送邮件',
  Today: '今天', Yesterday: '昨天', Earlier: '更早', 'Load More': '加载更多',
  // ── 通知面板 ──
  Notifications: '通知', Notification: '通知详情', 'No notifications': '暂无通知',
  "You're all caught up": '都看完啦', 'Failed to load': '加载失败', 'Loading...': '加载中…',
  'Scan to connect instantly.': '扫一扫，立即互加。',
  'Point at your friend\'s QR — or enter their code:': '对准好友的二维码，或输入 TA 的编号：',
  'YOUR CODE': '你的编号', 'TICKET CODE': '票码',
  'Cover Selection': '封面', Replace: '更换', Grade: '年级', School: '学校',
  'Photo Portfolio': '照片集', 'Change Photo Portfolio': '管理照片集',
  'Real name': '真实姓名',
  '· up to 5 gifts you\'d love — shown to your partner': '· 最多 5 件想要的礼物，仅伴侣可见',
  '· only shown to confirmed partners': '· 仅对确认的伴侣可见',
  'Friend Candidates': '朋友候选',
  Energy: '能量',
  'Add your school to view the campus wall': '填写学校后解锁校园墙',
  'Set your school in your profile to unlock it': '在资料中填写学校即可查看本校动态',
  'Complete profile': '去完善资料',
  // ── 问卷 ──
  'Strongly Agree': '非常同意', Agree: '同意', Neutral: '中立', Disagree: '不同意', 'Strongly Disagree': '非常不同意',
  'Assessment Progress': '答题进度', Previous: '上一题', Submit: '提交', Answered: '已答', Unanswered: '未答',
  Retake: '重新填写', 'Your answer...': '写下你的回答…',
  // ── 卡片残留 ──
  'Shared Interests': '共同兴趣', 'This Week\'s Match': '本周匹配',
  'Confirm Partner': '确认为恋人', 'Confirm Friend': '确认为好友',
  'You have confirmed, waiting for their response': '你已确认，等待对方回应',
  'This connection has ended. You can no longer send messages.': '这段连接已结束，无法再发送消息。',
  Reply: '回复', Observations: '评论', 'No observations yet. Share the first one.': '还没有评论，来抢沙发。',
  Sponsored: '赞助', 'Student Union': '学生会', 'Official Team': '官方团队', Official: '官方',
  PINNED: '置顶',
  VALID: '有效', USED: '已使用', CANCELLED: '已作废',
  'Applies the next time you join the pool': '将在下次进入匹配池时生效',
  'Enhanced this round': '本轮已增强',
  // ── 情侣空间 ──
  Anniversaries: '纪念日', 'Craving today': '今天想吃', "What I'm up to": '近期安排',
  'Plans & checklist': '计划清单', 'Gift jar': '礼物罐', 'End Relationship': '解除关系',
  'Send I love you': '发送我爱你', 'Sent today — see you tomorrow': '今天已发送 · 明天再来',
  'No anniversaries yet.': '还没有纪念日', 'Nothing planned yet.': '还没有计划',
  'No update': '暂无更新', 'Tap edit': '点击编辑', "Add what you're up to": '添加你的安排',
  'View all': '查看全部',
  'Add anniversary': '添加纪念日', 'Add plan': '添加计划',
};

// ── 匿名化名（广场匿名帖/匿名评论）──
// 后端只下发一个不可反推的 aliasSeed，名字在前端按当前语言渲染——
// 化名不可能走全局词典：观察器是「整段文本精确匹配」，而用户内容一律带 data-no-i18n。
// 中英两张词表下标一一对应，所以同一个人在两种语言下是同一只动物，头像也不变。
const ALIAS_ADJ_EN = ['Curious', 'Quiet', 'Brave', 'Gentle', 'Witty', 'Clever', 'Mellow', 'Swift', 'Cozy', 'Bold', 'Sunny', 'Lucky', 'Calm', 'Eager', 'Noble', 'Jolly'];
const ALIAS_ANI_EN = ['Otter', 'Fox', 'Sparrow', 'Koala', 'Panda', 'Lynx', 'Heron', 'Robin', 'Wren', 'Bear', 'Finch', 'Hare', 'Seal', 'Crane', 'Marten', 'Quokka'];
const ALIAS_ADJ_ZH = ['好奇的', '安静的', '勇敢的', '温柔的', '机灵的', '聪明的', '慵懒的', '敏捷的', '暖心的', '大胆的', '开朗的', '幸运的', '淡定的', '热心的', '优雅的', '欢快的'];
const ALIAS_ANI_ZH = ['水獭', '狐狸', '麻雀', '考拉', '熊猫', '山猫', '白鹭', '知更鸟', '云雀', '小熊', '金翅雀', '野兔', '海豹', '仙鹤', '松貂', '小袋鼠'];
// 头像 emoji 与动物下标对齐：中英文看到的是同一只
const ALIAS_EMOJI = ['🦦', '🦊', '🐦', '🐨', '🐼', '🐆', '🦩', '🐤', '🕊️', '🐻', '🦜', '🐰', '🦭', '🦢', '🦡', '🦘'];
// 头像底色：柔和且彼此可分（同 seed 恒定，不是每次渲染都换）
const ALIAS_BG = ['#FDE68A', '#BFDBFE', '#FBCFE8', '#BBF7D0', '#DDD6FE', '#FED7AA', '#A5F3FC', '#E9D5FF', '#FEF08A', '#C7D2FE', '#FECACA', '#D9F99D', '#99F6E4', '#F5D0FE', '#BAE6FD', '#FDBA74'];

// seed → 化名（跟随当前语言）
function aliasName(seed) {
  const n = Number(seed) >>> 0;
  const zh = getLang() === 'zh';
  const adj = zh ? ALIAS_ADJ_ZH : ALIAS_ADJ_EN;
  const ani = zh ? ALIAS_ANI_ZH : ALIAS_ANI_EN;
  const a = adj[n % adj.length];
  const b = ani[(n >>> 8) % ani.length];
  return zh ? `${a}${b}` : `${a} ${b}`;
}
window.aliasName = aliasName;

// seed → 头像（emoji + 底色，同 seed 恒等；零网络请求、零静态资源）
function aliasAvatarHtml(seed, sizeClass, fontSize) {
  const n = Number(seed) >>> 0;
  const emoji = ALIAS_EMOJI[(n >>> 8) % ALIAS_EMOJI.length];
  const bg = ALIAS_BG[(n >>> 16) % ALIAS_BG.length];
  return `<div class="${sizeClass || 'w-8 h-8'} rounded-full flex items-center justify-center shrink-0" style="background:${bg}" data-no-i18n><span style="font-size:${fontSize || 16}px;line-height:1">${emoji}</span></div>`;
}
window.aliasAvatarHtml = aliasAvatarHtml;

// placeholder 翻译表（输入框占位符走属性，文本节点机制覆盖不到）
const ZH_PLACEHOLDER = {
  'Search posts': '搜索帖子', 'Type your response...': '输入消息…',
  'Add an observation...': '写下你的评论…', 'Commenting anonymously...': '正在匿名评论…',
  'Your answer...': '写下你的回答…', 'Search your chats': '搜索会话',
  'Search your contacts': '搜索联系人',
  'Title': '标题', 'Capture the moment...': '记录此刻…',
  'Option 1': '选项 1', 'Option 2': '选项 2', 'Option 3': '选项 3',
  'Option 4': '选项 4', 'Option 5': '选项 5', 'Option 6': '选项 6',
  '6-digit code': '6 位验证码',
  'Add new interest...': '添加兴趣…', 'e.g. Photography': '例如：摄影',
  'The Scholar': '你的昵称', 'Given name (名)': '名', 'Family name (姓)': '姓',
  'Anything else to help matching...': '还有什么想让匹配知道的…',
  'Tell us what happened...': '告诉我们发生了什么…',
  'Email or phone for follow-up': '便于回访的邮箱或电话',
  'A short line about you': '一句话介绍自己',
  'Enter your current password': '输入当前密码', 'At least 8 characters': '至少 8 位',
};

// ── 资料元数据中文显示映射（学校/城市/专业/国籍/年级）──
// 值一律存英文原文（后端/库不变），仅显示层翻译；不进全局词典，
// 避免 London 之类短词把用户帖子/简介里的同名文本误翻。
const META_ZH = {
  // 大学（与 api metadata seed uk_universities.json 对齐）
  'University of Oxford': '牛津大学', 'University of Cambridge': '剑桥大学',
  'Imperial College London': '帝国理工学院', 'University College London': '伦敦大学学院',
  'London School of Economics': '伦敦政治经济学院', 'University of Edinburgh': '爱丁堡大学',
  "King's College London": '伦敦国王学院', 'University of Manchester': '曼彻斯特大学',
  'University of Bristol': '布里斯托大学', 'University of Warwick': '华威大学',
  'University of Glasgow': '格拉斯哥大学', 'Durham University': '杜伦大学',
  'University of Leeds': '利兹大学', 'University of Nottingham': '诺丁汉大学',
  'University of Birmingham': '伯明翰大学', 'University of Southampton': '南安普顿大学',
  'University of York': '约克大学', 'University of Leicester': '莱斯特大学',
  'Newcastle University': '纽卡斯尔大学', 'University of Sheffield': '谢菲尔德大学',
  'Cardiff University': '卡迪夫大学', 'University of Liverpool': '利物浦大学',
  'University of Exeter': '埃克塞特大学', "Queen's University Belfast": '贝尔法斯特女王大学',
  'University of Bath': '巴斯大学', 'Loughborough University': '拉夫堡大学',
  'Lancaster University': '兰卡斯特大学', 'University of Surrey': '萨里大学',
  'University of Reading': '雷丁大学', 'Brunel University London': '伦敦布鲁内尔大学',
  'City, University of London': '伦敦城市大学', 'Royal Holloway, University of London': '伦敦大学皇家霍洛威学院',
  'University of East Anglia': '东英吉利大学', 'University of Kent': '肯特大学',
  'University of Essex': '埃塞克斯大学', 'University of Sussex': '萨塞克斯大学',
  'Swansea University': '斯旺西大学', 'University of Aberdeen': '阿伯丁大学',
  'Heriot-Watt University': '赫瑞瓦特大学', 'University of Stirling': '斯特灵大学',
  'University of Strathclyde': '思克莱德大学', 'Queen Mary University of London': '伦敦玛丽女王大学',
  'SOAS University of London': '伦敦大学亚非学院', 'University of Westminster': '威斯敏斯特大学',
  'Goldsmiths, University of London': '伦敦大学金史密斯学院', 'Birkbeck, University of London': '伦敦大学伯贝克学院',
  'Middlesex University': '密德萨斯大学', 'University of Hertfordshire': '赫特福德郡大学',
  'University of Greenwich': '格林威治大学', 'Kingston University': '金斯顿大学',
  'Oxford Brookes University': '牛津布鲁克斯大学', 'University of Lincoln': '林肯大学',
  'University of Hull': '赫尔大学', 'Keele University': '基尔大学',
  'Aston University': '阿斯顿大学', 'Bangor University': '班戈大学',
  'University of Ulster': '阿尔斯特大学', 'University of the West of England': '西英格兰大学',
  'Northumbria University': '诺森比亚大学', 'Coventry University': '考文垂大学',
  'De Montfort University': '德蒙福特大学', 'University of Derby': '德比大学',
  'University of Central Lancashire': '中央兰开夏大学', 'Manchester Metropolitan University': '曼彻斯特城市大学',
  'Sheffield Hallam University': '谢菲尔德哈勒姆大学', 'Leeds Beckett University': '利兹贝克特大学',
  'Birmingham City University': '伯明翰城市大学', 'Nottingham Trent University': '诺丁汉特伦特大学',
  'Edinburgh Napier University': '爱丁堡龙比亚大学', 'Glasgow Caledonian University': '格拉斯哥卡利多尼亚大学',
  'Robert Gordon University': '罗伯特戈登大学', 'University of Portsmouth': '朴茨茅斯大学',
  'University of Brighton': '布莱顿大学', 'Anglia Ruskin University': '安格利亚鲁斯金大学',
  'University of Bedfordshire': '贝德福德郡大学', 'University of the Arts London': '伦敦艺术大学',
  'Liverpool John Moores University': '利物浦约翰摩尔斯大学', 'London Metropolitan University': '伦敦都会大学',
  // 城市（uk_cities.json）
  London: '伦敦', Manchester: '曼彻斯特', Birmingham: '伯明翰', Leeds: '利兹',
  Glasgow: '格拉斯哥', Liverpool: '利物浦', Bristol: '布里斯托', Sheffield: '谢菲尔德',
  Edinburgh: '爱丁堡', Cardiff: '卡迪夫', 'Newcastle upon Tyne': '纽卡斯尔',
  Nottingham: '诺丁汉', Leicester: '莱斯特', Southampton: '南安普顿', Oxford: '牛津',
  Cambridge: '剑桥', Brighton: '布莱顿', Bath: '巴斯', York: '约克', Durham: '杜伦',
  Coventry: '考文垂', Exeter: '埃克塞特', Reading: '雷丁', Plymouth: '普利茅斯',
  Aberdeen: '阿伯丁', Swansea: '斯旺西', Belfast: '贝尔法斯特', Derby: '德比',
  Wolverhampton: '伍尔弗汉普顿', Norwich: '诺里奇', 'Milton Keynes': '米尔顿凯恩斯',
  Luton: '卢顿', Huddersfield: '哈德斯菲尔德', Bradford: '布拉德福德', Preston: '普雷斯顿',
  Portsmouth: '朴茨茅斯', Blackpool: '布莱克浦', Middlesbrough: '米德尔斯伯勒',
  Sunderland: '桑德兰', 'Stoke-on-Trent': '特伦特河畔斯托克', Peterborough: '彼得伯勒',
  Bournemouth: '伯恩茅斯', Colchester: '科尔切斯特', 'Southend-on-Sea': '滨海绍森德',
  Ipswich: '伊普斯维奇', Northampton: '北安普顿', Warrington: '沃灵顿',
  Gloucester: '格洛斯特', Worcester: '伍斯特', Salisbury: '索尔兹伯里',
  // 专业（uk_majors.json）
  'Computer Science': '计算机科学', 'Software Engineering': '软件工程', 'Data Science': '数据科学',
  'Artificial Intelligence': '人工智能', Cybersecurity: '网络安全', 'Information Technology': '信息技术',
  Mathematics: '数学', Statistics: '统计学', Physics: '物理学', Chemistry: '化学',
  Biology: '生物学', Biochemistry: '生物化学', Neuroscience: '神经科学',
  'Environmental Science': '环境科学', 'Medicine (MBBS)': '医学 (MBBS)', Dentistry: '牙医学',
  Pharmacy: '药学', Nursing: '护理学', Psychology: '心理学', 'Law (LLB)': '法学 (LLB)',
  'Business Administration': '工商管理', Economics: '经济学', Finance: '金融学',
  Accounting: '会计学', Marketing: '市场营销', Management: '管理学',
  'Human Resource Management': '人力资源管理', 'International Business': '国际商务',
  'Civil Engineering': '土木工程', 'Mechanical Engineering': '机械工程',
  'Electrical and Electronic Engineering': '电子电气工程', 'Chemical Engineering': '化学工程',
  'Aerospace Engineering': '航空航天工程', Architecture: '建筑学', 'Urban Planning': '城市规划',
  History: '历史学', 'English Literature': '英语文学', Linguistics: '语言学', Philosophy: '哲学',
  Sociology: '社会学', 'Political Science': '政治学', 'International Relations': '国际关系',
  Anthropology: '人类学', Geography: '地理学', 'Art and Design': '艺术与设计',
  'Graphic Design': '平面设计', 'Fashion Design': '服装设计', 'Film and Television Studies': '影视研究',
  Music: '音乐', 'Drama and Theatre': '戏剧', Education: '教育学', 'Social Work': '社会工作',
  Journalism: '新闻学', 'Media Studies': '传媒研究', 'Sport Science': '运动科学',
  Nutrition: '营养学', 'Public Health': '公共卫生', 'Biomedical Science': '生物医学',
  Genetics: '遗传学', 'Marine Biology': '海洋生物学', Ecology: '生态学',
  Astrophysics: '天体物理学', 'Materials Science': '材料科学', Robotics: '机器人学',
  'Game Design': '游戏设计', 'Digital Marketing': '数字营销', 'Supply Chain Management': '供应链管理',
  // 国籍（metadata.service getCommonNationalities）
  British: '英国', Chinese: '中国', Indian: '印度', American: '美国', Canadian: '加拿大',
  Australian: '澳大利亚', German: '德国', French: '法国', Italian: '意大利', Spanish: '西班牙',
  Portuguese: '葡萄牙', Polish: '波兰', Romanian: '罗马尼亚', Ukrainian: '乌克兰', Turkish: '土耳其',
  Nigerian: '尼日利亚', Ghanaian: '加纳', Pakistani: '巴基斯坦', Bangladeshi: '孟加拉国',
  'Sri Lankan': '斯里兰卡', Nepalese: '尼泊尔', Malaysian: '马来西亚', Singaporean: '新加坡',
  'Hong Kongese': '中国香港', Taiwanese: '中国台湾', Japanese: '日本', Korean: '韩国',
  Vietnamese: '越南', Thai: '泰国', Indonesian: '印度尼西亚', Brazilian: '巴西',
  Mexican: '墨西哥', Colombian: '哥伦比亚', Argentinian: '阿根廷', Egyptian: '埃及',
  'Saudi Arabian': '沙特阿拉伯', Iranian: '伊朗', Iraqi: '伊拉克', Israeli: '以色列',
  // 年级（H5 GRADE_OPTIONS，英文为库内规范值）
  // 学业阶段（GRADE_OPTIONS，含预科的 10 档）
  Foundation: '预科',
  'Year 1': '大一', 'Year 2': '大二', 'Year 3': '大三', 'Year 4': '大四',
  "Master's": '硕士',
  'PhD Year 1': '博士一年级', 'PhD Year 2': '博士二年级',
  'PhD Year 3': '博士三年级', 'PhD Year 4+': '博士四年级及以上',
  // 历史值（库里可能仍有，下拉会原样保留为可选项）
  Freshman: '大一新生', Postgraduate: '硕士', Doctorate: '博士',
  // Undergraduate/Other/Nationality 的 zh 显示与全局词典一致，这里不重复
};
// 元数据显示翻译：中文态查映射，命不中或英文态原样返回。值不变，仅显示层。
function metaLabel(v) {
  if (!v) return v;
  if (getLang() !== 'zh') return v;
  return META_ZH[v] || ZH[v] || v;
}
window.metaLabel = metaLabel;

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
    translatePlaceholders(root);
  } catch (e) {}
}

// 输入框占位符翻译（属性不在文本节点机制内，单独处理）
function translatePlaceholders(root) {
  if (!root.querySelectorAll) return;
  const els = [...root.querySelectorAll('input[placeholder], textarea[placeholder]')];
  if (root.nodeType === 1 && root.hasAttribute('placeholder')) els.push(root);
  els.forEach((el) => {
    if (isInNoI18n(el)) return;
    const p = el.getAttribute('placeholder');
    if (p && ZH_PLACEHOLDER[p]) el.setAttribute('placeholder', ZH_PLACEHOLDER[p]);
  });
}
// 动态改写占位符后需要重新翻一次（观察器只看新增节点，改属性不触发）
window.translatePlaceholders = (root) => { if (getLang() === 'zh') translatePlaceholders(root || document.body); };

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

// 语言切换确认弹窗（用户反馈：要有确定按钮，不再点击即切）
function openLangDialog() {
  const cur = getLang();
  let sel = cur;
  const zhUI = cur === 'zh';
  const back = document.createElement('div');
  back.className = 'fixed inset-0 z-[999] bg-black/40 backdrop-blur-[2px] flex items-center justify-center px-8';
  const opt = (val, label) =>
    '<button data-lang-opt="' + val + '" class="w-full flex items-center justify-between px-4 py-3.5 rounded-[12px] border transition-all ' +
    (val === sel ? 'border-neon bg-neon/10' : 'border-outline-variant/50') + '">' +
    '<span class="font-headline font-bold text-sm">' + label + '</span>' +
    '<span class="material-symbols-outlined lang-check text-neon ' + (val === sel ? '' : 'opacity-0') + '" style="font-variation-settings:\'FILL\' 1;font-size:20px">check_circle</span></button>';
  back.innerHTML =
    '<div class="w-full max-w-xs bg-surface rounded-[16px] shadow-2xl p-6" data-no-i18n>' +
    '<h3 class="font-headline font-extrabold text-lg tracking-tight text-on-surface mb-4">' + (zhUI ? '语言 / Language' : 'Language / 语言') + '</h3>' +
    '<div class="space-y-2 mb-6">' + opt('zh', '中文') + opt('en', 'English') + '</div>' +
    '<div class="flex gap-3">' +
    '<button data-lang-cancel class="flex-1 py-3 rounded-full border border-outline-variant font-headline text-xs font-bold tracking-widest text-on-surface-variant active:scale-95">' + (zhUI ? '取消' : 'Cancel') + '</button>' +
    '<button data-lang-ok class="flex-1 py-3 rounded-full bg-neon text-black font-headline text-xs font-bold tracking-widest active:scale-95">' + (zhUI ? '确定' : 'Confirm') + '</button>' +
    '</div></div>';
  document.body.appendChild(back);
  const paint = () => back.querySelectorAll('[data-lang-opt]').forEach((b) => {
    const on = b.dataset.langOpt === sel;
    b.className = 'w-full flex items-center justify-between px-4 py-3.5 rounded-[12px] border transition-all ' + (on ? 'border-neon bg-neon/10' : 'border-outline-variant/50');
    b.querySelector('.lang-check').classList.toggle('opacity-0', !on);
  });
  back.addEventListener('click', (e) => {
    const optBtn = e.target.closest('[data-lang-opt]');
    if (optBtn) { sel = optBtn.dataset.langOpt; paint(); return; }
    if (e.target.closest('[data-lang-cancel]') || e.target === back) { back.remove(); return; }
    if (e.target.closest('[data-lang-ok]')) {
      back.remove();
      if (sel !== cur) {
        try { localStorage.setItem(LANG_KEY, sel); } catch (err) {}
        window.location.reload();
      }
    }
  });
}
window.openLangDialog = openLangDialog;
window.getLang = getLang;

// boot
applyTheme(getTheme());
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startI18n);
} else {
  startI18n();
}
