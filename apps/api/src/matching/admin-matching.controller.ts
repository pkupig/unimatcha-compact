/* Interface outline: implementation bodies removed. */
import {
  Controller, Get, Post, Put, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { MatchScheduler } from './match.scheduler';
import { UpdateMatchConfigDto } from './dto/matching.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { normalizeMode } from './mode.util';

@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/matching')
export class AdminMatchingController {
  constructor(...);
@Get('config')
  getConfig();
@Put('config')
  async updateConfig(@Body() dto: UpdateMatchConfigDto);
@Post('jobs/trigger')
  async triggerJob(@CurrentUser('id') adminId: string, @Query('mode') mode?: string);
@Get('jobs')
  listJobs(...);
@Get('jobs/:id')
  getJobResult(@Param('id') id: string);
@Post('jobs/:id/retry')
  retryJob(@Param('id') id: string);
@Get('results')
  listResults(...);
