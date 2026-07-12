'use client';

/**
 * 角色化总览页（spec §5）
 * TEAM/SUPER：平台全量统计 + 待办 chips + 30 天广告消耗趋势 + 快捷入口
 * STUDENT_UNION：本校用户/余额/待审广告/进行中投放 + 最近入账明细
 * SPONSOR：投放汇总 + 7 日曝光/点击趋势 + 新建广告 CTA
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Users,
  School,
  Megaphone,
  Banknote,
  Wallet,
  ShieldCheck,
  Send,
  ClipboardList,
  Zap,
  Plus,
  ArrowRight,
  Eye,
  MousePointerClick,
} from 'lucide-react';
import {
  getDashboard,
  getAdsOverview,
  getFinanceSummary,
  type AdsOverview,
  type LedgerEntry,
} from '@/lib/api';
import { getAdminInfo, isUnion, isSponsor, type AdminInfo } from '@/lib/auth';
import { fenToYuan, formatNumber, formatDateTime, formatShortDate } from '@/lib/format';
import {
  PageHeader,
  StatCard,
  Card,
  DataTable,
  Money,
  TrendChart,
  EmptyState,
  LEDGER_TYPE_LABELS,
  type Column,
} from '@/components/ui';

/* ── 快捷入口（TEAM） ── */
const QUICK_LINKS = [
  { label: '学校管理', href: '/schools', icon: School },
  { label: '账号管理', href: '/accounts', icon: ShieldCheck },
  { label: '广告管理', href: '/ads', icon: Megaphone },
  { label: '财务', href: '/finance', icon: Banknote },
  { label: '广场发帖', href: '/square-post', icon: Send },
  { label: '问卷', href: '/questionnaire', icon: ClipboardList },
  { label: '匹配', href: '/matching', icon: Zap },
];

export default function DashboardPage() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [overview, setOverview] = useState<AdsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAdmin(getAdminInfo());
    (async () => {
      const [d, o] = await Promise.allSettled([getDashboard(), getAdsOverview()]);
      if (d.status === 'fulfilled') setStats((d.value as any).data);
      else toast.error('加载总览数据失败');
      if (o.status === 'fulfilled') setOverview((o.value as any).data);
      setLoading(false);
    })();
  }, []);

  if (loading || !admin) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 rounded-lg bg-surface-high animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse" />
          ))}
        </div>
        <div className="card h-72 animate-pulse" />
      </div>
    );
  }

  if (isUnion(admin.role)) return <UnionDashboard admin={admin} stats={stats} />;
  if (isSponsor(admin.role)) return <SponsorDashboard stats={stats} overview={overview} />;
  return <TeamDashboard stats={stats} overview={overview} />;
}

/* ═══════════════════════════════════════════════════════════════
 * TEAM / SUPER
 * ═══════════════════════════════════════════════════════════════ */

function TeamDashboard({ stats, overview }: { stats: any; overview: AdsOverview | null }) {
  const pendingWithdrawals =
    stats?.pendingWithdrawals ?? stats?.finance?.pendingWithdrawals ?? 0;
  const pendingPlatformReview =
    stats?.pendingPlatformReview ?? overview?.pendingPlatformReview ?? 0;

  const chartData = ((overview as any)?.dailySeries30d ?? overview?.daily ?? []).map((d: any) => ({
    date: formatShortDate(d.date),
    消耗: Math.round(d.spendCents ?? 0) / 100,
  }));

  return (
    <div className="space-y-6">
      <PageHeader caption="Overview" title="平台总览" sub="全平台数据一览" />

      {/* 统计卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="用户总数"
          icon={Users}
          value={formatNumber(stats?.users?.total)}
          sub={`活跃 ${formatNumber(stats?.users?.active)} · 封禁 ${formatNumber(stats?.users?.banned)}`}
        />
        <StatCard
          label="合作学校"
          icon={School}
          value={formatNumber(typeof stats?.schools === 'number' ? stats.schools : stats?.schools?.total)}
        />
        <StatCard
          label="进行中广告"
          icon={Megaphone}
          accent="ink"
          value={formatNumber(overview?.activeCampaigns ?? stats?.ads?.active)}
        />
        <StatCard
          label="30 天广告流水"
          icon={Banknote}
          accent="neon"
          value={fenToYuan(stats?.adRevenue30dCents ?? (overview as any)?.gross30dCents)}
        />
      </div>

      {/* 待办 chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ActionChip
          href="/finance"
          label="待审核提现"
          caption="Pending Withdrawals"
          count={pendingWithdrawals}
        />
        <ActionChip
          href="/ads?status=PENDING_PLATFORM_REVIEW"
          label="平台待审广告"
          caption="Pending Review"
          count={pendingPlatformReview}
        />
      </div>

      {/* 30 天消耗趋势 */}
      <Card caption="Last 30 Days" title="近 30 天广告消耗">
        {chartData.length === 0 ? (
          <EmptyState title="暂无投放数据" sub="有广告投放后，这里会展示每日消耗趋势" />
        ) : (
          <TrendChart
            data={chartData}
            series={[{ key: '消耗', label: '消耗（元）' }]}
            valueFormatter={(v) => `¥${formatNumber(Number(v))}`}
          />
        )}
      </Card>

      {/* 快捷入口 */}
      <Card caption="Shortcuts" title="快捷入口">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {QUICK_LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex flex-col items-center gap-2 px-3 py-4 rounded-lg border border-outline-variant/40 bg-white hover:border-ink transition-colors"
              >
                <Icon size={18} className="text-on-surface" />
                <span className="text-xs font-display font-bold text-on-surface">{l.label}</span>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ActionChip({
  href,
  label,
  caption,
  count,
}: {
  href: string;
  label: string;
  caption: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="card flex items-center justify-between gap-3 p-5 hover:border-ink transition-colors"
    >
      <div>
        <p className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          {caption}
        </p>
        <p className="font-display font-extrabold text-on-surface mt-1">{label}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={
            count > 0
              ? 'badge badge-neon font-mono text-sm px-3 py-1'
              : 'badge font-mono text-sm px-3 py-1'
          }
        >
          {formatNumber(count)}
        </span>
        <ArrowRight size={16} className="text-outline" />
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * STUDENT_UNION
 * ═══════════════════════════════════════════════════════════════ */

function UnionDashboard({ admin, stats }: { admin: AdminInfo; stats: any }) {
  // 后端 dashboard 不含明细，入账明细单独取本校财务摘要
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  useEffect(() => {
    const schoolId = stats?.school?.id ?? admin.schoolId;
    if (!schoolId) return;
    getFinanceSummary(schoolId, { page: 1, limit: 5 })
      .then((res: any) => setLedger(res.data?.ledger?.items ?? []))
      .catch(() => {});
  }, [admin.schoolId, stats?.school?.id]);

  const ledgerColumns: Column<LedgerEntry>[] = [
    {
      key: 'type',
      title: '类型',
      render: (row) => (
        <span className="badge">{LEDGER_TYPE_LABELS[row.type] ?? row.type}</span>
      ),
    },
    {
      key: 'amountCents',
      title: '金额',
      align: 'right',
      render: (row) => <Money cents={row.amountCents} signed />,
    },
    { key: 'note', title: '备注', render: (row) => row.note || '-' },
    {
      key: 'createdAt',
      title: '时间',
      render: (row) => <span className="font-mono text-xs">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Overview"
        title="学生会总览"
        sub={admin.schoolName ? `${admin.schoolName} · 本校数据一览` : '本校数据一览'}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="本校用户"
          icon={Users}
          value={formatNumber(stats?.users?.total ?? stats?.school?.userCount)}
        />
        <StatCard
          label="账户余额"
          icon={Wallet}
          accent="neon"
          value={fenToYuan(stats?.finance?.balanceCents ?? stats?.balanceCents)}
          sub="可提现余额（不含在途冻结）"
        />
        <StatCard
          label="待审广告"
          icon={Megaphone}
          accent="ink"
          value={formatNumber(stats?.pendingUnionReview ?? stats?.ads?.pendingUnionReview)}
        />
        <StatCard
          label="本校进行中投放"
          icon={Zap}
          value={formatNumber(stats?.activeCampaignsInSchool ?? stats?.ads?.activeInSchool)}
        />
      </div>

      <Card
        caption="Recent Ledger"
        title="最近入账明细"
        actions={
          <Link href="/earnings" className="btn-secondary btn-sm">
            收益提现
            <ArrowRight size={14} />
          </Link>
        }
        bodyClassName="-mx-6 -mb-6"
      >
        <DataTable
          columns={ledgerColumns}
          data={ledger}
          empty={<EmptyState title="暂无入账记录" sub="广告分成与赞助发放会出现在这里" />}
        />
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * SPONSOR
 * ═══════════════════════════════════════════════════════════════ */

function SponsorDashboard({ stats, overview }: { stats: any; overview: AdsOverview | null }) {
  const daily = (overview as any)?.dailySeries7d ?? overview?.daily ?? [];
  const chartData = daily.slice(-7).map((d: any) => ({
    date: formatShortDate(d.date),
    曝光: d.impressions ?? 0,
    点击: d.clicks ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Overview"
        title="投放总览"
        sub="我的广告投放数据一览"
        actions={
          <Link href="/ads/new" className="btn-cta">
            <Plus size={16} />
            新建广告
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="投放中"
          icon={Megaphone}
          accent="neon"
          value={formatNumber(stats?.activeCampaigns ?? overview?.activeCampaigns)}
        />
        <StatCard
          label="总消耗"
          icon={Banknote}
          value={fenToYuan(stats?.totalSpendCents ?? overview?.totalSpendCents)}
        />
        <StatCard
          label="7 日曝光"
          icon={Eye}
          value={formatNumber(overview?.impressions7d ?? stats?.impressionsTotal)}
        />
        <StatCard
          label="7 日点击"
          icon={MousePointerClick}
          value={formatNumber(overview?.clicks7d ?? stats?.clicksTotal)}
        />
      </div>

      <Card caption="Last 7 Days" title="近 7 天曝光与点击">
        {chartData.length === 0 ? (
          <EmptyState
            title="暂无投放数据"
            sub="广告开始投放后，这里会展示每日曝光与点击趋势"
            action={
              <Link href="/ads/new" className="btn-cta btn-sm">
                <Plus size={14} />
                新建广告
              </Link>
            }
          />
        ) : (
          <TrendChart
            data={chartData}
            series={[
              { key: '曝光', label: '曝光' },
              { key: '点击', label: '点击' },
            ]}
            valueFormatter={(v) => formatNumber(Number(v))}
          />
        )}
      </Card>
    </div>
  );
}
