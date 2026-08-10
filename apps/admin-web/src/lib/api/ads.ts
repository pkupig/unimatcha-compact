/**
 * ads 域 API（apps/api/src/ads/ads-admin.controller.ts 的逐端点映射）。
 * 列表恒 ListResult<Campaign>；操作端点均返回整形后的 Campaign（调用方一般只 refresh）。
 */
import { get, post, put } from './client';
import type {
  AdsOverview,
  Campaign,
  CampaignDetail,
  CampaignInput,
  CampaignStatsResponse,
  ListResult,
} from '@/lib/types';

/** 角色化投放总览（判别联合，消费方按 role 收窄；dashboard 域共用） */
export function getAdsOverview(): Promise<AdsOverview> {
  return get<AdsOverview>('/admin/ads/overview');
}

export function listCampaigns(params: {
  status?: string;
  schoolId?: string;
  page?: number;
  limit?: number;
}): Promise<ListResult<Campaign>> {
  return get<ListResult<Campaign>>('/admin/ads/campaigns', params);
}

export function getCampaign(id: string): Promise<CampaignDetail> {
  return get<CampaignDetail>(`/admin/ads/campaigns/${id}`);
}

export function getCampaignStats(
  id: string,
  params?: { from?: string; to?: string },
): Promise<CampaignStatsResponse> {
  return get<CampaignStatsResponse>(`/admin/ads/campaigns/${id}/stats`, params);
}

// ── SPONSOR：创建 / 编辑 / 提交 ─────────────────────────────

export function createCampaign(data: CampaignInput): Promise<Campaign> {
  return post<Campaign>('/admin/ads/campaigns', data);
}

export function updateCampaign(id: string, data: CampaignInput): Promise<Campaign> {
  return put<Campaign>(`/admin/ads/campaigns/${id}`, data);
}

/** 提交审核：计价快照锁定；自拉→学生会审，直签→平台审 */
export function submitCampaign(id: string): Promise<Campaign> {
  return post<Campaign>(`/admin/ads/campaigns/${id}/submit`);
}

// ── 审核 / 收款 / 状态流转 ──────────────────────────────────

export function reviewCampaign(
  id: string,
  data: { approve: boolean; note?: string },
): Promise<Campaign> {
  return post<Campaign>(`/admin/ads/campaigns/${id}/review`, data);
}

export function confirmCampaignPayment(id: string, data: { note?: string }): Promise<Campaign> {
  return post<Campaign>(`/admin/ads/campaigns/${id}/confirm-payment`, data);
}

export function pauseCampaign(id: string): Promise<Campaign> {
  return post<Campaign>(`/admin/ads/campaigns/${id}/pause`);
}

export function resumeCampaign(id: string): Promise<Campaign> {
  return post<Campaign>(`/admin/ads/campaigns/${id}/resume`);
}

export function suspendCampaign(id: string, data: { reason: string }): Promise<Campaign> {
  return post<Campaign>(`/admin/ads/campaigns/${id}/suspend`, data);
}

export function unsuspendCampaign(id: string): Promise<Campaign> {
  return post<Campaign>(`/admin/ads/campaigns/${id}/unsuspend`);
}
