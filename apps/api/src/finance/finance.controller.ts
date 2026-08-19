/* Interface outline: implementation bodies removed. */
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { FinanceService } from './finance.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateAdjustmentDto,
  CreateGrantDto,
  CreateWithdrawalDto,
  ReviewWithdrawalDto,
} from './dto/finance.dto';

type CurrentAdmin =
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/finance')
export class FinanceController {
  constructor(...);
@Get('schools/:id/summary')
  getSchoolSummary(...);
@Post('grants')
  createGrant(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateGrantDto);
@Post('adjustments')
  createAdjustment(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateAdjustmentDto);
@Post('withdrawals')
  createWithdrawal(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateWithdrawalDto);
@Get('withdrawals')
  listWithdrawals(...);
@Post('withdrawals/:id/review')
  reviewWithdrawal(...);
@Post('withdrawals/:id/mark-paid')
  markWithdrawalPaid(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string);
@Get('revenue-report')
  getRevenueReport(@Query('from') from?: string, @Query('to') to?: string);
