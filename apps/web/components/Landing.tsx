// @ts-nocheck
'use client';
import { useEffect, useRef } from 'react';
import Lenis from '@studio-freight/lenis';

const MARKUP = String.raw`<div class="progress" id="progress"></div>

<!-- nav -->
<header id="hdr">
  <nav class="nav">
    <div class="brand"><span class="blip"></span>UNIMATCHA</div>
    <div class="navlinks">
      <a href="#features" data-i18n="nav.features">功能</a>
      <a href="#wall" data-i18n="feat.wall.t">校园墙</a>
      <a href="#reviews" data-i18n="nav.reviews">评价</a>
      <a href="#partners" data-i18n="nav.partners">合作伙伴</a>
    </div>
    <div class="nav-cta">
      <button class="lang" id="langBtn"><span class="material-symbols-rounded">translate</span><span id="langLabel">EN</span></button>
      <a class="btn btn-neon" href="#getapp"><span data-i18n="nav.cta">进入应用</span><span class="material-symbols-rounded">arrow_forward</span></a>
    </div>
  </nav>
</header>

<!-- hero -->
<section class="hero">
  <div class="pfield" data-particles="18" aria-hidden="true"></div>
  <div class="wrap">
    <div class="hero-grid">
      <div class="h-left">
        <div class="h-top">
          <div class="eyebrow"><span class="dot"></span><span data-i18n="hero.eyebrow">大学生 · 校园生活平台</span></div>
          <h1 class="title" style="margin-top:24px" data-i18n-html="hero.title">点亮你的<br><span class="mark"><span>校园生活</span></span>。</h1>
          <p class="lede" data-i18n-html="hero.lede">抹茶是为大学生打造的校园生活平台：认真的<b>匹配</b>，真实的<b>校园墙</b>，让每一段校园缘分都被认真对待。</p>
        </div>
        <div class="hero-cta">
          <a class="btn btn-neon btn-lg" href="#getapp"><span data-i18n="hero.cta1">立即开始</span><span class="material-symbols-rounded">arrow_forward</span></a>
          <a class="btn btn-ghost btn-lg" href="#features" data-i18n="hero.cta2">了解功能</a>
        </div>
      </div>
      <div class="h-right">
        <div class="globe-wrap"><canvas id="globe" aria-hidden="true"></canvas><div class="globe-tip" id="globe-tip"></div></div>
        <div class="hero-meta">
          <div class="hm"><div class="n" data-count="42137">0</div><div class="l" data-i18n="stat.users">在册用户</div></div>
          <div class="hm"><div class="n" data-count="8460">0</div><div class="l" data-i18n="stat.matches">成功配对</div></div>
          <div class="hm"><div class="n" data-count="32" data-suffix="+">0</div><div class="l" data-i18n="stat.campuses">覆盖院校</div></div>
        </div>
      </div>
    </div>
  </div>
  <div class="scrollcue"><span data-i18n="hero.scroll">下滑探索</span><span class="ln"></span></div>
</section>

<!-- stats band -->
<section class="bg-white">
  <div class="wrap" style="padding-top:0;padding-bottom:0">
    <div class="statband">
      <div class="st reveal"><div class="n" data-count="42137">0</div><div class="c" data-i18n="stat.users">在册用户</div></div>
      <div class="st reveal d1"><div class="n" data-count="8460">0</div><div class="c" data-i18n="stat.matches">成功配对</div></div>
      <div class="st reveal d2"><div class="n" data-count="32" data-suffix="+">0</div><div class="c" data-i18n="stat.campuses">覆盖院校</div></div>
      <div class="st reveal d3"><div class="n" data-count="118" data-suffix="+">0</div><div class="c" data-i18n="stat.rounds">已运行轮次</div></div>
    </div>
  </div>
</section>

<!-- features -->
<section class="sec showcase3 bg-ivory" id="features">
  <div class="wrap">
    <div class="show3-grid">
      <!-- left: description + live countdown -->
      <div class="show-text reveal l">
        <div class="st-top">
          <div class="eyebrow"><span class="dot"></span><span data-i18n="feat.match.eyebrow">核心功能 · 匹配</span><span class="show-idx">/ 01</span></div>
          <h2 data-i18n="feat.match.headline">认真的人，值得一次认真的匹配。</h2>
          <p data-i18n="feat.match.d2">每周五 17:00 统一公布。在这里，遇见对的那个人，也遇见同频的挚友。</p>
        </div>
        <div class="globe-chip" style="margin-top:30px">
          <div class="gc-top">
            <span class="live"><i></i><span data-i18n="hero.live">匹配进行中</span></span>
            <span id="roundTag">ROUND —</span>
          </div>
          <div class="gc-cd">
            <div class="gc-cell"><div class="v" data-cd="d">00</div><div class="k" data-i18n="cd.d">天</div></div>
            <div class="gc-sep">:</div>
            <div class="gc-cell"><div class="v" data-cd="h">00</div><div class="k" data-i18n="cd.h">时</div></div>
            <div class="gc-sep">:</div>
            <div class="gc-cell"><div class="v" data-cd="m">00</div><div class="k" data-i18n="cd.m">分</div></div>
            <div class="gc-sep">:</div>
            <div class="gc-cell"><div class="v" data-cd="s">00</div><div class="k" data-i18n="cd.s">秒</div></div>
          </div>
        </div>
      </div>
      <!-- center: phone only (bigger, thin bezel) -->
      <div class="show-center reveal">
        <div class="phone">
          <div class="screen">
            <!-- 替换为你的内容：图片 <img class="ph-media" src="你的图片.jpg" alt="">  或视频 <video class="ph-media" src="你的视频.mp4" autoplay muted loop playsinline></video> -->
            <div class="ph-placeholder">
              <span class="material-symbols-rounded">add_photo_alternate</span>
              <span data-i18n="ph.match">匹配界面 · 放置图片 / 视频</span>
            </div>
          </div>
        </div>
      </div>
      <!-- right: four steps as connected cards -->
      <div class="show-steps reveal r">
        <h3 data-i18n="how.head">四步，开启一段关系</h3>
        <div class="ss-timeline">
          <div class="ss-step"><div class="ss-n">1</div><div class="ss-card"><b data-i18n="how.s1.t">完善资料</b><span data-i18n="how.s1.d2">填写资料与问卷。</span></div></div>
          <div class="ss-step"><div class="ss-n">2</div><div class="ss-card"><b data-i18n="how.s2.t">加入匹配池</b><span data-i18n="how.s2.d2">一键加入本周匹配。</span></div></div>
          <div class="ss-step"><div class="ss-n">3</div><div class="ss-card"><b data-i18n="how.s3.t">等待一轮</b><span data-i18n="how.s3.d2">算法整周为你优化。</span></div></div>
          <div class="ss-step"><div class="ss-n">4</div><div class="ss-card"><b data-i18n="how.s4.t">周五 17:00 公布</b><span data-i18n="how.s4.d2">结果统一推送，解锁聊天。</span></div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- campus wall -->
<section class="sec showcase reverse" id="wall">
  <div class="wrap">
    <div class="show-grid">
      <div class="show-text reveal r">
        <div class="eyebrow"><span class="dot"></span><span data-i18n="feat.label">核心功能</span><span class="show-idx">/ 02</span></div>
        <h2 data-i18n="feat.wall.t">校园墙</h2>
        <p class="wall-lead" data-i18n="feat.wall.lead">两个你会天天打开它的理由——一面真实的校园墙，和一个可以匿名说话的角落。</p>

        <div class="wall-folder">
          <div class="wall-tabs" role="tablist" aria-label="校园墙">
            <button type="button" class="wall-tab is-active" role="tab" aria-selected="true" data-wtab="0">
              <span class="material-symbols-rounded" aria-hidden="true">forum</span>
              <span data-i18n="feat.wall.t">校园墙</span>
            </button>
            <button type="button" class="wall-tab" role="tab" aria-selected="false" data-wtab="1">
              <span class="material-symbols-rounded" aria-hidden="true">visibility_off</span>
              <span data-i18n="feat.card.anon.tab">匿名</span>
            </button>
          </div>
          <div class="wall-panel">
            <div class="wall-page is-active" data-wpage="0" role="tabpanel">
              <h3 class="wall-page-title" data-i18n="feat.card.wall.title">组织活动，讨论校园</h3>
              <p class="wall-page-desc" data-i18n="feat.card.wall.desc">发起线下活动、讨论校园话题、分享日常点滴、互相答疑解惑——以本校为中心，也能遇见跨校的有趣灵魂。</p>
              <a class="wall-explore" href="#getapp"><span data-i18n="feat.card.explore">了解更多</span><span class="material-symbols-rounded" aria-hidden="true">arrow_outward</span></a>
            </div>
            <div class="wall-page" data-wpage="1" role="tabpanel">
              <h3 class="wall-page-title" data-i18n="feat.card.anon.title">匿名发帖，自在表达</h3>
              <p class="wall-page-desc" data-i18n="feat.card.anon.desc">想说又不好意思署名？开启匿名身份发帖、评论、互动，把真实想法说出口，不暴露你是谁。</p>
              <a class="wall-explore" href="#getapp"><span data-i18n="feat.card.explore">了解更多</span><span class="material-symbols-rounded" aria-hidden="true">arrow_outward</span></a>
            </div>
          </div>
        </div>
      </div>
      <div class="show-phone reveal l">
        <div class="phone">
          <div class="screen">
            <!-- 替换为你的内容：图片 <img class="ph-media" src="你的图片.jpg" alt="">  或视频 <video class="ph-media" src="你的视频.mp4" autoplay muted loop playsinline></video> -->
            <div class="ph-placeholder">
              <span class="material-symbols-rounded">add_photo_alternate</span>
              <span data-i18n="ph.wall">校园墙界面 · 放置图片 / 视频</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- how it works -->
<section class="sec bg-stone" id="more">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow center"><span class="dot"></span><span data-i18n="more.label">待补充 · COMING SOON</span></div>
      <h2 data-i18n="more.head">这里展示其他内容</h2>
      <p data-i18n="more.sub">一个预留的内容区块，等你来填充。</p>
    </div>
    <!-- 在这里放你想展示的其他内容（图片 / 数据 / 功能介绍 / 视频…），替换下面的占位框 -->
    <div class="more-placeholder reveal d1">
      <span class="material-symbols-rounded">dashboard_customize</span>
      <span data-i18n="more.ph">在此展示其他内容</span>
    </div>
  </div>
</section>

<!-- reviews -->
<section class="sec bg-wash" id="reviews" style="overflow:hidden">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow"><span class="dot"></span><span data-i18n="rev.label">真实评价</span></div>
      <h2 data-i18n="rev.head">他们在这里，遇见了对的人</h2>
      <p data-i18n="rev.sub">来自不同院校的同学，讲述他们的故事。</p>
    </div>
  </div>
  <div class="rev-rows reveal" style="position:relative">
    <div class="rev-fade l"></div><div class="rev-fade r"></div>
    <div class="rev-track" id="revA"></div>
    <div class="rev-track rev2" id="revB"></div>
  </div>
</section>

<!-- get the app -->
<section class="getapp" id="getapp">
  <div class="ga-grid"></div>
  <div class="ga-ring"></div>
  <div class="wrap" style="position:relative;z-index:2;text-align:center">
    <div class="reveal"><span class="eyebrow ga-eyebrow"><span class="dot"></span><span data-i18n="ga.label">获取 App</span></span></div>
    <h2 class="ga-h reveal" data-i18n-html="ga.head">即将装进<br><em>你的口袋。</em></h2>
    <p class="ga-sub reveal d1" data-i18n="ga.sub">iOS 与 Android 预计 2026 春季上线。加入候补名单，抢先体验并解锁校园专属福利。</p>
    <div class="ga-badges reveal d1">
      <a class="ga-badge" href="#">
        <span class="ga-bi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.05 12.04c-.03-2.6 2.13-3.85 2.23-3.91-1.22-1.78-3.11-2.02-3.78-2.05-1.61-.16-3.14.94-3.96.94-.81 0-2.07-.92-3.4-.89-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.46 7.81 1.3 10.37.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.55 0 2 .83 3.36.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.7-1.04-2.73-4.13zM14.62 4.6c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-3 1.54-.66.76-1.24 1.98-1.08 3.15 1.14.09 2.31-.58 3.02-1.44z"/></svg></span>
        <div class="ga-bt"><small data-i18n="ga.ios.k">即将上线 APP STORE</small><b>App Store</b></div>
        <span class="ga-soon" data-i18n="ga.soon">敬请期待</span>
      </a>
      <a class="ga-badge" href="#">
        <span class="ga-bi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3l13 9-13 9V3z"/></svg></span>
        <div class="ga-bt"><small data-i18n="ga.gp.k">即将上线 GOOGLE PLAY</small><b>Google Play</b></div>
        <span class="ga-soon" data-i18n="ga.soon">敬请期待</span>
      </a>
    </div>
    <a class="ga-wait reveal d2" href="mailto:hello@unimatcha.com" data-i18n="ga.wait">→ 加入候补名单 · 抢先体验</a>
  </div>
</section>

<!-- partners -->
<section class="sec bg-warm" id="partners">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow"><span class="dot"></span><span data-i18n="par.label">合作伙伴</span></div>
      <h2 data-i18n="par.head">与校园社群，一起把缘分做大</h2>
      <p data-i18n="par.sub">我们与各院校学生会、社团及校园品牌合作，把更真诚的连接带进校园。</p>
    </div>
    <div class="logos reveal">
      <div class="logo">UCL</div><div class="logo">Imperial</div><div class="logo">LSE</div>
      <div class="logo">KCL</div><div class="logo">Oxford</div><div class="logo">Cambridge</div>
      <div class="logo">Edinburgh</div><div class="logo">Manchester</div><div class="logo">Warwick</div>
      <div class="logo">Bristol</div><div class="logo">Durham</div><div class="logo">Glasgow</div>
    </div>
    <div class="partner-cta reveal">
      <div class="pc-text">
        <h3 data-i18n-html="par.cta.head">想把抹茶带进你的校园？<br><em>和我们合作。</em></h3>
        <p data-i18n="par.cta.sub">无论你是学生会、社团还是校园品牌，我们都欢迎一起共创校园活动与专属福利。</p>
      </div>
      <a class="btn btn-neon btn-lg pc-btn" href="mailto:partner@unimatcha.com"><span data-i18n="par.cta.btn">成为合作伙伴</span><span class="material-symbols-rounded">arrow_forward</span></a>
    </div>
  </div>
</section>

<!-- epoch (dark) -->
<section class="epoch" id="epoch">
  <canvas id="ritcanvas" aria-hidden="true"></canvas>
  <div class="wrap">
    <div class="reveal">
      <div class="eyebrow"><span class="dot"></span><span data-i18n="epo.label">下一轮匹配 · NEXT ROUND</span></div>
      <h2 data-i18n-html="epo.head">每周五 17:00，<br><em>缘分统一结算。</em></h2>
    </div>
    <div class="big-cd reveal d1">
      <div class="bc"><div class="v" data-cd="d">00</div><div class="k" data-i18n="cd.days">天</div></div>
      <div class="bc"><div class="v" data-cd="h">00</div><div class="k" data-i18n="cd.hours">小时</div></div>
      <div class="bc"><div class="v" data-cd="m">00</div><div class="k" data-i18n="cd.mins">分钟</div></div>
      <div class="bc"><div class="v" data-cd="s">00</div><div class="k" data-i18n="cd.secs">秒</div></div>
    </div>
    <p class="sub reveal d1" data-i18n="epo.sub">所有人在同一时刻见证结果。这一周，好好准备你的资料——下一个周五，或许就是故事的开始。</p>
    <div class="ecta reveal d2"><a class="btn btn-neon btn-lg" href="#getapp"><span data-i18n="epo.btn">加入下一轮</span><span class="material-symbols-rounded">arrow_forward</span></a></div>
  </div>
</section>

<!-- final cta -->
<section class="final" id="final">
  <div class="pfield pfield--rise" data-particles="18" aria-hidden="true"></div>
  <div class="wrap reveal">
    <div class="eyebrow" style="justify-content:center;margin-bottom:24px"><span class="dot"></span><span data-i18n="cta.label">准备好了吗</span></div>
    <h2 data-i18n-html="cta.head">下一个周五 17:00，<br>会不会是 <span class="u">你的故事</span> 开始？</h2>
    <p data-i18n="cta.sub">加入匹配池，把这一周交给认真。</p>
    <div class="btns">
      <a class="btn btn-neon btn-lg" href="#getapp"><span data-i18n="cta.btn1">立即加入匹配</span><span class="material-symbols-rounded">arrow_forward</span></a>
      <a class="btn btn-ghost btn-lg" href="#features" data-i18n="cta.btn2">先了解机制</a>
    </div>
  </div>
</section>

<!-- footer -->
<footer>
  <div class="wrap">
    <div class="foot">
      <div>
        <div class="brand"><span class="blip"></span>UNIMATCHA</div>
        <p class="desc" data-i18n="foot.desc">大学生长期恋爱匹配平台 · v2.0。每周五 17:00，公平、专注地公布每一轮匹配结果。</p>
      </div>
      <div class="foot-cols">
        <div class="fcol"><h5 data-i18n="foot.c1">产品</h5>
          <a href="#features" data-i18n="feat.match.t">匹配</a>
          <a href="#wall" data-i18n="feat.wall.t">校园墙</a>
          <a href="#getapp" data-i18n="ga.label">获取 App</a>
          <a href="#features" data-i18n="nav.how">如何使用</a>
        </div>
        <div class="fcol"><h5 data-i18n="foot.c2">平台</h5>
          <a href="#" data-i18n="foot.h5">H5 移动端</a>
          <a href="#" data-i18n="foot.ios">iOS 客户端</a>
          <a href="#" data-i18n="foot.admin">管理后台</a>
        </div>
        <div class="fcol"><h5 data-i18n="foot.c3">关于</h5>
          <a href="#partners" data-i18n="nav.partners">合作伙伴</a>
          <a href="#" data-i18n="foot.privacy">隐私协议</a>
          <a href="mailto:hello@unimatcha.com" data-i18n="foot.contact">联系我们</a>
        </div>
      </div>
    </div>
    <div class="foot-bot">
      <span data-i18n="foot.copy">© 2026 UNIMATCHA · 长期恋爱匹配协议</span>
      <span data-i18n="foot.tag">为认真的人而造 · ◆ #CCFF00</span>
    </div>
  </div>
</footer>`;

export default function Landing() {
  const host = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;   // guard React StrictMode double-invoke (dev)
    didInit.current = true;
    let lenisRaf = 0; let lenis: any = null;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
    // ---- Lenis smooth scroll (baseline of the animation stack) ----
    if (!reduce) {
      try {
        lenis = new Lenis();
        const raf = (t: number) => { lenis.raf(t); lenisRaf = requestAnimationFrame(raf); };
        lenisRaf = requestAnimationFrame(raf);
      } catch (e) { /* non-fatal */ }
    }
    // ---- ORIGINAL PAGE SCRIPT (verbatim) ----
/* ===================== i18n ===================== */
const I18N={
  zh:{
    'nav.features':'功能','nav.how':'如何使用','nav.reviews':'评价','nav.partners':'合作伙伴','nav.cta':'进入应用',
    'hero.eyebrow':'大学生 · 校园生活平台',
    'hero.title':'点亮你的<br><span class="mark"><span>校园生活</span></span>。',
    'hero.lede':'抹茶是为大学生打造的校园生活平台：认真的<b>匹配</b>，真实的<b>校园墙</b>，让每一段校园缘分都被认真对待。',
    'hero.cta1':'立即开始','hero.cta2':'了解功能','hero.live':'匹配进行中','hero.scroll':'下滑探索',
    'stat.users':'在册用户','stat.matches':'成功配对','stat.campuses':'覆盖院校','stat.rounds':'已运行轮次',
    'cd.d':'天','cd.h':'时','cd.m':'分','cd.s':'秒','cd.days':'天','cd.hours':'小时','cd.mins':'分钟','cd.secs':'秒',
    'feat.label':'核心功能','feat.head':'两件事，把校园缘分做到极致','feat.sub':'不堆功能，只把最重要的体验打磨好：认真的匹配（恋爱 + 朋友），与以本校为中心的校园墙。',
    'feat.match.t':'匹配','feat.match.eyebrow':'核心功能 · 匹配','feat.match.headline':'认真的人，值得一次认真的匹配。','feat.match.d':'面向大学生的长期匹配——每一轮持续整整一周，周五 17:00 统一公布结果，把缘分交给一个公平、专注、有期待的算法。不只是恋爱，也能匹配同频的朋友。',
    'feat.match.tag1':'恋爱匹配','feat.match.tag2':'朋友匹配',
    'feat.match.b1':'周期匹配制：每周五 17:00 统一公布，营造仪式感。','feat.match.b2':'恋爱 + 朋友双模式，遇见对的人，也遇见对的朋友。','feat.match.b3':'AI 为长期关系优化，而非一时心动。',
    'feat.wall.t':'校园墙','feat.wall.d':'以本校为中心的内容墙——优先看到同校同学的真实校园生活，也能发现跨校的有趣灵魂。',
    'feat.wall.tag1':'本校优先','feat.wall.tag2':'跨校发现',
    'feat.wall.b1':'本校优先：先看到同校同学的真实动态。','feat.wall.b2':'跨校发现：遇见其他学校的有趣灵魂。','feat.wall.b3':'图文瀑布流，呈现真实的校园生活。',
    'feat.wall.lead':'两个你会天天打开它的理由——一面真实的校园墙，和一个可以匿名说话的角落。',
    'feat.card.explore':'了解更多',
    'feat.card.wall.label':'校园墙 · CAMPUS WALL','feat.card.wall.title':'组织活动，讨论校园',
    'feat.card.wall.desc':'发起线下活动、讨论校园话题、分享日常点滴、互相答疑解惑——以本校为中心，也能遇见跨校的有趣灵魂。',
    'feat.card.wall.chip1':'组织活动','feat.card.wall.chip2':'讨论校园','feat.card.wall.chip3':'分享日常','feat.card.wall.chip4':'答疑解惑',
    'feat.card.anon.tab':'匿名','feat.card.anon.label':'匿名 · ANONYMOUS','feat.card.anon.title':'匿名发帖，自在表达',
    'feat.card.anon.desc':'想说又不好意思署名？开启匿名身份发帖、评论、互动，把真实想法说出口，不暴露你是谁。',
    'ph.match':'匹配界面 · 放置图片 / 视频','ph.wall':'校园墙界面 · 放置图片 / 视频',
    'mock.matching':'匹配中 · 等待周五公布','mock.join':'加入匹配池','mock.wall':'校园墙','mock.wall.t1':'推荐','mock.wall.t2':'校园墙',
    'mock.chat.name':'晚晴','mock.chat.role':'Cambridge · 已配对','mock.chat.b1':'嗨，看到我们都喜欢爬山 ⛰️','mock.chat.b2':'是啊！周末有空一起去吗？','mock.chat.b3':'好呀，那就说定了～','mock.chat.input':'发条消息…',
    'how.label':'如何使用','how.head':'四步，开启你的一段关系','how.sub':'像一轮一轮推进的赛季，每一步都简单清晰。',
    'how.s1.t':'完善资料','how.s1.d':'填写资料与问卷，让算法读懂真实的你——价值观、兴趣与对长期关系的期待。','how.s1.s':'Profile',
    'how.s2.t':'加入匹配池','how.s2.d':'一键加入本周匹配池，进入"匹配中"状态，并看到距周五 17:00 的倒计时。','how.s2.s':'Join Pool',
    'how.s3.t':'等待一轮','how.s3.d':'算法在整整一周内综合资料与偏好，为长期关系优化，而非一时心动。','how.s3.s':'One Round',
    'how.s4.t':'周五 17:00 公布','how.s4.d':'结果统一推送。配对成功即解锁专属聊天与校园墙；未配则自动进入下一轮。','how.s4.s':'Reveal',
    'how.s1.d2':'填写资料与问卷。','how.s2.d2':'一键加入本周匹配。','how.s3.d2':'算法整周为你优化。','how.s4.d2':'结果统一推送，解锁聊天。',
    'feat.match.d2':'每周五 17:00 统一公布。在这里，遇见对的那个人，也遇见同频的挚友。',
    'more.label':'待补充 · COMING SOON','more.head':'这里展示其他内容','more.sub':'一个预留的内容区块，等你来填充。','more.ph':'在此展示其他内容',
    'rev.label':'真实评价','rev.head':'他们在这里，遇见了对的人','rev.sub':'来自不同院校的同学，讲述他们的故事。',
    'par.label':'合作伙伴','par.head':'与校园社群，一起把缘分做大','par.sub':'我们与各院校学生会、社团及校园品牌合作，把更真诚的连接带进校园。',
    'par.cta.head':'想把抹茶带进你的校园？<br><em>和我们合作。</em>','par.cta.sub':'无论你是学生会、社团还是校园品牌，我们都欢迎一起共创校园活动与专属福利。','par.cta.btn':'成为合作伙伴',
    'epo.label':'下一轮匹配 · NEXT ROUND','epo.head':'每周五 17:00，<br><em>缘分统一结算。</em>','epo.sub':'所有人在同一时刻见证结果。这一周，好好准备你的资料——下一个周五，或许就是故事的开始。','epo.btn':'加入下一轮',
    'ga.label':'获取 App','ga.head':'即将装进<br><em>你的口袋。</em>','ga.sub':'iOS 与 Android 预计 2026 春季上线。加入候补名单，抢先体验并解锁校园专属福利。','ga.ios.k':'即将上线 APP STORE','ga.gp.k':'即将上线 GOOGLE PLAY','ga.soon':'敬请期待','ga.wait':'→ 加入候补名单 · 抢先体验',
    'cta.label':'准备好了吗','cta.head':'下一个周五 17:00，<br>会不会是 <span class="u">你的故事</span> 开始？','cta.sub':'加入匹配池，把这一周交给认真。','cta.btn1':'立即加入匹配','cta.btn2':'先了解机制',
    'foot.desc':'大学生长期恋爱匹配平台 · v2.0。每周五 17:00，公平、专注地公布每一轮匹配结果。','foot.c1':'产品','foot.c2':'平台','foot.c3':'关于','foot.h5':'H5 移动端','foot.ios':'iOS 客户端','foot.admin':'管理后台','foot.privacy':'隐私协议','foot.contact':'联系我们','foot.copy':'© 2026 UNIMATCHA · 长期恋爱匹配协议','foot.tag':'为认真的人而造 · ◆ #CCFF00',
  },
  en:{
    'nav.features':'Features','nav.how':'How it works','nav.reviews':'Reviews','nav.partners':'Partners','nav.cta':'Open App',
    'hero.eyebrow':'For students · A campus life platform',
    'hero.title':'Spark your<br><span class="mark"><span>campus life</span></span>.',
    'hero.lede':'Unimatcha is a campus-life platform for university students: serious <b>matching</b> and a real <b>campus wall</b>, so every campus connection is taken seriously.',
    'hero.cta1':'Get started','hero.cta2':'Explore features','hero.live':'Round in progress','hero.scroll':'Scroll',
    'stat.users':'Registered users','stat.matches':'Matches made','stat.campuses':'Campuses','stat.rounds':'Rounds run',
    'cd.d':'D','cd.h':'H','cd.m':'M','cd.s':'S','cd.days':'Days','cd.hours':'Hours','cd.mins':'Mins','cd.secs':'Secs',
    'feat.label':'Core features','feat.head':'Two things, done exceptionally well','feat.sub':'No feature bloat — just the experiences that matter most: serious matching (dating + friends), and a campus wall centred on your own school.',
    'feat.match.t':'Matching','feat.match.eyebrow':'Core feature · Matching','feat.match.headline':'Serious people deserve a serious match.','feat.match.d':'Long-term matching for university students — every round runs a full week and settles at Friday 17:00, handing your fate to an algorithm that is fair, focused and worth the wait. Not just dating — match with like-minded friends too.',
    'feat.match.tag1':'Dating','feat.match.tag2':'Friends',
    'feat.match.b1':'A weekly round — results revealed together every Friday 17:00.','feat.match.b2':'Two modes, dating + friends — meet the right partner and the right friends.','feat.match.b3':'AI optimised for the long term, not a fleeting spark.',
    'feat.wall.t':'Campus Wall','feat.wall.d':'A wall centred on your own campus — see real student life from your school first, and still discover interesting people across campuses.',
    'feat.wall.tag1':'Your campus first','feat.wall.tag2':'Cross-campus',
    'feat.wall.b1':'Your campus first — real posts from people at your own school.','feat.wall.b2':'Cross-campus discovery — find interesting souls from other universities.','feat.wall.b3':'A photo-rich feed showing real student life.',
    'feat.wall.lead':'Two reasons you’ll open it every day — a real campus wall, and a corner where you can speak anonymously.',
    'feat.card.explore':'EXPLORE',
    'feat.card.wall.label':'CAMPUS WALL','feat.card.wall.title':'Organize, discuss, share, ask',
    'feat.card.wall.desc':'Start activities, discuss campus topics, share daily life, and help each other with Q&A — centred on your own school, with interesting people across campuses too.',
    'feat.card.wall.chip1':'Activities','feat.card.wall.chip2':'Discuss','feat.card.wall.chip3':'Share','feat.card.wall.chip4':'Q&A',
    'feat.card.anon.tab':'Anonymous','feat.card.anon.label':'ANONYMOUS','feat.card.anon.title':'Post anonymously, speak freely',
    'feat.card.anon.desc':'Got something to say but don’t want your name on it? Turn on an anonymous identity to post, comment, and interact — share what you really think without revealing who you are.',
    'ph.match':'Matching screen · drop image / video','ph.wall':'Campus wall · drop image / video',
    'mock.matching':'Matching · waiting for Friday','mock.join':'Join pool','mock.wall':'Campus Wall','mock.wall.t1':'For You','mock.wall.t2':'Campus',
    'mock.chat.name':'Wanqing','mock.chat.role':'Cambridge · Matched','mock.chat.b1':'Hey — we both love hiking ⛰️','mock.chat.b2':'We do! Free to go this weekend?','mock.chat.b3':'Sure, it’s a date~','mock.chat.input':'Message…',
    'how.label':'How it works','how.head':'Four steps to start a relationship','how.sub':'Like a season that advances round by round — every step simple and clear.',
    'how.s1.t':'Build your profile','how.s1.d':'Fill in your profile and questionnaire so the algorithm understands the real you — values, interests and what you want long-term.','how.s1.s':'Profile',
    'how.s2.t':'Join the pool','how.s2.d':'Join this week’s pool in one tap, enter the "matching" state, and watch the countdown to Friday 17:00.','how.s2.s':'Join Pool',
    'how.s3.t':'Wait one round','how.s3.d':'Over a full week the algorithm weighs profiles and preferences, optimising for the long term — not a fleeting spark.','how.s3.s':'One Round',
    'how.s4.t':'Friday 17:00 reveal','how.s4.d':'Results are pushed together. Match and you unlock private chat and the campus wall; no match and you roll into the next round.','how.s4.s':'Reveal',
    'how.s1.d2':'Fill in your profile & questionnaire.','how.s2.d2':'Join this week’s pool in one tap.','how.s3.d2':'The algorithm optimises all week.','how.s4.d2':'Results revealed, chat unlocks.',
    'feat.match.d2':'Revealed together every Friday 17:00. Meet the right partner here — and the right kind of close friends.',
    'more.label':'Coming soon','more.head':'Your content goes here','more.sub':'A reserved content block, ready for you to fill.','more.ph':'Show your other content here',
    'rev.label':'Real reviews','rev.head':'They met the right person here','rev.sub':'Students from different campuses share their stories.',
    'par.label':'Partners','par.head':'Growing campus connection, together','par.sub':'We work with student unions, societies and campus brands to bring more genuine connection onto campus.',
    'par.cta.head':'Want Unimatcha on your campus?<br><em>Let’s work together.</em>','par.cta.sub':'Whether you’re a student union, a society or a campus brand, we’d love to co-create events and exclusive perks.','par.cta.btn':'Become a partner',
    'epo.label':'Next round · NEXT ROUND','epo.head':'Every Friday 17:00,<br><em>matches settle together.</em>','epo.sub':'Everyone witnesses the result at the same moment. Spend this week perfecting your profile — next Friday could be where your story begins.','epo.btn':'Join the next round',
    'ga.label':'Get the app','ga.head':'Coming soon to<br><em>your pocket.</em>','ga.sub':'iOS & Android launching Spring 2026. Join the waitlist for early access and exclusive campus drops.','ga.ios.k':'COMING TO APP STORE','ga.gp.k':'COMING TO GOOGLE PLAY','ga.soon':'SOON','ga.wait':'→ Join the waitlist · early access',
    'cta.label':'Ready?','cta.head':'Next Friday 17:00 —<br>could it be where <span class="u">your story</span> begins?','cta.sub':'Join the pool, and give this week to something real.','cta.btn1':'Join matching now','cta.btn2':'See how it works',
    'foot.desc':'Long-term matching for university students · v2.0. Every Friday 17:00 we reveal each round fairly and with focus.','foot.c1':'Product','foot.c2':'Platform','foot.c3':'About','foot.h5':'H5 Mobile','foot.ios':'iOS App','foot.admin':'Admin','foot.privacy':'Privacy','foot.contact':'Contact us','foot.copy':'© 2026 UNIMATCHA · Long-term matching protocol','foot.tag':'Built for people who are serious · ◆ #CCFF00',
  }
};
let LANG=localStorage.getItem('um_lang')||'zh';
function applyLang(l){
  LANG=l;document.documentElement.lang=l;localStorage.setItem('um_lang',l);
  document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.getAttribute('data-i18n');if(I18N[l][k]!=null)el.textContent=I18N[l][k];});
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{const k=el.getAttribute('data-i18n-html');if(I18N[l][k]!=null)el.innerHTML=I18N[l][k];});
  document.getElementById('langLabel').textContent=(l==='zh'?'EN':'中');
  buildReviews();
}
document.getElementById('langBtn').addEventListener('click',()=>applyLang(LANG==='zh'?'en':'zh'));

/* ===================== reviews data ===================== */
const REVIEWS={
  zh:[
    {q:'本来只是抱着试试的心态，结果真的遇到了聊得来的人。周五公布那一刻太有仪式感了。',n:'晓彤',r:'UCL · 大三'},
    {q:'不用一直刷，一周等一次结果，反而更认真地对待每一次匹配。',n:'子谦',r:'Imperial · 研一'},
    {q:'校园墙让我发现了好多有意思的同学，氛围很真实不油腻。',n:'安然',r:'LSE · 大二'},
    {q:'配对后直接能聊天，第一句话就很自然，没有尬聊。',n:'南风',r:'KCL · 大四'},
    {q:'专注长期关系这点真的戳到我，不是那种快餐式的。',n:'知意',r:'Oxford · 研二'},
    {q:'界面好看又干净，用起来很舒服，推荐给了全宿舍。',n:'清和',r:'Edinburgh · 大三'},
  ],
  en:[
    {q:'I joined just to try it — and actually met someone I click with. The Friday reveal feels genuinely special.',n:'Tina',r:'UCL · Year 3'},
    {q:'No endless scrolling. Waiting a week for one result makes me take every match seriously.',n:'Ziqian',r:'Imperial · PG'},
    {q:'The campus wall helped me find so many interesting people. The vibe is real, not sleazy.',n:'Anran',r:'LSE · Year 2'},
    {q:'Chat unlocks right after matching, so the first message feels natural — no awkward openers.',n:'Nanfeng',r:'KCL · Year 4'},
    {q:'The focus on long-term relationships is exactly what I wanted. Not fast-food dating.',n:'Zhiyi',r:'Oxford · PG'},
    {q:'Beautiful, clean interface that’s a joy to use. I recommended it to my whole flat.',n:'Qinghe',r:'Edinburgh · Year 3'},
  ]
};
function revCard(t){return `<div class="rev-card"><div class="stars">${'<span class="material-symbols-rounded">star</span>'.repeat(5)}</div><div class="q">"${t.q}"</div><div class="who"><div class="av">${t.n[0]}</div><div><div class="nm">${t.n}</div><div class="ro">${t.r}</div></div></div></div>`;}
function buildReviews(){
  const data=REVIEWS[LANG];
  const a=data.concat(data).map(revCard).join('');
  const b=data.slice().reverse().concat(data.slice().reverse()).map(revCard).join('');
  document.getElementById('revA').innerHTML=a;
  document.getElementById('revB').innerHTML=b;
}

/* ===================== nav scroll / progress ===================== */
const hdr=document.getElementById('hdr'),progress=document.getElementById('progress');
let lastY=0;
addEventListener('scroll',()=>{
  const y=scrollY;
  hdr.classList.toggle('scrolled',y>40);
  hdr.classList.toggle('hide',y>lastY&&y>400);
  lastY=y;
  const h=document.documentElement.scrollHeight-innerHeight;
  progress.style.width=(h>0?(y/h*100):0)+'%';
},{passive:true});

/* ===================== reveal ===================== */
const io=new IntersectionObserver(es=>es.forEach(e=>{e.target.classList.toggle('in',e.isIntersecting);}),{threshold:.14});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

/* ===================== campus-wall folder tabs ===================== */
(function(){
  const tabs=document.querySelectorAll('#wall .wall-tab');
  const pages=document.querySelectorAll('#wall .wall-page');
  if(!tabs.length)return;
  tabs.forEach(tab=>tab.addEventListener('click',()=>{
    const i=tab.getAttribute('data-wtab');
    tabs.forEach(t=>{const on=t===tab;t.classList.toggle('is-active',on);t.setAttribute('aria-selected',on);});
    pages.forEach(p=>p.classList.toggle('is-active',p.getAttribute('data-wpage')===i));
  }));
})();

/* ===================== organic particles ===================== */
(function(){
  var fields=document.querySelectorAll('.pfield');
  if(!fields.length)return;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  function rnd(a,b){return a+Math.random()*(b-a);}
  fields.forEach(function(f){
    var rise=f.classList.contains('pfield--rise');
    var n=parseInt(f.getAttribute('data-particles'),10)||20;
    var frag=document.createDocumentFragment();
    for(var i=0;i<n;i++){
      var p=document.createElement('span');
      var size=rnd(2,7);
      p.style.width=p.style.height=size.toFixed(1)+'px';
      p.style.left=rnd(0,100).toFixed(2)+'%';
      p.style.top=(rise?rnd(58,100):rnd(0,100)).toFixed(2)+'%';
      p.style.setProperty('--o',rnd(.14,.45).toFixed(2));
      p.style.setProperty('--dx',rnd(-48,48).toFixed(0)+'px');
      if(rise)p.style.setProperty('--rise',rnd(180,340).toFixed(0)+'px');
      else p.style.setProperty('--dy',rnd(-48,48).toFixed(0)+'px');
      if(reduce){p.style.animation='none';p.style.opacity=rnd(.12,.3).toFixed(2);}
      else{p.style.setProperty('--dur',rnd(rise?10:11,rise?17:20).toFixed(1)+'s');p.style.animationDelay=(-rnd(0,14)).toFixed(1)+'s';}
      frag.appendChild(p);
    }
    f.appendChild(frag);
  });
})();

/* ===================== count up ===================== */
function countUp(el){
  const target=+el.dataset.count,suffix=el.dataset.suffix||'';const dur=1500,t0=performance.now();
  function tick(now){const p=Math.min((now-t0)/dur,1),e=1-Math.pow(1-p,3);el.textContent=Math.floor(target*e).toLocaleString('en-US')+suffix;if(p<1)requestAnimationFrame(tick);else el.textContent=target.toLocaleString('en-US')+suffix;}
  requestAnimationFrame(tick);
}
const cio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&e.intersectionRatio>=.55){countUp(e.target);}else if(e.intersectionRatio===0){e.target.textContent='0'+(e.target.dataset.suffix||'');}}),{threshold:[0,.6]});
document.querySelectorAll('[data-count]').forEach(el=>cio.observe(el));

/* ===================== countdown to next Fri 17:00 ===================== */
function nextFriday17(){const now=new Date(),d=new Date(now),day=d.getDay();let add=(5-day+7)%7;d.setHours(17,0,0,0);if(add===0&&now>d)add=7;d.setDate(d.getDate()+add);return d;}
function roundNumber(){const epoch=new Date('2024-01-05T17:00:00'),now=new Date();return Math.max(1,Math.floor((now-epoch)/(7*864e5))+1);}
document.getElementById('roundTag').textContent='ROUND '+String(roundNumber()).padStart(3,'0');
const pad=n=>String(n).padStart(2,'0');
const cdD=document.querySelectorAll('[data-cd="d"]'),cdH=document.querySelectorAll('[data-cd="h"]'),cdM=document.querySelectorAll('[data-cd="m"]'),cdS=document.querySelectorAll('[data-cd="s"]');
const cdMini=document.querySelectorAll('[data-cd-mini]');
let lastS=-1;
function tickCD(){
  const tgt=nextFriday17(),now=new Date();let diff=Math.max(0,tgt-now);
  const d=Math.floor(diff/864e5);diff-=d*864e5;const h=Math.floor(diff/36e5);diff-=h*36e5;const m=Math.floor(diff/6e4);diff-=m*6e4;const s=Math.floor(diff/1e3);
  cdD.forEach(x=>x.textContent=pad(d));cdH.forEach(x=>x.textContent=pad(h));cdM.forEach(x=>x.textContent=pad(m));
  cdS.forEach(x=>{x.textContent=pad(s);if(s!==lastS){x.classList.add('flash');setTimeout(()=>x.classList.remove('flash'),130);}});
  cdMini.forEach(x=>x.textContent=pad(h)+':'+pad(m)+':'+pad(s));
  lastS=s;
}
tickCD();setInterval(tickCD,1000);

/* ===================== rotating dotted Earth (continents only) ===================== */
(function () {
  'use strict';
  var canvas = document.getElementById('globe');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  var CONFIG = { gridStep: 2, radiusFrac: 0.47, perspective: 3.0, rotSpeed: -0.12, tiltX: 0.4, baseDot: 1.05,
    latLines: [-60,-30,0,30,60], lonCount: 6,
    colors: { dot:'170,205,0', grid:'20,20,20' } };
  // Real Natural Earth land mask (ne_110m_land, 360x180, 1 bit/cell, base64) — rasterised from naturalearthdata.com
  var MASK_W=360, MASK_H=180, maskBits=null;
  var MASK_B64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABf//4AAP///gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB////D//////z+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/3f/w////////gAAAAABAAABAAAAAAAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAf7/8A///////+AAAAB/rAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAcDnHn/w////////8AAAAA/gAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAIAAgP+AP///////+AAAAAPAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAADgCAMmPcAP///////4AAAAAAAAAAAAAAwAAAAB/8AAAAAAAAAAAAAAAAAAAAAH/wc354AAAf/////8AAAAAAAAAAAADwAAAA////AAAB/AAAAAAAAAAAAAAAAAQAAAcAAAAH/////8AAAAAAAAAAAAeAAAAP///wAAAAAAAAAAAAAAAAAAAAP8AYe+ITAAAD/////4AAAAAAAAAAAA4AAAH/////+DAAOAAAAAAAAAAAAAAAfv+4ew/5gAAB/////gAAAAAAAAAAABwAHAH///////4APgAAAAAgAAAAAAAAOf/4E4//8AAA/////wAAAAAAAAAAADwAPL////////4m//gAAAAAAAP+AAAAAH/+A8f//4AA////+AAAAAAAA/AAAAAAfv/////////////8AAAAAB///+C/3D//HeBwf8AAn///+AAAAAAAf/4AAAAcfv/////////////+8H8gAP///////+A4CPzwD8AAP///wAAAAAAB///wABCfnn/////////////////8AD////////+///34Z/gA///4AAAAAAAH///+Mf///v//////////////////4A/////////////AD/8Af//gAAAAAAAf//88P////f/////////////////Hwf////////////6AH8YAP/wAAf8AAAA/8f+D///////////////////////AgAf///////////zw7/AAP/gAAP4AAAB/4/+f//////////////////////8AAAf//////////+CAA/gAH/gAAAAAAAH/j/////////////////////////+AAH///////////4AwAHAAD+AAAAAAAA//H///////////////////////v/6AAP///////////wAA/AAAB+AAAAAAAB/+D//////////////////////jP+AAAH/9z////////wAA/wAAAGAAAAAAAB//Dz////////////////////+AfYAAAA/6AD///////gAA/wwAAAAAAAAAAB//AL///////////////////+cBgAAAAABwAAf//////4AA/84AAAAAAAAAQAx+A///////////////////4AAHAAAAAADcAAD//////4AAf/8AAAAAAAAA8AA+C///////////////////gAAfgAAAAAMAAAA///////wAf/8AAAAAAAAA4AM8H///////////////////AAA/gAAAAAgAAAA///////8Af//AAAAAAAAAcANwH//////////////////8AAA/AAAAAAAAAAAP///////x///wAAAAAAADGAEBv//////////////////+AAA+AAAAAAAAAABH///////x///8AAAAAAAHHAf/////////////////////6AA8AAAAAAAAAAAD///////x///8AAAAAAAGfj//////////////////////+AAwAAAAAAAAAAAD///////5///8AAAAAAAAPj//////////////////////6AAAAAAAAAAAAAAD///////////EAAAAAAAAYf//////////////////////zAAAAAAAAAAAAAAAv////////8MOAAAAAAAAA///////////////////////zAAAAAAAAAAAAAAAX////////7gfgAAAAAAAP///////////////////////yAAAAAAAAAAAAAAAP/////////gCgAAAAAAAH///////////////////////iAAAAAAAAAAAAAAAP/////////wAAAAAAAAAB/////uP/h//////////////AAAAAAAAAAAAAAAAP/////////+AAAAAAAAAB//v//Gf/B/////////////+AAAAAAAAAAAAAAAAP////////8wAAAAAAAAAB//H/+AP+H/////////////8CAAAAAAAAAAAAAAAP////////wAAAAAAAAADj/jj/8AD/H/////////////4HgAAAAAAAAAAAAAAP////////gAAAAAAAAAH/4Bwf8AB/B////////////+APAAAAAAAAAAAAAAAP////////AAAAAAAAAAH/wAcf8PB/g////////////8AAAAAAAAAAAAAAAAAP///////8AAAAAAAAAAH/AEGPB///x///////////P4AMAAAAAAAAAAAAAAAP///////8AAAAAAAAAAH/AICOH///h//////////+BwAMAAAAAAAAAAAAAAAH///////4AAAAAAAAAAH/AAAGH///g//////////8BwAIAAAAAAAAAAAAAAAD///////wAAAAAAAAAAH+AAYGH///w//////////+wYA4AAAAAAAAAAAAAAAD///////wAAAAAAAAAAAgP+AABM//////////////g4D4AAAAAAAAAAAAAAAB///////wAAAAAAAAAAAh/+AAAA//////////////AYbwAAAAAAAAAAAAAAAA///////gAAAAAAAAAAB//8AAAA//////////////AB+AAAAAAAAAAAAAAAAAP/////+AAAAAAAAAAAD//+AAAB//////////////gDQAAAAAAAAAAAAAAAAAH/////8AAAAAAAAAAAH///wGAB//////////////gDAAAAAAAAAAAAAAAAAAG/////4AAAAAAAAAAAP///8P4D//////////////wCAAAAAAAAAAAAAAAAAACf////wAAAAAAAAAAAP////P////////////////gAAAAAAAAAAAAAAAAABP//hAYAAAAAAAAAAAP/////////H///////////wAAAAAAAAAAAAAAAAAAAAv//AAYAAAAAAAAAAAf/////////H///////////wAAAAAAAAAAAAAAAAAAAAj/+AAcAAAAAAAAAAB///////4//h///////////gAAAAAAAAAAAAAAAAAAAAT/+AANAAAAAAAAAAD///////8//wH//////////AAAAAAAAAAAAAAAAAAAAAJ/+AAEAAAAAAAAAAH///////+f/0B/////////+AAAAAAAAAAAAAAAAAAAAAA/8AAAAAAAAAAAAAH///////+P/84Af///////8QAAAAAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAP///////+H//+AH///////4gAAAAAAAAAAAAAAAAAAAAAP8AAsAAAAAAAAAAP////////H//+AD///v///AgAAAAAAAAAAAAAAAAAAAAAH+AABgAAAAAAAAAf////////n//+AD//4P//YAAAAAAAAAAAAAAAAAAAAAAAP+A4AYAAAAAAAAAP////////j//8AAf/4H/+AAAAAAAAAAAAAAAAgAAAAAAAH/BwABwAAAAAAAAP////////h//8AAf/gD/8YAAAAAAAAAAAAAAAAAAAAAAAB/jwAA4AAAAAAAAP////////x//4AAf/AD/8QAAAAAAAAAAAAAAAAAAAAAAAAf/wAAAAAAAAAAAP////////4//gAAf+AB/+AAwAAAAAAAAAAAAAAAAAAAAAAH/wAAAAAAAAAAAP////////4f+AAAP8ADf+AAwAAAAAAAAAAAAAAAAAAAAAAAH/AAAAAAAAAAAf////////8f8AAAPwAAP/gAwAAAAAAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAf////////+fgAAAHwAAP/gAQAAAAAAAAAAAAAAAAAAAAAAAAfAAAAAAAAAAAf/////////eAAAAHwAAP/gAkAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAf/////////gAAAAHwAAE/gAAAAAAAAAAAAAAAAAAAAAAAAAADABIAAAAAAAAP/////////gIAAADwAAEfgAIAAAAAAAAAAAAAAAAAAAAAAAADgHdKAAAAAAAH/////////34AAADwAAAOAAEAAAAAAAAAAAAAAAAAAAAAAAAAgPf+AAAAAAAD//////////4AAADoAAIEAAAAAAAAAAAAAAAAAAAAAAAAAAAAd///AAAAAAAB//////////wAAABIAAMAAADAAAAAAAAAAAAAAAAAAAAAAAAAA///gAAAAAAA//////////wAAAAMAAGAAALAAAAAAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAf/////////gAAAAMAADAAADAAAAAAAAAAAAAAAAAAAAAAAAAAf///gAAAAAAP/B///////gAAAAAAADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAn//////AAAAAAAAxgA8AAAAAAAAAAAAAAAAAAAAAAAAAAAf///4AAAAAAAAAD/////+AAAAAAAAZgB4AAAAAAAAAAAAAAAAAAAAAAAAAAA////4AAAAAAAAAD/////8AAAAAAAAMwD8AAAAAAAAAAAAAAAAAAAAAAAAAAB////8AAAAAAAAAH/////4AAAAAAAAHwf8AAAAAAAAAAAAAAAAAAAAAAAAAAD////8AAAAAAAAAH/////gAAAAAAAAHgf80AAAAAAAAAAAAAAAAAAAAAAAAAD////+AAAAAAAAAH/////AAAAAAAAADwf4AAAAAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAAH/////AAAAAAAAABwP5wBwAAAAAAAAAAAAAAAAAAAAAAAD/////8AAAAAAAAD////8AAAAAAAAAB4PxwAzwAAAAAAAAAAAAAAAAAAAAAAD//////4AAAAAAAB////8AAAAAAAAAA8AxQgf+AAAAAAAAAAAAAAAAAAAAAAH//////8AAAAAAAA////4AAAAAAAAAAcAAIAD/gAAAAAAAAAAAAAAAAAAAAAH///////gAAAAAAA////4AAAAAAAAAAEAAAAI/wwAAAAAAAAAAAAAAAAAAAAD///////gAAAAAAAf///4AAAAAAAAAADAAAAIf4AAAAAAAAAAAAAAAAAAAAAD///////gAAAAAAAf///4AAAAAAAAAAB+AAAA/4AIAAAAAAAAAAAAAAAAAAAB///////gAAAAAAAf///4AAAAAAAAAAAAggAAGMAAAAAAAAAAAAAAAAAAAAAA///////AAAAAAAAf///8AAAAAAAAAAAABCAAAGACAAAAAAAAAAAAAAAAAAAA//////+AAAAAAAAP///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/////+AAAAAAAAP///8AAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAf/////8AAAAAAAAf///8AAAAAAAAAAAAAAB+CAAAAAAAAAAAAAAAAAAAAAAAP/////4AAAAAAAAf///+AwAAAAAAAAAAAAD8DAAAAAAAAAAAAAAAAAAAAAAAP/////4AAAAAAAA////+AwAAAAAAAAAAAAz8DgAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAA////8BwAAAAAAAAAAAB/8DgAAAAAAAAAAAAAAAAAAAAAAB/////4AAAAAAAA////8HwAAAAAAAAAAAD//HwAABAAAAAAAAAAAAAAAAAAAAf////4AAAAAAAA////gPgAAAAAAAAAAAP//nwAAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAA////APgAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAf//+APgAAAAAAAAAAAf///4AAAAAAAAAAAAAAAAAAAAAAAP////gAAAAAAAAf//+APAAAAAAAAAAAB////+AAIAAAAAAAAAAAAAAAAAAAAP////gAAAAAAAAP//+APAAAAAAAAAAAP////+AAEAAAAAAAAAAAAAAAAAAAAP////AAAAAAAAAP//+AfAAAAAAAAAAA//////AAAAAAAAAAAAAAAAAAAAAAAP///4AAAAAAAAAP//+AOAAAAAAAAAAA//////gAAAAAAAAAAAAAAAAAAAAAAf///gAAAAAAAAAH//+AOAAAAAAAAAAA//////wAAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAH//4AAAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAH//4AAAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAD//4AAAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAD//wAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAAf//8AAAAAAAAAAB//gAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAA///8AAAAAAAAAAA//AAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAAf//4AAAAAAAAAAA//AAAAAAAAAAAAAAP/9///4AAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAAAAA/8AAAAAAAAAAAAAAP+AP//wAAAAAAAAAAAAAAAAAAAAAA///gAAAAAAAAAAA/wAAAAAAAAAAAAAAf8AG//gAAAAAAAAAAAAAAAAAAAAAA//3AAAAAAAAAAAAQAAAAAAAAAAAAAAAOAAB//gAAAAAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/AAAAAAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAgAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAQAAAAAAAAAAAAAAAAAB//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYAAAAcAAAAAAAAAAAAAAAAAB/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAADAAAAAAAAAAAAAAAAAAD/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAHAAAAAAAAAAAAAAAAAAB/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAOAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAD4AAAAAAA4HgAB8AAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAA//AAAD//////////wAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAP///4Af///////////AAAAAAAAAAAAAAAAAAAAAAAz4AAAAAAAAAAAAAAAHz////4A/////////////wAAAAAAAAAAAAAAAAAAAAA78AAAAAAAAAAAc/8D//////wf/////////////+AAAAAAAAAAAAAAAAAAAAH58AAAAAAAAJ+f//////////w////////////////4AAAAAAAAAAAAAA4AAAAD+AAAAAAAA//////////////////////////////wAAAAAAAAABiAAB8P+GB/+AAAAAAAP//////////////////////////////gAAAAAAAAPnAfgAP/////4AAAAAAAP/////////////////////////////8AAAAAAADf////////////AAAAAAAA//////////////////////////////wAAAAAAAH////////////gAAAAAAD///////////////////////////////gAAAAAD7////////////4AAAAAAB////////////////////////////////wAAAABh/////////////AAAAB8A/////////////////////////////////8AAAAAQAf///////////gAAAH+AA///////////////////////////////+AAAAAAAAH///////////+ATA/gAA///////////////////////////////8AAAAAAAf//////////////AAAAf////////////////////////////////+AAAAAAAH///////////////A////////////////////////////////////wAAAAAAH/////////////////////////////////////////////////////gAf/gAAA/////////////////////////////////////////////////////8/////n//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////";
  function buildLand(){var bin=atob(MASK_B64);maskBits=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)maskBits[i]=bin.charCodeAt(i);}
  function isLand(lon,lat){var px=((lon+180)/360*MASK_W)|0,py=((90-lat)/180*MASK_H)|0;if(px<0)px=0;if(px>=MASK_W)px=MASK_W-1;if(py<0)py=0;if(py>=MASK_H)py=MASK_H-1;var idx=py*MASK_W+px;return (maskBits[idx>>3]&(1<<(7-(idx&7))))!==0;}
  var dpr=1,cssW=0,cssH=0,points=[],grat=[],reduceMotion=false;
  var CONTI={
    namerica:{zh:'北美洲',en:'North America',u:[['哈佛大学','Harvard'],['麻省理工学院','MIT'],['斯坦福大学','Stanford'],['多伦多大学','U. Toronto']]},
    samerica:{zh:'南美洲',en:'South America',u:[['圣保罗大学','U. São Paulo'],['布宜诺斯艾利斯大学','U. Buenos Aires'],['智利天主教大学','PUC Chile']]},
    europe:{zh:'欧洲',en:'Europe',u:[['牛津大学','Oxford'],['剑桥大学','Cambridge'],['苏黎世联邦理工','ETH Zürich'],['帝国理工学院','Imperial']]},
    africa:{zh:'非洲',en:'Africa',u:[['开普敦大学','U. Cape Town'],['开罗大学','Cairo U.'],['金山大学','Witwatersrand']]},
    asia:{zh:'亚洲',en:'Asia',u:[['清华大学','Tsinghua'],['北京大学','Peking U.'],['新加坡国立大学','NUS'],['东京大学','U. Tokyo']]},
    oceania:{zh:'大洋洲',en:'Oceania',u:[['墨尔本大学','U. Melbourne'],['澳大利亚国立','ANU'],['悉尼大学','U. Sydney']]}
  };
  var lift={namerica:0,samerica:0,europe:0,africa:0,asia:0,oceania:0};
  var mouseX=-999,mouseY=-999,hoverC=null,tip=document.getElementById('globe-tip');
  // Real per-cell continent map (Natural Earth admin_0 by CONTINENT, 360x180, RLE) — Siberia reassigned Europe→Asia
  var CW=360,CH=180,contGrid=null,CMAP=['','namerica','samerica','europe','africa','asia','oceania'];
  var CONT_RLE="0,2259|1,14|0,22|1,21|0,294|1,29|0,1|1,6|0,2|1,4|0,1|1,26|0,286|1,83|0,106|5,3|0,166|1,82|0,32|3,11|0,17|3,7|0,39|5,9|0,154|1,3|0,6|1,26|0,3|1,50|0,28|3,18|0,64|5,12|0,143|1,4|0,3|1,6|0,1|1,4|0,1|1,19|0,2|1,54|0,30|3,13|0,71|5,11|0,133|1,5|0,2|1,4|0,9|1,1|0,2|1,5|0,4|1,11|0,5|1,54|0,32|3,6|0,1|3,5|0,76|5,6|0,130|1,10|0,2|1,3|0,5|1,12|0,1|1,12|0,6|1,52|0,35|3,3|0,42|5,9|0,25|5,20|0,23|5,5|0,100|1,13|0,2|1,23|0,19|1,42|0,74|3,5|5,7|0,20|5,27|0,23|5,8|0,1|5,5|0,84|1,8|0,3|1,6|0,7|1,1|0,3|1,17|0,21|1,40|0,73|3,6|5,1|0,25|5,27|0,24|5,8|0,2|5,4|0,84|1,11|0,5|1,5|0,2|1,5|0,1|1,10|0,1|1,9|0,19|1,37|0,73|3,5|0,22|5,39|0,4|5,6|0,10|5,5|0,90|1,21|0,2|1,10|0,3|1,15|0,19|1,34|0,73|3,6|0,11|5,5|0,1|5,2|0,1|5,52|0,10|5,11|0,30|3,3|0,19|1,3|0,29|1,6|0,1|1,15|0,3|1,9|0,1|1,20|0,15|1,34|0,48|3,3|0,22|3,6|0,10|5,85|0,26|5,2|3,2|0,15|1,17|0,1|1,2|0,12|1,4|0,3|1,1|0,4|1,18|0,2|1,1|0,1|1,6|0,1|1,22|0,13|1,33|0,42|3,12|0,21|3,5|0,8|5,7|0,1|5,86|0,18|5,2|0,16|1,26|0,2|1,35|0,1|1,11|0,3|1,6|0,1|1,12|0,12|1,32|0,40|3,19|0,24|5,6|0,1|5,102|0,1|5,10|3,3|0,10|1,65|0,3|1,11|0,2|1,5|0,4|1,10|0,14|1,27|0,41|3,25|0,3|3,4|0,3|3,10|5,120|3,6|0,8|1,85|0,3|1,3|0,1|1,10|0,10|1,22|0,45|3,29|0,1|3,4|0,1|3,12|5,120|3,10|0,3|1,85|0,8|1,12|0,8|1,20|0,10|3,3|0,1|3,6|0,26|3,48|5,120|3,10|0,2|1,84|0,6|1,11|0,1|1,3|0,9|1,17|0,12|3,12|0,24|3,24|0,2|3,1|0,1|3,21|5,120|0,4|3,4|0,5|1,86|0,2|1,14|0,12|1,13|0,16|3,10|0,23|3,13|0,1|3,37|5,120|0,8|1,4|0,3|1,75|0,3|1,7|0,7|1,9|0,12|1,11|0,18|3,7|0,23|3,53|5,120|0,14|1,75|0,6|1,6|0,1|1,5|0,1|1,7|0,14|1,9|0,47|3,14|0,2|3,39|5,120|0,14|1,73|0,12|1,2|0,1|1,8|0,20|1,8|0,47|3,13|0,3|3,39|5,115|0,17|1,74|0,16|1,9|0,4|1,1|0,15|1,6|0,48|3,14|0,2|3,39|5,96|0,4|5,12|0,21|1,14|0,1|1,3|0,7|1,48|0,16|1,9|0,3|1,3|0,68|3,14|0,3|3,38|5,95|0,5|5,5|0,1|5,1|0,31|1,9|0,14|1,46|0,14|1,17|0,56|3,3|0,8|3,13|0,5|3,37|5,82|0,9|5,2|0,5|5,5|0,38|1,7|0,18|1,44|0,12|1,17|0,54|3,5|0,10|3,9|0,4|3,39|5,81|0,15|5,8|0,35|1,4|0,2|1,2|0,19|1,47|0,10|1,16|0,54|3,5|0,10|3,3|0,1|3,5|0,4|3,39|5,79|0,16|5,9|0,32|1,5|0,26|1,51|0,3|1,20|0,51|3,7|0,9|3,7|0,5|3,40|5,77|0,18|5,7|0,33|1,2|0,30|1,1|0,1|1,49|0,2|1,23|0,47|3,10|0,8|3,52|5,77|0,1|5,2|0,2|5,1|0,12|5,7|0,64|1,3|0,1|1,48|0,3|1,24|0,45|3,4|0,1|3,6|0,3|3,56|5,84|0,11|5,6|0,66|1,2|0,1|1,49|0,2|1,24|0,45|3,12|0,2|3,56|5,84|0,12|5,3|0,73|1,73|0,45|3,3|0,1|3,66|5,84|0,12|5,2|0,73|1,70|0,1|1,3|0,49|3,56|5,4|3,3|5,1|3,2|5,81|0,1|5,2|0,88|1,67|0,2|1,6|0,51|3,51|5,92|0,1|5,3|0,89|1,62|0,5|1,7|0,47|3,52|5,97|0,91|1,60|0,5|1,8|0,47|3,54|5,91|0,1|5,3|0,91|1,65|0,4|1,1|0,1|1,1|0,50|3,52|5,90|0,2|5,3|0,92|1,64|0,58|3,33|0,1|3,17|0,2|5,87|0,3|5,2|0,93|1,57|0,1|1,3|0,61|3,32|0,3|3,3|0,1|3,11|0,2|5,87|0,4|5,5|0,89|1,56|0,2|1,2|0,55|3,19|0,1|3,4|0,1|3,14|0,10|3,9|0,3|5,85|0,4|5,6|0,89|1,55|0,60|3,14|0,4|3,8|0,1|3,11|0,13|5,2|3,6|0,3|5,82|0,5|5,5|0,91|1,55|0,60|3,13|0,5|3,2|0,1|3,7|0,1|3,8|5,12|0,1|5,6|3,3|5,1|0,2|5,78|0,9|5,3|0,93|1,53|0,63|3,10|0,7|3,2|0,3|3,14|5,24|0,1|5,78|0,9|5,3|0,94|1,50|0,64|3,11|0,7|3,2|0,5|3,9|0,2|5,24|0,3|5,67|0,1|5,7|0,11|5,3|0,94|1,49|0,65|3,11|0,11|3,5|0,3|3,5|0,1|5,24|0,3|5,65|0,6|5,5|0,10|5,3|0,95|1,48|0,66|3,9|0,8|4,3|0,1|3,4|0,5|3,4|0,1|5,25|0,2|5,70|0,2|5,5|0,6|5,5|0,96|1,48|0,66|3,7|0,2|4,12|0,2|3,2|0,5|3,3|0,3|5,95|0,4|5,4|0,6|5,5|0,97|1,47|0,68|4,18|0,12|3,4|0,5|5,89|0,5|5,4|0,2|5,9|0,98|1,45|0,69|4,18|0,21|5,2|0,1|5,86|0,5|5,3|0,1|5,10|0,101|1,41|0,69|4,21|0,23|5,86|0,8|5,8|0,105|1,38|0,70|4,26|0,4|4,4|0,10|5,88|0,7|5,5|0,109|1,36|0,71|4,28|0,1|4,16|5,87|0,8|5,2|0,111|1,3|0,1|1,32|0,71|4,45|5,87|0,122|1,27|0,3|1,1|0,1|1,3|0,70|4,46|5,14|0,1|5,72|0,123|1,20|0,12|1,3|0,67|4,48|5,14|0,1|5,72|0,123|1,3|0,1|1,14|0,14|1,3|0,66|4,49|5,15|0,1|5,70|0,125|1,3|0,1|1,13|0,14|1,3|0,1|1,2|0,62|4,50|0,1|5,15|0,2|5,68|0,126|1,16|0,15|1,2|0,2|1,1|0,62|4,50|0,1|5,16|0,3|5,65|0,1|5,1|0,126|1,2|0,2|1,11|0,18|1,2|0,61|4,52|0,1|5,21|0,8|5,53|0,1|5,2|0,127|1,2|0,2|1,10|0,14|1,2|0,3|1,1|0,60|4,53|0,2|5,22|0,7|5,51|0,2|5,2|0,78|1,1|0,53|1,9|0,12|1,7|0,61|4,54|0,1|5,22|0,9|5,48|0,3|5,2|0,78|1,4|0,50|1,9|0,7|1,4|0,1|1,1|0,3|1,5|0,58|4,56|0,1|5,21|0,9|5,44|0,90|1,2|0,49|1,10|0,5|1,4|0,8|1,5|0,57|4,55|0,1|5,20|0,11|5,17|0,5|5,16|0,1|5,2|0,93|1,2|0,48|1,10|0,5|1,4|0,9|1,3|0,2|1,4|0,52|4,55|0,2|5,18|0,14|5,14|0,6|5,14|0,2|5,3|0,145|1,17|0,8|1,3|0,1|1,7|0,1|1,2|0,48|4,56|0,2|5,17|0,14|5,13|0,8|5,14|0,1|5,3|0,9|5,3|0,135|1,14|0,10|1,1|0,5|1,1|0,54|4,56|0,2|5,15|0,17|5,11|0,10|5,14|0,12|5,3|0,137|1,12|0,71|4,57|0,2|5,13|0,18|5,10|0,11|5,15|0,10|5,4|0,140|1,1|0,2|1,11|0,65|4,59|0,1|5,11|0,20|5,8|0,13|5,2|0,1|5,12|0,10|5,3|0,145|1,10|0,65|4,60|5,9|0,23|5,7|0,16|5,13|0,10|5,4|0,144|1,9|0,66|4,60|5,5|0,26|5,7|0,17|5,12|0,10|5,5|0,147|1,5|0,11|2,1|0,1|2,1|0,52|4,61|5,2|0,28|5,7|0,17|5,12|0,10|5,2|0,1|5,3|0,147|1,4|0,9|2,6|0,51|4,61|0,3|4,5|0,23|5,5|0,18|5,2|0,2|5,8|0,9|5,1|0,1|5,5|0,148|1,3|0,7|2,14|1,2|0,45|4,67|0,23|5,5|0,18|5,2|0,3|5,6|0,9|5,2|0,1|5,5|0,148|1,4|0,1|1,3|0,1|2,17|0,46|4,65|0,25|5,5|0,17|5,2|0,4|5,3|0,10|5,2|0,3|5,2|0,1|5,2|0,149|1,7|2,18|0,45|4,65|0,25|5,6|0,16|5,3|0,3|5,2|0,11|5,2|0,3|5,5|0,151|1,2|0,1|1,2|2,19|0,45|4,64|0,28|5,3|0,16|5,3|0,21|5,5|0,155|2,21|0,45|4,62|0,29|5,3|0,17|5,4|0,13|5,2|0,5|5,4|0,155|2,24|3,2|0,41|4,12|0,3|4,45|0,46|5,3|0,2|5,4|0,10|5,6|0,4|5,2|0,156|2,24|3,2|2,1|0,41|4,5|0,2|4,2|0,6|4,44|0,46|5,4|0,1|5,4|0,9|5,6|0,163|2,24|3,1|2,2|0,60|4,39|0,48|5,8|0,9|5,5|0,163|2,29|0,59|4,38|0,50|5,8|0,6|5,7|0,9|5,1|0,152|2,30|0,59|4,37|0,52|5,7|0,4|5,10|0,1|5,2|0,2|5,2|0,1|5,2|0,151|2,30|0,59|4,35|0,55|5,5|0,4|5,17|0,2|5,2|0,150|2,34|0,55|4,35|0,56|5,5|0,5|5,9|0,1|5,5|0,3|5,2|0,1|5,5|0,144|2,37|0,52|4,34|0,58|5,5|0,4|5,9|0,1|5,4|0,7|5,5|0,2|5,2|0,140|2,41|0,49|4,32|0,59|5,7|0,3|5,7|0,1|5,5|0,5|5,3|0,1|5,9|6,1|0,8|6,2|0,127|2,43|0,48|4,31|0,60|5,6|0,4|5,6|0,1|5,5|0,3|5,5|0,1|5,9|6,4|0,6|6,2|0,125|2,45|0,48|4,29|0,62|5,4|0,13|5,5|0,10|5,8|6,4|0,5|6,3|0,125|2,46|0,46|4,29|0,63|5,3|0,13|5,2|0,1|5,2|0,10|5,1|0,2|5,5|6,11|0,1|6,2|0,123|2,46|0,47|4,28|0,65|5,8|0,21|5,1|0,3|5,4|6,6|0,1|6,2|0,3|6,4|0,122|2,46|0,46|4,28|0,66|5,9|0,22|5,5|6,6|0,8|6,4|0,120|2,45|0,48|4,27|0,70|5,13|0,2|5,3|0,9|5,5|6,2|0,2|6,3|0,10|6,3|0,119|2,44|0,47|4,28|0,79|5,2|0,2|5,3|0,15|6,3|0,2|6,5|0,8|6,3|0,120|2,42|0,49|4,28|0,78|5,2|0,2|5,2|0,17|6,1|0,4|6,4|0,10|6,2|0,119|2,41|0,50|4,28|0,91|6,2|0,2|6,1|0,5|6,1|0,140|2,40|0,50|4,28|0,7|4,2|0,80|6,7|0,4|6,3|0,139|2,39|0,50|4,29|0,6|4,4|0,75|6,2|0,1|6,8|0,4|6,3|0,139|2,39|0,50|4,29|0,6|4,4|0,74|6,11|0,5|6,5|0,20|6,1|0,117|2,38|0,49|4,30|0,4|4,6|0,73|6,14|0,3|6,5|0,20|6,2|0,12|6,1|0,105|2,35|0,50|4,29|0,4|4,6|0,72|6,17|0,2|6,5|0,21|6,1|0,10|6,2|0,108|2,33|0,50|4,28|0,4|4,7|0,72|6,25|0,30|6,2|0,110|2,32|0,50|4,26|0,7|4,6|0,71|6,26|0,30|6,2|0,110|2,32|0,51|4,24|0,8|4,5|0,71|6,28|0,141|2,31|0,53|4,22|0,8|4,6|0,67|6,33|0,15|6,2|0,123|2,31|0,53|4,23|0,7|4,6|0,65|6,36|0,14|6,3|0,122|2,30|0,55|4,22|0,7|4,6|0,64|6,38|0,14|6,3|0,121|2,27|0,58|4,22|0,7|4,5|0,65|6,39|0,137|2,25|0,60|4,22|0,7|4,5|0,65|6,40|0,136|2,23|0,62|4,20|0,10|4,3|0,66|6,40|0,136|2,23|0,63|4,18|0,80|6,41|0,135|2,23|0,63|4,18|0,81|6,40|0,134|2,24|0,63|4,18|0,81|6,40|0,134|2,23|0,65|4,16|0,82|6,40|0,134|2,22|0,67|4,14|0,84|6,39|0,134|2,21|0,68|4,14|0,84|6,38|0,135|2,20|0,69|4,13|0,85|6,13|0,5|6,20|0,135|2,19|0,71|4,10|0,87|6,10|0,9|6,18|0,135|2,20|0,71|4,4|0,93|6,5|0,15|6,16|0,21|6,2|0,113|2,16|0,194|6,14|0,21|6,3|0,112|2,17|0,195|6,12|0,22|6,3|0,110|2,17|0,196|6,11|0,24|6,5|0,107|2,16|0,199|6,7|0,26|6,5|0,107|2,12|0,235|6,6|0,107|2,12|0,206|6,2|0,1|6,2|0,23|6,1|0,1|6,3|0,109|2,9|0,1|2,1|0,207|6,5|0,22|6,6|0,108|2,12|0,208|6,4|0,21|6,4|0,111|2,10|0,210|6,3|0,21|6,5|0,111|2,10|0,232|6,5|0,113|2,8|0,233|6,6|0,112|2,9|0,233|6,5|0,113|2,11|0,349|2,10|0,350|2,9|0,351|2,8|0,352|2,8|0,7|2,3|0,343|2,7|0,7|2,2|0,344|2,8|0,353|2,9|0,354|2,6|0,12485";
  function initCont(){var runs=CONT_RLE.split('|'),g=new Uint8Array(CW*CH),p=0;for(var i=0;i<runs.length;i++){var c=runs[i].split(','),v=+c[0],ct=+c[1];for(var j=0;j<ct;j++)g[p++]=v;}contGrid=g;}
  function continentOf(lon,lat){var px=((lon+180)/360*CW)|0,py=((90-lat)/180*CH)|0;if(px<0)px=0;if(px>=CW)px=CW-1;if(py<0)py=0;if(py>=CH)py=CH-1;var v=contGrid[py*CW+px];if(v)return CMAP[v];for(var r=1;r<=8;r++){for(var dy=-r;dy<=r;dy++){for(var dx=-r;dx<=r;dx++){if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;var nx=px+dx,ny=py+dy;if(nx<0||nx>=CW||ny<0||ny>=CH)continue;var vv=contGrid[ny*CW+nx];if(vv)return CMAP[vv];}}}return 'asia';}
  function buildPoints(){points=[];var step=CONFIG.gridStep,D=Math.PI/180;for(var lat=-58;lat<=84;lat+=step){var latR=lat*D,cyv=Math.sin(latR),rr=Math.cos(latR);for(var lon=-180;lon<180;lon+=step){if(isLand(lon,lat)){var lonR=lon*D;points.push({x:rr*Math.cos(lonR),y:cyv,z:rr*Math.sin(lonR),c:continentOf(lon,lat)});}}}}
  function updateTip(cont,sx,sy){if(!tip)return;if(!cont){tip.style.opacity='0';tip.style.visibility='hidden';return;}var lang=(typeof LANG!=='undefined'&&LANG)?LANG:'zh',d=CONTI[cont];if(tip.dataset.c!==cont||tip.dataset.l!==lang){tip.dataset.c=cont;tip.dataset.l=lang;var h='<div class="gt-name">'+(lang==='zh'?d.zh:d.en)+'</div><ul>';for(var i=0;i<d.u.length;i++){h+='<li><span class="material-symbols-rounded">school</span>'+(lang==='zh'?d.u[i][0]:d.u[i][1])+'</li>';}h+='<li class="gt-etc">'+(lang==='zh'?'等等…':'etc.')+'</li></ul>';tip.innerHTML=h;}var tw=tip.offsetWidth||178,th=tip.offsetHeight||130,px=sx+24,py=sy-th/2;if(px+tw>cssW)px=sx-24-tw;if(px<4)px=4;if(py<4)py=4;if(py+th>cssH)py=cssH-th-4;tip.style.left=px+'px';tip.style.top=py+'px';tip.style.opacity='1';tip.style.visibility='visible';}
  function buildGraticule(){grat=[];var i,j,line;for(i=0;i<CONFIG.latLines.length;i++){var lat=CONFIG.latLines[i]*Math.PI/180,cyv=Math.sin(lat),rr=Math.cos(lat);line=[];for(j=0;j<=64;j++){var a=j/64*Math.PI*2;line.push({x:rr*Math.cos(a),y:cyv,z:rr*Math.sin(a)});}grat.push(line);}for(i=0;i<CONFIG.lonCount;i++){var lon=i/CONFIG.lonCount*Math.PI;line=[];for(j=0;j<=64;j++){var a2=j/64*Math.PI*2;line.push({x:Math.sin(a2)*Math.cos(lon),y:Math.cos(a2),z:Math.sin(a2)*Math.sin(lon)});}grat.push(line);}}
  function resize(){var rect=canvas.getBoundingClientRect();cssW=Math.max(1,rect.width||300);cssH=Math.max(1,rect.height||300);dpr=Math.min(window.devicePixelRatio||1,2.5);canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(reduceMotion)renderFrame(2.4);}
  function renderFrame(yaw){
    ctx.clearRect(0,0,cssW,cssH);
    var cx=cssW/2,cy=cssH/2,R=Math.min(cssW,cssH)*CONFIG.radiusFrac,C=CONFIG.colors;
    var cosY=Math.cos(yaw),sinY=Math.sin(yaw),cosT=Math.cos(CONFIG.tiltX),sinT=Math.sin(CONFIG.tiltX),persp=CONFIG.perspective;
    for(var k in lift){lift[k]+=((hoverC===k?1:0)-lift[k])*0.18;}
    // faint lat/long lines
    ctx.lineWidth=0.8;ctx.lineCap='round';
    for(var g=0;g<grat.length;g++){var line=grat[g],prev=null;
      for(var s=0;s<line.length;s++){var q=line[s];
        var qx1=q.x*cosY+q.z*sinY, qz1=-q.x*sinY+q.z*cosY, qy2=q.y*cosT-qz1*sinT, qz2=q.y*sinT+qz1*cosT;
        var qsc=persp/(persp-qz2), cur={sx:cx-qx1*R*qsc,sy:cy-qy2*R*qsc,d:qz2};
        if(prev){var md=(prev.d+cur.d)*0.5,tt=(md+1)*0.5,al=0.025+0.12*tt;ctx.beginPath();ctx.strokeStyle='rgba('+C.grid+','+al.toFixed(3)+')';ctx.moveTo(prev.sx,prev.sy);ctx.lineTo(cur.sx,cur.sy);ctx.stroke();}
        prev=cur;
      }
    }
    // continent dots + hover detection (front hemisphere only)
    var bestD=20*20,newHover=null,hx=0,hy=0;
    for(var i=0;i<points.length;i++){var p=points[i];
      var lf=lift[p.c],gs=1+lf*0.12, px=p.x*gs,py=p.y*gs,pz=p.z*gs;
      var x1=px*cosY+pz*sinY, z1=-px*sinY+pz*cosY;
      var y2=py*cosT-z1*sinT, z2=py*sinT+z1*cosT;
      var scale=persp/(persp-z2), sx=cx-x1*R*scale, sy=cy-y2*R*scale, t=(z2+1)*0.5, rad, al, col=C.dot;
      if(z2<-0.04){ rad=CONFIG.baseDot*0.6*scale; al=0.06+0.10*t; }
      else { rad=CONFIG.baseDot*(0.6+0.7*t)*scale; al=0.42+0.55*t;
        if(lf>0.01){ rad*=1+lf*0.75; al=Math.min(1,al+lf*0.45); col=C.hi; }
        if(mouseX>-900){var ddx=sx-mouseX,ddy=sy-mouseY,dd=ddx*ddx+ddy*ddy;if(dd<bestD){bestD=dd;newHover=p.c;hx=sx;hy=sy;}}
      }
      ctx.beginPath();ctx.fillStyle='rgba('+col+','+al.toFixed(3)+')';ctx.arc(sx,sy,Math.max(0.3,rad),0,6.2832);ctx.fill();
    }
    hoverC=newHover;
    updateTip(newHover,hx,hy);
  }
  var rafId=null,lastTs=0,yawAcc=2.4;
  function tick(ts){if(!lastTs)lastTs=ts;var dt=Math.min(0.05,(ts-lastTs)/1000);lastTs=ts;yawAcc+=dt*CONFIG.rotSpeed*(hoverC?0:1);renderFrame(yawAcc);rafId=window.requestAnimationFrame(tick);}
  function start(){stop();lastTs=0;rafId=window.requestAnimationFrame(tick);}
  function stop(){if(rafId!=null){window.cancelAnimationFrame(rafId);rafId=null;}}
  function applyMotionPref(){var mq=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;reduceMotion=!!(mq&&mq.matches);}
  function init(){applyMotionPref();buildLand();initCont();buildPoints();buildGraticule();resize();if(reduceMotion)renderFrame(2.4);else start();}
  if(typeof ResizeObserver!=='undefined'){new ResizeObserver(function(){resize();}).observe(canvas);}else{window.addEventListener('resize',resize);}
  document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else if(!reduceMotion)start();});
  canvas.addEventListener('mousemove',function(e){var r=canvas.getBoundingClientRect();mouseX=e.clientX-r.left;mouseY=e.clientY-r.top;});
  canvas.addEventListener('mouseleave',function(){mouseX=-999;mouseY=-999;hoverC=null;updateTip(null);});
  init();
})();

/* ===================== epoch dark particle field (upward) ===================== */
(function(){
  var cv=document.getElementById('ritcanvas');if(!cv)return;var ctx=cv.getContext('2d');var w,h,dots=[];
  function size(){var r=cv.parentElement.getBoundingClientRect();w=cv.width=r.width;h=cv.height=r.height;dots=[];var n=Math.min(64,Math.floor(w*h/20000));for(var i=0;i<n;i++)dots.push({x:Math.random()*w,y:Math.random()*h,vy:Math.random()*.4+.12,r:Math.random()*1.5+.5,neon:Math.random()<.3});}
  function frame(){ctx.clearRect(0,0,w,h);for(var i=0;i<dots.length;i++){var d=dots[i];d.y-=d.vy;if(d.y<-5){d.y=h+5;d.x=Math.random()*w;}ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,7);ctx.fillStyle=d.neon?'rgba(204,255,0,.8)':'rgba(255,255,255,.22)';ctx.fill();if(d.neon){ctx.beginPath();ctx.arc(d.x,d.y,d.r*3,0,7);ctx.fillStyle='rgba(204,255,0,.05)';ctx.fill();}}requestAnimationFrame(frame);}
  size();addEventListener('resize',size);frame();
})();

/* ===================== init ===================== */
applyLang(LANG);
    // ---- end original script ----
  }, []);
  return <div ref={host} dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
