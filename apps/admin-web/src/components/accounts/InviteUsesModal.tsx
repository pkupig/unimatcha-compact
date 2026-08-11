'use client';

/**
 * 邀请码使用记录弹窗（GET /admin/sponsor-invites/:id/uses）：
 * 经该码自注册的商家账号分页小表。
 */
import { Modal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pager } from '@/components/ui/Pager';
import { Badge } from '@/components/ui/Badge';
import { usePagedList } from '@/hooks/usePagedList';
import { listInviteUses } from '@/lib/api/accounts';
import { formatDateTime } from '@/lib/format';
import type { InviteUseRow, SponsorInviteListItem } from '@/lib/types';

const columns: Column<InviteUseRow>[] = [
  {
    key: 'email',
    header: '邮箱',
    render: (u) => <span className="font-mono text-xs">{u.email}</span>,
  },
  {
    key: 'organizationName',
    header: '组织名',
    // registerViaCode 恒写组织名；回退账号名只为防历史脏数据渲染成空
    render: (u) => (
      <span className="font-display font-bold text-on-surface">{u.organizationName || u.name}</span>
    ),
  },
  { key: 'contactName', header: '联系人', render: (u) => u.contactName || '-' },
  {
    key: 'isActive',
    header: '状态',
    // isActive 布尔非枚举，徽标口径与账号列表一致（neon=启用/pink=停用）
    render: (u) => (
      <Badge variant={u.isActive ? 'neon' : 'pink'}>{u.isActive ? '启用' : '停用'}</Badge>
    ),
  },
  {
    key: 'createdAt',
    header: '注册时间',
    render: (u) => <span className="font-mono text-xs">{formatDateTime(u.createdAt)}</span>,
  },
];

export function InviteUsesModal({
  invite,
  onClose,
}: {
  invite: SponsorInviteListItem;
  onClose: () => void;
}) {
  const list = usePagedList<InviteUseRow, Record<string, never>>({
    fetcher: (q) => listInviteUses(invite.id, { page: q.page, limit: q.limit }),
    initialFilters: {},
  });

  return (
    <Modal title={`使用记录 · ${invite.code}`} caption="INVITE USES" size="lg" onClose={onClose}>
      <div className="space-y-3 pb-4">
        <DataTable<InviteUseRow>
          columns={columns}
          rows={list.items}
          rowKey={(u) => u.id}
          loading={list.loading}
          error={list.error}
          empty="尚无商家经此码注册"
        />
        <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
      </div>
    </Modal>
  );
}
