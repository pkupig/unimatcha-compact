'use client';

/**
 * /finance — 平台财务（SUPER/TEAM，路由权限由全局 Guard 处理）
 * 四 tab：提现审核 / 赞助发放 / 手工调整 / 收入报表。
 * tab 与提现状态筛选读写 URL ?tab= &status=（仪表盘深链
 * /finance?tab=withdrawals&status=PENDING 直落）。
 */
import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { WITHDRAWAL_STATUS } from '@/lib/labels';
import { WithdrawalsTab } from '@/components/finance/WithdrawalsTab';
import { GrantsTab } from '@/components/finance/GrantsTab';
import { AdjustmentsTab } from '@/components/finance/AdjustmentsTab';
import { RevenueReportTab } from '@/components/finance/RevenueReportTab';

const TAB_ITEMS = [
  { key: 'withdrawals', label: '提现审核' },
  { key: 'grants', label: '赞助发放' },
  { key: 'adjustments', label: '手工调整' },
  { key: 'report', label: '收入报表' },
];
type TabKey = 'withdrawals' | 'grants' | 'adjustments' | 'report';

function isTabKey(v: string | null): v is TabKey {
  return v !== null && TAB_ITEMS.some((t) => t.key === v);
}

function FinanceInner() {
  const router = useRouter();
  const sp = useSearchParams();

  // URL 是 tab/status 的唯一真源；非法值静默回退默认
  const tab: TabKey = isTabKey(sp.get('tab')) ? (sp.get('tab') as TabKey) : 'withdrawals';
  const rawStatus = sp.get('status') ?? '';
  const status = rawStatus in WITHDRAWAL_STATUS.labels ? rawStatus : '';

  const applyUrl = useCallback(
    (nextTab: TabKey, nextStatus: string) => {
      const p = new URLSearchParams();
      p.set('tab', nextTab);
      // status 仅对提现审核 tab 有意义，切走即清
      if (nextTab === 'withdrawals' && nextStatus) p.set('status', nextStatus);
      router.replace(`/finance?${p.toString()}`);
    },
    [router],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        caption="FINANCE"
        title="财务"
        sub="提现审核 · 赞助发放 · 手工调整 · 收入报表"
      />
      <Tabs items={TAB_ITEMS} value={tab} onChange={(k) => applyUrl(k as TabKey, status)} />
      {tab === 'withdrawals' && (
        <WithdrawalsTab status={status} onStatusChange={(s) => applyUrl('withdrawals', s)} />
      )}
      {tab === 'grants' && <GrantsTab />}
      {tab === 'adjustments' && <AdjustmentsTab />}
      {tab === 'report' && <RevenueReportTab />}
    </div>
  );
}

// useSearchParams 页面必须包 Suspense（Next 14 硬要求）
export default function FinancePage() {
  return (
    <Suspense fallback={null}>
      <FinanceInner />
    </Suspense>
  );
}
