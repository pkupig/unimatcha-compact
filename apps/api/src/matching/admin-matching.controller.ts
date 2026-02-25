import {
  Controller, Get, Post, Put, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { MatchScheduler } from './match.scheduler';
import { UpdateMatchConfigDto } from './dto/matching.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('匹配管理（管理员）')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/matching')
export class AdminMatchingController {
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
  @ApiOperation({ summary: '手动触发匹配任务' })
  async triggerJob(@CurrentUser('id') adminId: string) {
    return this.matchingService.triggerMatchJob(`manual:${adminId}`);
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
