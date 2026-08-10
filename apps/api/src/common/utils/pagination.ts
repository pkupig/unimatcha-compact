/**
 * 管理端列表响应的统一形状：
 *   分页列表一律 Paginated<T>；非分页列表一律 { items }；
 *   不再有 hasMore / totalPages / 领域自定键名（users/admins/...）。
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PageQuery {
  page: number;
  limit: number;
}

export function skipTake(q: PageQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function paginated<T>(items: T[], total: number, q: PageQuery): Paginated<T> {
  return { items, total, page: q.page, limit: q.limit };
}
