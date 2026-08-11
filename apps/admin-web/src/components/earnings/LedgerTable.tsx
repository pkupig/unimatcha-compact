'use client';

import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Energy } from '@/components/ui/Energy';
import { Pager } from '@/components/ui/Pager';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LEDGER_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { LedgerEntry } from '@/lib/api/earnings';

const columns: Column<LedgerEntry>[] = [
  {
    key: 'type',
    header: '类型',
    render: (e) => <StatusBadge meta={LEDGER_TYPE} value={e.type} />,
  },
  {
    key: 'amount',
    header: '能量',
    align: 'right',
    render: (e) => <Energy value={e.amountCents} signed />,
  },
  {
    key: 'note',
    header: '备注',
    render: (e) => <span className="text-xs text-on-surface-variant">{e.note ?? '-'}</span>,
  },
  {
    key: 'createdAt',
    header: '时间',
    render: (e) => (
      <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
        {formatDateTime(e.createdAt)}
      </span>
    ),
  },
];

/** 能量段：能量收支明细流水表（独立分页，数据来自能量概要接口的嵌套 ledger） */
export function LedgerTable({
  items,
  total,
  page,
  limit,
  loading,
  error,
  onPage,
}: {
  items: LedgerEntry[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  onPage: (page: number) => void;
}) {
  return (
    <Card caption="ENERGY LEDGER" title="能量收支明细" flush>
      <DataTable<LedgerEntry>
        columns={columns}
        rows={items}
        rowKey={(e) => e.id}
        loading={loading}
        error={error}
        empty="暂无能量收支明细"
      />
      {total > limit && (
        <div className="px-4 py-3 border-t border-outline-variant/40">
          <Pager page={page} limit={limit} total={total} onPage={onPage} />
        </div>
      )}
    </Card>
  );
}
