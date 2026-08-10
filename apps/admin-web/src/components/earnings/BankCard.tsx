'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/form';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/lib/toast';
import { updateSchoolBank } from '@/lib/api/schools';
import type { SchoolBankInfo } from '@/lib/api/earnings';

/** 三项齐全才算已绑卡（与后端提现前置校验同口径） */
export function hasBankAccount(bank: SchoolBankInfo | null): boolean {
  return !!(bank?.bankAccountName && bank?.bankName && bank?.bankAccountNo);
}

/**
 * EARN-3：银行账户卡。
 * 展示态（已绑卡）↔ 表单态（未绑卡 / 点「修改」）；
 * 草稿在进入编辑时从展示态播种，取消即丢弃草稿还原。
 */
export function BankCard({
  bank,
  loading,
  onSaved,
}: {
  bank: SchoolBankInfo | null;
  loading: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [saving, setSaving] = useState(false);

  const bound = hasBankAccount(bank);
  const showForm = editing || (!loading && !bound);

  const startEdit = () => {
    setAccountName(bank?.bankAccountName ?? '');
    setBankName(bank?.bankName ?? '');
    setAccountNo(bank?.bankAccountNo ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (!bank) return; // 学校信息加载失败时无 id 可提交（保存键已禁用，此处兜底）
    if (!accountName.trim() || !bankName.trim() || !accountNo.trim()) {
      toastError(new Error(), '请完整填写户名、开户银行与卡号');
      return;
    }
    setSaving(true);
    try {
      await updateSchoolBank(bank.id, {
        bankAccountName: accountName.trim(),
        bankName: bankName.trim(),
        bankAccountNo: accountNo.trim(),
      });
      toast.success('银行账户已保存');
      setEditing(false);
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      caption="BANK ACCOUNT"
      title="银行账户"
      actions={
        bound && !editing ? (
          <Button size="sm" onClick={startEdit}>
            修改
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner />
        </div>
      ) : showForm ? (
        <div className="space-y-4">
          <Field label="户名" required>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="对公账户户名"
            />
          </Field>
          <Field label="开户银行" required>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="例如：中国银行"
            />
          </Field>
          <Field label="卡号" required>
            <Input
              className="font-mono"
              value={accountNo}
              onChange={(e) => setAccountNo(e.target.value)}
              placeholder="银行卡 / 对公账号"
            />
          </Field>
          <div className="flex justify-end gap-2">
            {editing && (
              <Button size="sm" disabled={saving} onClick={() => setEditing(false)}>
                取消
              </Button>
            )}
            <Button size="sm" variant="primary" loading={saving} disabled={!bank} onClick={() => void save()}>
              保存银行账户
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">户名</span>
            <span className="font-medium text-on-surface">{bank?.bankAccountName ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">开户银行</span>
            <span className="font-medium text-on-surface">{bank?.bankName ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">卡号</span>
            <span className="font-mono text-on-surface">{bank?.bankAccountNo ?? '-'}</span>
          </div>
          <p className="text-xs text-outline pt-1">
            提现申请时会对当前银行信息做快照，之后修改不影响已提交的申请。
          </p>
        </div>
      )}
    </Card>
  );
}
