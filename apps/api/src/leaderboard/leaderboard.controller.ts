import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

/**
 * @deprecated 排行榜已于双模式重构「阶段 0」从前端下线（H 规则，见 DESIGN-DUAL-MODE.md §8.2 选项 A）。
 * 后端代码暂保留以便回退，但不应在任何前端导航 / 接口文档中引用；H5 已移除 Leaderboard 入口与 overlay。
 */
@ApiTags('排行榜（已下线·前端不调用）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOperation({ summary: '统一排行榜接口（type 参数切换榜单类型）' })
  @ApiQuery({
    name: 'type',
    required: true,
    enum: ['duration', 'score', 'streak', 'compatibility', 'shared_interests', 'popular', 'growth', 'empathy'],
    example: 'duration',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getLeaderboard(
    @Query('type') type: string,
    @Query('limit') limit?: number,
  ) {
    return this.leaderboardService.getLeaderboard(type, limit || 20);
  }

  // 保留旧接口兼容
  @Get('duration')
  @ApiOperation({ summary: '恋爱时长排行榜（兼容旧接口）' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getDurationLeaderboard(@Query('limit') limit?: number) {
    return this.leaderboardService.getLeaderboard('duration', limit || 20);
  }

  @Get('score')
  @ApiOperation({ summary: '恋爱分排行榜（兼容旧接口）' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getScoreLeaderboard(@Query('limit') limit?: number) {
    return this.leaderboardService.getLeaderboard('score', limit || 20);
  }
}
