'use client';

/**
 * 用户列表表格：列定义 + 行操作（详情 / 重置匹配 / 封禁解封）。
 * 重置按钮仅在任一模式处于已确认关系（relationship）时出现（USR-6）。
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Eye, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { USER_STATUS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { useModal } from '@/hooks/useModal';
import type { AdminUserListItem } from '@/lib/types';
import { ModeStateBadges } from './ModeStateBadges';
import { VerificationSelect } from './VerificationSelect';
import { UserResetConfirm, UserStatusConfirm } from './UserActionDialogs';

const ICON_BTN =
  'p-1.5 rounded-lg hover:bg-surface-low text-on-surface-variant transition-colors';

export function UsersTable({
  rows,
  loading,
  error,
  onChanged,
}: {
  rows: AdminUserListItem[];
  loading: boolean;
  error: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const banModal = useModal<AdminUserListItem>();
  const resetModal = useModal<AdminUserListItem>();
  // useModal 每渲染返回新对象，依赖取其 useCallback 稳定的 openWith 才能命中缓存
  const openBan = banModal.openWith;
  const openReset = resetModal.openWith;

  const columns = useMemo<Column<AdminUserListItem>[]>(
    () => [
      {
        key: 'email',
        header: '邮箱',
        render: (u) => <span className="font-medium text-on-surface">{u.email}</span>,
      },
      {
        key: 'nickname',
        header: '昵称',
        render: (u) => <span className="text-on-surface-variant">{u.profile?.nickname ?? '-'}</span>,
      },
      {
        key: 'school',
        header: '学校',
        render: (u) => <span className="text-on-surface-variant">{u.profile?.school ?? '-'}</span>,
      },
      {
        key: 'modes',
        header: '模式状态',
        render: (u) => <ModeStateBadges modeStates={u.modeStates} />,
      },
      {
        key: 'verification',
        header: '认证',
        render: (u) => (
          <div className="flex flex-col items-start gap-1">
            <VerificationSelect userId={u.id} value={u.verificationStatus} onDone={onChanged} />
            {u.studentCardUrl && (
              <a
                href={u.studentCardUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-ink underline underline-offset-2 hover:text-neon-pink"
              >
                查看学生证
              </a>
            )}
            {u.schoolEmail && (
              <span className="text-[10px] text-outline truncate max-w-[150px]" title={u.schoolEmail}>
                {u.schoolEmail}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'status',
        header: '状态',
        render: (u) => <StatusBadge meta={USER_STATUS} value={u.status} />,
      },
      {
        key: 'createdAt',
        header: '注册时间',
        render: (u) => (
          <span className="font-mono text-xs text-on-surface-variant">{formatDate(u.createdAt)}</span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        render: (u) => {
          const hasRelationship = u.modeStates.some((m) => m.matchState === 'relationship');
          return (
            <div className="flex items-center gap-1">
              <Link href={`/users/${u.id}`} title="查看详情" className={clsx(ICON_BTN, 'hover:text-ink')}>
                <Eye size={15} />
              </Link>
              {hasRelationship && (
                <button
                  type="button"
                  title="重置匹配状态（结束关系/对话）"
                  onClick={() => openReset(u)}
                  className={clsx(ICON_BTN, 'hover:text-ink')}
                >
                  <RefreshCw size={15} />
                </button>
              )}
              <button
                type="button"
                title={u.status === 'ACTIVE' ? '封禁用户' : '解封用户'}
                onClick={() => openBan(u)}
                className={clsx(ICON_BTN, u.status === 'ACTIVE' ? 'hover:text-neon-pink' : 'hover:text-ink')}
              >
                {u.status === 'ACTIVE' ? <Ban size={15} /> : <CheckCircle2 size={15} />}
              </button>
            </div>
          );
        },
      },
    ],
    [onChanged, openBan, openReset],
  );

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        loading={loading}
        error={error}
        empty="暂无用户数据"
      />
      {banModal.open && banModal.data && (
        <UserStatusConfirm
          userId={banModal.data.id}
          email={banModal.data.email}
          status={banModal.data.status}
          onDone={onChanged}
          onClose={banModal.close}
        />
      )}
      {resetModal.open && resetModal.data && (
        <UserResetConfirm
          userId={resetModal.data.id}
          display={resetModal.data.profile?.nickname ?? resetModal.data.email}
          onDone={onChanged}
          onClose={resetModal.close}
        />
      )}
    </>
  );
}
