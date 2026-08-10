'use client';

/**
 * 账号列表卡：表格 + 分页 + 学生会引导空态（SPO-4）统一收口。
 * emptyAction 仅在「真空列表」（非加载/非错误）时替换默认空态，引导创建首个账号。
 */
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pager } from '@/components/ui/Pager';
import type { UsePagedListResult } from '@/hooks/usePagedList';
import type { AdminAccount } from '@/lib/types';

export function AccountsTableCard<F extends object>({
  list,
  columns,
  empty,
  emptyAction,
}: {
  list: UsePagedListResult<AdminAccount, F>;
  columns: Column<AdminAccount>[];
  empty: string;
  /** 空列表引导操作（学生会视角）；加载中/出错时不展示以免误导 */
  emptyAction?: ReactNode;
}) {
  const showGuide = !!emptyAction && !list.loading && !list.error && list.items.length === 0;
  return (
    <>
      <Card flush>
        {showGuide ? (
          <EmptyState text={empty} action={emptyAction} />
        ) : (
          <DataTable<AdminAccount>
            columns={columns}
            rows={list.items}
            rowKey={(r) => r.id}
            loading={list.loading}
            error={list.error}
            empty={empty}
          />
        )}
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
    </>
  );
}
