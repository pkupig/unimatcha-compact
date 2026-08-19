/* Interface outline: implementation bodies removed. */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdsService } from './ads.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReportAdEventsDto } from './dto/ads.dto';

@UseGuards(JwtAuthGuard)
@Controller('ads')
export class AdsPublicController {
  constructor(...);
@Get('feed')
  getFeed(@Query('school') school?: string, @Query('limit') limit?: number);
@Post('events')
  reportEvents(@Body() dto: ReportAdEventsDto);
