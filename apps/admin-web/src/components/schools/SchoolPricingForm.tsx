'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';
import { updateSchool } from '@/lib/api/schools';
import { centsToYuanInput, fenToYuan, yuanToCents } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { AdPricingDefaults, School } from '@/lib/types';

/**
 * 元输入串 → 分：'' → null（清除覆盖，回落全局默认）；
 * 非法 / 不足 1 分 → undefined（拦截，后端 @Min(1) 同口径）
 */
function parseOverride(v: string): number | null | undefined {
  if (!v.trim()) return null;
  const cents = yuanToCents(v);
  return cents === null || cents < 1 ? undefined : cents;
}

/** 计价覆盖表单（SCHD-5）：元输入分存储；留空 = 继承全局默认（提交 null 清除覆盖） */
export function SchoolPricingForm({
  school,
  defaults,
  onSaved,
}: {
  school: School;
  defaults: AdPricingDefaults | null;
  onSaved: (updated: School) => void;
}) {
  const [buyoutYuan, setBuyoutYuan] = useState(centsToYuanInput(school.buyoutDailyPriceCents));
  const [cpmYuan, setCpmYuan] = useState(centsToYuanInput(school.cpmPriceCents));
  const [cpcYuan, setCpcYuan] = useState(centsToYuanInput(school.cpcPriceCents));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const buyoutDailyPriceCents = parseOverride(buyoutYuan);
    const cpmPriceCents = parseOverride(cpmYuan);
    const cpcPriceCents = parseOverride(cpcYuan);
    if (
      buyoutDailyPriceCents === undefined ||
      cpmPriceCents === undefined ||
      cpcPriceCents === undefined
    ) {
      setError('价格须为正数金额（元）；留空表示使用全局默认');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // 三个字段整体提交：留空字段以 null 落库，语义即「清除覆盖」
      const updated = await updateSchool(school.id, {
        buyoutDailyPriceCents,
        cpmPriceCents,
        cpcPriceCents,
      });
      toast.success('计价覆盖已保存');
      onSaved(updated);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const priceInput = (value: string, onChange: (v: string) => void) => (
    <Input
      type="number"
      min={0}
      step="0.01"
      className="font-mono"
      placeholder="留空使用全局默认"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <Card
      caption="PRICING OVERRIDE"
      title="计价覆盖"
      actions={<span className="caption text-outline">留空 = 继承全局默认</span>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="包断日价（元/天·校）"
          hint={`全局默认 ${fenToYuan(defaults?.buyoutDailyPriceCents)} / 天·校`}
          error={error}
        >
          {priceInput(buyoutYuan, setBuyoutYuan)}
        </Field>
        <Field
          label="CPM 单价（元/千次曝光）"
          hint={`全局默认 ${fenToYuan(defaults?.cpmPriceCents)} / 千次曝光`}
        >
          {priceInput(cpmYuan, setCpmYuan)}
        </Field>
        <Field
          label="CPC 单价（元/次点击）"
          hint={`全局默认 ${fenToYuan(defaults?.cpcPriceCents)} / 次点击`}
        >
          {priceInput(cpcYuan, setCpcYuan)}
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" type="submit" loading={saving}>
            保存计价覆盖
          </Button>
        </div>
      </form>
    </Card>
  );
}
