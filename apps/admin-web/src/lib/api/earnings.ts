/**
 * earnings 域 API（学生会钱包 /earnings）。
 * 域内例外：earnings 无独立 types stub 文件，契约类型直接在本文件顶部定义并导出。
 * 后端真源：finance.service.getSchoolSummary / createWithdrawal / listWithdrawals；
 * 银行卡读取走 schools.service.detail（学生会仅可读本校，返回完整 school 行 + stats，
 * 本域只声明消费到的字段）。
 */
import { get, post } from './client';
import type { ListResult } from '@/lib/types';

/** SchoolLedgerEntry.type（prisma LedgerEntryType） */
export type LedgerType = 'AD_SHARE' | 'SPONSOR_GRANT' | 'WITHDRAWAL' | 'ADJUSTMENT';

/** 收支流水行（金额有符号：收入 +，提现/扣减 −） */
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

/** GET /admin/finance/schools/:id/summary 响应（ledger 分页嵌套在概要里） */
export interface SchoolFinanceSummary {
  schoolId: string;
  schoolName: string;
  /** 可用余额 = Σledger − 在途冻结 */
  balanceCents: number;
  /** 累计收入 = 正数 ledger 之和 */
  totalIncomeCents: number;
  /** 在途提现（PENDING/APPROVED）合计 */
  frozenCents: number;
  ledger: ListResult<LedgerEntry>;
}

/** GET /admin/schools/:id 中本域消费的字段（完整响应还含分成/计价/统计，不消费不声明） */
export interface SchoolBankInfo {
  id: string;
  name: string;
  bankAccountName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
}

/** 学校财务概要（余额三卡 + 分页收支明细一次拉取） */
export function getSchoolFinanceSummary(
  schoolId: string,
  params: { page?: number; limit?: number },
): Promise<SchoolFinanceSummary> {
  return get<SchoolFinanceSummary>(`/admin/finance/schools/${schoolId}/summary`, params);
}

/** 读取本校银行账户（学生会仅本校） */
export function getSchoolBankInfo(schoolId: string): Promise<SchoolBankInfo> {
  return get<SchoolBankInfo>(`/admin/schools/${schoolId}`);
}

/** 发起提现（仅学生会；学校取自当前账号，后端校验已绑卡且 ≤ 可用余额）。响应无 school join */
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
