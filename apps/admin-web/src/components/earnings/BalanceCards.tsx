import { HandCoins, Landmark, Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Money } from '@/components/ui/Money';
import type { SchoolFinanceSummary } from '@/lib/api/earnings';

/** EARN-2：余额三统计卡（可用余额已扣除在途冻结，副行点明口径） */
export function BalanceCards({ summary }: { summary: SchoolFinanceSummary | null }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        label="可用余额 / BALANCE"
        value={<Money cents={summary?.balanceCents} />}
        icon={Wallet}
        sub="可申请提现的金额（不含在途冻结）"
      />
      <StatCard
        label="累计收入 / TOTAL INCOME"
        value={<Money cents={summary?.totalIncomeCents} />}
        icon={HandCoins}
        sub="广告分成 + 赞助发放累计"
      />
      <StatCard
        label="冻结中 / FROZEN"
        value={<Money cents={summary?.frozenCents} />}
        icon={Landmark}
        sub="在途提现（待审核 / 待打款）"
      />
    </div>
  );
}
