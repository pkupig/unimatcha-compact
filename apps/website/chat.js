/* Unimatcha 官网智能客服（纯前端自动回复，自包含：自注样式+DOM，所有页面一行引入）
   语言跟随 localStorage.um_lang（与站点语言切换联动，监听 <html lang> 变化）。 */
(function () {
  'use strict';

  /* ── 知识库：关键词 → 双语回答（可带链接） ───────────────────── */
  var KB = [
    { k: ['公布', '几点', '时间', '周五', '什么时候', 'reveal', 'when', 'friday', 'time'],
      zh: '匹配结果每周五 17:00 统一公布。加入本周匹配池后，算法会用一整周为你优化，到点一起揭晓。',
      en: 'Results are revealed every Friday at 17:00, all at once. Join the pool and the algorithm optimises for you all week.' },
    { k: ['恋人', '朋友', '区别', '模式', 'romantic', 'friend', 'mode', 'difference'],
      zh: '恋人模式为你匹配一位最合适的人；朋友模式一轮最多 5 位候选，逐个确认成为好友。两种模式的问卷和偏好是分开的。',
      en: 'Romantic mode matches you with one best-fit person; Friend mode offers up to 5 candidates per round. Questionnaires are separate per mode.' },
    { k: ['能量', '充值', '格', 'energy', 'cell', 'topup', 'top up', 'pay'],
      zh: '能量是应用内资源，用于开启增强匹配：恋人模式固定 3 格，朋友模式按你选的格数（1–5）。未匹配成功时预扣能量按规则退还。',
      en: 'Energy is an in-app resource for enhanced matching: 3 cells in Romantic mode, 1–5 chosen cells in Friend mode. Reserved energy is refunded per the rules if no match is made.',
      link: { href: 'faq.html#g-energy', zh: '查看能量相关问题 →', en: 'Energy FAQs →' } },
    { k: ['增强', 'enhanced', 'boost'],
      zh: '增强匹配会扩大候选范围并提高优先级，按轮次生效、每轮单独开启。它提高机会但不保证匹配；未匹配时能量自动退还。',
      en: 'Enhanced matching widens your candidate pool and raises priority, applied per round. It improves your odds but never guarantees a match; energy is auto-refunded otherwise.' },
    { k: ['匿名', '化名', '树洞', 'anonymous', 'pseudonym', 'anon'],
      zh: '匿名内容以随机化名展示，评论和点赞通知也用化名——包括楼主在内，没人能反推你是谁。但匿名不豁免审核，违规内容照样处理。',
      en: 'Anonymous content appears under a random pseudonym — no one, not even the post author, can trace it back to you. Moderation still applies though.',
      link: { href: 'safety.html', zh: '了解安全与信任 →', en: 'Safety & Trust →' } },
    { k: ['注销', '删除账号', '删号', 'delete account', 'deactivate'],
      zh: '可以随时在应用内「设置」申请注销，我们会在 30 天内删除你的个人信息（法律要求保留的除外）。',
      en: 'You can delete your account in Settings anytime; personal data is erased within 30 days (except legally required retention).' },
    { k: ['密码', '忘记', 'password', 'forgot'],
      zh: '在登录页点「忘记密码」按提示操作；遇到问题发邮件到 hello@unimatcha.com，我们帮你处理。',
      en: 'Use "Forgot Password" on the sign-in page, or email hello@unimatcha.com and we\'ll sort it out.' },
    { k: ['赞助', '学生会', '社团', '合作', 'sponsor', 'union', 'society', 'partner'],
      zh: '我们真金白银赞助学生会和社团：活动经费、周边、奖品、场地都可以谈，签约还送专属运营后台。在赞助计划页提交申请，一周内回复。',
      en: 'We sponsor student unions and societies with real budgets, merch, prizes and venues — plus a dedicated ops console. Apply on the Sponsorship page; we reply within a week.',
      link: { href: 'sponsors.html#apply', zh: '去申请赞助 →', en: 'Apply for sponsorship →' } },
    { k: ['广告', '投放', '商家', 'advertis', 'ad ', 'ads', 'merchant'],
      zh: '商家可以在抹茶按校园定向投放广告（支持包断/按展示/按点击多种计价），由投放学校的学生会先行审核。合作请邮件 hello@unimatcha.com。',
      en: 'Merchants can run campus-targeted ads (buyout / CPM / CPC), reviewed first by the campus student union. Email hello@unimatcha.com to talk.' },
    { k: ['下载', '上线', 'ios', 'android', 'app store', 'google play', '什么时候上', 'launch', 'download'],
      zh: 'iOS 与 Android 客户端正在打磨中。现在可以在首页加入候补名单，上线第一时间通知你。',
      en: 'iOS and Android apps are in the works. Join the waitlist on the homepage and we\'ll email you at launch.',
      link: { href: 'index.html#getapp', zh: '加入候补名单 →', en: 'Join the waitlist →' } },
    { k: ['举报', '骚扰', '不良', 'report', 'harass', 'abuse'],
      zh: '帖子、评论、用户资料都可以在应用内一键举报：本校学生会先审、平台复核，结果会通知你。紧急情况直接邮件 hello@unimatcha.com，安全类邮件优先处理。',
      en: 'Report posts, comments or profiles in one tap — union review first, platform double-check, and you get the outcome. Emergencies: hello@unimatcha.com (prioritised).' },
    { k: ['隐私', '数据', '安全吗', 'privacy', 'data', 'safe'],
      zh: '数据 TLS 加密传输、不出售给任何第三方、注销 30 天内删除，而且我们从不显示「匹配分数」。',
      en: 'TLS-encrypted, never sold, erased within 30 days of deletion — and we never show a "match score".',
      link: { href: 'privacy.html', zh: '阅读隐私协议 →', en: 'Read the Privacy Policy →' } },
    { k: ['学校', '覆盖', '支持哪些', 'school', 'campus', 'universit', 'which'],
      zh: '首批覆盖英国、美国、欧洲等地的高校并持续新增。用你的校园邮箱注册即可确认你的学校是否已支持。',
      en: 'We cover universities across the UK, US and Europe, with more added continuously. Register with your university email to check yours.' },
    { k: ['没匹配', '匹配不到', '失败', 'no match', "didn't match", 'not matched'],
      zh: '很正常——我们宁缺毋滥。下一轮重新加入即可；开了增强的话，预扣能量会按规则退还。',
      en: 'It happens — we\'d rather match nobody than the wrong body. Just join the next round; reserved energy is refunded per the rules.' },
    { k: ['问卷', '50', 'questionnaire'],
      zh: '进入匹配前需要完成对应模式的问卷（恋人模式是 50 道灵魂题）。答得越真实，匹配越精准。',
      en: 'Complete the mode\'s questionnaire before matching (50 soul-searching questions for Romantic mode). The more honest, the better the match.' },
    { k: ['分数', '打分', 'score'],
      zh: '我们从不给人打分，也不向任何人展示所谓「匹配分」——展示的是你们为什么合适的理由。',
      en: 'We never score people or show a "match score" — only the reasons you fit.' },
    { k: ['人工', '客服', '联系', '邮箱', 'human', 'contact', 'email', 'support'],
      zh: '人工支持请邮件 hello@unimatcha.com，7 个工作日内回复（安全类优先）。',
      en: 'For a human, email hello@unimatcha.com — we reply within 7 working days (safety mail prioritised).' }
  ];

  var TXT = {
    zh: { title: '抹茶小助手', sub: '自动回复 · 即时在线', ph: '输入你的问题…', send: '发送',
      hello: '你好呀！我是抹茶小助手 🍵 匹配、能量、匿名、赞助……有问题尽管问。',
      fallback: '这个问题我还答不好 😳 可以换个问法，或看看下面这些：',
      chips: ['周五几点公布结果？', '能量是什么？', '匿名安全吗？', '如何申请赞助？'],
      more: '完整问题列表在帮助中心 →', mail: '联系人工：hello@unimatcha.com' },
    en: { title: 'Matcha Assistant', sub: 'Auto-reply · online', ph: 'Type your question…', send: 'Send',
      hello: 'Hi! I\'m the Matcha assistant 🍵 Ask me about matching, energy, anonymity, sponsorship — anything.',
      fallback: 'I don\'t have a good answer for that yet 😳 Try rephrasing, or pick one below:',
      chips: ['When are results revealed?', 'What is Energy?', 'Is anonymity safe?', 'How to get sponsored?'],
      more: 'Full list in the Help Center →', mail: 'Human support: hello@unimatcha.com' }
  };

  var lang = function () { return (document.documentElement.lang === 'en') ? 'en' : 'zh'; };

  /* ── 样式 ───────────────────────────────────────────────── */
  var css = ''
    + '.mchat-fab{position:fixed;right:20px;bottom:20px;z-index:9000;width:56px;height:56px;border-radius:50%;background:#CCFF00;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 14px 34px -10px rgba(140,170,0,.7);transition:transform .25s cubic-bezier(.22,.61,.36,1)}'
    + '.mchat-fab:hover{transform:translateY(-3px) scale(1.04)}'
    + '.mchat-fab svg{width:26px;height:26px}'
    + '.mchat-fab .dot{position:absolute;top:4px;right:4px;width:11px;height:11px;border-radius:50%;background:#0a0a0a;border:2px solid #CCFF00}'
    + '.mchat{position:fixed;right:20px;bottom:88px;z-index:9001;width:min(370px,calc(100vw - 28px));height:min(540px,calc(100vh - 120px));background:#fff;border:1px solid #D6D6D2;border-radius:18px;box-shadow:0 40px 90px -30px rgba(10,10,10,.45);display:none;flex-direction:column;overflow:hidden;font-family:"Plus Jakarta Sans",system-ui,sans-serif}'
    + '.mchat.open{display:flex}'
    + '.mchat-h{background:#0a0a0a;color:#fff;padding:14px 18px;display:flex;align-items:center;gap:11px}'
    + '.mchat-h .av{width:34px;height:34px;border-radius:50%;background:#CCFF00;display:flex;align-items:center;justify-content:center;font-size:17px;flex:none}'
    + '.mchat-h b{font-size:14px;display:block;line-height:1.3}'
    + '.mchat-h small{font-size:10.5px;color:#9c9c96;display:flex;align-items:center;gap:5px}'
    + '.mchat-h small i{width:6px;height:6px;border-radius:50%;background:#CCFF00;display:inline-block}'
    + '.mchat-h .x{margin-left:auto;background:none;border:0;color:#9c9c96;cursor:pointer;font-size:20px;line-height:1;padding:4px}'
    + '.mchat-b{flex:1;overflow-y:auto;padding:16px 14px;background:#F5F5F4;display:flex;flex-direction:column;gap:10px}'
    + '.mchat-m{max-width:82%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word}'
    + '.mchat-m.bot{background:#fff;border:1px solid #e7e7e3;border-bottom-left-radius:4px;align-self:flex-start;color:#1b1b1b}'
    + '.mchat-m.user{background:#0a0a0a;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}'
    + '.mchat-m a{color:#7a9900;font-weight:700;text-decoration:underline;text-underline-offset:2px}'
    + '.mchat-typing{align-self:flex-start;background:#fff;border:1px solid #e7e7e3;border-radius:14px;border-bottom-left-radius:4px;padding:12px 16px;display:flex;gap:4px}'
    + '.mchat-typing i{width:6px;height:6px;border-radius:50%;background:#b9b9b2;animation:mchatB 1s ease-in-out infinite}'
    + '.mchat-typing i:nth-child(2){animation-delay:.15s}.mchat-typing i:nth-child(3){animation-delay:.3s}'
    + '@keyframes mchatB{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}'
    + '.mchat-chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 14px 10px;background:#F5F5F4}'
    + '.mchat-chip{border:1px solid #D6D6D2;background:#fff;border-radius:999px;padding:7px 13px;font-size:12px;font-weight:600;color:#333;cursor:pointer;font-family:inherit;transition:.2s}'
    + '.mchat-chip:hover{border-color:#B8E600;background:#EEFFA8}'
    + '.mchat-f{display:flex;gap:8px;padding:12px;border-top:1px solid #ececea;background:#fff}'
    + '.mchat-f input{flex:1;border:1px solid #D6D6D2;border-radius:999px;padding:11px 16px;font-size:13px;outline:none;font-family:inherit;color:#1b1b1b}'
    + '.mchat-f input:focus{border-color:#B8E600}'
    + '.mchat-f button{background:#CCFF00;color:#0a0a0a;border:0;border-radius:999px;padding:0 18px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit}'
    + '@media(max-width:560px){.mchat{right:14px;bottom:82px}.mchat-fab{right:14px;bottom:14px;width:52px;height:52px}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ── DOM ───────────────────────────────────────────────── */
  var fab = document.createElement('button');
  fab.className = 'mchat-fab'; fab.type = 'button'; fab.setAttribute('aria-label', '在线客服');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4c-1.2 0-2.4-.2-3.4-.7L3 21l1.8-4.6A8.4 8.4 0 1 1 21 11.5z"/></svg><span class="dot"></span>';
  var panel = document.createElement('div');
  panel.className = 'mchat';
  panel.innerHTML = ''
    + '<div class="mchat-h"><span class="av">🍵</span><div><b id="mchatTitle"></b><small><i></i><span id="mchatSub"></span></small></div><button class="x" type="button" aria-label="关闭">×</button></div>'
    + '<div class="mchat-b" id="mchatBody"></div>'
    + '<div class="mchat-chips" id="mchatChips"></div>'
    + '<form class="mchat-f" id="mchatForm"><input id="mchatInput" autocomplete="off" /><button type="submit" id="mchatSend"></button></form>';
  document.body.appendChild(fab); document.body.appendChild(panel);

  var body = panel.querySelector('#mchatBody');
  var chipsEl = panel.querySelector('#mchatChips');
  var input = panel.querySelector('#mchatInput');
  var greeted = false;

  function applyTexts() {
    var t = TXT[lang()];
    panel.querySelector('#mchatTitle').textContent = t.title;
    panel.querySelector('#mchatSub').textContent = t.sub;
    panel.querySelector('#mchatSend').textContent = t.send;
    input.placeholder = t.ph;
    chipsEl.innerHTML = '';
    t.chips.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'mchat-chip'; b.type = 'button'; b.textContent = c;
      b.addEventListener('click', function () { ask(c); });
      chipsEl.appendChild(b);
    });
  }

  function bubble(cls, html) {
    var m = document.createElement('div');
    m.className = 'mchat-m ' + cls;
    m.innerHTML = html;
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
  }
  var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  function answer(q) {
    var l = lang(), s = q.toLowerCase();
    var best = null, bestScore = 0;
    KB.forEach(function (item) {
      var score = 0;
      item.k.forEach(function (kw) { if (s.indexOf(kw.toLowerCase()) >= 0) score += kw.length >= 2 ? 2 : 1; });
      if (score > bestScore) { bestScore = score; best = item; }
    });
    if (best && bestScore >= 2) {
      var html = esc(best[l]);
      if (best.link) html += '<br><a href="' + best.link.href + '">' + esc(best.link[l]) + '</a>';
      return html;
    }
    var t = TXT[l];
    return esc(t.fallback) + '<br><a href="faq.html">' + esc(t.more) + '</a><br><a href="mailto:hello@unimatcha.com">' + esc(t.mail) + '</a>';
  }

  function ask(q) {
    if (!q.trim()) return;
    bubble('user', esc(q));
    input.value = '';
    var typing = document.createElement('div');
    typing.className = 'mchat-typing'; typing.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(typing); body.scrollTop = body.scrollHeight;
    setTimeout(function () {
      typing.remove();
      bubble('bot', answer(q));
    }, 550 + Math.random() * 400);
  }

  fab.addEventListener('click', function () {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      applyTexts();
      if (!greeted) { greeted = true; bubble('bot', esc(TXT[lang()].hello)); }
      input.focus();
    }
  });
  panel.querySelector('.x').addEventListener('click', function () { panel.classList.remove('open'); });
  panel.querySelector('#mchatForm').addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });

  /* 语言切换联动（站点切换会改 <html lang>） */
  new MutationObserver(function () { if (panel.classList.contains('open')) applyTexts(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
