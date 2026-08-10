'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/form';
import { toastError } from '@/lib/toast';
import { updateSubmission } from '@/lib/api/submissions';
import type { Submission } from '@/lib/types';

/**
 * 标记已联系（SUB-5）：备注选填。
 * ConfirmDialog 的 requireReason 是「必填」语义，覆盖不了选填备注 → 独立小弹窗。
 */
export function ContactModal({
  data,
  onClose,
  onDone,
}: {
  data: Submission;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const trimmed = note.trim();
      // note 缺省 → 后端保留原备注，不发空串去清空
      await updateSubmission(data.id, { status: 'CONTACTED', ...(trimmed ? { note: trimmed } : {}) });
      toast.success('已标记为已联系');
      onDone();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="标记已联系"
      caption="Mark Contacted"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>
            确认标记
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <p className="text-sm text-on-surface-variant leading-relaxed">
          标记后状态变为「已联系」。
          <span className="block mt-1 font-mono text-xs text-on-surface truncate">
            {data.organization ? `${data.organization} · ` : ''}
            {data.email}
          </span>
        </p>
        <Field label="备注" hint="选填，如联系方式 / 沟通结论">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填" />
        </Field>
      </div>
    </Modal>
  );
}
