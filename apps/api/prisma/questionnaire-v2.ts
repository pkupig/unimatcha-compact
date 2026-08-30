/**
 * 问卷 v2 题库（设计契约：matching-ml/questionnaire/uspark_questionnaire.json）。
 *
 * 与契约的对照说明（为什么不是 34 题全上）：
 * - S0_facts（年龄/性别/城市/学校/年级）、db_gender_pref、db_age_range、S8（签名/补充信息）
 *   在产品里已由【资料页 + 匹配偏好】收集——问卷里再问一遍是重复采集，故不落题。
 *   其中 extraMatchInfo 一直随 _prefs 送进 ML；bio/签名此前从未发送（审计发现的死路），
 *   已随本次改版在 buildCandidates 补上（拼接 profile.bio + signature 发 CandidateProfile.bio）。
 * - life_smoking_self 是对契约的**补齐**：life_smoking 是「对对方的要求」（filter/hard/partner），
 *   而契约通篇没有「你自己吸不吸烟」的自述题——没有事实侧，过滤对根本没法判。
 * - SCALE 题面从契约的两极滑杆式（"家庭(1)—事业(5)"）改写为陈述句式（同意度量表），
 *   方向统一为 1=完全不同意 … 5=完全同意（与问卷描述、iOS 同向；H5 的五档顺序
 *   已随 v2 一并翻转对齐——v1 已停用不收新答案，翻转不污染任何存量配对）。
 *
 * 每题字段：code 稳定标识（打分/硬门按它找题）、semantics/hardness/weight/target 见 schema 注释。
 * 选项 value 一律稳定 snake_case——答案里存它，硬门比对它，文案（label/labelEn）随便改都不影响逻辑。
 */

export interface V2Option {
  value: string;
  label: string;
  labelEn: string;
}

export interface V2Question {
  code: string;
  type: 'SCALE' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT';
  title: string;
  titleEn: string;
  group?: string;
  semantics: 'filter' | 'similar' | 'complement' | 'freeform';
  hardness: 'hard' | 'soft';
  weight?: number;
  target?: 'self' | 'partner' | 'both';
  required?: boolean; // 缺省 true；TEXT 自由题为 false
  options?: V2Option[];
}

// ── 两套问卷共用的题（both 段）──────────────────────────────
const SHARED_HEAD: V2Question[] = [
  {
    code: 'db_distance',
    type: 'SINGLE_CHOICE',
    title: '对异地 / 距离的态度',
    titleEn: 'Your stance on distance',
    semantics: 'filter',
    hardness: 'hard',
    target: 'partner',
    options: [
      { value: 'must_same_city', label: '必须同城', labelEn: 'Must be in the same city' },
      { value: 'ok_short_distance', label: '可接受短期异地', labelEn: 'Short-term distance is OK' },
      { value: 'any', label: '都行', labelEn: 'Either is fine' },
    ],
  },
  {
    code: 'val_family',
    type: 'SCALE',
    title: '比起事业发展，我更把家庭与亲密关系放在优先位置',
    titleEn: 'I put family and close relationships ahead of career growth',
    group: '价值观',
    semantics: 'similar',
    hardness: 'soft',
  },
  {
    code: 'val_openness',
    type: 'SCALE',
    title: '我乐于和背景、文化差异很大的人深入相处',
    titleEn: 'I enjoy getting close to people from very different backgrounds',
    group: '价值观',
    semantics: 'similar',
    hardness: 'soft',
  },
];

const SHARED_TAIL = (aspSharedGroup: string): V2Question[] => [
  {
    code: 'asp_shared',
    type: 'MULTIPLE_CHOICE',
    title: '希望和对方有共同的…（可多选）',
    titleEn: 'What would you like to have in common? (multiple)',
    group: aspSharedGroup,
    semantics: 'similar',
    hardness: 'soft',
    weight: 0.8,
    target: 'both',
    options: [
      { value: 'sports', label: '运动', labelEn: 'Sports' },
      { value: 'gaming', label: '游戏', labelEn: 'Gaming' },
      { value: 'music', label: '音乐', labelEn: 'Music' },
      { value: 'movies', label: '影视', labelEn: 'Movies & TV' },
      { value: 'food', label: '美食', labelEn: 'Food' },
      { value: 'travel', label: '旅行', labelEn: 'Travel' },
      { value: 'reading', label: '读书', labelEn: 'Reading' },
      { value: 'photography', label: '摄影', labelEn: 'Photography' },
      { value: 'pets', label: '宠物', labelEn: 'Pets' },
    ],
  },
  {
    code: 'asp_traits',
    type: 'TEXT',
    title: '一句话形容你想认识的人',
    titleEn: 'Describe the person you hope to meet, in one sentence',
    semantics: 'freeform',
    hardness: 'soft',
    target: 'partner',
    required: false,
  },
  {
    code: 'db_other',
    type: 'TEXT',
    title: '还有什么是你完全无法接受的？',
    titleEn: 'Anything else you absolutely cannot accept?',
    semantics: 'freeform',
    hardness: 'hard',
    target: 'partner',
    required: false,
  },
];

// ── 恋爱问卷 v2（18 题）──────────────────────────────────────
export const ROMANTIC_V2: V2Question[] = [
  ...SHARED_HEAD,
  {
    code: 'ser_intent',
    type: 'SINGLE_CHOICE',
    title: '你想找的关系是',
    titleEn: 'What kind of relationship are you looking for?',
    group: '恋爱观',
    semantics: 'similar',
    hardness: 'soft',
    weight: 1.5, // 认真 vs 随意是价值冲突不是互补（契约原注）
    options: [
      { value: 'serious_longterm', label: '认真长期的关系', labelEn: 'A serious long-term relationship' },
      { value: 'see_how_it_goes', label: '先了解，看发展', labelEn: 'Get to know each other and see' },
      { value: 'casual', label: '轻松随意', labelEn: 'Something casual' },
    ],
  },
  {
    code: 'ser_pace',
    type: 'SCALE',
    title: '我希望关系确定得快一些，而不是慢慢来',
    titleEn: 'I prefer things to get serious quickly rather than slowly',
    group: '恋爱观',
    semantics: 'similar',
    hardness: 'soft',
  },
  {
    code: 'ser_exclusive',
    type: 'SCALE',
    title: '我非常看重关系中的忠诚与排他',
    titleEn: 'Loyalty and exclusivity matter a great deal to me',
    group: '恋爱观',
    semantics: 'similar',
    hardness: 'soft',
    weight: 1.3,
  },
  {
    code: 'life_schedule',
    type: 'SCALE',
    title: '我是夜猫子，经常凌晨才睡',
    titleEn: 'I am a night owl and often stay up past midnight',
    group: '生活习惯',
    semantics: 'similar',
    hardness: 'soft',
  },
  {
    code: 'life_clean',
    type: 'SCALE',
    title: '我会把自己的空间保持得整洁有序',
    titleEn: 'I keep my space clean and organised',
    group: '生活习惯',
    semantics: 'similar',
    hardness: 'soft',
  },
  {
    code: 'life_smoking_self',
    type: 'SINGLE_CHOICE',
    title: '你吸烟吗？',
    titleEn: 'Do you smoke?',
    semantics: 'filter',
    hardness: 'soft',
    target: 'self',
    options: [
      { value: 'no', label: '不吸烟', labelEn: 'No' },
      { value: 'occasionally', label: '偶尔', labelEn: 'Occasionally' },
      { value: 'regularly', label: '经常', labelEn: 'Regularly' },
    ],
  },
  {
    code: 'life_smoking',
    type: 'SINGLE_CHOICE',
    title: '如果对方吸烟，你…',
    titleEn: 'If your partner smokes, you…',
    semantics: 'filter',
    hardness: 'hard',
    target: 'partner',
    options: [
      { value: 'never', label: '绝对不能接受', labelEn: 'Absolutely cannot accept' },
      { value: 'tolerate', label: '不喜欢但能接受', labelEn: 'Dislike it but can tolerate' },
      { value: 'fine', label: '无所谓', labelEn: 'Do not mind' },
    ],
  },
  {
    code: 'com_expression',
    type: 'SCALE',
    title: '和人相处时，我更多是健谈的一方，而不是倾听的一方',
    titleEn: 'In conversations I tend to talk more than I listen',
    group: '沟通',
    semantics: 'complement', // 一个健谈一个倾听可互补
    hardness: 'soft',
  },
  {
    code: 'com_conflict',
    type: 'SINGLE_CHOICE',
    title: '发生矛盾时你会',
    titleEn: 'When conflict happens, you usually…',
    group: '沟通',
    semantics: 'similar',
    hardness: 'soft',
    options: [
      { value: 'talk_now', label: '当场说清楚', labelEn: 'Talk it out right away' },
      { value: 'cool_down_first', label: '先冷静再谈', labelEn: 'Cool down first, then talk' },
      { value: 'avoid', label: '回避不谈', labelEn: 'Avoid the topic' },
    ],
  },
  {
    code: 'com_frequency',
    type: 'SCALE',
    title: '我希望和对方保持高频联系，而不是彼此留很多空间',
    titleEn: 'I prefer frequent contact over lots of personal space',
    group: '沟通',
    semantics: 'similar',
    hardness: 'soft',
    weight: 1.2,
  },
  {
    code: 'fin_style',
    type: 'SCALE',
    title: '消费上我更倾向享受当下，而不是精打细算',
    titleEn: 'I would rather enjoy the moment than budget carefully',
    group: '财务观',
    semantics: 'similar',
    hardness: 'soft',
  },
  {
    code: 'fin_aa',
    type: 'SINGLE_CHOICE',
    title: '约会花费你倾向',
    titleEn: 'On date expenses you prefer…',
    group: '财务观',
    semantics: 'similar',
    hardness: 'soft',
    options: [
      { value: 'aa', label: 'AA 制', labelEn: 'Split the bill' },
      { value: 'take_turns', label: '轮流请', labelEn: 'Take turns treating' },
      { value: 'whoever_convenient', label: '谁方便谁来', labelEn: 'Whoever finds it convenient' },
    ],
  },
  ...SHARED_TAIL('价值观'), // 恋爱模式没有兴趣类目，共同爱好并进价值观（降权 0.8）
];

// ── 朋友问卷 v2（14 题）──────────────────────────────────────
export const FRIEND_V2: V2Question[] = [
  ...SHARED_HEAD,
  {
    code: 'soc_energy',
    type: 'SCALE',
    title: '聚会里我通常是活跃气氛的那个，而不是安静待着的',
    titleEn: 'At gatherings I am usually the lively one, not the quiet one',
    group: '社交风格',
    semantics: 'complement', // 一动一静可互补（契约原注）
    hardness: 'soft',
  },
  {
    code: 'soc_initiative',
    type: 'SCALE',
    title: '我更喜欢自己张罗组织活动，而不是参加别人组织的',
    titleEn: 'I prefer organising activities myself over joining ones others plan',
    group: '社交风格',
    semantics: 'complement',
    hardness: 'soft',
  },
  {
    code: 'act_types',
    type: 'MULTIPLE_CHOICE',
    title: '你常参加的活动（可多选）',
    titleEn: 'Activities you often do (multiple)',
    group: '兴趣活动',
    semantics: 'similar',
    hardness: 'soft',
    options: [
      { value: 'sports', label: '运动', labelEn: 'Sports' },
      { value: 'gaming', label: '游戏', labelEn: 'Gaming' },
      { value: 'music', label: '音乐', labelEn: 'Music' },
      { value: 'movies', label: '影视', labelEn: 'Movies & TV' },
      { value: 'food', label: '美食', labelEn: 'Food' },
      { value: 'travel', label: '旅行', labelEn: 'Travel' },
      { value: 'reading', label: '读书', labelEn: 'Reading' },
      { value: 'photography', label: '摄影', labelEn: 'Photography' },
      { value: 'boardgames', label: '桌游', labelEn: 'Board games' },
      { value: 'camping', label: '露营', labelEn: 'Camping' },
    ],
  },
  {
    code: 'act_style',
    type: 'SINGLE_CHOICE',
    title: '更喜欢的相处方式',
    titleEn: 'Preferred way to hang out',
    group: '兴趣活动',
    semantics: 'similar',
    hardness: 'soft',
    options: [
      { value: 'go_out', label: '一起出门玩', labelEn: 'Going out together' },
      { value: 'online', label: '线上开黑 / 聊天', labelEn: 'Online gaming / chatting' },
      { value: 'both_ok', label: '都可以', labelEn: 'Both work for me' },
    ],
  },
  {
    code: 'pace_plan',
    type: 'SCALE',
    title: '做事我计划性很强，而不是随性来',
    titleEn: 'I plan things carefully rather than go with the flow',
    group: '人格节奏',
    semantics: 'complement',
    hardness: 'soft',
  },
  {
    code: 'pace_reply',
    type: 'SCALE',
    title: '我习惯尽快回消息，基本不让人久等',
    titleEn: 'I reply to messages quickly and rarely keep people waiting',
    group: '人格节奏',
    semantics: 'similar',
    hardness: 'soft',
  },
  {
    code: 'plan_stage',
    type: 'SINGLE_CHOICE',
    title: '你当前阶段的重心',
    titleEn: 'Your main focus right now',
    group: '生活规划',
    semantics: 'similar',
    hardness: 'soft',
    options: [
      { value: 'study', label: '学业科研', labelEn: 'Study & research' },
      { value: 'career', label: '实习求职', labelEn: 'Internships & job hunting' },
      { value: 'social', label: '社团玩乐', labelEn: 'Clubs & having fun' },
      { value: 'startup', label: '创业搞钱', labelEn: 'Startups & making money' },
    ],
  },
  {
    code: 'plan_future',
    type: 'SCALE',
    title: '毕业后我更倾向留在国外发展，而不是回国',
    titleEn: 'After graduation I lean towards staying abroad rather than going home',
    group: '生活规划',
    semantics: 'similar',
    hardness: 'soft',
  },
  ...SHARED_TAIL('兴趣活动'),
];
