'use client';

/**
 * 旧路由 /admin-accounts 已由 /accounts（学生会/商家/管理员 Tabs）取代。
 * 保留此路由做永久跳转，避免旧书签/外链 404。
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminAccountsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/accounts');
  }, [router]);
  return null;
}
