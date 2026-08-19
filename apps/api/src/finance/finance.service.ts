/* Interface outline: implementation bodies removed. */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, LedgerEntryType, Prisma, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAdjustmentDto,
  CreateGrantDto,
  CreateWithdrawalDto,
  ReviewWithdrawalDto,
} from './dto/finance.dto';

type CurrentAdmin =
@Injectable()
export class FinanceService {
  constructor(...);
  private assertUnionScope(admin: CurrentAdmin, schoolId: string);
  private async computeBalance(tx: Prisma.TransactionClient, schoolId: string);
  async getSchoolSummary(...);
  async createGrant(admin: CurrentAdmin, dto: CreateGrantDto);
  async createAdjustment(admin: CurrentAdmin, dto: CreateAdjustmentDto);
  async createWithdrawal(admin: CurrentAdmin, dto: CreateWithdrawalDto);
  async (tx) =>;
  async listWithdrawals(...);
  async reviewWithdrawal(admin: CurrentAdmin, id: string, dto: ReviewWithdrawalDto);
  async markWithdrawalPaid(admin: CurrentAdmin, id: string);
  async getRevenueReport(...);
