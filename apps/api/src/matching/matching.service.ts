import {
  Injectable, Logger, NotFoundException, BadRequestException, Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import {
  MATCH_MODEL_PROVIDER,
  MatchModelProvider,
  CandidateProfile,
  MatchConstraints,
} from './providers/match-model.interface';
import { UpdateMatchConfigDto } from './dto/matching.dto';

export const MATCH_QUEUE = 'match-queue';
export const MATCH_JOB = 'run-match';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private prisma: PrismaService,
    private profilesService: ProfilesService,
    @Inject(MATCH_MODEL_PROVIDER) private matchModelProvider: MatchModelProvider,
    @InjectQueue(MATCH_QUEUE) private matchQueue: Queue,
  ) {}

  // ─── Config ───────────────────────────────────────────────
  async getMatchConfig() {
    return this.prisma.matchConfig.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  async updateMatchConfig(dto: UpdateMatchConfigDto) {
    const existing = await this.prisma.matchConfig.findFirst();
    if (existing) {
      return this.prisma.matchConfig.update({
        where: { id: existing.id },
        data: dto,
      });
    }
    return this.prisma.matchConfig.create({ data: { cronExpr: dto.cronExpr, ...dto } });
  }

  // ─── 用户主动开始匹配 ──────────────────────────────────────
  async startMatchForUser(userId: string) {
    // 检查用户状态
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mode: true, status: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.mode === 'RELATIONSHIP_MODE') {
      throw new BadRequestException('你已在恋爱模式中，无法开始匹配');
    }

    // 检查是否已有待确认匹配
    const existingMatch = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: { in: ['PENDING_CONFIRM', 'MATCHED', 'RELATIONSHIP_MODE'] },
      },
    });
    if (existingMatch) {
      throw new BadRequestException('你已有进行中的匹配，无法重新开始');
    }

    // 触发匹配任务（用户触发）
    try {
      const job = await this.triggerMatchJob(`user:${userId}`);
      return { message: '匹配已开始，请稍候查看结果', jobId: job.id, status: 'SEARCHING' };
    } catch (e) {
      // 如果已有任务在运行，提示排队中
      if (e instanceof BadRequestException) {
        return { message: '匹配任务进行中，请稍候查看结果', status: 'SEARCHING' };
      }
      throw e;
    }
  }

  // ─── 获取完整匹配状态（给前端状态机用） ───────────────────────
  async getFullMatchStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mode: true, status: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    // Match config
    const matchConfig = await this.prisma.matchConfig.findFirst({
      where: { isEnabled: true },
    });

    // Is there a running job?
    const pendingJob = await this.prisma.matchJob.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
    });

    // 恋爱模式
    if (user.mode === 'RELATIONSHIP_MODE') {
      const match = await this.prisma.match.findFirst({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          status: 'RELATIONSHIP_MODE',
        },
        orderBy: { createdAt: 'desc' },
      });
      const partnerId = match
        ? (match.userAId === userId ? match.userBId : match.userAId)
        : null;
      const partner = partnerId
        ? await this.profilesService.getPublicProfile(partnerId)
        : null;

      return {
        state: 'relationship',
        mode: user.mode,
        matchConfig: matchConfig
          ? { cronExpr: matchConfig.cronExpr, description: matchConfig.description }
          : null,
        match: match ? {
          id: match.id,
          status: match.status,
          relationshipStartedAt: match.relationshipStartedAt,
          confirmedAt: match.confirmedAt,
          score: match.score,
        } : null,
        partner,
      };
    }

    // 有待确认的匹配
    const pendingMatch = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'PENDING_CONFIRM',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingMatch) {
      const isUserA = pendingMatch.userAId === userId;
      const partnerId = isUserA ? pendingMatch.userBId : pendingMatch.userAId;
      const partner = await this.profilesService.getPublicProfile(partnerId);

      return {
        state: 'matched',
        mode: user.mode,
        matchConfig: matchConfig
          ? { cronExpr: matchConfig.cronExpr, description: matchConfig.description }
          : null,
        match: {
          id: pendingMatch.id,
          status: pendingMatch.status,
          myConfirmed: isUserA ? pendingMatch.userAConfirmed : pendingMatch.userBConfirmed,
          partnerConfirmed: isUserA ? pendingMatch.userBConfirmed : pendingMatch.userAConfirmed,
          score: pendingMatch.score,
          matchedAt: pendingMatch.createdAt,
        },
        partner,
      };
    }

    // 正在匹配中
    if (pendingJob) {
      return {
        state: 'searching',
        mode: user.mode,
        matchConfig: matchConfig
          ? { cronExpr: matchConfig.cronExpr, description: matchConfig.description }
          : null,
        match: null,
        partner: null,
      };
    }

    // 空闲
    return {
      state: 'idle',
      mode: user.mode,
      matchConfig: matchConfig
        ? { cronExpr: matchConfig.cronExpr, description: matchConfig.description }
        : null,
      match: null,
      partner: null,
    };
  }

  // ─── Trigger ──────────────────────────────────────────────
  async triggerMatchJob(triggeredBy: string = 'manual') {
    const running = await this.prisma.matchJob.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (running) {
      throw new BadRequestException('已有匹配任务正在运行，请等待完成');
    }

    const job = await this.prisma.matchJob.create({
      data: { triggeredBy, status: 'PENDING' },
    });

    await this.matchQueue.add(MATCH_JOB, { jobId: job.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Match job ${job.id} queued (triggered by: ${triggeredBy})`);
    return job;
  }

  // ─── Execute ──────────────────────────────────────────────
  async executeMatchJob(jobId: string) {
    this.logger.log(`Executing match job: ${jobId}`);

    await this.prisma.matchJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      const activeVersion = await this.prisma.questionnaireVersion.findFirst({
        where: { isActive: true },
      });

      const candidates = await this.buildCandidates(activeVersion?.id);

      await this.prisma.matchJob.update({
        where: { id: jobId },
        data: { totalCandidates: candidates.length },
      });

      if (candidates.length < 2) {
        await this.prisma.matchJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            totalMatched: 0,
            errorMessage: '候选用户不足2人，跳过本次匹配',
          },
        });
        return;
      }

      const constraints: MatchConstraints = {
        maxMatchesPerUser: 1,
        excludeRelationshipMode: true,
      };

      const result = await this.matchModelProvider.generateMatches(candidates, constraints);

      let totalMatched = 0;
      for (const pair of result.pairs) {
        await this.prisma.$transaction(async (tx) => {
          const existingMatch = await tx.match.findFirst({
            where: {
              OR: [
                { userAId: pair.userAId, userBId: pair.userBId },
                { userAId: pair.userBId, userBId: pair.userAId },
              ],
              status: { in: ['PENDING_CONFIRM', 'MATCHED', 'RELATIONSHIP_MODE'] },
            },
          });
          if (existingMatch) return;

          await tx.match.create({
            data: {
              matchJobId: jobId,
              userAId: pair.userAId,
              userBId: pair.userBId,
              score: pair.score,
              metadata: pair.metadata,
              status: 'PENDING_CONFIRM',
              userAConfirmed: false,
              userBConfirmed: false,
            },
          });

          totalMatched++;
        });
      }

      await this.prisma.matchJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalMatched,
        },
      });

      this.logger.log(`Match job ${jobId} completed: ${totalMatched} pairs pending confirm`);
    } catch (error) {
      this.logger.error(`Match job ${jobId} failed:`, error);
      await this.prisma.matchJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error.message,
        },
      });
      throw error;
    }
  }

  // ─── 确认匹配 ────────────────────────────────────────────
  async confirmMatch(userId: string) {
    const match = await this.findPendingMatch(userId);

    const isUserA = match.userAId === userId;

    const updateData = isUserA
      ? { userAConfirmed: true }
      : { userBConfirmed: true };

    const updated = await this.prisma.match.update({
      where: { id: match.id },
      data: updateData,
    });

    const bothConfirmed =
      (isUserA ? true : updated.userBConfirmed) &&
      (!isUserA ? true : updated.userAConfirmed);

    if (bothConfirmed) {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.match.update({
          where: { id: match.id },
          data: {
            status: 'RELATIONSHIP_MODE',
            confirmedAt: now,
            relationshipStartedAt: now,  // ← 记录恋爱开始时间
          },
        });

        await tx.user.updateMany({
          where: { id: { in: [match.userAId, match.userBId] } },
          data: { mode: 'RELATIONSHIP_MODE' },
        });
      });

      this.logger.log(`Match ${match.id}: 双方确认，进入恋爱模式`);
      return { status: 'RELATIONSHIP_MODE', message: '双方已确认，恋爱模式已开启！' };
    }

    this.logger.log(`Match ${match.id}: ${isUserA ? 'UserA' : 'UserB'} 已确认，等待对方`);
    return { status: 'WAITING', message: '你已确认，等待对方确认...' };
  }

  // ─── 拒绝匹配 ────────────────────────────────────────────
  async rejectMatch(userId: string) {
    const match = await this.findPendingMatch(userId);

    await this.prisma.match.update({
      where: { id: match.id },
      data: { status: 'REJECTED' },
    });

    this.logger.log(`Match ${match.id}: 被用户 ${userId} 拒绝`);
    return { message: '已拒绝本次匹配，你将在下一轮匹配中重新参与' };
  }

  // ─── 分手/解除关系 ───────────────────────────────────────
  async dissolveRelationship(userId: string, reason?: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'RELATIONSHIP_MODE',
      },
    });

    if (!match) {
      throw new NotFoundException('你当前没有进行中的恋爱关系');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: {
          status: 'DISSOLVED',
          dissolvedBy: userId,
          dissolvedAt: new Date(),
          dissolveReason: reason || null,
        },
      });

      await tx.user.updateMany({
        where: { id: { in: [match.userAId, match.userBId] } },
        data: { mode: 'MATCH_MODE' },
      });
    });

    this.logger.log(`Match ${match.id}: 被用户 ${userId} 解除关系`);
    return { message: '恋爱关系已解除，你将回到匹配模式' };
  }

  // ─── 辅助：查找待确认匹配 ────────────────────────────────
  private async findPendingMatch(userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'PENDING_CONFIRM',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!match) {
      throw new NotFoundException('没有待确认的匹配');
    }

    const isUserA = match.userAId === userId;
    const alreadyConfirmed = isUserA ? match.userAConfirmed : match.userBConfirmed;
    if (alreadyConfirmed) {
      throw new BadRequestException('你已经确认过了，正在等待对方确认');
    }

    return match;
  }

  private async buildCandidates(activeVersionId?: string): Promise<CandidateProfile[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        mode: 'MATCH_MODE',
        profile: { isNot: null },
      },
      include: {
        profile: true,
        answers: activeVersionId
          ? {
              where: { questionnaireVersionId: activeVersionId },
              include: { question: { select: { type: true } } },
            }
          : { include: { question: { select: { type: true } } } },
      },
    });

    return users
      .filter((u) => u.profile && u.profile.gender && u.profile.genderPref)
      .map((u) => ({
        userId: u.id,
        gender: u.profile!.gender!,
        genderPref: u.profile!.genderPref!,
        age: u.profile!.age || 20,
        city: u.profile!.city || '',
        school: u.profile!.school || '',
        interests: u.profile!.interests || [],
        answers: u.answers.map((a) => ({
          questionId: a.questionId,
          questionType: a.question.type,
          value: a.value,
        })),
      }));
  }

  // ─── 获取我的匹配结果 ─────────────────────────────────────
  async getMyMatchResult(userId: string) {
    let match = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'RELATIONSHIP_MODE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!match) {
      match = await this.prisma.match.findFirst({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          status: 'PENDING_CONFIRM',
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!match) return { matched: false, status: 'NO_MATCH' };

    const isUserA = match.userAId === userId;
    const partnerId = isUserA ? match.userBId : match.userAId;
    const myConfirmed = isUserA ? match.userAConfirmed : match.userBConfirmed;
    const partnerConfirmed = isUserA ? match.userBConfirmed : match.userAConfirmed;

    if (match.status === 'PENDING_CONFIRM') {
      const publicProfile = await this.profilesService.getPublicProfile(partnerId);
      return {
        matched: true,
        matchId: match.id,
        status: 'PENDING_CONFIRM',
        myConfirmed,
        partnerConfirmed,
        matchedAt: match.createdAt,
        score: match.score,
        partner: publicProfile,
      };
    }

    const publicProfile = await this.profilesService.getPublicProfile(partnerId);
    return {
      matched: true,
      matchId: match.id,
      status: 'RELATIONSHIP_MODE',
      confirmedAt: match.confirmedAt,
      relationshipStartedAt: match.relationshipStartedAt,
      matchedAt: match.createdAt,
      score: match.score,
      partner: publicProfile,
    };
  }

  // ─── Jobs & Admin ─────────────────────────────────────────
  async listJobs(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.matchJob.findMany({
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { matches: true } } },
      }),
      this.prisma.matchJob.count(),
    ]);

    return { jobs, total, page, limit };
  }

  async getJobResult(jobId: string) {
    const job = await this.prisma.matchJob.findUnique({
      where: { id: jobId },
      include: {
        matches: {
          include: {
            userA: { select: { email: true, profile: { select: { nickname: true } } } },
            userB: { select: { email: true, profile: { select: { nickname: true } } } },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('匹配任务不存在');
    return job;
  }

  async retryFailedJob(jobId: string) {
    const job = await this.prisma.matchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('任务不存在');
    if (job.status !== 'FAILED') throw new BadRequestException('只能重试失败的任务');

    await this.prisma.matchJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', errorMessage: null },
    });

    await this.matchQueue.add(MATCH_JOB, { jobId }, { attempts: 3 });
    return { message: '任务已重新加入队列' };
  }

  async listAllMatches(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      this.prisma.match.findMany({
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          userA: { select: { email: true, profile: { select: { nickname: true } } } },
          userB: { select: { email: true, profile: { select: { nickname: true } } } },
          matchJob: { select: { id: true, status: true } },
        },
      }),
      this.prisma.match.count(),
    ]);

    return { matches, total, page, limit };
  }
}
