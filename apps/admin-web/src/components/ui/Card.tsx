import clsx from 'clsx';
import type { ReactNode } from 'react';

/** 白卡容器；flush 变体供表格贴边（p-0 + overflow-hidden，全站统一，不再各写各的负 margin） */
export function Card({
  title,
  caption,
  actions,
  flush = false,
  className,
  children,
}: {
  title?: ReactNode;
  caption?: string;
  actions?: ReactNode;
  /** true = 无内边距（表格贴边） */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx('card', flush && 'p-0 overflow-hidden', className)}>
      {(title || caption || actions) && (
        <div className={clsx('flex items-start justify-between gap-4', flush ? 'px-6 pt-5 pb-3' : 'mb-4')}>
          <div>
            {caption && <p className="caption mb-1">{caption}</p>}
            {title && <h3 className="font-display font-bold text-on-surface">{title}</h3>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
