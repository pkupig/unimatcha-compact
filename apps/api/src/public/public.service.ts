import { Injectable, Logger } from '@nestjs/common';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';

type SiteStats = {
  users: number;
  matches: number;
  schools: number;
  roundsCompleted: number;
  currentRound: number;
  nextRevealAt: string | null;
  timezone: string;
};

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);
  private statsCache: { at: number; data: SiteStats } | null = null;
  private static readonly CACHE_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getSiteStats(): Promise<SiteStats> {
    if (this.statsCache && Date.now() - this.statsCache.at < PublicService.CACHE_MS) {
      return this.statsCache.data;
    }

    const [users, matches, schoolGroups, roundsCompleted, config] = await Promise.all([
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.match.count(),
      this.prisma.profile.findMany({
        where: { school: { not: null } },
        distinct: ['school'],
        select: { school: true },
      }),
      this.prisma.matchJob.count({ where: { status: 'COMPLETED' } }),
      this.prisma.matchConfig.findFirst({ where: { isEnabled: true }, orderBy: { updatedAt: 'desc' } }),
    ]);

    let nextRevealAt: string | null = null;
    const timezone = config?.timezone ?? 'Asia/Shanghai';
    if (config?.cronExpr) {
      try {
        // 只用于计算下一次触发时间，不启动 job
        const job = new CronJob(config.cronExpr, () => undefined, null, false, timezone);
        nextRevealAt = job.nextDate().toJSDate().toISOString();
      } catch (err: any) {
        this.logger.warn(`site-stats: invalid cronExpr, skip nextRevealAt: ${err?.message ?? err}`);
      }
    }

    const data: SiteStats = {
      users,
      matches,
      schools: schoolGroups.length,
      roundsCompleted,
      currentRound: roundsCompleted + 1,
      nextRevealAt,
      timezone,
    };
    this.statsCache = { at: Date.now(), data };
    return data;
  }

  /** 幂等提交：同 (type,email) 重复提交静默成功，不泄露是否已存在。 */
  async submit(
    type: 'WAITLIST' | 'SPONSOR',
    email: string,
    organization?: string,
    message?: string,
    locale?: string,
  ) {
    const normalized = email.trim().toLowerCase();
    await this.prisma.publicSubmission.upsert({
      where: { type_email: { type, email: normalized } },
      // 重复提交时刷新补充信息（申请人可能补写组织/留言）
      update: { organization: organization ?? undefined, message: message ?? undefined, locale: locale ?? undefined },
      create: { type, email: normalized, organization, message, locale },
    });
    return { ok: true };
  }
}
