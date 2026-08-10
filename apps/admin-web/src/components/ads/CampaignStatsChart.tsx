'use client';

/**
 * 数据卡（ADSD-5）：曝光/点击/CTR/消耗统计 + 按日聚合（跨校求和）的曝光+点击趋势图。
 * 日序列为空时统计回退 campaign 聚合值（stats 汇总），图表显示空态。
 */
import { useMemo } from 'react';
import { Eye, MousePointerClick, Percent, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/StatCard';
import { TrendChart } from '@/components/ui/TrendChart';
import { fenToYuan, formatNumber, formatShortDate } from '@/lib/format';
import type { CampaignDailyStat, CampaignDetail } from '@/lib/types';

export function CampaignStatsChart({
  campaign,
  series,
}: {
  campaign: CampaignDetail;
  series: CampaignDailyStat[];
}) {
  // 跨校按日求和（AdDailyStat 每校一行）
  const daily = useMemo(() => {
    const byDate = new Map<string, { day: string; impressions: number; clicks: number }>();
    for (const row of series) {
      const key = row.date.slice(0, 10);
      const cur = byDate.get(key) ?? { day: formatShortDate(key), impressions: 0, clicks: 0 };
      cur.impressions += row.impressions;
      cur.clicks += row.clicks;
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
    <Card caption="PERFORMANCE" title="数据">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <StatCard label="曝光" value={formatNumber(summary.impressions)} icon={Eye} />
        <StatCard label="点击" value={formatNumber(summary.clicks)} icon={MousePointerClick} />
        <StatCard label="CTR" value={summary.ctr} icon={Percent} />
        <StatCard label="消耗" value={fenToYuan(campaign.spendCents)} icon={Wallet} />
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
  );
}
