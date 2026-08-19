/* Interface outline: implementation bodies removed. */
import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SendMessageDto, ConversationSessionsQueryDto } from './dto/chat.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(...);
@Get('sessions')
  async getSessions(...);
@Put(':matchId/background')
  async setBackground(...);
@Put('nudge-suffix')
  async setNudgeSuffix(@CurrentUser('id') userId: string, @Body() body:;
@Post(':matchId/nudge')
  async nudge(@CurrentUser('id') userId: string, @Param('matchId') matchId: string);
@Get(':matchId/messages')
  async getMessages(...);
@Get(':matchId/messages/poll')
  async pollMessages(...);
@Post(':matchId/messages')
  async sendMessage(...);
@Put(':matchId/messages/read')
  async markRead(...);
@Get(':matchId/unread')
  async getUnreadCount(...);
