'use client';

/**
 * 停用/启用确认（ACC-6）：统一走 updateAdminUser(id,{isActive})——
 * 旧 accounts 页停用调 DELETE 的口径已废弃（本次重写明确修正点）。
 * 停用为 danger 且文案说明「进行中的广告不受影响」。
 */
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { updateAdminUser } from '@/lib/api/accounts';
import { accountDisplayName } from './columns';
import type { AdminAccount } from '@/lib/types';

export function ToggleActiveDialog({
  row,
  onDone,
  onClose,
}: {
  row: AdminAccount;
  onDone: () => Promise<void> | void;
  onClose: () => void;
}) {
  const name = accountDisplayName(row);
  return (
    <ConfirmDialog
      title={row.isActive ? '停用账号' : '启用账号'}
      danger={row.isActive}
      confirmText={row.isActive ? '停用' : '启用'}
      message={
        row.isActive
          ? `停用后「${name}」将无法登录后台，进行中的广告不受影响；可随时重新启用。`
          : `确认重新启用「${name}」？启用后即可正常登录。`
      }
      onConfirm={async () => {
        await updateAdminUser(row.id, { isActive: !row.isActive });
        toast.success(row.isActive ? '账号已停用' : '账号已启用');
        await onDone();
      }}
      onClose={onClose}
    />
  );
}
