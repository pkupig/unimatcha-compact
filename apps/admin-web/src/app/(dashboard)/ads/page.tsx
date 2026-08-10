'use client';

/**
 * /ads — 广告列表（三角色共用路径，页内按角色分支渲染，ADS-P1/U1/T1）。
 * 视图组件读写 URL（?tab= / ?status= 深链），故整页包 Suspense（Next 14 对 useSearchParams 的硬要求）。
 */
import { Suspense } from 'react';
import { useAdmin } from '@/lib/auth-context';
import { isSponsor, isUnion } from '@/lib/auth';
import { SponsorCampaignList } from '@/components/ads/SponsorCampaignList';
import { UnionCampaignList } from '@/components/ads/UnionCampaignList';
import { TeamCampaignList } from '@/components/ads/TeamCampaignList';

function AdsInner() {
  const { admin } = useAdmin();
  if (!admin) return null;
  if (isSponsor(admin.role)) return <SponsorCampaignList />;
  if (isUnion(admin.role)) return <UnionCampaignList />;
  return <TeamCampaignList />;
}

export default function AdsPage() {
  return (
    <Suspense fallback={null}>
      <AdsInner />
    </Suspense>
  );
}
