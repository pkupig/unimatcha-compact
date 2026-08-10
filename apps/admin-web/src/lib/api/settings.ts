/**
 * settings 域 API：SystemConfig 通用配置读写（仅 SUPER）。
 * 广告计价默认值不在此封装——复用 @/lib/api/schools 的 getPricingDefaults/updatePricingDefaults：
 * 后端对 PUT /admin/configs/ad_pricing_defaults 拒写（400），专用接口是该行的唯一写入口。
 */
import { get, put } from './client';
import type { SystemConfigItem } from '@/lib/types';

/** 该键在通用配置接口上被后端拒写，必须走上方计价专用表单 */
export const AD_PRICING_CONFIG_KEY = 'ad_pricing_defaults';

/** 全部配置（后端已按 key 升序） */
export function listSystemConfigs(): Promise<{ items: SystemConfigItem[] }> {
  return get<{ items: SystemConfigItem[] }>('/admin/configs');
}

/** 更新单键（后端键白名单，白名单外 400） */
export function updateSystemConfig(key: string, value: unknown): Promise<SystemConfigItem> {
  return put<SystemConfigItem>(`/admin/configs/${encodeURIComponent(key)}`, { value });
}
