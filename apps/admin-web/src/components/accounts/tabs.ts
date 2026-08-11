/**
 * /accounts 页 tab 配置与解析（页面 ≤150 行硬规则的瘦身抽件）：
 * 平台=学生会/广告商/管理员；学生会=广告商/邀请码（B5）。
 */
import type { AccountsListTab, AccountsTab } from '@/lib/types';

export const PLATFORM_TABS: { key: AccountsTab; label: string }[] = [
  { key: 'union', label: '学生会' },
  { key: 'sponsor', label: '广告商' },
  { key: 'admin', label: '管理员' },
];

export const UNION_TABS: { key: AccountsTab; label: string }[] = [
  { key: 'sponsor', label: '广告商' },
  { key: 'invites', label: '邀请码' },
];

export const CREATE_LABELS: Record<AccountsListTab, string> = {
  union: '创建学生会账号',
  sponsor: '创建广告商账号',
  admin: '创建管理员账号',
};

/** URL ?tab= 解析：非法/越权值回退该视角第一个 tab */
export function parseTab(raw: string | null, allowed: AccountsTab[]): AccountsTab {
  return allowed.includes(raw as AccountsTab) ? (raw as AccountsTab) : allowed[0];
}
