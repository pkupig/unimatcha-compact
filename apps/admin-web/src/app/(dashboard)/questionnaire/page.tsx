'use client';

import { useEffect, useState } from 'react';
import { getQVersions, createQVersion, publishQVersion } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import clsx from 'clsx';

export default function QuestionnairePage() {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadVersions(); }, []);

  const loadVersions = async () => {
    try {
      const res = await getQVersions();
      setVersions((res as any).data || []);
    } catch { toast.error('加载问卷列表失败'); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createQVersion({ title: newTitle });
      toast.success('问卷版本已创建');
      setShowCreate(false);
      setNewTitle('');
      loadVersions();
    } catch (err: any) { toast.error(err?.message || '创建失败'); }
    finally { setCreating(false); }
  };

  const handlePublish = async (id: string) => {
    if (!confirm('发布后，所有用户将看到新版本问卷。确认发布？')) return;
    try {
      await publishQVersion(id);
      toast.success('问卷已发布为激活版本');
      loadVersions();
    } catch (err: any) { toast.error(err?.message || '发布失败'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">问卷管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理匹配问卷版本与题目</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> 新建版本
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">新建问卷版本</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">版本标题</label>
                <input
                  type="text"
                  className="input"
                  placeholder="如：校园恋爱问卷 V2"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Versions list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <div key={v.id} className="card flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-gray-900">{v.title}</span>
                  <span className="badge bg-gray-100 text-gray-600">V{v.version}</span>
                  {v.isActive && (
                    <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
                      <CheckCircle2 size={11} /> 激活中
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>📝 {v._count?.questions ?? 0} 道题</span>
                  <span>📊 {v._count?.answers ?? 0} 份回答</span>
                  {v.publishedAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      发布于 {new Date(v.publishedAt).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!v.isActive && (
                  <button
                    onClick={() => handlePublish(v.id)}
                    className="btn-secondary text-xs py-1.5 px-3 text-green-600 border-green-200 hover:bg-green-50"
                  >
                    发布
                  </button>
                )}
                <Link href={`/questionnaire/${v.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                  <ExternalLink size={13} /> 编辑题目
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
