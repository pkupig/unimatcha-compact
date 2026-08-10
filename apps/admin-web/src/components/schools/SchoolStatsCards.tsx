import { Megaphone, TrendingUp, Users, Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { fenToYuan, formatNumber } from '@/lib/format';
import type { SchoolStats } from '@/lib/types';

/** 详情统计 4 卡（SCHD-2）：用户数 / 进行中广告 / 累计收入 / 余额 */
export function SchoolStatsCards({ stats }: { stats?: SchoolStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="用户数 · Users" value={formatNumber(stats?.userCount)} icon={Users} />
      <StatCard
        label="进行中广告 · Active Ads"
        value={formatNumber(stats?.activeCampaignCount)}
        icon={Megaphone}
      />
      <StatCard
        label="累计收入 · Revenue"
        value={fenToYuan(stats?.totalRevenueCents)}
        icon={TrendingUp}
      />
      <StatCard label="余额 · Balance" value={fenToYuan(stats?.balanceCents)} icon={Wallet} />
    </div>
  );
}
