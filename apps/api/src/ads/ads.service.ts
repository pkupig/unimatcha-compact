/* Interface outline: implementation bodies removed. */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdCampaignStatus,
  AdminRole,
  AdPricingModel,
  LedgerEntryType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmPaymentDto,
  CreateCampaignDto,
  ReportAdEventsDto,
  ReviewCampaignDto,
  SuspendCampaignDto,
  UpdateCampaignDto,
} from './dto/ads.dto';

type CurrentAdmin =
type PriceSnapshotEntry =
@Injectable()
export class AdsService {
  constructor(...);
  private isTeam(admin: CurrentAdmin): boolean;
  private requireUnionSchool(admin: CurrentAdmin): string;
  private parseDateOnly(input: string, errorMessage: string): Date;
  private todayUtc(): Date;
  private endOfDayUtc(endDate: Date): Date;
  private inclusiveDays(startDate: Date, endDate: Date): number;
  private async getPricingDefaults(): Promise<typeof FALLBACK_PRICING>;
  private campaignInclude();
  private shapeCampaign(...);
  private assertCanView(...);
  private async validateCampaignPayload(advertiserId: string, dto: CreateCampaignDto);
  async createCampaign(admin: CurrentAdmin, dto: CreateCampaignDto);
  async updateCampaign(admin: CurrentAdmin, id: string, dto: UpdateCampaignDto);
  async submitCampaign(admin: CurrentAdmin, id: string);
  async listCampaigns(...);
  async getCampaign(admin: CurrentAdmin, id: string);
  async getCampaignStats(admin: CurrentAdmin, id: string, from?: string, to?: string);
  async reviewCampaign(admin: CurrentAdmin, id: string, dto: ReviewCampaignDto);
  async confirmPayment(admin: CurrentAdmin, id: string, dto: ConfirmPaymentDto);
  async pauseCampaign(admin: CurrentAdmin, id: string);
  async resumeCampaign(admin: CurrentAdmin, id: string);
  async suspendCampaign(admin: CurrentAdmin, id: string, dto: SuspendCampaignDto);
  async unsuspendCampaign(admin: CurrentAdmin, id: string);
  async getOverview(admin: CurrentAdmin);
  private sinceUtc(days: number): Date;
  private buildDailySeries(...);
  private async sponsorOverview(admin: CurrentAdmin);
  private async unionOverview(admin: CurrentAdmin);
  private async teamOverview(admin: CurrentAdmin);
  async getFeed(schoolName?: string, limit?: number);
  async reportEvents(dto: ReportAdEventsDto);
  async settleCampaign(campaignId: string);
  async accrueBuyoutSpend(campaignId?: string, capDate?: Date);
