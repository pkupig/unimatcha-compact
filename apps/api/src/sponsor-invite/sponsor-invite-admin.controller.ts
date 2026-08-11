import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { SponsorInviteService } from './sponsor-invite.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import { ListQueryDto } from '../common/dto/list-query.dto';
import {
  CreateInviteDto,
  ListInvitesQueryDto,
  ToggleInviteDto,
} from './dto/sponsor-invite.dto';

/** 学生会邀请码后管（B5）：学生会生成/停用本校码，平台侧全量查看 */
@ApiTags('学生会邀请码')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/sponsor-invites')
export class SponsorInviteAdminController {
  constructor(private sponsorInviteService: SponsorInviteService) {}

  @Post()
  @Roles(AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '生成邀请码（学生会；恒绑定本校）' })
  createInvite(@CurrentAdmin() actor: AdminActor, @Body() dto: CreateInviteDto) {
    return this.sponsorInviteService.createInvite(actor, dto);
  }

  @Get()
  @Roles(AdminRole.STUDENT_UNION, AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '邀请码列表（学生会仅本校；平台侧可按 schoolId 筛）' })
  listInvites(@CurrentAdmin() actor: AdminActor, @Query() q: ListInvitesQueryDto) {
    return this.sponsorInviteService.listInvites(actor, q);
  }

  @Patch(':id')
  @Roles(AdminRole.STUDENT_UNION, AdminRole.SUPER)
  @ApiOperation({ summary: '启用/停用邀请码（学生会仅本校，SUPER 任意）' })
  toggleInvite(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: ToggleInviteDto,
  ) {
    return this.sponsorInviteService.toggleInvite(actor, id, dto);
  }

  @Get(':id/uses')
  @Roles(AdminRole.STUDENT_UNION, AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '某码的注册记录（经该码自注册的广告商，分页）' })
  listInviteUses(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Query() q: ListQueryDto,
  ) {
    return this.sponsorInviteService.listInviteUses(actor, id, q);
  }
}
