/* Interface outline: implementation bodies removed. */
import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProfileDto } from '../profiles/dto/profile.dto';

class UpdateSettingsDto {
class SendCodeDto {
class SubmitVerificationDto {
class SetNoteDto {
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(...);
@Get('me')
  async getMe(@CurrentUser('id') userId: string);
@Put('me')
  async updateMe(...);
@Get('me/match-status')
  async getMatchStatus(@CurrentUser('id') userId: string);
@Get('me/settings')
  async getSettings(@CurrentUser('id') userId: string);
@Put('me/settings')
  async updateSettings(...);
@Post('me/verification/send-code')
  async sendVerificationCode(@CurrentUser('id') userId: string, @Body() dto: SendCodeDto);
@Post('me/verification/submit')
  async submitVerification(@CurrentUser('id') userId: string, @Body() dto: SubmitVerificationDto);
@Get('me/connect-code')
  async getConnectCode(@CurrentUser('id') userId: string);
@Put('me/notes')
  async setNote(@CurrentUser('id') userId: string, @Body() dto: SetNoteDto);
@Get('search')
  async search(@CurrentUser('id') userId: string, @Query('q') q: string);
@Get(':id/public-profile')
  async getPublicProfile(...);
