/**
 * wallet 域 API（商家能量钱包 /wallet）。
 * 域内例外：同 earnings 先例，无独立 types stub 文件，契约类型在本文件顶部定义并导出。
 * 后端真源：sponsor-wallet.service getSummary / listLedger / topup（SPONSOR own）。
 * 能量经济：1 元 = 100 分 = 100 能量，数值同构——amountCents 即能量数，展示绝不 /100。
 */
import { get, post } from './client';
import type { ListResult } from '@/lib/types';

/** SponsorEnergyLedger.type（prisma SponsorLedgerType） */
export type SponsorLedgerType = 'TOPUP' | 'CAMPAIGN_LOCK' | 'REFUND' | 'ADJUSTMENT';

/** 钱包流水行（有符号：充值/退回 +，投放预扣 −） */
export interface SponsorLedgerEntry {
  id: string;
  adminId: string;
  type: SponsorLedgerType;
  /** 'campaign' | 'topup' | 'adjustment'（refType='campaign' 时 refId 为 campaignId，可深链投放详情） */
  refType: string | null;
  refId: string | null;
  amountCents: number;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: string;
}

/** GET /admin/sponsor-wallet/summary 响应 */
export interface WalletSummary {
  /** 可用余额 = Σ 流水（账本即余额，无独立余额行） */
  balanceCents: number;
  /** 广告在途锁定净额（预扣后为正、退完归 0） */
  lockedCents: number;
  /** 累计充值（TOPUP 流水合计） */
  totalTopupCents: number;
}

/** 钱包概览：余额 / 在途锁定 / 累计充值 */
export function getWalletSummary(): Promise<WalletSummary> {
  return get<WalletSummary>('/admin/sponsor-wallet/summary');
}

/** 钱包流水（own，倒序；可按类型筛选） */
export function listWalletLedger(params: {
  type?: string;
  page?: number;
  limit?: number;
}): Promise<ListResult<SponsorLedgerEntry>> {
  return get<ListResult<SponsorLedgerEntry>>('/admin/sponsor-wallet/ledger', params);
}

/**
 * 充值（MVP mock 即时到账）。clientToken 为客户端幂等键（8-64 位）：
 * 同键重复请求后端直接返回既有流水行，不重复入账——每次打开充值弹窗须生成新 UUID。
 */
export function topupWallet(data: {
  amountCents: number;
  clientToken: string;
}): Promise<SponsorLedgerEntry> {
  return post<SponsorLedgerEntry>('/admin/sponsor-wallet/topup', data);
}
