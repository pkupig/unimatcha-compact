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

  // ─── Trigger ──────────────────────────────────────────────
  async triggerMatchJob(triggeredBy: string = 'manual') {
    // Check no running job
    const running = await this.prisma.matchJob.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (running) {
      throw new BadRequestException('已有匹配任务正在运行，请等待完成');
    }

    const job = await this.prisma.matchJob.create({
      data: { triggeredBy, status: 'PENDING' },
    });

    // Enqueue
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

    const job = await this.prisma.matchJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      // 1. Gather candidates: active users in MATCH_MODE with complete profiles & submitted questionnaire
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

      // 2. Call AI provider
      const constraints: MatchConstraints = {
        maxMatchesPerUser: 1,
        excludeRelationshipMode: true,
      };

      const result = await this.matchModelProvider.generateMatches(candidates, constraints);

      // 3. Save match results
      let totalMatched = 0;
      for (const pair of result.pairs) {
        await this.prisma.$transaction(async (tx) => {
          // Check if already matched
          const existingMatch = await tx.match.findFirst({
            where: {
              OR: [
                { userAId: pair.userAId, userBId: pair.userBId },
                { userAId: pair.userBId, userBId: pair.userAId },
              ],
              status: { in: ['MATCHED', 'RELATIONSHIP_MODE'] },
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
              status: 'MATCHED',
            },
          });

          // Switch both users to RELATIONSHIP_MODE
          await tx.user.updateMany({
            where: { id: { in: [pair.userAId, pair.userBId] } },
            data: { mode: 'RELATIONSHIP_MODE' },
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

      this.logger.log(`Match job ${jobId} completed: ${totalMatched} pairs matched`);
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

  // ─── Results & Jobs ───────────────────────────────────────
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

  async getMyMatchResult(userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: { in: ['MATCHED', 'RELATIONSHIP_MODE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!match) return { matched: false };

    const partnerId = match.userAId === userId ? match.userBId : match.userAId;
    const publicProfile = await this.profilesService.getPublicProfile(partnerId);

    return {
      matched: true,
      matchId: match.id,
      status: match.status,
      matchedAt: match.createdAt,
      partner: publicProfile,
    };
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
