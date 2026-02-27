import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('排行榜')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get('duration')
  @ApiOperation({ summary: '恋爱时长排行榜' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getDurationLeaderboard(@Query('limit') limit?: number) {
    return this.leaderboardService.getDurationLeaderboard(limit || 20);
  }

  @Get('score')
  @ApiOperation({ summary: '恋爱分排行榜' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getScoreLeaderboard(@Query('limit') limit?: number) {
    return this.leaderboardService.getScoreLeaderboard(limit || 20);
  }
}
