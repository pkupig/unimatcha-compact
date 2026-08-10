/** finance 域 API（对照 finance-admin.controller.ts；金额一律分） */
import { get, post } from './client';
import type {
  LedgerEntry,
  ListResult,
  RevenueReport,
  SchoolFinanceSummary,
  WithdrawalRequest,
} from '@/lib/types';

/** 提现申请列表（平台侧可按 status/schoolId 过滤；学生会后端强制本校） */
export function listWithdrawals(params: {
  status?: string;
  schoolId?: string;
  page?: number;
  limit?: number;
}): Promise<ListResult<WithdrawalRequest>> {
  return get<ListResult<WithdrawalRequest>>('/admin/finance/withdrawals', params);
}

/** 审核提现（PENDING → APPROVED / REJECTED） */
export function reviewWithdrawal(
  id: string,
  data: { approve: boolean; note?: string },
): Promise<WithdrawalRequest> {
  return post<WithdrawalRequest>(`/admin/finance/withdrawals/${id}/review`, data);
}

/** 标记已打款（APPROVED → PAID + 负数 WITHDRAWAL 入账，不可逆） */
export function markWithdrawalPaid(id: string): Promise<WithdrawalRequest> {
  return post<WithdrawalRequest>(`/admin/finance/withdrawals/${id}/mark-paid`);
}

/** 发放赞助额度（SPONSOR_GRANT 正数入账） */
export function createGrant(data: {
  schoolId: string;
  amountCents: number;
  note?: string;
}): Promise<LedgerEntry> {
  return post<LedgerEntry>('/admin/finance/grants', data);
}

/** 手工调整（ADJUSTMENT 有符号非 0，理由必填留痕） */
export function createAdjustment(data: {
  schoolId: string;
  amountCents: number;
  note: string;
}): Promise<LedgerEntry> {
  return post<LedgerEntry>('/admin/finance/adjustments', data);
}

/** 学校财务概要（余额/累计收入/冻结 + 分页流水） */
export function getSchoolFinanceSummary(
  schoolId: string,
  params?: { page?: number; limit?: number },
): Promise<SchoolFinanceSummary> {
  return get<SchoolFinanceSummary>(`/admin/finance/schools/${schoolId}/summary`, params);
}

/** 分校收入报表（from/to 为 YYYY-MM-DD，含边界日） */
export function getRevenueReport(params: {
  from?: string;
  to?: string;
}): Promise<RevenueReport> {
  return get<RevenueReport>('/admin/finance/revenue-report', params);
}
