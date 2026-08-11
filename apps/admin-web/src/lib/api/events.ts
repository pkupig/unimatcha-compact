/** events 域 API（契约见 apps/api/src/events/events-admin.controller.ts） */
import { get, patch, post } from './client';
import type {
  AdminEvent,
  CheckinResult,
  CreateEventInput,
  CreateEventResult,
  EventStatus,
  EventTicketsResult,
  ListResult,
  UpdateEventStatusResult,
} from '@/lib/types';

/** 活动列表（学生会由服务端按本校过滤；ListQueryDto 只收 page/limit） */
export function listEvents(params: { page?: number; limit?: number }): Promise<ListResult<AdminEvent>> {
  return get<ListResult<AdminEvent>>('/admin/events', params);
}

/** 发布活动（事务内同时生成广场活动帖） */
export function createEvent(data: CreateEventInput): Promise<CreateEventResult> {
  return post<CreateEventResult>('/admin/events', data);
}

/** 状态流转：closed 停售 / published 恢复 / cancelled 取消（存量有效票一并作废） */
export function updateEventStatus(id: string, status: EventStatus): Promise<UpdateEventStatusResult> {
  return patch<UpdateEventStatusResult>(`/admin/events/${id}`, { status });
}

/** 购票名单（分页；响应还带活动摘要 event 字段） */
export function listEventTickets(
  eventId: string,
  params: { page?: number; limit?: number },
): Promise<EventTicketsResult> {
  return get<EventTicketsResult>(`/admin/events/${eventId}/tickets`, params);
}

/** 入场核销（按票码；传 eventId 时限定本场，非本场门票被拒；已核销/已失效/活动已取消均为 ApiError） */
export function checkinTicket(code: string, eventId?: string): Promise<CheckinResult> {
  return post<CheckinResult>('/admin/events/checkin', { code, ...(eventId ? { eventId } : {}) });
}
