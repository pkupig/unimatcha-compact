'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '@/lib/format';

/** 全站唯一分页器（旧版复制了 9 份的那个）；total ≤ limit 时自动隐藏 */
export function Pager({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-xs text-on-surface-variant">
        第 {page} / {totalPages} 页 · 共 {formatNumber(total)} 条
      </p>
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={14} /> 上一页
        </button>
        <button
          className="btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          下一页 <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
