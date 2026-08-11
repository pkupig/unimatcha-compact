'use client';

import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';
import { updateSchool } from '@/lib/api/schools';
import { getShareDefaults } from '@/lib/api/settings';
import { bpsToPercent } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { AdShareDefaults, School } from '@/lib/types';

/**
 * 百分数字符串 → bps（比例换算，不是金额，勿用 yuanToCents）：
 * '' → null（清除覆盖，继承全局默认）；非法 / 越界 → undefined（拦截）。
 * 语义对齐 SchoolPricingForm.parseOverride。
 */
function pctToBps(v: string): number | null | undefined {
  if (!v.trim()) return null;
  const n = Number(v.trim());
  if (!isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100);
}

/**
 * bps → % 输入串回填（1250 → '12.5'）；null = 继承全局默认，回填空串。
 * 参数放宽为 number | null：能量经济 Phase B 起后端该字段可为 null，
 * 前端 School 类型（schools 域文件，不在本次属地）尚未放宽，这里按运行时真值处理。
 */
function bpsToPctInput(bps: number | null): string {
  return bps == null ? '' : String(bps / 100);
}

/**
 * 偏离备忘：UpdateSchoolPayload 的 platformShareBps / selfSourcedShareBps 应放宽为
 * number | null（null = 清除覆盖，后端 service 对 null 直写落库）。
 * types/schools.ts 已放宽 bps 为 number|null，直调 updateSchool 即可。
 */
const updateSchoolShare = updateSchool;

/** 百分号后缀输入框（两处复用） */
function PctInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        max={100}
        step="0.01"
        className="font-mono pr-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-mono text-sm">
        %
      </span>
    </div>
  );
}

/**
 * 分成覆盖表单（SCHD-4）：平台直签 % + 自拉 %，% ↔ bps 双向换算，0–100 校验；
 * 留空 = 继承全局默认（提交 null 清除覆盖，全局默认见 /settings 分成默认值卡）。
 */
export function SchoolShareForm({
  school,
  onSaved,
}: {
  school: School;
  onSaved: (updated: School) => void;
}) {
  const [platformPct, setPlatformPct] = useState(bpsToPctInput(school.platformShareBps));
  const [selfPct, setSelfPct] = useState(bpsToPctInput(school.selfSourcedShareBps));
  const [defaults, setDefaults] = useState<AdShareDefaults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 拉全局默认值填 placeholder；失败（如无读权限）静默退化为通用文案
  useEffect(() => {
    let cancelled = false;
    getShareDefaults()
      .then((d) => {
        if (!cancelled) setDefaults(d);
      })
      .catch(() => {
        // 静默：placeholder 退化即可，不打断表单
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const platformShareBps = pctToBps(platformPct);
    const selfSourcedShareBps = pctToBps(selfPct);
    if (platformShareBps === undefined || selfSourcedShareBps === undefined) {
      setError('分成比例须为 0–100 之间的百分数；留空表示继承全局默认');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // 两个字段整体提交：留空字段以 null 落库，语义即「清除覆盖，继承全局」
      const updated = await updateSchoolShare(school.id, { platformShareBps, selfSourcedShareBps });
      toast.success('分成配置已保存');
      onSaved(updated);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const placeholderOf = (bps: number | undefined) =>
    defaults ? `留空 = 继承全局默认 ${bpsToPercent(bps)}` : '留空 = 继承全局默认';

  return (
    <Card
      caption="REVENUE SHARE"
      title="分成配置"
      actions={<span className="caption text-outline">留空 = 继承全局默认</span>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="平台直签分成"
          hint="平台直签广告商广告给学校的分成比例"
          error={error}
        >
          <PctInput
            value={platformPct}
            onChange={setPlatformPct}
            placeholder={placeholderOf(defaults?.platformShareBps)}
          />
        </Field>
        <Field label="自拉赞助分成" hint="学生会自拉广告商广告给学校的分成比例">
          <PctInput
            value={selfPct}
            onChange={setSelfPct}
            placeholder={placeholderOf(defaults?.selfSourcedShareBps)}
          />
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
