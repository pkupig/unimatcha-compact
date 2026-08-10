/** 仪表盘契约（GET /admin/dashboard，按角色判别联合；对照 admin.service.getDashboardStats） */
import type { ListResult } from './common';

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

// ── 判别函数 ──────────────────────────────────────────────
// payload 本身无 role 字段：页面先按 admin.role 选组件，这里按各分支独有结构把联合收窄成精确类型
// （避免 as 断言，也不依赖后端未来是否补 role 字段）。
export function isTeamDashboard(p: DashboardPayload): p is TeamDashboard {
  return 'matching' in p;
}
export function isUnionDashboard(p: DashboardPayload): p is UnionDashboard {
  return 'school' in p;
}
export function isSponsorDashboard(p: DashboardPayload): p is SponsorDashboard {
  return 'impressionsTotal' in p;
}

// ── 学生会「最近入账」（GET /admin/finance/schools/:id/summary）──
// 命名带 Dashboard 前缀：finance 域会在 types/finance.ts 定义自己的同源类型，
// 两文件都经 types/index 桶导出，撞名会让 export * 静默丢弃符号。

/** ledger 行（SchoolLedgerEntry 原样返回） */
export interface DashboardLedgerItem {
  id: string;
  schoolId: string;
  type: 'AD_SHARE' | 'SPONSOR_GRANT' | 'WITHDRAWAL' | 'ADJUSTMENT';
  amountCents: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: string;
}

/** 学校财务概要（仪表盘只消费 ledger 前几行；余额已由 dashboard payload 提供） */
export interface DashboardFinanceSummary {
  schoolId: string;
  schoolName: string;
  balanceCents: number;
  totalIncomeCents: number;
  frozenCents: number;
  ledger: ListResult<DashboardLedgerItem>;
}
