'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { getUserDetail } from '@/lib/api';
import {
  PageHeader,
  Card,
  Badge,
  EmptyState,
  RoleGate,
  type BadgeVariant,
} from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';

const VERIFICATION_LABELS: Record<string, string> = {
  unverified: '未认证',
  pending: '待审核',
  verified: '已认证',
  rejected: '已驳回',
};
const VERIFICATION_VARIANTS: Record<string, BadgeVariant> = {
  unverified: 'neutral',
  pending: 'ink',
  verified: 'neon',
  rejected: 'pink',
};
const MODE_LABELS: Record<string, string> = { romantic: '恋爱', friend: '朋友' };
const MATCH_STATE_LABELS: Record<string, string> = {
  idle: '空闲',
  searching: '匹配中',
  matched: '已匹配',
  confirming: '确认中',
  relationship: '关系中',
  no_match: '未匹配',
};

function UserDetailInner({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUser(); }, [params.id]);

  const loadUser = async () => {
    try {
      const res = await getUserDetail(params.id);
      setUser((res as any).data);
    } catch (err: any) { toast.error(err?.message || '用户详情加载失败'); }
    finally { setLoading(false); }
  };

  if (loading) {
    return <div className="text-center py-12 text-outline text-sm">加载中…</div>;
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <Link
          href="/users"
          className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-ink transition-colors"
        >
          <ArrowLeft size={15} /> 返回用户列表
        </Link>
        <Card>
          <EmptyState title="用户不存在" />
        </Card>
      </div>
    );
  }

  const profile = user.profile || {};
  const vs = user.verificationStatus || 'unverified';
  const modeStates: { mode: string; matchState: string }[] = user.modeStates || [];
  const matches = [
    ...(user.matchesAsUserA || []).map((m: any) => ({ ...m, other: m.userB })),
    ...(user.matchesAsUserB || []).map((m: any) => ({ ...m, other: m.userA })),
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/users"
        className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-ink transition-colors"
      >
        <ArrowLeft size={15} /> 返回用户列表
      </Link>

      {/* Header */}
      <PageHeader
        caption="USER DETAIL"
        title={profile.nickname || user.email}
        sub={user.email}
        actions={
          <>
            <Badge variant={user.status === 'ACTIVE' ? 'neon' : 'pink'}>
              {user.status === 'ACTIVE' ? '正常' : '已封禁'}
            </Badge>
            <Badge variant={VERIFICATION_VARIANTS[vs] || 'neutral'}>
              {VERIFICATION_LABELS[vs] || vs}
            </Badge>
          </>
        }
      />

      {/* Profile */}
      <Card caption="PROFILE" title="资料">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          {[
            ['昵称', profile.nickname],
            ['真实姓名', profile.realName],
            ['性别', profile.gender],
            ['年龄', profile.age],
            ['学校', profile.school],
            ['年级', profile.grade],
            ['专业', profile.major],
            ['城市', profile.city],
            ['MBTI', profile.mbti],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="caption">{label}</dt>
              <dd className="text-on-surface mt-1">{value ?? '-'}</dd>
            </div>
          ))}
        </dl>
        {profile.bio && (
          <div className="mt-4">
            <dt className="caption">简介</dt>
            <dd className="text-on-surface-variant mt-1 whitespace-pre-wrap text-sm">{profile.bio}</dd>
          </div>
        )}
        {Array.isArray(profile.interests) && profile.interests.length > 0 && (
          <div className="mt-4">
            <dt className="caption mb-1.5">兴趣标签</dt>
            <dd className="flex flex-wrap gap-1.5">
              {profile.interests.map((t: string) => (
                <Badge key={t} variant="neutral">{t}</Badge>
              ))}
            </dd>
          </div>
        )}
      </Card>

      {/* Verification materials */}
      {(user.studentCardUrl || user.schoolEmail) && (
        <Card caption="VERIFICATION" title="认证材料">
          <div className="space-y-2 text-sm">
            {user.schoolEmail && (
              <div>
                <span className="text-xs text-outline">学校邮箱：</span>
                <span className="text-on-surface">{user.schoolEmail}</span>
              </div>
            )}
            {user.studentCardUrl && (
              <a
                href={user.studentCardUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink underline underline-offset-2 hover:text-neon-pink"
              >
                查看学生证
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Mode states */}
      <Card caption="MODE STATES" title="模式状态">
        {modeStates.length === 0 ? (
          <p className="text-sm text-outline">暂无模式状态</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {modeStates.map((m) => (
              <Badge
                key={m.mode}
                variant={
                  m.matchState === 'relationship'
                    ? 'neon'
                    : m.matchState === 'idle'
                      ? 'neutral'
                      : 'ink'
                }
              >
                {MODE_LABELS[m.mode] || m.mode}：{MATCH_STATE_LABELS[m.matchState] || m.matchState}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Recent matches */}
      <Card caption="RECENT MATCHES" title="最近匹配">
        {matches.length === 0 ? (
          <p className="text-sm text-outline">暂无匹配记录</p>
        ) : (
          <ul className="divide-y divide-outline-variant/20 text-sm">
            {matches.map((m: any) => (
              <li key={m.id} className="py-2 flex items-center justify-between">
                <span className="text-on-surface">
                  {m.other?.profile?.nickname || m.other?.email || '未知用户'}
                </span>
                <span className="font-mono text-xs text-outline">
                  {m.createdAt ? formatDate(m.createdAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Registered */}
      <p className="text-xs text-outline">
        注册于 <span className="font-mono">{formatDateTime(user.createdAt)}</span>
      </p>
    </div>
  );
}

export default function UserDetailPage({ params }: { params: { id: string } }) {
  // SPONSOR 无用户管理权限 → 跳回 dashboard；UNION 由后端校验目标用户学校
  return (
    <RoleGate allow={['SUPER', 'TEAM', 'STUDENT_UNION']}>
      <UserDetailInner params={params} />
    </RoleGate>
  );
}
