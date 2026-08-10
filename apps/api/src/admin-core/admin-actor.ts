import { AdminRole } from '@prisma/client';

/**
 * 管理端操作者的规范身份（ADMIN 重构 2026-08）。
 *
 * 只由 AdminScopeService.resolveActor 产出；AdminJwtStrategy 把它写进 req.user，
 * 因此所有 /admin/* 路由的 @CurrentAdmin() 拿到的都是本类型——
 * 服务层不得再自行查 AdminUser 或内联声明 CurrentAdmin 形状。
 */
export interface AdminActor {
  id: string;
  email: string;
  name: string;
  /** 归一化角色：原始 role ?? (isSuperAdmin ? SUPER : null)。null = 旧世代只读账号 */
  role: AdminRole | null;
  /** 解析后的 School.id（旧数据 schoolId 存学校名时已尽力解析回真实 id） */
  schoolId: string | null;
  /** 解析后的 School.name，供 Profile.school / SquarePost.school / Event.school 的名字空间比对；
   *  School 行缺失时回退为 schoolId 原始值（与旧 square 兜底行为一致） */
  schoolName: string | null;
  /** SPONSOR 来源：null=平台直签，非空=学生会自拉（ADMIN-REDESIGN §1） */
  sourcedBySchoolId: string | null;
  organizationName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isActive: boolean;
  /** 兼容旧字段；归一化已并入 role，仅为未改造代码保留 */
  isSuperAdmin: boolean;
}

/** resolveActor 可接受的预加载行（与 AdminAuthService.validateAdmin 的 select 对齐） */
export interface AdminUserLike {
  id: string;
  email: string;
  name: string;
  role: AdminRole | null;
  schoolId: string | null;
  organizationName: string | null;
  sourcedBySchoolId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
}
