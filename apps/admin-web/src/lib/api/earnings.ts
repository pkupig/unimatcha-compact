/**
 * earnings 域 API（学生会钱包 /earnings，能量经济四段：能量 → 兑换 → 赞助费 → 提现）。
 * 域内例外：earnings 无独立 types stub 文件，契约类型直接在本文件顶部定义并导出。
 * 后端真源：finance.service.getSchoolSummary（能量概要）/ createConversion / listConversions /
 * getSchoolCashSummary（赞助费概要）/ createWithdrawal / listWithdrawals；
 * 银行卡读取走 schools.service.detail（学生会仅可读本校，返回完整 school 行 + stats，
 * 本域只声明消费到的字段）。
 * 口径：能量数值 ≡ 分值（1 能量 = 1 分 = ¥0.01），字段仍叫 *Cents 但能量侧展示走 Energy 组件。
 */
import { get, post } from './client';
import type { ListResult } from '@/lib/types';

/** SchoolLedgerEntry.type（prisma LedgerEntryType；能量账本） */
export type LedgerType = 'AD_SHARE' | 'SPONSOR_GRANT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'CONVERSION_OUT';

/** 能量收支流水行（金额有符号：收入 +，兑换/扣减 −） */
export interface LedgerEntry {
  id: string;
  schoolId: string;
  type: LedgerType;
  amountCents: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: string;
}

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

/** 申请时的银行卡快照（此后改绑不影响在途提现） */
export interface WithdrawalBankSnapshot {
  accountName: string;
  bankName: string;
  accountNo: string;
}

/** 提现申请行（listWithdrawals 响应带 school join） */
export interface WithdrawalRequest {
  id: string;
  schoolId: string;
  status: WithdrawalStatus;
  amountCents: number;
  bankSnapshot: WithdrawalBankSnapshot;
  requestedByAdminId: string;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
  school: { id: string; name: string };
}

/**
 * GET /admin/finance/schools/:id/summary 响应（能量概要，ledger 分页嵌套在概要里）。
 * 提现改扣现金账本后，能量侧冻结只剩在途兑换。
 */
export interface SchoolFinanceSummary {
  schoolId: string;
  schoolName: string;
  /** 可用能量余额 = Σledger − 在途兑换冻结 */
  balanceCents: number;
  /** 累计收入 = 正数 ledger 之和 */
  totalIncomeCents: number;
  /** 在途兑换（PENDING 兑换申请）合计 */
  frozenCents: number;
  ledger: ListResult<LedgerEntry>;
}

export type ConversionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** 兑换申请行（listConversions 响应带 school join；amountCents = 兑换能量数 = 入账赞助费分数，1:1） */
export interface ConversionRequest {
  id: string;
  schoolId: string;
  status: ConversionStatus;
  amountCents: number;
  requestedByAdminId: string;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  school: { id: string; name: string };
}

/** SchoolCashLedgerEntry.type（prisma SchoolCashLedgerType；赞助费现金账本） */
export type CashLedgerType = 'CONVERSION_IN' | 'WITHDRAWAL' | 'ADJUSTMENT';

/** 赞助费收支流水行（金额有符号：兑换入账 +，提现打款 −） */
export interface CashLedgerEntry {
  id: string;
  schoolId: string;
  type: CashLedgerType;
  amountCents: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: string;
}

/** GET /admin/finance/schools/:id/cash-summary 响应（赞助费概要，结构镜像能量概要） */
export interface SchoolCashSummary {
  schoolId: string;
  schoolName: string;
  /** 赞助费可用余额 = Σ cashLedger − 在途提现冻结 */
  cashBalanceCents: number;
  /** 在途提现（PENDING/APPROVED）合计 */
  frozenCents: number;
  /** 累计兑换入账 = Σ CONVERSION_IN */
  totalConvertedCents: number;
  ledger: ListResult<CashLedgerEntry>;
}

/** GET /admin/schools/:id 中本域消费的字段（完整响应还含分成/计价/统计，不消费不声明） */
export interface SchoolBankInfo {
  id: string;
  name: string;
  bankAccountName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
}

/** 学校能量概要（能量三卡 + 分页能量流水一次拉取） */
export function getSchoolFinanceSummary(
  schoolId: string,
  params: { page?: number; limit?: number },
): Promise<SchoolFinanceSummary> {
  return get<SchoolFinanceSummary>(`/admin/finance/schools/${schoolId}/summary`, params);
}

/** 学校赞助费概要（现金三卡 + 分页现金流水一次拉取） */
export function getSchoolCashSummary(
  schoolId: string,
  params: { page?: number; limit?: number },
): Promise<SchoolCashSummary> {
  return get<SchoolCashSummary>(`/admin/finance/schools/${schoolId}/cash-summary`, params);
}

/** 读取本校银行账户（学生会仅本校） */
export function getSchoolBankInfo(schoolId: string): Promise<SchoolBankInfo> {
  return get<SchoolBankInfo>(`/admin/schools/${schoolId}`);
}

/**
 * 发起能量兑换赞助费（仅学生会；学校取自当前账号，后端校验 ≤ 可用能量余额并冻结等额能量）。
 * 响应无 school join。
 */
export function createConversion(data: {
  amountCents: number;
}): Promise<Omit<ConversionRequest, 'school'>> {
  return post<Omit<ConversionRequest, 'school'>>('/admin/finance/conversions', data);
}

/** 兑换记录（学生会调用时后端自动 scope 到本校） */
export function listConversions(params: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<ListResult<ConversionRequest>> {
  return get<ListResult<ConversionRequest>>('/admin/finance/conversions', params);
}

/**
 * 发起提现（仅学生会；学校取自当前账号，后端校验已绑卡且 ≤ 赞助费现金余额，
 * 不足报「赞助费余额不足」）。响应无 school join。
 */
export function createWithdrawal(data: {
  amountCents: number;
}): Promise<Omit<WithdrawalRequest, 'school'>> {
  return post<Omit<WithdrawalRequest, 'school'>>('/admin/finance/withdrawals', data);
}

/** 提现记录（学生会调用时后端自动 scope 到本校） */
export function listWithdrawals(params: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<ListResult<WithdrawalRequest>> {
  return get<ListResult<WithdrawalRequest>>('/admin/finance/withdrawals', params);
}
