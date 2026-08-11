/**
 * settings 域 API：SystemConfig 通用配置读写（仅 SUPER）+ 全局分成默认值专用接口。
 * 广告计价默认值不在此封装——复用 @/lib/api/schools 的 getPricingDefaults/updatePricingDefaults。
 * ad_pricing_defaults / ad_share_defaults 两键在 PUT /admin/configs/:key 上都被后端拒写，
 * 专用接口（/admin/ad-pricing/*）是这两行配置的唯一写入口。
 */
import { get, put } from './client';
import type { AdShareDefaults, SystemConfigItem } from '@/lib/types';

/** 该键在通用配置接口上被后端拒写，必须走计价专用表单 */
export const AD_PRICING_CONFIG_KEY = 'ad_pricing_defaults';

/** 该键在通用配置接口上被后端拒写，必须走分成默认值专用表单 */
export const AD_SHARE_CONFIG_KEY = 'ad_share_defaults';

/** 全部配置（后端已按 key 升序） */
export function listSystemConfigs(): Promise<{ items: SystemConfigItem[] }> {
  return get<{ items: SystemConfigItem[] }>('/admin/configs');
}

/** 更新单键（后端键白名单，白名单外 400） */
export function updateSystemConfig(key: string, value: unknown): Promise<SystemConfigItem> {
  return put<SystemConfigItem>(`/admin/configs/${encodeURIComponent(key)}`, { value });
}

/** 全局分成默认值（学校未单独配置 bps 时的回落值；GET 仅 SUPER/TEAM） */
export function getShareDefaults(): Promise<AdShareDefaults> {
  return get<AdShareDefaults>('/admin/ad-pricing/share-defaults');
}

/** 更新全局分成默认值（bps，0–10000，两字段必填） */
export function updateShareDefaults(data: AdShareDefaults): Promise<AdShareDefaults> {
  return put<AdShareDefaults>('/admin/ad-pricing/share-defaults', data);
}
