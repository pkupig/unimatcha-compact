'use client';

/**
 * EVT-2/EVT-3 活动表格：列定义 + 行操作（购票名单 / 停售 / 恢复 / 取消）。
 * 停售（published→closed）与恢复（closed→published）即时 PATCH；
 * 取消走 danger 确认弹窗——不可逆、显示已售张数与能量流水估算、有效票作废并自动退能量。
 * 票价为能量口径（priceCents ≡ 能量数）：展示用 <Energy>，绝不 /100 当元。
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { updateEventStatus } from '@/lib/api/events';
import type { AdminEvent } from '@/lib/types';
import { ADMIN_ROLE, EVENT_STATUS, labelOf } from '@/lib/labels';
import { formatDateTime, formatEnergy, formatNumber } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { useModal } from '@/hooks/useModal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Energy } from '@/components/ui/Energy';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function EventTable({
  items,
  loading,
  error,
  onShowTickets,
  onChanged,
}: {
  items: AdminEvent[];
  loading: boolean;
  error: string | null;
  onShowTickets: (ev: AdminEvent) => void;
  onChanged: () => void;
}) {
  // 行内即时切换的提交态（同一时刻只会有一行在提交）
  const [busyId, setBusyId] = useState<string | null>(null);
  const cancel = useModal<AdminEvent>();

  const toggleStatus = async (ev: AdminEvent, status: 'closed' | 'published') => {
    setBusyId(ev.id);
    try {
      await updateEventStatus(ev.id, status);
      toast.success(status === 'closed' ? '活动已停售' : '活动已恢复售票');
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminEvent>[] = [
    {
      key: 'title',
      header: '活动',
      render: (ev) => (
        <div className="max-w-[220px]">
          <p className="font-bold text-on-surface truncate">{ev.title}</p>
          {ev.venue && <p className="text-xs text-on-surface-variant truncate">{ev.venue}</p>}
        </div>
      ),
    },
    {
      key: 'school',
      header: '学校',
      render: (ev) =>
        ev.school ? (
          <span className="text-sm whitespace-nowrap">{ev.school}</span>
        ) : (
          <span className="text-sm text-on-surface-variant">全网</span>
        ),
    },
    {
      key: 'time',
      header: '时间',
      render: (ev) => (
        <div className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          <p>{formatDateTime(ev.startAt)}</p>
          {ev.endAt && <p className="text-outline">至 {formatDateTime(ev.endAt)}</p>}
        </div>
      ),
    },
    {
      key: 'price',
      header: '票价',
      align: 'right',
      render: (ev) =>
        ev.priceCents > 0 ? <Energy value={ev.priceCents} /> : <Badge variant="outline">免费</Badge>,
    },
    {
      key: 'sold',
      header: '已售',
      align: 'right',
      render: (ev) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {formatNumber(ev.ticketsSold)}
          <span className="text-outline"> / {ev.capacity == null ? '不限' : formatNumber(ev.capacity)}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (ev) => <StatusBadge meta={EVENT_STATUS} value={ev.status} />,
    },
    {
      key: 'creator',
      header: '创建者',
      render: (ev) => (
        <div className="max-w-[140px]">
          <p className="text-sm text-on-surface truncate">{ev.createdByAdmin.name}</p>
          <p className="text-[10px] text-outline truncate">
            {ev.createdByAdmin.organizationName || labelOf(ADMIN_ROLE, ev.createdByAdmin.role)}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (ev) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Button size="sm" onClick={() => onShowTickets(ev)}>
            购票名单
          </Button>
          {ev.status === 'published' && (
            <Button size="sm" loading={busyId === ev.id} onClick={() => void toggleStatus(ev, 'closed')}>
              停售
            </Button>
          )}
          {ev.status === 'closed' && (
            <Button size="sm" variant="primary" loading={busyId === ev.id} onClick={() => void toggleStatus(ev, 'published')}>
              恢复
            </Button>
          )}
          {ev.status !== 'cancelled' && (
            <Button size="sm" variant="danger" onClick={() => cancel.openWith(ev)}>
              取消
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(ev) => ev.id}
        loading={loading}
        error={error}
        empty="暂无活动，点击右上角「发布活动」创建第一个活动"
      />
      {cancel.open && cancel.data && (
        <CancelEventDialog event={cancel.data} onClose={cancel.close} onDone={onChanged} />
      )}
    </>
  );
}

/** 取消活动确认（独立小组件——让 event 拿到非空收窄，回调里不用再判空） */
function CancelEventDialog({
  event,
  onClose,
  onDone,
}: {
  event: AdminEvent;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <ConfirmDialog
      title="取消活动"
      danger
      confirmText="确认取消"
      message={
        <>
          <p>
            确定取消「{event.title}」吗？<span className="font-bold text-on-surface">此操作不可逆。</span>
          </p>
          <p className="mt-2">
            已售 <span className="font-mono text-on-surface">{formatNumber(event.ticketsSold)}</span> 张 · 流水估算{' '}
            <span className="font-mono text-on-surface">
              {/* 用户按格支付：每张实付 = ceil(票面能量 / 100) × 100 */}
              {formatEnergy(Math.ceil(event.priceCents / 100) * 100 * event.ticketsSold)}
            </span>
            ；取消后有效票将作废并自动退回能量（用户退格、学校账本冲回；已核销票不退）。
          </p>
        </>
      }
      onConfirm={async () => {
        await updateEventStatus(event.id, 'cancelled');
        toast.success('活动已取消，有效票已作废并自动退回能量');
        onDone();
      }}
      onClose={onClose}
    />
  );
}
