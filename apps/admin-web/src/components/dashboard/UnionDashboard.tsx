'use client';

/** 学生会仪表盘：4 统计卡 + 2 待办 chip + 最近入账明细（finance 概要前 5 行） */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, PlayCircle, Users, Wallet } from 'lucide-react';
import type { DashboardLedgerItem, UnionDashboard as UnionDashboardData } from '@/lib/types';
import { getSchoolFinanceSummary } from '@/lib/api/dashboard';
import { DEEP_LINKS } from '@/lib/permissions';
import { LEDGER_TYPE } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatGrid, TodoChip } from './DashboardShared';

const LEDGER_COLUMNS: Column<DashboardLedgerItem>[] = [
  { key: 'type', header: '类型', render: (r) => <StatusBadge meta={LEDGER_TYPE} value={r.type} /> },
  { key: 'amount', header: '金额', align: 'right', render: (r) => <Money cents={r.amountCents} signed /> },
  { key: 'note', header: '备注', className: 'max-w-[280px] truncate', render: (r) => r.note ?? '-' },
  {
    key: 'time',
    header: '时间',
    render: (r) => (
      <span className="text-on-surface-variant whitespace-nowrap">{formatDateTime(r.createdAt)}</span>
    ),
  },
];

export function UnionDashboard({ data }: { data: UnionDashboardData }) {
  const [ledger, setLedger] = useState<DashboardLedgerItem[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSchoolFinanceSummary(data.school.id, 5)
      .then((s) => {
        if (!cancelled) setLedger(s.ledger.items);
      })
      .catch((e) => {
        if (cancelled) return;
        toastError(e);
        setLedgerError('入账明细加载失败，请刷新重试');
      })
      .finally(() => {
        if (!cancelled) setLedgerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.school.id]);

  return (
    <>
      <StatGrid>
        <StatCard
          label="本校用户"
          value={formatNumber(data.users.total)}
          sub={`本周新增 +${formatNumber(data.users.newThisWeek)}`}
          icon={Users}
        />
        <StatCard
          label="账户余额"
          value={<Money cents={data.balanceCents} />}
          sub="不含在途冻结"
          icon={Wallet}
        />
        <StatCard
          label="待审广告"
          value={formatNumber(data.pendingReviewCount)}
          sub="本校拉入 · 学生会初审"
          icon={Megaphone}
        />
        <StatCard
          label="本校进行中投放"
          value={formatNumber(data.activeCampaignsInSchool)}
          icon={PlayCircle}
        />
      </StatGrid>

      <div className="flex flex-wrap gap-3">
        <TodoChip href={DEEP_LINKS.adsPendingUnion} label="待我审核广告" count={data.pendingReviewCount} />
        <TodoChip href={DEEP_LINKS.earnings} label="收益提现" />
      </div>

      <Card
        flush
        caption="RECENT LEDGER"
        title="最近入账"
        actions={
          <Link href={DEEP_LINKS.earnings} className="btn-secondary btn-sm">
            收益提现
          </Link>
        }
      >
        <DataTable
          columns={LEDGER_COLUMNS}
          rows={ledger}
          rowKey={(r) => r.id}
          loading={ledgerLoading}
          error={ledgerError}
          empty="暂无入账记录"
        />
      </Card>
    </>
  );
}
