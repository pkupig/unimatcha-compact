/** 官网提交（PublicSubmission）后台接口，SUPER/TEAM（apps/api admin.controller submissions 段） */
import { get, patch, post } from './client';
import type {
  ConvertSubmissionInput,
  ConvertSubmissionResult,
  ListResult,
  Submission,
  SubmissionRecord,
  SubmissionStatus,
  SubmissionType,
  UpdateSubmissionInput,
} from '@/lib/types';

/** 列表（newest first；search 模糊匹配 email/组织；status 空串按未筛选处理） */
export function listSubmissions(params: {
  type?: SubmissionType;
  status?: SubmissionStatus | '';
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ListResult<Submission>> {
  return get('/admin/submissions', {
    type: params.type,
    status: params.status || undefined,
    search: params.search,
    page: params.page,
    limit: params.limit,
  });
}

/** 状态流转（已联系/关闭/重新打开）；置 APPROVED 会被后端 400（只能走 convertSubmission） */
export function updateSubmission(id: string, data: UpdateSubmissionInput): Promise<SubmissionRecord> {
  return patch(`/admin/submissions/${id}`, data);
}

/** 一键开通后台账号（事务内可新建学校）；initialPassword 仅此响应一次性回显 */
export function convertSubmission(
  id: string,
  data: ConvertSubmissionInput,
): Promise<ConvertSubmissionResult> {
  return post(`/admin/submissions/${id}/convert`, data);
}
