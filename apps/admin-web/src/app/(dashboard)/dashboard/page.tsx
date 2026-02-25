'use client';

import { useEffect, useState } from 'react';
import { getDashboard, triggerMatchJob } from '@/lib/api';
import { Users, Heart, Zap, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await getDashboard();
      setStats((res as any).data);
    } catch {
      toast.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerMatch = async () => {
    setTriggering(true);
    try {
      await triggerMatchJob();
      toast.success('匹配任务已触发，正在队列中处理...');
      setTimeout(loadStats, 2000);
    } catch (err: any) {
      toast.error(err?.message || '触发失败');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">加载中...</div>;

  const statCards = [
    {
      title: '总用户数',
      value: stats?.users?.total ?? 0,
      sub: `活跃 ${stats?.users?.active ?? 0} / 封禁 ${stats?.users?.banned ?? 0}`,
      icon: Users, color: 'bg-blue-50 text-blue-600',
    },
    {
      title: '匹配模式',
      value: stats?.users?.inMatchMode ?? 0,
      sub: '等待匹配的用户',
      icon: Zap, color: 'bg-yellow-50 text-yellow-600',
    },
    {
      title: '恋爱中',
      value: stats?.users?.inRelationship ?? 0,
      sub: '已成功匹配的用户',
      icon: Heart, color: 'bg-pink-50 text-pink-600',
    },
    {
      title: '累计匹配',
      value: stats?.matching?.totalMatches ?? 0,
      sub: `进行中任务 ${stats?.matching?.pendingJobs ?? 0}`,
      icon: AlertTriangle, color: 'bg-purple-50 text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>
          <p className="text-sm text-gray-500 mt-0.5">平台整体数据概览</p>
        </div>
        <button
          onClick={handleTriggerMatch}
          disabled={triggering}
          className="btn-primary flex items-center gap-2"
        >
          <Zap size={16} />
          {triggering ? '触发中...' : '立即执行匹配'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card">
              <div className={`inline-flex p-2 rounded-lg ${card.color} mb-3`}>
                <Icon size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value.toLocaleString()}</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">{card.title}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
