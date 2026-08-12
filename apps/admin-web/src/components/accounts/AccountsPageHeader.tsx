'use client';

/** /accounts 页头：标题/说明/主按钮按视角与 tab 收口（页面 ≤150 行瘦身抽件） */
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import type { AccountsListTab } from '@/lib/types';
import { CREATE_LABELS } from './tabs';

export function AccountsPageHeader({
  unionView,
  superView,
  invitesTab,
  listTab,
  schoolName,
  onCreateAccount,
  onCreateInvite,
}: {
  unionView: boolean;
  superView: boolean;
  invitesTab: boolean;
  listTab: AccountsListTab;
  schoolName: string;
  onCreateAccount: () => void;
  onCreateInvite: () => void;
}) {
  const title = unionView ? (invitesTab ? '邀请码' : '广告商') : '账号管理';
  const sub = unionView
    ? invitesTab
      ? `${schoolName} · 生成邀请码发给广告商自注册开通投放账号（恒绑定本校，按自拉档分成）`
      : `${schoolName} · 本校广告商账号（经邀请码自注册开通，其广告仅可投放本校，按自拉档分成）`
    : `学生会 / 广告商${superView ? ' / 管理员' : ''} 账号的创建与停启用`;

  return (
    <PageHeader
      caption="ACCOUNTS"
      title={title}
      sub={sub}
      actions={
        // 学生会不可手建广告商（后端 403）——两 tab 主按钮恒为生成邀请码
        unionView ? (
          <Button variant="cta" onClick={onCreateInvite}>
            <Plus size={15} />
            生成邀请码
          </Button>
        ) : (
          <Button variant="cta" onClick={onCreateAccount}>
            <Plus size={15} />
            {CREATE_LABELS[listTab]}
          </Button>
        )
      }
    />
  );
}
