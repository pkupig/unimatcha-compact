/**
 * schools 域契约类型（对照 apps/api/src/schools/schools.service.ts）。
 * 金额恒 *Cents；分成恒 bps（0–10000）。
 */

/** 每校统计（schools.service.computeStats 实际返回形状） */
export interface SchoolStats {
  userCount: number;
  activeCampaignCount: number;
  totalRevenueCents: number;
  balanceCents: number;
}

/**
 * 学校完整行（TEAM/UNION 视角；GET /admin/schools 列表项与 GET /admin/schools/:id 详情同形）。
 * - 商家角色调用列表时后端只返回瘦身字段（id/name/city/isActive + effectivePrices），
 *   该形状由 ads 域按需自行定义，不在此镜像。
 * - stats 仅列表/详情响应附带；create/update/bank 的响应为裸行无此字段。
 */
export interface School {
  id: string;
  name: string;
  city: string | null;
  isActive: boolean;
  /** 平台直签广告分成（bps）：null = 继承全局 ad_share_defaults（缺省 10%） */
  platformShareBps: number | null;
  /** 学生会自拉赞助分成（bps）：null = 继承全局（缺省 30%，鼓励拉新） */
  selfSourcedShareBps: number | null;
  /** 计价覆盖：null = 继承全局默认（SystemConfig ad_pricing_defaults） */
  buyoutDailyPriceCents: number | null;
  cpmPriceCents: number | null;
  cpcPriceCents: number | null;
  /** 提现银行账户（MVP 仅记录，提现时快照） */
  bankAccountName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: SchoolStats;
}

/** 全局广告计价默认值（GET/PUT /admin/ad-pricing/defaults；缺省 20000/5000/200 分） */
export interface AdPricingDefaults {
  buyoutDailyPriceCents: number;
  cpmPriceCents: number;
  cpcPriceCents: number;
}

/** 列表查询（isActive 为 'true'/'false' 字符串，后端按字符串比较） */
export type ListSchoolsParams = {
  search?: string;
  isActive?: string;
  page?: number;
  limit?: number;
};

/** 创建学校（name 唯一，与 Profile.school 字符串精确匹配；分成/计价缺省走后端默认） */
export type CreateSchoolPayload = {
  name: string;
  city?: string | null;
  isActive?: boolean;
};

/** 更新学校：全部可选；分成/计价覆盖字段显式传 null = 清除覆盖回落全局默认 */
export type UpdateSchoolPayload = {
  name?: string;
  city?: string | null;
  isActive?: boolean;
  platformShareBps?: number | null;
  selfSourcedShareBps?: number | null;
  buyoutDailyPriceCents?: number | null;
  cpmPriceCents?: number | null;
  cpcPriceCents?: number | null;
};

/** 绑定银行账户（三项均必填非空） */
export type UpdateSchoolBankPayload = {
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
};
