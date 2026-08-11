'use client';

/**
 * 洽谈线程列表（三角色共用）：搜索透传后端（匹配主题）+ 未读前置荧光点 +
 * 对端按角色分叉展示；行点击进线程页。
 */
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pager } from '@/components/ui/Pager';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePagedList } from '@/hooks/usePagedList';
import { useAdmin } from '@/lib/auth-context';
import { isTeam } from '@/lib/auth';
import { listThreads, type PartnerThread } from '@/lib/api/partners';
import { THREAD_SIDE } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { AdminRole } from '@/lib/types';
import { counterpartLabel } from './counterpart';

function threadColumns(role: AdminRole | null | undefined): Column<PartnerThread>[] {
  return [
    {
      key: 'subject',
      header: '主题',
      render: (t) => (
        <span className="inline-flex items-center gap-2">
          {t.unreadCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-neon shrink-0" aria-label="有未读消息" />
          )}
          <span className={t.unreadCount > 0 ? 'font-bold text-ink' : undefined}>{t.subject}</span>
        </span>
      ),
    },
    { key: 'counterpart', header: '对端', render: (t) => counterpartLabel(role, t) },
    {
      key: 'createdBySide',
      header: '发起方',
      render: (t) => <StatusBadge meta={THREAD_SIDE} value={t.createdBySide} />,
    },
    {
      key: 'lastMessageAt',
      header: '最后动态',
      render: (t) => <span className="font-mono text-xs">{formatDateTime(t.lastMessageAt)}</span>,
    },
  ];
}

export function ThreadListPanel() {
  const { admin } = useAdmin();
  const router = useRouter();
  const list = usePagedList<PartnerThread, Record<string, never>>({
    fetcher: (q) => listThreads({ page: q.page, limit: q.limit, search: q.search }),
    initialFilters: {},
  });

  return (
    <>
      <FilterBar>
        <FilterBar.Search value={list.search} onChange={list.setSearch} placeholder="搜索洽谈主题" />
      </FilterBar>

      <Card flush>
        <DataTable<PartnerThread>
          columns={threadColumns(admin?.role)}
          rows={list.items}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          empty={
            isTeam(admin?.role)
              ? '暂无洽谈记录'
              : '暂无洽谈 · 去「合作目录」发起第一条洽谈'
          }
          onRowClick={(t) => router.push(`/partners/${t.id}`)}
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
    </>
  );
}
