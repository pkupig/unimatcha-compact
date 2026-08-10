/**
 * finance 域契约类型（对照 apps/api/src/finance/finance.service.ts 逐端点核对）。
 * 学生会收益页（/earnings）与本域共享 WithdrawalRequest / LedgerEntry / SchoolFinanceSummary，
 * 一律从 '@/lib/types' 复用，不要再定义一份。
 */
import type { ListResult } from './common';

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

export type LedgerEntryType = 'AD_SHARE' | 'SPONSOR_GRANT' | 'WITHDRAWAL' | 'ADJUSTMENT';

/** 提现申请时的银行卡快照（此后改绑不影响在途提现） */
export interface BankSnapshot {
  accountName: string;
  bankName: string;
  accountNo: string;
}

/** WithdrawalRequest + include school（listWithdrawals / review / mark-paid 响应） */
export interface WithdrawalRequest {
  id: string;
  schoolId: string;
  status: WithdrawalStatus;
  amountCents: number;
  bankSnapshot: BankSnapshot;
  requestedByAdminId: string;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
  school: { id: string; name: string };
}

/** SchoolLedgerEntry（学校财务流水，amountCents 有符号：收入 +，提现 −） */
export interface LedgerEntry {
  id: string;
  schoolId: string;
  type: LedgerEntryType;
  amountCents: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: string;
}

/** GET /admin/finance/schools/:id/summary（余额字段已改名 balanceCents） */
export interface SchoolFinanceSummary {
  schoolId: string;
  schoolName: string;
  balanceCents: number;
  totalIncomeCents: number;
  frozenCents: number;
  ledger: ListResult<LedgerEntry>;
}

/** 收入报表单行（字段名与 finance.service.getRevenueReport 逐一对应） */
export interface RevenueReportRow {
  schoolId: string;
  schoolName: string;
  grossAdSpendCents: number;
  schoolShareCents: number;
  platformKeepCents: number;
  grantCents: number;
  withdrawalPaidCents: number;
}

/** 报表合计（后端已算好，前端直接消费，不再自行 reduce） */
export type RevenueReportTotals = Omit<RevenueReportRow, 'schoolId' | 'schoolName'>;

/** GET /admin/finance/revenue-report */
export interface RevenueReport {
  from: string | null;
  to: string | null;
  items: RevenueReportRow[];
  totals: RevenueReportTotals;
}
