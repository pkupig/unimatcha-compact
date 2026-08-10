'use client';

import clsx from 'clsx';

export interface TabItem {
  key: string;
  label: string;
  /** 角标计数（>0 荧光绿） */
  count?: number;
}

/** 受控 Tab 条；tab 状态建议写回 URL ?tab=（深链要求，见 permissions.DEEP_LINKS） */
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-outline-variant/40">
      {items.map((t) => (
        <button
          key={t.key}
          className={clsx(
            'px-4 py-2.5 text-sm font-display font-bold border-b-2 -mb-px transition-colors',
            value === t.key
              ? 'border-ink text-ink'
              : 'border-transparent text-on-surface-variant hover:text-ink',
          )}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {typeof t.count === 'number' && t.count > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-neon text-black text-[10px] font-bold align-middle">
              {t.count > 99 ? '99+' : t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
