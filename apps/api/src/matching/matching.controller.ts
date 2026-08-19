/* Interface outline: implementation bodies removed. */
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
class ConnectUserDto {
@UseGuards(JwtAuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(...);
@Post('start')
  async startMatch(@CurrentUser('id') userId: string, @Body() dto: StartMatchDto);
@Post('connect')
  async connect(@CurrentUser('id') userId: string, @Body() dto: ConnectDto);
@Post('connect-user')
  async connectUser(@CurrentUser('id') userId: string, @Body() dto: ConnectUserDto);
@Post('stop')
  async stopMatch(@CurrentUser('id') userId: string, @Query('mode') mode?: string);
@Get('status')
  async getStatus(@CurrentUser('id') userId: string, @Query('mode') mode?: string);
@Get('result')
  async getMyResult(@CurrentUser('id') userId: string, @Query('mode') mode?: string);
@Get('milestones')
  async getMilestones(@CurrentUser('id') userId: string);
@Post(':matchId/confirm-relationship')
  async confirmRelationship(...);
@Post(':matchId/dissolve')
  async dissolve(...);
@Get('preferences')
  async getPreferences(@CurrentUser('id') userId: string, @Query('mode') mode?: string);
@Put('preferences')
  async setPreferences(...);
@Post('feedback/events')
  async reportFeedbackEvents(...);
@Post('confirm')
  async confirmMatch(@CurrentUser('id') userId: string);
@Post('reject')
  async rejectMatch(@CurrentUser('id') userId: string);
@Post('proposals/:proposalId/confirm')
  async confirmProposal(...);
@Post('proposals/:proposalId/reject')
  async rejectProposal(...);
@Post('dissolve')
  async dissolveRelationship(...);
