'use client';

/**
 * /wallet — 商家能量钱包（SPONSOR 专属，路由守卫由全局 Guard 处理）。
 * 薄壳只做接线：概览三卡 + 充值弹窗 + 流水表的取数与刷新编排。
 * 能量经济：1 元 = 100 分 = 100 能量，*Cents 字段原值即能量数。
 */
import { useCallback, useEffect, useState } from 'react';
import { Coins, Landmark, PiggyBank } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Energy } from '@/components/ui/Energy';
import { Button } from '@/components/ui/Button';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { toastError } from '@/lib/toast';
import { getWalletSummary, listWalletLedger, type SponsorLedgerEntry, type WalletSummary } from '@/lib/api/wallet';
import { TopUpModal } from '@/components/wallet/TopUpModal';
import { WalletLedgerTable, type WalletLedgerFilters } from '@/components/wallet/WalletLedgerTable';

export default function WalletPage() {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const topup = useModal();

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getWalletSummary());
    } catch (e) {
      toastError(e);
    }
  }, []);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const ledger = usePagedList<SponsorLedgerEntry, WalletLedgerFilters>({
    fetcher: (q) => listWalletLedger({ page: q.page, limit: q.limit, type: q.type || undefined }),
    initialFilters: { type: '' },
  });

  // 充值到账后概览与流水一起刷新（mock 即时到账，无需轮询）
  const onTopupDone = () => {
    void loadSummary();
    void ledger.refresh();
  };

  return (
    <>
      <PageHeader
        caption="ENERGY WALLET"
        title="能量钱包"
        sub="1 元 = 100 能量 · 投放创建时预扣，未消耗部分结算后退回"
        actions={
          <Button variant="cta" onClick={topup.openEmpty}>
            充值
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="可用能量 / BALANCE"
          value={<Energy value={summary?.balanceCents} approx />}
          icon={Coins}
          sub="可用于新投放的能量"
        />
        <StatCard
          label="投放锁定 / LOCKED"
          value={<Energy value={summary?.lockedCents} approx />}
          icon={Landmark}
          sub="在途广告的预扣能量"
        />
        <StatCard
          label="累计充值 / TOTAL TOP-UP"
          value={<Energy value={summary?.totalTopupCents} approx />}
          icon={PiggyBank}
          sub="历史充值合计"
        />
      </div>

      <WalletLedgerTable list={ledger} />

      {topup.open && <TopUpModal onClose={topup.close} onDone={onTopupDone} />}
    </>
  );
}
