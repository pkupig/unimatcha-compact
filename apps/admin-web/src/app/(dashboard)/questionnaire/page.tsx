'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, ExternalLink, CheckCircle2, Clock, FileText, BarChart } from 'lucide-react';
import { getQVersions, createQVersion, publishQVersion } from '@/lib/api';
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
import { formatDate } from '@/lib/format';

// 问卷类型：ROMANTIC（恋人）| FRIEND（朋友），后端必填
const TYPE_LABELS: Record<string, string> = {
  ROMANTIC: '恋爱问卷',
  FRIEND: '朋友问卷',
};

function QuestionnaireInner() {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'ROMANTIC' | 'FRIEND'>('ROMANTIC');
  const [creating, setCreating] = useState(false);
  // 待发布版本（ConfirmDialog）
  const [publishId, setPublishId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => { loadVersions(); }, []);

  const loadVersions = async () => {
    try {
      const res = await getQVersions();
      setVersions((res as any).data || []);
    } catch { toast.error('问卷列表加载失败'); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createQVersion({ title: newTitle, type: newType });
      toast.success('问卷版本已创建');
      setShowCreate(false);
      setNewTitle('');
      setNewType('ROMANTIC');
      loadVersions();
    } catch (err: any) { toast.error(err?.message || '创建失败'); }
    finally { setCreating(false); }
  };

  const handlePublish = async () => {
    if (!publishId) return;
    setPublishing(true);
    try {
      await publishQVersion(publishId);
      toast.success('问卷已发布为当前版本');
      setPublishId(null);
      loadVersions();
    } catch (err: any) { toast.error(err?.message || '发布失败'); }
    finally { setPublishing(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        caption="QUESTIONNAIRE"
        title="问卷管理"
        sub="管理匹配问卷版本与题目"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-cta">
            <Plus size={16} /> 新建版本
          </button>
        }
      />

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        caption="NEW VERSION"
        title="新建问卷版本"
        widthClassName="max-w-md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="问卷类型" required>
            <Select
              value={newType}
              onChange={(e) => setNewType(e.target.value as 'ROMANTIC' | 'FRIEND')}
              required
            >
              <option value="ROMANTIC">恋爱问卷</option>
              <option value="FRIEND">朋友问卷</option>
            </Select>
          </Field>
          <Field label="版本标题" required>
            <Input
              type="text"
              placeholder="例如：校园恋爱问卷 V2"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
          </Field>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary btn-sm">
              取消
            </button>
            <button type="submit" disabled={creating} className="btn-primary btn-sm">
              {creating ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Publish confirm */}
      <ConfirmDialog
        open={!!publishId}
        title="发布问卷版本"
        message="发布后所有用户将使用新版本问卷，确认发布？"
        confirmText="确认发布"
        loading={publishing}
        onConfirm={handlePublish}
        onCancel={() => setPublishId(null)}
      />

      {/* Versions list */}
      {loading ? (
        <div className="text-center py-12 text-outline text-sm">加载中…</div>
      ) : versions.length === 0 ? (
        <Card>
          <EmptyState title="暂无问卷版本" sub="点击右上角「新建版本」创建第一份问卷" />
        </Card>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <Card key={v.id} className="flex items-center gap-4" bodyClassName="contents">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-extrabold text-on-surface">{v.title}</span>
                  <Badge variant="outline" className="font-mono">V{v.version}</Badge>
                  {v.type && <Badge variant="neutral">{TYPE_LABELS[v.type] || v.type}</Badge>}
                  {v.isActive && (
                    <Badge variant="neon">
                      <CheckCircle2 size={11} /> 当前版本
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-outline">
                  <span className="flex items-center gap-1">
                    <FileText size={11} /> <span className="font-mono">{v._count?.questions ?? 0}</span> 道题
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart size={11} /> <span className="font-mono">{v._count?.answers ?? 0}</span> 份作答
                  </span>
                  {v.publishedAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> 发布于 <span className="font-mono">{formatDate(v.publishedAt)}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!v.isActive && (
                  <button onClick={() => setPublishId(v.id)} className="btn-primary btn-sm">
                    发布
                  </button>
                )}
                <Link href={`/questionnaire/${v.id}`} className="btn-secondary btn-sm">
                  <ExternalLink size={13} /> 编辑题目
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuestionnairePage() {
  // 问卷管理仅平台团队可用
  return (
    <RoleGate allow={['SUPER', 'TEAM']}>
      <QuestionnaireInner />
    </RoleGate>
  );
}
