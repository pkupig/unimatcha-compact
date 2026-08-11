'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input } from '@/components/ui/form';
import { Money } from '@/components/ui/Money';
import { useModal } from '@/hooks/useModal';
import { createWithdrawal, type SchoolBankInfo } from '@/lib/api/earnings';
import { yuanToCents } from '@/lib/format';

/**
 * 提现段：申请提现卡（从赞助费余额提现，能量须先兑换入账才可提）。
 * 元输入实时换算（yuanToCents）+ 赞助费余额提示与超额内联警告；
 * 未绑卡整卡禁用；确认弹窗展示打款卡尾号；成功后重置输入并通知父层刷新两表。
 */
export function WithdrawCard({
  cashBalanceCents,
  bank,
  bound,
  onDone,
}: {
  /** 赞助费现金可用余额（已扣在途提现冻结） */
  cashBalanceCents: number;
  bank: SchoolBankInfo | null;
  /** 已绑卡（由父层按 hasBankAccount 口径计算） */
  bound: boolean;
  onDone: () => void;
}) {
  const [amountYuan, setAmountYuan] = useState('');
  const confirm = useModal();

  const amountCents = yuanToCents(amountYuan);
  const valid = amountCents !== null && amountCents > 0;
  const over = valid && amountCents > cashBalanceCents;

  const submit = async () => {
    if (amountCents === null) return;
    // 抛错由 ConfirmDialog 统一 toastError 并保持弹窗打开
    await createWithdrawal({ amountCents });
    toast.success('提现申请已提交，等待平台审核');
    setAmountYuan('');
    onDone();
  };

  const tail = bank?.bankAccountNo ? bank.bankAccountNo.slice(-4) : '-';

  return (
    <Card caption="WITHDRAW" title="申请提现">
      <div className="space-y-4">
        <Field
          label="提现金额（元）"
          required
          hint={
            <>
              赞助费余额 <Money cents={cashBalanceCents} />
              {over && <span className="text-neon-pink ml-2">超出赞助费余额</span>}
            </>
          }
        >
          <Input
            type="number"
            min={0.01}
            step={0.01}
            inputMode="decimal"
            className="font-mono"
            placeholder="0.00"
            value={amountYuan}
            onChange={(e) => setAmountYuan(e.target.value)}
            disabled={!bound}
          />
        </Field>
        <Button
          variant="cta"
          className="w-full"
          disabled={!bound || !valid || over}
          onClick={confirm.openEmpty}
        >
          提交提现申请
        </Button>
        {!bound && <p className="text-xs text-neon-pink">请先绑定银行账户后再申请提现。</p>}
        <p className="text-xs text-outline">
          从赞助费余额提现（能量须先兑换入账）；提交后由平台团队审核，通过后线下打款，审核期间金额冻结。
        </p>
      </div>

      {confirm.open && (
        <ConfirmDialog
          title="确认提现"
          message={
            <>
              确认申请提现 <Money cents={amountCents ?? 0} className="font-bold text-on-surface" /> 至{' '}
              {bank?.bankName ?? '-'}（尾号 {tail}）？提交后金额将被冻结，等待平台审核。
            </>
          }
          confirmText="确认提交"
          onConfirm={submit}
          onClose={confirm.close}
        />
      )}
    </Card>
  );
}
