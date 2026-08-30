import { Injectable, Logger } from '@nestjs/common';
import {
  MatchModelProvider,
  CandidateProfile,
  MatchConstraints,
  MatchResult,
  MatchPair,
  AnswerData,
} from './match-model.interface';
import type { ModeStr } from '../mode.util';
import { ENERGY_COST_ROMANTIC } from '../../energy/energy.service';

/**
 * ─── ScoringMatchModelProvider ────────────────────────────────────────────
 * 双模式（恋人 / 朋友）多维度量化评分匹配算法（§3.6 / §5.6 / §10.3）。
 *
 * 总分满分 100 分：
 *   ① 问卷兼容性评分（70分）：按 mode 选用对应分类权重表计算答案相似度
 *   ② 人口信息评分（30分）：年龄差距、同城、同校（朋友模式仍计，但硬约束放宽）
 *
 * 硬性约束（得分为 0）：
 *   - 恋人：性别偏好双向兼容、同城/同校（启用时）、偏好性别/年龄/学段
 *   - 朋友：软约束为主——默认不强制性别；仅当用户显式设置 preferredGender 等才生效
 *
 * 产出（§3.6）：
 *   - 恋人 maxMatchesPerUser=1：greedyMatch
 *   - 朋友 maxMatchesPerUser=5：multiMatch（每人取 Top-N，N≤5，可同时多个朋友）
 *
 * 增强（J 规则 §10.3）：generateMatches 两阶段——
 *   阶段一：增强用户无视 75 分阈值强配（恋人取最高分1；朋友取 Top-N，N=enhancedCost）；空池记入 emptyPoolUserIds。
 *   阶段二：普通用户走 threshold=75 的 greedy/multiMatch。
 */

const SCORE_THRESHOLD = 75; // 最低匹配评分（0-100），仅普通用户配对生效

// 模块级 logger：供下方独立评分函数记录容错日志（如答案无法解析被跳过）
const scoringLogger = new Logger('ScoringMatchModel');

// ── 恋人问卷分类权重（总计 = 1.0，§3.6） ──
const ROMANTIC_CATEGORY_WEIGHTS: Record<string, number> = {
  '生活习惯': 0.15,
  '价值观':   0.20,
  '恋爱观':   0.25,
  '沟通':     0.20,
  '财务观':   0.20,
};

// ── 朋友问卷分类权重（总计 = 1.0，§5.6） ──
const FRIEND_CATEGORY_WEIGHTS: Record<string, number> = {
  '社交风格': 0.15,
  '兴趣活动': 0.25,
  '人格节奏': 0.20,
  '价值观':   0.20,
  '生活规划': 0.20,
};

// general 分类：承接超范围 order / 未知分类的题，按平均权重参与归一化（不被静默丢弃）
const GENERAL_GROUP = 'general';
const GENERAL_WEIGHT = 0.20;

function categoryWeightsOf(mode: ModeStr): Record<string, number> {
  return mode === 'friend' ? FRIEND_CATEGORY_WEIGHTS : ROMANTIC_CATEGORY_WEIGHTS;
}

// 通过 grade 文案推断学段（undergraduate/master/doctor），无法判断返回 null（宽松处理，不淘汰）
function inferStageFromGrade(grade?: string): string | null {
  if (!grade) return null;
  const g = grade.trim().toLowerCase();
  if (/博士|博一|博二|博三|博四|phd|doctor/.test(g)) return 'doctor';
  if (/研一|研二|研三|硕士|硕|master|postgrad/.test(g)) return 'master';
  if (/大一|大二|大三|大四|本科|undergrad|^year\s*\d/.test(g)) return 'undergraduate';
  return null;
}

// 通过 order 推断分类（兜底逻辑）；按 mode 切换映射（恋人 1-50 / 朋友 1-25，§5.6）
function inferGroupByOrder(order: number, mode: ModeStr): string {
  if (mode === 'friend') {
    if (order >= 1  && order <= 5)  return '社交风格';
    if (order >= 6  && order <= 10) return '兴趣活动';
    if (order >= 11 && order <= 15) return '人格节奏';
    if (order >= 16 && order <= 20) return '价值观';
    if (order >= 21 && order <= 25) return '生活规划';
    return GENERAL_GROUP;
  }
  if (order >= 1  && order <= 10) return '生活习惯';
  if (order >= 11 && order <= 20) return '价值观';
  if (order >= 21 && order <= 30) return '恋爱观';
  if (order >= 31 && order <= 40) return '沟通';
  if (order >= 41 && order <= 50) return '财务观';
  return GENERAL_GROUP;
}

// 多选题值归一化：兼容数组与 JSON 字符串，统一为非空字符串数组（无法解析返回 null）
function normalizeMultiChoiceValue(value: any): string[] | null {
  let v = value;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    if (s.startsWith('[')) {
      try {
        v = JSON.parse(s);
      } catch {
        return null;
      }
    } else {
      v = [s];
    }
  }
  if (!Array.isArray(v)) return null;
  const items = v.map((x) => String(x).trim()).filter((x) => x.length > 0);
  return items.length > 0 ? items : null;
}

// ─── 单对用户评分（按 mode 切换硬约束与权重表） ──────────────────────────────
function calculatePairScore(a: CandidateProfile, b: CandidateProfile, mode: ModeStr): number {
  const aPrefs = (a as any)._prefs;
  const bPrefs = (b as any)._prefs;
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

  // ── 1. 硬性约束检查 ──────────────────────────────────────────────────────
  if (mode === 'romantic') {
    // 恋人：性别偏好双向兼容（A 接受 B 的性别 且 B 接受 A 的性别）
    const aAcceptsB = a.genderPref === 'any' || a.genderPref === b.gender;
    const bAcceptsA = b.genderPref === 'any' || b.genderPref === a.gender;
    if (!aAcceptsB || !bAcceptsA) return 0;
  } else {
    // 朋友：默认不强制性别；仅当用户显式设置 preferredGender 时该方偏好生效（软约束转硬约束）
    if (aPrefs?.preferredGender && b.gender && b.gender !== aPrefs.preferredGender) return 0;
    if (bPrefs?.preferredGender && a.gender && a.gender !== bPrefs.preferredGender) return 0;
  }

  // 同城要求（任一方城市为空时无法验证，保守拒绝）——恋人/朋友均尊重显式偏好
  if (aPrefs?.requireSameCity || bPrefs?.requireSameCity) {
    if (!a.city || !b.city || norm(a.city) !== norm(b.city)) return 0;
  }
  // 同校要求（任一方学校为空时无法验证，保守拒绝）
  if (aPrefs?.requireSameUniversity || bPrefs?.requireSameUniversity) {
    if (!a.school || !b.school || norm(a.school) !== norm(b.school)) return 0;
  }
  // 恋人模式额外尊重 preferredGender（朋友模式上面已处理）
  if (mode === 'romantic') {
    if (aPrefs?.preferredGender && b.gender && b.gender !== aPrefs.preferredGender) return 0;
    if (bPrefs?.preferredGender && a.gender && a.gender !== bPrefs.preferredGender) return 0;
  }
  // 偏好年龄区间（两模式都尊重显式设置）
  if (aPrefs?.ageMin != null && b.age && b.age < aPrefs.ageMin) return 0;
  if (aPrefs?.ageMax != null && b.age && b.age > aPrefs.ageMax) return 0;
  if (bPrefs?.ageMin != null && a.age && a.age < bPrefs.ageMin) return 0;
  if (bPrefs?.ageMax != null && a.age && a.age > bPrefs.ageMax) return 0;
  // 偏好学段（逗号分隔多值，集合包含；grade 无法判断学段时不淘汰，空偏好=不限）
  if (aPrefs?.universityStage) {
    const stagesA = String(aPrefs.universityStage)
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    const stageB = inferStageFromGrade(b.grade);
    if (stagesA.length > 0 && stageB && !stagesA.includes(stageB)) return 0;
  }
  if (bPrefs?.universityStage) {
    const stagesB = String(bPrefs.universityStage)
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    const stageA = inferStageFromGrade(a.grade);
    if (stagesB.length > 0 && stageA && !stagesB.includes(stageA)) return 0;
  }

  // ── 1.5 问卷 v2 过滤题硬门（与 matching-ml rules.hard_gate 保持双实现一致）──
  // 距离：任一方选了「必须同城」→ 双方城市都已知且不同则淘汰（有一方未知不淘汰：
  // 问卷答案不是 requireSameCity 那种显式开关，宁可放过不误杀）。
  // 吸烟（恋人）：一方「绝对不能接受」而另一方自述偶尔/经常吸 → 淘汰。
  if (!passesV2Filters(a, b, mode)) return 0;

  // ── 2. 问卷兼容性评分（0–70分，按 mode 选权重表） ────────────────────────
  const questionnaireScore = calcQuestionnaireScore(a.answers, b.answers, mode);

  // ── 3. 人口信息评分（0–30分） ────────────────────────────────────────────
  // 朋友模式：把「同城/同校加成」换成「兴趣/活动交集加成」更符合社交语义
  const demographicScore = mode === 'friend'
    ? calcFriendDemographicScore(a, b)
    : calcDemographicScore(a, b);

  // ── 4. 按双方「匹配依据」(matchBasis) 决定计分维度 ─────────────────────────
  const basisA = (aPrefs?.matchBasis as string) || 'both';
  const basisB = (bPrefs?.matchBasis as string) || 'both';

  let total: number;
  if (basisA === 'questionnaire' && basisB === 'questionnaire') {
    total = (questionnaireScore / 70) * 100;
  } else if (basisA === 'profile' && basisB === 'profile') {
    total = (demographicScore / 30) * 100;
  } else {
    total = questionnaireScore + demographicScore;
  }

  return Math.round(Math.min(100, Math.max(0, total)) * 10) / 10;
}

// v2 complement 相似度查表：|差值| 0..4 → 得分。峰值在差 2（适度互补最好），
// 完全相同 0.5（不冲突但没有互补火花）、极端相反 0.3（差太多难相处）。
const COMPLEMENT_TABLE = [0.5, 0.8, 1.0, 0.7, 0.3];

// 按 code 取某人的答案值（v2 硬门用；answers 少、线性扫无所谓）
function answerByCode(answers: AnswerData[], code: string): any {
  return answers.find((a) => a.questionCode === code)?.value;
}

// 问卷 v2 过滤题硬门。语义与 matching-ml rules.hard_gate 的 v2 段保持一致——
// 双实现（TS 兜底 / Python 主力）改任何一边都必须同步另一边。
function passesV2Filters(a: CandidateProfile, b: CandidateProfile, mode: ModeStr): boolean {
  const distA = answerByCode(a.answers, 'db_distance');
  const distB = answerByCode(b.answers, 'db_distance');
  const eq = (x?: string | null, y?: string | null) =>
    (x ?? '').trim().toLowerCase() === (y ?? '').trim().toLowerCase();
  const sameCity = a.city && b.city && eq(a.city, b.city);
  if (distA === 'must_same_city' && a.city && b.city && !sameCity) return false;
  if (distB === 'must_same_city' && a.city && b.city && !sameCity) return false;

  if (mode === 'romantic') {
    const smokes = (v: any) => v === 'occasionally' || v === 'regularly';
    if (answerByCode(a.answers, 'life_smoking') === 'never' && smokes(answerByCode(b.answers, 'life_smoking_self'))) return false;
    if (answerByCode(b.answers, 'life_smoking') === 'never' && smokes(answerByCode(a.answers, 'life_smoking_self'))) return false;
  }
  return true;
}

// 问卷兼容性评分（满分70，按 mode 选权重表）
function calcQuestionnaireScore(
  answersA: AnswerData[],
  answersB: AnswerData[],
  mode: ModeStr,
): number {
  const CATEGORY_WEIGHTS = categoryWeightsOf(mode);

  const mapA = new Map<string, AnswerData>(answersA.map((a) => [a.questionId, a]));
  const mapB = new Map<string, AnswerData>(answersB.map((b) => [b.questionId, b]));

  const groupSimilarities: Record<string, { sum: number; count: number }> = {};

  for (const [qid, adA] of mapA) {
    const adB = mapB.get(qid);
    if (!adB) continue;

    if (adA.questionType === 'TEXT') continue;
    // v2：filter 语义的题不做相似度打分（它们只进硬门）；freeform 已被 TEXT 跳过
    if (adA.semantics === 'filter') continue;


    let similarity: number;

    if (adA.questionType === 'SCALE') {
      const valA = Number(adA.value);
      const valB = Number(adB.value);
      if (isNaN(valA) || isNaN(valB)) continue;
      if (valA < 1 || valA > 5 || valB < 1 || valB > 5) continue;
      // v2 complement：适度差异得分更高（一动一静/一说一听可互补）。
      // 离散五档查表而不是拟合曲线——更好测也更好调。
      similarity = adA.semantics === 'complement'
        ? COMPLEMENT_TABLE[Math.round(Math.abs(valA - valB))]
        : 1 - Math.abs(valA - valB) / 4;
    } else if (adA.questionType === 'SINGLE_CHOICE') {
      if (adA.value == null || adB.value == null) continue;
      similarity = String(adA.value) === String(adB.value) ? 1 : 0;
    } else if (adA.questionType === 'MULTIPLE_CHOICE') {
      const listA = normalizeMultiChoiceValue(adA.value);
      const listB = normalizeMultiChoiceValue(adB.value);
      if (!listA || !listB) {
        const bad = [
          !listA ? `valueA=${JSON.stringify(adA.value)}` : null,
          !listB ? `valueB=${JSON.stringify(adB.value)}` : null,
        ].filter(Boolean).join(', ');
        scoringLogger.warn(`[Scoring] 多选题答案无法解析，跳过计分: questionId=${qid}, ${bad}`);
        continue;
      }
      const setA = new Set(listA);
      const setB = new Set(listB);
      const union = new Set([...setA, ...setB]);
      if (union.size === 0) continue;
      let intersection = 0;
      for (const item of setA) if (setB.has(item)) intersection += 1;
      similarity = intersection / union.size;
    } else {
      continue;
    }

    // 确定分类（未知分类统一归入 general，参与权重归一化，不被静默丢弃）
    let group = adA.questionGroup || inferGroupByOrder(adA.questionOrder || 0, mode);
    if (!(group in CATEGORY_WEIGHTS)) group = GENERAL_GROUP;

    // v2 题内权重：组内加权平均（v1 老题 weight 恒 1，行为不变）
    const w = adA.weight && adA.weight > 0 ? adA.weight : 1;
    if (!groupSimilarities[group]) groupSimilarities[group] = { sum: 0, count: 0 };
    groupSimilarities[group].sum += similarity * w;
    groupSimilarities[group].count += w;
  }

  const weightedGroups: [string, number][] = [
    ...Object.entries(CATEGORY_WEIGHTS),
    [GENERAL_GROUP, GENERAL_WEIGHT],
  ];
  const presentGroups = weightedGroups.filter(
    ([group]) => (groupSimilarities[group]?.count ?? 0) > 0,
  );
  const totalWeight = presentGroups.reduce((sum, [, weight]) => sum + weight, 0);

  if (totalWeight === 0) return 0.5 * 70;

  let normalizedScore = 0;
  for (const [group, weight] of presentGroups) {
    const data = groupSimilarities[group];
    normalizedScore += (weight / totalWeight) * (data.sum / data.count);
  }

  return normalizedScore * 70;
}

// 恋人人口信息评分（满分30）
function calcDemographicScore(a: CandidateProfile, b: CandidateProfile): number {
  let score = 0;

  if (a.age && b.age) {
    const ageDiff = Math.abs(a.age - b.age);
    if      (ageDiff <= 1) score += 15;
    else if (ageDiff <= 2) score += 13;
    else if (ageDiff <= 3) score += 11;
    else if (ageDiff <= 4) score += 9;
    else if (ageDiff <= 5) score += 7;
    else if (ageDiff <= 7) score += 5;
    else                   score += 2;
  } else {
    score += 8;
  }

  if (a.city && b.city) {
    if (a.city === b.city) score += 10;
    else                   score += 4;
  } else {
    score += 6;
  }

  if (a.school && b.school) {
    if (a.school === b.school) score += 5;
    else                       score += 1;
  } else {
    score += 3;
  }

  return Math.min(30, score);
}

// 朋友人口信息评分（满分30）：兴趣交集 + 活动交集 + 同校加成（社交语义）
function calcFriendDemographicScore(a: CandidateProfile, b: CandidateProfile): number {
  let score = 0;

  // 兴趣交集（满分15）：交集数越多越高
  const interA = new Set((a.interests || []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const interB = new Set((b.interests || []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  let interCommon = 0;
  for (const i of interA) if (interB.has(i)) interCommon += 1;
  if (interA.size > 0 && interB.size > 0) {
    score += Math.min(15, interCommon * 5);
  } else {
    score += 6; // 信息缺失给中性分
  }

  // 活动交集（满分10）
  const actA = new Set((a.activities || []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const actB = new Set((b.activities || []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  let actCommon = 0;
  for (const x of actA) if (actB.has(x)) actCommon += 1;
  if (actA.size > 0 && actB.size > 0) {
    score += Math.min(10, actCommon * 5);
  } else {
    score += 4;
  }

  // 同校加成（满分5）：朋友更看重同校（同圈子）
  if (a.school && b.school) {
    if (a.school === b.school) score += 5;
    else                       score += 2;
  } else {
    score += 3;
  }

  return Math.min(30, score);
}

// ─── 恋人贪心最优匹配（一人一对，maxMatchesPerUser=1） ───────────────────────
function greedyMatch(
  candidates: CandidateProfile[],
  threshold: number,
  mode: ModeStr,
): { a: string; b: string; score: number }[] {
  const validPairs: { a: string; b: string; score: number }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const score = calculatePairScore(candidates[i], candidates[j], mode);
      if (score >= threshold) {
        validPairs.push({ a: candidates[i].userId, b: candidates[j].userId, score });
      }
    }
  }

  validPairs.sort((x, y) => y.score - x.score);

  const matched = new Set<string>();
  const resultPairs: { a: string; b: string; score: number }[] = [];
  for (const pair of validPairs) {
    if (!matched.has(pair.a) && !matched.has(pair.b)) {
      resultPairs.push(pair);
      matched.add(pair.a);
      matched.add(pair.b);
    }
  }
  return resultPairs;
}

// ─── 朋友多匹配（每人取 Top-N，去重无向对，不独占；C 规则） ─────────────────
function multiMatch(
  candidates: CandidateProfile[],
  threshold: number,
  topN: number,
  mode: ModeStr,
): { a: string; b: string; score: number }[] {
  // 先算每个 user 的有效配对（score >= threshold），按分数降序取 Top-N
  const perUserTop = new Map<string, { other: string; score: number }[]>();
  for (let i = 0; i < candidates.length; i++) {
    perUserTop.set(candidates[i].userId, []);
  }

  // 缓存两两得分，避免重复计算
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const score = calculatePairScore(candidates[i], candidates[j], mode);
      if (score < threshold) continue;
      perUserTop.get(candidates[i].userId)!.push({ other: candidates[j].userId, score });
      perUserTop.get(candidates[j].userId)!.push({ other: candidates[i].userId, score });
    }
  }

  // 每人取分数最高 Top-N，收集为无向去重对
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const seen = new Set<string>();
  const resultPairs: { a: string; b: string; score: number }[] = [];

  for (const [userId, list] of perUserTop) {
    list.sort((p, q) => q.score - p.score);
    const topList = list.slice(0, Math.max(1, topN));
    for (const { other, score } of topList) {
      const key = pairKey(userId, other);
      if (seen.has(key)) continue;
      seen.add(key);
      resultPairs.push({ a: userId, b: other, score });
    }
  }
  return resultPairs;
}

// ─── 增强方对普通方的「单向硬约束」校验（§10.3 混合约束） ─────────────────
// 增强方 e 强配普通方 c：c 的硬性偏好仍须满足（性别/年龄/同城同校/学段）。
// 复用 calculatePairScore——若返回 0 表示某项硬约束未通过，则不可强配。
function passesHardConstraintsForNormalSide(
  e: CandidateProfile,
  c: CandidateProfile,
  mode: ModeStr,
): boolean {
  return calculatePairScore(e, c, mode) > 0;
}

@Injectable()
export class ScoringMatchModelProvider implements MatchModelProvider {
  private readonly logger = new Logger(ScoringMatchModelProvider.name);

  async generateMatches(
    candidates: CandidateProfile[],
    constraints: MatchConstraints,
  ): Promise<MatchResult> {
    const start = Date.now();
    const mode = constraints.mode;
    const topN = mode === 'romantic' ? 1 : Math.max(1, constraints.maxMatchesPerUser || 5);
    this.logger.log(`[Scoring] mode=${mode} candidates=${candidates.length} topN=${topN}`);

    const matched = new Set<string>();
    const pairs: MatchPair[] = [];
    const emptyPoolUserIds: Array<{ userId: string; mode: ModeStr; cost: number }> = [];

    const baseMeta = {
      algorithm: mode === 'friend' ? 'scoring-friend-v1' : 'scoring-romantic-v1',
      version: '2.0.0',
      threshold: SCORE_THRESHOLD,
    };

    // ── 阶段一：增强用户强配（无视 75 分阈值，§10.3） ──
    const enhancedUsers = candidates.filter((c) => c.enhanced);
    for (const e of enhancedUsers) {
      if (matched.has(e.userId)) continue; // 可能已被另一个增强用户配走
      const cost = e.enhancedCost ?? (mode === 'romantic' ? ENERGY_COST_ROMANTIC : 1);

      // 候选 = 所有其他人（排除自己 + 已占用）；普通方硬约束仍生效
      const valid = candidates
        .filter(
          (c) =>
            c.userId !== e.userId &&
            !matched.has(c.userId) &&
            passesHardConstraintsForNormalSide(e, c, mode),
        )
        .map((c) => ({ c, score: calculatePairScore(e, c, mode) }))
        .sort((x, y) => y.score - x.score);

      if (valid.length === 0) {
        // 空池（J 规则 6/7）-> 退款
        emptyPoolUserIds.push({ userId: e.userId, mode, cost });
        continue;
      }

      if (mode === 'romantic') {
        const top = valid[0];
        pairs.push({
          userAId: e.userId,
          userBId: top.c.userId,
          score: top.score,
          enhanced: true,
          enhancedCost: ENERGY_COST_ROMANTIC,
          metadata: { ...baseMeta, enhanced: true },
        });
        matched.add(e.userId);
        matched.add(top.c.userId);
      } else {
        const limit = Math.max(1, Math.min(5, cost));
        const topList = valid.slice(0, limit);
        for (const { c, score } of topList) {
          if (matched.has(c.userId)) continue;
          pairs.push({
            userAId: e.userId,
            userBId: c.userId,
            score,
            enhanced: true,
            enhancedCost: cost,
            metadata: { ...baseMeta, enhanced: true },
          });
          matched.add(c.userId);
        }
        matched.add(e.userId);
      }
    }

    // ── 阶段二：普通用户走现有阈值算法（threshold=75 不变） ──
    const remaining = candidates.filter((c) => !c.enhanced && !matched.has(c.userId));
    const normalPairs =
      mode === 'romantic'
        ? greedyMatch(remaining, SCORE_THRESHOLD, mode)
        : multiMatch(remaining, SCORE_THRESHOLD, topN, mode);

    for (const p of normalPairs) {
      pairs.push({
        userAId: p.a,
        userBId: p.b,
        score: p.score,
        enhanced: false,
        metadata: { ...baseMeta, enhanced: false },
      });
      matched.add(p.a);
      matched.add(p.b);
    }

    const unmatched = candidates.filter((c) => !matched.has(c.userId)).map((c) => c.userId);
    const elapsed = Date.now() - start;
    this.logger.log(
      `[Scoring] mode=${mode} done: ${pairs.length} pairs, ${unmatched.length} unmatched, ` +
        `${emptyPoolUserIds.length} empty-pool refunds, ${elapsed}ms`,
    );

    return {
      pairs,
      unmatched,
      emptyPoolUserIds,
      modelVersion: baseMeta.algorithm,
      processingTimeMs: elapsed,
    };
  }
}
