'use client';

/**
 * 列表引擎（全站唯一）：分页 + 筛选 + 防抖搜索 + 竞态防护 + 原页刷新。
 * 所有列表页必须经由本 hook 取数——单调计数竞态防护不再是「只有最新三页才有」。
 * 行为契约：
 *  - 筛选/搜索变更 → 回第 1 页并重拉；setPage 只翻页；refresh() 原样重拉当前页
 *  - 出错保留旧 items（表格不闪空白），error 供 DataTable 空态展示
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import type { ListResult } from '@/lib/types';
import { useDebounced } from './useDebounced';

export interface UsePagedListOptions<T, F extends object> {
  fetcher: (q: F & { page: number; limit: number; search?: string }) => Promise<ListResult<T>>;
  initialFilters: F;
  /** 默认 20（后端封顶 100） */
  limit?: number;
  /** 默认 400ms */
  searchDebounceMs?: number;
  /** false = 暂不取数（等待角色/依赖就绪） */
  enabled?: boolean;
}

export interface UsePagedListResult<T, F extends object> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  filters: F;
  setFilter<K extends keyof F>(key: K, value: F[K]): void;
  setFilters(patch: Partial<F>): void;
  /** 输入框受控原始值（即时回显；请求走防抖值） */
  search: string;
  setSearch(v: string): void;
  setPage(page: number): void;
  refresh(): Promise<void>;
}

export function usePagedList<T, F extends object>(
  opts: UsePagedListOptions<T, F>,
): UsePagedListResult<T, F> {
  const { fetcher, searchDebounceMs = 400, enabled = true } = opts;
  const limit = opts.limit ?? 20;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFiltersState] = useState<F>(opts.initialFilters);
  const [search, setSearchState] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, searchDebounceMs);
  // 单调计数竞态防护：只应用最后一次发起的请求结果
  const seqRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (p: number, f: F, s: string) => {
      const id = ++seqRef.current;
      setLoading(true);
      try {
        const res = await fetcherRef.current({
          ...f,
          page: p,
          limit,
          search: s.trim() || undefined,
        });
        if (id !== seqRef.current) return; // 过期响应丢弃
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      } catch (e) {
        if (id !== seqRef.current) return;
        setError(e instanceof ApiError ? e.message : '加载失败，请稍后重试');
      } finally {
        if (id === seqRef.current) setLoading(false);
      }
    },
    [limit],
  );

  // 防抖搜索值变化 → 回第 1 页（filters 直改经 setFilter 已回页）
  const prevSearchRef = useRef(debouncedSearch);
  useEffect(() => {
    if (prevSearchRef.current !== debouncedSearch) {
      prevSearchRef.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (!enabled) return;
    void load(page, filters, debouncedSearch);
  }, [enabled, page, filters, debouncedSearch, load]);

  const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const setFilters = useCallback((patch: Partial<F>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const setSearch = useCallback((v: string) => {
    setSearchState(v);
  }, []);

  const refresh = useCallback(async () => {
    await load(page, filters, debouncedSearch);
  }, [load, page, filters, debouncedSearch]);

  return useMemo(
    () => ({
      items, total, page, limit, loading, error, filters,
      setFilter, setFilters, search, setSearch, setPage, refresh,
    }),
    [items, total, page, limit, loading, error, filters, setFilter, setFilters, search, setSearch, refresh],
  );
}
