'use client';

import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { bpsToPercent, formatNumber } from '@/lib/format';
import type { School } from '@/lib/types';

/** 学校列表列定义（SCH-2）：学校/城市/用户数/进行中广告/累计收入/余额/分成/状态 */
const columns: Column<School>[] = [
  {
    key: 'name',
    header: '学校',
    render: (s) => <span className="font-semibold text-on-surface">{s.name}</span>,
  },
  { key: 'city', header: '城市', render: (s) => s.city || '-' },
  {
    key: 'userCount',
    header: '用户数',
    align: 'right',
    render: (s) => <span className="font-mono">{formatNumber(s.stats?.userCount)}</span>,
  },
  {
    key: 'activeCampaigns',
    header: '进行中广告',
    align: 'right',
    render: (s) => <span className="font-mono">{formatNumber(s.stats?.activeCampaignCount)}</span>,
  },
  {
    key: 'revenue',
    header: '累计收入',
    align: 'right',
    render: (s) => <Money cents={s.stats?.totalRevenueCents} />,
  },
  {
    key: 'balance',
    header: '余额',
    align: 'right',
    render: (s) => <Money cents={s.stats?.balanceCents} />,
  },
  {
    key: 'share',
    header: '分成',
    render: (s) => (
      <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
        平台 {bpsToPercent(s.platformShareBps)} · 自拉 {bpsToPercent(s.selfSourcedShareBps)}
      </span>
    ),
  },
  {
    key: 'status',
    header: '状态',
    render: (s) => <Badge variant={s.isActive ? 'neon' : 'pink'}>{s.isActive ? '启用' : '停用'}</Badge>,
  },
];

export function SchoolsTable({
  rows,
  loading,
  error,
  onRowClick,
}: {
  rows: School[];
  loading: boolean;
  error: string | null;
  onRowClick: (school: School) => void;
}) {
  return (
    <DataTable<School>
      columns={columns}
      rows={rows}
      rowKey={(s) => s.id}
      loading={loading}
      error={error}
      empty="暂无学校"
      onRowClick={onRowClick}
    />
  );
}
