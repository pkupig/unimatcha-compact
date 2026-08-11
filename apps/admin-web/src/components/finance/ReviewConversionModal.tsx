'use client';

/** FIN-7 兑换审批弹窗（镜像 ReviewWithdrawalModal）：摘要框 + 备注（驳回必填、通过选填） */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { reviewConversion } from '@/lib/api/finance';
import { toastError } from '@/lib/toast';
import type { SchoolConversionRequest } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/form';
import { Money } from '@/components/ui/Money';
import { Energy } from '@/components/ui/Energy';

export function ReviewConversionModal({
  conversion,
  approve,
  onClose,
  onDone,
}: {
  conversion: SchoolConversionRequest;
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
      await reviewConversion(conversion.id, { approve, note: note.trim() || undefined });
      toast.success(approve ? '已通过，能量已扣减、赞助费已入账' : '已驳回，冻结能量已释放');
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
      title={approve ? '通过兑换申请' : '驳回兑换申请'}
      caption="CONVERSION REVIEW"
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
            <span className="font-medium text-on-surface">{conversion.school.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">兑换能量</span>
            <Energy value={conversion.amountCents} className="font-bold" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">折合赞助费</span>
            <Money cents={conversion.amountCents} className="font-bold" />
          </div>
        </div>
        <p className="text-xs text-on-surface-variant">
          {approve
            ? '通过后学校能量余额等额扣减，赞助费（现金）账户等额入账，此操作不可逆。'
            : '驳回后冻结的能量立即释放回学校可用余额。'}
        </p>
        <Field label="审批备注" required={!approve}>
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
