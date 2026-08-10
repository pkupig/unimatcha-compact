'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { QUESTION_TYPE } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import { addQuestion, updateQuestion } from '@/lib/api/questionnaire';
import type { Question, QuestionOptionPayload, QuestionPayload, QuestionTypeValue } from '@/lib/types';

/** label → value：沿用旧后台派生规则（小写 + 空白转下划线），与存量选项 value 风格一致 */
const slugify = (label: string) => label.toLowerCase().replace(/\s+/g, '_');

const CHOICE_TYPES: QuestionTypeValue[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'];

/** 新增（QSTD-2）/ 编辑（QSTD-4）题目弹窗：question 为 null 走 POST，否则预填走 PUT */
export function QuestionFormModal({
  versionId,
  question,
  onClose,
  onDone,
}: {
  versionId: string;
  question: Question | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<QuestionTypeValue>(question?.type ?? 'SINGLE_CHOICE');
  const [title, setTitle] = useState(question?.title ?? '');
  const [description, setDescription] = useState(question?.description ?? '');
  const [group, setGroup] = useState(question?.group ?? '');
  const [isRequired, setIsRequired] = useState(question?.isRequired ?? true);
  const [options, setOptions] = useState<QuestionOptionPayload[]>(
    question && question.options.length > 0
      ? question.options.map((o) => ({ label: o.label, value: o.value, order: o.order }))
      : [{ label: '', value: '', order: 1 }],
  );
  const [busy, setBusy] = useState(false);

  const isChoice = CHOICE_TYPES.includes(type);

  const setOptionLabel = (i: number, label: string) => {
    setOptions((prev) =>
      prev.map((o, j) => (j === i ? { ...o, label, value: slugify(label) } : o)),
    );
  };

  const submit = async () => {
    if (!title.trim()) {
      toastError(new Error(), '请填写题目内容');
      return;
    }
    // 编辑态发空串以清空旧值（undefined 在 Prisma 是 no-op，清不掉）；新建态仍省略空字段
    const payload: QuestionPayload = {
      type,
      title: title.trim(),
      description: question ? description.trim() : description.trim() || undefined,
      isRequired,
      group: question ? group.trim() : group.trim() || undefined,
    };
    if (isChoice) {
      const opts = options
        .filter((o) => o.label.trim())
        .map((o, i) => ({ label: o.label.trim(), value: o.value || slugify(o.label), order: i + 1 }));
      if (opts.length < 2) {
        toastError(new Error(), '选择题至少需要两个选项');
        return;
      }
      payload.options = opts;
    } else if (question) {
      // 编辑时题型改为非选择题：显式传空数组让后端清掉旧选项（options===undefined 则不动）
      payload.options = [];
    }
    setBusy(true);
    try {
      if (question) await updateQuestion(question.id, payload);
      else await addQuestion(versionId, payload);
      toast.success(question ? '题目已更新' : '题目已添加');
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
      title={question ? '编辑题目' : '添加题目'}
      caption={question ? 'Edit Question' : 'New Question'}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>
            {question ? '保存' : '确认添加'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="题型" required>
          <Select value={type} onChange={(e) => setType(e.target.value as QuestionTypeValue)}>
            {(Object.keys(QUESTION_TYPE.labels) as QuestionTypeValue[]).map((t) => (
              <option key={t} value={t}>{QUESTION_TYPE.labels[t]}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="题目内容"
          required
          // titleEn 由翻译回填脚本维护、DTO 无此字段，仅提示运营改中文后需同步
          hint={question?.titleEn ? `英文题面：${question.titleEn}（脚本维护，改中文题面后需同步回填）` : undefined}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="说明" hint="选填，展示在题目下方">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Field label="分组" hint="选填，如：性格、恋爱观">
              <Input value={group} onChange={(e) => setGroup(e.target.value)} />
            </Field>
          </div>
          <div className="pb-7">
            <Switch checked={isRequired} onChange={setIsRequired} label="必答题" />
          </div>
        </div>
        {isChoice && (
          <Field label="选项" hint="value 由标签自动派生；至少两项">
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder={`选项 ${i + 1} 标签`}
                    value={opt.label}
                    onChange={(e) => setOptionLabel(i, e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="删除选项"
                    className="p-1.5 rounded-lg text-outline hover:text-neon-pink hover:bg-surface-low transition-colors"
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setOptions((prev) => [...prev, { label: '', value: '', order: prev.length + 1 }])
                }
              >
                <Plus size={13} /> 添加选项
              </Button>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
