/* Interface outline: implementation bodies removed. */
import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PurchaseTicketDto } from './dto/events.dto';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(...);
@Get('tickets/mine')
  myTickets(@CurrentUser('id') userId: string);
@Get(':id')
  getEvent(@CurrentUser('id') userId: string, @Param('id') id: string);
@Post(':id/purchase')
  purchase(...);
