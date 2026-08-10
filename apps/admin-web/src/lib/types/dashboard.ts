/** 仪表盘契约（GET /admin/dashboard，按角色判别联合） */

/** SUPER / TEAM */
export interface TeamDashboard {
  users: { total: number; active: number; banned: number; inMatchMode: number; inRelationship: number };
  matching: { totalMatches: number; pendingJobs: number };
  schools: number;
  adSpend30dCents: number;
  pendingWithdrawals: number;
  pendingPlatformReview: number;
  pendingSubmissions: number;
}

/** STUDENT_UNION */
export interface UnionDashboard {
  school: { id: string; name: string };
  users: { total: number; newThisWeek: number };
  balanceCents: number;
  pendingReviewCount: number;
  activeCampaignsInSchool: number;
}

/** SPONSOR */
export interface SponsorDashboard {
  activeCampaigns: number;
  totalSpendCents: number;
  impressionsTotal: number;
  clicksTotal: number;
}

export type DashboardPayload = TeamDashboard | UnionDashboard | SponsorDashboard;
