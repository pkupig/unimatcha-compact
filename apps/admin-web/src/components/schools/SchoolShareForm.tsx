'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';
import { updateSchool } from '@/lib/api/schools';
import { toastError } from '@/lib/toast';
import type { School } from '@/lib/types';

/** 百分数字符串（0–100）→ bps；非法返回 null（注意：这是比例换算，不是金额，勿用 yuanToCents） */
function pctToBps(v: string): number | null {
  const n = Number(v.trim());
  if (v.trim() === '' || !isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

/** 百分号后缀输入框（两处复用） */
function PctInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        max={100}
        step="0.01"
        className="font-mono pr-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-mono text-sm">
        %
      </span>
    </div>
  );
}

/** 分成配置表单（SCHD-4）：平台直签 % + 自拉 %，% ↔ bps 双向换算，0–100 校验 */
export function SchoolShareForm({
  school,
  onSaved,
}: {
  school: School;
  onSaved: (updated: School) => void;
}) {
  // bps → % 回填（1250 → '12.5'）
  const [platformPct, setPlatformPct] = useState(String(school.platformShareBps / 100));
  const [selfPct, setSelfPct] = useState(String(school.selfSourcedShareBps / 100));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const platformShareBps = pctToBps(platformPct);
    const selfSourcedShareBps = pctToBps(selfPct);
    if (platformShareBps === null || selfSourcedShareBps === null) {
      setError('分成比例须为 0–100 之间的百分数');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updateSchool(school.id, { platformShareBps, selfSourcedShareBps });
      toast.success('分成配置已保存');
      onSaved(updated);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card caption="REVENUE SHARE" title="分成配置">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="平台直签分成"
          required
          hint="平台直签商家广告给学校的分成比例（默认 10%）"
          error={error}
        >
          <PctInput value={platformPct} onChange={setPlatformPct} />
        </Field>
        <Field label="自拉赞助分成" required hint="学生会自拉商家广告给学校的分成比例（默认 30%）">
          <PctInput value={selfPct} onChange={setSelfPct} />
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" type="submit" loading={saving}>
            保存分成配置
          </Button>
        </div>
      </form>
    </Card>
  );
}
