'use client';

/**
 * 认证环路：AdminProvider（启动拉 /me）→ useAdmin() → Guard（路由级守卫）。
 * - 身份唯一真源是 GET /admin/auth/me；不再持久化 admin_info（并做一次性清理）
 * - 401 中途过期：client 清 token → 单次回调 → toast → SPA 跳转（不整页刷新）
 * - /me 网络错误 ≠ 401：整页错误态 + 重试，不误踢正常登录者
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ApiError, setUnauthorizedHandler } from './api/client';
import { getMe } from './api/auth';
import { clearToken, getToken } from './auth';
import { canAccess } from './permissions';
import type { AdminInfo } from './types';
import { Spinner } from '@/components/ui/Spinner';

export type AuthStatus = 'loading' | 'authed' | 'guest' | 'error';

export interface AdminContextValue {
  status: AuthStatus;
  /** status === 'authed' 时非空 */
  admin: AdminInfo | null;
  /** 重拉 /me（账号设置改名后刷新侧栏） */
  refresh(): Promise<void>;
  logout(): void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [admin, setAdmin] = useState<AdminInfo | null>(null);

  const bootstrap = useCallback(async () => {
    // 旧版遗留的身份缓存一次性清理（身份只信 /me）
    try {
      localStorage.removeItem('admin_info');
    } catch {
      /* SSR/无痕环境忽略 */
    }
    if (!getToken()) {
      setStatus('guest');
      return;
    }
    setStatus('loading');
    try {
      const me = await getMe();
      setAdmin(me);
      setStatus('authed');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        clearToken();
        setAdmin(null);
        setStatus('guest');
      } else {
        // 网络/5xx：不踢登录，给重试
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 401 中途过期：单次 toast + 转 guest（Guard 负责跳转）
  useEffect(() => {
    setUnauthorizedHandler(() => {
      toast.error('登录已过期，请重新登录');
      setAdmin(null);
      setStatus('guest');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await getMe();
    setAdmin(me);
    setStatus('authed');
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAdmin(null);
    setStatus('guest');
  }, []);

  return (
    <AdminContext.Provider value={{ status, admin, refresh, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin 必须在 AdminProvider 内使用');
  return ctx;
}

/** 路由级守卫：认证未解析完不挂载子页（未登录页面不发一发 API），越权直链跳仪表盘 */
export function Guard({ children }: { children: ReactNode }) {
  const { status, admin } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();

  const allowed =
    status === 'authed' && admin?.role ? canAccess(admin.role, pathname) : false;

  useEffect(() => {
    if (status === 'guest') {
      router.replace('/login');
    } else if (status === 'authed' && !allowed) {
      // /dashboard 对所有角色开放，不会形成跳转环
      router.replace('/dashboard');
    }
  }, [status, allowed, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (status === 'error') {
    return <BootstrapError />;
  }
  if (status !== 'authed' || !allowed) return null;
  return <>{children}</>;
}

function BootstrapError() {
  const { refresh, logout } = useAdmin();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="caption">CONNECTION ERROR</p>
      <p className="text-on-surface font-display font-bold text-lg">无法连接服务器</p>
      <p className="text-sm text-on-surface-variant">身份校验失败（网络或服务异常），请稍后重试。</p>
      <div className="flex gap-3">
        <button className="btn-primary btn-sm" onClick={() => void refresh().catch(() => undefined)}>
          重试
        </button>
        <button className="btn-secondary btn-sm" onClick={logout}>
          退出登录
        </button>
      </div>
    </div>
  );
}
