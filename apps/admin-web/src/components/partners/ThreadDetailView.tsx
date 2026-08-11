'use client';

/**
 * 洽谈线程详情装配层：meta 头（主题/对端/发起方/时间）+ 消息流。
 * 404/403 统一走空态 + 返回列表（越权直链不给任何线索差异）。
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, HeartHandshake } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getThread, type PartnerThread } from '@/lib/api/partners';
import { useAdmin } from '@/lib/auth-context';
import { THREAD_SIDE } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { counterpartLabel } from './counterpart';
import { MessageThread } from './MessageThread';

export function ThreadDetailView({ id }: { id: string }) {
  const { admin } = useAdmin();
  const [thread, setThread] = useState<PartnerThread | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getThread(id)
      .then((t) => {
        if (!cancelled) setThread(t);
      })
      .catch((e) => {
        if (!cancelled) toastError(e, '加载洽谈失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading && !thread) {
    return (
      <>
        <div className="h-8 w-64 rounded-lg bg-surface-high animate-pulse" />
        <div className="card h-72 animate-pulse" />
      </>
    );
  }

  if (!thread) {
    return (
      <Card>
        <EmptyState
          icon={HeartHandshake}
          text="洽谈不存在或无权查看"
          action={
            <Link href="/partners" className="btn-secondary btn-sm">
              <ArrowLeft size={14} />
              返回列表
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        caption="PARTNER THREAD"
        title={thread.subject}
        sub={
          <span className="inline-flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span>对端：{counterpartLabel(admin?.role, thread)}</span>
            <span className="inline-flex items-center gap-1.5">
              发起方
              <StatusBadge meta={THREAD_SIDE} value={thread.createdBySide} />
            </span>
            <span className="font-mono text-xs">创建于 {formatDateTime(thread.createdAt)}</span>
          </span>
        }
        actions={
          <Link href="/partners" className="btn-secondary btn-sm">
            <ArrowLeft size={14} />
            返回列表
          </Link>
        }
      />
      <MessageThread threadId={thread.id} />
    </>
  );
}
