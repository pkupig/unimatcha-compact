'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';
import { createSchool } from '@/lib/api/schools';
import { toastError } from '@/lib/toast';

const FORM_ID = 'create-school-form';

/** 新建学校弹窗（SCH-3）：name 必填（须与用户资料学校名精确一致）；city 选填 */
export function CreateSchoolModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // 校验先行（提交态之前），避免早退把按钮卡在禁用态
    if (!name.trim()) {
      setNameError('请填写学校名称');
      return;
    }
    setSaving(true);
    try {
      await createSchool({ name: name.trim(), city: city.trim() || null });
      toast.success('学校已创建');
      onDone();
      onClose();
    } catch (err) {
      toastError(err);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="新建学校"
      caption="NEW SCHOOL"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          {/* 页面级 cta 已被「新建学校」占用，弹窗内主行动用 primary */}
          <Button variant="primary" type="submit" form={FORM_ID} loading={saving}>
            创建
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4 pb-2">
        <Field
          label="学校名称"
          required
          error={nameError}
          hint="须唯一，且与用户资料中的学校名精确一致（据此匹配本校用户）"
        >
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            placeholder="例如 University of Warwick"
            autoFocus
          />
        </Field>
        <Field label="城市">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="例如 Coventry" />
        </Field>
      </form>
    </Modal>
  );
}
