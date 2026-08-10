'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { QUESTIONNAIRE_TYPE } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import { createQuestionnaireVersion } from '@/lib/api/questionnaire';
import type { QuestionnaireTypeValue } from '@/lib/types';

/** 新建版本弹窗（QST-2）：类型（ROMANTIC/FRIEND）+ 标题 + 简介选填 */
export function CreateVersionModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<QuestionnaireTypeValue>('ROMANTIC');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toastError(new Error(), '请填写版本标题');
      return;
    }
    setBusy(true);
    try {
      await createQuestionnaireVersion({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      toast.success('问卷版本已创建');
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
      title="新建问卷版本"
      caption="New Version"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>创建</Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="问卷类型" required hint="恋爱与朋友是两条独立版本线，各自至多一个激活版本">
          <Select value={type} onChange={(e) => setType(e.target.value as QuestionnaireTypeValue)}>
            {(Object.keys(QUESTIONNAIRE_TYPE.labels) as QuestionnaireTypeValue[]).map((t) => (
              <option key={t} value={t}>{QUESTIONNAIRE_TYPE.labels[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="版本标题" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：校园恋爱问卷 V2"
            autoFocus
          />
        </Field>
        <Field label="简介" hint="选填，仅后台备注用途">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
