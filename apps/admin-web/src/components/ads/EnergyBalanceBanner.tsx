'use client';

/**
 * 能量余额不足提示条（表单顶部，软提示不硬拦）：
 * 挂载拉一次钱包余额（失败静默——余额提示是增强，不阻塞表单）；
 * 报价合计 > 可用余额时显示差额 + 充值深链。合计口径与 QuotePanel 同源（estimateQuoteCents）。
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { getWalletSummary } from '@/lib/api/wallet';
import { DEEP_LINKS } from '@/lib/permissions';
import { formatEnergy } from '@/lib/format';
import type { PricingModel, SponsorSchool } from '@/lib/types';
import { estimateQuoteCents } from './QuotePanel';

export function EnergyBalanceBanner({
  pricingModel,
  days,
  selectedSchools,
  budgetCents,
}: {
  pricingModel: PricingModel;
  days: number;
  selectedSchools: SponsorSchool[];
  budgetCents: number | null;
}) {
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  useEffect(() => {
    getWalletSummary()
      .then((s) => setBalanceCents(s.balanceCents))
      .catch(() => undefined);
  }, []);

  const quote = estimateQuoteCents(pricingModel, days, selectedSchools, budgetCents);
  if (balanceCents == null || quote <= 0 || quote <= balanceCents) return null;

  // 黄条取品牌系最近似色（neon 黄绿）：设计系统无独立警示黄 token，且组件禁裸 hex
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-neon-dark bg-neon/15 px-4 py-3 text-sm text-on-surface">
      <AlertTriangle size={15} className="shrink-0" />
      <span>
        能量余额不足（还差 {formatEnergy(quote - balanceCents)}），提交审核前请先充值
      </span>
      <Link
        href={DEEP_LINKS.sponsorWallet}
        className="ml-auto whitespace-nowrap font-display font-bold underline underline-offset-2 hover:text-neon-pink"
      >
        去充值 →
      </Link>
    </div>
  );
}
