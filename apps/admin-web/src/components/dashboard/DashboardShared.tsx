'use client';

/** 仪表盘共用零件：统计卡栅格 / 待办 chip / 骨架占位（dashboard 域 + 用户域群体概览复用） */
import Link from 'next/link';
import clsx from 'clsx';
import type { ReactNode } from 'react';

/** 4 卡自适应栅格（三角色统一布局） */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** 待办 chip：计数 >0 荧光绿高亮，点击深链到对应筛选页（href 一律来自 DEEP_LINKS） */
export function TodoChip({ href, label, count }: { href: string; label: string; count?: number }) {
  const hot = (count ?? 0) > 0;
  return (
    <Link
      href={href}
      className={clsx(
        'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border font-display font-bold text-sm transition-colors',
        hot
          ? 'bg-neon border-neon text-black hover:bg-neon-dark'
          : 'bg-white border-outline-variant/60 text-on-surface-variant hover:bg-surface-low',
      )}
    >
      <span>{label}</span>
      {count !== undefined && <span className="font-mono">{count}</span>}
    </Link>
  );
}

/** 统计卡区骨架（payload 未回来时的首屏加载态） */
export function StatGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <StatGrid>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="card">
          <div className="h-3 w-20 rounded bg-surface-high animate-pulse mb-3" />
          <div className="h-7 w-28 rounded bg-surface-high animate-pulse" />
        </div>
      ))}
    </StatGrid>
  );
}

/** 图表区骨架（与 TrendChart 默认高度一致，避免加载完成跳版） */
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return <div className="rounded-lg bg-surface-high animate-pulse" style={{ height }} />;
}
