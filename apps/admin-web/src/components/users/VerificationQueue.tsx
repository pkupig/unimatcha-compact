'use client';

/**
 * 学生认证审核队列（学生会与平台共用）：受限投影——只见认证材料与昵称/年级/学校
 * （产品口径：学生会不可见个体其余信息）。通过即改；驳回需确认弹窗。
 */
import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pager } from '@/components/ui/Pager';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { listPendingVerifications, updateUserVerification } from '@/lib/api/users';
import { toastError } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import type { PendingVerificationItem } from '@/lib/types';

export function VerificationQueue() {
  const list = usePagedList<PendingVerificationItem, Record<string, never>>({
    fetcher: (q) => listPendingVerifications({ page: q.page, limit: q.limit }),
    initialFilters: {},
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const rejectModal = useModal<PendingVerificationItem>();
  const openReject = rejectModal.openWith;
  const rejectRow = rejectModal.data;
  const refresh = list.refresh;

  const approve = useCallback(
    async (row: PendingVerificationItem) => {
      setBusyId(row.id);
      try {
        await updateUserVerification(row.id, 'verified');
        toast.success('已通过认证');
        await refresh();
      } catch (e) {
        toastError(e);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const columns = useMemo<Column<PendingVerificationItem>[]>(
    () => [
      {
        key: 'nickname',
        header: '昵称',
        render: (r) => <span className="font-medium text-on-surface">{r.profile?.nickname ?? '-'}</span>,
      },
      {
        key: 'grade',
        header: '年级',
        render: (r) => <span className="text-on-surface-variant">{r.profile?.grade ?? '-'}</span>,
      },
      {
        key: 'school',
        header: '学校',
        render: (r) => <span className="text-on-surface-variant">{r.profile?.school ?? '-'}</span>,
      },
      {
        key: 'schoolEmail',
        header: '学校邮箱',
        render: (r) =>
          r.schoolEmail ? (
            <span className="font-mono text-xs text-on-surface-variant">{r.schoolEmail}</span>
          ) : (
            '-'
          ),
      },
      {
        key: 'card',
        header: '学生证',
        render: (r) =>
          r.studentCardUrl ? (
            <a
              href={r.studentCardUrl}
              target="_blank"
              rel="noreferrer"
              title="新窗口查看原图"
              className="inline-block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 上传件 URL 域名不可枚举，无法走 next/image */}
              <img
                src={r.studentCardUrl}
                alt="学生证"
                className="w-16 h-11 object-cover rounded-md border border-outline-variant/60 hover:opacity-80 transition-opacity"
              />
            </a>
          ) : (
            <span className="text-xs text-outline">未上传</span>
          ),
      },
      {
        key: 'updatedAt',
        // 近似提交时刻（H5 提交认证写入 User.updatedAt）；与后端排序键同款，列序与展示不矛盾
        header: '提交时间',
        render: (r) => (
          <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
            {formatDateTime(r.updatedAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        render: (r) => (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" loading={busyId === r.id} onClick={() => void approve(r)}>
              通过
            </Button>
            <Button size="sm" variant="danger" disabled={busyId === r.id} onClick={() => openReject(r)}>
              驳回
            </Button>
          </div>
        ),
      },
    ],
    [approve, busyId, openReject],
  );

  return (
    <>
      <Card flush>
        <DataTable
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          empty="暂无待审认证"
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
      {rejectModal.open && rejectRow && (
        <ConfirmDialog
          title="驳回认证"
          danger
          confirmText="确认驳回"
          message={
            <>
              确定要驳回{' '}
              <span className="font-medium text-on-surface">{rejectRow.profile?.nickname ?? '该用户'}</span>{' '}
              的学生认证吗？认证状态将标记为已驳回。
            </>
          }
          onConfirm={async () => {
            await updateUserVerification(rejectRow.id, 'rejected');
            toast.success('已驳回认证');
            await refresh();
          }}
          onClose={rejectModal.close}
        />
      )}
    </>
  );
}
