'use client';

/**
 * 学校管理列表（SUPER/TEAM，路由守卫由全局 Guard 处理）：
 * 搜索（校名/城市）+ 启用状态筛选 + 分页；行点击进详情；新建学校弹窗。
 */
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/form';
import { Pager } from '@/components/ui/Pager';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { listSchools } from '@/lib/api/schools';
import { formatNumber } from '@/lib/format';
import type { School } from '@/lib/types';
import { SchoolsTable } from '@/components/schools/SchoolsTable';
import { CreateSchoolModal } from '@/components/schools/CreateSchoolModal';

export default function SchoolsPage() {
  const router = useRouter();
  const list = usePagedList<School, { isActive: string }>({
    fetcher: (q) => listSchools(q),
    initialFilters: { isActive: '' },
  });
  const create = useModal();

  return (
    <>
      <PageHeader
        caption="Schools"
        title="学校管理"
        sub={`共 ${formatNumber(list.total)} 所学校`}
        actions={
          <Button variant="cta" onClick={create.openEmpty}>
            <Plus size={16} />
            新建学校
          </Button>
        }
      />

      <FilterBar>
        <FilterBar.Search
          value={list.search}
          onChange={list.setSearch}
          placeholder="搜索学校名 / 城市…"
        />
        <Select
          className="w-40"
          value={list.filters.isActive}
          onChange={(e) => list.setFilter('isActive', e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="true">启用</option>
          <option value="false">停用</option>
        </Select>
      </FilterBar>

      <Card flush>
        <SchoolsTable
          rows={list.items}
          loading={list.loading}
          error={list.error}
          onRowClick={(s) => router.push(`/schools/${s.id}`)}
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {create.open && <CreateSchoolModal onClose={create.close} onDone={list.refresh} />}
    </>
  );
}
