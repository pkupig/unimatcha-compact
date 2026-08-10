'use client';

/**
 * USRD-3 认证材料卡：schoolEmail + 学生证链接 + 认证状态即改下拉
 * （详情页做认证操作与列表同一套 API，经共用的 VerificationSelect）。
 */
import { Card } from '@/components/ui/Card';
import type { AdminUserDetail } from '@/lib/types';
import { VerificationSelect } from './VerificationSelect';

export function UserVerificationCard({
  user,
  onChanged,
}: {
  user: AdminUserDetail;
  onChanged: () => Promise<void> | void;
}) {
  return (
    <Card caption="VERIFICATION" title="认证材料">
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs text-outline">认证状态</span>
          <VerificationSelect userId={user.id} value={user.verificationStatus} onDone={onChanged} />
        </div>
        {user.schoolEmail && (
          <div>
            <span className="text-xs text-outline">学校邮箱：</span>
            <span className="text-on-surface">{user.schoolEmail}</span>
          </div>
        )}
        {user.studentCardUrl ? (
          <a
            href={user.studentCardUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-ink underline underline-offset-2 hover:text-neon-pink"
          >
            查看学生证
          </a>
        ) : (
          <p className="text-xs text-outline">未上传学生证</p>
        )}
      </div>
    </Card>
  );
}
