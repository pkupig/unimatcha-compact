'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/form';
import { Switch } from '@/components/ui/Switch';
import { updateMatchConfig } from '@/lib/api/matching';
import { toastError } from '@/lib/toast';
import type { MatchConfig } from '@/lib/types';

const FORM_ID = 'match-config-form';

/** MAT-1：匹配计划编辑弹窗（cron 必填；非法表达式由后端校验返回中文 400） */
export function MatchConfigModal({
  config,
  onClose,
  onSaved,
}: {
  /** null = 首次创建（后端 PUT 在无配置行时会创建） */
  config: MatchConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cronExpr, setCronExpr] = useState(config?.cronExpr ?? '');
  const [description, setDescription] = useState(config?.description ?? '');
  const [isEnabled, setIsEnabled] = useState(config?.isEnabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // 校验先行（提交态之前），避免早退把按钮卡在禁用态
    const cron = cronExpr.trim();
    if (!cron) {
      setError('请填写 cron 表达式');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // timezone 不在表单内：不传即保留现值（DTO 可选字段）
      await updateMatchConfig({
        cronExpr: cron,
        description: description.trim(),
        isEnabled,
      });
      toast.success('匹配计划已保存');
      onSaved();
    } catch (err) {
      toastError(err);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="编辑匹配计划"
      caption="SCHEDULE"
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
        <Field
          label="Cron 表达式"
          required
          error={error}
          hint={
            <>
              例如 <code className="font-mono">0 20 * * 3</code>（每周三 20:00，时区
              {` ${config?.timezone ?? 'Asia/Shanghai'}`}）
            </>
          }
        >
          <Input
            className="font-mono"
            value={cronExpr}
            onChange={(e) => {
              setCronExpr(e.target.value);
              setError(null);
            }}
            placeholder="0 20 * * 3"
            autoFocus
          />
        </Field>
        <Field label="描述" hint="展示给管理员的计划说明，可留空">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="每周三晚上 20:00 执行匹配"
          />
        </Field>
        <Switch checked={isEnabled} onChange={setIsEnabled} label="启用定时匹配" />
      </form>
    </Modal>
  );
}
