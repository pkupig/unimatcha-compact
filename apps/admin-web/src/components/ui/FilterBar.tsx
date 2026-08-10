'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

/** 筛选条容器（全站统一 card py-4 横排）；防抖属于 usePagedList，输入框保持受控即时 */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="card py-4 flex flex-wrap items-center gap-3">{children}</div>;
}

function FilterSearch({
  value,
  onChange,
  placeholder = '搜索',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative flex-1 min-w-[200px] max-w-sm ${className ?? ''}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
      <input
        className="input pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

FilterBar.Search = FilterSearch;
