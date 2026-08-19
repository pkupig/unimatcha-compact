/* Interface outline: implementation bodies removed. */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { AdsService } from './ads.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ConfirmPaymentDto,
  CreateCampaignDto,
  ReviewCampaignDto,
  SuspendCampaignDto,
  UpdateCampaignDto,
} from './dto/ads.dto';

type CurrentAdmin =
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/ads')
export class AdsAdminController {
  constructor(...);
@Post('campaigns')
  createCampaign(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateCampaignDto);
@Put('campaigns/:id')
  updateCampaign(...);
@Post('campaigns/:id/submit')
  submitCampaign(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string);
@Get('overview')
  getOverview(@CurrentUser() admin: CurrentAdmin);
@Get('campaigns')
  listCampaigns(...);
@Get('campaigns/:id')
  getCampaign(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string);
@Get('campaigns/:id/stats')
  getCampaignStats(...);
@Post('campaigns/:id/review')
  reviewCampaign(...);
@Post('campaigns/:id/confirm-payment')
  confirmPayment(...);
@Post('campaigns/:id/pause')
  pauseCampaign(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string);
@Post('campaigns/:id/resume')
  resumeCampaign(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string);
@Post('campaigns/:id/suspend')
  suspendCampaign(...);
@Post('campaigns/:id/unsuspend')
  unsuspendCampaign(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string);
