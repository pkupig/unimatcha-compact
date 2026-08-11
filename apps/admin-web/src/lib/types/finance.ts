/**
 * finance 域契约类型（对照 apps/api/src/finance/finance.service.ts 逐端点核对）。
 * 学生会收益页（/earnings）与本域共享 WithdrawalRequest / LedgerEntry / SchoolFinanceSummary，
 * 一律从 '@/lib/types' 复用，不要再定义一份。
 */
import type { ListResult } from './common';

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

/** WITHDRAWAL 仅历史行保留：能量经济后新提现改写现金账本（SchoolCashLedgerEntry） */
export type LedgerEntryType =
  | 'AD_SHARE'
  | 'SPONSOR_GRANT'
  | 'WITHDRAWAL'
  | 'ADJUSTMENT'
  | 'CONVERSION_OUT';

/** 能量 → 赞助费兑换申请状态（prisma ConversionStatus） */
export type ConversionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** SchoolConversionRequest + include school（listConversions / reviewConversion 响应） */
export interface SchoolConversionRequest {
  id: string;
  schoolId: string;
  status: ConversionStatus;
  /** 兑换能量数 = 入账赞助费分数（1 能量 = 1 分，数值同构） */
  amountCents: number;
  requestedByAdminId: string;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  school: { id: string; name: string };
}

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
  /** 门票净额（能量账本 EVENT_TICKET 有符号求和：售出 +，取消冲回 −） */
  eventTicketCents: number;
  /** 已打款提现（口径已切现金账本 SchoolCashLedgerType.WITHDRAWAL，取绝对值） */
  withdrawalPaidCents: number;
  /** 能量兑换出账（能量账本 CONVERSION_OUT，取绝对值） */
  conversionOutCents: number;
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
