'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { retryMatchJob } from '@/lib/api/matching';
import { formatDateTime, formatNumber } from '@/lib/format';
import { MATCH_JOB_STATUS, MATCH_MODE, labelOf } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import type { MatchJobRow } from '@/lib/types';

/** triggeredBy = `${触发方}:${mode}`（manual:<adminId>:<mode> / scheduler:<mode>）→ 展示拆解 */
function parseTrigger(triggeredBy: string | null): { source: string; mode: 'romantic' | 'friend' | null } {
  if (!triggeredBy) return { source: '-', mode: null };
  const mode = triggeredBy.endsWith(':friend')
    ? ('friend' as const)
    : triggeredBy.endsWith(':romantic')
      ? ('romantic' as const)
      : null;
  const source = triggeredBy.startsWith('manual:')
    ? '手动'
    : triggeredBy.startsWith('scheduler')
      ? '定时'
      : triggeredBy;
  return { source, mode };
}

/** MAT-3：近期任务表（最近 10 条；FAILED 行可重试；详情/结果视图本轮不做） */
export function MatchJobsCard({
  rows,
  loading,
  error,
  onRefresh,
}: {
  rows: MatchJobRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const retry = async (id: string) => {
    setRetryingId(id);
    try {
      await retryMatchJob(id);
      toast.success('任务已重新排队');
      onRefresh();
    } catch (e) {
      toastError(e);
    } finally {
      setRetryingId(null);
    }
  };

  const columns: Column<MatchJobRow>[] = [
    {
      key: 'status',
      header: '状态',
      render: (row) => (
        // FAILED 行把 errorMessage 挂 title：不做详情页也能看到失败原因
        <span className="inline-flex items-center gap-1.5" title={row.errorMessage ?? undefined}>
          {row.status === 'RUNNING' && <Spinner size={14} />}
          <StatusBadge meta={MATCH_JOB_STATUS} value={row.status} />
        </span>
      ),
    },
    {
      key: 'mode',
      header: '模式',
      render: (row) => {
        const { mode } = parseTrigger(row.triggeredBy);
        return mode ? labelOf(MATCH_MODE, mode) : '-';
      },
    },
    {
      key: 'scale',
      header: '规模',
      render: (row) => (
        <span className="font-mono text-sm">
          {formatNumber(row.totalCandidates)} 位候选 · {formatNumber(row.totalMatched)} 对配对
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: '触发时间',
      render: (row) => <span className="font-mono text-sm">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'source',
      header: '触发方',
      render: (row) => parseTrigger(row.triggeredBy).source,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'FAILED' ? (
          <Button
            size="sm"
            loading={retryingId === row.id}
            onClick={() => void retry(row.id)}
          >
            重试
          </Button>
        ) : null,
    },
  ];

  return (
    <Card
      flush
      caption="RECENT JOBS"
      title="近期任务"
      actions={
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RotateCw size={14} />
          刷新
        </Button>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        empty="暂无匹配任务"
      />
    </Card>
  );
}
