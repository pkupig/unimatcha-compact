/**
 * users 域 API（apps/api/src/users/users-admin.controller.ts）。
 * SUPER/TEAM 全量；STUDENT_UNION 只开放群体概览/认证审核/认证与封禁操作
 * （名单/详情/重置匹配对学生会 403，产品口径：不可见个体）；SPONSOR 一律 403。
 */
import { get, patch } from './client';
import type {
  AdminUserDetail,
  AdminUserListItem,
  ListResult,
  PendingVerificationItem,
  ResetUserModeResult,
  UpdateUserStatusResult,
  UpdateUserVerificationResult,
  UsersOverview,
  UserStatus,
  UserStatusFilter,
  VerificationStatus,
} from '@/lib/types';

/** 名单（SUPER/TEAM 专属，学生会 403） */
export function listUsers(params: {
  page?: number;
  limit?: number;
  /** 模糊匹配 email / 昵称 */
  search?: string;
  status?: UserStatusFilter;
}): Promise<ListResult<AdminUserListItem>> {
  return get('/admin/users', params);
}

/** 详情（SUPER/TEAM 专属，学生会 403） */
export function getUserDetail(id: string): Promise<AdminUserDetail> {
  return get(`/admin/users/${id}`);
}

/** 群体概览（学生会恒本校；school 参数仅 SUPER/TEAM 有效） */
export function getUsersOverview(school?: string): Promise<UsersOverview> {
  return get('/admin/users/overview', { school });
}

/** 待审认证队列（受限投影，学生会本校 / 平台全量） */
export function listPendingVerifications(params: {
  page?: number;
  limit?: number;
}): Promise<ListResult<PendingVerificationItem>> {
  return get('/admin/users/verifications', params);
}

/** 封禁/解封 */
export function updateUserStatus(id: string, status: UserStatus): Promise<UpdateUserStatusResult> {
  return patch(`/admin/users/${id}/status`, { status });
}

/** 重置匹配模式（SUPER/TEAM 专属，学生会 403）：临时对话→过期、已确认关系→解除，双方状态机回 idle */
export function resetUserMode(id: string): Promise<ResetUserModeResult> {
  return patch(`/admin/users/${id}/reset-mode`, {});
}

/** 学生认证状态即改 */
export function updateUserVerification(
  id: string,
  status: VerificationStatus,
): Promise<UpdateUserVerificationResult> {
  return patch(`/admin/users/${id}/verification`, { status });
}
