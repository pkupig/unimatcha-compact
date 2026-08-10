'use client';

import { useMemo, type MouseEvent } from 'react';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SUBMISSION_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { Submission } from '@/lib/types';

/**
 * 官网提交列表（SUB-3/5/6/8）：
 * 行点击/「查看」→ 详情弹窗；操作列按状态分派——
 * APPROVED 只展示开通账号链接（后端 PATCH APPROVED 会 400，故无任何操作按钮）。
 */
export function SubmissionsTable({
  rows,
  loading,
  error,
  sponsorTab,
  onView,
  onContact,
  onCloseRow,
  onConvert,
  onReopen,
}: {
  rows: Submission[];
  loading: boolean;
  error: string | null;
  /** 仅赞助申请 tab 有「开通账号」入口 */
  sponsorTab: boolean;
  onView: (s: Submission) => void;
  onContact: (s: Submission) => void;
  onCloseRow: (s: Submission) => void;
  onConvert: (s: Submission) => void;
  onReopen: (s: Submission) => void;
}) {
  const columns = useMemo<Column<Submission>[]>(() => {
    // 行点击开详情，按钮各有去处 → 一律截停冒泡
    const stop = (e: MouseEvent, fn: () => void) => {
      e.stopPropagation();
      fn();
    };
    return [
      {
        key: 'organization',
        header: '组织',
        render: (s) =>
          s.organization ? (
            <span
              className="font-bold text-on-surface inline-block max-w-[180px] truncate align-middle"
              title={s.organization}
            >
              {s.organization}
            </span>
          ) : (
            <span className="text-outline">-</span>
          ),
      },
      {
        key: 'email',
        header: '邮箱',
        render: (s) => <span className="font-mono text-xs text-on-surface-variant break-all">{s.email}</span>,
      },
      {
        key: 'message',
        header: '留言',
        render: (s) => (
          <div className="flex items-center gap-2 max-w-[240px]">
            <span className="text-sm text-on-surface-variant truncate">
              {s.message || <span className="text-outline">-</span>}
            </span>
            <Button size="sm" onClick={(e) => stop(e, () => onView(s))}>
              查看
            </Button>
          </div>
        ),
      },
      {
        key: 'createdAt',
        header: '提交时间',
        render: (s) => (
          <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
            {formatDateTime(s.createdAt)}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        render: (s) => <StatusBadge meta={SUBMISSION_STATUS} value={s.status} />,
      },
      {
        key: 'handle',
        header: '处理',
        render: (s) =>
          s.handleNote || s.handledAt ? (
            <div className="max-w-[160px]">
              {s.handleNote && (
                <p className="text-xs text-on-surface truncate" title={s.handleNote}>
                  {s.handleNote}
                </p>
              )}
              {s.handledAt && (
                <p className="font-mono text-[10px] text-outline mt-0.5 whitespace-nowrap">
                  {formatDateTime(s.handledAt)}
                </p>
              )}
            </div>
          ) : (
            <span className="text-outline">-</span>
          ),
      },
      {
        key: 'actions',
        header: '操作',
        align: 'right',
        render: (s) => {
          if (s.status === 'APPROVED') {
            return s.convertedAdmin ? (
              <Link
                href="/accounts"
                className="text-sm font-bold text-on-surface underline underline-offset-2 hover:text-ink whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                {s.convertedAdmin.name}
              </Link>
            ) : (
              <span className="text-outline text-xs">已开通</span>
            );
          }
          if (s.status === 'REJECTED') {
            return (
              <Button size="sm" onClick={(e) => stop(e, () => onReopen(s))}>
                重新打开
              </Button>
            );
          }
          // PENDING / CONTACTED
          return (
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              <Button size="sm" onClick={(e) => stop(e, () => onContact(s))}>
                标记已联系
              </Button>
              {sponsorTab && (
                <Button size="sm" variant="primary" onClick={(e) => stop(e, () => onConvert(s))}>
                  开通账号
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={(e) => stop(e, () => onCloseRow(s))}>
                关闭
              </Button>
            </div>
          );
        },
      },
    ];
  }, [sponsorTab, onView, onContact, onCloseRow, onConvert, onReopen]);

  return (
    <DataTable<Submission>
      columns={columns}
      rows={rows}
      rowKey={(s) => s.id}
      loading={loading}
      error={error}
      empty={sponsorTab ? '暂无赞助申请' : '暂无候补名单'}
      onRowClick={onView}
    />
  );
}
