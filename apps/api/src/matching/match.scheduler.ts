/* Interface outline: implementation bodies removed. */
import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry, Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService, MATCH_QUEUE } from './matching.service';

@Injectable()
export class MatchScheduler {
  constructor(...);
  private async tryAcquireLock(key: string, ttlSeconds: number): Promise<boolean>;
  private cronLockKey(): string;
  async onModuleInit();
  async handleConfirmExpiry();
  async syncCronFromDB();
  async () =>;
