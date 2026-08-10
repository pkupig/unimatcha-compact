'use client';

/** 驳回投票弹窗（MOD-8）：备注选填（≤200，随通知下发给作者），故不用 ConfirmDialog 的必填理由 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/form';
import { reviewPoll } from '@/lib/api/moderation';
import { toastError } from '@/lib/toast';
import type { AdminPollPost } from '@/lib/types';

export function RejectPollModal({
  poll,
  onClose,
  onDone,
}: {
  poll: AdminPollPost;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await reviewPoll(poll.id, { action: 'reject', note: note.trim() || undefined });
      toast.success('投票已驳回');
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
      title="驳回投票"
      caption="REJECT POLL"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" variant="danger" loading={busy} onClick={() => void submit()}>
            确认驳回
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <p className="text-sm text-on-surface-variant leading-relaxed">
          驳回后该投票不会展示给用户，作者将收到通知。
          <span className="block mt-1 text-on-surface font-medium truncate">
            「{poll.title || poll.content.slice(0, 30)}」
          </span>
        </p>
        <Field label="驳回备注" hint="选填，将随通知展示给作者">
          <Textarea
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：含不当内容 / 与校园无关"
          />
        </Field>
      </div>
    </Modal>
  );
}
