'use client';

/** FIN-2 提现审核 tab：状态筛选（写回 URL）+ 列表 + 审核/打款操作 */
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { listWithdrawals, markWithdrawalPaid } from '@/lib/api/finance';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { formatDateTime } from '@/lib/format';
import { WITHDRAWAL_STATUS } from '@/lib/labels';
import type { WithdrawalRequest, WithdrawalStatus } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pager } from '@/components/ui/Pager';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Money } from '@/components/ui/Money';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BankSnapshotText } from './shared';
import { ReviewWithdrawalModal } from './ReviewWithdrawalModal';

const STATUS_OPTIONS = Object.keys(WITHDRAWAL_STATUS.labels) as WithdrawalStatus[];

export function WithdrawalsTab({
  status,
  onStatusChange,
}: {
  /** URL ?status= 为筛选真源（仪表盘深链直落 PENDING） */
  status: string;
  onStatusChange: (status: string) => void;
}) {
  const list = usePagedList<WithdrawalRequest, { status: string }>({
    fetcher: (q) => listWithdrawals({ status: q.status || undefined, page: q.page, limit: q.limit }),
    initialFilters: { status },
  });
  const { filters, setFilter } = list;

  // URL → 列表筛选单向同步（浏览器前进后退/页内深链切换时生效）
  useEffect(() => {
    if (filters.status !== status) setFilter('status', status);
  }, [status, filters.status, setFilter]);

  const review = useModal<{ withdrawal: WithdrawalRequest; approve: boolean }>();
  const paid = useModal<WithdrawalRequest>();

  const columns: Column<WithdrawalRequest>[] = [
    {
      key: 'school',
      header: '学校',
      render: (w) => <span className="font-medium text-on-surface">{w.school.name}</span>,
    },
    {
      key: 'amount',
      header: '金额',
      align: 'right',
      render: (w) => <Money cents={w.amountCents} className="font-bold" />,
    },
    { key: 'bank', header: '银行快照', render: (w) => <BankSnapshotText snapshot={w.bankSnapshot} /> },
    { key: 'status', header: '状态', render: (w) => <StatusBadge meta={WITHDRAWAL_STATUS} value={w.status} /> },
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
      render: (w) => (
        <span className="text-xs text-on-surface-variant line-clamp-1 max-w-[160px]">
          {w.reviewNote || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (w) => {
        if (w.status === 'PENDING') {
          return (
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="primary" onClick={() => review.openWith({ withdrawal: w, approve: true })}>
                通过
              </Button>
              <Button size="sm" variant="danger" onClick={() => review.openWith({ withdrawal: w, approve: false })}>
                驳回
              </Button>
            </div>
          );
        }
        if (w.status === 'APPROVED') {
          return (
            <Button size="sm" onClick={() => paid.openWith(w)}>
              标记已打款
            </Button>
          );
        }
        return <span className="text-outline text-xs">-</span>;
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
              {WITHDRAWAL_STATUS.labels[s]}
            </option>
          ))}
        </Select>
      </FilterBar>

      <Card flush>
        <DataTable<WithdrawalRequest>
          columns={columns}
          rows={list.items}
          rowKey={(w) => w.id}
          loading={list.loading}
          error={list.error}
          empty="暂无提现申请"
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {review.open && review.data && (
        <ReviewWithdrawalModal
          withdrawal={review.data.withdrawal}
          approve={review.data.approve}
          onClose={review.close}
          onDone={list.refresh}
        />
      )}
      {paid.open && paid.data && (
        <ConfirmDialog
          title="标记已打款"
          message={
            <>
              确认已线下打款？「{paid.data.school.name}」余额将扣减{' '}
              <Money cents={paid.data.amountCents} className="font-bold text-on-surface" />
              ，并生成负数提现入账，此操作不可逆。
            </>
          }
          confirmText="已打款"
          onConfirm={async () => {
            await markWithdrawalPaid(paid.data!.id);
            toast.success('已标记打款，余额已扣减');
            void list.refresh();
          }}
          onClose={paid.close}
        />
      )}
    </div>
  );
}
