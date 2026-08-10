'use client';

/**
 * 详情页头（USRD-1）：昵称/email + 状态与认证徽标 + 封禁/解封、重置匹配操作。
 * 与列表行操作共用 UserActionDialogs（同一套 api 函数）。
 */
import { Ban, CheckCircle2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { USER_STATUS, VERIFICATION_STATUS } from '@/lib/labels';
import { useModal } from '@/hooks/useModal';
import type { AdminUserDetail } from '@/lib/types';
import { UserResetConfirm, UserStatusConfirm } from './UserActionDialogs';

export function UserDetailHeader({
  user,
  onChanged,
}: {
  user: AdminUserDetail;
  onChanged: () => Promise<void> | void;
}) {
  const banModal = useModal();
  const resetModal = useModal();
  // 与后端 resetUserMode 能力对齐：临时对话（matched/confirming）同样可重置（→过期）
  const hasRelationship = user.modeStates.some((m) =>
    ['matched', 'confirming', 'relationship'].includes(m.matchState),
  );
  const banning = user.status === 'ACTIVE';

  return (
    <>
      <PageHeader
        caption="USER DETAIL"
        title={user.profile?.nickname ?? user.email}
        sub={user.email}
        actions={
          <>
            <StatusBadge meta={USER_STATUS} value={user.status} />
            <StatusBadge meta={VERIFICATION_STATUS} value={user.verificationStatus} />
            {hasRelationship && (
              <Button size="sm" onClick={resetModal.openEmpty}>
                <RefreshCw size={14} /> 重置匹配状态
              </Button>
            )}
            <Button size="sm" variant={banning ? 'danger' : 'primary'} onClick={banModal.openEmpty}>
              {banning ? (
                <>
                  <Ban size={14} /> 封禁
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> 解封
                </>
              )}
            </Button>
          </>
        }
      />
      {banModal.open && (
        <UserStatusConfirm
          userId={user.id}
          email={user.email}
          status={user.status}
          onDone={onChanged}
          onClose={banModal.close}
        />
      )}
      {resetModal.open && (
        <UserResetConfirm
          userId={user.id}
          display={user.profile?.nickname ?? user.email}
          onDone={onChanged}
          onClose={resetModal.close}
        />
      )}
    </>
  );
}
