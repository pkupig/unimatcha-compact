'use client';

import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/format';
import type { MatchConfig } from '@/lib/types';

/** MAT-1：匹配计划展示卡（cron 表达式 code 样式 / 描述 / 启用徽标；编辑走弹窗） */
export function MatchPlanCard({
  config,
  loading,
  onEdit,
}: {
  config: MatchConfig | null;
  loading: boolean;
  onEdit: () => void;
}) {
  return (
    <Card
      caption="SCHEDULE"
      title="匹配计划"
      actions={
        <Button size="sm" onClick={onEdit} disabled={loading}>
          <Pencil size={14} />
          编辑
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {/* 骨架占位：避免配置到位前卡片高度跳变 */}
          <div className="h-6 w-48 rounded bg-surface-high animate-pulse" />
          <div className="h-4 w-72 rounded bg-surface-high animate-pulse" />
        </div>
      ) : !config ? (
        <EmptyState text="尚未配置匹配计划，点击右上角「编辑」创建" />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-sm bg-surface-low border border-outline-variant/50 rounded px-2.5 py-1 text-on-surface">
              {config.cronExpr}
            </code>
            <Badge variant={config.isEnabled ? 'neon' : 'neutral'}>
              {config.isEnabled ? '已启用' : '已停用'}
            </Badge>
          </div>
          <p className="text-sm text-on-surface-variant">
            {config.description || '未填写描述'}
          </p>
          <p className="text-xs text-outline">
            时区 {config.timezone} · 更新于 {formatDateTime(config.updatedAt)}
          </p>
        </div>
      )}
    </Card>
  );
}
