'use client';

/**
 * 旧占位路由 /relationship 已在 admin 重写中移除（spec §5 导航不含此项）。
 * 保留路由做跳转，避免旧书签 404。
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RelationshipRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return null;
}
