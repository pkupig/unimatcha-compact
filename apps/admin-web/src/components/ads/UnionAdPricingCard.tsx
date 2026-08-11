'use client';

/**
 * 学生会自设本校广告单价（/ads?tab=pricing）：
 * 结构参照 schools/SchoolPricingForm，但能量整数输入（数值 ≡ *Cents 原值，无元↔分换算）、
 * hint 显示全局默认（GET /admin/ad-pricing/defaults 已放开学生会只读）、
 * 留空 = null 清除覆盖回落全局默认，提交走 PUT /admin/schools/:id/ad-pricing。
 */
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input } from '@/components/ui/form';
import { useAdmin } from '@/lib/auth-context';
import { updateUnionAdPricing } from '@/lib/api/ads';
import { getPricingDefaults, getSchool } from '@/lib/api/schools';
import { formatEnergy } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { AdPricingDefaults, School } from '@/lib/types';

/**
 * 能量输入串 → 覆盖值：'' → null（清除覆盖，回落全局默认）；
 * 正整数通过；其余 → undefined（拦截，后端 @Min(1) 整数同口径）
 */
function parseOverride(v: string): number | null | undefined {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** 覆盖值 → 输入串（null 覆盖缺省显示为空 = 继承全局默认） */
function toInput(v: number | null): string {
  return v != null ? String(v) : '';
}

export function UnionAdPricingCard() {
  const { admin } = useAdmin();
  const schoolId = admin?.schoolId ?? null;

  const [buyout, setBuyout] = useState('');
  const [cpm, setCpm] = useState('');
  const [cpc, setCpc] = useState('');
  const [defaults, setDefaults] = useState<AdPricingDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // 现有覆盖值回填（学生会可读本校详情）；全局默认仅作 hint，失败静默降级为通用提示
    getSchool(schoolId)
      .then((s: School) => {
        if (cancelled) return;
        setBuyout(toInput(s.buyoutDailyPriceCents));
        setCpm(toInput(s.cpmPriceCents));
        setCpc(toInput(s.cpcPriceCents));
      })
      .catch((e) => {
        if (!cancelled) toastError(e, '加载本校定价失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    getPricingDefaults()
      .then((d) => {
        if (!cancelled) setDefaults(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  if (!schoolId) {
    return (
      <Card>
        <EmptyState icon={Building2} text="账号未绑定学校，无法配置本校广告定价" />
      </Card>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const buyoutDailyPriceCents = parseOverride(buyout);
    const cpmPriceCents = parseOverride(cpm);
    const cpcPriceCents = parseOverride(cpc);
    if (
      buyoutDailyPriceCents === undefined ||
      cpmPriceCents === undefined ||
      cpcPriceCents === undefined
    ) {
      setError('单价须为正整数能量；留空表示使用全局默认');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // 三字段整体提交：留空字段以 null 落库，语义即「清除覆盖」
      const updated = await updateUnionAdPricing(schoolId, {
        buyoutDailyPriceCents,
        cpmPriceCents,
        cpcPriceCents,
      });
      setBuyout(toInput(updated.buyoutDailyPriceCents));
      setCpm(toInput(updated.cpmPriceCents));
      setCpc(toInput(updated.cpcPriceCents));
      toast.success('本校广告定价已保存');
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const priceInput = (value: string, onChange: (v: string) => void) => (
    <Input
      type="number"
      min={1}
      step={1}
      className="font-mono"
      placeholder="留空使用全局默认"
      disabled={loading}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  // 全局默认加载失败时退化为通用说明，不挡表单
  const hintOf = (v: number | undefined, unit: string) =>
    v != null ? `全局默认 ${formatEnergy(v)} / ${unit}` : `留空 = 继承全局默认（能量 / ${unit}）`;

  return (
    <Card
      caption="AD PRICING"
      title="本校广告定价"
      actions={<span className="caption text-outline">留空 = 继承全局默认</span>}
    >
      <form onSubmit={submit} className="space-y-4 max-w-xl">
        <Field
          label="包断日价（能量/天·校）"
          hint={hintOf(defaults?.buyoutDailyPriceCents, '天·校')}
          error={error}
        >
          {priceInput(buyout, setBuyout)}
        </Field>
        <Field label="CPM 单价（能量/千次曝光）" hint={hintOf(defaults?.cpmPriceCents, '千次曝光')}>
          {priceInput(cpm, setCpm)}
        </Field>
        <Field label="CPC 单价（能量/次点击）" hint={hintOf(defaults?.cpcPriceCents, '次点击')}>
          {priceInput(cpc, setCpc)}
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" type="submit" loading={saving}>
            保存定价
          </Button>
        </div>
      </form>
    </Card>
  );
}
