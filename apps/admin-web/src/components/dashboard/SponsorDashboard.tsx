'use client';

/** 广告商仪表盘：能量余额 + 4 投放统计卡 + 近 7 天曝光/点击趋势 + 近 30 天消耗趋势（页头「新建广告」CTA 由 page 渲染） */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, Eye, Megaphone, MousePointerClick, Wallet } from 'lucide-react';
import type { SponsorAdsOverview, SponsorDashboard as SponsorDashboardData } from '@/lib/types';
import { getAdsOverview } from '@/lib/api/ads';
import { getWalletSummary, type WalletSummary } from '@/lib/api/wallet';
import { DEEP_LINKS } from '@/lib/permissions';
import { toastError } from '@/lib/toast';
import { formatEnergy, formatNumber, formatShortDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Energy } from '@/components/ui/Energy';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import { ChartSkeleton, StatGrid } from './DashboardShared';

export function SponsorDashboard({ data }: { data: SponsorDashboardData }) {
  const [overview, setOverview] = useState<SponsorAdsOverview | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);

  // 能量余额独立取数：钱包接口失败不拖累投放统计（静默显示 0 会误导，故仍 toast）
  useEffect(() => {
    let cancelled = false;
    getWalletSummary()
      .then((w) => {
        if (!cancelled) setWallet(w);
      })
      .catch((e) => {
        if (!cancelled) toastError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAdsOverview()
      .then((o) => {
        // 按广告商分支独有的 7 天日序列字段收窄联合
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
  const series30 = overview ? overview.dailySeries30d : [];
  const hasSpend30 = series30.some((s) => s.spendCents > 0);

  return (
    <>
      <StatGrid>
        <StatCard
          label="能量余额"
          value={<Energy value={wallet?.balanceCents} approx />}
          sub={
            <Link href={DEEP_LINKS.sponsorWallet} className="font-medium text-neon-dark hover:underline">
              去充值
            </Link>
          }
          icon={Wallet}
        />
        <StatCard label="投放中广告" value={formatNumber(data.activeCampaigns)} icon={Megaphone} />
        <StatCard
          label="总消耗"
          value={<Energy value={data.totalSpendCents} />}
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

      <Card caption="SPEND / 30D" title="近 30 天消耗趋势">
        {chartLoading ? (
          <ChartSkeleton />
        ) : !hasSpend30 ? (
          <EmptyState
            text={overview ? '近 30 天暂无消耗' : '投放数据加载失败，请刷新重试'}
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
            kind="bar"
            data={series30.map((s) => ({
              date: formatShortDate(s.date),
              spendCents: s.spendCents,
            }))}
            x="date"
            series={[{ key: 'spendCents', name: '消耗', color: 'neon' }]}
            formatY={formatEnergy}
          />
        )}
      </Card>
    </>
  );
}
