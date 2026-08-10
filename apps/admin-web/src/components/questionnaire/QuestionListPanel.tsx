'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ListChecks, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useModal } from '@/hooks/useModal';
import { toastError } from '@/lib/toast';
import { deleteQuestion, reorderQuestions, toggleQuestion } from '@/lib/api/questionnaire';
import type { Question, QuestionnaireVersionDetail } from '@/lib/types';
import { QuestionCard } from './QuestionCard';
import { QuestionFormModal } from './QuestionFormModal';

/** 题目面板：列表 + 新增/编辑/删除/启停/排序（QSTD-1~5）；激活版本锁定增删改排 */
export function QuestionListPanel({
  version,
  onChanged,
}: {
  version: QuestionnaireVersionDetail;
  onChanged: () => void;
}) {
  const locked = version.isActive;
  const form = useModal<Question>();
  const remove = useModal<Question>();
  const [moving, setMoving] = useState(false);

  // 排序（QSTD-5）：交换相邻两题后提交全量有序 id 数组，成功后重拉以后端顺序为准
  const move = async (index: number, dir: -1 | 1) => {
    const ids = version.questions.map((q) => q.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setMoving(true);
    try {
      await reorderQuestions(version.id, ids);
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setMoving(false);
    }
  };

  // 启用/停用（QSTD-3）：后端对激活版本亦放行，故不受 locked 限制
  const toggle = async (q: Question, next: boolean) => {
    try {
      await toggleQuestion(q.id, next);
      toast.success(next ? '题目已启用' : '题目已停用');
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-bold text-on-surface">
          题目 <span className="font-mono text-sm text-on-surface-variant">({version.questions.length})</span>
        </h2>
        <Button size="sm" variant="primary" disabled={locked} onClick={form.openEmpty}>
          <Plus size={14} /> 添加题目
        </Button>
      </div>

      {locked && (
        <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-low rounded-lg px-4 py-3">
          <Lock size={13} className="shrink-0" />
          当前为激活版本：用户答案锚定本版本，题目不可增删改排；启用/停用仍可调整，改题请新建版本。
        </div>
      )}

      {version.questions.length === 0 ? (
        <EmptyState icon={ListChecks} text="还没有题目，点右上角「添加题目」开始" />
      ) : (
        <div className="space-y-3">
          {version.questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx}
              total={version.questions.length}
              locked={locked}
              moving={moving}
              onMove={(i, dir) => void move(i, dir)}
              onEdit={form.openWith}
              onToggle={(qq, next) => void toggle(qq, next)}
              onDelete={remove.openWith}
            />
          ))}
        </div>
      )}

      {form.open && (
        <QuestionFormModal
          versionId={version.id}
          question={form.data}
          onClose={form.close}
          onDone={onChanged}
        />
      )}
      {remove.open && remove.data && (
        <ConfirmDialog
          title="删除题目"
          danger
          confirmText="删除"
          message={<>确认删除题目「{remove.data.title}」？此操作不可恢复。</>}
          onConfirm={async () => {
            // remove.data 在键控挂载下必非空；闭包内取局部变量绕开可空收窄
            const target = remove.data;
            if (!target) return;
            await deleteQuestion(target.id);
            toast.success('题目已删除');
            onChanged();
          }}
          onClose={remove.close}
        />
      )}
    </>
  );
}
