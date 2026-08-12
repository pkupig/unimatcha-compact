'use client';

/**
 * 用户域（薄壳）：角色分叉——SUPER/TEAM=名单+认证审核；学生会=群体概览+认证审核
 * （产品口径：学生会不可见名单与个体详情，后端名单/详情对学生会 403）。
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FilterBar } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/form';
import { Pager } from '@/components/ui/Pager';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { usePagedList } from '@/hooks/usePagedList';
import { useAdmin } from '@/lib/auth-context';
import { isUnion } from '@/lib/auth';
import { listUsers } from '@/lib/api/users';
import { formatNumber } from '@/lib/format';
import { USER_STATUS, labelOf } from '@/lib/labels';
import type { AdminUserListItem, UserStatusFilter } from '@/lib/types';
import { UsersTable } from '@/components/users/UsersTable';
import { UnionUsersOverview } from '@/components/users/UnionUsersOverview';
import { VerificationQueue } from '@/components/users/VerificationQueue';

type UsersTab = 'list' | 'overview' | 'review';

const TEAM_TABS: TabItem[] = [
  { key: 'list', label: '用户名单' },
  { key: 'review', label: '认证审核' },
];
const UNION_TABS: TabItem[] = [
  { key: 'overview', label: '群体概览' },
  { key: 'review', label: '认证审核' },
];

function parseStatus(v: string | null): UserStatusFilter {
  return v === 'ACTIVE' || v === 'BANNED' ? v : '';
}

/** 首 tab 按角色兜底：学生会=概览，平台=名单 */
function parseTab(v: string | null, union: boolean): UsersTab {
  if (v === 'review') return 'review';
  return union ? 'overview' : 'list';
}

function UsersPageInner() {
  const { admin } = useAdmin();
  const union = isUnion(admin?.role);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<UsersTab>(() => parseTab(searchParams.get('tab'), union));
  const listActive = !union && tab === 'list';

  const list = usePagedList<AdminUserListItem, { status: UserStatusFilter }>({
    fetcher: (q) => listUsers(q),
    initialFilters: { status: parseStatus(searchParams.get('status')) },
    enabled: listActive, // 学生会/审核 tab 不拉名单（后端对学生会 403）
  });

  // URL → tab/筛选回同步（前进后退/侧栏重进时跟随 URL）
  const urlTab = parseTab(searchParams.get('tab'), union);
  useEffect(() => {
    if (tab !== urlTab) setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);
  const urlStatus = parseStatus(searchParams.get('status'));
  useEffect(() => {
    if (list.filters.status !== urlStatus) list.setFilter('status', urlStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus]);

  // 状态筛选写回 URL，支持 ?status= 深链直达（名单 tab 专属，tab 缺省即名单）
  const changeStatus = (v: UserStatusFilter) => {
    list.setFilter('status', v);
    router.replace(v ? `/users?status=${v}` : '/users');
  };

  const switchTab = (key: string) => {
    const next = parseTab(key, union);
    setTab(next);
    router.replace(next === 'review' ? '/users?tab=review' : '/users');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        caption="USERS"
        title={union ? '本校用户' : '用户管理'}
        sub={
          union ? (
            <span className="inline-flex items-center gap-2">
              本校群体统计与学生认证审核
              <Badge variant="ink">不含个人名单</Badge>
            </span>
          ) : listActive ? (
            <span className="inline-flex items-center gap-2">
              共 <span className="font-mono">{formatNumber(list.total)}</span> 位用户
            </span>
          ) : (
            '学生认证材料审核'
          )
        }
      />
      <Tabs items={union ? UNION_TABS : TEAM_TABS} value={tab} onChange={switchTab} />
      {tab === 'review' ? (
        <VerificationQueue />
      ) : union ? (
        <UnionUsersOverview />
      ) : (
        <>
          <FilterBar>
            <FilterBar.Search value={list.search} onChange={list.setSearch} placeholder="搜索邮箱或昵称" />
            <Select
              className="w-40"
              value={list.filters.status}
              onChange={(e) => changeStatus(e.target.value as UserStatusFilter)}
            >
              <option value="">全部状态</option>
              <option value="ACTIVE">{labelOf(USER_STATUS, 'ACTIVE')}</option>
              <option value="BANNED">{labelOf(USER_STATUS, 'BANNED')}</option>
            </Select>
          </FilterBar>
          <Card flush>
            <UsersTable rows={list.items} loading={list.loading} error={list.error} onChanged={list.refresh} />
          </Card>
          <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

export default function UsersPage() {
  // useSearchParams 页面必须包 Suspense（Next 14 硬要求）
  return (
    <Suspense fallback={null}>
      <UsersPageInner />
    </Suspense>
  );
}
