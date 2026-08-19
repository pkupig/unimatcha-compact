/* Interface outline: implementation bodies removed. */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdCampaignStatus, AdminRole, Prisma, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSchoolDto,
  UpdateAdPricingDefaultsDto,
  UpdateSchoolBankDto,
  UpdateSchoolDto,
} from './dto/schools.dto';

type CurrentAdmin =
type SchoolStats =
@Injectable()
export class SchoolsService {
  constructor(...);
  private assertUnionScope(admin: CurrentAdmin, schoolId: string);
  private async computeStats(...);
  async list(...);
  async create(dto: CreateSchoolDto);
  async detail(admin: CurrentAdmin, id: string);
  async update(id: string, dto: UpdateSchoolDto);
  async updateBank(admin: CurrentAdmin, id: string, dto: UpdateSchoolBankDto);
  async getAdPricingDefaults();
  async updateAdPricingDefaults(dto: UpdateAdPricingDefaultsDto);
