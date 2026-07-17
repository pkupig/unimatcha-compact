import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach admin token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 + unwrap { data }
api.interceptors.response.use(
  (res) => (res.data?.data !== undefined ? { ...res, data: res.data.data } : res),
  (err) => {
    // 401 拦截：会话过期 → 清 token 跳登录。但登录请求本身返回 401（账号/密码错、账号停用）时
    // 不能跳转，否则页面直接重载、登录表单永远来不及显示失败原因；让该错误透传给表单处理。
    const isLoginAttempt = (err.config?.url || '').includes('/auth/login');
    if (err.response?.status === 401 && typeof window !== 'undefined' && !isLoginAttempt) {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    const data = err.response?.data;
    // class-validator 校验错误的 message 为数组，归一化为字符串以便 toast 正常显示
    if (data && Array.isArray(data.message)) {
      return Promise.reject({ ...data, message: data.message.join('; ') });
    }
    return Promise.reject(data || err);
  },
);

/* ═══════════════════════════════════════════════════════════════
 * Types（依据 docs/ADMIN-REDESIGN.md §2 数据模型，pragmatic 派生）
 * ═══════════════════════════════════════════════════════════════ */

export type AdPricingModel = 'BUYOUT' | 'CPM' | 'CPC';

export type AdCampaignStatus =
  | 'DRAFT'
  | 'PENDING_UNION_REVIEW'
  | 'PENDING_PLATFORM_REVIEW'
  | 'REJECTED'
  | 'PENDING_PAYMENT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'SUSPENDED'
  | 'COMPLETED';

export type LedgerEntryType = 'AD_SHARE' | 'SPONSOR_GRANT' | 'WITHDRAWAL' | 'ADJUSTMENT';

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface School {
  id: string;
  name: string;
  city?: string | null;
  isActive: boolean;
  /** 平台直签广告分成（基点，默认 1000 = 10%） */
  platformShareBps: number;
  /** 学生会自拉赞助分成（基点，默认 3000 = 30%） */
  selfSourcedShareBps: number;
  /** null = 使用全局默认（SystemConfig: ad_pricing_defaults） */
  buyoutDailyPriceCents?: number | null;
  cpmPriceCents?: number | null;
  cpcPriceCents?: number | null;
  bankAccountName?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** 列表/详情统计（后端聚合返回） */
  stats?: {
    userCount?: number;
    activeCampaignCount?: number;
    /** @deprecated 后端实际返回 activeCampaignCount */
    activeCampaigns?: number;
    totalRevenueCents?: number;
    balanceCents?: number;
  };
}

export interface PricingDefaults {
  /** 分/天/校 */
  buyoutDailyPriceCents: number;
  /** 分/1000 次曝光 */
  cpmPriceCents: number;
  /** 分/次点击 */
  cpcPriceCents: number;
}

export interface AdPlacement {
  id: string;
  campaignId: string;
  schoolId: string;
  school?: { id: string; name: string };
  /** BUYOUT：天数 × 该校日单价（提交时锁定） */
  buyoutPriceCents?: number | null;
}

export interface AdDailyStatPoint {
  date: string;
  schoolId?: string;
  impressions: number;
  clicks: number;
  spendCents: number;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  advertiser?: {
    id: string;
    name: string;
    email?: string;
    organizationName?: string | null;
  };
  title: string;
  content: string;
  images: string[];
  landingUrl?: string | null;
  pricingModel: AdPricingModel;
  status: AdCampaignStatus;
  startDate: string;
  endDate: string;
  /** CPM/CPC 必填；BUYOUT 为 null */
  budgetCents?: number | null;
  totalPriceCents: number;
  spendCents: number;
  /** 提交时锁定的各校单价 {schoolId: {buyoutDaily, cpm, cpc}} */
  priceSnapshot?: Record<string, { buyoutDaily?: number; cpm?: number; cpc?: number }> | null;
  /** null = 平台直签 */
  sourcedBySchoolId?: string | null;
  sourcedBySchool?: { id: string; name: string } | null;
  paymentConfirmedByAdminId?: string | null;
  paymentNote?: string | null;
  paidAt?: string | null;
  unionReviewedByAdminId?: string | null;
  platformReviewedByAdminId?: string | null;
  reviewNote?: string | null;
  rejectedReason?: string | null;
  suspendedAt?: string | null;
  suspendReason?: string | null;
  completedAt?: string | null;
  settledAt?: string | null;
  placements?: AdPlacement[];
  /** 详情聚合（曝光/点击/消耗汇总） */
  stats?: { impressions?: number; clicks?: number; spendCents?: number };
  createdAt: string;
  updatedAt?: string;
}

/** 创建/编辑广告的提交体 */
export interface CampaignInput {
  title: string;
  content: string;
  images: string[];
  landingUrl?: string | null;
  pricingModel: AdPricingModel;
  startDate: string;
  endDate: string;
  budgetCents?: number | null;
  /** 投放学校（后端据此生成 placements） */
  schoolIds: string[];
}

export interface LedgerEntry {
  id: string;
  schoolId: string;
  school?: { id: string; name: string };
  type: LedgerEntryType;
  /** 有符号：收入 +，提现 − */
  amountCents: number;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  createdByAdminId?: string | null;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  schoolId: string;
  school?: { id: string; name: string };
  amountCents: number;
  status: WithdrawalStatus;
  /** 申请时银行卡快照 */
  bankSnapshot: { accountName?: string; bankName?: string; accountNo?: string };
  requestedByAdminId: string;
  requestedBy?: { id: string; name: string };
  reviewedByAdminId?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  paidAt?: string | null;
}

export interface FinanceSummary {
  balanceCents: number;
  totalIncomeCents?: number;
  /** PENDING/APPROVED 提现冻结在途金额 */
  frozenCents?: number;
  ledger: LedgerEntry[];
  total?: number;
  page?: number;
}

/** GET /admin/ads/overview 角色化汇总（dashboard 用），按角色返回不同字段 */
export interface AdsOverview {
  role?: string;
  activeCampaigns?: number;
  pendingPlatformReview?: number;
  /** STUDENT_UNION：待本校审核数 */
  pendingReviewCount?: number;
  pendingUnionReview?: number;
  activeInSchool?: number;
  schoolSpend30dCents?: number;
  totalSpendCents?: number;
  /** SUPER/TEAM：30 天平台广告流水 */
  gross30dCents?: number;
  spend30dCents?: number;
  impressions7d?: number;
  clicks7d?: number;
  /** SUPER/TEAM 趋势图 */
  dailySeries30d?: AdDailyStatPoint[];
  /** SPONSOR 趋势图 */
  dailySeries7d?: AdDailyStatPoint[];
  daily?: AdDailyStatPoint[];
}

export interface RevenueReportRow {
  schoolId: string;
  schoolName?: string;
  adRevenueCents: number;
  platformShareCents: number;
  schoolShareCents: number;
}

/* ═══════════════════════════════════════════════════════════════
 * Auth
 * ═══════════════════════════════════════════════════════════════ */
export const adminLogin = (email: string, password: string) =>
  api.post('/admin/auth/login', { email, password });

/* ═══════════════════════════════════════════════════════════════
 * Dashboard（按角色返回不同 payload：team/union/sponsor）
 * ═══════════════════════════════════════════════════════════════ */
export const getDashboard = () => api.get('/admin/dashboard');

/* ═══════════════════════════════════════════════════════════════
 * Users（UNION 角色后端自动 scope 到本校）
 * ═══════════════════════════════════════════════════════════════ */
export const getUsers = (params?: any) => api.get('/admin/users', { params });
export const getUserDetail = (id: string) => api.get(`/admin/users/${id}`);
export const updateUserStatus = (id: string, status: string) =>
  api.patch(`/admin/users/${id}/status`, { status });
export const resetUserMode = (id: string) => api.patch(`/admin/users/${id}/reset-mode`);
export const updateVerificationStatus = (id: string, status: string) =>
  api.patch(`/admin/users/${id}/verification`, { status });

/* ═══════════════════════════════════════════════════════════════
 * Questionnaire
 * ═══════════════════════════════════════════════════════════════ */
export const getQVersions = () => api.get('/admin/questionnaire/versions');
export const getQVersion = (id: string) => api.get(`/admin/questionnaire/versions/${id}`);
export const createQVersion = (data: any) => api.post('/admin/questionnaire/versions', data);
export const publishQVersion = (id: string) =>
  api.post(`/admin/questionnaire/versions/${id}/publish`);
export const addQuestion = (versionId: string, data: any) =>
  api.post(`/admin/questionnaire/versions/${versionId}/questions`, data);
export const updateQuestion = (id: string, data: any) =>
  api.put(`/admin/questionnaire/questions/${id}`, data);
export const deleteQuestion = (id: string) => api.delete(`/admin/questionnaire/questions/${id}`);
export const toggleQuestion = (id: string, isEnabled: boolean) =>
  api.patch(`/admin/questionnaire/questions/${id}/toggle`, { isEnabled });

/* ═══════════════════════════════════════════════════════════════
 * Admin Users（账号管理：管理员 / 学生会 / 商家。
 * UNION 可创建自拉 SPONSOR（后端强制 sourcedBySchoolId=本校））
 * ═══════════════════════════════════════════════════════════════ */
export const listAdminUsers = (params?: any) => api.get('/admin/admin-users', { params });
export const createAdminUser = (data: any) => api.post('/admin/admin-users', data);
export const updateAdminUser = (id: string, data: any) => api.put(`/admin/admin-users/${id}`, data);
export const deleteAdminUser = (id: string) => api.delete(`/admin/admin-users/${id}`);

/* ═══════════════════════════════════════════════════════════════
 * Square 官方发帖
 * ═══════════════════════════════════════════════════════════════ */
export const createOfficialPost = (data: any) => api.post('/admin/square/posts', data);
/** 下架帖子（spec §5.5：body 可带 {reason}；不传保持旧行为兼容） */
export const deleteOfficialPost = (id: string, reason?: string) =>
  api.delete(`/admin/square/posts/${id}`, reason ? { data: { reason } } : undefined);

/* ═══════════════════════════════════════════════════════════════
 * Matching
 * ═══════════════════════════════════════════════════════════════ */
export const getMatchConfig = () => api.get('/admin/matching/config');
export const updateMatchConfig = (data: any) => api.put('/admin/matching/config', data);
export const triggerMatchJob = (mode?: 'romantic' | 'friend') =>
  api.post('/admin/matching/jobs/trigger' + (mode ? `?mode=${mode}` : ''));
export const getMatchJobs = (params?: any) => api.get('/admin/matching/jobs', { params });
export const getMatchJobDetail = (id: string) => api.get(`/admin/matching/jobs/${id}`);
export const retryMatchJob = (id: string) => api.post(`/admin/matching/jobs/${id}/retry`);
export const getMatchResults = (params?: any) => api.get('/admin/matching/results', { params });

/* ═══════════════════════════════════════════════════════════════
 * Schools（spec §4 schools 模块）
 * ═══════════════════════════════════════════════════════════════ */
export const getSchools = (params?: {
  search?: string;
  isActive?: boolean | string;
  page?: number;
  limit?: number;
}) => api.get('/admin/schools', { params });
export const getSchool = (id: string) => api.get(`/admin/schools/${id}`);
export const createSchool = (data: Partial<School>) => api.post('/admin/schools', data);
export const updateSchool = (id: string, data: Partial<School>) =>
  api.put(`/admin/schools/${id}`, data);
/** 绑定银行账户（UNION 本校 / TEAM） */
export const updateSchoolBank = (
  id: string,
  data: { bankAccountName: string; bankName: string; bankAccountNo: string },
) => api.put(`/admin/schools/${id}/bank`, data);
/** 全局计价默认值（SystemConfig: ad_pricing_defaults，SUPER/TEAM） */
export const getPricingDefaults = () => api.get('/admin/ad-pricing/defaults');
export const updatePricingDefaults = (data: PricingDefaults) =>
  api.put('/admin/ad-pricing/defaults', data);

/* ═══════════════════════════════════════════════════════════════
 * Ads（spec §4 ads 模块 —— 广告全生命周期）
 * ═══════════════════════════════════════════════════════════════ */
export const createCampaign = (data: CampaignInput) => api.post('/admin/ads/campaigns', data);
export const updateCampaign = (id: string, data: Partial<CampaignInput>) =>
  api.put(`/admin/ads/campaigns/${id}`, data);
/** 提交审核：计价快照 + 算价 → PENDING_UNION_REVIEW / PENDING_PLATFORM_REVIEW */
export const submitCampaign = (id: string) => api.post(`/admin/ads/campaigns/${id}/submit`);
export const getCampaigns = (params?: {
  status?: AdCampaignStatus | string;
  schoolId?: string;
  page?: number;
  limit?: number;
}) => api.get('/admin/ads/campaigns', { params });
export const getCampaign = (id: string) => api.get(`/admin/ads/campaigns/${id}`);
/** 审核：通过 → PENDING_PAYMENT；驳回 → REJECTED */
export const reviewCampaign = (id: string, data: { approve: boolean; note?: string }) =>
  api.post(`/admin/ads/campaigns/${id}/review`, data);
/** 确认收款（SUPER/TEAM）→ SCHEDULED（或直接 ACTIVE） */
export const confirmCampaignPayment = (id: string, data?: { note?: string }) =>
  api.post(`/admin/ads/campaigns/${id}/confirm-payment`, data ?? {});
export const pauseCampaign = (id: string) => api.post(`/admin/ads/campaigns/${id}/pause`);
export const resumeCampaign = (id: string) => api.post(`/admin/ads/campaigns/${id}/resume`);
/** 平台强制下架（SUPER/TEAM） */
export const suspendCampaign = (id: string, data: { reason: string }) =>
  api.post(`/admin/ads/campaigns/${id}/suspend`, data);
export const unsuspendCampaign = (id: string) => api.post(`/admin/ads/campaigns/${id}/unsuspend`);
/** AdDailyStat 日序列 */
export const getCampaignStats = (id: string, params?: { from?: string; to?: string }) =>
  api.get(`/admin/ads/campaigns/${id}/stats`, { params });
/** 角色化汇总（dashboard 趋势图/统计） */
export const getAdsOverview = () => api.get('/admin/ads/overview');

/* ═══════════════════════════════════════════════════════════════
 * Finance（spec §4 finance 模块）
 * ═══════════════════════════════════════════════════════════════ */
/** balance、累计收入、冻结、分页 ledger（UNION 本校 / TEAM） */
export const getFinanceSummary = (
  schoolId: string,
  params?: { page?: number; limit?: number },
) => api.get(`/admin/finance/schools/${schoolId}/summary`, { params });
/** 发放赞助额度（SPONSOR_GRANT 正数入账，SUPER/TEAM） */
export const createGrant = (data: { schoolId: string; amountCents: number; note?: string }) =>
  api.post('/admin/finance/grants', data);
/** 手工调整（正负，SUPER/TEAM） */
export const createAdjustment = (data: { schoolId: string; amountCents: number; note?: string }) =>
  api.post('/admin/finance/adjustments', data);
/** 申请提现（UNION，校验余额 + 银行卡已绑定） */
export const createWithdrawal = (data: { amountCents: number }) =>
  api.post('/admin/finance/withdrawals', data);
export const getWithdrawals = (params?: {
  status?: WithdrawalStatus | string;
  schoolId?: string;
  page?: number;
  limit?: number;
}) => api.get('/admin/finance/withdrawals', { params });
/** PENDING → APPROVED / REJECTED（SUPER/TEAM） */
export const reviewWithdrawal = (id: string, data: { approve: boolean; note?: string }) =>
  api.post(`/admin/finance/withdrawals/${id}/review`, data);
/** APPROVED → PAID + 负数 ledger（SUPER/TEAM） */
export const markWithdrawalPaid = (id: string) =>
  api.post(`/admin/finance/withdrawals/${id}/mark-paid`);
/** 分校收入报表（SUPER/TEAM） */
export const getRevenueReport = (params?: { from?: string; to?: string }) =>
  api.get('/admin/finance/revenue-report', { params });

/* ═══════════════════════════════════════════════════════════════
 * Moderation（spec §5.5 广场管理与举报处理）
 * ═══════════════════════════════════════════════════════════════ */

export type SquareBoard = 'RECOMMEND' | 'CAMPUS_WALL';
export type SquareAuthorType = 'USER' | 'STUDENT_UNION' | 'TEAM' | 'SPONSOR';

export interface AdminSquarePost {
  id: string;
  board: SquareBoard;
  authorType: SquareAuthorType;
  /** null/空 = 跨校 */
  school?: string | null;
  title?: string | null;
  content: string;
  images: string[];
  likeCount: number;
  commentCount: number;
  anonymous: boolean;
  isSponsored?: boolean;
  isHidden: boolean;
  /** 'reporter:auto' = 举报数达到阈值自动隐藏 */
  deletedBy?: string | null;
  deleteReason?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  reportCount: number;
  /** 用户帖 nickname；官方/商家帖 name */
  author?: { nickname?: string; name?: string } | null;
}

export interface AdminReport {
  id: string;
  category: string;
  content: string;
  contact?: string | null;
  status: 'open' | 'resolved' | string;
  createdAt: string;
  user?: { email?: string; nickname?: string } | null;
}

/** 帖子管理列表（TEAM 全部 / UNION 后端强制本校）→ {items, total, page, limit} */
export const getSquarePostsAdmin = (params?: {
  board?: SquareBoard | string;
  school?: string;
  /** all / visible / hidden */
  status?: string;
  reported?: boolean | string;
  search?: string;
  page?: number;
  limit?: number;
}) => api.get('/admin/square/posts', { params });
/** 下架帖子（原因必填）—— 复用既有 DELETE /admin/square/posts/:id */
export const deleteSquarePostAdmin = (id: string, reason: string) =>
  deleteOfficialPost(id, reason);
/** 恢复展示：isHidden=false，清 deletedBy/deletedAt/deleteReason */
export const restoreSquarePost = (id: string) => api.post(`/admin/square/posts/${id}/restore`);
/** 清空举报记录；若 deletedBy='reporter:auto' 同时恢复展示 */
export const dismissPostReports = (id: string) =>
  api.post(`/admin/square/posts/${id}/dismiss-reports`);
/** 用户反馈举报列表（SUPER/TEAM；STUDENT_UNION 403）→ {items, total, page, limit} */
export const getAdminReports = (params?: { status?: string; page?: number; limit?: number }) =>
  api.get('/admin/reports', { params });
/** open → resolved（幂等，可回退 open） */
export const updateAdminReport = (id: string, data: { status: 'resolved' | 'open' }) =>
  api.patch(`/admin/reports/${id}`, data);

/* ═══════════════════════════════════════════════════════════════
 * Submissions（spec §5.6 官网提交联动，SUPER/TEAM only）
 * 官网 POST /public/waitlist、/public/sponsor-application 落库 PublicSubmission
 * ═══════════════════════════════════════════════════════════════ */

export type PublicSubmissionType = 'SPONSOR' | 'WAITLIST';
/** APPROVED 只能经 convert 达成（PATCH 传 APPROVED → 400） */
export type PublicSubmissionStatus = 'PENDING' | 'CONTACTED' | 'APPROVED' | 'REJECTED';

export interface AdminSubmission {
  id: string;
  type: PublicSubmissionType;
  email: string;
  /** WAITLIST 无组织字段 */
  organization?: string | null;
  message?: string | null;
  /** 提交时官网语言（zh/en） */
  locale?: string | null;
  createdAt: string;
  status: PublicSubmissionStatus;
  handledByAdminId?: string | null;
  handledAt?: string | null;
  handleNote?: string | null;
  /** 一键开通创建的后台账号 id */
  convertedAdminId?: string | null;
  convertedAdmin?: { id: string; name: string; role: string; isActive?: boolean } | null;
}

/** 列表（newest first）→ {items, total, page, limit}；search 模糊匹配 email/organization */
export const getSubmissions = (params?: {
  type?: PublicSubmissionType | string;
  status?: PublicSubmissionStatus | string;
  search?: string;
  page?: number;
  limit?: number;
}) => api.get('/admin/submissions', { params });

/** 状态流转（CONTACTED/REJECTED/回 PENDING），记 handledBy/handledAt/handleNote */
export const updateSubmission = (
  id: string,
  data: { status: 'PENDING' | 'CONTACTED' | 'REJECTED'; note?: string },
) => api.patch(`/admin/submissions/${id}`, data);

/** 一键开通的提交体（STUDENT_UNION：schoolId / newSchoolName 二选一；SPONSOR：organizationName 必填） */
export interface ConvertSubmissionInput {
  accountRole: 'STUDENT_UNION' | 'SPONSOR';
  /** 缺省用申请邮箱 */
  email?: string;
  name: string;
  password: string;
  schoolId?: string;
  newSchoolName?: string;
  newSchoolCity?: string;
  organizationName?: string;
  contactName?: string;
  contactPhone?: string;
}

/** 一键开通 → {admin, school|null, initialPassword}（密码仅此一次回传） */
export const convertSubmission = (id: string, body: ConvertSubmissionInput) =>
  api.post(`/admin/submissions/${id}/convert`, body);
