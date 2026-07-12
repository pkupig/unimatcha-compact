'use client';

/**
 * 系统设置（SUPER 专属）— spec §5
 * 广告计价默认值（元显示分存储，PUT /admin/ad-pricing/defaults）
 * + SystemConfig 全量列表（JSON textarea 逐行编辑，PUT /admin/configs/:key）。
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, SlidersHorizontal } from 'lucide-react';
import { api, getPricingDefaults, updatePricingDefaults } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  RoleGate,
  Field,
  Input,
  Textarea,
  EmptyState,
} from '@/components/ui';

// NOTE: api.ts 未封装 SystemConfig 端点，暂以导出的 axios 实例直连
// （后端：GET /admin/configs、PUT /admin/configs/:key body { value }，均 SUPER-only）。
// reconcile 阶段可将 getConfigs/updateConfig 上移至 src/lib/api.ts。
const getConfigs = () => api.get('/admin/configs');
const updateConfig = (key: string, value: any) =>
  api.put(`/admin/configs/${encodeURIComponent(key)}`, { value });

interface SystemConfigRow {
  id?: string;
  key: string;
  value: any;
  description?: string | null;
  updatedAt?: string;
}

/** 元字符串 → 分（须为 > 0 的数字），非法返回 undefined */
function yuanToCents(v: string): number | undefined {
  const n = Number(v.trim());
  if (!v.trim() || !isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100);
}

export default function SettingsPage() {
  return (
    <RoleGate allow={['SUPER']}>
      <SettingsContent />
    </RoleGate>
  );
}

function SettingsContent() {
  // ── 广告计价默认值 ──
  const [buyoutYuan, setBuyoutYuan] = useState('');
  const [cpmYuan, setCpmYuan] = useState('');
  const [cpcYuan, setCpcYuan] = useState('');
  const [savingPricing, setSavingPricing] = useState(false);

  // ── SystemConfig ──
  const [configs, setConfigs] = useState<SystemConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [pricingRes, configsRes] = await Promise.all([getPricingDefaults(), getConfigs()]);
      const pricing = (pricingRes as any).data;
      setBuyoutYuan(String((pricing?.buyoutDailyPriceCents ?? 0) / 100));
      setCpmYuan(String((pricing?.cpmPriceCents ?? 0) / 100));
      setCpcYuan(String((pricing?.cpcPriceCents ?? 0) / 100));

      const rows = (((configsRes as any).data as SystemConfigRow[]) || []).slice();
      rows.sort((a, b) => a.key.localeCompare(b.key));
      setConfigs(rows);
      const d: Record<string, string> = {};
      for (const row of rows) d[row.key] = JSON.stringify(row.value, null, 2);
      setDrafts(d);
    } catch (err: any) {
      toast.error(err?.message || '系统设置加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    const buyoutDailyPriceCents = yuanToCents(buyoutYuan);
    const cpmPriceCents = yuanToCents(cpmYuan);
    const cpcPriceCents = yuanToCents(cpcYuan);
    if (
      buyoutDailyPriceCents === undefined ||
      cpmPriceCents === undefined ||
      cpcPriceCents === undefined
    ) {
      toast.error('价格须为大于 0 的数字（元）');
      return;
    }
    setSavingPricing(true);
    try {
      await updatePricingDefaults({ buyoutDailyPriceCents, cpmPriceCents, cpcPriceCents });
      toast.success('计价默认值已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleSaveConfig = async (key: string) => {
    let value: any;
    try {
      value = JSON.parse(drafts[key] ?? '');
    } catch {
      toast.error(`「${key}」不是合法的 JSON`);
      return;
    }
    setSavingKey(key);
    try {
      await updateConfig(key, value);
      toast.success(`配置「${key}」已保存`);
      // 同步本地展示（避免整页重拉）
      setConfigs((prev) => prev.map((c) => (c.key === key ? { ...c, value } : c)));
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        caption="SYSTEM SETTINGS"
        title="系统设置"
        sub="全局配置与广告计价默认值（仅超级管理员可见）"
      />

      {/* 广告计价默认值 */}
      <Card
        caption="AD PRICING DEFAULTS"
        title="广告计价默认值"
        actions={<span className="caption text-outline">学校未配置覆盖时生效</span>}
      >
        <form onSubmit={handleSavePricing} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="包断日价（元/天·校）" required>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                className="font-mono"
                value={buyoutYuan}
                onChange={(e) => setBuyoutYuan(e.target.value)}
                disabled={loading}
                required
              />
            </Field>
            <Field label="CPM 单价（元/千次曝光）" required>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                className="font-mono"
                value={cpmYuan}
                onChange={(e) => setCpmYuan(e.target.value)}
                disabled={loading}
                required
              />
            </Field>
            <Field label="CPC 单价（元/次点击）" required>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                className="font-mono"
                value={cpcYuan}
                onChange={(e) => setCpcYuan(e.target.value)}
                disabled={loading}
                required
              />
            </Field>
          </div>
          <p className="text-xs text-outline">
            元输入、分存储；提交审核的订单以提交时快照计价，改价不影响已提交订单。
          </p>
          <div className="flex justify-end">
            <button type="submit" className="btn-cta btn-sm" disabled={savingPricing || loading}>
              <Save size={14} />
              {savingPricing ? '保存中…' : '保存计价默认值'}
            </button>
          </div>
        </form>
      </Card>

      {/* SystemConfig 列表 */}
      <Card
        caption="SYSTEM CONFIG"
        title="系统配置"
        actions={<span className="caption text-outline">JSON 直接编辑，保存前校验</span>}
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-surface-low animate-pulse" />
            ))}
          </div>
        ) : configs.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="暂无系统配置"
            sub="配置项由后端 seed 或业务模块首次写入后出现在此处"
          />
        ) : (
          <div className="space-y-5">
            {configs.map((c) => (
              <div
                key={c.key}
                className="border border-outline-variant/40 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-on-surface">{c.key}</p>
                    {c.updatedAt && (
                      <p className="text-[11px] text-outline font-mono mt-0.5">
                        更新于 {formatDateTime(c.updatedAt)}
                      </p>
                    )}
                  </div>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => handleSaveConfig(c.key)}
                    disabled={savingKey === c.key}
                  >
                    <Save size={13} />
                    {savingKey === c.key ? '保存中…' : '保存'}
                  </button>
                </div>
                <Textarea
                  className="font-mono text-xs"
                  rows={Math.min(12, Math.max(3, (drafts[c.key] || '').split('\n').length))}
                  value={drafts[c.key] ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [c.key]: e.target.value })}
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
