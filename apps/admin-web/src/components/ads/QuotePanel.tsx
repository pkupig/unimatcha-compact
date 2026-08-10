'use client';

/**
 * 实时报价侧栏（ADSN-7）：
 * - BUYOUT：逐校 单价 × 天数 明细行，未知单价显示「待核价」，合计仅含已知项并提示以平台核价为准
 * - CPM/CPC：预算封顶 + 逐校单价行
 */
import { Card } from '@/components/ui/Card';
import { Money } from '@/components/ui/Money';
import { fenToYuan } from '@/lib/format';
import type { PricingModel, SponsorSchool } from '@/lib/types';

export function QuotePanel({
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
  if (pricingModel === 'BUYOUT') {
    const lines = selectedSchools.map((s) => ({
      school: s,
      daily: s.effectivePrices?.buyoutDailyPriceCents ?? null,
    }));
    const knownTotal = lines.reduce((sum, l) => sum + (l.daily != null ? l.daily * days : 0), 0);
    const hasUnknown = lines.some((l) => l.daily == null);

    return (
      <Card caption="QUOTE" title="实时报价">
        {lines.length === 0 || days <= 0 ? (
          <p className="text-sm text-on-surface-variant">选择投放学校与起止日期后自动估价</p>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-2">
              {lines.map((l) => (
                <li key={l.school.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-on-surface-variant truncate">{l.school.name}</span>
                  <span className="font-mono text-xs text-on-surface whitespace-nowrap">
                    {l.daily != null ? `${fenToYuan(l.daily)} × ${days}天` : '待核价'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-outline-variant/40 pt-3">
              <p className="caption mb-1">预估总价</p>
              {hasUnknown && knownTotal === 0 ? (
                <p className="text-sm text-on-surface-variant">提交后以平台核价为准</p>
              ) : (
                <>
                  <Money cents={knownTotal} className="text-2xl font-bold text-on-surface" />
                  {hasUnknown && (
                    <p className="text-xs text-outline mt-1">部分学校未配置单价，提交后以平台核价为准</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Card>
    );
  }

  const isCpm = pricingModel === 'CPM';
  return (
    <Card caption="QUOTE" title="实时报价">
      <div className="space-y-3">
        <div>
          <p className="caption mb-1">预算封顶</p>
          <Money cents={budgetCents ?? 0} className="text-2xl font-bold text-on-surface" />
          <p className="text-xs text-outline mt-1">
            {isCpm ? '按每 1000 次曝光计费，消耗达预算即停' : '按每次点击计费，消耗达预算即停'}
          </p>
        </div>
        {selectedSchools.length > 0 && (
          <ul className="space-y-2 border-t border-outline-variant/40 pt-3">
            {selectedSchools.map((s) => {
              const unit = isCpm
                ? (s.effectivePrices?.cpmPriceCents ?? null)
                : (s.effectivePrices?.cpcPriceCents ?? null);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-on-surface-variant truncate">{s.name}</span>
                  <span className="font-mono text-xs text-on-surface whitespace-nowrap">
                    {unit != null ? `${fenToYuan(unit)}/${isCpm ? '千次曝光' : '点击'}` : '待核价'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
