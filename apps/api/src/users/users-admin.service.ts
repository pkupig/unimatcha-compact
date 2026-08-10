import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminScopeService } from '../admin-core/admin-scope.service';
import { AdminActor } from '../admin-core/admin-actor';
import { paginated, skipTake } from '../common/utils/pagination';
import { ListUsersQueryDto } from './dto/users-admin.dto';

/**
 * 用户后管（Step6 拆出）：原 AdminService 用户段 + UsersService 的四个 admin 专用方法
 * 合并于此（wrapper 与实现两层收成一层）。resetUserMode 事务体自原实现逐字搬移。
 * 范围规则（ADMIN-REDESIGN §4）：SPONSOR 一律 403；学生会仅本校
 * （profile.school == School.name 字符串相等匹配）。
 */
@Injectable()
export class UsersAdminService {
  constructor(
    private prisma: PrismaService,
    private adminScope: AdminScopeService,
  ) {}

  private async assertUserScope(actor: AdminActor, userId: string) {
    if (actor.role === AdminRole.SPONSOR) {
      throw new ForbiddenException('商家账号无权访问用户管理');
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
      throw new ForbiddenException('商家账号无权访问用户管理');
    }
    // 学生会：强制过滤 profile.school == 本校 School.name（ADMIN-REDESIGN §4）
    const school =
      actor.role === AdminRole.STUDENT_UNION
        ? this.adminScope.requireUnionSchool(actor).name
        : undefined;

    const where: any = {};
    if (q.search) {
      where.OR = [
        { email: { contains: q.search, mode: 'insensitive' } },
        { profile: { nickname: { contains: q.search, mode: 'insensitive' } } },
      ];
    }
    if (q.status) where.status = q.status;
    if (school) where.profile = { school };

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

  async getUserDetail(actor: AdminActor, userId: string) {
    await this.assertUserScope(actor, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
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
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, email: true, status: true },
    });
  }

  // 管理员重置用户匹配模式（双模式）：
  // 临时对话 → EXPIRED，已确认关系 → DISSOLVED，并把双方相应模式的状态机重置为 idle
  async resetUserMode(actor: AdminActor, userId: string) {
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
    return this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: status },
      select: { id: true, email: true, verificationStatus: true },
    });
  }
}
