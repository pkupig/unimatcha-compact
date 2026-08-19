/* Interface outline: implementation bodies removed. */
import { Controller, Get, Put, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(...);
@Get()
  async getNotifications(...);
@Get('unread-count')
  async getUnreadCount(@CurrentUser('id') userId: string);
@Put('read')
  async markAllRead(@CurrentUser('id') userId: string);
@Put(':id/read')
  async markRead(@CurrentUser('id') userId: string, @Param('id') id: string);
