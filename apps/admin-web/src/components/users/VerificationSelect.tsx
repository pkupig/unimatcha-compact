'use client';

import { useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Select } from '@/components/ui/form';
import { VERIFICATION_STATUS, labelOf } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import { updateUserVerification } from '@/lib/api/users';
import type { VerificationStatus } from '@/lib/types';

const OPTIONS: VerificationStatus[] = ['unverified', 'pending', 'verified', 'rejected'];

/** 按认证态着色（token only，与 VERIFICATION_STATUS 徽标色系对齐） */
const SELECT_CLS: Record<VerificationStatus, string> = {
  unverified: 'bg-surface-high text-on-surface-variant',
  pending: 'bg-ink text-white',
  verified: 'bg-neon text-black',
  rejected: 'bg-neon-pink/10 text-neon-pink',
};

/** USR-4 认证状态内联下拉：改选即 PATCH（列表单元格与详情认证卡共用） */
export function VerificationSelect({
  userId,
  value,
  onDone,
}: {
  userId: string;
  value: VerificationStatus;
  onDone: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const change = async (next: VerificationStatus) => {
    if (next === value) return;
    setBusy(true);
    try {
      await updateUserVerification(userId, next);
      toast.success(`认证状态已更新为「${labelOf(VERIFICATION_STATUS, next)}」`);
      await onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select
      value={value}
      disabled={busy}
      onChange={(e) => void change(e.target.value as VerificationStatus)}
      className={clsx(
        // 覆盖 .select 的块级样式做紧凑胶囊（utilities 层压过 components 层的 @apply）
        'w-auto border-0 rounded-full px-2.5 py-1 text-xs font-bold focus:ring-0',
        SELECT_CLS[value],
      )}
    >
      {OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {labelOf(VERIFICATION_STATUS, opt)}
        </option>
      ))}
    </Select>
  );
}
