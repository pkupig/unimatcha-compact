import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, SquareAuthorType, SquareBoard } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminScopeService } from '../admin-core/admin-scope.service';
import { AdminActor } from '../admin-core/admin-actor';
import { PageQuery, paginated, skipTake } from '../common/utils/pagination';
import { CreateEventDto } from './dto/events.dto';

/**
 * 活动 + 门票（学生会/团队发布活动 → 广场活动帖；用户购票 → 票夹二维码）。
 * 支付本期为 mock：购票即出票，pricePaidCents 记录票面价。
 */
@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private adminScope: AdminScopeService,
  ) {}

  // ─── 后管：创建活动（事务内同时生成广场活动帖）────────────────
  async createEvent(actor: AdminActor, dto: CreateEventDto) {
    // @Roles 已拦一道，此处为纵深防御
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const role = actor.role;

    let school: string | null = dto.school ?? null;
    if (role === AdminRole.STUDENT_UNION) {
      // 学生会活动强制本校（school 未传时自动填本校）
      const own = this.adminScope.requireUnionSchool(actor);
      school = school || own.name;
      if (school !== own.name) {
        throw new ForbiddenException('学生会只能发布本校活动');
      }
    } else if (school) {
      // 团队指定学校：必须是已录入的 School 名（拼错会导致校园墙/学生会 scope 全部匹配不上且无报错）
      const exists = await this.prisma.school.findUnique({ where: { name: school }, select: { id: true } });
      if (!exists) throw new BadRequestException(`学校「${school}」不存在——请使用已录入的学校名`);
    }

    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (endAt && endAt <= startAt) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    // 活动帖板块：校园墙帖必须带学校
    const board = dto.board === 'campus_wall' ? SquareBoard.CAMPUS_WALL : SquareBoard.RECOMMEND;
    if (board === SquareBoard.CAMPUS_WALL && !school) {
      throw new BadRequestException('校园墙活动帖必须指定学校');
    }
    // SUPER 无对应 SquareAuthorType，按 TEAM 官方帖发布
    const authorType =
      role === AdminRole.STUDENT_UNION ? SquareAuthorType.STUDENT_UNION : SquareAuthorType.TEAM;
    const adminId = actor.id;

    const { event, post } = await this.prisma.$transaction(async (tx) => {
      const ev = await tx.event.create({
        data: {
          title: dto.title,
          content: dto.content,
          images: dto.images || [],
          school,
          venue: dto.venue || null,
          startAt,
          endAt,
          priceCents: dto.priceCents ?? 0,
          capacity: dto.capacity ?? null,
          createdByAdminId: adminId,
        },
      });
      const p = await tx.squarePost.create({
        data: {
          board,
          authorType,
          adminId,
          school,
          title: dto.title,
          content: dto.content,
          images: dto.images || [],
          postType: 'event',
          eventId: ev.id,
        },
      });
      return { event: ev, post: p };
    });
    return { ...event, postId: post.id };
  }

  // ─── 后管：活动列表（学生会仅本校；团队/SUPER 全量）───────────
  async listEvents(actor: AdminActor, q: PageQuery) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const where =
      actor.role === AdminRole.STUDENT_UNION
        ? { school: this.adminScope.requireUnionSchool(actor).name }
        : {};
    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startAt: 'desc' },
        ...skipTake(q),
        include: {
          createdByAdmin: { select: { name: true, role: true, organizationName: true } },
          post: { select: { id: true, board: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  // ─── 后管：状态流转（closed 停售 / cancelled 取消）────────────
  async updateEventStatus(actor: AdminActor, eventId: string, status: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('活动不存在');
    this.adminScope.assertSchoolNameInScope(actor, event.school);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status },
    });
    // 取消活动：存量有效票一并作废（票夹显示 CANCELLED、核销双重拒绝）
    if (status === 'cancelled') {
      await this.prisma.eventTicket.updateMany({
        where: { eventId, status: 'valid' },
        data: { status: 'cancelled' },
      });
    }
    return { id: updated.id, status: updated.status };
  }

  // ─── 后管：购票名单（分页）───────────────────────────────────
  async listEventTickets(actor: AdminActor, eventId: string, q: PageQuery) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('活动不存在');
    this.adminScope.assertSchoolNameInScope(actor, event.school);
    const [tickets, total] = await Promise.all([
      this.prisma.eventTicket.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: {
          user: { select: { email: true, profile: { select: { nickname: true, school: true } } } },
        },
      }),
      this.prisma.eventTicket.count({ where: { eventId } }),
    ]);
    return {
      event: { id: event.id, title: event.title, ticketsSold: event.ticketsSold, capacity: event.capacity },
      ...paginated(tickets, total, q),
    };
  }

  // ─── 后管：入场核销（扫票码 → valid 置 used）──────────────────
  async checkinTicket(actor: AdminActor, code: string) {
    const ticket = await this.prisma.eventTicket.findUnique({
      where: { code: (code || '').trim() },
      include: {
        event: { select: { id: true, title: true, school: true, startAt: true, status: true } },
        user: { select: { profile: { select: { nickname: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException('票码不存在');
    this.adminScope.assertSchoolNameInScope(actor, ticket.event.school);
    if (ticket.event.status === 'cancelled') {
      throw new BadRequestException('该活动已取消');
    }
    if (ticket.status === 'used') {
      throw new BadRequestException(`该票已于 ${ticket.usedAt?.toISOString()} 核销`);
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException('该票已失效');
    }
    await this.prisma.eventTicket.update({
      where: { id: ticket.id },
      data: { status: 'used', usedAt: new Date() },
    });
    return {
      ok: true,
      event: ticket.event.title,
      holder: ticket.user?.profile?.nickname || '未知用户',
    };
  }

  // ─── 用户：活动详情（含余票与我已购票数）──────────────────────
  async getEvent(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        createdByAdmin: { select: { name: true, role: true, organizationName: true } },
        post: { select: { id: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const myTickets = await this.prisma.eventTicket.count({
      where: { eventId, userId, status: { not: 'cancelled' } },
    });
    const remaining = event.capacity == null ? null : Math.max(0, event.capacity - event.ticketsSold);
    return { ...event, remaining, myTickets };
  }

  // ─── 用户：购票（mock 支付；容量守卫为条件自增，防超卖）────────
  async purchaseTicket(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status !== 'published') {
      throw new BadRequestException('Ticket sales are closed for this event');
    }
    const salesEnd = event.endAt || event.startAt;
    if (salesEnd && salesEnd < new Date()) {
      throw new BadRequestException('This event has ended');
    }
    const ticket = await this.prisma.$transaction(async (tx) => {
      // 每人限购 2 张（mock 支付零成本，防单人抽干容量/无限刷票）
      const mine = await tx.eventTicket.count({
        where: { eventId, userId, status: { not: 'cancelled' } },
      });
      if (mine >= 2) throw new BadRequestException('Ticket limit reached (2 per person)');
      // 条件自增：容量满时影响行数为 0 → 售罄（并发安全，防超卖）
      const bumped = await tx.$executeRaw`
        UPDATE "events" SET "ticketsSold" = "ticketsSold" + 1, "updatedAt" = NOW()
        WHERE "id" = ${eventId} AND ("capacity" IS NULL OR "ticketsSold" < "capacity")`;
      if (!bumped) throw new BadRequestException('Sold out');
      return tx.eventTicket.create({
        data: {
          code: this.generateTicketCode(),
          eventId,
          userId,
          pricePaidCents: event.priceCents,
        },
      });
    });
    return {
      ticketId: ticket.id,
      code: ticket.code,
      event: { id: event.id, title: event.title, startAt: event.startAt, venue: event.venue },
      pricePaidCents: ticket.pricePaidCents,
    };
  }

  // ─── 用户：我的票夹 ──────────────────────────────────────────
  async myTickets(userId: string) {
    const tickets = await this.prisma.eventTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        event: {
          select: { id: true, title: true, venue: true, school: true, startAt: true, endAt: true, status: true, images: true },
        },
      },
    });
    return { tickets };
  }

  private generateTicketCode(): string {
    // UMT-XXXXXXXXXX（大写 base32 风格，去易混淆字符）
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += alphabet[bytes[i] % alphabet.length];
    return `UMT-${s}`;
  }
}
