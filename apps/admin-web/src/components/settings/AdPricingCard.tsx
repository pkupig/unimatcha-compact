'use client';

import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/form';
import { getPricingDefaults, updatePricingDefaults } from '@/lib/api/schools';
import { centsToYuanInput, yuanToCents } from '@/lib/format';
import { toastError } from '@/lib/toast';

/**
 * SET-1：广告计价默认值表单。
 * 必须走 /admin/ad-pricing/defaults 专用接口——通用 configs 接口对该键拒写（后端 400）。
 * 元输入分存储；三项均须 > 0。
 */
export function AdPricingCard() {
  const [buyoutYuan, setBuyoutYuan] = useState('');
  const [cpmYuan, setCpmYuan] = useState('');
  const [cpcYuan, setCpcYuan] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getPricingDefaults();
        if (cancelled) return;
        setBuyoutYuan(centsToYuanInput(d.buyoutDailyPriceCents));
        setCpmYuan(centsToYuanInput(d.cpmPriceCents));
        setCpcYuan(centsToYuanInput(d.cpcPriceCents));
      } catch (e) {
        if (!cancelled) toastError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const buyoutDailyPriceCents = yuanToCents(buyoutYuan);
    const cpmPriceCents = yuanToCents(cpmYuan);
    const cpcPriceCents = yuanToCents(cpcYuan);
    // 后端 @Min(1)（分）同口径：三项都必须是正数金额
    if (
      buyoutDailyPriceCents === null || buyoutDailyPriceCents < 1 ||
      cpmPriceCents === null || cpmPriceCents < 1 ||
      cpcPriceCents === null || cpcPriceCents < 1
    ) {
      setError('三项单价均须为正数金额（元）');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await updatePricingDefaults({ buyoutDailyPriceCents, cpmPriceCents, cpcPriceCents });
      // 以服务端返回值回填（四舍五入到分后的权威值）
      setBuyoutYuan(centsToYuanInput(saved.buyoutDailyPriceCents));
      setCpmYuan(centsToYuanInput(saved.cpmPriceCents));
      setCpcYuan(centsToYuanInput(saved.cpcPriceCents));
      toast.success('计价默认值已保存');
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
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading}
    />
  );

  return (
    <Card
      caption="AD PRICING"
      title="广告计价默认值"
      actions={<span className="caption text-outline">学校未配置覆盖时回落到此</span>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="包断日价（元/天·校）" error={error}>
            {priceInput(buyoutYuan, setBuyoutYuan)}
          </Field>
          <Field label="CPM 单价（元/千次曝光）">{priceInput(cpmYuan, setCpmYuan)}</Field>
          <Field label="CPC 单价（元/次点击）">{priceInput(cpcYuan, setCpcYuan)}</Field>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-on-surface-variant">
            订单在提交时快照计价，改价不影响已提交订单。
          </p>
          <Button variant="primary" size="sm" type="submit" loading={saving} disabled={loading}>
            保存默认值
          </Button>
        </div>
      </form>
    </Card>
  );
}
