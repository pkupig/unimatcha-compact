'use client';

/**
 * 学生会邀请码 tab（/accounts?tab=invites，B5）：列表 + 停启用 + 使用记录。
 * 「生成邀请码」按钮在页头（page.tsx），经 createOpen/onCreateClose 受控挂载到
 * 本面板——「创建成功 → 列表刷新」的闭环不出面板。
 */
import toast from 'react-hot-toast';
import { Ban, CheckCircle, Link2, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pager } from '@/components/ui/Pager';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { listInvites, toggleInvite } from '@/lib/api/accounts';
import { copyText } from '@/lib/clipboard';
import { INVITE_STATUS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import type { SponsorInviteListItem } from '@/lib/types';
import { ActiveFilterBar } from './ActiveFilterBar';
import { CreateInviteModal, inviteRegisterLink } from './CreateInviteModal';
import { InviteUsesModal } from './InviteUsesModal';

type InviteStatusKey = keyof typeof INVITE_STATUS.labels;

/** 展示态派生（校验顺序对齐后端 getInviteInfo：停用 → 过期 → 用完 → 生效） */
function inviteStatus(r: SponsorInviteListItem): InviteStatusKey {
  if (!r.isActive) return 'disabled';
  if (r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now()) return 'expired';
  if (r.maxUses !== null && r.usedCount >= r.maxUses) return 'exhausted';
  return 'active';
}

function inviteColumns(opts: {
  onUses: (r: SponsorInviteListItem) => void;
  onToggle: (r: SponsorInviteListItem) => void;
}): Column<SponsorInviteListItem>[] {
  return [
    {
      key: 'code',
      header: '邀请码',
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-on-surface">{r.code}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copyText(inviteRegisterLink(r.code), '邀请链接已复制')}
          >
            <Link2 size={13} />
            复制链接
          </Button>
        </span>
      ),
    },
    { key: 'note', header: '备注', render: (r) => r.note || '-' },
    {
      key: 'status',
      header: '状态',
      render: (r) => <StatusBadge meta={INVITE_STATUS} value={inviteStatus(r)} />,
    },
    {
      key: 'used',
      header: '已用',
      render: (r) => (
        <span className="font-mono text-xs">
          {r.usedCount} / {r.maxUses ?? '不限'}
        </span>
      ),
    },
    {
      key: 'expiresAt',
      header: '有效期',
      render: (r) =>
        r.expiresAt ? <span className="font-mono text-xs">{formatDate(r.expiresAt)}</span> : '永久',
    },
    {
      key: 'createdAt',
      header: '创建时间',
      render: (r) => <span className="font-mono text-xs">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (r) => (
        <span className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => opts.onUses(r)}>
            <Users size={13} />
            使用记录
          </Button>
          <Button
            size="sm"
            variant={r.isActive ? 'danger' : 'secondary'}
            onClick={() => opts.onToggle(r)}
          >
            {r.isActive ? <Ban size={13} /> : <CheckCircle size={13} />}
            {r.isActive ? '停用' : '启用'}
          </Button>
        </span>
      ),
    },
  ];
}

export function InvitesPanel({
  createOpen,
  onCreateClose,
}: {
  createOpen: boolean;
  onCreateClose: () => void;
}) {
  const list = usePagedList<SponsorInviteListItem, { isActive: string }>({
    fetcher: (q) => listInvites({ isActive: q.isActive || undefined, page: q.page, limit: q.limit }),
    initialFilters: { isActive: '' },
  });
  const usesModal = useModal<SponsorInviteListItem>();
  const toggleModal = useModal<SponsorInviteListItem>();
  const toggleRow = toggleModal.data;

  const columns = inviteColumns({ onUses: usesModal.openWith, onToggle: toggleModal.openWith });

  return (
    <>
      <ActiveFilterBar
        value={list.filters.isActive}
        onChange={(v) => list.setFilter('isActive', v)}
      />

      <Card flush>
        <DataTable<SponsorInviteListItem>
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          empty="暂无邀请码 · 生成后发给广告商自注册开通投放账号"
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {createOpen && <CreateInviteModal onClose={onCreateClose} onDone={() => void list.refresh()} />}
      {usesModal.open && usesModal.data && (
        <InviteUsesModal invite={usesModal.data} onClose={usesModal.close} />
      )}
      {toggleModal.open && toggleRow && (
        <ConfirmDialog
          title={toggleRow.isActive ? '停用邀请码' : '启用邀请码'}
          danger={toggleRow.isActive}
          confirmText={toggleRow.isActive ? '停用' : '启用'}
          message={
            toggleRow.isActive
              ? `停用后「${toggleRow.code}」立即失效，广告商无法再经此码注册；已注册的账号不受影响，可随时重新启用。`
              : `确认重新启用「${toggleRow.code}」？启用后广告商即可继续经此码注册（过期时间与次数上限仍独立生效）。`
          }
          onConfirm={async () => {
            await toggleInvite(toggleRow.id, !toggleRow.isActive);
            toast.success(toggleRow.isActive ? '邀请码已停用' : '邀请码已启用');
            await list.refresh();
          }}
          onClose={toggleModal.close}
        />
      )}
    </>
  );
}
