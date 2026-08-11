'use client';

/**
 * 侧栏：纯渲染 permissions.navForRole()（分组 + 角色差异文案），
 * 底部固定 账号设置（全角色）+ 退出登录。菜单内容不在这里维护——去 permissions.ts。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LogOut, UserRound } from 'lucide-react';
import { useAdmin } from '@/lib/auth-context';
import { navForRole, SECTION_LABELS, type NavSection } from '@/lib/permissions';
import { ADMIN_ROLE, labelOf } from '@/lib/labels';
import { usePartnersUnread } from './PartnersUnreadProvider';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { admin, logout } = useAdmin();
  const pathname = usePathname();
  // 合作消息未读角标（context 由 AppShell 供给，桌面/抽屉双实例共享同一份计数）
  const { count: partnersUnread } = usePartnersUnread();
  if (!admin?.role) return null;

  const entries = navForRole(admin.role);
  const sections = Array.from(new Set(entries.map((e) => e.section))) as NavSection[];
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col bg-white border-r border-outline-variant/40">
      {/* 品牌 + 身份 */}
      <div className="px-5 pt-6 pb-4">
        <p className="font-display font-extrabold tracking-wide text-lg text-ink">
          UNIMATCHA<span className="text-[9px] align-super font-mono text-neon-dark ml-0.5">ADMIN</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="badge badge-ink">{labelOf(ADMIN_ROLE, admin.role)}</span>
          <span className="text-sm font-medium text-on-surface truncate">{admin.name}</span>
        </div>
        <p className="text-xs text-on-surface-variant truncate mt-1">
          {admin.schoolName || admin.organizationName || admin.email}
        </p>
      </div>

      {/* 分组导航 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {sections.map((section) => (
          <div key={section}>
            <p className="caption px-3 mb-1.5">{SECTION_LABELS[section]}</p>
            <div className="space-y-0.5">
              {entries
                .filter((e) => e.section === section)
                .map((e) => (
                  <Link
                    key={e.href}
                    href={e.href}
                    onClick={onNavigate}
                    className={clsx('nav-item', isActive(e.href) && 'nav-item-active')}
                  >
                    <e.icon size={17} />
                    {e.resolvedLabel}
                    {e.href === '/partners' && partnersUnread > 0 && (
                      <span className="badge badge-pink ml-auto">
                        {partnersUnread > 99 ? '99+' : partnersUnread}
                      </span>
                    )}
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </nav>

      {/* 底部固定：账号设置（全角色可达）+ 退出 */}
      <div className="px-3 py-4 border-t border-outline-variant/40 space-y-0.5">
        <Link
          href="/account"
          onClick={onNavigate}
          className={clsx('nav-item', isActive('/account') && 'nav-item-active')}
        >
          <UserRound size={17} />
          账号设置
        </Link>
        <button className="nav-item w-full text-left" onClick={logout}>
          <LogOut size={17} />
          退出登录
        </button>
      </div>
    </aside>
  );
}
