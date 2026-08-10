'use client';

/**
 * 用户反馈列表（MOD-9，Report 表，SUPER/TEAM）：
 * 状态筛选 + 分类/内容/联系方式/提交用户/状态/时间 + 标记已处理。
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pager } from '@/components/ui/Pager';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useModal } from '@/hooks/useModal';
import { usePagedList } from '@/hooks/usePagedList';
import { listFeedbackReports, updateFeedbackReportStatus } from '@/lib/api/moderation';
import { formatDateTime } from '@/lib/format';
import { REPORT_CATEGORY, REPORT_STATUS, labelOf } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import type { FeedbackReport, FeedbackStatus } from '@/lib/types';
import { ReportDetailModal } from './ReportDetailModal';

export function FeedbackPanel() {
  const list = usePagedList<FeedbackReport, { status: '' | FeedbackStatus }>({
    fetcher: (q) => listFeedbackReports({ status: q.status || undefined, page: q.page, limit: q.limit }),
    initialFilters: { status: '' },
  });

  const view = useModal<FeedbackReport>();
  // 标记已处理是行内单击操作（无确认弹窗），用行级 busy 防连点
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const resolve = async (r: FeedbackReport) => {
    setResolvingId(r.id);
    try {
      await updateFeedbackReportStatus(r.id, 'resolved');
      toast.success('已标记为已处理');
      await list.refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setResolvingId(null);
    }
  };

  const columns: Column<FeedbackReport>[] = [
    {
      key: 'category',
      header: '分类',
      render: (r) => <StatusBadge meta={REPORT_CATEGORY} value={r.category} />,
    },
    {
      key: 'content',
      header: '内容',
      render: (r) => (
        <div className="flex items-center gap-2 max-w-[280px]">
          <span className="text-sm text-on-surface-variant truncate">{r.content}</span>
          <Button size="sm" onClick={() => view.openWith(r)}>查看</Button>
        </div>
      ),
    },
    {
      key: 'contact',
      header: '联系方式',
      render: (r) => <span className="font-mono text-xs text-on-surface-variant">{r.contact || '-'}</span>,
    },
    {
      key: 'user',
      header: '提交用户',
      render: (r) => (
        <div>
          <p className="text-sm text-on-surface">{r.user.profile?.nickname || '-'}</p>
          <p className="font-mono text-[10px] text-outline truncate max-w-[160px]">{r.user.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (r) => <StatusBadge meta={REPORT_STATUS} value={r.status} />,
    },
    {
      key: 'createdAt',
      header: '时间',
      render: (r) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(r.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (r) =>
        r.status === 'open' ? (
          <Button
            size="sm"
            variant="primary"
            loading={resolvingId === r.id}
            onClick={() => void resolve(r)}
          >
            标记已处理
          </Button>
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
            onChange={(e) => list.setFilter('status', e.target.value as '' | FeedbackStatus)}
          >
            <option value="">全部状态</option>
            <option value="open">{labelOf(REPORT_STATUS, 'open')}</option>
            <option value="resolved">{labelOf(REPORT_STATUS, 'resolved')}</option>
          </Select>
        </div>
      </FilterBar>

      <Card flush>
        <DataTable<FeedbackReport>
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          empty="暂无用户反馈"
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {view.open && view.data && <ReportDetailModal report={view.data} onClose={view.close} />}
    </div>
  );
}
