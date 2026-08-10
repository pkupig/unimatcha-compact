'use client';

/**
 * /feedback — 用户反馈（MOD-9，SUPER/TEAM）：
 * 原 moderation 第 4 tab 拆成独立页；路由角色限制由全局 Guard + permissions.NAV 处理。
 */
import { PageHeader } from '@/components/ui/PageHeader';
import { FeedbackPanel } from '@/components/feedback/FeedbackPanel';

export default function FeedbackPage() {
  return (
    <>
      <PageHeader caption="FEEDBACK" title="用户反馈" sub="应用内提交的问题反馈与举报（Report）" />
      <FeedbackPanel />
    </>
  );
}
