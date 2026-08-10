/**
 * token 存取与角色谓词（无 React 依赖）。
 * 身份对象不落 localStorage——唯一真源是 GET /admin/auth/me（见 auth-context）。
 */
import type { AdminRole } from './types';

const TOKEN_KEY = 'admin_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** SUPER 或 TEAM（平台侧） */
export function isTeam(role?: AdminRole | null): boolean {
  return role === 'SUPER' || role === 'TEAM';
}

export function isUnion(role?: AdminRole | null): boolean {
  return role === 'STUDENT_UNION';
}

export function isSponsor(role?: AdminRole | null): boolean {
  return role === 'SPONSOR';
}
