/* Interface outline: implementation bodies removed. */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RelationshipsService } from './relationships.service';

@UseGuards(JwtAuthGuard)
@Controller('relationships')
export class RelationshipsController {
  constructor(...);
@Get('graph')
  getGraph(@CurrentUser('id') userId: string);
