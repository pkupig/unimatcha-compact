'use client';

/** FIN-3 提现审核弹窗：摘要框 + 备注（驳回必填、通过选填） */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { reviewWithdrawal } from '@/lib/api/finance';
import { toastError } from '@/lib/toast';
import type { WithdrawalRequest } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/form';
import { Money } from '@/components/ui/Money';
import { BankSnapshotText } from './shared';

export function ReviewWithdrawalModal({
  withdrawal,
  approve,
  onClose,
  onDone,
}: {
  withdrawal: WithdrawalRequest;
  approve: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    // 驳回必须留痕；通过选填
    if (!approve && !note.trim()) {
      toastError(new Error(), '请填写驳回原因');
      return;
    }
    setBusy(true);
    try {
      await reviewWithdrawal(withdrawal.id, { approve, note: note.trim() || undefined });
      toast.success(approve ? '已通过，等待线下打款' : '已驳回，冻结金额已释放');
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
      title={approve ? '通过提现申请' : '驳回提现申请'}
      caption="WITHDRAWAL REVIEW"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            size="sm"
            variant={approve ? 'primary' : 'danger'}
            loading={busy}
            onClick={() => void submit()}
          >
            {approve ? '确认通过' : '确认驳回'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">学校</span>
            <span className="font-medium text-on-surface">{withdrawal.school.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">金额</span>
            <Money cents={withdrawal.amountCents} className="font-bold" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">收款账户</span>
            <BankSnapshotText snapshot={withdrawal.bankSnapshot} />
          </div>
        </div>
        <Field label="审核备注" required={!approve}>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={approve ? '选填，例如：核对无误' : '必填，请说明驳回原因'}
          />
        </Field>
      </div>
    </Modal>
  );
}
