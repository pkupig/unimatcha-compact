'use client';

/**
 * 投票审核 tab（MOD-8）：校园墙投票帖，学生会本校 / 团队全量。
 * 团队视图对有学生会入驻的学校加「本校有学生会」徽标（默认由其审核）。
 */
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pager } from '@/components/ui/Pager';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useModal } from '@/hooks/useModal';
import { usePagedList } from '@/hooks/usePagedList';
import { listPolls, reviewPoll } from '@/lib/api/moderation';
import { formatDateTime, formatNumber } from '@/lib/format';
import { POLL_STATUS } from '@/lib/labels';
import type { AdminPollPost, PollReviewStatus } from '@/lib/types';
import { RejectPollModal } from './RejectPollModal';

export function PollsPanel({ team }: { team: boolean }) {
  const list = usePagedList<AdminPollPost, { status: PollReviewStatus }>({
    fetcher: (q) => listPolls({ status: q.status, page: q.page, limit: q.limit }),
    initialFilters: { status: 'pending' },
  });

  const approve = useModal<AdminPollPost>();
  const reject = useModal<AdminPollPost>();

  const columns: Column<AdminPollPost>[] = [
    {
      key: 'content',
      header: '内容',
      render: (p) => (
        <div className="max-w-[240px]">
          {p.title && <p className="font-bold text-on-surface truncate">{p.title}</p>}
          <p className="text-xs text-on-surface-variant truncate">{p.content}</p>
        </div>
      ),
    },
    {
      key: 'options',
      header: '选项',
      render: (p) => (
        <div className="space-y-0.5 max-w-[200px]">
          {(p.pollOptions ?? []).map((o, i) => (
            <p key={i} className="text-xs text-on-surface truncate">
              {o.text}
              <span className="font-mono text-[10px] text-outline ml-1.5">{formatNumber(o.votes)} 票</span>
            </p>
          ))}
        </div>
      ),
    },
    {
      key: 'school',
      header: '学校',
      render: (p) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm whitespace-nowrap">
            {p.school || <span className="text-on-surface-variant">跨校</span>}
          </span>
          {team && p.hasUnionReviewer && <Badge variant="outline">本校有学生会</Badge>}
        </div>
      ),
    },
    {
      key: 'author',
      header: '作者',
      render: (p) =>
        p.anonymous ? (
          <Badge variant="outline">匿名</Badge>
        ) : (
          <span className="text-sm whitespace-nowrap">{p.authorUser?.profile?.nickname || '-'}</span>
        ),
    },
    {
      key: 'createdAt',
      header: '提交时间',
      render: (p) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(p.createdAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (p) => (
        <div>
          <StatusBadge meta={POLL_STATUS} value={p.reviewStatus} />
          {p.reviewStatus === 'rejected' && p.reviewNote && (
            <p className="text-[10px] text-outline mt-1 max-w-[140px] truncate" title={p.reviewNote}>
              {p.reviewNote}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (p) =>
        p.reviewStatus === 'pending' ? (
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            <Button size="sm" variant="primary" onClick={() => approve.openWith(p)}>通过</Button>
            <Button size="sm" variant="danger" onClick={() => reject.openWith(p)}>驳回</Button>
          </div>
        ) : (
          <span className="text-outline text-xs">-</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="w-40">
          <Select
            value={list.filters.status}
            onChange={(e) => list.setFilter('status', e.target.value as PollReviewStatus)}
          >
            <option value="pending">{POLL_STATUS.labels.pending}</option>
            <option value="approved">{POLL_STATUS.labels.approved}</option>
            <option value="rejected">{POLL_STATUS.labels.rejected}</option>
          </Select>
        </div>
      </FilterBar>

      <Card flush>
        <DataTable<AdminPollPost>
          columns={columns}
          rows={list.items}
          rowKey={(p) => p.id}
          loading={list.loading}
          error={list.error}
          empty={list.filters.status === 'pending' ? '暂无待审核的投票' : '暂无投票'}
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {approve.open && approve.data && (
        <ConfirmDialog
          title="通过投票"
          confirmText="确认通过"
          message={
            <>
              确认通过「{approve.data.title || approve.data.content.slice(0, 20)}」？
              通过后该投票对用户可见，作者将收到通知。
            </>
          }
          onConfirm={async () => {
            await reviewPoll(approve.data!.id, { action: 'approve' });
            toast.success('投票已通过');
            await list.refresh();
          }}
          onClose={approve.close}
        />
      )}

      {reject.open && reject.data && (
        <RejectPollModal poll={reject.data} onClose={reject.close} onDone={() => void list.refresh()} />
      )}
    </div>
  );
}
