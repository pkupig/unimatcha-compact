/**
 * accounts 域 API（admin.controller.ts 的 admin-users 段）。
 * 口径统一（本次重写明确要修的点）：停用/启用一律 updateAdminUser(id,{isActive})——
 * 旧 DELETE /admin-users/:id 仅 SUPER 可调且语义与 PUT isActive:false 重复，
 * 学生会停启本校商家只有 PUT 路径有权限链，故本文件不暴露 DELETE。
 */
import { get, patch, post, put } from './client';
import type {
  AccountsListTab,
  AdminAccount,
  CreateAdminUserData,
  CreateInviteData,
  InviteUseRow,
  ListAdminUsersParams,
  ListInvitesParams,
  ListResult,
  SponsorInvite,
  SponsorInviteListItem,
  UpdateAdminUserData,
} from '@/lib/types';

export function listAdminUsers(
  params: ListAdminUsersParams = {},
): Promise<ListResult<AdminAccount>> {
  return get<ListResult<AdminAccount>>('/admin/admin-users', {
    page: params.page,
    limit: params.limit,
    role: params.role,
    schoolId: params.schoolId,
    isActive: params.isActive,
  });
}

export function createAdminUser(data: CreateAdminUserData): Promise<AdminAccount> {
  return post<AdminAccount>('/admin/admin-users', data);
}

export function updateAdminUser(id: string, data: UpdateAdminUserData): Promise<AdminAccount> {
  return put<AdminAccount>(`/admin/admin-users/${id}`, data);
}

/**
 * 管理员 tab 数据源：后端 role 参数为单值，SUPER+TEAM 需两次请求合并，
 * 按 createdAt 倒序后在前端切页（平台管理员数量小，各拉 100 即覆盖全量）。
 */
export async function listPlatformAdmins(params: {
  page: number;
  limit: number;
  isActive?: string;
}): Promise<ListResult<AdminAccount>> {
  const [supers, teams] = await Promise.all([
    listAdminUsers({ role: 'SUPER', page: 1, limit: 100, isActive: params.isActive }),
    listAdminUsers({ role: 'TEAM', page: 1, limit: 100, isActive: params.isActive }),
  ]);
  const merged = [...supers.items, ...teams.items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const start = (params.page - 1) * params.limit;
  return {
    items: merged.slice(start, start + params.limit),
    total: merged.length,
    page: params.page,
    limit: params.limit,
  };
}

/** 账号列表统一取数入口（按 tab 分派；供 usePagedList 的 fetcher 直连） */
export function fetchAccountsTab(q: {
  tab: AccountsListTab;
  isActive?: string;
  page: number;
  limit: number;
}): Promise<ListResult<AdminAccount>> {
  if (q.tab === 'admin') {
    return listPlatformAdmins({ page: q.page, limit: q.limit, isActive: q.isActive });
  }
  // 学生会视角同样走 role=SPONSOR——服务端自动 scope 到本校来源商家
  return listAdminUsers({
    role: q.tab === 'union' ? 'STUDENT_UNION' : 'SPONSOR',
    page: q.page,
    limit: q.limit,
    isActive: q.isActive,
  });
}

// ── 学生会邀请码（B5，sponsor-invite-admin.controller.ts）────────
// 管理端封装归本域；lib/api/invites.ts 只封装公开注册端点（register 域），勿混。

/** 邀请码列表（学生会强制本校；平台侧可按 schoolId 筛） */
export function listInvites(
  params: ListInvitesParams = {},
): Promise<ListResult<SponsorInviteListItem>> {
  return get<ListResult<SponsorInviteListItem>>('/admin/sponsor-invites', {
    page: params.page,
    limit: params.limit,
    isActive: params.isActive,
    schoolId: params.schoolId,
  });
}

/** 生成邀请码（学生会；后端恒绑定本校，schoolId 不可传） */
export function createInvite(data: CreateInviteData): Promise<SponsorInvite> {
  return post<SponsorInvite>('/admin/sponsor-invites', data);
}

/** 停用/启用（学生会仅本校码，SUPER 任意） */
export function toggleInvite(id: string, isActive: boolean): Promise<SponsorInvite> {
  return patch<SponsorInvite>(`/admin/sponsor-invites/${id}`, { isActive });
}

/** 某码的注册记录（后端 ListQueryDto 仅收 page/limit，多传会 400） */
export function listInviteUses(
  id: string,
  params: { page?: number; limit?: number } = {},
): Promise<ListResult<InviteUseRow>> {
  return get<ListResult<InviteUseRow>>(`/admin/sponsor-invites/${id}/uses`, {
    page: params.page,
    limit: params.limit,
  });
}
