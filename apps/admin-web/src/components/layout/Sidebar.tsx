'use client';

/**
 * 角色化侧边栏（spec §5 导航）
 * TEAM/SUPER：总览/用户/学校/账号/广告/财务/广场发帖/问卷/匹配/系统设置(SUPER)
 * STUDENT_UNION：总览/本校用户/赞助商/广告审核/发帖子/收益提现
 * SPONSOR：总览/广告投放/账户
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  School,
  ShieldCheck,
  Megaphone,
  ShieldAlert,
  Banknote,
  Inbox,
  Send,
  ClipboardList,
  Zap,
  Settings,
  Store,
  Wallet,
  User,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clearAuth, isTeam, isUnion, ROLE_LABELS, type AdminInfo } from '@/lib/auth';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** 仅 SUPER 可见 */
  superOnly?: boolean;
}

const TEAM_NAV: NavItem[] = [
  { label: '总览', href: '/dashboard', icon: LayoutDashboard },
  { label: '用户管理', href: '/users', icon: Users },
  { label: '学校管理', href: '/schools', icon: School },
  { label: '账号管理', href: '/accounts', icon: ShieldCheck },
  { label: '广告管理', href: '/ads', icon: Megaphone },
  { label: '广场管理', href: '/moderation', icon: ShieldAlert },
  { label: '财务', href: '/finance', icon: Banknote },
  { label: '官网提交', href: '/submissions', icon: Inbox },
  { label: '广场发帖', href: '/square-post', icon: Send },
  { label: '问卷', href: '/questionnaire', icon: ClipboardList },
  { label: '匹配', href: '/matching', icon: Zap },
  { label: '系统设置', href: '/settings', icon: Settings, superOnly: true },
];

const UNION_NAV: NavItem[] = [
  { label: '总览', href: '/dashboard', icon: LayoutDashboard },
  { label: '本校用户', href: '/users', icon: Users },
  { label: '赞助商', href: '/sponsors', icon: Store },
  { label: '广告审核', href: '/ads', icon: Megaphone },
  { label: '校园墙管理', href: '/moderation', icon: ShieldAlert },
  { label: '发帖子', href: '/square-post', icon: Send },
  { label: '收益提现', href: '/earnings', icon: Wallet },
];

const SPONSOR_NAV: NavItem[] = [
  { label: '总览', href: '/dashboard', icon: LayoutDashboard },
  { label: '广告投放', href: '/ads', icon: Megaphone },
  { label: '账户', href: '/account', icon: User },
];

function navForAdmin(admin: AdminInfo | null): NavItem[] {
  if (!admin) return [];
  if (isTeam(admin.role)) {
    return TEAM_NAV.filter((item) => !item.superOnly || admin.role === 'SUPER');
  }
  if (isUnion(admin.role)) return UNION_NAV;
  return SPONSOR_NAV;
}

export default function Sidebar({
  admin,
  open,
  onClose,
}: {
  admin: AdminInfo | null;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = navForAdmin(admin);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  /** 学校 / 机构副标题行 */
  const orgLine = admin?.schoolName || admin?.organizationName || admin?.email || '';

  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={onClose} />}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-outline-variant/30 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Wordmark + 身份 */}
        <div className="px-6 py-5 border-b border-outline-variant/30">
          <div className="flex items-center gap-2">
            <p className="font-display font-extrabold tracking-tighter text-on-surface text-lg leading-none">
              UniMatcha
            </p>
            <span className="w-2 h-2 rounded-full bg-neon shrink-0" aria-hidden />
          </div>
          <p className="text-[10px] font-display font-bold tracking-[0.3em] uppercase text-outline mt-1">
            Admin Console
          </p>
          {admin && (
            <div className="mt-3">
              <span className="badge badge-ink text-[10px] tracking-[0.1em]">
                {ROLE_LABELS[admin.role] ?? admin.role}
              </span>
              <p className="text-sm font-semibold text-on-surface mt-2 truncate">{admin.name}</p>
              {orgLine && <p className="text-xs text-outline truncate mt-0.5">{orgLine}</p>}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx('nav-item', isActive && 'nav-item-active')}
                onClick={onClose}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 退出登录 */}
        <div className="px-3 py-4 border-t border-outline-variant/30">
          <button onClick={handleLogout} className="btn-danger btn-sm w-full">
            <LogOut size={15} />
            退出登录
          </button>
        </div>
      </aside>
    </>
  );
}
