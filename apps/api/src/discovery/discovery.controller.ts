import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('发现（找人 / 猜你认识）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('discovery')
export class DiscoveryController {
  constructor(private discovery: DiscoveryService) {}

  @Get('users')
  @ApiOperation({ summary: '找人：按昵称/学校/专业/城市/标签搜索，也支持连接码精确命中' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async searchUsers(
    @CurrentUser('id') userId: string,
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.discovery.searchUsers(userId, q || '', {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('suggestions')
  @ApiOperation({
    summary: '猜你认识（需本人开启 privacy.discoverable；被推荐方同样需开启）',
  })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  async suggestions(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.discovery.getSuggestions(userId, {
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('suggestions/:userId/dismiss')
  @ApiOperation({ summary: '忽略某个推荐（单向、永久，不再出现在我的推荐里）' })
  async dismiss(
    @CurrentUser('id') viewerId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.discovery.dismissSuggestion(viewerId, targetUserId);
  }
}
