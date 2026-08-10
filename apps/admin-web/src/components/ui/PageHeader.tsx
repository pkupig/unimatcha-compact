import type { ReactNode } from 'react';

/** 页头：英文 caption（.caption 自带大写）+ 中文标题 + 右侧操作区 */
export function PageHeader({
  title,
  caption,
  sub,
  actions,
}: {
  title: string;
  caption?: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {caption && <p className="caption mb-1">{caption}</p>}
        <h1 className="text-2xl font-display font-bold text-on-surface leading-tight">{title}</h1>
        {sub && <p className="text-sm text-on-surface-variant mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
