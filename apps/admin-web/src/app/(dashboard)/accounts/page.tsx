'use client';

/**
 * 账号管理（/accounts）：SUPER=学生会/商家/管理员三 tab；TEAM=前两 tab；
 * 学生会=无 tab 的本校「赞助商」视图（旧 /sponsors 页并入，IA 决策见重写规范）。
 */
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { FilterBar } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/form';
import { Button } from '@/components/ui/Button';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { useAdmin } from '@/lib/auth-context';
import { isUnion } from '@/lib/auth';
import { fetchAccountsTab } from '@/lib/api/accounts';
import type { AccountsTab, AdminAccount } from '@/lib/types';
import { adminColumns, sponsorColumns, unionColumns } from '@/components/accounts/columns';
import { AccountsTableCard } from '@/components/accounts/AccountsTableCard';
import { CreateAccountModal } from '@/components/accounts/CreateAccountModal';
import { ToggleActiveDialog } from '@/components/accounts/ToggleActiveDialog';

const TAB_LABELS: { key: AccountsTab; label: string }[] = [
  { key: 'union', label: '学生会' },
  { key: 'sponsor', label: '商家' },
  { key: 'admin', label: '管理员' },
];

const CREATE_LABELS: Record<AccountsTab, string> = {
  union: '创建学生会账号',
  sponsor: '创建商家账号',
  admin: '创建管理员账号',
};

function parseTab(raw: string | null, allowed: AccountsTab[]): AccountsTab {
  return allowed.includes(raw as AccountsTab) ? (raw as AccountsTab) : allowed[0];
}

function AccountsInner() {
  const { admin } = useAdmin();
  const unionView = isUnion(admin?.role);
  const superView = admin?.role === 'SUPER';
  // 操作列：SUPER 全量；学生会可停启本校来源商家（服务端有权限链）；TEAM 不显示
  const canOperate = superView || unionView;

  const router = useRouter();
  const params = useSearchParams();
  const allowedTabs: AccountsTab[] = unionView
    ? ['sponsor']
    : superView
      ? ['union', 'sponsor', 'admin']
      : ['union', 'sponsor'];

  const list = usePagedList<AdminAccount, { tab: AccountsTab; isActive: string }>({
    fetcher: (q) =>
      fetchAccountsTab({ tab: q.tab, isActive: q.isActive || undefined, page: q.page, limit: q.limit }),
    initialFilters: { tab: parseTab(params.get('tab'), allowedTabs), isActive: '' },
  });
  const tab = list.filters.tab;

  // URL → tab 回同步（前进后退/深链切换时列表跟随 URL）
  const urlTab = parseTab(params.get('tab'), allowedTabs);
  useEffect(() => {
    if (tab !== urlTab) list.setFilter('tab', urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  const createModal = useModal();
  const toggleModal = useModal<AdminAccount>();
  const toggleRow = toggleModal.data;

  const switchTab = (key: string) => {
    const next = parseTab(key, allowedTabs);
    list.setFilter('tab', next);
    router.replace(`/accounts?tab=${next}`);
  };

  const colOpts = { canOperate, onToggle: toggleModal.openWith };
  const columns =
    tab === 'union' ? unionColumns(colOpts) : tab === 'admin' ? adminColumns(colOpts) : sponsorColumns(colOpts);

  return (
    <>
      <PageHeader
        caption="ACCOUNTS"
        title={unionView ? '赞助商' : '账号管理'}
        sub={
          unionView
            ? `${admin?.schoolName ?? '本校'} · 自拉赞助商账号（其广告仅可投放本校，按自拉档分成）`
            : `学生会 / 商家${superView ? ' / 管理员' : ''} 账号的创建与停启用`
        }
        actions={
          <Button variant="cta" onClick={createModal.openEmpty}>
            <Plus size={15} />
            {unionView ? '新建赞助商' : CREATE_LABELS[tab]}
          </Button>
        }
      />

      {!unionView && (
        <Tabs items={TAB_LABELS.filter((t) => allowedTabs.includes(t.key))} value={tab} onChange={switchTab} />
      )}

      <FilterBar>
        <Select
          className="w-36"
          value={list.filters.isActive}
          onChange={(e) => list.setFilter('isActive', e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="true">启用</option>
          <option value="false">停用</option>
        </Select>
      </FilterBar>

      <AccountsTableCard
        list={list}
        columns={columns}
        empty={unionView ? '暂无赞助商 · 为本校合作商家开通投放账号' : '暂无账号'}
        emptyAction={
          unionView ? (
            <Button variant="primary" size="sm" onClick={createModal.openEmpty}>
              <Plus size={14} />
              新建赞助商账号
            </Button>
          ) : undefined
        }
      />

      {createModal.open && (
        <CreateAccountModal
          kind={unionView ? 'sponsor' : tab}
          unionScoped={unionView}
          onClose={createModal.close}
          onDone={() => void list.refresh()}
        />
      )}
      {toggleModal.open && toggleRow && (
        <ToggleActiveDialog row={toggleRow} onDone={list.refresh} onClose={toggleModal.close} />
      )}
    </>
  );
}

export default function AccountsPage() {
  // useSearchParams 页面必须包 Suspense（Next 14 硬要求）
  return (
    <Suspense fallback={null}>
      <AccountsInner />
    </Suspense>
  );
}
