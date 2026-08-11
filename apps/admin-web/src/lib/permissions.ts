/**
 * 导航 + 路由权限的单一真源。
 * Sidebar 渲染 navForRole()，Guard 校验 canAccess()——
 * 「菜单里有但没守卫」或「有守卫但进不去」在结构上不可能发生。
 * 仪表盘待办 chip 的深链一律取 DEEP_LINKS，禁止手写 URL。
 */
import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  Coins,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageSquareWarning,
  School,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserRound,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { AdminRole } from './types';

export const ALL_ROLES: AdminRole[] = ['SUPER', 'TEAM', 'STUDENT_UNION', 'SPONSOR'];

export type NavSection = 'overview' | 'content' | 'commerce' | 'platform' | 'system';

export const SECTION_LABELS: Record<NavSection, string> = {
  overview: '总览',
  content: '用户与内容',
  commerce: '商业化',
  platform: '平台运营',
  system: '系统',
};

export interface NavEntry {
  href: string;
  section: NavSection;
  icon: LucideIcon;
  roles: AdminRole[];
  label: string;
  /** 按角色差异化的菜单文案（如 /users 对学生会显示「本校用户」） */
  roleLabels?: Partial<Record<AdminRole, string>>;
  /** 团队仪表盘快捷入口标记 */
  quickLink?: boolean;
}

/** 侧栏条目（展示顺序即数组顺序） */
export const NAV: NavEntry[] = [
  { href: '/dashboard', section: 'overview', icon: LayoutDashboard, roles: ALL_ROLES, label: '总览' },

  { href: '/users', section: 'content', icon: Users, roles: ['SUPER', 'TEAM', 'STUDENT_UNION'], label: '用户管理', roleLabels: { STUDENT_UNION: '本校用户' }, quickLink: true },
  { href: '/moderation', section: 'content', icon: ShieldAlert, roles: ['SUPER', 'TEAM', 'STUDENT_UNION'], label: '广场管理', roleLabels: { STUDENT_UNION: '校园墙管理' }, quickLink: true },
  { href: '/feedback', section: 'content', icon: MessageSquareWarning, roles: ['SUPER', 'TEAM'], label: '用户反馈' },
  { href: '/events', section: 'content', icon: CalendarDays, roles: ['SUPER', 'TEAM', 'STUDENT_UNION'], label: '活动管理', quickLink: true },

  { href: '/ads', section: 'commerce', icon: Megaphone, roles: ALL_ROLES, label: '广告管理', roleLabels: { STUDENT_UNION: '广告审核', SPONSOR: '广告投放' }, quickLink: true },
  { href: '/wallet', section: 'commerce', icon: Coins, roles: ['SPONSOR'], label: '能量钱包' },
  { href: '/partners', section: 'commerce', icon: HeartHandshake, roles: ALL_ROLES, label: '合作洽谈', roleLabels: { SPONSOR: '高校合作', STUDENT_UNION: '广告商合作' } },
  { href: '/finance', section: 'commerce', icon: Banknote, roles: ['SUPER', 'TEAM'], label: '财务', quickLink: true },
  { href: '/submissions', section: 'commerce', icon: Inbox, roles: ['SUPER', 'TEAM'], label: '官网提交' },
  { href: '/accounts', section: 'commerce', icon: ShieldCheck, roles: ['STUDENT_UNION'], label: '广告商' },
  { href: '/earnings', section: 'commerce', icon: Wallet, roles: ['STUDENT_UNION'], label: '收益提现' },
  { href: '/square-post', section: 'commerce', icon: Send, roles: ['SPONSOR'], label: '官方发帖' },

  { href: '/schools', section: 'platform', icon: School, roles: ['SUPER', 'TEAM'], label: '学校管理', quickLink: true },
  { href: '/matching', section: 'platform', icon: Zap, roles: ['SUPER', 'TEAM'], label: '匹配' },
  { href: '/questionnaire', section: 'platform', icon: ClipboardList, roles: ['SUPER', 'TEAM'], label: '问卷' },

  { href: '/accounts', section: 'system', icon: ShieldCheck, roles: ['SUPER', 'TEAM'], label: '账号管理' },
  { href: '/settings', section: 'system', icon: Settings, roles: ['SUPER'], label: '系统设置' },
];

/** 非菜单路由的访问规则（子路由按最长前缀继承 NAV；此表只放真正的例外） */
export const EXTRA_ROUTES: { prefix: string; roles: AdminRole[]; label: string; icon: LucideIcon }[] = [
  // 账号设置：全角色可达（修旧版 TEAM/SUPER 无入口改密码的缺陷）；由 Sidebar 底部固定渲染
  { prefix: '/account', roles: ALL_ROLES, label: '账号设置', icon: UserRound },
  // 建单页仅广告商（比 /ads 前缀更长故优先命中；后端 POST 也只放行 SPONSOR，这里防直链看到无用表单）
  { prefix: '/ads/new', roles: ['SPONSOR'], label: '新建广告', icon: Megaphone },
  // 官方发帖页 URL 对团队/学生会保留（经广场管理页按钮进入，不占它们的侧栏）
  { prefix: '/square-post', roles: ['SUPER', 'TEAM', 'STUDENT_UNION', 'SPONSOR'], label: '官方发帖', icon: Send },
  // 学生会侧栏「广告商」与团队「账号管理」共用 /accounts（上面 NAV 已分别声明）
];

/** 仪表盘待办 chip / 快捷跳转的唯一深链定义 */
export const DEEP_LINKS = {
  adsPendingPlatform: '/ads?status=PENDING_PLATFORM_REVIEW',
  adsPendingUnion: '/ads?tab=review',
  financeWithdrawals: '/finance?tab=withdrawals&status=PENDING',
  financeConversions: '/finance?tab=conversions&status=PENDING',
  submissionsPending: '/submissions?tab=SPONSOR&status=PENDING',
  moderationReported: '/moderation?tab=reported',
  moderationPolls: '/moderation?tab=polls',
  earnings: '/earnings',
  sponsorWallet: '/wallet',
  accountsInvites: '/accounts?tab=invites',
  partnersDirectory: '/partners?tab=directory',
} as const;

/** 角色菜单（含分组信息与按角色解析后的 label） */
export function navForRole(role: AdminRole): (NavEntry & { resolvedLabel: string })[] {
  const seen = new Set<string>();
  return NAV.filter((e) => e.roles.includes(role)).filter((e) => {
    // 同一 href 只保留该角色可见的第一条（/accounts 在 commerce 与 system 各有声明）
    if (seen.has(e.href)) return false;
    seen.add(e.href);
    return true;
  }).map((e) => ({ ...e, resolvedLabel: e.roleLabels?.[role] ?? e.label }));
}

/** 路由访问校验：最长前缀匹配 NAV ∪ EXTRA_ROUTES，无匹配一律拒绝 */
export function canAccess(role: AdminRole, pathname: string): boolean {
  const rules: { prefix: string; roles: AdminRole[] }[] = [
    ...NAV.map((e) => ({ prefix: e.href, roles: e.roles })),
    ...EXTRA_ROUTES.map((e) => ({ prefix: e.prefix, roles: e.roles })),
  ];
  let best: { prefix: string; roles: AdminRole[] } | null = null;
  for (const r of rules) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + '/')) {
      if (!best || r.prefix.length > best.prefix.length) best = r;
      // 同前缀多条规则（如 /accounts）：任一允许即允许
      else if (r.prefix.length === best.prefix.length && r.roles.includes(role)) best = r;
    }
  }
  return !!best && best.roles.includes(role);
}
