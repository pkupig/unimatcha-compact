'use client';

import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pager } from '@/components/ui/Pager';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CASH_LEDGER_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { CashLedgerEntry } from '@/lib/api/earnings';

const columns: Column<CashLedgerEntry>[] = [
  {
    key: 'type',
    header: '类型',
    render: (e) => <StatusBadge meta={CASH_LEDGER_TYPE} value={e.type} />,
  },
  {
    key: 'amount',
    header: '金额',
    align: 'right',
    render: (e) => <Money cents={e.amountCents} signed />,
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

/** 赞助费段：现金收支明细流水表（独立分页，数据来自 cash-summary 接口的嵌套 ledger） */
export function CashLedgerTable({
  items,
  total,
  page,
  limit,
  loading,
  error,
  onPage,
}: {
  items: CashLedgerEntry[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  onPage: (page: number) => void;
}) {
  return (
    <Card caption="CASH LEDGER" title="赞助费收支明细" flush>
      <DataTable<CashLedgerEntry>
        columns={columns}
        rows={items}
        rowKey={(e) => e.id}
        loading={loading}
        error={error}
        empty="暂无赞助费收支明细"
      />
      {total > limit && (
        <div className="px-4 py-3 border-t border-outline-variant/40">
          <Pager page={page} limit={limit} total={total} onPage={onPage} />
        </div>
      )}
    </Card>
  );
}
