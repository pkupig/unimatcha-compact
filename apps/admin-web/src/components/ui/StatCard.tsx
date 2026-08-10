import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** 统计卡：caption 小标签 + mono 大数值 + 可选副行/图标 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="caption mb-2">{label}</p>
        <p className="text-2xl font-mono font-bold text-on-surface leading-none">{value}</p>
        {sub && <p className="text-xs text-on-surface-variant mt-2">{sub}</p>}
      </div>
      {Icon && (
        <div className="w-10 h-10 rounded-lg bg-surface-low flex items-center justify-center shrink-0">
          <Icon size={18} className="text-on-surface-variant" />
        </div>
      )}
    </div>
  );
}
