'use client';

/**
 * 系统设置（仅 SUPER，路由守卫由全局 Guard 处理）：
 * 广告计价默认值 + 广告分成默认值（各走专用接口）+ SystemConfig 原始 JSON 编辑器。
 */
import { PageHeader } from '@/components/ui/PageHeader';
import { AdPricingCard } from '@/components/settings/AdPricingCard';
import { GlobalShareCard } from '@/components/settings/GlobalShareCard';
import { SystemConfigList } from '@/components/settings/SystemConfigList';

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        caption="System Settings"
        title="系统设置"
        sub="广告计价与分成默认值 · 系统配置原始编辑"
      />
      <AdPricingCard />
      <GlobalShareCard />
      <SystemConfigList />
    </>
  );
}
