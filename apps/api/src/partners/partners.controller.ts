import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { PartnersService } from './partners.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import {
  CreateThreadDto,
  ListPartnerSchoolsQueryDto,
  ListPartnerSponsorsQueryDto,
  ListThreadMessagesQueryDto,
  ListThreadsQueryDto,
  PostThreadMessageDto,
} from './dto/partners.dto';

/**
 * 跨校合作消息线程（B6）：广告商 × 学校洽谈通道。
 * 目录互见（广告商看学校 / 学生会看他校广告商）+ 唯一线程收发 + 未读角标；
 * 平台（SUPER/TEAM）全量只读监管，不可发言。
 */
@ApiTags('合作洽谈')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/partners')
export class PartnersController {
  constructor(private partnersService: PartnersService) {}

  @Get('schools')
  @Roles(AdminRole.SPONSOR)
  @ApiOperation({ summary: '学校目录（广告商侧）：启用中且有活跃学生会入驻，附既有线程 id' })
  listSchools(@CurrentAdmin() admin: AdminActor, @Query() q: ListPartnerSchoolsQueryDto) {
    return this.partnersService.listSchools(admin, q);
  }

  @Get('sponsors')
  @Roles(AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '广告商目录（学生会侧）：他校自拉的活跃广告商，不含联系方式' })
  listSponsors(@CurrentAdmin() admin: AdminActor, @Query() q: ListPartnerSponsorsQueryDto) {
    return this.partnersService.listSponsors(admin, q);
  }

  @Post('threads')
  @Roles(AdminRole.SPONSOR, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '发起洽谈（同一广告商×学校唯一线程，重复发起并入并附 existed:true）' })
  createThread(@CurrentAdmin() admin: AdminActor, @Body() dto: CreateThreadDto) {
    return this.partnersService.createThread(admin, dto);
  }

  @Get('threads')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '线程列表（广告商=本人 / 学生会=本校 / 平台=全量只读），最新消息在前' })
  listThreads(@CurrentAdmin() admin: AdminActor, @Query() q: ListThreadsQueryDto) {
    return this.partnersService.listThreads(admin, q);
  }

  @Get('unread-count')
  @Roles(AdminRole.SPONSOR, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '未读消息总数（角标）：本侧冗余计数按范围汇总' })
  unreadCount(@CurrentAdmin() admin: AdminActor) {
    return this.partnersService.unreadCount(admin);
  }

  @Get('threads/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '线程详情（越权 403）' })
  getThread(@CurrentAdmin() admin: AdminActor, @Param('id') id: string) {
    return this.partnersService.getThread(admin, id);
  }

  @Get('threads/:id/messages')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '消息列表（正序，默认 50 条/页）；当事侧读取即标已读，平台不动计数' })
  listMessages(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Query() q: ListThreadMessagesQueryDto,
  ) {
    return this.partnersService.listMessages(admin, id, q);
  }

  @Post('threads/:id/messages')
  @Roles(AdminRole.SPONSOR, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '发消息（仅当事双方；平台只读监管不可发言）' })
  postMessage(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: PostThreadMessageDto,
  ) {
    return this.partnersService.postMessage(admin, id, dto);
  }
}
