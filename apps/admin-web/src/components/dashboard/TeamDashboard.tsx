'use client';

/** 团队/SUPER 仪表盘：4 统计卡 + 4 待办 chip + 近 30 天广告消耗趋势 + 快捷入口 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, School, Users, Zap } from 'lucide-react';
import type { AdminRole, TeamAdsOverview, TeamDashboard as TeamDashboardData } from '@/lib/types';
import { getAdsOverview } from '@/lib/api/ads';
import { listConversions } from '@/lib/api/finance';
import { DEEP_LINKS, navForRole } from '@/lib/permissions';
import { toastError } from '@/lib/toast';
import { fenToYuan, formatNumber, formatShortDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Money } from '@/components/ui/Money';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import { ChartSkeleton, StatGrid, TodoChip } from './DashboardShared';

export function TeamDashboard({ data, role }: { data: TeamDashboardData; role: AdminRole }) {
  const [overview, setOverview] = useState<TeamAdsOverview | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  // 待审批兑换计数：dashboard 主 payload 尚无此字段，limit=1 只取 total；失败静默显示 0
  const [pendingConversions, setPendingConversions] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listConversions({ status: 'PENDING', page: 1, limit: 1 })
      .then((r) => {
        if (!cancelled) setPendingConversions(r.total);
      })
      .catch(() => {
        // 静默：计数失败不打断仪表盘其余内容
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAdsOverview()
      .then((o) => {
        // 按团队分支独有的日序列字段收窄联合（不依赖 role 字面量的具体类型写法）
        if (!cancelled && 'dailySeries30d' in o) setOverview(o);
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

  const series = overview ? overview.dailySeries30d : [];
  const hasSpend = series.some((s) => s.spendCents > 0);
  const quickLinks = navForRole(role).filter((e) => e.quickLink);

  return (
    <>
      <StatGrid>
        <StatCard
          label="用户总数"
          value={formatNumber(data.users.total)}
          sub={`活跃 ${formatNumber(data.users.active)} · 封禁 ${formatNumber(data.users.banned)}`}
          icon={Users}
        />
        <StatCard label="合作学校" value={formatNumber(data.schools)} icon={School} />
        <StatCard
          label="30 天广告流水"
          value={<Money cents={data.adSpend30dCents} />}
          sub="平台毛收入 · 近 30 天"
          icon={Banknote}
        />
        <StatCard
          label="累计匹配对数"
          value={formatNumber(data.matching.totalMatches)}
          sub={`待执行任务 ${formatNumber(data.matching.pendingJobs)} · 匹配中 ${formatNumber(data.users.inMatchMode)} 人`}
          icon={Zap}
        />
      </StatGrid>

      <div className="flex flex-wrap gap-3">
        <TodoChip href={DEEP_LINKS.financeWithdrawals} label="待审核提现" count={data.pendingWithdrawals} />
        <TodoChip href={DEEP_LINKS.financeConversions} label="待审批兑换" count={pendingConversions} />
        <TodoChip href={DEEP_LINKS.adsPendingPlatform} label="平台待审广告" count={data.pendingPlatformReview} />
        <TodoChip href={DEEP_LINKS.submissionsPending} label="待处理赞助申请" count={data.pendingSubmissions} />
      </div>

      <Card caption="AD SPEND / 30D" title="近 30 天广告消耗">
        {chartLoading ? (
          <ChartSkeleton />
        ) : !hasSpend ? (
          <EmptyState text={overview ? '近 30 天暂无广告消耗' : '广告数据加载失败，请刷新重试'} />
        ) : (
          <TrendChart
            kind="bar"
            data={series.map((s) => ({ date: formatShortDate(s.date), spendCents: s.spendCents }))}
            x="date"
            series={[{ key: 'spendCents', name: '消耗', color: 'neon' }]}
            formatY={(v) => fenToYuan(v)}
          />
        )}
      </Card>

      <Card caption="QUICK LINKS" title="快捷入口">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-outline-variant/40 hover:bg-surface-low transition-colors"
            >
              <e.icon size={16} className="text-on-surface-variant" />
              <span className="text-sm font-medium text-on-surface">{e.resolvedLabel}</span>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
