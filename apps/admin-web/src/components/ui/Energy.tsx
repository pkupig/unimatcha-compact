import clsx from 'clsx';
import { formatEnergy } from '@/lib/format';

/**
 * 能量金额展示（镜像 Money；能量数值 ≡ 分值，绝不 /100）。
 * signed 供流水表：正=绿墨 +、负=霓虹粉 −。approx 附带 ≈¥ 副注。
 */
export function Energy({
  value,
  signed = false,
  approx = false,
  className,
}: {
  value?: number | null;
  signed?: boolean;
  /** 是否附带「≈ ¥N」换算副注 */
  approx?: boolean;
  className?: string;
}) {
  const v = value ?? 0;
  const yuan = approx ? (
    <span className="ml-1 text-xs text-on-surface-variant font-normal">
      ≈ ¥{(Math.abs(v) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  ) : null;
  if (!signed) {
    return (
      <span className={clsx('font-mono', className)}>
        {formatEnergy(v)}
        {yuan}
      </span>
    );
  }
  return (
    <span className={clsx('font-mono font-bold', v >= 0 ? 'text-ink' : 'text-neon-pink', className)}>
      {v >= 0 ? '+' : '−'}
      {formatEnergy(Math.abs(v))}
      {yuan}
    </span>
  );
}
