/* Unimatcha 官网子页共享脚本：语言切换(um_lang，与 index 共用)、汉堡菜单、reveal、FAQ 手风琴 */
(function(){
  var LANG = localStorage.getItem('um_lang') || 'en';
  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/api/v1' : 'https://api.unimatcha.ai/api/v1';

  function applyLang(l){
    LANG = l;
    document.documentElement.lang = l;
    localStorage.setItem('um_lang', l);
    document.querySelectorAll('[data-zh]').forEach(function(el){
      el.textContent = l === 'zh' ? el.getAttribute('data-zh') : el.getAttribute('data-en');
    });
    document.querySelectorAll('[data-zh-ph]').forEach(function(el){
      el.placeholder = l === 'zh' ? el.getAttribute('data-zh-ph') : el.getAttribute('data-en-ph');
    });
    var label = document.getElementById('langLabel');
    if (label) label.textContent = (l === 'zh' ? 'EN' : '中');
    var b = document.body;
    if (b.getAttribute('data-title-zh')) {
      document.title = l === 'zh' ? b.getAttribute('data-title-zh') : b.getAttribute('data-title-en');
    }
  }
  var langBtn = document.getElementById('langBtn');
  if (langBtn) langBtn.addEventListener('click', function(){ applyLang(LANG === 'zh' ? 'en' : 'zh'); });
  applyLang(LANG);

  var burger = document.getElementById('burger');
  var mob = document.getElementById('mobmenu');
  if (burger && mob) burger.addEventListener('click', function(){ mob.classList.toggle('open'); });

  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });

  document.querySelectorAll('.faq-q').forEach(function(q){
    q.addEventListener('click', function(){
      var item = q.closest('.faq-item');
      var a = item.querySelector('.faq-a');
      var open = item.classList.toggle('open');
      a.style.maxHeight = open ? a.scrollHeight + 'px' : '0';
    });
  });

  /* console mockup tabs（sponsors 页） */
  document.querySelectorAll('.console-tabs button').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.console-tabs button').forEach(function(b){ b.classList.remove('on'); });
      document.querySelectorAll('.console-view').forEach(function(v){ v.classList.remove('on'); });
      btn.classList.add('on');
      document.getElementById(btn.getAttribute('data-view')).classList.add('on');
    });
  });

  /* 赞助申请表单（sponsors 页）→ POST /public/sponsor-application，失败回退 mailto */
  var sf = document.getElementById('sponsorForm');
  if (sf) sf.addEventListener('submit', function(e){
    e.preventDefault();
    var org = document.getElementById('spOrg').value.trim();
    var email = document.getElementById('spEmail').value.trim();
    var msg = document.getElementById('spMsg').value.trim();
    if (!org || !email) return;
    var btn = sf.querySelector('button[type=submit]');
    btn.disabled = true;
    fetch(API_BASE + '/public/sponsor-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, organization: org, message: msg || undefined, locale: LANG }),
      signal: AbortSignal.timeout(6000)
    }).then(function(r){
      if (!r.ok) throw new Error('bad status');
      sf.hidden = true;
      document.getElementById('sponsorOk').hidden = false;
    }).catch(function(){
      btn.disabled = false;
      location.href = 'mailto:contact@unimatcha.ai?subject=' +
        encodeURIComponent(LANG === 'zh' ? '赞助申请 · ' + org : 'Sponsorship Application · ' + org) +
        '&body=' + encodeURIComponent(msg + '\n\n' + email);
    });
  });

  /* 活数据（about 页统计带等）：元素带 data-live-stat=users|matches|schools|rounds */
  var liveEls = document.querySelectorAll('[data-live-stat]');
  if (liveEls.length) {
    fetch(API_BASE + '/public/site-stats', { signal: AbortSignal.timeout(5000) })
      .then(function(r){ return r.json(); })
      .then(function(j){
        var d = j && j.data; if (!d) return;
        var map = { users: d.users, matches: d.matches, schools: d.schools, rounds: d.roundsCompleted };
        liveEls.forEach(function(el){
          var v = map[el.getAttribute('data-live-stat')];
          if (v != null) el.textContent = Number(v).toLocaleString('en-US') + (el.getAttribute('data-suffix') || '');
        });
      }).catch(function(){ /* API 不可达：保留静态回退值 */ });
  }

  /* FAQ 分类筛选（faq 页）：点哪个分类只显示哪个，不全列；搜索时跨全部分类过滤 */
  var sideLinks = document.querySelectorAll('.faq-side a');
  var faqGroups = document.querySelectorAll('.faq-group[id]');
  var fs = document.getElementById('faqSearch');
  var activeGroup = null;

  function showGroup(id){
    activeGroup = id;
    faqGroups.forEach(function(g){ g.style.display = (g.id === id) ? '' : 'none'; });
    document.querySelectorAll('.faq-item').forEach(function(i){ i.style.display = ''; });
    sideLinks.forEach(function(a){ a.classList.toggle('on', a.getAttribute('href') === '#' + id); });
    if (fs) fs.value = '';
  }

  if (sideLinks.length && faqGroups.length) {
    sideLinks.forEach(function(a){
      a.addEventListener('click', function(e){
        e.preventDefault();
        showGroup(a.getAttribute('href').slice(1));
        history.replaceState(null, '', a.getAttribute('href'));
      });
    });
    /* 深链（如 faq.html#g-energy）直达对应分类，否则默认第一类 */
    var hash = location.hash.slice(1);
    var valid = [].slice.call(faqGroups).some(function(g){ return g.id === hash; });
    showGroup(valid ? hash : sideLinks[0].getAttribute('href').slice(1));
  }

  /* 搜索语料：中英文案同时索引（data-zh/data-en 原始文案 + 已渲染文本），与当前显示语言无关 */
  function itemHaystack(item){
    if (!item.__hay) {
      var parts = [item.textContent];
      item.querySelectorAll('[data-zh]').forEach(function(el){
        parts.push(el.getAttribute('data-zh') || '', el.getAttribute('data-en') || '');
      });
      item.__hay = parts.join(' ').toLowerCase();
    }
    return item.__hay;
  }
  if (fs) fs.addEventListener('input', function(){
    var kw = fs.value.trim().toLowerCase();
    if (!kw) { if (activeGroup) showGroup(activeGroup); return; }
    /* 搜索：跨全部分类，只显示命中的问题及其所属分类 */
    faqGroups.forEach(function(g){
      var any = false;
      g.querySelectorAll('.faq-item').forEach(function(item){
        var hit = itemHaystack(item).indexOf(kw) >= 0;
        item.style.display = hit ? '' : 'none';
        if (hit) any = true;
      });
      g.style.display = any ? '' : 'none';
    });
    sideLinks.forEach(function(a){ a.classList.remove('on'); });
  });
})();
