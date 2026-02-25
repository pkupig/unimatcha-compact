/**
 * AI 匹配模型接入点
 *
 * 替换说明：
 * 1. 实现 MatchModelProvider 接口
 * 2. 在 matching.module.ts 中替换 StubMatchModelProvider 为你的实现
 * 3. 真实实现示例见 ai-match-model.provider.ts.example
 */

export interface CandidateProfile {
  userId: string;
  gender: string;
  genderPref: string;
  age: number;
  city: string;
  school: string;
  interests: string[];
  answers: AnswerData[];
}

export interface AnswerData {
  questionId: string;
  questionType: string;
  value: any;
}

export interface MatchConstraints {
  maxMatchesPerUser: number; // MVP: always 1
  sameCity?: boolean;
  excludeRelationshipMode?: boolean;
}

export interface MatchPair {
  userAId: string;
  userBId: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface MatchResult {
  pairs: MatchPair[];
  unmatched: string[]; // userIds that couldn't be matched
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
