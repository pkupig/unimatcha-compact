'use client';

import { useEffect, useState } from 'react';

/** 全站唯一防抖实现（列表搜索经 usePagedList 内置使用，勿再复制） */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
