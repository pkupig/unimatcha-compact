/**
 * settings 域契约类型（对照 apps/api/src/admin/admin.service.ts 的 getAllConfigs/updateSystemConfig）。
 * 广告计价默认值类型 AdPricingDefaults 由 schools 域定义（同一后端配置行，此处不重复导出，
 * 否则 index 桶导出会撞名）。
 */

/** SystemConfig 行（GET /admin/configs → { items }；value 为任意 JSON，按键语义解释） */
export interface SystemConfigItem {
  id: string;
  key: string;
  value: unknown;
  updatedAt: string;
}

/**
 * 全局分成默认值（GET/PUT /admin/ad-pricing/share-defaults，SystemConfig ad_share_defaults）。
 * School.platformShareBps / selfSourcedShareBps 为 null 时继承此处（bps，0–10000）。
 */
export interface AdShareDefaults {
  platformShareBps: number;
  selfSourcedShareBps: number;
}
