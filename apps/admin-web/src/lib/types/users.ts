/**
 * users 域契约类型（镜像 apps/api/src/users/users-admin.service.ts 真实响应）。
 * listUsers 是 select 投影；getUserDetail 是 include 全量
 * （Profile 全字段 + modeStates + answers 近 50 条 + 双向 matches 各 5 条）。
 */

export type UserStatus = 'ACTIVE' | 'BANNED';

/** 列表状态筛选：'' = 全部（client 序列化时自动跳过空串） */
export type UserStatusFilter = '' | UserStatus;

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

/** UserModeState 投影（listUsers select） */
export interface UserModeStateBrief {
  /** 'romantic' | 'friend' */
  mode: string;
  /** idle / searching / matched / confirming / relationship（schema 另留 no_match） */
  matchState: string;
  matchSearchingSince: string | null;
}

/** 详情多带 weeklyMatchNote（'no_match' = 本周空轮） */
export interface UserModeStateDetail extends UserModeStateBrief {
  weeklyMatchNote: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  status: UserStatus;
  verificationStatus: VerificationStatus;
  createdAt: string;
  studentCardUrl: string | null;
  schoolEmail: string | null;
  modeStates: UserModeStateBrief[];
  profile: {
    nickname: string | null;
    school: string | null;
    profileCompleteness: number;
    socialLinks: unknown;
    relationshipScore: number;
  } | null;
}

/** Profile 全量（getUserDetail include: { profile: true }） */
export interface UserProfileDetail {
  id: string;
  userId: string;
  nickname: string | null;
  realName: string | null;
  familyName: string | null;
  givenName: string | null;
  school: string | null;
  grade: string | null;
  gender: string | null;
  genderPref: string | null;
  age: number | null;
  birthday: string | null;
  city: string | null;
  interests: string[];
  bio: string | null;
  avatarUrl: string | null;
  socialLinks: unknown;
  signature: string | null;
  coverUrl: string | null;
  tags: string[];
  major: string | null;
  mbti: string | null;
  nationality: string | null;
  realPhotos: string[];
  zodiac: string | null;
  wishGifts: string[];
  extraData: unknown;
  relationshipScore: number;
  profileCompleteness: number;
  createdAt: string;
  updatedAt: string;
}

/** 详情附带的答题记录（本期不渲染，契约如实保留） */
export interface UserAnswerRecord {
  id: string;
  userId: string;
  questionnaireVersionId: string;
  questionId: string;
  value: unknown;
  submittedAt: string;
  updatedAt: string;
  question: { title: string; type: string };
  questionnaireVersion: { version: number; title: string };
}

/** Match 标量段（详情 matchesAsUserA/B 各取 5 条） */
export interface UserMatchRecord {
  id: string;
  matchJobId: string | null;
  userAId: string;
  userBId: string;
  /** 注意与 UserModeState.mode 小写不同 */
  mode: 'ROMANTIC' | 'FRIEND';
  /** MatchStatus 枚举（MATCHED_ROMANTIC / RELATIONSHIP_ROMANTIC / DISSOLVED ...） */
  status: string;
  score: number | null;
  metadata: unknown;
  enhancedMode: string | null;
  enhancedUserEnergy: number | null;
  enhancedAttemptedAt: string | null;
  userAConfirmed: boolean;
  userBConfirmed: boolean;
  confirmedAt: string | null;
  relationshipStartedAt: string | null;
  dissolvedBy: string | null;
  dissolvedAt: string | null;
  dissolveReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 匹配记录里 join 出来的对方投影 */
export interface MatchCounterpart {
  email: string;
  profile: { nickname: string | null } | null;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  status: UserStatus;
  verificationStatus: VerificationStatus;
  studentCardUrl: string | null;
  schoolEmail: string | null;
  connectCode: string | null;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
  profile: UserProfileDetail | null;
  modeStates: UserModeStateDetail[];
  answers: UserAnswerRecord[];
  matchesAsUserA: (UserMatchRecord & { userB: MatchCounterpart })[];
  matchesAsUserB: (UserMatchRecord & { userA: MatchCounterpart })[];
}

/** PATCH :id/status 响应 */
export interface UpdateUserStatusResult {
  id: string;
  email: string;
  status: UserStatus;
}

/** PATCH :id/reset-mode 响应（service 固定拼 matchState: 'idle'） */
export interface ResetUserModeResult {
  id: string;
  email: string;
  matchState: 'idle';
}

/** PATCH :id/verification 响应 */
export interface UpdateUserVerificationResult {
  id: string;
  email: string;
  verificationStatus: VerificationStatus;
}
