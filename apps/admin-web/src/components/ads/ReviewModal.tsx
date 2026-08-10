'use client';

/**
 * 操作确认弹窗（ADSD-2）：reject/suspend 理由必填、无备注操作 → ConfirmDialog；
 * approve/confirm-payment 备注选填 → 本地 Modal 变体（ConfirmDialog 不支持选填输入）。
 * 自拉单审核时附「分成按本校自拉档计算」提示（ADSD-3）。
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/form';
import { toastError } from '@/lib/toast';
import type { Campaign } from '@/lib/types';
import { ACTION_CONFIGS, runCampaignAction, type CampaignAction } from './campaignActions';

export function ReviewModal({
  campaign,
  action,
  onClose,
  onDone,
}: {
  campaign: Campaign;
  action: CampaignAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const cfg = ACTION_CONFIGS[action];
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // 审核自拉单：提醒分成档位
  const selfSourcedHint =
    !!campaign.sourcedBySchoolId && (action === 'approve' || action === 'reject');
  const message = (
    <div className="space-y-2">
      {cfg.desc && <p>{cfg.desc}</p>}
      {selfSourcedHint && (
        <p className="text-xs">
          <Badge variant="neon" className="mr-1.5">自拉赞助</Badge>
          分成按本校自拉档计算
        </p>
      )}
    </div>
  );

  const run = async (reason?: string) => {
    await runCampaignAction(campaign, action, reason);
    toast.success(`${cfg.title}成功`);
    onDone();
  };

  // 无备注 / 理由必填：直接走地基 ConfirmDialog（抛错自动 toast 并保持打开）
  if (cfg.note !== 'optional') {
    return (
      <ConfirmDialog
        title={cfg.title}
        message={message}
        danger={cfg.danger}
        requireReason={cfg.note === 'required'}
        reasonLabel={cfg.noteLabel}
        confirmText={cfg.confirmText}
        onConfirm={run}
        onClose={onClose}
      />
    );
  }

  // 备注选填变体
  const submit = async () => {
    setBusy(true);
    try {
      await run(note.trim() || undefined);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={cfg.title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>
            {cfg.confirmText}
          </Button>
        </>
      }
    >
      <div className="text-sm text-on-surface-variant space-y-3 pb-2">
        {message}
        <Field label={`${cfg.noteLabel ?? '备注'}（选填）`}>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="选填"
          />
        </Field>
      </div>
    </Modal>
  );
}
