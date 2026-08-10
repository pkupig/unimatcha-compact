'use client';

/** 商家仪表盘：4 投放统计卡 + 近 7 天曝光/点击趋势（页头「新建广告」CTA 由 page 渲染） */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, Eye, Megaphone, MousePointerClick } from 'lucide-react';
import type { SponsorAdsOverview, SponsorDashboard as SponsorDashboardData } from '@/lib/types';
import { getAdsOverview } from '@/lib/api/ads';
import { toastError } from '@/lib/toast';
import { formatNumber, formatShortDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Money } from '@/components/ui/Money';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import { ChartSkeleton, StatGrid } from './DashboardShared';

export function SponsorDashboard({ data }: { data: SponsorDashboardData }) {
  const [overview, setOverview] = useState<SponsorAdsOverview | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAdsOverview()
      .then((o) => {
        // 按商家分支独有的 7 天日序列字段收窄联合
        if (!cancelled && 'dailySeries7d' in o) setOverview(o);
      })
      .catch((e) => {
        if (!cancelled) toastError(e);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const series = overview ? overview.dailySeries7d : [];
  const hasTraffic = series.some((s) => s.impressions > 0 || s.clicks > 0);

  return (
    <>
      <StatGrid>
        <StatCard label="投放中广告" value={formatNumber(data.activeCampaigns)} icon={Megaphone} />
        <StatCard
          label="总消耗"
          value={<Money cents={data.totalSpendCents} />}
          sub="累计口径（全部投放）"
          icon={Banknote}
        />
        <StatCard
          label="曝光"
          value={formatNumber(data.impressionsTotal)}
          sub={overview ? `累计 · 近 7 天 ${formatNumber(overview.impressions7d)}` : '累计口径'}
          icon={Eye}
        />
        <StatCard
          label="点击"
          value={formatNumber(data.clicksTotal)}
          sub={overview ? `累计 · 近 7 天 ${formatNumber(overview.clicks7d)}` : '累计口径'}
          icon={MousePointerClick}
        />
      </StatGrid>

      <Card caption="IMPRESSIONS & CLICKS / 7D" title="近 7 天曝光与点击">
        {chartLoading ? (
          <ChartSkeleton />
        ) : !hasTraffic ? (
          <EmptyState
            text={overview ? '近 7 天暂无投放数据' : '投放数据加载失败，请刷新重试'}
            action={
              overview ? (
                <Link href="/ads/new" className="btn-secondary btn-sm">
                  新建广告
                </Link>
              ) : undefined
            }
          />
        ) : (
          <TrendChart
            data={series.map((s) => ({
              date: formatShortDate(s.date),
              impressions: s.impressions,
              clicks: s.clicks,
            }))}
            x="date"
            series={[
              { key: 'impressions', name: '曝光', color: 'ink' },
              { key: 'clicks', name: '点击', color: 'neon' },
            ]}
            formatY={(v) => formatNumber(v)}
          />
        )}
      </Card>
    </>
  );
}
