import { Loader2 } from 'lucide-react';

/** 行内转圈；fullPage 变体供 Guard/整页加载用 */
export function Spinner({ size = 22, fullPage = false }: { size?: number; fullPage?: boolean }) {
  const icon = <Loader2 size={size} className="animate-spin text-on-surface-variant" />;
  if (!fullPage) return icon;
  return <div className="min-h-screen flex items-center justify-center">{icon}</div>;
}
