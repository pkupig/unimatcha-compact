'use client';

/** 商家视图（ADS-P1）：我的广告 + 新建广告 CTA + 空态 CTA */
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { usePagedList } from '@/hooks/usePagedList';
import { listCampaigns } from '@/lib/api/ads';
import { formatNumber } from '@/lib/format';
import type { Campaign } from '@/lib/types';
import { CampaignTable } from './CampaignTable';

type NoFilters = Record<string, never>;

export function SponsorCampaignList() {
  const list = usePagedList<Campaign, NoFilters>({
    fetcher: (q) => listCampaigns({ page: q.page, limit: q.limit }),
    initialFilters: {},
  });

  return (
    <>
      <PageHeader
        caption="MY CAMPAIGNS"
        title="我的广告"
        sub={`共 ${formatNumber(list.total)} 条投放`}
        actions={
          <Link href="/ads/new" className="btn-cta">
            <Plus size={16} />
            新建广告
          </Link>
        }
      />
      <CampaignTable
        view="sponsor"
        items={list.items}
        total={list.total}
        page={list.page}
        limit={list.limit}
        loading={list.loading}
        error={list.error}
        empty="还没有广告，创建第一条广告把品牌带进校园。"
        emptyAction={
          <Link href="/ads/new" className="btn-secondary btn-sm">
            <Plus size={14} />
            新建广告
          </Link>
        }
        onPage={list.setPage}
      />
    </>
  );
}
