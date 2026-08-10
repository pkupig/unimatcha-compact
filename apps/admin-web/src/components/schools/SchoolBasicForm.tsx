'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';
import { Switch } from '@/components/ui/Switch';
import { updateSchool } from '@/lib/api/schools';
import { toastError } from '@/lib/toast';
import type { School } from '@/lib/types';

/** 基本信息表单（SCHD-3）：name / city / isActive（Switch） */
export function SchoolBasicForm({
  school,
  onSaved,
}: {
  school: School;
  onSaved: (updated: School) => void;
}) {
  const [name, setName] = useState(school.name);
  const [city, setCity] = useState(school.city ?? '');
  const [isActive, setIsActive] = useState(school.isActive);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // 校验先行，避免早退把按钮卡在提交态
    if (!name.trim()) {
      setNameError('请填写学校名称');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSchool(school.id, {
        name: name.trim(),
        city: city.trim() || null,
        isActive,
      });
      toast.success('基本信息已保存');
      onSaved(updated);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card caption="BASIC INFO" title="基本信息">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="学校名称"
          required
          error={nameError}
          hint="须唯一，且与用户资料中的学校名精确一致"
        >
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
        </Field>
        <Field label="城市">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="label mb-0">启用状态</span>
          <Switch checked={isActive} onChange={setIsActive} />
        </div>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" type="submit" loading={saving}>
            保存基本信息
          </Button>
        </div>
      </form>
    </Card>
  );
}
