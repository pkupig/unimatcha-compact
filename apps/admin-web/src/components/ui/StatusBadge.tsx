import type { EnumMeta } from '@/lib/labels';
import { Badge } from './Badge';

/**
 * 枚举徽标：直接消费 labels.ts 的 EnumMeta，标签与颜色永不脱节。
 * 未知值渲染原始串（中性色）——后端新增枚举值不至于渲染崩。
 */
export function StatusBadge<T extends string>({
  meta,
  value,
}: {
  meta: EnumMeta<T>;
  value: T | string | null | undefined;
}) {
  if (!value) return <span className="text-outline">-</span>;
  const label = meta.labels[value as T] ?? String(value);
  const variant = meta.variants[value as T] ?? 'neutral';
  return <Badge variant={variant}>{label}</Badge>;
}
