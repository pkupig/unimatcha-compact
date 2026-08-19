/* Interface outline: implementation bodies removed. */
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CoupleService } from './couple.service';

class SetStatusDto {
class CravingDto {
class ScheduleDto {
class AnniversaryDto {
class AnniversaryUpdateDto {
class BucketAddDto {
class BucketToggleDto {
class CoverDto {
@UseGuards(JwtAuthGuard)
@Controller('couple')
export class CoupleController {
  constructor(...);
@Get(':matchId')
  getSpace(@CurrentUser('id') userId: string, @Param('matchId') matchId: string);
@Put(':matchId/cover')
  setCover(...);
@Post(':matchId/love-you')
  sendLoveYou(@CurrentUser('id') userId: string, @Param('matchId') matchId: string);
@Put(':matchId/status')
  setStatus(...);
@Post(':matchId/craving')
  addCraving(...);
@Post(':matchId/schedule')
  addSchedule(...);
@Delete(':matchId/schedule/:id')
  deleteSchedule(...);
@Post(':matchId/anniversary')
  addAnniversary(...);
@Patch(':matchId/anniversary/:id')
  updateAnniversary(...);
@Delete(':matchId/anniversary/:id')
  deleteAnniversary(...);
@Post(':matchId/bucket')
  addBucket(...);
@Patch(':matchId/bucket/:id')
  toggleBucket(...);
@Delete(':matchId/bucket/:id')
  deleteBucket(...);
