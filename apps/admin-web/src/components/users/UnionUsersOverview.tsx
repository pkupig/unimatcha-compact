'use client';

/**
 * 学生会「群体概览」：本校用户只出群体统计（产品口径：不可见名单与个体详情）。
 * 一次取自 GET /admin/users/overview（后端对学生会恒 scope 本校）。
 * 性别构成用行式比例条而非图表——与年级人数不混轴，不上 recharts。
 */
import { useEffect, useState } from 'react';
import { Activity, BadgeCheck, CalendarPlus, Flame, Heart, HeartHandshake, Hourglass, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { TrendChart } from '@/components/ui/TrendChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChartSkeleton, StatGrid, StatGridSkeleton } from '@/components/dashboard/DashboardShared';
import { ApiError } from '@/lib/api/client';
import { getUsersOverview } from '@/lib/api/users';
import { formatNumber, formatShortDate } from '@/lib/format';
import { GENDER, labelOf } from '@/lib/labels';
import type { UsersOverview } from '@/lib/types';

/** 比例条固定行序（缺档补 0，五行恒在） */
const GENDER_ORDER: (string | null)[] = ['male', 'female', 'non_binary', 'other', null];

function GenderRows({ buckets }: { buckets: UsersOverview['byGender'] }) {
  const counts = new Map(buckets.map((b) => [b.gender, b.count]));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  return (
    <div className="space-y-3 py-1">
      {GENDER_ORDER.map((g) => {
        const count = counts.get(g) ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={g ?? 'unknown'} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-on-surface-variant">
              {labelOf(GENDER, g, '未填写')}
            </span>
            <div className="flex-1 h-2.5 rounded-full bg-surface-high overflow-hidden">
              <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right font-mono text-xs text-on-surface">
              {formatNumber(count)} · {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function UnionUsersOverview() {
  const [data, setData] = useState<UsersOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUsersOverview()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : '加载失败，请稍后重试');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <EmptyState text={error} />
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card caption="BY GRADE" title="年级分布"><ChartSkeleton /></Card>
          <Card caption="BY GENDER" title="性别构成"><ChartSkeleton /></Card>
        </div>
        <Card caption="NEW USERS · 30D" title="近 30 天新增"><ChartSkeleton /></Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card caption="ACTIVE · 30D" title="日活跃用户"><ChartSkeleton /></Card>
          <Card caption="CONTENT · 30D" title="内容流量"><ChartSkeleton /></Card>
        </div>
      </div>
    );
  }

  const gradeData = data.byGrade.map((b) => ({ grade: b.grade ?? '未填写', count: b.count }));
  const seriesData = data.series30d.map((p) => ({ date: formatShortDate(p.date), count: p.count }));
  const activeData = data.activity.activeSeries30d.map((p) => ({
    date: formatShortDate(p.date),
    activeUsers: p.activeUsers,
  }));
  const contentData = data.activity.contentSeries30d.map((p) => ({
    date: formatShortDate(p.date),
    posts: p.posts,
    comments: p.comments,
    likes: p.likes,
  }));
  const activeRate =
    data.total > 0 ? `活跃率 ${((data.activity.dau30 / data.total) * 100).toFixed(1)}%` : undefined;

  return (
    <div className="space-y-6">
      <StatGrid>
        <StatCard label="总人数" value={formatNumber(data.total)} sub={data.school ?? undefined} icon={Users} />
        <StatCard label="本周新增" value={`+${formatNumber(data.newThisWeek)}`} icon={CalendarPlus} />
        <StatCard label="认证通过" value={formatNumber(data.verification.verified)} icon={BadgeCheck} />
        <StatCard
          label="待审认证"
          value={formatNumber(data.verification.pending)}
          sub="在「认证审核」处理"
          icon={Hourglass}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card caption="BY GRADE" title="年级分布">
          {gradeData.length > 0 ? (
            <TrendChart data={gradeData} x="grade" series={[{ key: 'count', name: '人数', color: 'ink' }]} kind="bar" />
          ) : (
            <EmptyState text="暂无年级数据" />
          )}
        </Card>
        <Card caption="BY GENDER" title="性别构成">
          <GenderRows buckets={data.byGender} />
        </Card>
      </div>

      <Card caption="NEW USERS · 30D" title="近 30 天新增">
        <TrendChart data={seriesData} x="date" series={[{ key: 'count', name: '新增用户', color: 'neon' }]} />
      </Card>

      {/* 活跃度：发帖/评论/点赞/聊天任一行为按 (用户, 日) 去重；私聊只进去重不出条数 */}
      <StatGrid>
        <StatCard label="7 日活跃" value={formatNumber(data.activity.dau7)} icon={Activity} />
        <StatCard label="30 日活跃" value={formatNumber(data.activity.dau30)} sub={activeRate} icon={Flame} />
        <StatCard label="匹配中" value={formatNumber(data.activity.matching.searching)} sub="任一模式搜索中" icon={Heart} />
        <StatCard
          label="关系中"
          value={formatNumber(data.activity.matching.relationship)}
          sub="已确认恋爱/朋友关系"
          icon={HeartHandshake}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card caption="ACTIVE · 30D" title="日活跃用户">
          <TrendChart
            data={activeData}
            x="date"
            series={[{ key: 'activeUsers', name: '活跃用户', color: 'ink' }]}
          />
        </Card>
        <Card caption="CONTENT · 30D" title="内容流量">
          <TrendChart
            data={contentData}
            x="date"
            series={[
              { key: 'posts', name: '发帖', color: 'ink' },
              { key: 'comments', name: '评论', color: 'neon' },
              { key: 'likes', name: '点赞', color: 'pink' },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
