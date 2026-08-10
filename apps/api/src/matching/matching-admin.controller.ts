import {
  Controller, Get, Post, Put, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { MatchScheduler } from './match.scheduler';
import { TriggerMatchJobDto, UpdateMatchConfigDto } from './dto/matching.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import { normalizeMode } from './mode.util';

@ApiTags('匹配管理（管理员）')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles('SUPER', 'TEAM')
@Controller('admin/matching')
export class MatchingAdminController {
  constructor(
    private matchingService: MatchingService,
    private matchScheduler: MatchScheduler,
  ) {}

  @Get('config')
  @ApiOperation({ summary: '获取匹配时间配置' })
  getConfig() { return this.matchingService.getMatchConfig(); }

  @Put('config')
  @ApiOperation({ summary: '更新匹配时间配置' })
  async updateConfig(@Body() dto: UpdateMatchConfigDto) {
    const config = await this.matchingService.updateMatchConfig(dto);
    // Reload cron scheduler
    await this.matchScheduler.syncCronFromDB();
    return config;
  }

  @Post('jobs/trigger')
  @ApiOperation({ summary: '手动触发匹配任务（按 mode）' })
  async triggerJob(@CurrentAdmin() actor: AdminActor, @Query() q: TriggerMatchJobDto) {
    return this.matchingService.triggerMatchJob(`manual:${actor.id}`, normalizeMode(q.mode));
  }

  @Get('jobs')
  @ApiOperation({ summary: '获取匹配任务列表' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listJobs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.matchingService.listJobs({ page, limit });
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: '获取匹配任务详情与结果' })
  getJobResult(@Param('id') id: string) {
    return this.matchingService.getJobResult(id);
  }

  @Post('jobs/:id/retry')
  @ApiOperation({ summary: '重试失败的匹配任务' })
  retryJob(@Param('id') id: string) {
    return this.matchingService.retryFailedJob(id);
  }

  @Get('results')
  @ApiOperation({ summary: '查看所有匹配结果' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listResults(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.matchingService.listAllMatches({ page, limit });
  }
}
