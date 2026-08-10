'use client';

/** 三角色仪表盘薄壳：拉 payload → 按 admin.role 选组件、按结构判别收窄类型 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useAdmin } from '@/lib/auth-context';
import { isSponsor, isTeam, isUnion } from '@/lib/auth';
import { getDashboard } from '@/lib/api/dashboard';
import { toastError } from '@/lib/toast';
import {
  isSponsorDashboard,
  isTeamDashboard,
  isUnionDashboard,
  type DashboardPayload,
} from '@/lib/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { StatGridSkeleton } from '@/components/dashboard/DashboardShared';
import { TeamDashboard } from '@/components/dashboard/TeamDashboard';
import { UnionDashboard } from '@/components/dashboard/UnionDashboard';
import { SponsorDashboard } from '@/components/dashboard/SponsorDashboard';

export default function DashboardPage() {
  const { admin } = useAdmin();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getDashboard());
    } catch (e) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const role = admin?.role;
  // 学生会页头副行显示学校名，其余角色问候语
  const sub = !admin ? undefined : isUnion(role) ? (admin.schoolName ?? undefined) : `你好，${admin.name}`;

  return (
    <>
      <PageHeader
        title="总览"
        caption="Overview"
        sub={sub}
        actions={
          isSponsor(role) ? (
            <Link href="/ads/new" className="btn-cta btn-sm">
              <Plus size={14} />
              新建广告
            </Link>
          ) : undefined
        }
      />
      {loading && <StatGridSkeleton />}
      {!loading && !data && (
        <EmptyState
          text="仪表盘加载失败，请重试"
          action={
            <Button size="sm" onClick={() => void load()}>
              重试
            </Button>
          }
        />
      )}
      {!loading && data && role && (
        <>
          {isTeam(role) && isTeamDashboard(data) && <TeamDashboard data={data} role={role} />}
          {isUnion(role) && isUnionDashboard(data) && <UnionDashboard data={data} />}
          {isSponsor(role) && isSponsorDashboard(data) && <SponsorDashboard data={data} />}
        </>
      )}
    </>
  );
}
