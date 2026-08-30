import { S } from '../state.js';

// ========================================
// QUESTIONNAIRE (dual-mode, DESIGN-DUAL-MODE §6.3)
// ========================================
// Two questionnaires (romantic / friend). Answers live in separate
// buckets on S (S.romanticAnswers / S.friendAnswers); the one currently being
// filled is selected by S.questionnaireMode and reached through currentAnswers().

// Answer bucket for the mode being filled. All render/answer helpers route
// through this so the same UI serves both questionnaires (§6.3 / G rule).
function currentAnswers() {
  return S.questionnaireMode === 'friend' ? S.friendAnswers : S.romanticAnswers;
}
window.currentAnswers = currentAnswers;

// Resume index = first question (in order) without an answer; clamp to last.
function firstUnansweredIndex(questions, answers) {
  const isAnswered = q => {
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  };
  const idx = questions.findIndex(q => !isAnswered(q));
  return idx === -1 ? Math.max(0, questions.length - 1) : idx;
}

// ========================================
// REGISTER-TIME TWO CARDS (G rule, §6.3)
// ========================================
// Renders the #questionnaire-cards overlay with completion ticks. Shown after
// registration / first home entry; both questionnaires are optional and can be
// filled in any order (or skipped). Also used as the mode-gate when a user
// enters a match mode whose questionnaire isn't completed yet (§6.3).
async function renderQuestionnaireCards() {
  // Reset card UI to a neutral state before fetching completion so a slow
  // request never leaves a stale tick from a previous account.
  ['romantic', 'friend'].forEach(mode => applyCardCompletion(mode, false));
  window.openOverlay('questionnaire-cards');
  try {
    const data = await window.api('/questionnaire/completion');
    const d = data?.data || data || {};
    applyCardCompletion('romantic', !!d.romantic?.completed);
    applyCardCompletion('friend', !!d.friend?.completed);
  } catch (e) {
    // Non-fatal: leave both cards as "去填写" if completion can't be fetched.
    console.error('Failed to load questionnaire completion:', e);
  }
}
window.renderQuestionnaireCards = renderQuestionnaireCards;

// Toggle a single card between "已填写" (check icon shown) and "去填写" states.
function applyCardCompletion(mode, completed) {
  const card = document.getElementById(`q-card-${mode}`);
  if (!card) return;
  const check = card.querySelector('.q-card-check');
  const fill = card.querySelector('.q-card-fill');
  if (check) check.classList.toggle('hidden', !completed);
  if (fill) fill.textContent = completed ? 'Retake' : 'Start';
}

function dismissQuestionnaireCards() {
  window.closeOverlay('questionnaire-cards');
}
window.dismissQuestionnaireCards = dismissQuestionnaireCards;

// Card "去填写 / 重新填写" handler: close the cards overlay, open the
// questionnaire page in the chosen mode.
async function startQuestionnaire(mode = 'romantic') {
  // 作答前的「犀利提示」：做好心理准备 + 声明无冒犯之意 + 答案保密（本轮反馈）
  const zh = typeof window.getLang === 'function' && window.getLang() === 'zh';
  const ok = await window.confirmCard(zh ? {
    title: '开始前，先说一句',
    body: '接下来的问题会比较犀利、直接，请先做好心理准备。这些问题绝无任何冒犯之意，只是为了更真实地了解你、给你更精准的匹配。你的所有作答都会严格保密、不会公开给任何人。凭第一反应、如实作答就好。',
    confirmLabel: '我准备好了',
    cancelLabel: '再想想',
  } : {
    title: 'Before you start',
    body: 'The questions ahead are direct and personal — be ready. No offence is intended: honest answers simply make your matches better. Everything you answer is strictly confidential and never shown to anyone. Go with your first instinct.',
    confirmLabel: "I'm ready",
    cancelLabel: 'Maybe later',
  });
  if (!ok) return; // 取消则留在卡片页，不进入问卷
  window.closeOverlay('questionnaire-cards');
  window.showPage('page-questionnaire');
  window.loadQuestionnaire(mode);
}
window.startQuestionnaire = startQuestionnaire;

// ========================================
// QUESTIONNAIRE PAGE
// ========================================
async function loadQuestionnaire(mode = 'romantic') {
  S.questionnaireMode = mode === 'friend' ? 'friend' : 'romantic';
  // Mode badge (Romantic / Friend, §6.3). 用 Material Symbols 图标替代 emoji，
  // 与全软件统一图标风格（auto_awesome=恋人 / group=朋友）。
  const badge = document.getElementById('q-mode-badge');
  if (badge) {
    const isFriend = S.questionnaireMode === 'friend';
    const icon = isFriend ? 'group' : 'auto_awesome';
    const label = isFriend ? 'Friend' : 'Romantic';
    badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;line-height:1">${icon}</span>${label}`;
  }

  try {
    const data = await window.api(`/questionnaire/active?type=${S.questionnaireMode}`);
    const prevVersionId = S.questionnaire?.id;
    const q = data.data || data;
    S.questionnaire = q;
    const questions = q?.questions || [];
    const answers = currentAnswers();

    // A19: don't blow away in-progress answers when re-entering the same
    // questionnaire version (e.g. navigating away and back mid-assessment).
    const sameVersion = prevVersionId && prevVersionId === q?.id;
    const hasInMemory = answers && Object.keys(answers).length > 0;
    if (sameVersion && hasInMemory) {
      if (questions.length) {
        if (S.currentQuestion == null || S.currentQuestion >= questions.length) {
          S.currentQuestion = firstUnansweredIndex(questions, answers);
        }
        window.renderQuestion();
      }
      return;
    }

    // Different/first version: try to recover previously submitted answers so
    // a returning user resumes instead of starting over. Reset only this mode's
    // bucket (the other mode's in-progress answers are left intact).
    const fresh = {};
    if (S.questionnaireMode === 'friend') S.friendAnswers = fresh; else S.romanticAnswers = fresh;
    S.currentQuestion = 0;
    if (q?.id) {
      try {
        const res = await window.api(`/answers/mine?versionId=${encodeURIComponent(q.id)}`);
        const saved = Array.isArray(res) ? res : (res?.data || res?.items || []);
        if (Array.isArray(saved) && saved.length) {
          saved.forEach(a => {
            const qid = a.questionId || a.question_id;
            if (qid != null) fresh[qid] = a.value;
          });
          S.currentQuestion = firstUnansweredIndex(questions, fresh);
        }
      } catch (e) {
        // Non-fatal: no saved answers (or fetch failed) → start fresh.
        console.error('Failed to load saved answers:', e);
      }
    }
    if (questions.length) window.renderQuestion();
  } catch (e) {
    console.error('Failed to load questionnaire:', e);
    window.toast('Failed to load questionnaire');
  }
}
window.loadQuestionnaire = loadQuestionnaire;

// Re-enter the current-mode questionnaire from the match-settings sheet.
// loadQuestionnaire() restores any previously-saved/in-progress answers (A19),
// so this resumes rather than wiping progress.
function retakeQuestionnaire(mode) {
  window.hideOverlay('match-settings-overlay');
  window.showPage('page-questionnaire');
  // No explicit mode → retake the questionnaire for the match mode whose
  // settings sheet is open (§6.4 sets S.activeMatchMode per mode).
  window.loadQuestionnaire(mode || S.activeMatchMode || 'romantic');
}
window.retakeQuestionnaire = retakeQuestionnaire;

function renderQuestion() {
  if (!S.questionnaire?.questions?.length) return;
  const answers = currentAnswers();
  const q = S.questionnaire.questions[S.currentQuestion];
  const total = S.questionnaire.questions.length;
  const num = S.currentQuestion + 1;
  const pNum = document.getElementById('q-progress-num');
  const pTotal = document.getElementById('q-total');
  const wm = document.getElementById('q-watermark');
  const pBar = document.getElementById('q-progress-bar');
  if (pNum) pNum.textContent = String(num).padStart(2, '0');
  if (pTotal) pTotal.textContent = String(total).padStart(2, '0');
  if (wm) wm.textContent = `Q.${String(num).padStart(2, '0')}`;
  if (pBar) pBar.style.width = `${num / total * 100}%`;
  const qText = document.getElementById('q-text');
  // 英文态优先英文题面（titleEn），中文态用中文原题；缺英文时回退中文
  const zh = typeof window.getLang === 'function' && window.getLang() === 'zh';
  if (qText) qText.textContent = (zh ? q.title : (q.titleEn || q.title)) || q.text || q.question;
  const optC = document.getElementById('q-options');
  if (!optC) return;
  if (q.type === 'SCALE') {
    // 1=非常不同意 … 5=非常同意（与问卷描述、iOS 同向；v2 上线时翻转，见提交说明）
    const labels = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
    optC.innerHTML = Array.from({
      length: 5
    }, (_, i) => {
      const val = i + 1;
      const sel = answers[q.id] === val;
      return `<label class="group flex items-center justify-between px-4 py-3 border-b ${sel ? 'border-neon bg-neon/10' : 'border-outline-variant/30'} hover:bg-surface-container-low cursor-pointer transition-all duration-200 active:scale-[0.99]" onclick="answerScale('${q.id}', ${val})">
        <span class="font-body text-base font-medium">${labels[i]}</span>
        <div class="w-6 h-6 rounded-full border-2 ${sel ? 'border-outline bg-neon' : 'border-outline'} flex items-center justify-center"></div>
      </label>`;
    }).join('');
  } else if (q.type === 'TEXT') {
    // v2 自由题多为选填（isRequired=false）：给出「可留空」提示，别让人卡在这题
    const optional = q.isRequired === false
      ? `<p class="text-[11px] text-outline mb-2">Optional — leave blank to skip</p>` : '';
    optC.innerHTML = `${optional}<textarea class="w-full bg-surface-container-low rounded-[10px] border-0 px-3 py-2.5 focus:ring-1 focus:ring-neon focus:outline-none" rows="4" placeholder="Your answer..." oninput="answerText('${q.id}', this.value)">${window.escapeHtml(answers[q.id] || '')}</textarea>`;
  } else {
    const options = q.options || [];
    const multi = q.type === 'MULTIPLE_CHOICE';
    const hint = multi ? `<p class="text-[11px] text-outline mb-2">Select all that apply</p>` : '';
    optC.innerHTML = hint + options.map(o => {
      const val = String(o.value || o.id || '');
      const sel = multi ? (answers[q.id] || []).includes(val) : answers[q.id] === val;
      // value 不拼进 inline onclick 的 JS 串（escapeHtml 不转义引号，含 ' 的值会逃逸）；
      // 存 data-value、点击时从 this.dataset 读——与评论图 onclick 的既定做法一致。
      // 选项文案按语言取 labelEn/label（与题面 titleEn 同一模式），data-no-i18n 防词典误翻。
      const text = zh ? (o.label || o.text || val) : (o.labelEn || o.label || o.text || val);
      const shape = multi ? 'rounded-[6px]' : 'rounded-full';
      return `<label class="group flex items-center justify-between px-4 py-3 border-b ${sel ? 'border-neon bg-neon/10' : 'border-outline-variant/30'} hover:bg-surface-container-low cursor-pointer transition-all duration-200 active:scale-[0.99]" data-value="${window.escapeHtml(val).replace(/"/g, '&quot;')}" onclick="answerChoiceEl(this)">
        <span class="font-body text-base font-medium" data-no-i18n>${window.escapeHtml(text)}</span>
        <div class="w-6 h-6 ${shape} border-2 ${sel ? 'border-outline bg-neon text-black' : 'border-outline'} flex items-center justify-center">${sel ? '<span class="material-symbols-outlined" style="font-size:16px">check</span>' : ''}</div>
      </label>`;
    }).join('');
  }
  const prevBtn = document.getElementById('q-prev-btn');
  if (prevBtn) prevBtn.style.visibility = S.currentQuestion > 0 ? 'visible' : 'hidden';
  const nextBtn = document.getElementById('q-next-btn');
  if (nextBtn) {
    nextBtn.innerHTML = S.currentQuestion === total - 1 ? 'Submit <span class="material-symbols-outlined">check</span>' : 'Next <span class="material-symbols-outlined">arrow_forward</span>';
  }
}
window.renderQuestion = renderQuestion;

// ── 题目导航（用户反馈：可任选题目，标记已答/未答）──
function openQNav() {
  const questions = S.questionnaire?.questions || [];
  const grid = document.getElementById('q-nav-grid');
  if (!grid || !questions.length) return;
  const answers = currentAnswers();
  const isAnswered = (qq) => {
    const v = answers[qq.id];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  };
  grid.innerHTML = questions.map((qq, i) => {
    const done = isAnswered(qq);
    const cur = i === S.currentQuestion;
    const base = 'w-9 h-9 rounded-[10px] font-headline text-xs font-bold flex items-center justify-center active:scale-90 transition-transform';
    const look = done ? 'bg-neon text-black' : 'border border-outline-variant text-on-surface-variant';
    const ring = cur ? ' ring-2 ring-black dark:ring-white' : '';
    return '<button class="' + base + ' ' + look + ring + '" onclick="jumpToQuestion(' + i + ')">' + (i + 1) + '</button>';
  }).join('');
  window.openOverlay('q-nav-overlay');
}
window.openQNav = openQNav;

function jumpToQuestion(i) {
  flushCurrentTextAnswer();
  S.currentQuestion = i;
  window.hideOverlay('q-nav-overlay');
  window.renderQuestion();
}
window.jumpToQuestion = jumpToQuestion;

// 选择题点击入口：值从 data-value 读，不经过 inline JS 字符串。
// 当前题从 S 里取——渲染和点击之间题目不会变（renderQuestion 整块重写 #q-options）。
function answerChoiceEl(el) {
  const q = S.questionnaire?.questions?.[S.currentQuestion];
  if (!q) return;
  const val = el?.dataset?.value ?? '';
  if (q.type === 'MULTIPLE_CHOICE') answerMultiple(q.id, val);
  else answerSingle(q.id, val);
}
window.answerChoiceEl = answerChoiceEl;

function answerSingle(qId, val) {
  currentAnswers()[qId] = val;
  window.renderQuestion();
}
window.answerSingle = answerSingle;

function answerMultiple(qId, val) {
  const answers = currentAnswers();
  if (!answers[qId]) answers[qId] = [];
  const idx = answers[qId].indexOf(val);
  if (idx >= 0) answers[qId].splice(idx, 1);else answers[qId].push(val);
  window.renderQuestion();
}
window.answerMultiple = answerMultiple;

function answerScale(qId, val) {
  currentAnswers()[qId] = val;
  window.renderQuestion();
}
window.answerScale = answerScale;

function answerText(qId, val) {
  currentAnswers()[qId] = val;
}
window.answerText = answerText;

// Flush the current TEXT question's textarea value into the active answer bucket
// before any navigation, in case oninput hasn't fired (e.g. pending IME
// composition) and the DOM is about to be replaced by renderQuestion().
function flushCurrentTextAnswer() {
  const q = S.questionnaire?.questions?.[S.currentQuestion];
  if (!q || q.type !== 'TEXT') return;
  const ta = document.querySelector('#q-options textarea');
  if (ta) currentAnswers()[q.id] = ta.value;
}

function nextQuestion() {
  if (!S.questionnaire?.questions) return;
  flushCurrentTextAnswer();
  if (S.currentQuestion < S.questionnaire.questions.length - 1) {
    S.currentQuestion++;
    window.renderQuestion();
  } else {
    window.submitAnswers();
  }
}
window.nextQuestion = nextQuestion;

function prevQuestion() {
  flushCurrentTextAnswer();
  if (S.currentQuestion > 0) {
    S.currentQuestion--;
    window.renderQuestion();
  }
}
window.prevQuestion = prevQuestion;

// An answer is "blank" if the user has no real selection: undefined/null, an
// empty string (a TEXT box typed into then cleared), or an empty array (a
// MULTIPLE_CHOICE selected then fully deselected). This mirrors
// firstUnansweredIndex's notion of "answered" so submit and resume agree.
function isBlankAnswer(v) {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

// A20: 防止重复提交导致重复 POST（连点/双击）。提交进行中时短路。
let isSubmitting = false;

async function submitAnswers() {
  if (isSubmitting) return;
  flushCurrentTextAnswer();
  const answers = currentAnswers();
  const questions = S.questionnaire?.questions || [];

  // 后端会拒绝任何未作答的必答题（返回通用错误）。提交前先在客户端拦截：
  // 找出未作答的必答题，跳到第一个并提示用户，避免提交失败只给通用 toast。
  const firstMissing = questions.findIndex(q => q.isRequired && isBlankAnswer(answers[q.id]));
  if (firstMissing !== -1) {
    S.currentQuestion = firstMissing;
    window.renderQuestion();
    const q = questions[firstMissing];
    const zh = typeof window.getLang === 'function' && window.getLang() === 'zh';
    const label = (zh ? q.title : (q.titleEn || q.title)) || q.text || q.question || 'this question';
    window.toast('Please answer required question: ' + label);
    return;
  }

  const nextBtn = document.getElementById('q-next-btn');
  isSubmitting = true;
  if (nextBtn) nextBtn.disabled = true;
  try {
    // Questionnaires are optional/partial (G rule). Drop blank entries so a
    // cleared TEXT field or emptied MULTIPLE_CHOICE isn't POSTed as a real
    // answer (which the front-end itself treats as unanswered).
    const formatted = Object.entries(answers)
      .filter(([, val]) => !isBlankAnswer(val))
      .map(([qId, val]) => ({
        questionId: qId,
        value: val
      }));
    const res = await window.api('/answers', 'POST', {
      questionnaireVersionId: S.questionnaire.id,
      answers: formatted
    });
    const result = res?.data || res || {};
    const count = result.answeredCount;
    window.toast(typeof count === 'number' ? `Assessment complete! ${count} questions answered` : 'Assessment complete!');
    // Return to home and switch to the match mode whose questionnaire we filled
    // (§6.3). 先把 homeView 设成刚填的模式，再走 showPage + switchTab('match')：
    // switchTab 内部会显示 #tab-match 覆盖层并调 switchHomeView(S.homeView)，
    // 避免直接 switchHomeView 时露出 #page-home 遗留内容。
    S.homeView = S.questionnaireMode;
    window.showPage('page-home');
    window.switchTab('match');
  } catch (e) {
    window.toast('Submit failed: ' + e.message);
  } finally {
    isSubmitting = false;
    if (nextBtn) nextBtn.disabled = false;
  }
}
window.submitAnswers = submitAnswers;
