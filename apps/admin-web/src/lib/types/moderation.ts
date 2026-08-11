/**
 * moderation 域契约类型：广场帖子管理 / 投票审核 / 官方发帖（square-admin.service.ts）
 * + 用户反馈（admin.service.listReports）。字段逐一对照后端整形函数，勿凭猜增删。
 */

export type SquareBoardValue = 'RECOMMEND' | 'CAMPUS_WALL';
export type SquareAuthorTypeValue = 'USER' | 'STUDENT_UNION' | 'TEAM' | 'SPONSOR';
export type PollReviewStatus = 'pending' | 'approved' | 'rejected';
export type FeedbackStatus = 'open' | 'resolved';

/** shapeAdminPost.author：USER 帖只有 nickname，官方帖只有 name */
export interface AdminSquarePostAuthor {
  nickname?: string | null;
  name?: string | null;
}

/** GET /admin/square/posts 列表项（square-admin.service.shapeAdminPost） */
export interface AdminSquarePost {
  id: string;
  board: SquareBoardValue;
  authorType: SquareAuthorTypeValue;
  school: string | null;
  title: string | null;
  content: string;
  images: string[];
  likeCount: number;
  commentCount: number;
  anonymous: boolean;
  isSponsored: boolean;
  isHidden: boolean;
  /** 管理员 id 或 'reporter:auto'（举报自动隐藏） */
  deletedBy: string | null;
  deleteReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  reportCount: number;
  author: AdminSquarePostAuthor;
}

export interface ListSquarePostsParams {
  board?: SquareBoardValue;
  /** 学校名（仅 SUPER/TEAM 生效；学生会后端强制本校） */
  school?: string;
  status?: 'all' | 'visible' | 'hidden';
  /** true → 仅被举报帖（含举报自动隐藏） */
  reported?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PollOption {
  text: string;
  votes: number;
}

/** listPolls 下发的作者（匿名帖后端置 null，防止泄露给同校审核员） */
export interface PollAuthorUser {
  id: string;
  profile: { nickname: string | null; avatarUrl: string | null; school: string | null } | null;
}

/** GET /admin/square/polls 列表项（整行 SquarePost 展开 + hasUnionReviewer，metadata 已剔除） */
export interface AdminPollPost {
  id: string;
  board: SquareBoardValue;
  authorType: SquareAuthorTypeValue;
  school: string | null;
  title: string | null;
  content: string;
  images: string[];
  likeCount: number;
  commentCount: number;
  anonymous: boolean;
  isHidden: boolean;
  pollOptions: PollOption[] | null;
  reviewStatus: PollReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  authorUser: PollAuthorUser | null;
  /** 团队视图：该校已有学生会入驻（默认由其审核） */
  hasUnionReviewer: boolean;
}

export interface ListPollsParams {
  /** 后端默认 pending */
  status?: PollReviewStatus;
  page?: number;
  limit?: number;
}

export interface PollReviewInput {
  action: 'approve' | 'reject';
  /** 驳回备注（≤200，展示给作者） */
  note?: string;
}

export interface PollReviewResult {
  id: string;
  reviewStatus: PollReviewStatus;
}

// ─── 帖子操作响应（service 原样返回）─────────────────────────
export interface PostTakedownResult {
  hidden: boolean;
  message: string;
}

export interface PostRestoreResult {
  restored: boolean;
  message: string;
}

export interface DismissReportsResult {
  dismissed: boolean;
  /** 举报自动隐藏的帖子清举报时被同步恢复展示 */
  restored: boolean;
  message: string;
}

// ─── 官方发帖（POST /admin/square/posts，CreateOfficialPostDto）───
/** authorType 由后端按登录角色推导，DTO 已删除该字段，前端不得提交 */
export interface CreateOfficialPostInput {
  /** 缺省 recommend（DTO 用小写枚举） */
  board?: 'recommend' | 'campus_wall';
  /** 学生会必填且须为本校名；团队/广告商可空（跨校） */
  school?: string;
  title?: string;
  content: string;
  images?: string[];
  /** SPONSOR 后端强制 true */
  isSponsored?: boolean;
}

/** 响应是 shapePost 全量帖体（H5 形状）；后台只消费 id，其余字段不声明以免误用 */
export interface OfficialPostCreated {
  id: string;
}

// ─── 用户反馈（Report 表，admin.service.listReports）────────────
export interface FeedbackReportBase {
  id: string;
  userId: string;
  /** h5 固定 bug/user/content/other，历史数据可能有自由值 → REPORT_CATEGORY labelOf 兜底 */
  category: string;
  content: string;
  contact: string | null;
  status: FeedbackStatus;
  createdAt: string;
}

/** 列表项含提交用户（email + 昵称）；PATCH 响应无 user 用 Base */
export interface FeedbackReport extends FeedbackReportBase {
  user: { email: string; profile: { nickname: string | null } | null };
}

export interface ListFeedbackReportsParams {
  status?: FeedbackStatus;
  page?: number;
  limit?: number;
}
