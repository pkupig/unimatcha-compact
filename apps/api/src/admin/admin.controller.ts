import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import {
  CreateAdminUserDto,
  ListAdminUsersQueryDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto';
import {
  ConvertSubmissionDto,
  ListSubmissionsQueryDto,
  UpdateSubmissionDto,
} from './dto/submission.dto';
import { ListReportsQueryDto, UpdateReportStatusDto } from './dto/report.dto';
import { UpdateSystemConfigDto } from './dto/system-config.dto';

@ApiTags('管理后台')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '仪表盘统计数据（按角色返回不同 payload：团队/学生会/商家）' })
  getDashboard(@CurrentAdmin() admin: AdminActor) {
    return this.adminService.getDashboardStats(admin);
  }

  // ─── Admin Users（后管账号管理，§8.1.3 + ADMIN-REDESIGN §4） ─────
  // SUPER：任意角色；TEAM：商家/学生会；学生会：仅创建本校自拉商家（服务层强制 scope）
  @Post('admin-users')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '创建后管账号（SUPER 全部 / TEAM 商家+学生会 / 学生会仅本校自拉商家）' })
  createAdminUser(@CurrentAdmin() admin: AdminActor, @Body() dto: CreateAdminUserDto) {
    return this.adminService.createAdminUser(admin, dto);
  }

  @Get('admin-users')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '后管账号列表（分页；学生会仅见本校来源商家，TEAM 见商家+学生会）' })
  listAdminUsers(@CurrentAdmin() admin: AdminActor, @Query() q: ListAdminUsersQueryDto) {
    return this.adminService.listAdminUsers(admin, q);
  }

  // 四角色全开（本人改 name/密码/联系方式，商家账户页自助维护）；
  // 越权字段仍由服务层拦截——@Roles 把 role=null 的旧只读账号挡在门外
  @Put('admin-users/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '更新后管账号（SUPER 改权限字段；本人改 name/密码/联系方式；学生会可停启本校来源商家）' })
  updateAdminUser(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService.updateAdminUser(admin, id, dto);
  }

  @Delete('admin-users/:id')
  @Roles(AdminRole.SUPER)
  @ApiOperation({ summary: '禁用后管账号（仅 SUPER；软删除 isActive=false）' })
  deleteAdminUser(@CurrentAdmin() admin: AdminActor, @Param('id') id: string) {
    return this.adminService.deleteAdminUser(admin, id);
  }

  // ─── 用户反馈举报队列（Report 表，SUPER/TEAM，§5.5）────────────
  @Get('reports')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '用户反馈举报列表（含提交用户 email/昵称，最新在前）' })
  listReports(@Query() q: ListReportsQueryDto) {
    return this.adminService.listReports(q);
  }

  @Patch('reports/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '更新举报状态（open → resolved，幂等）' })
  updateReport(@Param('id') id: string, @Body() dto: UpdateReportStatusDto) {
    return this.adminService.updateReportStatus(id, dto.status);
  }

  // ─── 官网提交联动（PublicSubmission，SUPER/TEAM，§5.6）──────────
  @Get('submissions')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '官网提交列表（候补名单/赞助申请，newest first，含 convertedAdmin）' })
  listSubmissions(@Query() q: ListSubmissionsQueryDto) {
    return this.adminService.listSubmissions(q);
  }

  @Patch('submissions/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '官网提交状态流转（CONTACTED/REJECTED/回 PENDING；APPROVED 只能经开通操作）' })
  updateSubmission(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.adminService.updateSubmission(admin, id, dto);
  }

  @Post('submissions/:id/convert')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '一键开通后台账号（学生会/商家；事务内可新建学校；密码一次性回显）' })
  convertSubmission(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: ConvertSubmissionDto,
  ) {
    return this.adminService.convertSubmission(admin, id, dto);
  }

  // ─── System Config（系统配置为 SUPER 专属，ADMIN-REDESIGN §1）─────
  @Get('configs')
  @Roles(AdminRole.SUPER)
  @ApiOperation({ summary: '获取所有系统配置（仅 SUPER）' })
  getConfigs() { return this.adminService.getAllConfigs(); }

  @Put('configs/:key')
  @Roles(AdminRole.SUPER)
  @ApiOperation({ summary: '更新系统配置（仅 SUPER；键白名单，广告计价走专用接口）' })
  updateConfig(@Param('key') key: string, @Body() dto: UpdateSystemConfigDto) {
    return this.adminService.updateSystemConfig(key, dto.value);
  }
}
