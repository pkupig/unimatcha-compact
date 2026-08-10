'use client';

import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pager } from '@/components/ui/Pager';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { WITHDRAWAL_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { WithdrawalRequest } from '@/lib/api/earnings';

const columns: Column<WithdrawalRequest>[] = [
  {
    key: 'amount',
    header: '金额',
    render: (w) => <Money cents={w.amountCents} className="font-bold" />,
  },
  {
    key: 'status',
    header: '状态',
    render: (w) => <StatusBadge meta={WITHDRAWAL_STATUS} value={w.status} />,
  },
  {
    key: 'createdAt',
    header: '申请时间',
    render: (w) => (
      <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
        {formatDateTime(w.createdAt)}
      </span>
    ),
  },
  {
    key: 'reviewNote',
    header: '审核备注',
    render: (w) => <span className="text-xs text-on-surface-variant">{w.reviewNote ?? '-'}</span>,
  },
];

/** EARN-5：提现记录表（独立分页，limit 10） */
export function WithdrawalsTable({
  items,
  total,
  page,
  limit,
  loading,
  error,
  onPage,
}: {
  items: WithdrawalRequest[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  onPage: (page: number) => void;
}) {
  return (
    <Card caption="WITHDRAWAL HISTORY" title="提现记录" flush>
      <DataTable<WithdrawalRequest>
        columns={columns}
        rows={items}
        rowKey={(w) => w.id}
        loading={loading}
        error={error}
        empty="暂无提现记录"
      />
      {total > limit && (
        <div className="px-4 py-3 border-t border-outline-variant/40">
          <Pager page={page} limit={limit} total={total} onPage={onPage} />
        </div>
      )}
    </Card>
  );
}
