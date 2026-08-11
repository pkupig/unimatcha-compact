'use client';

/** FIN-8 兑换审批 tab：状态筛选（写回 URL）+ 列表 + 通过/驳回操作（镜像提现审核 tab） */
import { useEffect } from 'react';
import { listConversions } from '@/lib/api/finance';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { formatDateTime } from '@/lib/format';
import { CONVERSION_STATUS } from '@/lib/labels';
import type { ConversionStatus, SchoolConversionRequest } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pager } from '@/components/ui/Pager';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Money } from '@/components/ui/Money';
import { Energy } from '@/components/ui/Energy';
import { ReviewConversionModal } from './ReviewConversionModal';

const STATUS_OPTIONS = Object.keys(CONVERSION_STATUS.labels) as ConversionStatus[];

export function ConversionsTab({
  status,
  onStatusChange,
}: {
  /** URL ?status= 为筛选真源（仪表盘深链直落 PENDING） */
  status: string;
  onStatusChange: (status: string) => void;
}) {
  const list = usePagedList<SchoolConversionRequest, { status: string }>({
    fetcher: (q) => listConversions({ status: q.status || undefined, page: q.page, limit: q.limit }),
    initialFilters: { status },
  });
  const { filters, setFilter } = list;

  // URL → 列表筛选单向同步（浏览器前进后退/页内深链切换时生效）
  useEffect(() => {
    if (filters.status !== status) setFilter('status', status);
  }, [status, filters.status, setFilter]);

  const review = useModal<{ conversion: SchoolConversionRequest; approve: boolean }>();

  const columns: Column<SchoolConversionRequest>[] = [
    {
      key: 'school',
      header: '学校',
      render: (c) => <span className="font-medium text-on-surface">{c.school.name}</span>,
    },
    {
      key: 'energy',
      header: '能量数',
      align: 'right',
      render: (c) => <Energy value={c.amountCents} className="font-bold" />,
    },
    {
      key: 'cash',
      header: '折合赞助费',
      align: 'right',
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
      render: (c) => (
        <span className="text-xs text-on-surface-variant line-clamp-1 max-w-[160px]">
          {c.reviewNote || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (c) => {
        if (c.status !== 'PENDING') return <span className="text-outline text-xs">-</span>;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => review.openWith({ conversion: c, approve: true })}
            >
              通过
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => review.openWith({ conversion: c, approve: false })}
            >
              驳回
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="">全部状态</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {CONVERSION_STATUS.labels[s]}
            </option>
          ))}
        </Select>
      </FilterBar>

      <Card flush>
        <DataTable<SchoolConversionRequest>
          columns={columns}
          rows={list.items}
          rowKey={(c) => c.id}
          loading={list.loading}
          error={list.error}
          empty="暂无兑换申请"
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {review.open && review.data && (
        <ReviewConversionModal
          conversion={review.data.conversion}
          approve={review.data.approve}
          onClose={review.close}
          onDone={list.refresh}
        />
      )}
    </div>
  );
}
