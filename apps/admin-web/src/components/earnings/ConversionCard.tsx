'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Energy } from '@/components/ui/Energy';
import { Field, Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { useModal } from '@/hooks/useModal';
import { createConversion } from '@/lib/api/earnings';
import { toastError } from '@/lib/toast';

/**
 * 兑换段：发起兑换卡（能量 → 赞助费，1 能量 = ¥0.01）。
 * 提交后 PENDING 冻结等额能量，平台审批通过才入赞助费账户；
 * 表单放弹窗内，成功后由父层连带刷新能量概要与兑换记录。
 */
export function ConversionCard({
  balanceCents,
  onDone,
}: {
  /** 可兑换能量 = 能量可用余额（已扣在途兑换冻结） */
  balanceCents: number;
  onDone: () => void;
}) {
  const m = useModal();

  return (
    <Card caption="CONVERT" title="兑换赞助费">
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          将能量按 1:1 兑换为赞助费（100 能量 = ¥1.00），平台审批通过后入账赞助费余额，方可提现。
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">可兑换能量</span>
          <Energy value={balanceCents} className="font-bold" />
        </div>
        <Button
          variant="primary"
          className="w-full"
          disabled={balanceCents <= 0}
          onClick={m.openEmpty}
        >
          发起兑换
        </Button>
        <p className="text-xs text-outline">
          提交后等额能量将被冻结，等待平台审批；驳回时冻结能量立即释放。
        </p>
      </div>

      {m.open && <ConvertModal balanceCents={balanceCents} onClose={m.close} onDone={onDone} />}
    </Card>
  );
}

/** 发起兑换弹窗：能量整数输入 ≤ 可用 + 实时折算提示 */
function ConvertModal({
  balanceCents,
  onClose,
  onDone,
}: {
  balanceCents: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);

  // 能量只收正整数（数值 ≡ 分值，无小数语义）
  const amount = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
  const valid = amount !== null && amount > 0;
  const over = valid && amount > balanceCents;

  const submit = async () => {
    if (amount === null || !valid || over) return;
    setBusy(true);
    try {
      await createConversion({ amountCents: amount });
      toast.success('兑换申请已提交，等待平台审批');
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
      title="发起能量兑换"
      caption="CONVERT"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            disabled={!valid || over}
            onClick={() => void submit()}
          >
            确认提交
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field
          label="兑换能量数"
          required
          hint={
            <>
              可兑换 <Energy value={balanceCents} />
              {over && <span className="text-neon-pink ml-2">超出可用能量余额</span>}
            </>
          }
        >
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="font-mono"
            placeholder="0"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </Field>
        {valid && !over && (
          <div className="rounded-lg bg-surface-low p-3 text-sm text-on-surface">
            <Energy value={amount} className="font-bold" /> ={' '}
            <Money cents={amount} className="font-bold" /> 赞助费
          </div>
        )}
        <p className="text-xs text-on-surface-variant">
          提交后等额能量冻结，平台审批通过后入账赞助费余额；审批前可联系平台团队撤回。
        </p>
      </div>
    </Modal>
  );
}
