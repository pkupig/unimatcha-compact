import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { EventsService } from './events.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import { ListQueryDto } from '../common/dto/list-query.dto';
import {
  CreateEventDto,
  UpdateEventStatusDto,
  UpdateEventContentDto,
  CheckinTicketDto,
} from './dto/events.dto';

/** 活动与门票后管（原 AdminController 活动段拆出；学生会本校 / 团队全量） */
@ApiTags('活动管理')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
@Controller('admin/events')
export class EventsAdminController {
  constructor(private eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: '发布活动（同时生成广场活动帖；学生会强制本校）' })
  createEvent(@CurrentAdmin() actor: AdminActor, @Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: '活动列表（学生会仅本校）' })
  listEvents(@CurrentAdmin() actor: AdminActor, @Query() q: ListQueryDto) {
    return this.eventsService.listEvents(actor, q);
  }

  @Patch(':id')
  @ApiOperation({ summary: '活动状态流转（published/closed/cancelled；学生会仅本校）' })
  updateEvent(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateEventStatusDto,
  ) {
    return this.eventsService.updateEventStatus(actor, id, dto.status);
  }

  @Patch(':id/content')
  @ApiOperation({ summary: '编辑活动内容（已售票后票价锁定、容量只可上调；同步广场活动帖）' })
  editEventContent(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateEventContentDto,
  ) {
    return this.eventsService.editEventContent(actor, id, dto);
  }

  @Get(':id/tickets')
  @ApiOperation({ summary: '购票名单（分页；学生会仅本校）' })
  listEventTickets(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Query() q: ListQueryDto,
  ) {
    return this.eventsService.listEventTickets(actor, id, q);
  }

  @Post('checkin')
  @ApiOperation({ summary: '入场核销（按票码，可限定活动；已核销/无效/场次不符返回 400）' })
  checkinTicket(@CurrentAdmin() actor: AdminActor, @Body() dto: CheckinTicketDto) {
    return this.eventsService.checkinTicket(actor, dto.code, dto.eventId);
  }
}
