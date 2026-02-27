import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DissolveDto } from './dto/matching.dto';

@ApiTags('匹配（用户端）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(private matchingService: MatchingService) {}

  @Post('start')
  @ApiOperation({ summary: '用户主动开始匹配（点击按钮触发）' })
  async startMatch(@CurrentUser('id') userId: string) {
    return this.matchingService.startMatchForUser(userId);
  }

  @Get('status')
  @ApiOperation({ summary: '获取完整匹配状态（状态机 + 匹配对象 + 下次匹配时间）' })
  async getStatus(@CurrentUser('id') userId: string) {
    return this.matchingService.getFullMatchStatus(userId);
  }

  @Get('result')
  @ApiOperation({ summary: '获取我的匹配结果（含匹配对象公开资料和确认状态）' })
  async getMyResult(@CurrentUser('id') userId: string) {
    return this.matchingService.getMyMatchResult(userId);
  }

  @Post('confirm')
  @ApiOperation({ summary: '确认匹配 — 同意与匹配对象进入恋爱模式' })
  async confirmMatch(@CurrentUser('id') userId: string) {
    return this.matchingService.confirmMatch(userId);
  }

  @Post('reject')
  @ApiOperation({ summary: '拒绝匹配 — 拒绝当前匹配，回到匹配池等待下一轮' })
  async rejectMatch(@CurrentUser('id') userId: string) {
    return this.matchingService.rejectMatch(userId);
  }

  @Post('dissolve')
  @ApiOperation({ summary: '解除恋爱关系 — 双方回到匹配模式' })
  async dissolveRelationship(
    @CurrentUser('id') userId: string,
    @Body() dto: DissolveDto,
  ) {
    return this.matchingService.dissolveRelationship(userId, dto.reason);
  }
}
