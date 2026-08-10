'use client';

import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Field, Textarea } from './form';
import { toastError } from '@/lib/toast';

/**
 * 确认弹窗（覆盖 下架/驳回/取消活动 等全部确认流）：
 * requireReason 时理由必填；onConfirm 抛错自动 toast 并保持打开。
 */
export function ConfirmDialog({
  title,
  message,
  danger = false,
  requireReason = false,
  reasonLabel = '理由',
  confirmText = '确认',
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  confirmText?: string;
  onConfirm: (reason?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (requireReason && !reason.trim()) {
      toastError(new Error(), `请填写${reasonLabel}`);
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim() || undefined);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => void submit()}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-sm text-on-surface-variant space-y-3 pb-2">
        <div>{message}</div>
        {requireReason && (
          <Field label={reasonLabel}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`请填写${reasonLabel}（必填）`} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
