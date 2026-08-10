/**
 * matching 域契约类型（对照 apps/api/src/matching/matching-admin.controller.ts + matching.service.ts）。
 */

export type MatchJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/** GET /admin/matching/config —— matchConfig.findFirst，库中无配置行时后端返回 null */
export interface MatchConfig {
  id: string;
  cronExpr: string;
  isEnabled: boolean;
  description: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

/** PUT /admin/matching/config（UpdateMatchConfigDto；cronExpr 必填，非法表达式后端 400） */
export interface UpdateMatchConfigPayload {
  cronExpr: string;
  description?: string;
  isEnabled?: boolean;
  timezone?: string;
}

export type MatchTriggerMode = 'romantic' | 'friend';

/** MatchJob 裸行（POST jobs/trigger 的返回；列表行另含 _count） */
export interface MatchJob {
  id: string;
  status: MatchJobStatus;
  /** `${触发方}:${mode}`：手动 = manual:<adminId>:<mode>，定时 = scheduler:<mode> */
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  totalCandidates: number;
  totalMatched: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/matching/jobs 的行（include _count.matches） */
export interface MatchJobRow extends MatchJob {
  _count: { matches: number };
}

// GET /admin/matching/jobs 已随后端契约统一为 ListResult<MatchJobRow>（items 键）
