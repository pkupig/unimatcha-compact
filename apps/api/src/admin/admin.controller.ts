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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';
import { ConvertSubmissionDto, UpdateSubmissionDto } from './dto/submission.dto';
import { CreateOfficialPostDto } from '../square/dto/square.dto';

// 当前登录后管（来自 admin-jwt 策略写入的 req.user）
type CurrentAdmin = {
  id: string;
  role: AdminRole | null;
  isSuperAdmin: boolean;
  schoolId?: string | null;
};

class UpdateStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'BANNED'] })
  @IsEnum(['ACTIVE', 'BANNED'])
  status: 'ACTIVE' | 'BANNED';
}

class UpdateVerificationDto {
  @ApiProperty({ enum: ['unverified', 'pending', 'verified', 'rejected'] })
  @IsIn(['unverified', 'pending', 'verified', 'rejected'])
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
}

class DeletePostDto {
  @ApiPropertyOptional({ description: '下架理由（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

class UpdateReportStatusDto {
  @ApiProperty({ enum: ['open', 'resolved'], description: 'open → resolved（幂等）' })
  @IsIn(['open', 'resolved'], { message: 'status 参数无效（open / resolved）' })
  status: 'open' | 'resolved';
}

@ApiTags('管理后台')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: '仪表盘统计数据（按角色返回不同 payload：团队/学生会/商家）' })
  getDashboard(@CurrentUser() admin: CurrentAdmin) {
    return this.adminService.getDashboardStats(admin);
  }

  // ─── App Users（SPONSOR 一律 403；学生会自动 scope 本校，ADMIN-REDESIGN §4）──
  @Get('users')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '用户列表（学生会仅本校 profile.school == School.name）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  listUsers(
    @CurrentUser() admin: CurrentAdmin,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listUsers(admin, { page, limit, search, status });
  }

  @Get('users/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '用户详情（含答题记录；学生会仅本校）' })
  getUserDetail(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string) {
    return this.adminService.getUserDetail(admin, id);
  }

  @Patch('users/:id/status')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '封禁/解封用户（学生会仅本校）' })
  updateStatus(
    @CurrentUser() admin: CurrentAdmin,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.adminService.updateUserStatus(admin, id, dto.status);
  }

  @Patch('users/:id/reset-mode')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '重置用户匹配模式（临时对话→过期，已确认关系→解除，状态机回 idle；学生会仅本校）' })
  resetMode(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string) {
    return this.adminService.resetUserMode(admin, id);
  }

  @Patch('users/:id/verification')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '更新用户学生认证状态（unverified/pending/verified/rejected；学生会仅本校）' })
  updateVerification(
    @CurrentUser() admin: CurrentAdmin,
    @Param('id') id: string,
    @Body() dto: UpdateVerificationDto,
  ) {
    return this.adminService.updateUserVerification(admin, id, dto.status);
  }

  // ─── Admin Users（后管账号管理，§8.1.3 + ADMIN-REDESIGN §4） ─────
  // SUPER：任意角色；TEAM：商家/学生会；学生会：仅创建本校自拉商家（服务层强制 scope）
  @Post('admin-users')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '创建后管账号（SUPER 全部 / TEAM 商家+学生会 / 学生会仅本校自拉商家）' })
  createAdminUser(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateAdminUserDto) {
    return this.adminService.createAdminUser(admin, dto);
  }

  @Get('admin-users')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '后管账号列表（分页；学生会仅见本校来源商家，TEAM 见商家+学生会）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'schoolId', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  listAdminUsers(
    @CurrentUser() admin: CurrentAdmin,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('role') role?: string,
    @Query('schoolId') schoolId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.adminService.listAdminUsers(admin, { page, limit, role, schoolId, isActive });
  }

  // 不加 @Roles：任何已登录后管都可打此路由（本人改 name/密码/联系方式，
  // 商家账户页自助维护）；越权字段由服务层拦截
  @Put('admin-users/:id')
  @ApiOperation({ summary: '更新后管账号（SUPER 改权限字段；本人改 name/密码/联系方式；学生会可停启本校来源商家）' })
  updateAdminUser(
    @CurrentUser() admin: CurrentAdmin,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService.updateAdminUser(admin, id, dto);
  }

  @Delete('admin-users/:id')
  @Roles(AdminRole.SUPER)
  @ApiOperation({ summary: '禁用后管账号（仅 SUPER；软删除 isActive=false）' })
  deleteAdminUser(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string) {
    return this.adminService.deleteAdminUser(admin, id);
  }

  // ─── Square 官方发帖 / 广场管理（§8.1.3 + ADMIN-REDESIGN §5.5）──
  @Post('square/posts')
  @ApiOperation({ summary: '官方发帖（按 role/scope 校验 school）' })
  createOfficialPost(@CurrentUser('id') adminId: string, @Body() dto: CreateOfficialPostDto) {
    return this.adminService.createOfficialPost(adminId, dto);
  }

  @Get('square/posts')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '广场帖子管理列表（学生会强制本校；reported=true 过滤被举报帖）' })
  @ApiQuery({ name: 'board', required: false, description: 'RECOMMEND / CAMPUS_WALL' })
  @ApiQuery({ name: 'school', required: false, description: '学校名（仅 SUPER/TEAM 有效）' })
  @ApiQuery({ name: 'status', required: false, description: 'all（默认）/ visible / hidden' })
  @ApiQuery({ name: 'reported', required: false, description: 'true → 仅被举报帖（含自动隐藏）' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listSquarePosts(
    @CurrentUser() admin: CurrentAdmin,
    @Query('board') board?: string,
    @Query('school') school?: string,
    @Query('status') status?: string,
    @Query('reported') reported?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.listSquarePosts(admin, {
      board,
      school,
      status,
      reported,
      search,
      page,
      limit,
    });
  }

  @Delete('square/posts/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '后管下架广场帖（学生会仅本校）' })
  deleteSquarePost(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: DeletePostDto,
  ) {
    return this.adminService.adminDeletePost(adminId, id, dto?.reason);
  }

  @Post('square/posts/:id/restore')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '恢复展示（清 deletedBy/deletedAt/deleteReason；学生会仅本校）' })
  restoreSquarePost(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.adminService.adminRestorePost(adminId, id);
  }

  @Post('square/posts/:id/dismiss-reports')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '清除举报（若为举报自动隐藏则同时恢复展示；学生会仅本校）' })
  dismissSquarePostReports(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.adminService.adminDismissReports(adminId, id);
  }

  // ─── 用户反馈举报队列（Report 表，SUPER/TEAM，§5.5）────────────
  @Get('reports')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '用户反馈举报列表（含提交用户 email/昵称，最新在前）' })
  @ApiQuery({ name: 'status', required: false, description: 'open / resolved' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listReports(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.listReports({ status, page, limit });
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
  @ApiQuery({ name: 'type', required: false, description: 'WAITLIST / SPONSOR' })
  @ApiQuery({ name: 'status', required: false, description: 'PENDING / CONTACTED / APPROVED / REJECTED' })
  @ApiQuery({ name: 'search', required: false, description: '模糊匹配 email / organization' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listSubmissions(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.listSubmissions({ type, status, search, page, limit });
  }

  @Patch('submissions/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '官网提交状态流转（CONTACTED/REJECTED/回 PENDING；APPROVED 只能经开通操作）' })
  updateSubmission(
    @CurrentUser() admin: CurrentAdmin,
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.adminService.updateSubmission(admin, id, dto);
  }

  @Post('submissions/:id/convert')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '一键开通后台账号（学生会/商家；事务内可新建学校；密码一次性回显）' })
  convertSubmission(
    @CurrentUser() admin: CurrentAdmin,
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
  @ApiOperation({ summary: '更新系统配置（仅 SUPER）' })
  updateConfig(@Param('key') key: string, @Body('value') value: any) {
    return this.adminService.updateSystemConfig(key, value);
  }
}
