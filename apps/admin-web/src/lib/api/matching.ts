/**
 * matching 域 API（后端 MatchingAdminController，SUPER/TEAM）。
 * 任务详情 GET jobs/:id 与结果列表 GET results 本轮明确不做，不封装。
 */
import { get, post, put } from './client';
import type {
  ListResult,
  MatchConfig,
  MatchJob,
  MatchJobRow,
  MatchTriggerMode,
  UpdateMatchConfigPayload,
} from '@/lib/types';

/** 匹配时间配置（库中无配置行时为 null） */
export function getMatchConfig(): Promise<MatchConfig | null> {
  return get<MatchConfig | null>('/admin/matching/config');
}

/** 更新配置（后端校验 cron 合法性并热重载调度器） */
export function updateMatchConfig(data: UpdateMatchConfigPayload): Promise<MatchConfig> {
  return put<MatchConfig>('/admin/matching/config', data);
}

/**
 * 手动触发单模式任务。注意后端缺省 mode=romantic——朋友池必须显式传 friend
 * 单独再调一次；同模式已有 PENDING/RUNNING 任务会 400（中文提示）。
 */
export function triggerMatchJob(mode: MatchTriggerMode): Promise<MatchJob> {
  return post<MatchJob>(`/admin/matching/jobs/trigger?mode=${mode}`);
}

/** 任务列表（已随后端契约统一为 items 键） */
export function listMatchJobs(params: { page?: number; limit?: number }): Promise<ListResult<MatchJobRow>> {
  return get<ListResult<MatchJobRow>>('/admin/matching/jobs', params);
}

/** 重试失败任务（仅 FAILED 可重试，其余 400） */
export function retryMatchJob(id: string): Promise<{ message: string }> {
  return post<{ message: string }>(`/admin/matching/jobs/${id}/retry`);
}
