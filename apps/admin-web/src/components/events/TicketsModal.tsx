'use client';

/**
 * EVT-5 购票名单弹窗：已售/名额摘要 + 分页票列表（后端统一 {items,total,page,limit}）。
 * 摘要优先用名单响应自带的 event 字段——比传入行数据新鲜（可能刚核销/取消过）。
 */
import { useState } from 'react';
import { listEventTickets } from '@/lib/api/events';
import type { AdminEvent, AdminEventTicket, EventTicketsResult } from '@/lib/types';
import { TICKET_STATUS } from '@/lib/labels';
import { formatDateTime, formatNumber } from '@/lib/format';
import { usePagedList } from '@/hooks/usePagedList';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Energy } from '@/components/ui/Energy';
import { Pager } from '@/components/ui/Pager';

const COLUMNS: Column<AdminEventTicket>[] = [
  {
    key: 'code',
    header: '票码',
    render: (t) => <span className="font-mono text-xs whitespace-nowrap">{t.code}</span>,
  },
  {
    key: 'user',
    header: '购票用户',
    render: (t) => (
      <div className="max-w-[180px]">
        <p className="text-sm text-on-surface truncate">{t.user.profile?.nickname || '-'}</p>
        {t.user.email && (
          <p className="font-mono text-[10px] text-outline truncate">{t.user.email}</p>
        )}
        {t.user.profile?.school && (
          <p className="text-[10px] text-outline truncate">{t.user.profile.school}</p>
        )}
      </div>
    ),
  },
  {
    key: 'paid',
    header: '实付',
    align: 'right',
    render: (t) =>
      // pricePaidCents ≡ 实付能量数（= 支付格数 × 100）
      t.pricePaidCents > 0 ? (
        <Energy value={t.pricePaidCents} />
      ) : (
        <span className="text-sm text-on-surface-variant">免费</span>
      ),
  },
  {
    key: 'status',
    header: '状态',
    render: (t) => <StatusBadge meta={TICKET_STATUS} value={t.status} />,
  },
  {
    key: 'createdAt',
    header: '购票时间',
    render: (t) => (
      <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
        {formatDateTime(t.createdAt)}
      </span>
    ),
  },
  {
    key: 'usedAt',
    header: '核销时间',
    render: (t) =>
      t.usedAt ? (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(t.usedAt)}
        </span>
      ) : (
        <span className="text-outline">-</span>
      ),
  },
];

export function TicketsModal({ event, onClose }: { event: AdminEvent; onClose: () => void }) {
  const [summary, setSummary] = useState<EventTicketsResult['event'] | null>(null);
  const list = usePagedList<AdminEventTicket, Record<string, never>>({
    fetcher: async ({ page, limit }) => {
      const res = await listEventTickets(event.id, { page, limit });
      setSummary(res.event);
      return res;
    },
    initialFilters: {},
  });

  // capacity 合法值含 null（不限），不能用 ?? 兜底——summary 到手后以它为准
  const sold = summary ? summary.ticketsSold : event.ticketsSold;
  const capacity = summary ? summary.capacity : event.capacity;

  return (
    <Modal title={`购票名单 · ${event.title}`} caption="TICKETS" size="lg" onClose={onClose}>
      <div className="space-y-4 pb-4">
        <p className="text-sm text-on-surface-variant">
          已售 <span className="font-mono text-on-surface">{formatNumber(sold)}</span> 张 · 名额{' '}
          <span className="font-mono text-on-surface">
            {capacity == null ? '不限' : formatNumber(capacity)}
          </span>
        </p>
        <DataTable
          columns={COLUMNS}
          rows={list.items}
          rowKey={(t) => t.id}
          loading={list.loading}
          error={list.error}
          empty="暂无购票记录"
        />
        <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
      </div>
    </Modal>
  );
}
