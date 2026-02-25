import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('匹配（用户端）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(private matchingService: MatchingService) {}

  @Get('result')
  @ApiOperation({ summary: '获取我的匹配结果（含匹配对象公开资料）' })
  async getMyResult(@CurrentUser('id') userId: string) {
    return this.matchingService.getMyMatchResult(userId);
  }
}
