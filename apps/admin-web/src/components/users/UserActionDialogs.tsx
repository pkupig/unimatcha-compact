'use client';

/**
 * 封禁/解封 与 重置匹配状态 两个确认弹窗（USR-6，列表行操作与详情页头共用一套 API）。
 * ConfirmDialog 内建「onConfirm 抛错自动 toast 并保持打开」，这里只管成功提示与回刷。
 */
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { resetUserMode, updateUserStatus } from '@/lib/api/users';
import type { UserStatus } from '@/lib/types';

export function UserStatusConfirm({
  userId,
  email,
  status,
  onDone,
  onClose,
}: {
  userId: string;
  email: string;
  /** 当前状态：ACTIVE → 弹「封禁」，BANNED → 弹「解封」 */
  status: UserStatus;
  onDone: () => Promise<void> | void;
  onClose: () => void;
}) {
  const banning = status === 'ACTIVE';
  return (
    <ConfirmDialog
      title={banning ? '封禁用户' : '解封用户'}
      danger={banning}
      confirmText={banning ? '确认封禁' : '确认解封'}
      message={
        <>
          确定要{banning ? '封禁' : '解封'}用户{' '}
          <span className="font-medium text-on-surface">{email}</span> 吗？
          {banning && '封禁后该用户将无法登录。'}
        </>
      }
      onConfirm={async () => {
        await updateUserStatus(userId, banning ? 'BANNED' : 'ACTIVE');
        toast.success(banning ? '用户已封禁' : '用户已解封');
        await onDone();
      }}
      onClose={onClose}
    />
  );
}

export function UserResetConfirm({
  userId,
  display,
  onDone,
  onClose,
}: {
  userId: string;
  /** 展示名（昵称，缺省邮箱） */
  display: string;
  onDone: () => Promise<void> | void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="重置匹配状态"
      danger
      confirmText="确认重置"
      message={
        <>
          确定要重置 <span className="font-medium text-on-surface">{display}</span>{' '}
          的匹配状态吗？临时对话将标记过期、已确认关系将解除，双方相应模式回到空闲。
        </>
      }
      onConfirm={async () => {
        await resetUserMode(userId);
        toast.success('匹配状态已重置');
        await onDone();
      }}
      onClose={onClose}
    />
  );
}
