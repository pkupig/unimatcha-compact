'use client';

/**
 * /ads/new — 商家创建/编辑广告（ADSN-1..8）。
 * 路由守卫由全局 Guard 处理（该路径仅 SPONSOR 可达）；?id= 编辑模式在表单内解析，
 * 故包 Suspense（useSearchParams）。
 */
import { Suspense } from 'react';
import { CampaignForm } from '@/components/ads/CampaignForm';

export default function NewAdPage() {
  return (
    <Suspense fallback={null}>
      <CampaignForm />
    </Suspense>
  );
}
