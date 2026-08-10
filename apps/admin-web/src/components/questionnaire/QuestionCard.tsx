'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/Switch';
import { QUESTION_TYPE } from '@/lib/labels';
import type { Question } from '@/lib/types';

/** 图标操作钮：ghost Button 的 padding 与图标钮冲突，此处收窄为方形热区 */
function IconBtn({
  title,
  danger = false,
  disabled = false,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'p-1.5 rounded-lg transition-colors disabled:opacity-35 disabled:pointer-events-none',
        'text-outline hover:bg-surface-low',
        danger ? 'hover:text-neon-pink' : 'hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/** 题目卡片（QSTD-1/3/4/5）：序号/类型/必填/分组/选项 + 上下移/编辑/启停/删除 */
export function QuestionCard({
  question: q,
  index,
  total,
  locked,
  moving,
  onMove,
  onEdit,
  onToggle,
  onDelete,
}: {
  question: Question;
  index: number;
  total: number;
  /** 激活版本：增删改排禁用（后端 400），仅保留启用/停用 */
  locked: boolean;
  /** 排序请求在途，防连点乱序 */
  moving: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
  onEdit: (q: Question) => void;
  onToggle: (q: Question, next: boolean) => void;
  onDelete: (q: Question) => void;
}) {
  return (
    <Card className={clsx(!q.isEnabled && 'opacity-50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono bg-surface-low text-on-surface-variant rounded px-1.5 py-0.5">
              #{index + 1}
            </span>
            <StatusBadge meta={QUESTION_TYPE} value={q.type} />
            {q.isRequired && <span className="text-neon-pink text-xs">*必答</span>}
            {q.group && <span className="text-xs text-on-surface-variant">[{q.group}]</span>}
          </div>
          <p className="font-medium text-on-surface">{q.title}</p>
          {q.titleEn && <p className="text-xs text-on-surface-variant mt-0.5">EN · {q.titleEn}</p>}
          {q.description && <p className="text-xs text-on-surface-variant mt-0.5">{q.description}</p>}
          {q.options.length > 0 && (
            <div className="mt-2 space-y-1">
              {q.options.map((opt) => (
                <div key={opt.id} className="text-sm text-on-surface-variant flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border border-outline-variant inline-flex items-center justify-center text-[10px] font-mono shrink-0">
                    {opt.order}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn title="上移" disabled={locked || moving || index === 0} onClick={() => onMove(index, -1)}>
            <ArrowUp size={14} />
          </IconBtn>
          <IconBtn title="下移" disabled={locked || moving || index === total - 1} onClick={() => onMove(index, 1)}>
            <ArrowDown size={14} />
          </IconBtn>
          <IconBtn title="编辑" disabled={locked} onClick={() => onEdit(q)}>
            <Pencil size={14} />
          </IconBtn>
          <IconBtn title="删除" danger disabled={locked} onClick={() => onDelete(q)}>
            <Trash2 size={14} />
          </IconBtn>
          <div className="ml-1.5">
            <Switch checked={q.isEnabled} onChange={(next) => onToggle(q, next)} />
          </div>
        </div>
      </div>
    </Card>
  );
}
