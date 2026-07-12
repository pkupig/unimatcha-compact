import { Controller, Get, Put, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('通知')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '获取我的通知列表' })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.notificationService.getNotifications(userId, page || 1, limit || 20);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '获取未读通知数量' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationService.getUnreadCount(userId);
  }

  @Put('read')
  @ApiOperation({ summary: '全部标记已读' })
  async markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationService.markRead(userId);
  }

  @Put(':id/read')
  @ApiOperation({ summary: '标记单条通知已读' })
  async markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notificationService.markRead(userId, id);
  }
}
