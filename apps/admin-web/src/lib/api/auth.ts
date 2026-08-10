import { get, post, put } from './client';
import type { AdminInfo } from '../types';

export function login(email: string, password: string): Promise<{ admin: AdminInfo; token: string }> {
  return post('/admin/auth/login', { email, password });
}

/** 身份唯一真源（实时读库；停用/降权在下次加载即生效） */
export function getMe(): Promise<AdminInfo> {
  return get('/admin/auth/me');
}

/** 本人资料自助维护（改名/改密码走 admin-users 自更新，越权字段服务端拦截） */
export function updateMyProfile(
  id: string,
  data: { name?: string; password?: string; contactName?: string; contactPhone?: string },
): Promise<AdminInfo> {
  return put(`/admin/admin-users/${id}`, data);
}
