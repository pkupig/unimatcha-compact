'use client';

/** 用户管理列表（薄壳）：usePagedList 接线 + 组件拼装；列/弹窗在 components/users */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FilterBar } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/form';
import { Pager } from '@/components/ui/Pager';
import { usePagedList } from '@/hooks/usePagedList';
import { useAdmin } from '@/lib/auth-context';
import { isUnion } from '@/lib/auth';
import { listUsers } from '@/lib/api/users';
import { formatNumber } from '@/lib/format';
import { USER_STATUS, labelOf } from '@/lib/labels';
import type { AdminUserListItem, UserStatusFilter } from '@/lib/types';
import { UsersTable } from '@/components/users/UsersTable';

function parseStatus(v: string | null): UserStatusFilter {
  return v === 'ACTIVE' || v === 'BANNED' ? v : '';
}

function UsersPageInner() {
  const { admin } = useAdmin();
  const union = isUnion(admin?.role);
  const router = useRouter();
  const searchParams = useSearchParams();

  const list = usePagedList<AdminUserListItem, { status: UserStatusFilter }>({
    fetcher: (q) => listUsers(q),
    initialFilters: { status: parseStatus(searchParams.get('status')) },
  });

  // 状态筛选写回 URL，支持 ?status= 深链直达
  const changeStatus = (v: UserStatusFilter) => {
    list.setFilter('status', v);
    router.replace(v ? `/users?status=${v}` : '/users');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        caption="USERS"
        title={union ? '本校用户' : '用户管理'}
        sub={
          <span className="inline-flex items-center gap-2">
            共 <span className="font-mono">{formatNumber(list.total)}</span> 位用户
            {union && <Badge variant="ink">仅显示本校用户</Badge>}
          </span>
        }
      />
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
