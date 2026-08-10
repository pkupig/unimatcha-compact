'use client';

/** 用户详情（薄壳）：取数 + 卡片拼装；页头操作/资料/认证/匹配卡在 components/users */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api/client';
import { getUserDetail } from '@/lib/api/users';
import { formatDateTime } from '@/lib/format';
import type { AdminUserDetail } from '@/lib/types';
import { UserDetailHeader } from '@/components/users/UserDetailHeader';
import { UserProfileCard } from '@/components/users/UserProfileCard';
import { UserVerificationCard } from '@/components/users/UserVerificationCard';
import { UserMatchesCard, UserModesCard } from '@/components/users/UserMatchCards';

function BackLink() {
  return (
    <Link
      href="/users"
      className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-ink transition-colors"
    >
      <ArrowLeft size={15} /> 返回用户列表
    </Link>
  );
}

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 出错不 toast、渲染整页空态（与列表引擎的 error 行为对齐）；404 时后端 message 即「用户不存在」
  const load = useCallback(async () => {
    try {
      setUser(await getUserDetail(params.id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <EmptyState text={error ?? '用户不存在'} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <UserDetailHeader user={user} onChanged={load} />
      <UserProfileCard profile={user.profile} />
      <UserVerificationCard user={user} onChanged={load} />
      <UserModesCard user={user} />
      <UserMatchesCard user={user} />
      <p className="text-xs text-outline">
        注册于 <span className="font-mono">{formatDateTime(user.createdAt)}</span>
      </p>
    </div>
  );
}
