'use client';

import { useEffect, useState } from 'react';
import { getMatchConfig, updateMatchConfig, triggerMatchJob, getMatchJobs, retryMatchJob } from '@/lib/api';
import { Zap, RefreshCw, Settings, CheckCircle, XCircle, Clock, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: '等待中', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  RUNNING: { label: '执行中', color: 'bg-blue-100 text-blue-700', icon: Loader },
  COMPLETED: { label: '已完成', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  FAILED: { label: '已失败', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function MatchingPage() {
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
      toast.success('匹配配置已更新');
      setEditingConfig(false);
      loadConfig();
    } catch (err: any) { toast.error(err?.message || '更新失败'); }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerMatchJob();
      toast.success('匹配任务已加入队列');
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">匹配管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">配置匹配时间策略，管理匹配任务</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Config Card */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Settings size={16} /> 匹配时间配置</h2>
            {!editingConfig && <button onClick={() => setEditingConfig(true)} className="btn-secondary text-xs py-1.5 px-3">编辑</button>}
          </div>

          {editingConfig ? (
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cron 表达式</label>
                <input type="text" className="input" placeholder="0 20 * * 3 (每周三 20:00)" value={configForm.cronExpr}
                  onChange={(e) => setConfigForm({ ...configForm, cronExpr: e.target.value })} required />
                <p className="text-xs text-gray-400 mt-1">示例：0 20 * * 3 = 每周三晚20:00</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">描述</label>
                <input type="text" className="input" placeholder="如：每周三晚上20:00" value={configForm.description}
                  onChange={(e) => setConfigForm({ ...configForm, description: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isEnabled" checked={configForm.isEnabled}
                  onChange={(e) => setConfigForm({ ...configForm, isEnabled: e.target.checked })} />
                <label htmlFor="isEnabled" className="text-sm text-gray-700">启用定时匹配</label>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingConfig(false)} className="btn-secondary text-xs">取消</button>
                <button type="submit" className="btn-primary text-xs">保存</button>
              </div>
            </form>
          ) : loadingConfig ? (
            <p className="text-gray-400 text-sm">加载中...</p>
          ) : config ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                <span className="text-sm text-gray-500">Cron 表达式</span>
                <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{config.cronExpr}</code>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                <span className="text-sm text-gray-500">描述</span>
                <span className="text-sm text-gray-700">{config.description || '-'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-gray-500">定时状态</span>
                <span className={clsx('badge', config.isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                  {config.isEnabled ? '✅ 已启用' : '⏸ 已停用'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">暂无配置，请点击编辑创建</p>
          )}
        </div>

        {/* Manual trigger */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Zap size={16} /> 手动触发</h2>
          <p className="text-sm text-gray-500">立即对所有处于匹配模式、已完善资料的用户执行一次匹配。</p>
          <button onClick={handleTrigger} disabled={triggering} className="btn-primary w-full flex items-center justify-center gap-2">
            <Zap size={16} />
            {triggering ? '触发中...' : '立即执行匹配'}
          </button>
        </div>
      </div>

      {/* Jobs list */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">最近匹配任务</h2>
          <button onClick={loadJobs} className="text-gray-400 hover:text-gray-600"><RefreshCw size={15} /></button>
        </div>
        {loadingJobs ? (
          <p className="text-center py-8 text-gray-400">加载中...</p>
        ) : jobs.length === 0 ? (
          <p className="text-center py-8 text-gray-400">暂无匹配任务记录</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING;
              const Icon = statusCfg.icon;
              return (
                <div key={job.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                  <span className={clsx('badge flex items-center gap-1', statusCfg.color)}>
                    <Icon size={11} className={job.status === 'RUNNING' ? 'animate-spin' : ''} />
                    {statusCfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">
                      候选 {job.totalCandidates} 人 · 匹配 {job.totalMatched} 对
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(job.createdAt).toLocaleString('zh-CN')} · {job.triggeredBy || ''}
                    </p>
                  </div>
                  {job.status === 'FAILED' && (
                    <button onClick={() => handleRetry(job.id)} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                      <RefreshCw size={12} /> 重试
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
