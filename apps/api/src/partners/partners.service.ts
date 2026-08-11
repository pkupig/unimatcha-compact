import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, ContactThreadSide } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminScopeService } from '../admin-core/admin-scope.service';
import { AdminActor } from '../admin-core/admin-actor';
import { paginated, skipTake } from '../common/utils/pagination';
import {
  CreateThreadDto,
  ListPartnerSchoolsQueryDto,
  ListPartnerSponsorsQueryDto,
  ListThreadMessagesQueryDto,
  ListThreadsQueryDto,
  PostThreadMessageDto,
} from './dto/partners.dto';

/** 线程列表/详情统一带的关联（include 保留全部标量，范围校验直接用 sponsorAdminId/schoolId） */
const THREAD_INCLUDE = {
  sponsorAdmin: { select: { id: true, organizationName: true, name: true } },
  school: { select: { id: true, name: true } },
} as const;

/** 消息行统一形状 */
const MESSAGE_SELECT = {
  id: true,
  senderSide: true,
  senderAdmin: { select: { id: true, name: true } },
  content: true,
  createdAt: true,
} as const;

/**
 * 跨校合作消息线程（B6）：广告商 × 学校 的洽谈通道。
 * - 目录互见：广告商看「有活跃学生会的学校」，学生会看「他校自拉广告商」（绝不暴露联系方式）；
 * - 线程唯一：@@unique(sponsorAdminId, schoolId)，二次发起并入既有线程而非 409；
 * - 未读防 N+1：双侧冗余计数——发消息事务内 increment 对侧，读消息置零本侧；
 * - 平台（SUPER/TEAM）全量只读监管：可看列表/详情/消息，不可发言、不动未读计数。
 */
@Injectable()
export class PartnersService {
  constructor(
    private prisma: PrismaService,
    private adminScope: AdminScopeService,
  ) {}

  // ── 目录 ──────────────────────────────────────────

  /** 广告商侧学校目录：启用中 + 有活跃学生会入驻，附带与本广告商的既有线程 id */
  async listSchools(actor: AdminActor, q: ListPartnerSchoolsQueryDto) {
    const where: any = {
      isActive: true,
      unionAdmins: { some: { role: AdminRole.STUDENT_UNION, isActive: true } },
    };
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };

    const [schools, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        ...skipTake(q),
        orderBy: { name: 'asc' },
        select: { id: true, name: true, city: true },
      }),
      this.prisma.school.count({ where }),
    ]);

    // threadId 防 N+1：当页学校 id 一次查回本广告商的既有线程，建 Map 回填
    const threadBySchool = new Map<string, string>();
    if (schools.length > 0) {
      const threads = await this.prisma.contactThread.findMany({
        where: { sponsorAdminId: actor.id, schoolId: { in: schools.map((s) => s.id) } },
        select: { id: true, schoolId: true },
      });
      for (const t of threads) threadBySchool.set(t.schoolId, t.id);
    }

    return paginated(
      schools.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        // 本广告商的来源校（自拉我的学生会所在校），前端可标「合作校」徽标
        isSourceSchool: s.id === actor.sourcedBySchoolId,
        threadId: threadBySchool.get(s.id) ?? null,
      })),
      total,
      q,
    );
  }

  /** 学生会侧广告商目录：他校自拉的活跃广告商（跨校合作对象），绝不返回 email/contactPhone */
  async listSponsors(actor: AdminActor, q: ListPartnerSponsorsQueryDto) {
    const school = this.adminScope.requireUnionSchool(actor);

    const where: any = {
      role: AdminRole.SPONSOR,
      isActive: true,
      // Prisma 同键 not 不可叠加，两个条件 AND 并列：来源校非空（排除平台直签）且非本校（跨校）
      AND: [
        { sourcedBySchoolId: { not: null } },
        { sourcedBySchoolId: { not: school.id } },
      ],
    };
    if (q.search) where.organizationName = { contains: q.search, mode: 'insensitive' };

    const [sponsors, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        where,
        ...skipTake(q),
        orderBy: { createdAt: 'desc' },
        // 目录不暴露联系方式（email/contactPhone），联系一律走线程
        select: {
          id: true,
          organizationName: true,
          name: true,
          sourcedBySchool: { select: { id: true, name: true } },
          createdAt: true,
        },
      }),
      this.prisma.adminUser.count({ where }),
    ]);

    // threadId 防 N+1：以 (sponsorAdminId ∈ 当页, schoolId = 本校) 一次查回
    const threadBySponsor = new Map<string, string>();
    if (sponsors.length > 0) {
      const threads = await this.prisma.contactThread.findMany({
        where: { schoolId: school.id, sponsorAdminId: { in: sponsors.map((s) => s.id) } },
        select: { id: true, sponsorAdminId: true },
      });
      for (const t of threads) threadBySponsor.set(t.sponsorAdminId, t.id);
    }

    return paginated(
      sponsors.map((s) => ({ ...s, threadId: threadBySponsor.get(s.id) ?? null })),
      total,
      q,
    );
  }

  // ── 线程 ──────────────────────────────────────────

  /**
   * 发起洽谈：按角色校验目标必填组合与目标资格；
   * @@unique(sponsorAdminId, schoolId) 命中时不 409——并入既有线程（追加消息 +
   * 对侧未读 increment + lastMessageAt 刷新），响应附 existed:true。
   */
  async createThread(actor: AdminActor, dto: CreateThreadDto) {
    let sponsorAdminId: string;
    let schoolId: string;
    let side: ContactThreadSide;

    if (actor.role === AdminRole.SPONSOR) {
      // 广告商发起：只允许 targetSchoolId
      if (!dto.targetSchoolId || dto.targetSponsorAdminId) {
        throw new BadRequestException('广告商发起洽谈须且仅须提供 targetSchoolId');
      }
      const school = await this.prisma.school.findUnique({
        where: { id: dto.targetSchoolId },
        select: {
          id: true,
          isActive: true,
          unionAdmins: {
            where: { role: AdminRole.STUDENT_UNION, isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!school || !school.isActive || school.unionAdmins.length === 0) {
        throw new BadRequestException('目标学校不存在、已停用或暂无学生会入驻');
      }
      sponsorAdminId = actor.id;
      schoolId = school.id;
      side = ContactThreadSide.SPONSOR;
    } else {
      // 守卫已限 SPONSOR/STUDENT_UNION，此分支必为学生会
      const mySchool = this.adminScope.requireUnionSchool(actor);
      if (!dto.targetSponsorAdminId || dto.targetSchoolId) {
        throw new BadRequestException('学生会发起洽谈须且仅须提供 targetSponsorAdminId');
      }
      const sponsor = await this.prisma.adminUser.findUnique({
        where: { id: dto.targetSponsorAdminId },
        select: { id: true, role: true, isActive: true, sourcedBySchoolId: true },
      });
      if (
        !sponsor ||
        sponsor.role !== AdminRole.SPONSOR ||
        !sponsor.isActive ||
        !sponsor.sourcedBySchoolId ||
        sponsor.sourcedBySchoolId === mySchool.id
      ) {
        // 仅可洽谈他校自拉的活跃广告商（本校自拉广告商有既有线下渠道，平台直签走平台）
        throw new BadRequestException('目标广告商不存在或不可洽谈');
      }
      sponsorAdminId = sponsor.id;
      schoolId = mySchool.id;
      side = ContactThreadSide.UNION;
    }

    // 对侧未读：广告商发 → 学校侧 +1；学生会发 → 广告商侧 +1
    const oppositeIncrement =
      side === ContactThreadSide.SPONSOR
        ? { schoolUnreadCount: { increment: 1 } }
        : { sponsorUnreadCount: { increment: 1 } };

    const existing = await this.prisma.contactThread.findUnique({
      where: { sponsorAdminId_schoolId: { sponsorAdminId, schoolId } },
      select: { id: true },
    });

    if (existing) {
      // 唯一线程并入：不 409，事务内追加消息并刷新既有线程
      const thread = await this.prisma.$transaction(async (tx) => {
        await tx.contactMessage.create({
          data: {
            threadId: existing.id,
            senderAdminId: actor.id,
            senderSide: side,
            content: dto.content,
          },
        });
        return tx.contactThread.update({
          where: { id: existing.id },
          data: { lastMessageAt: new Date(), ...oppositeIncrement },
          include: THREAD_INCLUDE,
        });
      });
      return { ...this.shapeThread(actor, thread), existed: true };
    }

    // 未命中：事务内建线程 + 首条消息（对侧未读起始即 1，与并入路径 increment 语义一致）
    const thread = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contactThread.create({
        data: {
          sponsorAdminId,
          schoolId,
          subject: dto.subject,
          createdBySide: side,
          ...(side === ContactThreadSide.SPONSOR
            ? { schoolUnreadCount: 1 }
            : { sponsorUnreadCount: 1 }),
        },
        include: THREAD_INCLUDE,
      });
      await tx.contactMessage.create({
        data: {
          threadId: created.id,
          senderAdminId: actor.id,
          senderSide: side,
          content: dto.content,
        },
      });
      return created;
    });
    return { ...this.shapeThread(actor, thread), existed: false };
  }

  /** 线程列表：广告商=本人线程；学生会=本校线程；平台=全量只读。lastMessageAt 倒序 */
  async listThreads(actor: AdminActor, q: ListThreadsQueryDto) {
    const where: any = this.scopeWhere(actor);
    if (q.search) where.subject = { contains: q.search, mode: 'insensitive' };

    const [threads, total] = await Promise.all([
      this.prisma.contactThread.findMany({
        where,
        ...skipTake(q),
        orderBy: { lastMessageAt: 'desc' },
        include: THREAD_INCLUDE,
      }),
      this.prisma.contactThread.count({ where }),
    ]);

    return paginated(threads.map((t) => this.shapeThread(actor, t)), total, q);
  }

  /** 线程详情（形状同列表 item） */
  async getThread(actor: AdminActor, threadId: string) {
    const thread = await this.requireThreadInScope(actor, threadId);
    return this.shapeThread(actor, thread);
  }

  /**
   * 消息列表（createdAt 正序）。副作用标已读：actor 为当事侧时置零本侧未读计数
   * （学生会侧按校共享——任一本校管理员打开即视为本校已读）；平台读取不动计数。
   */
  async listMessages(actor: AdminActor, threadId: string, q: ListThreadMessagesQueryDto) {
    const thread = await this.requireThreadInScope(actor, threadId);

    if (actor.role === AdminRole.SPONSOR && thread.sponsorUnreadCount > 0) {
      await this.prisma.contactThread.update({
        where: { id: thread.id },
        data: { sponsorUnreadCount: 0 },
      });
    } else if (actor.role === AdminRole.STUDENT_UNION && thread.schoolUnreadCount > 0) {
      await this.prisma.contactThread.update({
        where: { id: thread.id },
        data: { schoolUnreadCount: 0 },
      });
    }

    const [messages, total] = await Promise.all([
      this.prisma.contactMessage.findMany({
        where: { threadId: thread.id },
        ...skipTake(q),
        orderBy: { createdAt: 'asc' },
        select: MESSAGE_SELECT,
      }),
      this.prisma.contactMessage.count({ where: { threadId: thread.id } }),
    ]);

    return paginated(messages, total, q);
  }

  /** 发消息（仅当事双方；平台只读监管不可发言——守卫层已拦）：事务内写消息 + 对侧未读 +1 */
  async postMessage(actor: AdminActor, threadId: string, dto: PostThreadMessageDto) {
    const thread = await this.requireThreadInScope(actor, threadId);

    const side =
      actor.role === AdminRole.SPONSOR ? ContactThreadSide.SPONSOR : ContactThreadSide.UNION;
    const oppositeIncrement =
      side === ContactThreadSide.SPONSOR
        ? { schoolUnreadCount: { increment: 1 } }
        : { sponsorUnreadCount: { increment: 1 } };

    const [message] = await this.prisma.$transaction([
      this.prisma.contactMessage.create({
        data: {
          threadId: thread.id,
          senderAdminId: actor.id,
          senderSide: side,
          content: dto.content,
        },
        select: MESSAGE_SELECT,
      }),
      this.prisma.contactThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date(), ...oppositeIncrement },
      }),
    ]);
    return message;
  }

  /** 未读总数（角标）：广告商按本人线程汇总广告商侧计数；学生会按本校线程汇总学校侧计数 */
  async unreadCount(actor: AdminActor): Promise<{ count: number }> {
    if (actor.role === AdminRole.SPONSOR) {
      const agg = await this.prisma.contactThread.aggregate({
        _sum: { sponsorUnreadCount: true },
        where: { sponsorAdminId: actor.id },
      });
      return { count: agg._sum.sponsorUnreadCount ?? 0 };
    }
    // 守卫已限 SPONSOR/STUDENT_UNION，此分支必为学生会
    const school = this.adminScope.requireUnionSchool(actor);
    const agg = await this.prisma.contactThread.aggregate({
      _sum: { schoolUnreadCount: true },
      where: { schoolId: school.id },
    });
    return { count: agg._sum.schoolUnreadCount ?? 0 };
  }

  // ── 私有 ──────────────────────────────────────────

  /** 列表范围：广告商=本人；学生会=本校；SUPER/TEAM=全量只读 */
  private scopeWhere(actor: AdminActor): any {
    if (actor.role === AdminRole.SPONSOR) return { sponsorAdminId: actor.id };
    if (actor.role === AdminRole.STUDENT_UNION) {
      return { schoolId: this.adminScope.requireUnionSchool(actor).id };
    }
    return {};
  }

  /** 加载线程并做范围校验（404 → 403），返回带 THREAD_INCLUDE 的完整行 */
  private async requireThreadInScope(actor: AdminActor, threadId: string) {
    const thread = await this.prisma.contactThread.findUnique({
      where: { id: threadId },
      include: THREAD_INCLUDE,
    });
    if (!thread) throw new NotFoundException('洽谈不存在');

    if (actor.role === AdminRole.SPONSOR && thread.sponsorAdminId !== actor.id) {
      throw new ForbiddenException('无权查看该洽谈');
    }
    if (actor.role === AdminRole.STUDENT_UNION) {
      const school = this.adminScope.requireUnionSchool(actor);
      if (thread.schoolId !== school.id) {
        throw new ForbiddenException('无权查看该洽谈');
      }
    }
    // SUPER/TEAM：全量只读放行
    return thread;
  }

  /** 线程 item 统一形状（列表/详情/发起共用）；unreadCount 按 actor 侧取冗余列，平台恒 0 */
  private shapeThread(
    actor: AdminActor,
    thread: {
      id: string;
      subject: string;
      createdBySide: ContactThreadSide;
      lastMessageAt: Date;
      createdAt: Date;
      sponsorUnreadCount: number;
      schoolUnreadCount: number;
      sponsorAdmin: { id: string; organizationName: string | null; name: string };
      school: { id: string; name: string };
    },
  ) {
    let unreadCount = 0;
    if (actor.role === AdminRole.SPONSOR) unreadCount = thread.sponsorUnreadCount;
    else if (actor.role === AdminRole.STUDENT_UNION) unreadCount = thread.schoolUnreadCount;

    return {
      id: thread.id,
      subject: thread.subject,
      createdBySide: thread.createdBySide,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
      sponsorAdmin: thread.sponsorAdmin,
      school: thread.school,
      unreadCount,
    };
  }
}
