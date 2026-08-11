import { ArrowRightLeft, HandCoins, Zap } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Energy } from '@/components/ui/Energy';
import type { SchoolFinanceSummary } from '@/lib/api/earnings';

/**
 * 能量段：能量三统计卡。
 * 余额已扣除在途兑换冻结（approx 附带 ≈¥ 换算副注）；提现改扣现金账本后，
 * 能量侧冻结只剩待审批的兑换申请。
 */
export function BalanceCards({ summary }: { summary: SchoolFinanceSummary | null }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        label="能量余额 / ENERGY"
        value={<Energy value={summary?.balanceCents} approx />}
        icon={Zap}
        sub="广告分成与赞助发放收入"
      />
      <StatCard
        label="累计收入 / TOTAL INCOME"
        value={<Energy value={summary?.totalIncomeCents} />}
        icon={HandCoins}
      />
      <StatCard
        label="兑换在途 / PENDING"
        value={<Energy value={summary?.frozenCents} />}
        icon={ArrowRightLeft}
        sub="待平台审批的兑换申请"
      />
    </div>
  );
}
