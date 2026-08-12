/**
 * users 域契约类型（镜像 apps/api/src/users/users-admin.service.ts 真实响应）。
 * listUsers 与 getUserDetail 均为 select 受限投影——凭证与私密设置
 * （passwordHash/verifyCode/connectCode/settings）永不下发；
 * detail 附 Profile 全字段 + modeStates + answers 近 50 条 + 双向 matches 各 5 条。
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
  createdAt: string;
  profile: UserProfileDetail | null;
  modeStates: UserModeStateDetail[];
  answers: UserAnswerRecord[];
  matchesAsUserA: (UserMatchRecord & { userB: MatchCounterpart })[];
  matchesAsUserB: (UserMatchRecord & { userA: MatchCounterpart })[];
}

/** PATCH :id/status 响应；email 学生会视角为 null（处置响应不绕过受限投影） */
export interface UpdateUserStatusResult {
  id: string;
  email: string | null;
  status: UserStatus;
}

/** PATCH :id/reset-mode 响应（service 固定拼 matchState: 'idle'） */
export interface ResetUserModeResult {
  id: string;
  email: string;
  matchState: 'idle';
}

/** PATCH :id/verification 响应；email 学生会视角为 null（处置响应不绕过受限投影） */
export interface UpdateUserVerificationResult {
  id: string;
  email: string | null;
  verificationStatus: VerificationStatus;
}

/** GET /admin/users/overview 的年级桶（grade 为 Profile.grade 原值；null = 未填写） */
export interface UsersOverviewGradeBucket {
  grade: string | null;
  count: number;
}

/** GET /admin/users/overview 的性别桶（male/female/non_binary/other；null = 未填写） */
export interface UsersOverviewGenderBucket {
  gender: string | null;
  count: number;
}

/**
 * GET /admin/users/overview 响应（学生会恒本校；school 参数仅 SUPER/TEAM 有效）。
 * 学生会对本校用户只看群体统计——个体名单/详情由后端 403（产品口径）。
 */
export interface UsersOverview {
  /** 统计口径的学校名；平台全量视角为 null */
  school: string | null;
  total: number;
  newThisWeek: number;
  byGrade: UsersOverviewGradeBucket[];
  byGender: UsersOverviewGenderBucket[];
  verification: Record<VerificationStatus, number>;
  series30d: { date: string; count: number }[];
  activity: UsersOverviewActivity;
}

/**
 * 活跃度/内容流量（近 30 天）。活跃口径 = 发帖/评论/点赞/聊天消息任一行为按 (用户, 日) 去重；
 * 私聊消息只进活跃去重，不单独出条数（群体统计不暴露个体聊天行为量）。
 */
export interface UsersOverviewActivity {
  /** 近 7 天活跃去重人数 */
  dau7: number;
  /** 近 30 天活跃去重人数 */
  dau30: number;
  activeSeries30d: { date: string; activeUsers: number }[];
  /** 公开内容流量：广场发帖/评论/点赞按日计数 */
  contentSeries30d: { date: string; posts: number; comments: number; likes: number }[];
  /** 匹配参与度：任一模式处于该状态的去重用户数 */
  matching: { searching: number; relationship: number };
}

/** GET /admin/users/verifications 队列行（受限投影：只见认证材料与昵称/年级/学校） */
export interface PendingVerificationItem {
  id: string;
  createdAt: string;
  /** 近似提交时刻（H5 提交认证时写入 User.updatedAt；排序键同款） */
  updatedAt: string;
  studentCardUrl: string | null;
  schoolEmail: string | null;
  profile: { nickname: string | null; school: string | null; grade: string | null } | null;
}
