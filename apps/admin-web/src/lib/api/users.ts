/**
 * users 域 API（apps/api/src/users/users-admin.controller.ts）。
 * SUPER/TEAM 全量；STUDENT_UNION 后端自动 scope 本校；SPONSOR 一律 403。
 */
import { get, patch } from './client';
import type {
  AdminUserDetail,
  AdminUserListItem,
  ListResult,
  ResetUserModeResult,
  UpdateUserStatusResult,
  UpdateUserVerificationResult,
  UserStatus,
  UserStatusFilter,
  VerificationStatus,
} from '@/lib/types';

export function listUsers(params: {
  page?: number;
  limit?: number;
  /** 模糊匹配 email / 昵称 */
  search?: string;
  status?: UserStatusFilter;
}): Promise<ListResult<AdminUserListItem>> {
  return get('/admin/users', params);
}

export function getUserDetail(id: string): Promise<AdminUserDetail> {
  return get(`/admin/users/${id}`);
}

/** 封禁/解封 */
export function updateUserStatus(id: string, status: UserStatus): Promise<UpdateUserStatusResult> {
  return patch(`/admin/users/${id}/status`, { status });
}

/** 重置匹配模式：临时对话→过期、已确认关系→解除，双方状态机回 idle */
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
