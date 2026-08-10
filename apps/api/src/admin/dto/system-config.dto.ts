import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

/**
 * 可经通用配置接口（PUT /admin/configs/:key）写入的键——只准入代码中实际被读取的键。
 * ad_pricing_defaults 刻意排除：必须走 PUT /admin/ad-pricing/defaults（有正整数校验），
 * 消除同一行配置的双写路径。
 */
export const CONFIG_KEY_ALLOWLIST: readonly string[] = [
  'public_profile_fields', // profiles.service 读取：公开资料字段白名单
  'energy.refundOnExpire', // matching.service 读取：过期退款开关
];

/** 广告计价默认值键（写入被重定向到专用接口） */
export const AD_PRICING_DEFAULTS_KEY = 'ad_pricing_defaults';

/** 广告分成默认值键（能量经济 B4；写入被重定向到 PUT /admin/ad-pricing/share-defaults） */
export const AD_SHARE_DEFAULTS_CONFIG_KEY = 'ad_share_defaults';

/**
 * 写入被重定向到专用接口的配置键：通用配置接口（PUT /admin/configs/:key）对这些键
 * 应报「请走专用接口」的专项错误，而非笼统的「键不在白名单」。
 * 注意：admin.service.updateSystemConfig 改用本数组的接线由编排方完成（此处只备常量）。
 */
export const REDIRECTED_CONFIG_KEYS: readonly string[] = [
  AD_PRICING_DEFAULTS_KEY,
  AD_SHARE_DEFAULTS_CONFIG_KEY,
];

export class UpdateSystemConfigDto {
  @ApiProperty({ description: '配置值（任意 JSON，按键语义解释）' })
  @IsDefined({ message: 'value 不能为空' })
  value: unknown;
}
