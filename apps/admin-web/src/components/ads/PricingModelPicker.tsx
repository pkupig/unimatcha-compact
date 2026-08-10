'use client';

/** 计价三选卡（ADSN-3）：BUYOUT/CPM/CPC 单选卡带说明 */
import clsx from 'clsx';
import { PRICING_MODEL, labelOf } from '@/lib/labels';
import type { PricingModel } from '@/lib/types';

const OPTIONS: { value: PricingModel; desc: string }[] = [
  { value: 'BUYOUT', desc: '按天按校固定价，档期内包断展示' },
  { value: 'CPM', desc: '每 1000 次曝光计费，预算即封顶' },
  { value: 'CPC', desc: '按每次点击计费，预算即封顶' },
];

export function PricingModelPicker({
  value,
  onChange,
}: {
  value: PricingModel;
  onChange: (v: PricingModel) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <label
            key={opt.value}
            className={clsx(
              'flex flex-col gap-1 rounded-lg border p-4 cursor-pointer transition-all',
              active
                ? 'border-ink bg-surface-low ring-1 ring-ink'
                : 'border-outline-variant/60 hover:border-outline',
            )}
          >
            <input
              type="radio"
              name="pricingModel"
              className="sr-only"
              checked={active}
              onChange={() => onChange(opt.value)}
            />
            <span className="flex items-center gap-2">
              <span
                className={clsx(
                  'w-3.5 h-3.5 rounded-full border-2 shrink-0',
                  active ? 'border-ink bg-ink' : 'border-outline-variant bg-white',
                )}
              />
              <span className="font-display font-bold text-sm text-on-surface">
                {labelOf(PRICING_MODEL, opt.value)}
              </span>
            </span>
            <span className="text-xs text-on-surface-variant leading-relaxed pl-[22px]">{opt.desc}</span>
          </label>
        );
      })}
    </div>
  );
}
