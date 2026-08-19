/**
 * events 域契约类型（对照 apps/api/src/events/events.service.ts 逐端点核对）。
 * 时间字段均为 ISO 字符串（Date 经 JSON 序列化）；金额恒 *Cents。
 */
import type { AdminRole, ListResult } from './common';

/** Event.status（Prisma 存 string，取值固定三态） */
export type EventStatus = 'published' | 'closed' | 'cancelled';

/** EventTicket.status */
export type TicketStatus = 'valid' | 'used' | 'cancelled';


/** Event 模型标量字段（创建响应 = 本形状 + postId） */
export interface EventBase {
  id: string;
  title: string;
  content: string;
  images: string[];
  /** null = 全网（团队活动可不限学校）；学生会活动恒为本校名 */
  school: string | null;
  venue: string | null;
  startAt: string;
  endAt: string | null;
  /** 0 = 免费 */
  priceCents: number;
  /** null = 不限名额 */
  capacity: number | null;
  ticketsSold: number;
  status: EventStatus;
  createdByAdminId: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/events 列表项（include createdByAdmin + post） */
export interface AdminEvent extends EventBase {
  createdByAdmin: {
    name: string;
    /** null = 仅查看账号（AdminUser.role 可空） */
    role: AdminRole | null;
    organizationName: string | null;
  };
  /** 同步生成的广场活动帖（1:1） */
  post: { id: string; board: 'RECOMMEND' | 'CAMPUS_WALL' } | null;
}

/** POST /admin/events 请求体（镜像 CreateEventDto） */
export interface CreateEventInput {
  title: string;
  content: string;
  images?: string[];
  /** SUPER 必填（活动帖恒发该校校园墙）；学生会不传由服务端自动填本校 */
  school?: string;
  venue?: string;
  startAt: string;
  endAt?: string;
  /** 分；缺省 0 = 免费 */
  priceCents?: number;
  /** 正整数；缺省 = 不限 */
  capacity?: number;
}

/** POST /admin/events 响应：事务内同建的广场帖 id 一并返回 */
export interface CreateEventResult extends EventBase {
  postId: string;
}

/**
 * PATCH /admin/events/:id/content 请求体（部分更新，只发生变字段）：
 * school 不可改；已售票时改 priceCents 会 400；capacity 三态——
 * 未传=不变 / null=改为不限（已售票后放宽恒可）/ 数值=新上限（已售票后只可上调）；
 * 清空 endAt 前端按「不改动」省略（后端不支持清除）
 */
export interface UpdateEventContentInput {
  title?: string;
  content?: string;
  images?: string[];
  venue?: string;
  startAt?: string;
  endAt?: string;
  priceCents?: number;
  capacity?: number | null;
}

/** PATCH /admin/events/:id 响应 */
export interface UpdateEventStatusResult {
  id: string;
  status: EventStatus;
}

/** 购票名单行（include user.profile） */
export interface AdminEventTicket {
  id: string;
  code: string;
  eventId: string;
  userId: string;
  pricePaidCents: number;
  status: TicketStatus;
  usedAt: string | null;
  createdAt: string;
  user: {
    // email 学生会视角为 null（后端脱敏）
    email: string | null;
    profile: { nickname: string | null; school: string | null } | null;
  };
}

/** GET /admin/events/:id/tickets：统一分页 + 活动摘要 */
export interface EventTicketsResult extends ListResult<AdminEventTicket> {
  event: {
    id: string;
    title: string;
    ticketsSold: number;
    capacity: number | null;
  };
}

/** POST /admin/events/checkin 响应（失败走 400/404 的 ApiError，不进本形状） */
export interface CheckinResult {
  ok: boolean;
  /** 活动标题 */
  event: string;
  /** 持票人昵称（后端缺省「未知用户」） */
  holder: string;
  /** 票所属活动 id */
  eventId?: string;
}
