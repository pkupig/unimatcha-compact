'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/form';
import {
  AD_PRICING_CONFIG_KEY,
  AD_SHARE_CONFIG_KEY,
  listSystemConfigs,
  updateSystemConfig,
} from '@/lib/api/settings';
import { formatDateTime } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { SystemConfigItem } from '@/lib/types';

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? '';
}

/** SET-2：SystemConfig 原始 JSON 编辑器（每键独立保存；保存前本地 JSON.parse 校验） */
export function SystemConfigList() {
  const [items, setItems] = useState<SystemConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSystemConfigs();
      // 后端已按 key 升序；再排一遍是防御（展示顺序是硬要求）
      setItems([...res.items].sort((a, b) => a.key.localeCompare(b.key)));
      setError(null);
    } catch (e) {
      toastError(e);
      setError('配置加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 保存后本地同步该行（不整表重拉，保住其他行未保存的编辑）
  const applySaved = (saved: SystemConfigItem) => {
    setItems((prev) => prev.map((it) => (it.key === saved.key ? saved : it)));
  };

  return (
    <Card
      caption="SYSTEM CONFIG"
      title="系统配置（原始 JSON）"
      actions={
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RotateCw size={14} />
          刷新
        </Button>
      }
    >
      {loading && items.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState text={error ?? '暂无配置项'} />
      ) : (
        <div className="space-y-5">
          {items.map((item) => (
            // key 键控：保存回填/刷新后 defaultValue 重挂
            <ConfigRow key={`${item.key}:${item.updatedAt}`} item={item} onSaved={applySaved} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** 单键编辑行：行数自适应 textarea + 独立保存；计价/分成两键后端拒写，此处禁用 */
function ConfigRow({
  item,
  onSaved,
}: {
  item: SystemConfigItem;
  onSaved: (saved: SystemConfigItem) => void;
}) {
  const initial = pretty(item.value);
  const [text, setText] = useState(initial);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = item.key === AD_PRICING_CONFIG_KEY || item.key === AD_SHARE_CONFIG_KEY;
  const dirty = text !== initial;

  const save = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setJsonError(`JSON 格式不合法：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setJsonError(null);
    setSaving(true);
    try {
      const saved = await updateSystemConfig(item.key, parsed);
      toast.success(`${item.key} 已保存`);
      onSaved(saved);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-outline-variant/50 rounded-lg p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-medium text-on-surface">{item.key}</code>
        {locked && <Badge variant="outline">请使用上方表单修改</Badge>}
        <span className="text-xs text-outline ml-auto">
          更新于 {formatDateTime(item.updatedAt)}
        </span>
      </div>
      <Textarea
        className="font-mono text-xs"
        rows={Math.min(12, Math.max(3, text.split('\n').length))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={locked}
        spellCheck={false}
      />
      {jsonError && <p className="text-xs text-neon-pink">{jsonError}</p>}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={locked || !dirty}
          onClick={() => void save()}
        >
          保存
        </Button>
      </div>
    </div>
  );
}
