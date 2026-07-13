'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Search, Ban, CheckCircle, RefreshCw, Eye } from 'lucide-react';
import {
  getUsers,
  updateUserStatus,
  resetUserMode,
  updateVerificationStatus,
} from '@/lib/api';
import { isUnion } from '@/lib/auth';
import {
  PageHeader,
  Card,
  Badge,
  DataTable,
  EmptyState,
  RoleGate,
  Input,
  Select,
  useAdminInfo,
  type Column,
} from '@/components/ui';
import { formatDate } from '@/lib/format';

const VERIFICATION_LABELS: Record<string, string> = {
  unverified: '未认证',
  pending: '待审核',
  verified: '已认证',
  rejected: '已驳回',
};
/** 认证状态下拉配色（token only，禁止裸灰阶） */
const VERIFICATION_SELECT_CLS: Record<string, string> = {
  unverified: 'bg-surface-high text-on-surface-variant',
  pending: 'bg-ink text-white',
  verified: 'bg-neon text-black',
  rejected: 'bg-neon-pink/10 text-neon-pink',
};

// 双模式：mode/matchState 已迁入 UserModeState，后端 listUsers 返回 modeStates 数组
// （每项 { mode: 'romantic'|'friend', matchState: idle/searching/matched/confirming/relationship/no_match }）
type ModeState = { mode: string; matchState: string };
const MODE_LABELS: Record<string, string> = { romantic: '恋爱', friend: '朋友' };
const MATCH_STATE_LABELS: Record<string, string> = {
  idle: '空闲',
  searching: '匹配中',
  matched: '已匹配',
  confirming: '确认中',
  relationship: '关系中',
  no_match: '未匹配',
};
// 处于已确认关系的状态（用于显示重置按钮）
const RELATIONSHIP_STATE = 'relationship';

function UsersPageInner() {
  const admin = useAdminInfo();
  const union = isUnion(admin?.role);

  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 20;

  // 去抖：search 直接进依赖会每敲一个字就打一次接口（用户列表全量查询）。
  // 用 300ms 定时器 + cleanup 取消未触发的上一次，连打时只有最后一次生效。
  useEffect(() => {
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await getUsers({ page, limit: LIMIT, search: search || undefined, status: statusFilter || undefined });
      const data = (res as any).data;
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch { toast.error('用户列表加载失败'); }
    finally { setLoading(false); }
  };

  const handleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    try {
      await updateUserStatus(id, newStatus);
      toast.success(newStatus === 'BANNED' ? '用户已封禁' : '用户已解封');
      loadUsers();
    } catch (err: any) { toast.error(err?.message || '操作失败'); }
  };

  const handleResetMode = async (id: string) => {
    try {
      await resetUserMode(id);
      toast.success('用户模式已重置为匹配模式');
      loadUsers();
    } catch (err: any) { toast.error(err?.message || '操作失败'); }
  };

  const handleVerification = async (id: string, status: string) => {
    try {
      await updateVerificationStatus(id, status);
      toast.success(`认证状态已更新为「${VERIFICATION_LABELS[status]}」`);
      loadUsers();
    } catch (err: any) { toast.error(err?.message || '操作失败'); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  const columns: Column<any>[] = [
    {
      key: 'email',
      title: '邮箱',
      render: (user) => <span className="font-medium text-on-surface">{user.email}</span>,
    },
    {
      key: 'nickname',
      title: '昵称',
      render: (user) => (
        <span className="text-on-surface-variant">{user.profile?.nickname || '-'}</span>
      ),
    },
    {
      key: 'school',
      title: '学校',
      render: (user) => (
        <span className="text-on-surface-variant">{user.profile?.school || '-'}</span>
      ),
    },
    {
      key: 'modes',
      title: '模式状态',
      render: (user) => {
        const modeStates: ModeState[] = user.modeStates || [];
        if (modeStates.length === 0) return <span className="text-outline text-xs">-</span>;
        // 双模式：分别展示「恋爱」「朋友」两个模式的匹配状态
        return (
          <div className="flex flex-col gap-1 items-start">
            {modeStates.map((m) => (
              <Badge
                key={m.mode}
                variant={
                  m.matchState === RELATIONSHIP_STATE
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
        );
      },
    },
    {
      key: 'verification',
      title: '认证',
      render: (user) => {
        const vs = user.verificationStatus || 'unverified';
        return (
          <div className="flex flex-col gap-1 items-start">
            <select
              value={vs}
              onChange={(e) => handleVerification(user.id, e.target.value)}
              className={clsx(
                'text-xs font-bold rounded-full px-2 py-1 border-0 cursor-pointer',
                VERIFICATION_SELECT_CLS[vs],
              )}
            >
              {(['unverified', 'pending', 'verified', 'rejected'] as const).map((opt) => (
                <option key={opt} value={opt}>{VERIFICATION_LABELS[opt]}</option>
              ))}
            </select>
            {user.studentCardUrl && (
              <a
                href={user.studentCardUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-ink underline underline-offset-2 hover:text-neon-pink"
              >
                查看学生证
              </a>
            )}
            {user.schoolEmail && (
              <span className="text-[10px] text-outline truncate max-w-[150px]" title={user.schoolEmail}>
                {user.schoolEmail}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      title: '状态',
      render: (user) => (
        <Badge variant={user.status === 'ACTIVE' ? 'neon' : 'pink'}>
          {user.status === 'ACTIVE' ? '正常' : '已封禁'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      title: '注册时间',
      render: (user) => (
        <span className="font-mono text-xs text-on-surface-variant">{formatDate(user.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (user) => {
        const modeStates: ModeState[] = user.modeStates || [];
        // 是否存在处于已确认关系的模式（决定是否显示「重置」按钮）
        const hasRelationship = modeStates.some((m) => m.matchState === RELATIONSHIP_STATE);
        return (
          <div className="flex items-center gap-1">
            <Link
              href={`/users/${user.id}`}
              className="p-1.5 rounded-lg hover:bg-surface-low text-on-surface-variant hover:text-ink transition-colors"
              title="查看详情"
            >
              <Eye size={15} />
            </Link>
            {hasRelationship && (
              <button
                onClick={() => handleResetMode(user.id)}
                className="p-1.5 rounded-lg hover:bg-surface-low text-on-surface-variant hover:text-ink transition-colors"
                title="重置匹配状态（结束关系/聊天）"
              >
                <RefreshCw size={15} />
              </button>
            )}
            <button
              onClick={() => handleStatus(user.id, user.status)}
              className={clsx(
                'p-1.5 rounded-lg hover:bg-surface-low transition-colors',
                user.status === 'ACTIVE'
                  ? 'text-on-surface-variant hover:text-neon-pink'
                  : 'text-on-surface-variant hover:text-ink',
              )}
              title={user.status === 'ACTIVE' ? '封禁用户' : '解封用户'}
            >
              {user.status === 'ACTIVE' ? <Ban size={15} /> : <CheckCircle size={15} />}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        caption="USERS"
        title="用户管理"
        sub={
          <span className="inline-flex items-center gap-2">
            共 <span className="font-mono">{total}</span> 位用户
            {union && <Badge variant="ink">仅显示本校用户</Badge>}
          </span>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <Input
              type="text"
              placeholder="搜索邮箱或昵称…"
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select
            className="w-full sm:w-40"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">正常</option>
            <option value="BANNED">已封禁</option>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          empty={<EmptyState title="暂无用户数据" />}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/30">
            <span className="text-sm text-on-surface-variant">
              第 <span className="font-mono">{page}</span> / <span className="font-mono">{totalPages}</span> 页
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="btn-secondary btn-sm"
              >
                上一页
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="btn-secondary btn-sm"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function UsersPage() {
  // SPONSOR 无用户管理权限 → 跳回 dashboard；UNION 由后端自动 scope 到本校
  return (
    <RoleGate allow={['SUPER', 'TEAM', 'STUDENT_UNION']}>
      <UsersPageInner />
    </RoleGate>
  );
}
