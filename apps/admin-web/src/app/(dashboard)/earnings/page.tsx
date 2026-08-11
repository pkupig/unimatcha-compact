'use client';

/**
 * /earnings — 收益提现（STUDENT_UNION 专属，路由守卫由全局 Guard 处理）。
 * 四段：①能量（概要+流水）→ ②兑换（发起+记录）→ ③赞助费（现金概要+流水）→ ④提现（银行卡+申请+记录）。
 * 两个概要接口的 ledger 都是嵌套分页——fetcher 顺手更新概要头，再把嵌套 ledger 适配成 ListResult；
 * 表格接线用 {...list} 展开（usePagedList 返回面是表格 props 的超集）。
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
  getSchoolCashSummary,
  getSchoolFinanceSummary,
  listConversions,
  listWithdrawals,
  type CashLedgerEntry,
  type ConversionRequest,
  type LedgerEntry,
  type SchoolBankInfo,
  type SchoolCashSummary,
  type SchoolFinanceSummary,
  type WithdrawalRequest,
} from '@/lib/api/earnings';
import type { ListResult } from '@/lib/types';
import { BalanceCards } from '@/components/earnings/BalanceCards';
import { LedgerTable } from '@/components/earnings/LedgerTable';
import { ConversionCard } from '@/components/earnings/ConversionCard';
import { ConversionsTable } from '@/components/earnings/ConversionsTable';
import { CashBalanceCards } from '@/components/earnings/CashBalanceCards';
import { CashLedgerTable } from '@/components/earnings/CashLedgerTable';
import { BankCard, hasBankAccount } from '@/components/earnings/BankCard';
import { WithdrawCard } from '@/components/earnings/WithdrawCard';
import { WithdrawalsTable } from '@/components/earnings/WithdrawalsTable';

const PAGE_SIZE = 10;
type NoFilters = Record<string, never>;
const EMPTY_PAGE = { items: [], total: 0, page: 1, limit: PAGE_SIZE };

export default function EarningsPage() {
  const { admin } = useAdmin();
  const schoolId = admin?.schoolId ?? null;

  const [summary, setSummary] = useState<SchoolFinanceSummary | null>(null);
  const [cash, setCash] = useState<SchoolCashSummary | null>(null);
  const [bank, setBank] = useState<SchoolBankInfo | null>(null);
  const [bankLoading, setBankLoading] = useState(true);

  // ① 能量流水：概要接口嵌套分页 → 适配 ListResult；概要头随每次翻页/刷新同步更新
  const ledgerFetcher = useCallback(
    async (q: { page: number; limit: number }): Promise<ListResult<LedgerEntry>> => {
      if (!schoolId) return EMPTY_PAGE; // enabled 已挡，仅类型收窄
      const s = await getSchoolFinanceSummary(schoolId, { page: q.page, limit: q.limit });
      setSummary(s);
      return s.ledger;
    },
    [schoolId],
  );
  const ledger = usePagedList<LedgerEntry, NoFilters>({
    fetcher: ledgerFetcher, initialFilters: {}, limit: PAGE_SIZE, enabled: !!schoolId,
  });

  // ③ 赞助费流水：cash-summary 同一嵌套分页适配写法
  const cashLedgerFetcher = useCallback(
    async (q: { page: number; limit: number }): Promise<ListResult<CashLedgerEntry>> => {
      if (!schoolId) return EMPTY_PAGE;
      const s = await getSchoolCashSummary(schoolId, { page: q.page, limit: q.limit });
      setCash(s);
      return s.ledger;
    },
    [schoolId],
  );
  const cashLedger = usePagedList<CashLedgerEntry, NoFilters>({
    fetcher: cashLedgerFetcher, initialFilters: {}, limit: PAGE_SIZE, enabled: !!schoolId,
  });

  // ②④ 兑换 / 提现记录：后端对学生会自动 scope 本校
  const conversionsFetcher = useCallback((q: { page: number; limit: number }) => listConversions(q), []);
  const conversions = usePagedList<ConversionRequest, NoFilters>({
    fetcher: conversionsFetcher, initialFilters: {}, limit: PAGE_SIZE, enabled: !!schoolId,
  });
  const withdrawalsFetcher = useCallback((q: { page: number; limit: number }) => listWithdrawals(q), []);
  const withdrawals = usePagedList<WithdrawalRequest, NoFilters>({
    fetcher: withdrawalsFetcher, initialFilters: {}, limit: PAGE_SIZE, enabled: !!schoolId,
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
  useEffect(() => { void loadBank(); }, [loadBank]);

  if (!schoolId) {
    return (
      <>
        <PageHeader caption="EARNINGS" title="收益提现" />
        <Card><EmptyState icon={Wallet} text="账号未绑定学校，请联系平台团队绑定学校后再使用收益提现" /></Card>
      </>
    );
  }

  // 变更连带刷新：兑换动能量冻结（概要头随 ledger 刷新）、提现动现金冻结（随 cashLedger 刷新）
  const onConvertDone = () => { void ledger.refresh(); void conversions.refresh(); };
  const onWithdrawDone = () => { void cashLedger.refresh(); void withdrawals.refresh(); };

  return (
    <>
      <PageHeader
        caption="EARNINGS"
        title="收益提现"
        sub={`${admin?.schoolName ? `${admin.schoolName} · ` : ''}能量收入 → 兑换赞助费 → 提现`}
      />
      {/* ① 能量段 */}
      <BalanceCards summary={summary} />
      <LedgerTable {...ledger} onPage={ledger.setPage} />
      {/* ② 兑换段 */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
        <ConversionCard balanceCents={summary?.balanceCents ?? 0} onDone={onConvertDone} />
        <ConversionsTable {...conversions} onPage={conversions.setPage} />
      </div>
      {/* ③ 赞助费段 */}
      <CashBalanceCards summary={cash} />
      <CashLedgerTable {...cashLedger} onPage={cashLedger.setPage} />
      {/* ④ 提现段 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <BankCard bank={bank} loading={bankLoading} onSaved={() => void loadBank()} />
        <WithdrawCard
          cashBalanceCents={cash?.cashBalanceCents ?? 0}
          bank={bank}
          bound={hasBankAccount(bank)}
          onDone={onWithdrawDone}
        />
      </div>
      <WithdrawalsTable {...withdrawals} onPage={withdrawals.setPage} />
    </>
  );
}
