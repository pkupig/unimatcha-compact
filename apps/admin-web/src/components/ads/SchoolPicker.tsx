'use client';

/**
 * 投放学校多选（ADSN-4/5）：BUYOUT 态显示每校包断日价（后端已合并 学校覆盖价→全局默认，
 * 缺失显示「待核价」）；自拉商家锁定本校并提示。
 */
import clsx from 'clsx';
import { formatEnergy } from '@/lib/format';
import type { PricingModel, SponsorSchool } from '@/lib/types';

export function SchoolPicker({
  schools,
  selected,
  onToggle,
  pricingModel,
  lockedSchoolId,
}: {
  schools: SponsorSchool[];
  selected: string[];
  onToggle: (id: string) => void;
  pricingModel: PricingModel;
  /** 自拉商家的来源学校：非空时锁定单选本校 */
  lockedSchoolId: string | null;
}) {
  if (lockedSchoolId) {
    const locked = schools.find((s) => s.id === lockedSchoolId);
    return (
      <div>
        <label className="flex items-center gap-3 rounded-lg border border-ink bg-surface-low p-4">
          <input type="checkbox" checked disabled className="accent-black" />
          <span className="font-display font-bold text-sm text-on-surface flex-1">
            {locked?.name ?? '本校'}
          </span>
          {pricingModel === 'BUYOUT' && locked && <DailyPrice school={locked} />}
        </label>
        <p className="text-xs text-outline mt-2">自拉赞助商仅可投放本校</p>
      </div>
    );
  }

  if (schools.length === 0) {
    return <p className="text-sm text-on-surface-variant">暂无可投放学校</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {schools.map((s) => {
        const checked = selected.includes(s.id);
        return (
          <label
            key={s.id}
            className={clsx(
              'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all',
              checked ? 'border-ink bg-surface-low' : 'border-outline-variant/60 hover:border-outline',
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(s.id)}
              className="accent-black"
            />
            <span className="text-sm font-medium text-on-surface flex-1">{s.name}</span>
            {pricingModel === 'BUYOUT' && <DailyPrice school={s} />}
          </label>
        );
      })}
    </div>
  );
}

function DailyPrice({ school }: { school: SponsorSchool }) {
  const daily = school.effectivePrices?.buyoutDailyPriceCents ?? null;
  return (
    <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
      {daily != null ? `${formatEnergy(daily)}/天` : '待核价'}
    </span>
  );
}
