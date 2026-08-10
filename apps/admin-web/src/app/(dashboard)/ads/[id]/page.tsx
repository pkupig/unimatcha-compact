'use client';

/** /ads/[id] — 广告详情（ADSD-1..8，三角色共用，操作矩阵在视图内按角色×状态渲染） */
import { CampaignDetailView } from '@/components/ads/CampaignDetailView';

export default function AdDetailPage({ params }: { params: { id: string } }) {
  return <CampaignDetailView id={params.id} />;
}
