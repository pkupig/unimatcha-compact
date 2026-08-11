/**
 * schools 域 API（后端 SchoolsAdminController + AdPricingAdminController）。
 * listSchools / updateSchoolBank 为跨域契约（finance/accounts/submissions/earnings 引用），
 * 签名不可变更。
 */
import { get, post, put } from './client';
import type {
  AdPricingDefaults,
  CreateSchoolPayload,
  ListResult,
  ListSchoolsParams,
  School,
  UpdateSchoolBankPayload,
  UpdateSchoolPayload,
} from '@/lib/types';

/** 学校列表（TEAM 全量含统计；学生会仅本校；广告商为瘦身形状，由 ads 域自行收窄） */
export function listSchools(params: ListSchoolsParams): Promise<ListResult<School>> {
  return get<ListResult<School>>('/admin/schools', params);
}

/** 学校详情 + 统计 */
export function getSchool(id: string): Promise<School> {
  return get<School>(`/admin/schools/${id}`);
}

/** 创建学校（SUPER/TEAM；name 唯一） */
export function createSchool(data: CreateSchoolPayload): Promise<School> {
  return post<School>('/admin/schools', data);
}

/** 更新基本信息 / 分成 bps / 计价覆盖（计价字段传 null = 清除覆盖） */
export function updateSchool(id: string, data: UpdateSchoolPayload): Promise<School> {
  return put<School>(`/admin/schools/${id}`, data);
}

/** 代绑/修改提现银行账户（跨域契约签名） */
export function updateSchoolBank(id: string, data: UpdateSchoolBankPayload): Promise<School> {
  return put<School>(`/admin/schools/${id}/bank`, data);
}

/** 全局计价默认值（学校未配置覆盖时的回落值） */
export function getPricingDefaults(): Promise<AdPricingDefaults> {
  return get<AdPricingDefaults>('/admin/ad-pricing/defaults');
}

/** 更新全局计价默认值（正整数，单位：分） */
export function updatePricingDefaults(data: AdPricingDefaults): Promise<AdPricingDefaults> {
  return put<AdPricingDefaults>('/admin/ad-pricing/defaults', data);
}
