/**
 * 跨校合作消息 API（/admin/partners，后端 B6）。域小、无他域复用，类型内联本文件。
 * 形状逐端点核对自 partners.controller.ts / partners.service.ts：
 * 目录双向互见（含既有线程 id）、唯一线程发起（existed 标记并入）、
 * 消息正序分页（当事侧读取即标已读）、未读总数角标。
 */
import { get, post } from './client';
import type { ListResult } from '@/lib/types';

/** 线程参与侧（后端 ContactThreadSide） */
export type ThreadSide = 'SPONSOR' | 'UNION';

/** GET /admin/partners/schools 行（商家侧目录：启用中且有活跃学生会入驻） */
export interface PartnerSchool {
  id: string;
  name: string;
  city: string | null;
  /** 自拉本商家的学生会所在校 */
  isSourceSchool: boolean;
  /** 与本商家的既有线程 id（null = 尚未洽谈过） */
  threadId: string | null;
}

/** GET /admin/partners/sponsors 行（学生会侧目录：他校自拉商家；后端刻意不返回联系方式） */
export interface PartnerSponsor {
  id: string;
  organizationName: string | null;
  name: string;
  sourcedBySchool: { id: string; name: string } | null;
  createdAt: string;
  /** 与本校的既有线程 id（null = 尚未洽谈过） */
  threadId: string | null;
}

/** 线程统一形状（列表 / 详情 / 发起共用）；unreadCount 后端已按当前角色侧折算，平台恒 0 */
export interface PartnerThread {
  id: string;
  subject: string;
  createdBySide: ThreadSide;
  lastMessageAt: string;
  createdAt: string;
  sponsorAdmin: { id: string; organizationName: string | null; name: string };
  school: { id: string; name: string };
  unreadCount: number;
}

/** POST /admin/partners/threads 响应：existed=true 表示命中唯一线程并入（非新建） */
export interface CreatedThread extends PartnerThread {
  existed: boolean;
}

/** 消息行（GET/POST messages 同形） */
export interface PartnerMessage {
  id: string;
  senderSide: ThreadSide;
  senderAdmin: { id: string; name: string };
  content: string;
  createdAt: string;
}

export interface PartnersPagedQuery {
  page?: number;
  limit?: number;
  search?: string;
}

/** 学校目录（仅 SPONSOR）；search 模糊匹配学校名 */
export function listPartnerSchools(params: PartnersPagedQuery): Promise<ListResult<PartnerSchool>> {
  return get<ListResult<PartnerSchool>>('/admin/partners/schools', {
    page: params.page,
    limit: params.limit,
    search: params.search,
  });
}

/** 商家目录（仅 STUDENT_UNION）；search 模糊匹配组织名 */
export function listPartnerSponsors(params: PartnersPagedQuery): Promise<ListResult<PartnerSponsor>> {
  return get<ListResult<PartnerSponsor>>('/admin/partners/sponsors', {
    page: params.page,
    limit: params.limit,
    search: params.search,
  });
}

/** 线程列表（商家=本人 / 学生会=本校 / 平台=全量只读），lastMessageAt 倒序；search 匹配主题 */
export function listThreads(params: PartnersPagedQuery): Promise<ListResult<PartnerThread>> {
  return get<ListResult<PartnerThread>>('/admin/partners/threads', {
    page: params.page,
    limit: params.limit,
    search: params.search,
  });
}

export function getThread(id: string): Promise<PartnerThread> {
  return get<PartnerThread>(`/admin/partners/threads/${id}`);
}

/** 发起洽谈：目标字段按角色二选一（商家传 targetSchoolId / 学生会传 targetSponsorAdminId） */
export function createThread(data: {
  subject: string;
  content: string;
  targetSchoolId?: string;
  targetSponsorAdminId?: string;
}): Promise<CreatedThread> {
  return post<CreatedThread>('/admin/partners/threads', data);
}

/** 消息列表（createdAt 正序，后端默认 limit 50）；当事侧读取即标已读，平台读取不动计数 */
export function listThreadMessages(
  id: string,
  params: { page?: number; limit?: number },
): Promise<ListResult<PartnerMessage>> {
  return get<ListResult<PartnerMessage>>(`/admin/partners/threads/${id}/messages`, {
    page: params.page,
    limit: params.limit,
  });
}

/** 发消息（仅当事双方；平台 403） */
export function postThreadMessage(id: string, content: string): Promise<PartnerMessage> {
  return post<PartnerMessage>(`/admin/partners/threads/${id}/messages`, { content });
}

/** 未读总数（仅 SPONSOR/STUDENT_UNION；侧栏角标数据源） */
export function getPartnersUnreadCount(): Promise<{ count: number }> {
  return get<{ count: number }>('/admin/partners/unread-count');
}
