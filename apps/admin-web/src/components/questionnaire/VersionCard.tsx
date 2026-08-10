'use client';

import Link from 'next/link';
import { Pencil, Rocket } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { QUESTIONNAIRE_TYPE } from '@/lib/labels';
import { formatDate, formatNumber } from '@/lib/format';
import type { QuestionnaireVersion } from '@/lib/types';

/** 版本卡片（QST-1）：标题 / V{n} / 类型徽标 / 激活徽标 / 计数 / 发布日期 + 发布、编辑题目入口 */
export function VersionCard({
  version: v,
  onPublish,
}: {
  version: QuestionnaireVersion;
  onPublish: (v: QuestionnaireVersion) => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-on-surface">{v.title}</span>
            <Badge variant="outline">V{v.version}</Badge>
            <StatusBadge meta={QUESTIONNAIRE_TYPE} value={v.type} />
            {v.isActive && <Badge variant="neon">当前版本</Badge>}
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-on-surface-variant">
            <span className="font-mono">{formatNumber(v._count.questions)} 道题</span>
            <span className="font-mono">{formatNumber(v._count.answers)} 份作答</span>
            {v.publishedAt && <span>发布于 {formatDate(v.publishedAt)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 仅非激活版本可发布（QST-2）；激活版本无需重复发布 */}
          {!v.isActive && (
            <Button size="sm" variant="primary" onClick={() => onPublish(v)}>
              <Rocket size={13} /> 发布
            </Button>
          )}
          <Link href={`/questionnaire/${v.id}`} className="btn-secondary btn-sm">
            <Pencil size={13} /> 编辑题目
          </Link>
        </div>
      </div>
    </Card>
  );
}
