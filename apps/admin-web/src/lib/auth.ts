'use client';

/** 与后端 AdminRole 枚举保持一致（不改值） */
export type AdminRole = 'SUPER' | 'TEAM' | 'STUDENT_UNION' | 'SPONSOR';

/** 登录返回并缓存在 localStorage 的管理员信息 */
export interface AdminInfo {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** STUDENT_UNION：绑定的 School.id；其他角色可能为 null */
  schoolId?: string | null;
  /** STUDENT_UNION：学校名（后端冗余返回，便于展示） */
  schoolName?: string | null;
  /** SPONSOR：商家/机构名 */
  organizationName?: string | null;
  /** SPONSOR：null = 平台直签；否则为拉新学生会的 School.id */
  sourcedBySchoolId?: string | null;
  isActive?: boolean;
  isSuperAdmin?: boolean;
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER: '超级管理员',
  TEAM: '平台团队',
  STUDENT_UNION: '学生会',
  SPONSOR: '商家',
};

/** 平台团队（SUPER 或 TEAM） */
export function isTeam(role?: AdminRole | string | null): boolean {
  return role === 'SUPER' || role === 'TEAM';
}

/** 学生会 */
export function isUnion(role?: AdminRole | string | null): boolean {
  return role === 'STUDENT_UNION';
}

/** 商家/赞助商 */
export function isSponsor(role?: AdminRole | string | null): boolean {
  return role === 'SPONSOR';
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

export function setToken(token: string, admin: AdminInfo) {
  localStorage.setItem('admin_token', token);
  localStorage.setItem('admin_info', JSON.stringify(admin));
}

export function clearAuth() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_info');
}

export function getAdminInfo(): AdminInfo | null {
  if (typeof window === 'undefined') return null;
  const info = localStorage.getItem('admin_info');
  try {
    return info ? (JSON.parse(info) as AdminInfo) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
