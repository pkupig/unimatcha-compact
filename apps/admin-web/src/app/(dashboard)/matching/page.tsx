'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader,
  PauseCircle,
} from 'lucide-react';
import { getMatchConfig, updateMatchConfig, triggerMatchJob, getMatchJobs, retryMatchJob } from '@/lib/api';
import {
  PageHeader,
  Card,
  Badge,
  DataTable,
  EmptyState,
  Field,
  Input,
  RoleGate,
  type BadgeVariant,
  type Column,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';

/** 任务状态 → 徽章（ink=进行中、neon=成功、pink=失败、neutral=等待） */
const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant; icon: any }> = {
  PENDING: { label: '等待中', variant: 'neutral', icon: Clock },
  RUNNING: { label: '运行中', variant: 'ink', icon: Loader },
  COMPLETED: { label: '已完成', variant: 'neon', icon: CheckCircle },
  FAILED: { label: '失败', variant: 'pink', icon: XCircle },
};

function MatchingInner() {
  const [config, setConfig] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [editingConfig, setEditingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ cronExpr: '', description: '', isEnabled: true });
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    loadConfig();
    loadJobs();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await getMatchConfig();
      const data = (res as any).data;
      setConfig(data);
      if (data) setConfigForm({ cronExpr: data.cronExpr || '', description: data.description || '', isEnabled: data.isEnabled });
    } catch {} finally { setLoadingConfig(false); }
  };

  const loadJobs = async () => {
    try {
      const res = await getMatchJobs({ limit: 10 });
      setJobs((res as any).data?.jobs || []);
    } catch {} finally { setLoadingJobs(false); }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMatchConfig(configForm);
      toast.success('匹配计划已更新');
      setEditingConfig(false);
      loadConfig();
    } catch (err: any) { toast.error(err?.message || '更新失败'); }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      // 文案承诺「为所有处于匹配模式的用户执行一次匹配」，故恋人 + 朋友两模式都触发
      // （原来只调无参 triggerMatchJob → 后端仅缺省跑 romantic，朋友池被漏掉）。
      await triggerMatchJob('romantic');
      await triggerMatchJob('friend');
      toast.success('匹配任务已加入队列（恋人 + 朋友）');
      setTimeout(loadJobs, 1000);
    } catch (err: any) { toast.error(err?.message || '触发失败'); }
    finally { setTriggering(false); }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await retryMatchJob(jobId);
      toast.success('任务已重新加入队列');
      loadJobs();
    } catch (err: any) { toast.error(err?.message || '重试失败'); }
  };

  const jobColumns: Column<any>[] = [
    {
      key: 'status',
      title: '状态',
      render: (job) => {
        const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING;
        const Icon = cfg.icon;
        return (
          <Badge variant={cfg.variant}>
            <Icon size={11} className={job.status === 'RUNNING' ? 'animate-spin' : ''} />
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      key: 'summary',
      title: '任务详情',
      render: (job) => (
        <span className="text-on-surface">
          <span className="font-mono">{job.totalCandidates}</span> 位候选 ·{' '}
          <span className="font-mono">{job.totalMatched}</span> 对配对
        </span>
      ),
    },
    {
      key: 'createdAt',
      title: '触发时间',
      render: (job) => (
        <span className="font-mono text-xs text-on-surface-variant">{formatDateTime(job.createdAt)}</span>
      ),
    },
    {
      key: 'triggeredBy',
      title: '触发方',
      render: (job) => <span className="text-on-surface-variant text-xs">{job.triggeredBy || '-'}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (job) =>
        job.status === 'FAILED' ? (
          <button onClick={() => handleRetry(job.id)} className="btn-secondary btn-sm">
            <RefreshCw size={12} /> 重试
          </button>
        ) : (
          <span className="text-outline">-</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader caption="MATCHING" title="匹配管理" sub="配置匹配计划与管理匹配任务" />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Config Card */}
        <Card
          caption="SCHEDULE"
          title="匹配计划"
          actions={
            !editingConfig && (
              <button onClick={() => setEditingConfig(true)} className="btn-secondary btn-sm">
                编辑
              </button>
            )
          }
        >
          {editingConfig ? (
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <Field label="Cron 表达式" hint="示例：0 20 * * 3 = 每周三 20:00" required>
                <Input
                  type="text"
                  className="font-mono"
                  placeholder="0 20 * * 3（每周三 20:00）"
                  value={configForm.cronExpr}
                  onChange={(e) => setConfigForm({ ...configForm, cronExpr: e.target.value })}
                  required
                />
              </Field>
              <Field label="描述">
                <Input
                  type="text"
                  placeholder="例如：每周三晚 8 点匹配"
                  value={configForm.description}
                  onChange={(e) => setConfigForm({ ...configForm, description: e.target.value })}
                />
              </Field>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isEnabled"
                  className="accent-ink"
                  checked={configForm.isEnabled}
                  onChange={(e) => setConfigForm({ ...configForm, isEnabled: e.target.checked })}
                />
                <label htmlFor="isEnabled" className="text-sm text-on-surface">启用定时匹配</label>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingConfig(false)} className="btn-secondary btn-sm">
                  取消
                </button>
                <button type="submit" className="btn-primary btn-sm">保存</button>
              </div>
            </form>
          ) : loadingConfig ? (
            <p className="text-outline text-sm">加载中…</p>
          ) : config ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5 border-b border-outline-variant/20">
                <span className="text-sm text-on-surface-variant">Cron 表达式</span>
                <code className="text-sm font-mono bg-surface-low px-2 py-0.5 rounded-md text-on-surface">
                  {config.cronExpr}
                </code>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-outline-variant/20">
                <span className="text-sm text-on-surface-variant">描述</span>
                <span className="text-sm text-on-surface">{config.description || '-'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-on-surface-variant">计划状态</span>
                <Badge variant={config.isEnabled ? 'neon' : 'neutral'}>
                  {config.isEnabled ? <CheckCircle size={12} /> : <PauseCircle size={12} />}
                  {config.isEnabled ? '已启用' : '已停用'}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-outline text-sm">暂无配置，点击「编辑」创建。</p>
          )}
        </Card>

        {/* Manual trigger */}
        <Card caption="TRIGGER" title="手动触发">
          <p className="text-sm text-on-surface-variant mb-4">
            立即为所有处于匹配模式且已完善资料的用户执行一次匹配。
          </p>
          <button onClick={handleTrigger} disabled={triggering} className="btn-cta w-full">
            <Zap size={16} />
            {triggering ? '触发中…' : '立即匹配'}
          </button>
        </Card>
      </div>

      {/* Jobs list */}
      <Card
        caption="RECENT JOBS"
        title="最近匹配任务"
        actions={
          <button
            onClick={loadJobs}
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-low hover:text-ink transition-colors"
            title="刷新"
          >
            <RefreshCw size={15} />
          </button>
        }
        bodyClassName="-mx-6 -mb-6 overflow-hidden rounded-b-lg"
      >
        <DataTable
          columns={jobColumns}
          data={jobs}
          loading={loadingJobs}
          empty={<EmptyState title="暂无匹配任务" />}
        />
      </Card>
    </div>
  );
}

export default function MatchingPage() {
  // 匹配管理仅平台团队可用
  return (
    <RoleGate allow={['SUPER', 'TEAM']}>
      <MatchingInner />
    </RoleGate>
  );
}
