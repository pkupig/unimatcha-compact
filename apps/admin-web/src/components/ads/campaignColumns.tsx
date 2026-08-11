'use client';

/**
 * 广告列表列配置（ADS-0 共享列）：四种视图按角色取列，
 * 用配置组合而非三份页面各写一遍表格。
 */
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Energy } from '@/components/ui/Energy';
import type { Column } from '@/components/ui/DataTable';
import { CAMPAIGN_STATUS, PRICING_MODEL } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import type { Campaign } from '@/lib/types';

/** 来源徽标：平台直签 / 校名·自拉（校名从 placements 反查——自拉单只投本校） */
export function SourceBadge({ campaign }: { campaign: Campaign }) {
  if (!campaign.sourcedBySchoolId) return <Badge variant="outline">平台直签</Badge>;
  const name =
    campaign.placements.find((p) => p.schoolId === campaign.sourcedBySchoolId)?.schoolName ??
    '学生会';
  return <Badge variant="ink">{name}·自拉</Badge>;
}

const colTitle: Column<Campaign> = {
  key: 'title',
  header: '标题',
  render: (c) => (
    <span className="font-medium text-on-surface line-clamp-1 max-w-[220px]">{c.title}</span>
  ),
};

const colAdvertiser: Column<Campaign> = {
  key: 'advertiser',
  header: '广告商',
  render: (c) => (
    <span className="text-on-surface-variant">
      {c.advertiser.organizationName ?? c.advertiser.name}
    </span>
  ),
};

const colSource: Column<Campaign> = {
  key: 'source',
  header: '来源',
  render: (c) => <SourceBadge campaign={c} />,
};

const colPricing: Column<Campaign> = {
  key: 'pricingModel',
  header: '计价',
  render: (c) => <StatusBadge meta={PRICING_MODEL} value={c.pricingModel} />,
};

const colSchools: Column<Campaign> = {
  key: 'schools',
  header: '投放学校',
  render: (c) => <span className="font-mono">{c.placements.length}</span>,
};

const colSchedule: Column<Campaign> = {
  key: 'schedule',
  header: '档期',
  render: (c) => (
    <span className="font-mono text-xs whitespace-nowrap text-on-surface-variant">
      {formatDate(c.startDate)} ~ {formatDate(c.endDate)}
    </span>
  ),
};

/** BUYOUT 显示锁定报价，CPM/CPC 显示预算（能量经济：数值 ≡ *Cents 原值） */
const colQuote: Column<Campaign> = {
  key: 'quote',
  header: '报价 / 预算',
  align: 'right',
  render: (c) => <Energy value={c.pricingModel === 'BUYOUT' ? c.totalPriceCents : c.budgetCents} />,
};

const colSpend: Column<Campaign> = {
  key: 'spend',
  header: '消耗',
  align: 'right',
  render: (c) => <Energy value={c.spendCents} />,
};

const colStatus: Column<Campaign> = {
  key: 'status',
  header: '状态',
  render: (c) => <StatusBadge meta={CAMPAIGN_STATUS} value={c.status} />,
};

const colDetail: Column<Campaign> = {
  key: 'detail',
  header: '操作',
  align: 'right',
  render: (c) => (
    <Link
      href={`/ads/${c.id}`}
      onClick={(e) => e.stopPropagation()}
      className="text-xs font-display font-bold text-ink underline underline-offset-2 hover:text-neon-pink"
    >
      详情
    </Link>
  ),
};

export type CampaignView = 'sponsor' | 'unionReview' | 'unionSchool' | 'team';

const VIEW_COLUMNS: Record<CampaignView, Column<Campaign>[]> = {
  // 广告商：我的广告
  sponsor: [colTitle, colPricing, colSchools, colSchedule, colQuote, colSpend, colStatus, colDetail],
  // 学生会：待我审核队列
  unionReview: [colTitle, colAdvertiser, colPricing, colSchedule, colQuote, colStatus, colDetail],
  // 学生会：本校广告（只读，含来源列）
  unionSchool: [colTitle, colAdvertiser, colSource, colPricing, colSchedule, colSpend, colStatus],
  // 团队：全量
  team: [
    colTitle,
    colAdvertiser,
    colSource,
    colPricing,
    colSchools,
    colSchedule,
    colQuote,
    colSpend,
    colStatus,
    colDetail,
  ],
};

export function campaignColumns(view: CampaignView): Column<Campaign>[] {
  return VIEW_COLUMNS[view];
}
