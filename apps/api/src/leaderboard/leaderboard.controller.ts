/* Interface outline: implementation bodies removed. */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(...);
@Get()
enum: ['duration', 'score', 'streak', 'compatibility', 'shared_interests', 'popular', 'growth', 'empathy'], {
  async getLeaderboard(...);
@Get('duration')
  async getDurationLeaderboard(@Query('limit') limit?: number);
@Get('score')
  async getScoreLeaderboard(@Query('limit') limit?: number);
