/* Interface outline: implementation bodies removed. */
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { SchoolsService } from './schools.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateSchoolDto,
  UpdateAdPricingDefaultsDto,
  UpdateSchoolBankDto,
  UpdateSchoolDto,
} from './dto/schools.dto';

type CurrentAdmin =
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/schools')
export class SchoolsController {
  constructor(...);
@Get()
  list(...);
@Post()
  create(@Body() dto: CreateSchoolDto);
@Get(':id')
  detail(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string);
@Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSchoolDto);
@Put(':id/bank')
  updateBank(...);
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/ad-pricing')
export class AdPricingController {
  constructor(...);
@Get('defaults')
  getDefaults();
@Put('defaults')
  updateDefaults(@Body() dto: UpdateAdPricingDefaultsDto);
