'use client';

/**
 * 合作目录（角色分叉）：广告商看「有学生会入驻的学校」/ 学生会看「他校自拉广告商」。
 * 操作列统一语义：已有唯一线程直接进入，否则弹发起洽谈；发起弹窗两表共享。
 * 平台角色不渲染本面板（页面层已按角色隐藏 directory tab）。
 */
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pager } from '@/components/ui/Pager';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { useAdmin } from '@/lib/auth-context';
import { isSponsor } from '@/lib/auth';
import {
  listPartnerSchools,
  listPartnerSponsors,
  type PartnerSchool,
  type PartnerSponsor,
} from '@/lib/api/partners';
import { formatDate } from '@/lib/format';
import { StartThreadModal, type StartThreadTarget } from './StartThreadModal';

/** 操作列共用：目录行不做整行点击，动作全收在按钮上（避免误触发起） */
function ThreadAction({ threadId, onStart }: { threadId: string | null; onStart: () => void }) {
  const router = useRouter();
  if (threadId) {
    return (
      <Button size="sm" variant="secondary" onClick={() => router.push(`/partners/${threadId}`)}>
        进入线程
      </Button>
    );
  }
  return (
    <Button size="sm" variant="primary" onClick={onStart}>
      发起洽谈
    </Button>
  );
}

/** 广告商侧：学校目录 */
function SchoolDirectoryTable({ onStart }: { onStart: (t: StartThreadTarget) => void }) {
  const list = usePagedList<PartnerSchool, Record<string, never>>({
    fetcher: (q) => listPartnerSchools({ page: q.page, limit: q.limit, search: q.search }),
    initialFilters: {},
  });

  const columns: Column<PartnerSchool>[] = [
    {
      key: 'name',
      header: '学校',
      render: (s) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-ink">{s.name}</span>
          {s.isSourceSchool && <Badge variant="neon">来源校</Badge>}
        </span>
      ),
    },
    { key: 'city', header: '城市', render: (s) => s.city ?? '-' },
    {
      key: 'action',
      header: '操作',
      align: 'right',
      render: (s) => (
        <ThreadAction
          threadId={s.threadId}
          onStart={() => onStart({ kind: 'school', id: s.id, name: s.name })}
        />
      ),
    },
  ];

  return (
    <>
      <FilterBar>
        <FilterBar.Search value={list.search} onChange={list.setSearch} placeholder="搜索学校名" />
      </FilterBar>
      <Card flush>
        <DataTable<PartnerSchool>
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          empty="暂无可洽谈的学校（须启用中且有学生会入驻）"
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
    </>
  );
}

/** 学生会侧：他校自拉广告商目录（后端不返回联系方式，联系一律走线程） */
function SponsorDirectoryTable({ onStart }: { onStart: (t: StartThreadTarget) => void }) {
  const list = usePagedList<PartnerSponsor, Record<string, never>>({
    fetcher: (q) => listPartnerSponsors({ page: q.page, limit: q.limit, search: q.search }),
    initialFilters: {},
  });

  const columns: Column<PartnerSponsor>[] = [
    {
      key: 'organizationName',
      header: '广告商',
      render: (s) => (
        <span className="font-medium text-ink">{s.organizationName ?? s.name}</span>
      ),
    },
    { key: 'sourcedBySchool', header: '来源学校', render: (s) => s.sourcedBySchool?.name ?? '-' },
    {
      key: 'createdAt',
      header: '入驻时间',
      render: (s) => <span className="font-mono text-xs">{formatDate(s.createdAt)}</span>,
    },
    {
      key: 'action',
      header: '操作',
      align: 'right',
      render: (s) => (
        <ThreadAction
          threadId={s.threadId}
          onStart={() =>
            onStart({ kind: 'sponsor', id: s.id, name: s.organizationName ?? s.name })
          }
        />
      ),
    },
  ];

  return (
    <>
      <FilterBar>
        <FilterBar.Search value={list.search} onChange={list.setSearch} placeholder="搜索广告商组织名" />
      </FilterBar>
      <Card flush>
        <DataTable<PartnerSponsor>
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          empty="暂无他校广告商可洽谈"
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
    </>
  );
}

export function DirectoryPanel() {
  const { admin } = useAdmin();
  const modal = useModal<StartThreadTarget>();

  return (
    <>
      {isSponsor(admin?.role) ? (
        <SchoolDirectoryTable onStart={modal.openWith} />
      ) : (
        <SponsorDirectoryTable onStart={modal.openWith} />
      )}
      {modal.open && modal.data && <StartThreadModal target={modal.data} onClose={modal.close} />}
    </>
  );
}
