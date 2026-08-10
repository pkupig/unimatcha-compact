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

/** 更新（UpdateAdminUserDto）；权限字段仅 SUPER，学生会仅可对本校来源商家切 isActive */
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

/** 账号管理页 Tab（admin=SUPER 专属，合并展示 SUPER+TEAM） */
export type AccountsTab = 'union' | 'sponsor' | 'admin';
