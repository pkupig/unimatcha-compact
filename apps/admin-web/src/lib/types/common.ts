/** 通用契约类型（全站唯一定义处） */

/** 分页列表统一形状（后端 Paginated<T>） */
export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type AdminRole = 'SUPER' | 'TEAM' | 'STUDENT_UNION' | 'SPONSOR';

/** GET /admin/auth/me 与 login.admin 的形状（后端 shapeAdminMe） */
export interface AdminInfo {
  id: string;
  email: string;
  name: string;
  role: AdminRole | null;
  schoolId: string | null;
  schoolName: string | null;
  organizationName: string | null;
  /** SPONSOR 来源：null=平台直签，非空=学生会自拉 */
  sourcedBySchoolId: string | null;
  sourcedBySchoolName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
}
