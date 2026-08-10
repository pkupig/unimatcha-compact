'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Landmark, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/form';
import { useModal } from '@/hooks/useModal';
import { updateSchoolBank } from '@/lib/api/schools';
import { toastError } from '@/lib/toast';
import type { School } from '@/lib/types';

const FORM_ID = 'school-bank-form';

/** 银行账户卡（SCHD-6）：只读展示 / 空态 + 「代为修改」弹窗（走 updateSchoolBank） */
export function SchoolBankCard({
  school,
  onSaved,
}: {
  school: School;
  onSaved: (updated: School) => void;
}) {
  const modal = useModal();
  const hasBank = Boolean(school.bankAccountName || school.bankName || school.bankAccountNo);

  return (
    <Card
      caption="BANK ACCOUNT"
      title="银行账户"
      actions={
        <Button variant="secondary" size="sm" onClick={modal.openEmpty}>
          <Pencil size={14} />
          代为修改
        </Button>
      }
    >
      {hasBank ? (
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="caption">户名</dt>
            <dd className="text-on-surface font-semibold">{school.bankAccountName || '-'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="caption">开户行</dt>
            <dd className="text-on-surface">{school.bankName || '-'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="caption">账号</dt>
            <dd className="font-mono text-on-surface">{school.bankAccountNo || '-'}</dd>
          </div>
        </dl>
      ) : (
        <EmptyState icon={Landmark} text="尚未绑定银行账户（学生会可在收益提现页自助绑定）" />
      )}
      {modal.open && (
        <BankModal
          school={school}
          onClose={modal.close}
          onSaved={(s) => {
            onSaved(s);
            modal.close();
          }}
        />
      )}
    </Card>
  );
}

/** 代改弹窗：户名/开户行/账号三项必填 */
function BankModal({
  school,
  onClose,
  onSaved,
}: {
  school: School;
  onClose: () => void;
  onSaved: (updated: School) => void;
}) {
  const [bankAccountName, setBankAccountName] = useState(school.bankAccountName ?? '');
  const [bankName, setBankName] = useState(school.bankName ?? '');
  const [bankAccountNo, setBankAccountNo] = useState(school.bankAccountNo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // 校验先行（三项均必填），避免早退卡提交态
    if (!bankAccountName.trim() || !bankName.trim() || !bankAccountNo.trim()) {
      setError('请完整填写户名 / 开户行 / 账号');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updateSchoolBank(school.id, {
        bankAccountName: bankAccountName.trim(),
        bankName: bankName.trim(),
        bankAccountNo: bankAccountNo.trim(),
      });
      toast.success('银行账户已更新');
      onSaved(updated);
    } catch (err) {
      toastError(err);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="修改银行账户"
      caption="BANK ACCOUNT"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={saving}>
            保存
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4 pb-2">
        <Field label="户名" required error={error}>
          <Input
            value={bankAccountName}
            onChange={(e) => setBankAccountName(e.target.value)}
            placeholder="例如 Warwick Students Union"
            autoFocus
          />
        </Field>
        <Field label="开户行" required>
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="例如 HSBC" />
        </Field>
        <Field label="银行账号" required>
          <Input
            className="font-mono"
            value={bankAccountNo}
            onChange={(e) => setBankAccountNo(e.target.value)}
            placeholder="账号数字"
          />
        </Field>
      </form>
    </Modal>
  );
}
