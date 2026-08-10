'use client';

/**
 * 团队视图（ADS-T1/T2）：全量列表 + 状态筛选（10 态）+ 学校筛选 + 「待审核」快捷 chip（实时计数）。
 * ?status= 深链：仪表盘「平台待审广告」chip 带参跳入即生效，筛选变更回写 URL。
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/form';
import { usePagedList } from '@/hooks/usePagedList';
import { getAdsOverview, listCampaigns } from '@/lib/api/ads';
import { listSchools } from '@/lib/api/schools';
import { CAMPAIGN_STATUS, labelOf } from '@/lib/labels';
import { formatNumber } from '@/lib/format';
import { CAMPAIGN_STATUS_VALUES, type Campaign, type School } from '@/lib/types';
import { CampaignTable } from './CampaignTable';

const PENDING = 'PENDING_PLATFORM_REVIEW';

export function TeamCampaignList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [schools, setSchools] = useState<School[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const list = usePagedList<Campaign, { status: string; schoolId: string }>({
    fetcher: (q) =>
      listCampaigns({
        page: q.page,
        limit: q.limit,
        status: q.status || undefined,
        schoolId: q.schoolId || undefined,
      }),
    initialFilters: { status: searchParams.get('status') ?? '', schoolId: '' },
  });
  const { status, schoolId } = list.filters;

  // URL → 筛选回同步（侧栏点回无参 /ads、浏览器前进后退时列表跟随 URL，防状态脱钩）
  const urlStatus = searchParams.get('status') ?? '';
  useEffect(() => {
    if (status !== urlStatus) list.setFilter('status', urlStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus]);

  useEffect(() => {
    // 学校下拉 + 待审计数（后端 limit 封顶 100，学校超量时下拉只列前 100 所）
    listSchools({ page: 1, limit: 100 })
      .then((res) => setSchools(res.items))
      .catch(() => undefined);
    getAdsOverview()
      .then((ov) => {
        if (ov.role === 'SUPER' || ov.role === 'TEAM') setPendingCount(ov.pendingPlatformReview);
      })
      .catch(() => undefined);
  }, []);

  // 状态筛选是深链契约的一部分：变更时回写 URL，保持可分享/可后退
  const applyStatus = (value: string) => {
    list.setFilter('status', value);
    router.replace(value ? `/ads?status=${value}` : '/ads');
  };

  const pendingActive = status === PENDING;

  return (
    <>
      <PageHeader caption="AD CAMPAIGNS" title="广告管理" sub={`共 ${formatNumber(list.total)} 条投放`} />
      <FilterBar>
        <Select className="w-full sm:w-44" value={status} onChange={(e) => applyStatus(e.target.value)}>
          <option value="">全部状态</option>
          {CAMPAIGN_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {labelOf(CAMPAIGN_STATUS, s)}
            </option>
          ))}
        </Select>
        <Select
          className="w-full sm:w-56"
          value={schoolId}
          onChange={(e) => list.setFilter('schoolId', e.target.value)}
        >
          <option value="">全部学校</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => applyStatus(pendingActive ? '' : PENDING)}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-display font-bold transition-colors shrink-0',
            pendingActive
              ? 'bg-neon border-neon text-black'
              : 'bg-white border-outline-variant text-on-surface-variant hover:border-ink hover:text-ink',
          )}
        >
          待审核
          {pendingCount != null && <span className="font-mono">{pendingCount}</span>}
        </button>
      </FilterBar>
      <CampaignTable
        view="team"
        items={list.items}
        total={list.total}
        page={list.page}
        limit={list.limit}
        loading={list.loading}
        error={list.error}
        onPage={list.setPage}
      />
    </>
  );
}
