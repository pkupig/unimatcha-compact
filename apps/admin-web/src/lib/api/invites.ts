/**
 * invites 域 API（商家公开自注册侧：邀请码预校验 + 经码注册）。
 * 域内例外：同 earnings 先例，无独立 types stub 文件，契约类型内联导出。
 * 后端真源：sponsor-invite.service getInviteInfo / registerViaCode——
 * 经 /admin/auth 暴露为公开端点（无鉴权 + IP 限流），供 (dashboard) 组外的 /register 页使用。
 */
import { get, post } from './client';
import type { AdminInfo } from '@/lib/types';

export type InviteInvalidReason = 'NOT_FOUND' | 'DISABLED' | 'EXPIRED' | 'EXHAUSTED';

/** GET /admin/auth/invite-info 响应：恒 200，valid=false 时带 reason，不抛错 */
export interface InviteInfo {
  valid: boolean;
  /** valid=true 时为邀请学校名（注册页「XX 学生会邀请你入驻」） */
  schoolName?: string;
  reason?: InviteInvalidReason;
}

/** 邀请码预校验（注册页挂载/码变更时防抖调用） */
export function getInviteInfo(code: string): Promise<InviteInfo> {
  return get<InviteInfo>('/admin/auth/invite-info', { code });
}

/** 商家经学生会邀请码自注册：注册即登录，返回与 login 同形状的 {admin, token} */
export function registerSponsor(data: {
  code: string;
  email: string;
  password: string;
  organizationName: string;
  contactName: string;
  contactPhone?: string;
}): Promise<{ admin: AdminInfo; token: string }> {
  return post<{ admin: AdminInfo; token: string }>('/admin/auth/register-sponsor', data);
}
