'use client';

import clsx from 'clsx';

/** 全站唯一开关（旧版两处手搓的那个）；开态荧光绿轨道 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className={clsx('inline-flex items-center gap-2', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative w-10 h-[22px] rounded-full transition-colors shrink-0',
          checked ? 'bg-neon' : 'bg-outline-variant',
        )}
      >
        <span
          className={clsx(
            'absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all',
            checked ? 'left-[20px]' : 'left-[2px]',
          )}
        />
      </button>
      {label && <span className="text-sm text-on-surface">{label}</span>}
    </label>
  );
}
