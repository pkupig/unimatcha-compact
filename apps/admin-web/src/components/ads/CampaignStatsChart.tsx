'use client';

/**
 * 数据区（ADSD-5）：预算进度（仅 CPM/CPC）+ 曝光/点击/CTR/消耗统计
 * + 按日聚合（跨校求和）的曝光+点击折线 + 每日消耗柱状图
 * + 分校对比（消耗占比走 CSS 比例条而非 recharts——曝光与能量不混轴）。
 * 日序列为空时统计回退 campaign 聚合值（stats 汇总），图表显示空态。
 */
import { useMemo } from 'react';
import { Eye, MousePointerClick, Percent, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Energy } from '@/components/ui/Energy';
import { StatCard } from '@/components/ui/StatCard';
import { TrendChart } from '@/components/ui/TrendChart';
import { formatEnergy, formatNumber, formatShortDate } from '@/lib/format';
import type { CampaignDailyStat, CampaignDetail, CampaignSchoolStat } from '@/lib/types';

export function CampaignStatsChart({
  campaign,
  series,
}: {
  campaign: CampaignDetail;
  series: CampaignDailyStat[];
}) {
  // 跨校按日求和（AdDailyStat 每校一行）
  const daily = useMemo(() => {
    const byDate = new Map<string, { day: string; impressions: number; clicks: number; spendCents: number }>();
    for (const row of series) {
      const key = row.date.slice(0, 10);
      const cur = byDate.get(key) ?? { day: formatShortDate(key), impressions: 0, clicks: 0, spendCents: 0 };
      cur.impressions += row.impressions;
      cur.clicks += row.clicks;
      cur.spendCents += row.spendCents;
      byDate.set(key, cur);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [series]);

  const summary = useMemo(() => {
    const fromSeries = daily.reduce(
      (acc, p) => ({ impressions: acc.impressions + p.impressions, clicks: acc.clicks + p.clicks }),
      { impressions: 0, clicks: 0 },
    );
    const impressions = daily.length ? fromSeries.impressions : campaign.stats.impressions;
    const clicks = daily.length ? fromSeries.clicks : campaign.stats.clicks;
    const ctr = impressions > 0 ? `${((clicks / impressions) * 100).toFixed(2)}%` : '-';
    return { impressions, clicks, ctr };
  }, [daily, campaign]);

  return (
    <>
      <Card caption="PERFORMANCE" title="数据">
        <BudgetProgress campaign={campaign} />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <StatCard label="曝光" value={formatNumber(summary.impressions)} icon={Eye} />
          <StatCard label="点击" value={formatNumber(summary.clicks)} icon={MousePointerClick} />
          <StatCard label="CTR" value={summary.ctr} icon={Percent} />
          <StatCard label="消耗" value={formatEnergy(campaign.spendCents)} icon={Wallet} />
        </div>
        {daily.length === 0 ? (
          <EmptyState text="暂无投放数据，广告开始投放后将展示每日曝光与点击趋势。" />
        ) : (
          <TrendChart
            data={daily}
            x="day"
            series={[
              { key: 'impressions', name: '曝光', color: 'ink' },
              { key: 'clicks', name: '点击', color: 'neon' },
            ]}
            formatY={(v) => formatNumber(v)}
          />
        )}
      </Card>

      <Card caption="DAILY SPEND" title="每日消耗">
        {daily.length === 0 ? (
          <EmptyState text="暂无消耗数据，广告开始投放后将展示每日能量消耗。" />
        ) : (
          <TrendChart
            data={daily}
            x="day"
            kind="bar"
            series={[{ key: 'spendCents', name: '消耗', color: 'neon' }]}
            formatY={formatEnergy}
          />
        )}
      </Card>

      <SchoolCompareCard bySchool={campaign.stats.bySchool} />
    </>
  );
}

/** 预算进度（CPM/CPC 且有预算才显示；超支封顶 100%，条转粉提示） */
function BudgetProgress({ campaign }: { campaign: CampaignDetail }) {
  if (campaign.pricingModel === 'BUYOUT' || campaign.budgetCents == null || campaign.budgetCents <= 0) {
    return null;
  }
  const pct = Math.min(100, (campaign.spendCents / campaign.budgetCents) * 100);
  const over = campaign.spendCents >= campaign.budgetCents;
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="caption">预算进度</p>
        <p className="text-xs font-mono text-on-surface-variant whitespace-nowrap">
          已消耗 {formatNumber(campaign.spendCents)} / 预算 {formatNumber(campaign.budgetCents)} 能量
          <span className={`ml-2 font-bold ${over ? 'text-neon-pink' : 'text-on-surface'}`}>
            {pct.toFixed(1)}%
          </span>
        </p>
      </div>
      <div className="h-2 rounded-full bg-surface-high overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? 'bg-neon-pink' : 'bg-neon'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** 分校对比：每校一行（曝光/点击 + 消耗能量），比例条按消耗占全部投放校的份额 */
function SchoolCompareCard({ bySchool }: { bySchool: CampaignSchoolStat[] }) {
  const rows = [...bySchool].sort((a, b) => b.spendCents - a.spendCents);
  const totalSpend = rows.reduce((sum, r) => sum + r.spendCents, 0);
  return (
    <Card caption="BY SCHOOL" title="分校对比">
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">暂无分校数据</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.schoolId}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-sm font-medium text-on-surface truncate">
                  {row.schoolName ?? row.schoolId}
                </span>
                <span className="text-xs font-mono text-on-surface-variant whitespace-nowrap">
                  曝光 {formatNumber(row.impressions)} · 点击 {formatNumber(row.clicks)} ·{' '}
                  <Energy value={row.spendCents} className="text-on-surface" />
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-high overflow-hidden">
                <div
                  className="h-full rounded-full bg-ink"
                  style={{ width: `${totalSpend > 0 ? (row.spendCents / totalSpend) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
