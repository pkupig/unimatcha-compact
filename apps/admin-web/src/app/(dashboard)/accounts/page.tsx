'use client';

/**
 * 账号管理（/accounts）：SUPER=学生会/广告商/管理员三 tab；TEAM=前两 tab；
 * 学生会=「广告商/邀请码」双 tab（旧 /sponsors 并入 + B5 邀请码自注册）。
 * tab 状态独立于账号列表筛选——邀请码 tab 的列表在 InvitesPanel 内自管。
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { useAdmin } from '@/lib/auth-context';
import { isUnion } from '@/lib/auth';
import { fetchAccountsTab } from '@/lib/api/accounts';
import type { AccountsListTab, AccountsTab, AdminAccount } from '@/lib/types';
import { adminColumns, sponsorColumns, unionColumns } from '@/components/accounts/columns';
import { parseTab, PLATFORM_TABS, UNION_TABS } from '@/components/accounts/tabs';
import { AccountsPageHeader } from '@/components/accounts/AccountsPageHeader';
import { AccountsTableCard } from '@/components/accounts/AccountsTableCard';
import { ActiveFilterBar } from '@/components/accounts/ActiveFilterBar';
import { CreateAccountModal } from '@/components/accounts/CreateAccountModal';
import { ToggleActiveDialog } from '@/components/accounts/ToggleActiveDialog';
import { InvitesPanel } from '@/components/accounts/InvitesPanel';

function AccountsInner() {
  const { admin } = useAdmin();
  const unionView = isUnion(admin?.role);
  const superView = admin?.role === 'SUPER';
  // 操作列：SUPER 全量；学生会可停启本校来源广告商（服务端有权限链）；TEAM 不显示
  const canOperate = superView || unionView;

  const router = useRouter();
  const params = useSearchParams();
  const allowedTabs: AccountsTab[] = unionView
    ? ['sponsor', 'invites']
    : superView
      ? ['union', 'sponsor', 'admin']
      : ['union', 'sponsor'];

  const [tab, setTab] = useState<AccountsTab>(() => parseTab(params.get('tab'), allowedTabs));
  const invitesTab = tab === 'invites';
  const listTab: AccountsListTab = invitesTab ? 'sponsor' : tab;

  const list = usePagedList<AdminAccount, { tab: AccountsListTab; isActive: string }>({
    fetcher: (q) =>
      fetchAccountsTab({ tab: q.tab, isActive: q.isActive || undefined, page: q.page, limit: q.limit }),
    initialFilters: { tab: listTab, isActive: '' },
    enabled: !invitesTab, // 邀请码 tab 不拉账号列表
  });

  const applyTab = (next: AccountsTab) => {
    setTab(next);
    if (next !== 'invites') list.setFilter('tab', next);
  };

  // URL → tab 回同步（前进后退/深链切换时列表跟随 URL）
  const urlTab = parseTab(params.get('tab'), allowedTabs);
  useEffect(() => {
    if (tab !== urlTab) applyTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  const switchTab = (key: string) => {
    const next = parseTab(key, allowedTabs);
    applyTab(next);
    router.replace(`/accounts?tab=${next}`);
  };

  const createModal = useModal();
  const inviteModal = useModal(); // 生成邀请码：按钮在页头，弹窗挂 InvitesPanel 内闭环刷新
  const toggleModal = useModal<AdminAccount>();
  const toggleRow = toggleModal.data;

  const colOpts = { canOperate, onToggle: toggleModal.openWith };
  const columns =
    listTab === 'union'
      ? unionColumns(colOpts)
      : listTab === 'admin'
        ? adminColumns(colOpts)
        : sponsorColumns(colOpts);

  return (
    <>
      <AccountsPageHeader
        unionView={unionView}
        superView={superView}
        invitesTab={invitesTab}
        listTab={listTab}
        schoolName={admin?.schoolName ?? '本校'}
        onCreateAccount={createModal.openEmpty}
        onCreateInvite={inviteModal.openEmpty}
      />

      <Tabs
        items={unionView ? UNION_TABS : PLATFORM_TABS.filter((t) => allowedTabs.includes(t.key))}
        value={tab}
        onChange={switchTab}
      />

      {invitesTab ? (
        <InvitesPanel createOpen={inviteModal.open} onCreateClose={inviteModal.close} />
      ) : (
        <>
          <ActiveFilterBar
            value={list.filters.isActive}
            onChange={(v) => list.setFilter('isActive', v)}
          />
          <AccountsTableCard
            list={list}
            columns={columns}
            empty={unionView ? '暂无广告商 · 为本校合作广告商开通投放账号' : '暂无账号'}
            emptyAction={
              unionView ? (
                <Button variant="primary" size="sm" onClick={createModal.openEmpty}>
                  <Plus size={14} />
                  新建广告商账号
                </Button>
              ) : undefined
            }
          />
        </>
      )}

      {createModal.open && !invitesTab && (
        <CreateAccountModal
          kind={unionView ? 'sponsor' : listTab}
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
