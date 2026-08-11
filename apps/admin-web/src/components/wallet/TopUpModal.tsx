'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';
import { Energy } from '@/components/ui/Energy';
import { topupWallet } from '@/lib/api/wallet';
import { yuanToCents } from '@/lib/format';
import { toastError } from '@/lib/toast';

/**
 * 充值弹窗：元输入 → 实时换算到账能量 → mock 支付即时到账。
 * clientToken 在挂载时生成一次（键控挂载 = 每次打开新 UUID）：
 * 同一次打开内的连点/重试幂等不重复入账，重新打开则是新一笔。
 */
export function TopUpModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [yuan, setYuan] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientToken] = useState(() => crypto.randomUUID());

  const cents = yuanToCents(yuan);
  // 后端下限：至少 100 能量（1 元）
  const valid = cents !== null && cents >= 100;

  const submit = async () => {
    if (cents === null || !valid) return;
    setBusy(true);
    try {
      await topupWallet({ amountCents: cents, clientToken });
      toast.success('充值成功，能量已到账');
      onDone();
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="充值能量"
      caption="TOP UP"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!valid}>
            模拟支付
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="充值金额（元）" required hint="1 元 = 100 能量，最低充值 1 元">
          <Input
            type="number"
            min={1}
            step="0.01"
            autoFocus
            placeholder="100"
            value={yuan}
            onChange={(e) => setYuan(e.target.value)}
          />
        </Field>
        <div className="rounded-lg bg-surface-low px-4 py-3 text-sm text-on-surface">
          {valid ? (
            <>
              将到账 <Energy value={cents} className="font-bold" />
            </>
          ) : (
            <span className="text-on-surface-variant">输入金额后显示到账能量</span>
          )}
        </div>
        <p className="text-xs text-on-surface-variant">
          当前为模拟支付通道：点击「模拟支付」即时到账，不产生真实扣款。
        </p>
      </div>
    </Modal>
  );
}
