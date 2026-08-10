import clsx from 'clsx';
import { fenToYuan } from '@/lib/format';

/** 金额展示（恒 mono）；signed 供流水表：正数绿墨 +、负数霓虹粉 − */
export function Money({
  cents,
  signed = false,
  className,
}: {
  cents?: number | null;
  signed?: boolean;
  className?: string;
}) {
  const v = cents ?? 0;
  if (!signed) {
    return <span className={clsx('font-mono', className)}>{fenToYuan(v)}</span>;
  }
  return (
    <span className={clsx('font-mono font-bold', v >= 0 ? 'text-ink' : 'text-neon-pink', className)}>
      {v >= 0 ? '+' : '−'}
      {fenToYuan(Math.abs(v))}
    </span>
  );
}
