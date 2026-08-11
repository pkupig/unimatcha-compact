/**
 * submissions 域契约类型（对照 apps/api/src/admin/admin.service.ts 官网提交段
 * 与 dto/submission.dto.ts 如实定义；PublicSubmission 见 prisma schema）。
 */
import type { AdminRole } from './common';

export type SubmissionType = 'WAITLIST' | 'SPONSOR';
export type SubmissionStatus = 'PENDING' | 'CONTACTED' | 'APPROVED' | 'REJECTED';
/** PATCH 可流转的目标状态；APPROVED 只能经 convert 达成（后端 DTO 拒绝） */
export type SubmissionPatchStatus = 'PENDING' | 'CONTACTED' | 'REJECTED';

/** listSubmissions 手动 join 的开通账号（AdminUser.role 可为 null=仅查看） */
export interface SubmissionConvertedAdmin {
  id: string;
  name: string;
  role: AdminRole | null;
  isActive: boolean;
}

/** PublicSubmission 原始行（updateSubmission 的返回形状，无 convertedAdmin） */
export interface SubmissionRecord {
  id: string;
  type: SubmissionType;
  email: string;
  organization: string | null;
  message: string | null;
  /** 官网提交时的界面语言（zh/en），可空 */
  locale: string | null;
  createdAt: string;
  status: SubmissionStatus;
  handledByAdminId: string | null;
  handledAt: string | null;
  /** 处理备注（联系记录/关闭原因） */
  handleNote: string | null;
  convertedAdminId: string | null;
  updatedAt: string;
}

/** 列表项 = 原始行 + convertedAdmin（后端无外键，service 二次查询拼装） */
export interface Submission extends SubmissionRecord {
  convertedAdmin: SubmissionConvertedAdmin | null;
}

/** PATCH /admin/submissions/:id：note 缺省保留原备注，传值覆盖 */
export interface UpdateSubmissionInput {
  status: SubmissionPatchStatus;
  note?: string;
}

/**
 * POST /admin/submissions/:id/convert：
 * STUDENT_UNION → schoolId / newSchoolName 二选一；
 * SPONSOR → organizationName 必填，schoolId 作为可选来源学校。
 */
export interface ConvertSubmissionInput {
  accountRole: 'STUDENT_UNION' | 'SPONSOR';
  /** 账号显示名 */
  name: string;
  /** 初始密码（≥8 位，仅在响应中一次性回显） */
  password: string;
  /** 登录邮箱；缺省用申请提交的邮箱 */
  email?: string;
  schoolId?: string;
  newSchoolName?: string;
  newSchoolCity?: string;
  organizationName?: string;
  contactName?: string;
  contactPhone?: string;
}

/** convert 响应：initialPassword 明文不落库，仅此响应回显一次 */
export interface ConvertSubmissionResult {
  admin: {
    id: string;
    email: string;
    name: string;
    role: AdminRole | null;
    schoolId: string | null;
    organizationName: string | null;
  };
  /** 学生会绑定/新建的学校，或广告商的来源学校；无则 null */
  school: { id: string; name: string } | null;
  initialPassword: string;
}
