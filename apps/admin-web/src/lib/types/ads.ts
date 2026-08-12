/**
 * ads 域契约类型（对照 apps/api/src/ads/ads.service.ts 的真实响应逐字段镜像）。
 * - Campaign = shapeCampaign 输出：placements 已展平出 schoolName，恒带 stats 汇总
 * - 金额恒 *Cents；日期为 ISO 字符串
 */
import type { School } from './schools';

export type PricingModel = 'BUYOUT' | 'CPM' | 'CPC';

export type CampaignStatus =
  | 'DRAFT'
  | 'PENDING_UNION_REVIEW'
  | 'PENDING_PLATFORM_REVIEW'
  | 'REJECTED'
  | 'PENDING_PAYMENT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'SUSPENDED'
  | 'COMPLETED';

/** 状态筛选下拉的展示顺序（生命周期序，标签取 labels.CAMPAIGN_STATUS） */
export const CAMPAIGN_STATUS_VALUES: readonly CampaignStatus[] = [
  'DRAFT',
  'PENDING_UNION_REVIEW',
  'PENDING_PLATFORM_REVIEW',
  'REJECTED',
  'PENDING_PAYMENT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'SUSPENDED',
  'COMPLETED',
];

/** 提交时锁定的单价快照（{schoolId: entry}） */
export interface PriceSnapshotEntry {
  buyoutDaily: number;
  cpm: number;
  cpc: number;
}

export interface CampaignAdvertiser {
  id: string;
  name: string;
  organizationName: string | null;
}

/** shapeCampaign 展平后的投放位 */
export interface CampaignPlacement {
  id: string;
  schoolId: string;
  schoolName: string | null;
  /** BUYOUT：提交时锁定的 天数 × 该校日单价；CPM/CPC 为 null */
  buyoutPriceCents: number | null;
}

export interface CampaignStatsTotal {
  impressions: number;
  clicks: number;
  spendCents: number;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  title: string;
  content: string;
  images: string[];
  landingUrl: string | null;
  pricingModel: PricingModel;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  /** CPM/CPC 预算；BUYOUT 为 null */
  budgetCents: number | null;
  /** BUYOUT=Σ placement 锁价；CPM/CPC=budgetCents（提交前为 0） */
  totalPriceCents: number;
  spendCents: number;
  priceSnapshot: Record<string, PriceSnapshotEntry> | null;
  /** 提交时冗余：null=平台直签，非空=学生会自拉 */
  sourcedBySchoolId: string | null;
  paymentConfirmedByAdminId: string | null;
  paymentNote: string | null;
  paidAt: string | null;
  unionReviewedByAdminId: string | null;
  platformReviewedByAdminId: string | null;
  reviewNote: string | null;
  rejectedReason: string | null;
  suspendedAt: string | null;
  suspendReason: string | null;
  completedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  advertiser: CampaignAdvertiser;
  placements: CampaignPlacement[];
  stats: CampaignStatsTotal;
}

/** 详情分校汇总行（getCampaign / getCampaignStats 的 bySchool） */
export interface CampaignSchoolStat {
  schoolId: string;
  schoolName: string | null;
  impressions: number;
  clicks: number;
  spendCents: number;
}

/** GET /admin/ads/campaigns/:id —— stats 额外带分校汇总 */
export interface CampaignDetail extends Campaign {
  stats: CampaignStatsTotal & { bySchool: CampaignSchoolStat[] };
}

/** AdDailyStat 日行（getCampaignStats.items，已附 schoolName） */
export interface CampaignDailyStat {
  id: string;
  campaignId: string;
  schoolId: string;
  schoolName: string | null;
  date: string;
  impressions: number;
  clicks: number;
  spendCents: number;
}

export interface CampaignStatsResponse {
  items: CampaignDailyStat[];
  bySchool: CampaignSchoolStat[];
}

/** 创建/编辑载荷（CreateCampaignDto）：BUYOUT 必须省略 budgetCents，landingUrl 空则省略 */
export interface CampaignInput {
  title: string;
  content: string;
  images: string[];
  landingUrl?: string;
  pricingModel: PricingModel;
  startDate: string;
  endDate: string;
  budgetCents?: number;
  schoolIds: string[];
}

// ── 角色化总览（getOverview 三分支，role 为判别键；dashboard 域引用） ──

export interface AdsDailyPoint {
  date: string;
  impressions: number;
  clicks: number;
  spendCents: number;
}

export interface SponsorAdsOverview {
  role: 'SPONSOR';
  activeCampaigns: number;
  totalSpendCents: number;
  impressions7d: number;
  clicks7d: number;
  dailySeries7d: AdsDailyPoint[];
  /** 近 30 天逐日（仪表盘消耗趋势用；点位形状同 7d） */
  dailySeries30d: AdsDailyPoint[];
}

export interface UnionAdsOverview {
  role: 'STUDENT_UNION';
  pendingReviewCount: number;
  activeCampaignsInSchool: number;
  schoolSpend30dCents: number;
}

export interface TeamAdsOverview {
  role: 'SUPER' | 'TEAM';
  pendingPlatformReview: number;
  activeCampaigns: number;
  adSpend30dCents: number;
  dailySeries30d: AdsDailyPoint[];
}

export type AdsOverview = TeamAdsOverview | UnionAdsOverview | SponsorAdsOverview;

// ── 广告商选校（listSchools 对 SPONSOR 的瘦身行） ──

/** 后端已合并（学校覆盖价 → 全局默认）后的生效单价 */
export interface AdSchoolPrices {
  buyoutDailyPriceCents: number;
  cpmPriceCents: number;
  cpcPriceCents: number;
}

/**
 * 广告商视角的学校行：在 ads 域宽化而非要求 schools 域声明该字段——
 * effectivePrices 仅对 SPONSOR 返回，缺失时报价显示「待核价」
 */
export type SponsorSchool = School & { effectivePrices?: AdSchoolPrices | null };

/**
 * 学生会自设本校单价载荷（PUT /admin/schools/:id/ad-pricing）：
 * null = 清除覆盖回落全局默认；数值为正整数能量（≡ *Cents 原值）
 */
export interface UpdateUnionAdPricingPayload {
  buyoutDailyPriceCents: number | null;
  cpmPriceCents: number | null;
  cpcPriceCents: number | null;
}
