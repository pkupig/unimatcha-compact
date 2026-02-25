'use client';

import { useEffect, useState } from 'react';
import { getQVersion, addQuestion, deleteQuestion, toggleQuestion, updateQuestion } from '@/lib/api';
import { Plus, Trash2, Power, ArrowLeft, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import clsx from 'clsx';

const QUESTION_TYPES = [
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTIPLE_CHOICE', label: '多选题' },
  { value: 'SCALE', label: '量表题 (1-5)' },
  { value: 'TEXT', label: '填空题' },
];

export default function QuestionnaireDetailPage({ params }: { params: { id: string } }) {
  const [version, setVersion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddQ, setShowAddQ] = useState(false);
  const [addingQ, setAddingQ] = useState(false);
  const [form, setForm] = useState({
    type: 'SINGLE_CHOICE', title: '', isRequired: true, group: '',
    options: [{ label: '', value: '', order: 1 }],
  });

  useEffect(() => { loadVersion(); }, [params.id]);

  const loadVersion = async () => {
    try {
      const res = await getQVersion(params.id);
      setVersion((res as any).data);
    } catch { toast.error('加载问卷详情失败'); }
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
      toast.success(isEnabled ? '题目已禁用' : '题目已启用');
      loadVersion();
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async (qId: string) => {
    if (!confirm('确认删除该题目？')) return;
    try {
      await deleteQuestion(qId);
      toast.success('题目已删除');
      loadVersion();
    } catch { toast.error('删除失败'); }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;
  if (!version) return <div className="text-center py-12 text-gray-400">问卷不存在</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questionnaire" className="p-1.5 rounded-lg hover:bg-gray-100"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{version.title}</h1>
          <p className="text-sm text-gray-400">V{version.version} · {version.questions?.length ?? 0} 道题</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowAddQ(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> 添加题目
        </button>
      </div>

      {/* Questions list */}
      <div className="space-y-3">
        {version.questions?.map((q: any, idx: number) => (
          <div key={q.id} className={clsx('card', !q.isEnabled && 'opacity-50')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">#{idx + 1}</span>
                  <span className="text-xs badge bg-blue-50 text-blue-600">{QUESTION_TYPES.find((t) => t.value === q.type)?.label}</span>
                  {q.isRequired && <span className="text-red-500 text-xs">*必答</span>}
                  {q.group && <span className="text-xs text-gray-400">[{q.group}]</span>}
                </div>
                <p className="font-medium text-gray-900">{q.title}</p>
                {q.options?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {q.options.map((opt: any) => (
                      <div key={opt.id} className="text-sm text-gray-500 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border border-gray-300 inline-flex items-center justify-center text-xs">{opt.order}</span>
                        {opt.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => handleToggle(q.id, q.isEnabled)} title={q.isEnabled ? '禁用' : '启用'}
                  className={clsx('p-1.5 rounded hover:bg-gray-100', q.isEnabled ? 'text-green-500' : 'text-gray-400')}>
                  <Power size={14} />
                </button>
                <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Question Modal */}
      {showAddQ && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">添加题目</h3>
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">题型</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">题目内容 *</label>
                <input type="text" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">分组（可选）</label>
                  <input type="text" className="input" placeholder="如：性格、恋爱观" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
                    必答题
                  </label>
                </div>
              </div>
              {['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(form.type) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">选项</label>
                  <div className="space-y-2">
                    {form.options.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text" className="input flex-1" placeholder={`选项 ${i + 1} 标签`}
                          value={opt.label}
                          onChange={(e) => {
                            const opts = [...form.options];
                            opts[i] = { ...opts[i], label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                            setForm({ ...form, options: opts });
                          }}
                        />
                        <button type="button" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}
                          className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setForm({ ...form, options: [...form.options, { label: '', value: '', order: form.options.length + 1 }] })}
                    className="mt-2 text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1">
                    <Plus size={13} /> 添加选项
                  </button>
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAddQ(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={addingQ} className="btn-primary">{addingQ ? '添加中...' : '确认添加'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
