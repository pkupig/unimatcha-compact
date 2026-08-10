'use client';

/**
 * /earnings — 收益提现（STUDENT_UNION 专属，路由守卫由全局 Guard 处理）。
 * 薄壳只做接线：概要/银行卡/两张独立分页表的取数与刷新编排。
 * ledger 分页嵌在财务概要响应里——fetcher 顺手更新概要头，再把嵌套 ledger 适配成 ListResult。
 */
import { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { usePagedList } from '@/hooks/usePagedList';
import { useAdmin } from '@/lib/auth-context';
import { toastError } from '@/lib/toast';
import {
  getSchoolBankInfo,
  getSchoolFinanceSummary,
  listWithdrawals,
  type LedgerEntry,
  type SchoolBankInfo,
  type SchoolFinanceSummary,
  type WithdrawalRequest,
} from '@/lib/api/earnings';
import type { ListResult } from '@/lib/types';
import { BalanceCards } from '@/components/earnings/BalanceCards';
import { BankCard, hasBankAccount } from '@/components/earnings/BankCard';
import { WithdrawCard } from '@/components/earnings/WithdrawCard';
import { WithdrawalsTable } from '@/components/earnings/WithdrawalsTable';
import { LedgerTable } from '@/components/earnings/LedgerTable';

const PAGE_SIZE = 10;

export default function EarningsPage() {
  const { admin } = useAdmin();
  const schoolId = admin?.schoolId ?? null;

  const [summary, setSummary] = useState<SchoolFinanceSummary | null>(null);
  const [bank, setBank] = useState<SchoolBankInfo | null>(null);
  const [bankLoading, setBankLoading] = useState(true);

  // EARN-6：收支明细（概要接口嵌套分页 → 适配 ListResult；概要头随每次翻页/刷新同步更新）
  const ledgerFetcher = useCallback(
    async (q: { page: number; limit: number }): Promise<ListResult<LedgerEntry>> => {
      // enabled 已保证 schoolId 非空，这里仅做类型收窄
      if (!schoolId) return { items: [], total: 0, page: q.page, limit: q.limit };
      const s = await getSchoolFinanceSummary(schoolId, { page: q.page, limit: q.limit });
      setSummary(s);
      return s.ledger;
    },
    [schoolId],
  );
  const ledger = usePagedList<LedgerEntry, Record<string, never>>({
    fetcher: ledgerFetcher,
    initialFilters: {},
    limit: PAGE_SIZE,
    enabled: !!schoolId,
  });

  // EARN-5：提现记录独立分页（学生会后端自动 scope 本校）
  const withdrawalsFetcher = useCallback(
    (q: { page: number; limit: number }): Promise<ListResult<WithdrawalRequest>> =>
      listWithdrawals({ page: q.page, limit: q.limit }),
    [],
  );
  const withdrawals = usePagedList<WithdrawalRequest, Record<string, never>>({
    fetcher: withdrawalsFetcher,
    initialFilters: {},
    limit: PAGE_SIZE,
    enabled: !!schoolId,
  });

  const loadBank = useCallback(async () => {
    if (!schoolId) return;
    try {
      setBank(await getSchoolBankInfo(schoolId));
    } catch (e) {
      toastError(e);
    } finally {
      setBankLoading(false);
    }
  }, [schoolId]);
  useEffect(() => {
    void loadBank();
  }, [loadBank]);

  // EARN-1：未绑校空态
  if (!schoolId) {
    return (
      <>
        <PageHeader caption="EARNINGS" title="收益提现" />
        <Card>
          <EmptyState icon={Wallet} text="账号未绑定学校，请联系平台团队绑定学校后再使用收益提现" />
        </Card>
      </>
    );
  }

  // 提现成功：两表各自刷新（概要头随 ledger 刷新一并更新余额/冻结）
  const onWithdrawDone = () => {
    void withdrawals.refresh();
    void ledger.refresh();
  };

  return (
    <>
      <PageHeader
        caption="EARNINGS"
        title="收益提现"
        sub={
          admin?.schoolName
            ? `${admin.schoolName} · 广告分成与平台赞助收益`
            : '广告分成与平台赞助收益'
        }
      />
      <BalanceCards summary={summary} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <BankCard bank={bank} loading={bankLoading} onSaved={() => void loadBank()} />
        <WithdrawCard
          balanceCents={summary?.balanceCents ?? 0}
          bank={bank}
          bound={hasBankAccount(bank)}
          onDone={onWithdrawDone}
        />
      </div>
      <WithdrawalsTable
        items={withdrawals.items}
        total={withdrawals.total}
        page={withdrawals.page}
        limit={withdrawals.limit}
        loading={withdrawals.loading}
        error={withdrawals.error}
        onPage={withdrawals.setPage}
      />
      <LedgerTable
        items={ledger.items}
        total={ledger.total}
        page={ledger.page}
        limit={ledger.limit}
        loading={ledger.loading}
        error={ledger.error}
        onPage={ledger.setPage}
      />
    </>
  );
}
