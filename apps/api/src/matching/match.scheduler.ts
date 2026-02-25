import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from './matching.service';

@Injectable()
export class MatchScheduler {
  private readonly logger = new Logger(MatchScheduler.name);
  private currentCronJob: CronJob | null = null;
  private readonly CRON_JOB_NAME = 'match-cron';

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private prisma: PrismaService,
    private matchingService: MatchingService,
  ) {}

  async onModuleInit() {
    await this.syncCronFromDB();
  }

  async syncCronFromDB() {
    const config = await this.prisma.matchConfig.findFirst({
      where: { isEnabled: true },
    });

    // Remove existing job
    try {
      this.schedulerRegistry.deleteCronJob(this.CRON_JOB_NAME);
    } catch {}

    if (!config) {
      this.logger.log('No active match config found, scheduler disabled');
      return;
    }

    const job = new CronJob(config.cronExpr, async () => {
      this.logger.log('⏰ Scheduled match triggered');
      try {
        await this.matchingService.triggerMatchJob('scheduler');
      } catch (err) {
        this.logger.error('Scheduled match trigger failed:', err.message);
      }
    });

    this.schedulerRegistry.addCronJob(this.CRON_JOB_NAME, job);
    job.start();
    this.logger.log(`✅ Match cron scheduled: ${config.cronExpr}`);
  }
}
