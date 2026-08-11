'use client';

import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/form';
import { getShareDefaults, updateShareDefaults } from '@/lib/api/settings';
import { toastError } from '@/lib/toast';

/** 百分数字符串（0–100）→ bps；非法返回 null（比例换算，不是金额，勿用 yuanToCents） */
function pctToBps(v: string): number | null {
  const n = Number(v.trim());
  if (v.trim() === '' || !isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

/** 百分号后缀输入框（结构镜像 SchoolShareForm 的 PctInput） */
function PctInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
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
        disabled={disabled}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-mono text-sm">
        %
      </span>
    </div>
  );
}

/**
 * SET-3：全局分成默认值表单（GET/PUT /admin/ad-pricing/share-defaults）。
 * 必须走专用接口——通用 configs 接口对 ad_share_defaults 键拒写（后端 400）。
 * % 输入 bps 存储；两项均必填（0–100）。学校未单独配置分成时按此比例分成。
 */
export function GlobalShareCard() {
  const [platformPct, setPlatformPct] = useState('');
  const [selfPct, setSelfPct] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getShareDefaults();
        if (cancelled) return;
        // bps → % 回填（1250 → '12.5'）
        setPlatformPct(String(d.platformShareBps / 100));
        setSelfPct(String(d.selfSourcedShareBps / 100));
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
    const platformShareBps = pctToBps(platformPct);
    const selfSourcedShareBps = pctToBps(selfPct);
    // 全局默认是最终回落值，不存在「继承」语义 → 两项必填，空串即拦
    if (platformShareBps === null || selfSourcedShareBps === null) {
      setError('分成比例须为 0–100 之间的百分数');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await updateShareDefaults({ platformShareBps, selfSourcedShareBps });
      // 以服务端返回值回填（权威值）
      setPlatformPct(String(saved.platformShareBps / 100));
      setSelfPct(String(saved.selfSourcedShareBps / 100));
      toast.success('分成默认值已保存');
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      caption="AD SHARE"
      title="广告分成默认值"
      actions={<span className="caption text-outline">学校未单独配置时按此比例分成</span>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="平台直签分成"
            required
            hint="平台直签商家广告给学校的分成比例（缺省 10%）"
            error={error}
          >
            <PctInput value={platformPct} onChange={setPlatformPct} disabled={loading} />
          </Field>
          <Field
            label="自拉赞助分成"
            required
            hint="学生会自拉商家广告给学校的分成比例（缺省 30%）"
          >
            <PctInput value={selfPct} onChange={setSelfPct} disabled={loading} />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-on-surface-variant">
            学校详情页可按校覆盖；学校留空（继承）时按此处比例入账分成。
          </p>
          <Button variant="primary" size="sm" type="submit" loading={saving} disabled={loading}>
            保存默认值
          </Button>
        </div>
      </form>
    </Card>
  );
}
