/* Interface outline: implementation bodies removed. */
import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('discovery')
export class DiscoveryController {
  constructor(...);
@Get('users')
  async searchUsers(...);
@Get('suggestions')
  async suggestions(@CurrentUser('id') userId: string, @Query('limit') limit?: string);
@Post('suggestions/:userId/dismiss')
  async dismiss(...);
