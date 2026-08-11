'use client';

import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Energy } from '@/components/ui/Energy';
import { Money } from '@/components/ui/Money';
import { Pager } from '@/components/ui/Pager';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CONVERSION_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { ConversionRequest } from '@/lib/api/earnings';

const columns: Column<ConversionRequest>[] = [
  {
    key: 'amount',
    header: '能量数',
    render: (c) => <Energy value={c.amountCents} className="font-bold" />,
  },
  {
    key: 'cash',
    header: '折合赞助费',
    render: (c) => <Money cents={c.amountCents} />,
  },
  {
    key: 'createdAt',
    header: '申请时间',
    render: (c) => (
      <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
        {formatDateTime(c.createdAt)}
      </span>
    ),
  },
  {
    key: 'status',
    header: '状态',
    render: (c) => <StatusBadge meta={CONVERSION_STATUS} value={c.status} />,
  },
  {
    key: 'reviewNote',
    header: '审批备注',
    render: (c) => <span className="text-xs text-on-surface-variant">{c.reviewNote ?? '-'}</span>,
  },
];

/** 兑换段：兑换记录表（独立分页；能量数与折合赞助费 1:1 同值异面） */
export function ConversionsTable({
  items,
  total,
  page,
  limit,
  loading,
  error,
  onPage,
}: {
  items: ConversionRequest[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  onPage: (page: number) => void;
}) {
  return (
    <Card caption="CONVERSION HISTORY" title="兑换记录" flush>
      <DataTable<ConversionRequest>
        columns={columns}
        rows={items}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        empty="暂无兑换记录"
      />
      {total > limit && (
        <div className="px-4 py-3 border-t border-outline-variant/40">
          <Pager page={page} limit={limit} total={total} onPage={onPage} />
        </div>
      )}
    </Card>
  );
}
