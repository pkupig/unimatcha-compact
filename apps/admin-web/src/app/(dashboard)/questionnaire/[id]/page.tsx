'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Plus, Trash2, Power, ArrowLeft } from 'lucide-react';
import { getQVersion, addQuestion, deleteQuestion, toggleQuestion } from '@/lib/api';
import {
  PageHeader,
  Card,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  RoleGate,
} from '@/components/ui';

const QUESTION_TYPES = [
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTIPLE_CHOICE', label: '多选题' },
  { value: 'SCALE', label: '量表题（1-5）' },
  { value: 'TEXT', label: '文本题' },
];

function QuestionnaireDetailInner({ params }: { params: { id: string } }) {
  const [version, setVersion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddQ, setShowAddQ] = useState(false);
  const [addingQ, setAddingQ] = useState(false);
  const [form, setForm] = useState({
    type: 'SINGLE_CHOICE', title: '', isRequired: true, group: '',
    options: [{ label: '', value: '', order: 1 }],
  });
  // 待删除题目（ConfirmDialog）
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadVersion(); }, [params.id]);

  const loadVersion = async () => {
    try {
      const res = await getQVersion(params.id);
      setVersion((res as any).data);
    } catch { toast.error('问卷详情加载失败'); }
    finally { setLoading(false); }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingQ(true);
    try {
      const payload: any = { type: form.type, title: form.title, isRequired: form.isRequired, group: form.group || undefined };
      if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(form.type)) {
        payload.options = form.options.filter((o) => o.label.trim());
      }
      await addQuestion(params.id, payload);
      toast.success('题目已添加');
      setShowAddQ(false);
      setForm({ type: 'SINGLE_CHOICE', title: '', isRequired: true, group: '', options: [{ label: '', value: '', order: 1 }] });
      loadVersion();
    } catch (err: any) { toast.error(err?.message || '添加失败'); }
    finally { setAddingQ(false); }
  };

  const handleToggle = async (qId: string, isEnabled: boolean) => {
    try {
      await toggleQuestion(qId, !isEnabled);
      toast.success(isEnabled ? '题目已停用' : '题目已启用');
      loadVersion();
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteQuestion(deleteId);
      toast.success('题目已删除');
      setDeleteId(null);
      loadVersion();
    } catch { toast.error('删除失败'); }
    finally { setDeleting(false); }
  };

  if (loading) return <div className="text-center py-12 text-outline text-sm">加载中…</div>;
  if (!version) {
    return (
      <Card>
        <EmptyState title="问卷不存在" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/questionnaire"
        className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-ink transition-colors"
      >
        <ArrowLeft size={15} /> 返回问卷列表
      </Link>

      <PageHeader
        caption="QUESTIONNAIRE DETAIL"
        title={version.title}
        sub={
          <span>
            <span className="font-mono">V{version.version}</span> ·{' '}
            <span className="font-mono">{version.questions?.length ?? 0}</span> 道题
          </span>
        }
        actions={
          <button onClick={() => setShowAddQ(true)} className="btn-cta">
            <Plus size={15} /> 添加题目
          </button>
        }
      />

      {/* Questions list */}
      {(version.questions?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState title="暂无题目" sub="点击右上角「添加题目」开始编辑问卷" />
        </Card>
      ) : (
        <div className="space-y-3">
          {version.questions?.map((q: any, idx: number) => (
            <Card key={q.id} className={clsx(!q.isEnabled && 'opacity-50')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-mono bg-surface-low text-on-surface-variant rounded-md px-1.5 py-0.5">
                      #{idx + 1}
                    </span>
                    <Badge variant="outline">
                      {QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type}
                    </Badge>
                    {q.isRequired && <span className="text-neon-pink text-xs font-bold">*必填</span>}
                    {q.group && <span className="text-xs text-outline">[{q.group}]</span>}
                  </div>
                  <p className="font-medium text-on-surface">{q.title}</p>
                  {q.options?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt: any) => (
                        <div key={opt.id} className="text-sm text-on-surface-variant flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full border border-outline-variant inline-flex items-center justify-center text-[10px] font-mono shrink-0">
                            {opt.order}
                          </span>
                          {opt.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggle(q.id, q.isEnabled)}
                    title={q.isEnabled ? '停用' : '启用'}
                    className={clsx(
                      'p-1.5 rounded-lg hover:bg-surface-low transition-colors',
                      q.isEnabled ? 'text-ink' : 'text-outline',
                    )}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteId(q.id)}
                    className="p-1.5 rounded-lg hover:bg-surface-low text-outline hover:text-neon-pink transition-colors"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="删除题目"
        message="确认删除该题目？此操作不可撤销。"
        confirmText="确认删除"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Add Question Modal */}
      <Modal
        open={showAddQ}
        onClose={() => setShowAddQ(false)}
        caption="NEW QUESTION"
        title="添加题目"
        widthClassName="max-w-lg"
      >
        <form onSubmit={handleAddQuestion} className="space-y-4">
          <Field label="题目类型">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="题目内容" required>
            <Input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </Field>
          <div className="flex gap-4">
            <Field label="分组（可选）" className="flex-1">
              <Input
                type="text"
                placeholder="例如：性格、恋爱观"
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
              />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  className="accent-ink"
                  checked={form.isRequired}
                  onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
                />
                必填
              </label>
            </div>
          </div>
          {['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(form.type) && (
            <div>
              <span className="label">选项</span>
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="text"
                      className="flex-1"
                      placeholder={`选项 ${i + 1} 内容`}
                      value={opt.label}
                      onChange={(e) => {
                        const opts = [...form.options];
                        opts[i] = { ...opts[i], label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                        setForm({ ...form, options: opts });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}
                      className="text-outline hover:text-neon-pink transition-colors"
                      title="删除选项"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, options: [...form.options, { label: '', value: '', order: form.options.length + 1 }] })}
                className="mt-2 text-sm text-on-surface-variant hover:text-ink flex items-center gap-1 transition-colors"
              >
                <Plus size={13} /> 添加选项
              </button>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setShowAddQ(false)} className="btn-secondary btn-sm">
              取消
            </button>
            <button type="submit" disabled={addingQ} className="btn-primary btn-sm">
              {addingQ ? '添加中…' : '确认添加'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function QuestionnaireDetailPage({ params }: { params: { id: string } }) {
  // 问卷管理仅平台团队可用
  return (
    <RoleGate allow={['SUPER', 'TEAM']}>
      <QuestionnaireDetailInner params={params} />
    </RoleGate>
  );
}
