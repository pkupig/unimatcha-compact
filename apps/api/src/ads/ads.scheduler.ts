/* Interface outline: implementation bodies removed. */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AdCampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdsService } from './ads.service';

@Injectable()
export class AdsScheduler implements OnModuleInit {
  constructor(...);
  async onModuleInit();
  private todayUtc(): Date;
  async tick();
  private async activateDueCampaigns();
  private async completeExpiredCampaigns();
