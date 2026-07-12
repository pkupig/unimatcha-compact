import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry, Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService, MATCH_QUEUE } from './matching.service';

@Injectable()
export class MatchScheduler {
  private readonly logger = new Logger(MatchScheduler.name);
  private currentCronJob: CronJob | null = null;
  private readonly CRON_JOB_NAME = 'match-cron';

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private prisma: PrismaService,
    private matchingService: MatchingService,
    @InjectQueue(MATCH_QUEUE) private matchQueue: Queue,
  ) {}

  // 多实例部署时用 Redis SETNX 锁去重，复用 Bull 的 ioredis 连接；
  // Redis 异常时降级为直接执行（与单实例行为一致）
  private async tryAcquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.matchQueue.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (e) {
      this.logger.warn(`获取分布式锁失败（${key}），降级为直接执行：` + e.message);
      return true;
    }
  }

  private cronLockKey(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `match:cron-lock:${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}`;
  }

  async onModuleInit() {
    await this.syncCronFromDB();
  }

  // 每 10 分钟清理一次：超过 48h 未双方确认的临时对话自动过期（恋人+朋友通用，§3.5）
  // 同时兼容清理历史 PENDING_CONFIRM 脏数据（§3.6）
  @Interval(10 * 60 * 1000)
  async handleConfirmExpiry() {
    if (!(await this.tryAcquireLock('match:expiry-lock', 60))) return;
    try {
      await this.matchingService.expireUnconfirmedMatches();
      await this.matchingService.expireStaleProposals();
    } catch (e: any) {
      this.logger.error('过期清理失败：' + e.message);
    }
  }

  async syncCronFromDB() {
    const config = await this.prisma.matchConfig.findFirst({
      where: { isEnabled: true },
    });

    if (!config) {
      // 无启用配置：移除现有 job（若有）后停用调度
      try {
        this.schedulerRegistry.deleteCronJob(this.CRON_JOB_NAME);
      } catch {}
      this.logger.log('No active match config found, scheduler disabled');
      return;
    }

    // 先按配置时区构建新 job 再销毁旧 job：若 cronExpr 非法，CronJob 构造会抛错，
    // 此时旧调度仍在运行（不会出现「删了旧 job 又建失败 → 匹配彻底停摆」的窗口，§3.5）。
    // 第 5 参 timezone 确保 cron 按配置时区（默认 Asia/Shanghai）触发而非 UTC。
    let job: CronJob;
    try {
      job = new CronJob(
        config.cronExpr,
        async () => {
          if (!(await this.tryAcquireLock(this.cronLockKey(), 300))) {
            this.logger.log('Match cron lock held by another instance, skip');
            return;
          }
          this.logger.log('Scheduled match triggered');
          // 串行触发两模式（避免并发 job 抢运行锁；任一失败不阻断另一模式，§3.5）
          try {
            await this.matchingService.triggerMatchJob('scheduler', 'romantic');
          } catch (err: any) {
            this.logger.error('Scheduled romantic match trigger failed:', err.message);
          }
          try {
            await this.matchingService.triggerMatchJob('scheduler', 'friend');
          } catch (err: any) {
            this.logger.error('Scheduled friend match trigger failed:', err.message);
          }
        },
        null,
        false,
        config.timezone,
      );
    } catch (err: any) {
      this.logger.error(
        `Invalid cron expression "${config.cronExpr}", keeping previous schedule: ${err?.message ?? err}`,
      );
      return;
    }

    // 新 job 构建成功，才移除旧 job 并装载新 job
    try {
      this.schedulerRegistry.deleteCronJob(this.CRON_JOB_NAME);
    } catch {}

    this.schedulerRegistry.addCronJob(this.CRON_JOB_NAME, job);
    job.start();
    this.logger.log(`Match cron scheduled: ${config.cronExpr} (tz=${config.timezone})`);
  }
}
