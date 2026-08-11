'use client';

/**
 * 合作消息未读角标的唯一数据源（侧栏 /partners 徽标 + 线程页读后同步共用）。
 * - 仅 SPONSOR/STUDENT_UNION 拉数（后端 unread-count 也只对这两角色开放，其余角色恒 0 不发请求）
 * - 挂载即拉 + 60s 轮询；页面不可见暂停计时（省请求），回前台立即补拉一次再复表
 * - 线程页读消息后（服务端已标已读）调 refresh() 即时清角标，不等下一轮询
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getPartnersUnreadCount } from '@/lib/api/partners';
import { useAdmin } from '@/lib/auth-context';
import { isSponsor, isUnion } from '@/lib/auth';

export interface PartnersUnreadValue {
  count: number;
  refresh(): Promise<void>;
}

// 带缺省值：AppShell 恒有 Provider，但缺省保证组件在无 Provider 场景（测试/独立渲染）不崩
const PartnersUnreadContext = createContext<PartnersUnreadValue>({
  count: 0,
  refresh: async () => undefined,
});

const POLL_MS = 60_000;

export function PartnersUnreadProvider({ children }: { children: ReactNode }) {
  const { admin } = useAdmin();
  const enabled = isSponsor(admin?.role) || isUnion(admin?.role);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await getPartnersUnreadCount();
      setCount(res.count);
    } catch {
      // 角标属增强信息：拉取失败静默保留旧值，不打断主流程
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void refresh();
        start();
      }
    };
    void refresh();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, refresh]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);
  return <PartnersUnreadContext.Provider value={value}>{children}</PartnersUnreadContext.Provider>;
}

export function usePartnersUnread(): PartnersUnreadValue {
  return useContext(PartnersUnreadContext);
}
