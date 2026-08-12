import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminScopeService } from '../admin-core/admin-scope.service';
import { AdminActor } from '../admin-core/admin-actor';
import { PageQuery, paginated, skipTake } from '../common/utils/pagination';
import { ListUsersQueryDto, UsersOverviewQueryDto } from './dto/users-admin.dto';

/**
 * 用户后管（Step6 拆出）：原 AdminService 用户段 + UsersService 的四个 admin 专用方法
 * 合并于此（wrapper 与实现两层收成一层）。resetUserMode 事务体自原实现逐字搬移。
 * 范围规则（ADMIN-REDESIGN §4 + 产品口径 2026-08）：SPONSOR 一律 403；
 * 学生会对本校用户只看群体统计（overview）与认证队列（受限投影），
 * 名单/个体详情/重置匹配对学生会封死；封禁与认证处置保留（限本校）。
 */
@Injectable()
export class UsersAdminService {
  constructor(
    private prisma: PrismaService,
    private adminScope: AdminScopeService,
  ) {}

  private async assertUserScope(actor: AdminActor, userId: string) {
    if (actor.role === AdminRole.SPONSOR) {
      throw new ForbiddenException('广告商账号无权访问用户管理');
    }
    if (actor.role !== AdminRole.STUDENT_UNION) return;
    const school = this.adminScope.requireUnionSchool(actor);
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { school: true },
    });
    if (!profile || profile.school !== school.name) {
      throw new ForbiddenException('学生会只能操作本校用户');
    }
  }

  async listUsers(actor: AdminActor, q: ListUsersQueryDto) {
    if (actor.role === AdminRole.SPONSOR) {
      throw new ForbiddenException('广告商账号无权访问用户管理');
    }
    if (actor.role === AdminRole.STUDENT_UNION) {
      throw new ForbiddenException('学生会不可查看用户名单与个体详情，仅可查看本校群体统计');
    }

    const where: any = {};
    if (q.search) {
      where.OR = [
        { email: { contains: q.search, mode: 'insensitive' } },
        { profile: { nickname: { contains: q.search, mode: 'insensitive' } } },
      ];
    }
    if (q.status) where.status = q.status;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        ...skipTake(q),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, status: true, verificationStatus: true, createdAt: true,
          studentCardUrl: true, schoolEmail: true,
          // 双模式：每模式状态迁入 UserModeState
          modeStates: {
            select: { mode: true, matchState: true, matchSearchingSince: true },
          },
          profile: {
            select: {
              nickname: true, school: true, profileCompleteness: true,
              socialLinks: true, relationshipScore: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginated(users, total, q);
  }

  // 凭证与私密设置（passwordHash/verifyCode/verifyCodeExpiresAt/connectCode/settings）永不出后台接口
  async getUserDetail(actor: AdminActor, userId: string) {
    if (actor.role === AdminRole.STUDENT_UNION) {
      throw new ForbiddenException('学生会不可查看用户名单与个体详情，仅可查看本校群体统计');
    }
    await this.assertUserScope(actor, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        verificationStatus: true,
        createdAt: true,
        studentCardUrl: true,
        schoolEmail: true,
        profile: true,
        // 双模式：每模式状态迁入 UserModeState
        modeStates: {
          select: { mode: true, matchState: true, matchSearchingSince: true, weeklyMatchNote: true },
        },
        answers: {
          include: {
            question: { select: { title: true, type: true } },
            questionnaireVersion: { select: { version: true, title: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 50,
        },
        matchesAsUserA: {
          include: {
            userB: { select: { email: true, profile: { select: { nickname: true } } } },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        matchesAsUserB: {
          include: {
            userA: { select: { email: true, profile: { select: { nickname: true } } } },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async updateUserStatus(actor: AdminActor, userId: string, status: 'ACTIVE' | 'BANNED') {
    await this.assertUserScope(actor, userId);
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, email: true, status: true },
    });
    // 处置动作的响应不得绕过受限投影：学生会视角不回传登录 email
    return actor.role === AdminRole.STUDENT_UNION ? { ...row, email: null } : row;
  }

  // 管理员重置用户匹配模式（双模式）：
  // 临时对话 → EXPIRED，已确认关系 → DISSOLVED，并把双方相应模式的状态机重置为 idle
  async resetUserMode(actor: AdminActor, userId: string) {
    if (actor.role === AdminRole.STUDENT_UNION) {
      throw new ForbiddenException('重置用户匹配由平台团队操作');
    }
    await this.assertUserScope(actor, userId);
    return this.prisma.$transaction(async (tx) => {
      // 临时对话状态（48h 倒计时中，可聊未确认）
      const tempStatuses = [
        'MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING',
        'MATCHED_FRIEND', 'FRIEND_CONFIRMING',
      ];
      // 已确认永久关系（RELATIONSHIP_MODE 为旧数据兼容）
      const confirmedStatuses = [
        'RELATIONSHIP_ROMANTIC', 'FRIEND_CONFIRMED', 'RELATIONSHIP_MODE',
      ];

      // 清理该用户名下所有未完结的 Match（临时 + 永久），并恢复对方相应模式状态
      const activeMatches = await tx.match.findMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          status: { in: [...tempStatuses, ...confirmedStatuses] as any },
        },
        select: { id: true, userAId: true, userBId: true, status: true, mode: true },
      });

      for (const m of activeMatches) {
        const partnerId = m.userAId === userId ? m.userBId : m.userAId;
        // match.mode 枚举 ROMANTIC/FRIEND → 小写字符串
        const modeStr = m.mode === 'FRIEND' ? 'friend' : 'romantic';
        const isTemp = tempStatuses.includes(m.status as string);

        if (isTemp) {
          await tx.match.update({ where: { id: m.id }, data: { status: 'EXPIRED' } });
        } else {
          await tx.match.update({
            where: { id: m.id },
            data: { status: 'DISSOLVED', dissolvedAt: new Date(), dissolveReason: 'Admin reset user mode' },
          });
          // 清掉该关系下的未读标记，避免对方残留过期关系的未读角标
          await tx.message.updateMany({
            where: { matchId: m.id, isRead: false },
            data: { isRead: true },
          });
        }

        // 对方对应模式恢复为 idle；关联广场帖按 match.status 自动隐藏，无需删除
        await tx.userModeState.upsert({
          where: { userId_mode: { userId: partnerId, mode: modeStr } },
          update: { matchState: 'idle', matchSearchingSince: null, weeklyMatchNote: null },
          create: { userId: partnerId, mode: modeStr, matchState: 'idle' },
        });
      }

      // 被重置用户的两个模式状态全部回到 idle
      for (const mode of ['romantic', 'friend'] as const) {
        await tx.userModeState.upsert({
          where: { userId_mode: { userId, mode } },
          update: { matchState: 'idle', matchSearchingSince: null, weeklyMatchNote: null },
          create: { userId, mode, matchState: 'idle' },
        });
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });
      return { ...user, matchState: 'idle' };
    });
  }

  async updateUserVerification(
    actor: AdminActor,
    userId: string,
    status: 'unverified' | 'pending' | 'verified' | 'rejected',
  ) {
    await this.assertUserScope(actor, userId);
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: status },
      select: { id: true, email: true, verificationStatus: true },
    });
    // 处置动作的响应不得绕过受限投影：学生会视角不回传登录 email
    return actor.role === AdminRole.STUDENT_UNION ? { ...row, email: null } : row;
  }

  // 群体概览：学生会看本校统计的唯一通道（名单/详情已封死）；SUPER/TEAM 可按校过滤
  async getUsersOverview(actor: AdminActor, q: UsersOverviewQueryDto) {
    if (actor.role === AdminRole.SPONSOR) {
      throw new ForbiddenException('广告商账号无权访问用户管理');
    }
    // 学生会恒本校；SUPER/TEAM 可选 ?school=（不传 = 全平台）
    const school =
      actor.role === AdminRole.STUDENT_UNION
        ? this.adminScope.requireUnionSchool(actor).name
        : q.school || undefined;

    const scopeWhere: Prisma.UserWhereInput = school ? { profile: { school } } : {};
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    // 最近 30 天注册曲线：范围内量小，拉 createdAt 单列 JS 分桶（不上 raw SQL）；
    // 桶按 UTC 日期（toISOString 前 10 位）
    const DAY = 24 * 3600 * 1000;
    const seriesStart = new Date(Date.now() - 29 * DAY);
    seriesStart.setUTCHours(0, 0, 0, 0);

    const [
      total,
      newThisWeek,
      gradeGroups,
      genderGroups,
      verified,
      pending,
      unverified,
      rejected,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count({ where: scopeWhere }),
      this.prisma.user.count({ where: { ...scopeWhere, createdAt: { gte: weekAgo } } }),
      // orderBy 保证跨刷新稳定列序（Postgres HashAggregate 分组顺序不保证；null 排尾）
      this.prisma.profile.groupBy({
        by: ['grade'],
        where: school ? { school } : undefined,
        _count: { _all: true },
        orderBy: { grade: 'asc' },
      }),
      this.prisma.profile.groupBy({
        by: ['gender'],
        where: school ? { school } : undefined,
        _count: { _all: true },
        orderBy: { gender: 'asc' },
      }),
      // 认证分布：user.groupBy 的 where 走不了 profile 关系过滤，
      // 固定四态改用四条 count——单校/全平台同一条路径，免先拉本校 userId 集
      this.prisma.user.count({ where: { ...scopeWhere, verificationStatus: 'verified' } }),
      this.prisma.user.count({ where: { ...scopeWhere, verificationStatus: 'pending' } }),
      this.prisma.user.count({ where: { ...scopeWhere, verificationStatus: 'unverified' } }),
      this.prisma.user.count({ where: { ...scopeWhere, verificationStatus: 'rejected' } }),
      this.prisma.user.findMany({
        where: { ...scopeWhere, createdAt: { gte: seriesStart } },
        select: { createdAt: true },
      }),
    ]);

    // ── 活跃度 / 内容流量（近 30 天）────────────────────────────
    // 活跃口径 = 发帖/评论/点赞/聊天消息任一行为，按 (用户, 日) 去重；
    // 私聊消息只计入活跃去重，不单独展示条数（群体统计不暴露个体聊天行为量）。
    // 范围过滤统一 join profiles（行为表不存学校），无 school 时跳过 join。
    const scopeJoin = school
      ? Prisma.sql`JOIN "profiles" pr ON pr."userId" = a."uid" AND pr."school" = ${school}`
      : Prisma.empty;
    const [activityPairs, contentRows, searchingRows, relationshipRows] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; uid: string }[]>(Prisma.sql`
        SELECT DISTINCT to_char(a."at", 'YYYY-MM-DD') AS day, a."uid" AS uid
        FROM (
          SELECT m."senderId" AS "uid", m."createdAt" AS "at"
            FROM "messages" m WHERE m."createdAt" >= ${seriesStart}
          UNION ALL
          SELECT p."authorUserId", p."createdAt"
            FROM "square_posts" p WHERE p."authorUserId" IS NOT NULL AND p."createdAt" >= ${seriesStart}
          UNION ALL
          SELECT c."userId", c."createdAt"
            FROM "square_post_comments" c WHERE c."createdAt" >= ${seriesStart}
          UNION ALL
          SELECT l."userId", l."createdAt"
            FROM "square_post_likes" l WHERE l."createdAt" >= ${seriesStart}
        ) a
        ${scopeJoin}`),
      this.prisma.$queryRaw<{ day: string; source: string; n: number }[]>(Prisma.sql`
        SELECT to_char(a."at", 'YYYY-MM-DD') AS day, a."source" AS source, COUNT(*)::int AS n
        FROM (
          SELECT p."authorUserId" AS "uid", p."createdAt" AS "at", 'posts' AS "source"
            FROM "square_posts" p WHERE p."authorUserId" IS NOT NULL AND p."createdAt" >= ${seriesStart}
          UNION ALL
          SELECT c."userId", c."createdAt", 'comments'
            FROM "square_post_comments" c WHERE c."createdAt" >= ${seriesStart}
          UNION ALL
          SELECT l."userId", l."createdAt", 'likes'
            FROM "square_post_likes" l WHERE l."createdAt" >= ${seriesStart}
        ) a
        ${scopeJoin}
        GROUP BY 1, 2`),
      // 匹配参与度：任一模式处于该状态的去重用户数（与仪表盘 distinct 口径一致）
      this.prisma.userModeState.findMany({
        where: { matchState: 'searching', ...(school ? { user: { profile: { school } } } : {}) },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.userModeState.findMany({
        where: { matchState: 'relationship', ...(school ? { user: { profile: { school } } } : {}) },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const days: string[] = [];
    const buckets = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const key = new Date(seriesStart.getTime() + i * DAY).toISOString().slice(0, 10);
      days.push(key);
      buckets.set(key, 0);
    }
    for (const u of recentUsers) {
      const key = u.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    // (用户, 日) 去重对 → 日活曲线 + 跨日去重的 7/30 日活跃数（YYYY-MM-DD 字典序即时间序）
    const activeByDay = new Map<string, number>(days.map((d) => [d, 0]));
    const uids7 = new Set<string>();
    const uids30 = new Set<string>();
    const sevenDayFloor = days[23];
    for (const r of activityPairs) {
      if (activeByDay.has(r.day)) activeByDay.set(r.day, (activeByDay.get(r.day) ?? 0) + 1);
      uids30.add(r.uid);
      if (r.day >= sevenDayFloor) uids7.add(r.uid);
    }

    const contentByDay = new Map<string, { posts: number; comments: number; likes: number }>(
      days.map((d) => [d, { posts: 0, comments: 0, likes: 0 }]),
    );
    for (const r of contentRows) {
      const bucket = contentByDay.get(r.day);
      if (bucket && (r.source === 'posts' || r.source === 'comments' || r.source === 'likes')) {
        bucket[r.source] = r.n;
      }
    }

    return {
      school: school ?? null,
      total,
      newThisWeek,
      byGrade: gradeGroups.map((g) => ({ grade: g.grade, count: g._count._all })),
      byGender: genderGroups.map((g) => ({ gender: g.gender, count: g._count._all })),
      verification: { verified, pending, unverified, rejected },
      series30d: days.map((date) => ({ date, count: buckets.get(date) ?? 0 })),
      activity: {
        dau7: uids7.size,
        dau30: uids30.size,
        activeSeries30d: days.map((date) => ({ date, activeUsers: activeByDay.get(date) ?? 0 })),
        contentSeries30d: days.map((date) => ({ date, ...contentByDay.get(date)! })),
        matching: { searching: searchingRows.length, relationship: relationshipRows.length },
      },
    };
  }

  // 认证审核队列（受限投影）：学生会只该看到认证材料本身（学生卡/校邮 + 昵称/学校/年级），
  // 刻意不带登录 email 与其余资料字段；审核动作复用 PATCH :id/verification
  async listVerifications(actor: AdminActor, q: PageQuery) {
    if (actor.role === AdminRole.SPONSOR) {
      throw new ForbiddenException('广告商账号无权访问用户管理');
    }
    const where: Prisma.UserWhereInput = { verificationStatus: 'pending' };
    if (actor.role === AdminRole.STUDENT_UNION) {
      where.profile = { school: this.adminScope.requireUnionSchool(actor).name };
    }
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...skipTake(q),
        select: {
          id: true,
          createdAt: true,
          // 近似提交时刻（排序键同款）：User 无 verificationSubmittedAt，updatedAt 在
          // H5 提交认证时被写入；展示列与排序用同一字段避免顺序与时间互相矛盾
          updatedAt: true,
          studentCardUrl: true,
          schoolEmail: true,
          profile: { select: { nickname: true, school: true, grade: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(items, total, q);
  }
}
