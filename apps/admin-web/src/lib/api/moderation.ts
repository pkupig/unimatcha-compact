/**
 * moderation 域 API：广场后管（/admin/square/*，square-admin.controller.ts）
 * + 用户反馈（/admin/reports，admin.controller.ts）。
 */
import { del, get, patch, post } from './client';
import type {
  AdminPollPost,
  AdminSquarePost,
  CreateOfficialPostInput,
  DismissReportsResult,
  FeedbackReport,
  FeedbackReportBase,
  FeedbackStatus,
  ListFeedbackReportsParams,
  ListPollsParams,
  ListResult,
  ListSquarePostsParams,
  OfficialPostCreated,
  PollReviewInput,
  PollReviewResult,
  PostRestoreResult,
  PostTakedownResult,
} from '@/lib/types';

// ─── 帖子管理 / 举报队列 ─────────────────────────────────────
export function listSquarePosts(
  params: ListSquarePostsParams,
): Promise<ListResult<AdminSquarePost>> {
  return get('/admin/square/posts', {
    board: params.board,
    school: params.school,
    status: params.status,
    reported: params.reported,
    search: params.search,
    page: params.page,
    limit: params.limit,
  });
}

/** 下架（理由必填由前端保证；后端可选） */
export function takedownSquarePost(id: string, reason: string): Promise<PostTakedownResult> {
  return del(`/admin/square/posts/${id}`, { reason });
}

/** 恢复展示（清 deletedBy/deletedAt/deleteReason） */
export function restoreSquarePost(id: string): Promise<PostRestoreResult> {
  return post(`/admin/square/posts/${id}/restore`);
}

/** 清除举报（若为举报自动隐藏则同时恢复展示） */
export function dismissSquarePostReports(id: string): Promise<DismissReportsResult> {
  return post(`/admin/square/posts/${id}/dismiss-reports`);
}

// ─── 投票审核 ────────────────────────────────────────────────
export function listPolls(params: ListPollsParams): Promise<ListResult<AdminPollPost>> {
  return get('/admin/square/polls', {
    status: params.status,
    page: params.page,
    limit: params.limit,
  });
}

export function reviewPoll(id: string, input: PollReviewInput): Promise<PollReviewResult> {
  return post(`/admin/square/polls/${id}/review`, input);
}

// ─── 官方发帖 ────────────────────────────────────────────────
export function createOfficialPost(input: CreateOfficialPostInput): Promise<OfficialPostCreated> {
  return post('/admin/square/posts', input);
}

// ─── 用户反馈（SUPER/TEAM）────────────────────────────────────
export function listFeedbackReports(
  params: ListFeedbackReportsParams,
): Promise<ListResult<FeedbackReport>> {
  return get('/admin/reports', {
    status: params.status,
    page: params.page,
    limit: params.limit,
  });
}

/** open → resolved（幂等） */
export function updateFeedbackReportStatus(
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackReportBase> {
  return patch(`/admin/reports/${id}`, { status });
}
