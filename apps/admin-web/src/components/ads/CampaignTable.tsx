'use client';

/**
 * 广告列表表格（ADS-0）：贴边卡 + DataTable + Pager，行点击进详情。
 * emptyAction 供商家空态放「新建广告」CTA（DataTable 的 empty 只收字符串）。
 */
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pager } from '@/components/ui/Pager';
import type { Campaign } from '@/lib/types';
import { campaignColumns, type CampaignView } from './campaignColumns';

export function CampaignTable({
  view,
  items,
  total,
  page,
  limit,
  loading,
  error,
  empty = '暂无广告',
  emptyAction,
  onPage,
}: {
  view: CampaignView;
  items: Campaign[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  empty?: string;
  emptyAction?: ReactNode;
  onPage: (page: number) => void;
}) {
  const router = useRouter();

  // 空态带 CTA：仅在确定为空（非加载/非错误）时展示，避免盖住骨架与错误文案
  if (!loading && !error && items.length === 0 && emptyAction) {
    return (
      <Card>
        <EmptyState icon={Megaphone} text={empty} action={emptyAction} />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card flush>
        <DataTable<Campaign>
          columns={campaignColumns(view)}
          rows={items}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          empty={empty}
          onRowClick={(c) => router.push(`/ads/${c.id}`)}
        />
      </Card>
      <Pager page={page} limit={limit} total={total} onPage={onPage} />
    </div>
  );
}
