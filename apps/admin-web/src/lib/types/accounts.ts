/**
 * accounts 域契约类型——对照 apps/api/src/admin/admin.service.ts 的 adminSelect
 * 与 dto/admin-user.dto.ts 如实定义（创建/更新/列表三端点返回同一 adminSelect 形状）。
 */
import type { AdminRole } from './common';

/** adminSelect 内嵌的学校裁剪引用（school / sourcedBySchool） */
export interface AccountSchoolRef {
  id: string;
  name: string;
}

/** 后管账号行（GET/POST/PUT /admin/admin-users 统一返回形状） */
export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  /** null = 历史遗留的只读账号（无任何后台操作权，@Roles 已挡在接口外） */
  role: AdminRole | null;
  schoolId: string | null;
  school: AccountSchoolRef | null;
  organizationName: string | null;
  /** SPONSOR 来源：null=平台直签；非空=该校学生会自拉（影响投放范围与分成档） */
  sourcedBySchoolId: string | null;
  sourcedBySchool: AccountSchoolRef | null;
  contactName: string | null;
  contactPhone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 列表查询（ListAdminUsersQueryDto）。
 * 后端 forbidNonWhitelisted：无 search 参数，传了会 400——本域列表不做搜索。
 */
export type ListAdminUsersParams = {
  page?: number;
  limit?: number;
  /** 单值；管理员 tab 需 SUPER/TEAM 两次请求前端合并 */
  role?: AdminRole;
  schoolId?: string;
  /** 'true' / 'false'（后端按字符串解析） */
  isActive?: string;
};

/** 创建（CreateAdminUserDto）；学生会视角后端强制 role=SPONSOR、来源锁本校 */
export type CreateAdminUserData = {
  email: string;
  password: string;
  name: string;
  /** SUPER/TEAM 创建时必填；学生会创建时被后端忽略 */
  role?: AdminRole;
  /** STUDENT_UNION 必填：绑定 School.id */
  schoolId?: string;
  organizationName?: string;
  contactName?: string;
  contactPhone?: string;
  /** SPONSOR 来源学校 School.id；缺省=平台直签 */
  sourcedBySchoolId?: string;
};

/** 更新（UpdateAdminUserDto）；权限字段仅 SUPER，学生会仅可对本校来源广告商切 isActive */
export type UpdateAdminUserData = {
  name?: string;
  password?: string;
  role?: AdminRole;
  schoolId?: string;
  organizationName?: string;
  contactName?: string;
  contactPhone?: string;
  sourcedBySchoolId?: string;
  isActive?: boolean;
};

/**
 * 账号管理页 Tab（admin=SUPER 专属，合并展示 SUPER+TEAM；
 * invites=学生会邀请码 tab，学生会视角专属）
 */
export type AccountsTab = 'union' | 'sponsor' | 'admin' | 'invites';

/** 账号列表三 tab（fetchAccountsTab 合法入参；invites 列表在 InvitesPanel 内自管） */
export type AccountsListTab = Exclude<AccountsTab, 'invites'>;

// ── 学生会邀请码（B5，sponsor-invite-admin.controller.ts）────────

/**
 * 邀请码行——对照 sponsor-invite.service.ts 如实定义：
 * create/toggle 响应 include school（无 createdByAdmin）。
 */
export interface SponsorInvite {
  id: string;
  code: string;
  schoolId: string;
  /** 生成者管理员 id（库中无外键，列表响应由服务端二查拼装成 createdByAdmin） */
  createdByAdminId: string;
  note: string | null;
  isActive: boolean;
  /** 成功注册数（服务端事务内乐观锁自增） */
  usedCount: number;
  /** null = 不限次 */
  maxUses: number | null;
  /** null = 永久有效 */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  school: AccountSchoolRef;
}

/** 列表行：额外带二查拼装的生成者（生成者账号已删则为 null） */
export interface SponsorInviteListItem extends SponsorInvite {
  createdByAdmin: { id: string; name: string } | null;
}

/** 经该码自注册的广告商账号（GET /admin/sponsor-invites/:id/uses 的 select 裁剪） */
export interface InviteUseRow {
  id: string;
  email: string;
  name: string;
  organizationName: string | null;
  contactName: string | null;
  isActive: boolean;
  createdAt: string;
}

/** 创建（CreateInviteDto）；schoolId 不在入参内——后端恒绑定当前学生会本校 */
export type CreateInviteData = {
  /** 备注/用途标签，最长 64 字 */
  note?: string;
  /** 最大使用次数（≥1；缺省不限次） */
  maxUses?: number;
  /** 过期时间 ISO 串（缺省永久有效） */
  expiresAt?: string;
};

/** 邀请码列表查询（ListInvitesQueryDto） */
export type ListInvitesParams = {
  page?: number;
  limit?: number;
  /** 'true' / 'false'（后端按字符串解析） */
  isActive?: string;
  /** 按学校过滤；仅平台侧生效，学生会强制本校 */
  schoolId?: string;
};
