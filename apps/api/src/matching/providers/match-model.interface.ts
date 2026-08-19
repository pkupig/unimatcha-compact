/**
 * AI 匹配模型接入点（双模式 + 增强，§3.6 / §10.3）
 *
 * 替换说明：
 * 1. 实现 MatchModelProvider 接口
 * 2. 在 matching.module.ts 中替换 ScoringMatchModelProvider 为你的实现
 * 3. 真实实现示例见 ai-match-model.provider.ts.example
 */

import type { ModeStr } from '../mode.util';

export interface CandidateProfile {
  userId: string;
  gender: string;
  genderPref: string;
  age: number;
  city: string;
  school: string;
  grade?: string;
  interests: string[];
  // 朋友模式：偏好活动（软约束加分用），由 buildCandidates 注入（§3.6）
  activities?: string[];
  answers: AnswerData[];
  // 用户匹配偏好（UserMatchPreferences，按 mode 取的那条），由 buildCandidates 注入
  _prefs?: any;
  // 增强模式（J 规则 §10.3）：是否开启增强 + 预扣格数（恋人=3 / 朋友=friendEnhancedCells）
  enhanced?: boolean;
  enhancedCost?: number;
}

export interface AnswerData {
  questionId: string;
  questionType: string;
  value: any;
  questionOrder?: number;   // 题目 order 字段，用于分类推断
  questionGroup?: string;   // 题目 group 字段（生活习惯/价值观/恋爱观/沟通/财务观 或朋友 group）
}

export interface MatchConstraints {
  // 模式：决定权重表、硬/软约束、产出上限（§3.6）
  mode: ModeStr;
  // 一人本轮产出上限：恋人=1 / 朋友=5（§3.6）
  maxMatchesPerUser: number;
  sameCity?: boolean;
  excludeRelationshipMode?: boolean;
}

export interface MatchPair {
  userAId: string;
  userBId: string;
  score: number;
  metadata?: Record<string, any>;
  // 增强配对标记（§10.3）：增强用户无视 75 分阈值强配产出的对
  enhanced?: boolean;
  enhancedCost?: number;
}

export interface MatchResult {
  pairs: MatchPair[];
  unmatched: string[]; // userIds that couldn't be matched
  // 增强空池退款名单（J 规则 6/7，§10.3）：本轮池中无任何可配对象的增强用户
  emptyPoolUserIds?: Array<{ userId: string; mode: ModeStr; cost: number }>;
  modelVersion?: string;
  processingTimeMs?: number;
}

// ─── Provider Token (DI) ──────────────────────────────────
export const MATCH_MODEL_PROVIDER = 'MATCH_MODEL_PROVIDER';

export interface MatchModelProvider {
  generateMatches(
    candidates: CandidateProfile[],
    constraints: MatchConstraints,
  ): Promise<MatchResult>;
}
