/**
 * invites 域 API（广告商公开自注册侧：邀请码预校验 + 经码注册）。
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

/**
 * 广告商自注册：有码=学生会邀请（归属该校，自拉分成档）；无码=平台直签。
 * 注册即登录，返回与 login 同形状的 {admin, token}。
 */
export function registerSponsor(data: {
  /** 选填：空/未传 = 平台直签 */
  code?: string;
  email: string;
  password: string;
  organizationName: string;
  contactName: string;
  contactPhone?: string;
}): Promise<{ admin: AdminInfo; token: string }> {
  // code 为空时整个字段省略——后端 forbidNonWhitelisted 对缺失字段安全，
  // 但空串仍会进 @IsString 校验链，故不发空值
  const { code, ...rest } = data;
  const body = code && code.trim() ? { ...rest, code: code.trim() } : rest;
  return post<{ admin: AdminInfo; token: string }>('/admin/auth/register-sponsor', body);
}
