import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, SquareAuthorType, SquareBoard } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SquareService } from '../square/square.service';
import { CreateEventDto } from './dto/events.dto';

/**
 * 活动 + 门票（学生会/团队发布活动 → 广场活动帖；用户购票 → 票夹二维码）。
 * 支付本期为 mock：购票即出票，pricePaidCents 记录票面价。
 */
@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private squareService: SquareService,
  ) {}

  // ─── 后管：创建活动（事务内同时生成广场活动帖）────────────────
  async createEvent(adminId: string, dto: CreateEventDto) {
    const scope = await this.squareService.getAdminScope(adminId);
    const role = scope.role;
    if (role !== AdminRole.SUPER && role !== AdminRole.TEAM && role !== AdminRole.STUDENT_UNION) {
      throw new ForbiddenException('Not authorized to publish events');
    }

    let school: string | null = dto.school ?? null;
    if (role === AdminRole.STUDENT_UNION) {
      // 学生会活动强制本校（school 未传时自动填本校）
      school = school || scope.schoolNames[0] || null;
      if (!school || !scope.schoolNames.includes(school)) {
        throw new ForbiddenException('Student union can only publish events for its own school');
      }
    }

    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (endAt && endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }

    // 活动帖板块：校园墙帖必须带学校
    const board = dto.board === 'campus_wall' ? SquareBoard.CAMPUS_WALL : SquareBoard.RECOMMEND;
    if (board === SquareBoard.CAMPUS_WALL && !school) {
      throw new BadRequestException('Campus-wall event posts must specify the school');
    }
    // SUPER 无对应 SquareAuthorType，按 TEAM 官方帖发布
    const authorType =
      role === AdminRole.STUDENT_UNION ? SquareAuthorType.STUDENT_UNION : SquareAuthorType.TEAM;

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
  async listEvents(adminId: string, opts: { page?: number; limit?: number } = {}) {
    const scope = await this.squareService.getAdminScope(adminId);
    const role = scope.role;
    if (role !== AdminRole.SUPER && role !== AdminRole.TEAM && role !== AdminRole.STUDENT_UNION) {
      throw new ForbiddenException('Not authorized');
    }
    const page = opts.page && opts.page > 0 ? Number(opts.page) : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(Number(opts.limit), 50) : 20;
    const where =
      role === AdminRole.STUDENT_UNION ? { school: { in: scope.schoolNames } } : {};
    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdByAdmin: { select: { name: true, role: true, organizationName: true } },
          post: { select: { id: true, board: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { items, page, limit, total, hasMore: page * limit < total };
  }

  // 学生会 scope 守卫：只能操作本校活动
  private assertEventScope(
    scope: { role: AdminRole | null; schoolNames: string[] },
    event: { school: string | null },
  ) {
    if (scope.role === AdminRole.STUDENT_UNION) {
      if (!event.school || !scope.schoolNames.includes(event.school)) {
        throw new ForbiddenException('Student union can only manage events of its own school');
      }
    }
  }

  // ─── 后管：状态流转（closed 停售 / cancelled 取消）────────────
  async updateEventStatus(adminId: string, eventId: string, status: string) {
    const scope = await this.squareService.getAdminScope(adminId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    this.assertEventScope(scope, event);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status },
    });
    return { id: updated.id, status: updated.status };
  }

  // ─── 后管：购票名单 ──────────────────────────────────────────
  async listEventTickets(adminId: string, eventId: string) {
    const scope = await this.squareService.getAdminScope(adminId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    this.assertEventScope(scope, event);
    const tickets = await this.prisma.eventTicket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, profile: { select: { nickname: true, school: true } } } },
      },
    });
    return { event: { id: event.id, title: event.title, ticketsSold: event.ticketsSold, capacity: event.capacity }, tickets };
  }

  // ─── 后管：入场核销（扫票码 → valid 置 used）──────────────────
  async checkinTicket(adminId: string, code: string) {
    const scope = await this.squareService.getAdminScope(adminId);
    const ticket = await this.prisma.eventTicket.findUnique({
      where: { code: (code || '').trim() },
      include: {
        event: { select: { id: true, title: true, school: true, startAt: true } },
        user: { select: { profile: { select: { nickname: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    this.assertEventScope(scope, ticket.event);
    if (ticket.status === 'used') {
      throw new BadRequestException(`Ticket already used at ${ticket.usedAt?.toISOString()}`);
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException('Ticket is not valid');
    }
    await this.prisma.eventTicket.update({
      where: { id: ticket.id },
      data: { status: 'used', usedAt: new Date() },
    });
    return {
      ok: true,
      event: ticket.event.title,
      holder: ticket.user?.profile?.nickname || 'Unknown',
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
