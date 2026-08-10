'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

/**
 * 全站唯一表格：骨架行 / 空态 / 错误态内建；重拉时旧数据降透明度（不闪空白）。
 * 手写 <table className="table-base"> 属于返工。
 */
export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  empty = '暂无数据',
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  if (loading && rows.length === 0) {
    return (
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={clsx(c.align === 'right' && 'text-right', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key}>
                  <div className="h-4 rounded bg-surface-high animate-pulse" style={{ width: `${45 + ((i * 17 + c.key.length * 7) % 40)}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (rows.length === 0) {
    return <EmptyState text={error ?? empty} />;
  }

  return (
    <div className={clsx('overflow-x-auto transition-opacity', loading && 'opacity-50 pointer-events-none')}>
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={clsx(c.align === 'right' && 'text-right', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={clsx(onRowClick && 'cursor-pointer')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={clsx(c.align === 'right' && 'text-right', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
