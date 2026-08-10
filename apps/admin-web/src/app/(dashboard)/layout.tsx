'use client';

/**
 * 后台区布局：AdminProvider（/me 引导）→ Guard（路由级守卫）→ AppShell。
 * 认证未解析完子页不挂载——未登录不发一发业务请求，越权直链无内容闪现。
 */
import { AdminProvider, Guard } from '@/lib/auth-context';
import { AppShell } from '@/components/layout/AppShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <Guard>
        <AppShell>{children}</AppShell>
      </Guard>
    </AdminProvider>
  );
}
