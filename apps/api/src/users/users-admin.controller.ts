import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { UsersAdminService } from './users-admin.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import { ListQueryDto } from '../common/dto/list-query.dto';
import {
  ListUsersQueryDto,
  UpdateStatusDto,
  UpdateVerificationDto,
  UsersOverviewQueryDto,
} from './dto/users-admin.dto';

/** 用户后管（原 AdminController 用户段拆出；URL 不变；SPONSOR 无权限） */
@ApiTags('用户管理')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private usersAdminService: UsersAdminService) {}

  @Get()
  @ApiOperation({ summary: '用户列表（仅 SUPER/TEAM；学生会不可查看名单）' })
  listUsers(@CurrentAdmin() actor: AdminActor, @Query() q: ListUsersQueryDto) {
    return this.usersAdminService.listUsers(actor, q);
  }

  // 静态路径必须先于 :id 声明，否则被 :id 吞掉
  @Get('overview')
  @ApiOperation({ summary: '用户群体概览（学生会恒本校；SUPER/TEAM 可选 ?school=，不传=全平台）' })
  getOverview(@CurrentAdmin() actor: AdminActor, @Query() q: UsersOverviewQueryDto) {
    return this.usersAdminService.getUsersOverview(actor, q);
  }

  @Get('verifications')
  @ApiOperation({ summary: '学生认证审核队列（pending；受限投影：认证材料 + 昵称/学校/年级；学生会仅本校）' })
  listVerifications(@CurrentAdmin() actor: AdminActor, @Query() q: ListQueryDto) {
    return this.usersAdminService.listVerifications(actor, q);
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情（含答题记录；仅 SUPER/TEAM）' })
  getUserDetail(@CurrentAdmin() actor: AdminActor, @Param('id') id: string) {
    return this.usersAdminService.getUserDetail(actor, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '封禁/解封用户（学生会仅本校）' })
  updateStatus(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.usersAdminService.updateUserStatus(actor, id, dto.status);
  }

  @Patch(':id/reset-mode')
  @ApiOperation({ summary: '重置用户匹配模式（临时对话→过期，已确认关系→解除，状态机回 idle；仅 SUPER/TEAM）' })
  resetMode(@CurrentAdmin() actor: AdminActor, @Param('id') id: string) {
    return this.usersAdminService.resetUserMode(actor, id);
  }

  @Patch(':id/verification')
  @ApiOperation({ summary: '更新用户学生认证状态（unverified/pending/verified/rejected；学生会仅本校）' })
  updateVerification(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateVerificationDto,
  ) {
    return this.usersAdminService.updateUserVerification(actor, id, dto.status, dto.verifiedSchool);
  }
}
