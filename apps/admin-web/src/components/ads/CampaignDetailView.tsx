'use client';

/**
 * 广告详情视图（ADSD-1..8 的装配层）：加载详情 + 日序列，
 * 头部（状态/计价/档期/广告商/来源）+ 操作栏 + 素材/数据/时间线 + 金额/投放学校 + 操作弹窗。
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Megaphone } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useModal } from '@/hooks/useModal';
import { getCampaign, getCampaignStats } from '@/lib/api/ads';
import { useAdmin } from '@/lib/auth-context';
import { isSponsor } from '@/lib/auth';
import { CAMPAIGN_STATUS, PRICING_MODEL, labelOf } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { CampaignDailyStat, CampaignDetail } from '@/lib/types';
import { SourceBadge } from './campaignColumns';
import { CampaignActionBar } from './CampaignActionBar';
import { CampaignLifecycle } from './CampaignLifecycle';
import { CampaignStatsChart } from './CampaignStatsChart';
import { AmountCard, CreativeCard, PlacementsCard } from './CampaignDetailPanels';
import { ReviewModal } from './ReviewModal';
import type { CampaignAction } from './campaignActions';

export function CampaignDetailView({ id }: { id: string }) {
  const { admin } = useAdmin();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [series, setSeries] = useState<CampaignDailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const actionModal = useModal<CampaignAction>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getCampaign(id);
      setCampaign(c);
      // 日序列失败不阻塞详情（图表回退 campaign 聚合值）
      getCampaignStats(id)
        .then((r) => setSeries(r.items))
        .catch(() => undefined);
    } catch (e) {
      // 首载失败（404/403/网络）→ 下方空态；操作后的刷新失败则保留已展示的详情，只 toast
      toastError(e, '加载广告详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !campaign) {
    return (
      <>
        <div className="h-8 w-64 rounded-lg bg-surface-high animate-pulse" />
        <div className="card h-40 animate-pulse" />
        <div className="card h-64 animate-pulse" />
      </>
    );
  }

  if (!campaign) {
    return (
      <Card>
        <EmptyState
          icon={Megaphone}
          text="广告不存在或无权查看"
          action={
            <Link href="/ads" className="btn-secondary btn-sm">
              <ArrowLeft size={14} />
              返回列表
            </Link>
          }
        />
      </Card>
    );
  }

  const isOwner = !!admin && isSponsor(admin.role) && campaign.advertiserId === admin.id;

  return (
    <>
      <PageHeader
        caption="CAMPAIGN DETAIL"
        title={campaign.title}
        sub={
          <span className="inline-flex items-center gap-x-3 gap-y-1 flex-wrap">
            <StatusBadge meta={CAMPAIGN_STATUS} value={campaign.status} />
            <span>{labelOf(PRICING_MODEL, campaign.pricingModel)}</span>
            <span className="font-mono text-xs">
              {formatDate(campaign.startDate)} ~ {formatDate(campaign.endDate)}
            </span>
            <span>{campaign.advertiser.organizationName ?? campaign.advertiser.name}</span>
            <SourceBadge campaign={campaign} />
          </span>
        }
        actions={
          <Link href="/ads" className="btn-secondary btn-sm">
            <ArrowLeft size={14} />
            返回列表
          </Link>
        }
      />

      <CampaignActionBar
        campaign={campaign}
        role={admin?.role ?? null}
        isOwner={isOwner}
        onAction={actionModal.openWith}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-5">
          <CreativeCard campaign={campaign} />
          <CampaignStatsChart campaign={campaign} series={series} />
          <CampaignLifecycle campaign={campaign} />
        </div>
        <div className="space-y-5">
          <AmountCard campaign={campaign} />
          <PlacementsCard campaign={campaign} />
        </div>
      </div>

      {actionModal.open && actionModal.data && (
        <ReviewModal
          campaign={campaign}
          action={actionModal.data}
          onClose={actionModal.close}
          onDone={() => void load()}
        />
      )}
    </>
  );
}
