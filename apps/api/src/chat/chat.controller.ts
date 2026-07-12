import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SendMessageDto, ConversationSessionsQueryDto } from './dto/chat.dto';

@ApiTags('聊天')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  // ─── 会话列表（恋人候选 + 多个朋友，临时/永久统一入口，§4.2） ──
  @Get('sessions')
  @ApiOperation({ summary: '会话列表（恋人候选 + 多个朋友，含 status/mode/remainingMs）' })
  @ApiQuery({ name: 'mode', required: false, description: 'romantic | friend | all（默认 all）' })
  @ApiQuery({ name: 'limit', required: false, description: '返回条数（默认50，最大100）' })
  async getSessions(
    @CurrentUser('id') userId: string,
    @Query() query: ConversationSessionsQueryDto,
  ) {
    return this.chatService.getConversationSessions(userId, {
      mode: query.mode,
      limit: query.limit,
    });
  }

  // ─── 设置/清除我的聊天背景（本轮反馈7，各自设各自的） ──
  @Put(':matchId/background')
  @ApiOperation({ summary: '设置/清除我的聊天背景（仅已确认对话）' })
  async setBackground(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() body: { imageUrl?: string | null },
  ) {
    return this.chatService.setChatBackground(matchId, userId, body?.imageUrl ?? null);
  }

  // ─── 拍一拍 + 自定义后缀（本轮反馈3） ──
  @Put('nudge-suffix')
  @ApiOperation({ summary: '自定义「别人拍我」的后缀文案' })
  async setNudgeSuffix(@CurrentUser('id') userId: string, @Body() body: { suffix?: string }) {
    return this.chatService.setNudgeSuffix(userId, body?.suffix || '');
  }

  @Post(':matchId/nudge')
  @ApiOperation({ summary: '拍一拍（在已确认对话发一条系统消息）' })
  async nudge(@CurrentUser('id') userId: string, @Param('matchId') matchId: string) {
    return this.chatService.nudge(matchId, userId);
  }

  // ─── 获取历史消息（分页） ────────────────────────────────
  @Get(':matchId/messages')
  @ApiOperation({ summary: '获取聊天消息（按时间升序，支持游标分页）' })
  @ApiQuery({ name: 'cursor', required: false, description: '游标（上一页最后一条消息的 ID）' })
  @ApiQuery({ name: 'limit', required: false, description: '每页条数（默认50，最大100）' })
  async getMessages(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(matchId, userId, {
      cursor,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  // ─── 轮询新消息（前端每5秒调用） ─────────────────────────
  @Get(':matchId/messages/poll')
  @ApiOperation({ summary: '轮询新消息（传 afterId 获取该消息之后的所有新消息）' })
  @ApiQuery({ name: 'afterId', required: false, description: '最后一条已知消息的 ID' })
  async pollMessages(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Query('afterId') afterId?: string,
  ) {
    return this.chatService.pollMessages(matchId, userId, afterId);
  }

  // ─── 发送消息 ─────────────────────────────────────────────
  @Post(':matchId/messages')
  @ApiOperation({ summary: '发送消息' })
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(matchId, userId, {
      content: dto.content,
      imageUrl: dto.imageUrl,
    });
  }

  // ─── 标记已读 ─────────────────────────────────────────────
  @Put(':matchId/messages/read')
  @ApiOperation({ summary: '标记当前用户在该对话中的所有消息已读' })
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
  ) {
    return this.chatService.markRead(matchId, userId);
  }

  // ─── 未读数 ──────────────────────────────────────────────
  @Get(':matchId/unread')
  @ApiOperation({ summary: '获取未读消息数量' })
  async getUnreadCount(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
  ) {
    return this.chatService.getUnreadCount(matchId, userId);
  }
}
