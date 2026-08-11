'use client';

/**
 * 三个 tab 的表格列定义（ACC-2 / ACC-3 / 管理员）。
 * 操作列可见性由调用方按角色决定：SUPER 全量；学生会可停启本校来源广告商；TEAM 不显示。
 */
import { Ban, CheckCircle } from 'lucide-react';
import type { Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { ADMIN_ROLE } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import type { AdminAccount } from '@/lib/types';

export interface AccountColumnOpts {
  /** 是否渲染停用/启用操作列 */
  canOperate: boolean;
  onToggle: (row: AdminAccount) => void;
}

/** 展示名统一口径：广告商优先组织名（停启确认弹窗文案同源） */
export function accountDisplayName(a: AdminAccount): string {
  return a.organizationName || a.name;
}

const statusCol: Column<AdminAccount> = {
  key: 'isActive',
  header: '状态',
  // isActive 是布尔非枚举，不入 labels.ts——徽标色与全站启停语义一致（neon=正常/pink=停用）
  render: (a) => (
    <Badge variant={a.isActive ? 'neon' : 'pink'}>{a.isActive ? '启用' : '停用'}</Badge>
  ),
};

const createdCol: Column<AdminAccount> = {
  key: 'createdAt',
  header: '创建时间',
  render: (a) => <span className="font-mono text-xs">{formatDate(a.createdAt)}</span>,
};

const emailCol: Column<AdminAccount> = {
  key: 'email',
  header: 'Email',
  render: (a) => <span className="font-mono text-xs">{a.email}</span>,
};

function actionCol(onToggle: (row: AdminAccount) => void): Column<AdminAccount> {
  return {
    key: 'actions',
    header: '操作',
    align: 'right',
    render: (a) => (
      <Button
        size="sm"
        variant={a.isActive ? 'danger' : 'secondary'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(a);
        }}
      >
        {a.isActive ? <Ban size={13} /> : <CheckCircle size={13} />}
        {a.isActive ? '停用' : '启用'}
      </Button>
    ),
  };
}

/** ACC-2 学生会列：学校/名称/Email/状态/创建时间 */
export function unionColumns(opts: AccountColumnOpts): Column<AdminAccount>[] {
  return [
    {
      key: 'school',
      header: '学校',
      render: (a) => (
        <span className="font-display font-bold text-on-surface">{a.school?.name ?? '-'}</span>
      ),
    },
    { key: 'name', header: '名称', render: (a) => a.name },
    emailCol,
    statusCol,
    createdCol,
    ...(opts.canOperate ? [actionCol(opts.onToggle)] : []),
  ];
}

/** ACC-3 广告商列：组织名/来源/联系方式/Email/状态/创建时间 */
export function sponsorColumns(opts: AccountColumnOpts): Column<AdminAccount>[] {
  return [
    {
      key: 'organizationName',
      header: '组织名',
      render: (a) => (
        <span className="font-display font-bold text-on-surface">{accountDisplayName(a)}</span>
      ),
    },
    {
      key: 'source',
      header: '来源',
      // 平台直签=描边徽标；学生会自拉=校名 ink 徽标（对应投放范围与分成档口径）
      render: (a) =>
        a.sourcedBySchool ? (
          <Badge variant="ink">{a.sourcedBySchool.name}</Badge>
        ) : (
          <Badge variant="outline">平台直签</Badge>
        ),
    },
    {
      key: 'contact',
      header: '联系方式',
      render: (a) =>
        a.contactName || a.contactPhone ? (
          <span className="text-sm">
            {a.contactName ?? '-'}
            {a.contactPhone && (
              <span className="font-mono text-xs text-on-surface-variant ml-2">
                {a.contactPhone}
              </span>
            )}
          </span>
        ) : (
          '-'
        ),
    },
    emailCol,
    statusCol,
    createdCol,
    ...(opts.canOperate ? [actionCol(opts.onToggle)] : []),
  ];
}

/** 管理员列（SUPER 专属 tab，SUPER+TEAM 合并展示）：名称/Email/角色/状态/创建时间 */
export function adminColumns(opts: AccountColumnOpts): Column<AdminAccount>[] {
  return [
    {
      key: 'name',
      header: '名称',
      render: (a) => <span className="font-display font-bold text-on-surface">{a.name}</span>,
    },
    emailCol,
    {
      key: 'role',
      header: '角色',
      render: (a) => <StatusBadge meta={ADMIN_ROLE} value={a.role} />,
    },
    statusCol,
    createdCol,
    ...(opts.canOperate ? [actionCol(opts.onToggle)] : []),
  ];
}
