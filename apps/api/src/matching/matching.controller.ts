import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { MatchingService } from './matching.service';
import { MatchFeedbackService } from './feedback/match-feedback.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DissolveDto, ReportMatchFeedbackEventsDto, StartMatchDto } from './dto/matching.dto';
import { UpdateMatchPreferencesDto } from './dto/match-preferences.dto';
import { normalizeMode } from './mode.util';

class ConnectDto {
  @IsString()
  code: string;
}

class ConnectUserDto {
  @IsString()
  userId: string;
}

@ApiTags('匹配（用户端）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(
    private matchingService: MatchingService,
    private matchFeedback: MatchFeedbackService,
  ) {}

  @Post('start')
  @ApiOperation({ summary: '用户主动开始匹配（双模式 + 增强）' })
  async startMatch(@CurrentUser('id') userId: string, @Body() dto: StartMatchDto) {
    return this.matchingService.startMatchForUser(userId, normalizeMode(dto?.mode), {
      enhanced: dto?.enhanced,
      cells: dto?.cells,
    });
  }

  @Post('connect')
  @ApiOperation({ summary: '扫码加好友：按连接码建立朋友会话（直接可聊）' })
  async connect(@CurrentUser('id') userId: string, @Body() dto: ConnectDto) {
    return this.matchingService.connectByCode(userId, dto.code);
  }

  @Post('connect-user')
  @ApiOperation({ summary: '搜索加好友：按 userId 直接建立朋友会话（直接可聊，本轮反馈3）' })
  async connectUser(@CurrentUser('id') userId: string, @Body() dto: ConnectUserDto) {
    return this.matchingService.connectByUserId(userId, dto.userId);
  }

  @Post('stop')
  @ApiOperation({ summary: '用户主动停止匹配（按 mode）' })
  @ApiQuery({ name: 'mode', required: false, enum: ['romantic', 'friend'] })
  async stopMatch(@CurrentUser('id') userId: string, @Query('mode') mode?: string) {
    return this.matchingService.stopMatchForUser(userId, normalizeMode(mode));
  }

  @Get('status')
  @ApiOperation({ summary: '获取完整匹配状态（状态机 + 候选/对象 + 下次匹配时间，按 mode）' })
  @ApiQuery({ name: 'mode', required: false, enum: ['romantic', 'friend'] })
  async getStatus(@CurrentUser('id') userId: string, @Query('mode') mode?: string) {
    return this.matchingService.getFullMatchStatus(userId, normalizeMode(mode));
  }

  @Get('result')
  @ApiOperation({ summary: '获取我的匹配结果（含对象公开资料与确认状态，按 mode）' })
  @ApiQuery({ name: 'mode', required: false, enum: ['romantic', 'friend'] })
  async getMyResult(@CurrentUser('id') userId: string, @Query('mode') mode?: string) {
    return this.matchingService.getMyMatchResult(userId, normalizeMode(mode));
  }

  @Get('milestones')
  @ApiOperation({ summary: '获取恋爱里程碑（在一起天数/消息数/动态数/共同兴趣等）' })
  async getMilestones(@CurrentUser('id') userId: string) {
    return this.matchingService.getMilestones(userId);
  }

  // ─── 新接口：在 Chat 对话框内确认成为恋人/朋友（双确认） ─────────
  @Post(':matchId/confirm-relationship')
  @ApiOperation({ summary: '确认成为恋人/朋友（按 match.mode 分流，双方确认才永久）' })
  async confirmRelationship(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
  ) {
    return this.matchingService.confirmRelationship(userId, matchId);
  }

  // ─── 新接口：解除关系（恋人/朋友通用，按 matchId） ───────────────
  @Post(':matchId/dissolve')
  @ApiOperation({ summary: '解除关系（恋人/朋友通用，发通知给对方）' })
  async dissolve(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: DissolveDto,
  ) {
    return this.matchingService.dissolveMatch(userId, matchId, dto?.reason);
  }

  // ─── 匹配偏好（按 mode） ───────────────────────────────────────
  @Get('preferences')
  @ApiOperation({ summary: '获取匹配偏好（按 mode）' })
  @ApiQuery({ name: 'mode', required: false, enum: ['romantic', 'friend'] })
  async getPreferences(@CurrentUser('id') userId: string, @Query('mode') mode?: string) {
    return this.matchingService.getMatchPreferences(userId, normalizeMode(mode));
  }

  @Put('preferences')
  @ApiOperation({ summary: '保存匹配偏好（按 dto.mode）' })
  async setPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMatchPreferencesDto,
  ) {
    return this.matchingService.setMatchPreferences(userId, dto);
  }

  // ─── 行为埋点上报（P0-2，H5 接入为 P1-6） ─────────────────────────
  @Post('feedback/events')
  @ApiOperation({ summary: '批量上报匹配行为事件（viewed/openedProfile，最多 50 条；训练反馈埋点）' })
  async reportFeedbackEvents(
    @CurrentUser('id') userId: string,
    @Body() dto: ReportMatchFeedbackEventsDto,
  ) {
    return this.matchFeedback.ingestClientEvents(userId, dto.events);
  }

  // ─── 旧端点兼容别名（恋人单对象语义） ────────────────────────────
  @Post('confirm')
  @ApiOperation({ summary: '[兼容] 确认当前恋人匹配（无 matchId）' })
  async confirmMatch(@CurrentUser('id') userId: string) {
    return this.matchingService.confirmMatch(userId);
  }

  @Post('reject')
  @ApiOperation({ summary: '[兼容] 拒绝当前恋人匹配' })
  async rejectMatch(@CurrentUser('id') userId: string) {
    return this.matchingService.rejectMatch(userId);
  }

  @Post('proposals/:proposalId/confirm')
  @ApiOperation({ summary: '[兼容] 按 proposalId 确认（转发 confirmRelationship）' })
  async confirmProposal(
    @CurrentUser('id') userId: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.matchingService.confirmProposal(userId, proposalId);
  }

  @Post('proposals/:proposalId/reject')
  @ApiOperation({ summary: '[兼容] 按 proposalId 拒绝（转发 dissolveMatch）' })
  async rejectProposal(
    @CurrentUser('id') userId: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.matchingService.rejectProposal(userId, proposalId);
  }

  @Post('dissolve')
  @ApiOperation({ summary: '[兼容] 解除当前恋爱关系（无 matchId）' })
  async dissolveRelationship(
    @CurrentUser('id') userId: string,
    @Body() dto: DissolveDto,
  ) {
    return this.matchingService.dissolveRelationship(userId, dto?.reason);
  }
}
