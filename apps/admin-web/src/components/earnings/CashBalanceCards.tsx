import { Banknote, Hourglass, PiggyBank } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Money } from '@/components/ui/Money';
import type { SchoolCashSummary } from '@/lib/api/earnings';

/**
 * 赞助费段：现金三统计卡（镜像能量段 BalanceCards，金额单位为 ¥）。
 * 余额已扣除在途提现冻结；累计兑换入账 = Σ CONVERSION_IN。
 */
export function CashBalanceCards({ summary }: { summary: SchoolCashSummary | null }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        label="赞助费余额 / CASH"
        value={<Money cents={summary?.cashBalanceCents} />}
        icon={Banknote}
        sub="能量兑换入账的可提现现金"
      />
      <StatCard
        label="提现在途 / FROZEN"
        value={<Money cents={summary?.frozenCents} />}
        icon={Hourglass}
        sub="审核中或待打款的提现申请"
      />
      <StatCard
        label="累计兑换入账 / CONVERTED"
        value={<Money cents={summary?.totalConvertedCents} />}
        icon={PiggyBank}
      />
    </div>
  );
}
