'use client';

/**
 * /square-post — 官方发帖（SQP-1..6）：广告商侧栏直达，团队/学生会经广场管理页头按钮进入。
 * SUPER 可达该 URL 但无发帖权限（后端 canPublishOfficial 403）→ 页内空态不整页跳转。
 */
import { ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { OfficialPostForm } from '@/components/square/OfficialPostForm';
import { useAdmin } from '@/lib/auth-context';

export default function SquarePostPage() {
  const { admin } = useAdmin();
  const role = admin?.role;
  const canPublish =
    !!admin?.isActive && (role === 'TEAM' || role === 'STUDENT_UNION' || role === 'SPONSOR');

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader caption="SQUARE POST" title="官方发帖" sub="以官方身份发布到广场推荐流或校园墙" />
      {admin && canPublish ? (
        <OfficialPostForm admin={admin} />
      ) : (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            text="该账号暂无官方发帖权限：需要学生会 / 平台团队 / 广告商角色且账号处于启用状态"
          />
        </Card>
      )}
    </div>
  );
}
