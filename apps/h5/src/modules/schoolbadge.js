// 校标（认证学校徽章）：认证用户名字后展示所属学校的小徽章。
//
// 数据来源铁律：徽章认的是 **User.verifiedSchool**（管理员审核通过时的快照），
// 不是 Profile.school。后者是用户自己随时能改的下拉框——认过 Warwick 的人
// 改一下就能挂任意学校校标，那样「认证校标」就毫无意义。
//
// 图形两级来源（用户拍板方案）：
//   1) 后台覆盖 —— School.badgeUrl 非空则用图（admin 填 URL，见 admin-web 惯例）；
//   2) 自动生成 —— 学校名推缩写 + 名字散列取色，纯 DOM 零资源、零版权风险。
//
// 严禁展示的场合（shouldShowBadge 内建拦截，调用点不必各自记得）：
//   · 未认证 / 审核中 / 被驳回 —— 徽章的全部意义就是「认证过」；
//   · 匿名帖与匿名评论 —— 校标会泄漏作者学校，等于把匿名撕开一道口子。
//
// 类名用 .sch-badge：.school-badge 已被 main.css §6.11 的旧「学校胶囊」占用
// （带 padding/黑底，会把 15px 方块的内容挤没）。

// 学校元信息缓存：{ [schoolName]: { badgeUrl, badgeText, badgeColor } }
const schoolMeta = new Map();

// 内置调色板：低饱和深色系，保证白字恒可读。
// 刻意不含品牌荧光绿 #CCFF00——本仓库铁律是它必须配黑字，且该色留给「本校/自己」的高亮语义。
const PALETTE = [
  '#2F6F4E', '#1F5673', '#6B3FA0', '#A03F5B', '#8A5A2B',
  '#3D5A80', '#4A6B2A', '#7A3E3E', '#2C5F6F', '#5B4B8A',
];

// 学校名 → 稳定色（同一学校恒定同色，跨端一致）
function colorOf(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// 学校名 → 缩写兜底。自动推导只保证「稳定且可预期」，不保证符合各校习惯
// （Peking University 会得 PU 而非通行的 PKU）——常见学校靠后台 badgeText 覆盖。
function initialsOf(name, max) {
  const s = (name || '').trim();
  if (!s) return '?';
  if (/[一-龥]/.test(s)) {
    const cjk = s.replace(/[^一-龥]/g, '');
    return (cjk || s).slice(0, 2); // 中文恒取 2 字（小尺寸方块塞不下更多）
  }
  const stop = new Set(['of', 'the', 'and', 'at', 'de', 'la', 'du', 'für', 'von']);
  const words = s.split(/[\s\-–—_.]+/).filter((w) => w && !stop.has(w.toLowerCase()));
  if (!words.length) return s.slice(0, max).toUpperCase();
  return words.slice(0, max).map((w) => w[0]).join('').toUpperCase();
}

/**
 * 该用户此刻能否展示校标。
 * @param {object} u { verificationStatus, verifiedSchool, anonymous }
 */
function shouldShowBadge(u) {
  const o = u || {};
  if (o.anonymous) return false; // 匿名绝不露校标
  if (o.verificationStatus !== 'verified') return false;
  return !!(o.verifiedSchool && String(o.verifiedSchool).trim());
}
window.shouldShowBadge = shouldShowBadge;

/**
 * 渲染校标 HTML（不含外层间距，调用方自己排版）。空串 = 不该展示。
 * @param {string} school 认证学校名（User.verifiedSchool，与 School.name 精确相等匹配）
 * @param {object} opts { size:'sm'|'md' }
 */
function schoolBadgeHtml(school, opts) {
  const o = opts || {};
  const name = String(school || '').trim();
  if (!name) return '';
  const md = o.size === 'md';
  const size = md ? 'sb-md' : 'sb-sm';
  const meta = schoolMeta.get(name) || {};
  const esc = window.escapeHtml || ((x) => x);
  // title 属性走 attrEscape 语义：escapeHtml 不转义引号，直接塞属性会破结构
  const titleAttr = ' title="' + esc(name).replace(/"/g, '&quot;') + '"';
  if (meta.badgeUrl) {
    const safe = window.safeUrl ? window.safeUrl(meta.badgeUrl) : '';
    if (safe) return `<img class="sch-badge ${size}" src="${safe}" alt=""${titleAttr} loading="lazy">`;
  }
  // sm 方块只放得下 2 字，md 放得下 3
  const maxChars = md ? 3 : 2;
  const raw = meta.badgeText ? String(meta.badgeText) : initialsOf(name, maxChars);
  const text = raw.slice(0, maxChars);
  const color = /^#[0-9a-fA-F]{6}$/.test(meta.badgeColor || '') ? meta.badgeColor : colorOf(name);
  const cjk = /[一-龥]/.test(text) ? ' sb-cjk' : ''; // CJK 字宽大，CSS 里另降一档字号
  return `<span class="sch-badge ${size} sb-gen${cjk}" style="background:${color}"${titleAttr} data-no-i18n>${esc(text)}</span>`;
}
window.schoolBadgeHtml = schoolBadgeHtml;

/** 便捷组合：满足条件才出徽章，否则空串。所有「名字 + 校标」渲染点都走它。 */
function badgeFor(user) {
  const u = user || {};
  if (!shouldShowBadge(u)) return '';
  return schoolBadgeHtml(u.verifiedSchool, { size: u.badgeSize });
}
window.badgeFor = badgeFor;

/**
 * 拉一次学校徽章元信息（公开接口）。失败不阻断——查不到就全部走自动生成，
 * 视觉上仍是完整徽章，只是用不上后台的覆盖值。
 */
async function loadSchoolBadges() {
  try {
    const res = await window.api('/public/school-badges');
    const list = (res?.data ?? res ?? {}).items || [];
    schoolMeta.clear();
    list.forEach((s) => {
      if (s && s.name) {
        schoolMeta.set(String(s.name).trim(), {
          badgeUrl: s.badgeUrl || null,
          badgeText: s.badgeText || null,
          badgeColor: s.badgeColor || null,
        });
      }
    });
  } catch (e) {
    console.warn('[badge] school meta unavailable, using generated badges');
  }
}
window.loadSchoolBadges = loadSchoolBadges;
