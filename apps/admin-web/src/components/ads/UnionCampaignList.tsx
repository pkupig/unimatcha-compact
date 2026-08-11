'use client';

/**
 * 学生会视图（ADS-U1）：三 tab——待我审核（角标=overview.pendingReviewCount）/
 * 本校广告（只读）/ 广告定价（自设本校单价）。
 * tab 写 URL ?tab=（DEEP_LINKS.adsPendingUnion 深链 /ads?tab=review，定价深链 /ads?tab=pricing）。
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { usePagedList } from '@/hooks/usePagedList';
import { getAdsOverview, listCampaigns } from '@/lib/api/ads';
import type { Campaign } from '@/lib/types';
import { CampaignTable } from './CampaignTable';
import { UnionAdPricingCard } from './UnionAdPricingCard';

type UnionTab = 'review' | 'school' | 'pricing';

function parseTab(v: string | null): UnionTab {
  return v === 'school' || v === 'pricing' ? v : 'review';
}

export function UnionCampaignList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingCount, setPendingCount] = useState(0);

  const list = usePagedList<Campaign, { tab: UnionTab }>({
    fetcher: (q) =>
      listCampaigns({
        page: q.page,
        limit: q.limit,
        // 待审 tab 用状态过滤；本校 tab 交给后端的学生会 scope（来源本校 ∪ 投放含本校）
        status: q.tab === 'review' ? 'PENDING_UNION_REVIEW' : undefined,
      }),
    initialFilters: { tab: parseTab(searchParams.get('tab')) },
    // 定价 tab 不是列表（URL 与 filters 由 switchTab 同步写入，取 URL 即当前 tab）
    enabled: parseTab(searchParams.get('tab')) !== 'pricing',
  });
  const tab = list.filters.tab;

  // URL → tab 回同步（前进后退/深链切换时列表跟随 URL）
  const urlTab = parseTab(searchParams.get('tab'));
  useEffect(() => {
    if (tab !== urlTab) list.setFilter('tab', urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  // tab 角标实时计数（审核动作后列表 refresh，角标下次进页更新即可）
  useEffect(() => {
    getAdsOverview()
      .then((ov) => {
        if (ov.role === 'STUDENT_UNION') setPendingCount(ov.pendingReviewCount);
      })
      .catch(() => undefined);
  }, []);

  const switchTab = (key: string) => {
    const next = parseTab(key);
    list.setFilter('tab', next);
    router.replace(`/ads?tab=${next}`);
  };

  return (
    <>
      <PageHeader caption="AD REVIEW" title="广告审核" sub="待审队列、本校投放广告与本校定价" />
      <Tabs
        items={[
          { key: 'review', label: '待我审核', count: pendingCount },
          { key: 'school', label: '本校广告' },
          { key: 'pricing', label: '广告定价' },
        ]}
        value={tab}
        onChange={switchTab}
      />
      {tab === 'pricing' ? (
        <UnionAdPricingCard />
      ) : (
        <CampaignTable
          view={tab === 'review' ? 'unionReview' : 'unionSchool'}
          items={list.items}
          total={list.total}
          page={list.page}
          limit={list.limit}
          loading={list.loading}
          error={list.error}
          empty={tab === 'review' ? '暂无待审广告，自拉广告商提交的广告会出现在这里。' : '本校暂无广告'}
          onPage={list.setPage}
        />
      )}
    </>
  );
}
