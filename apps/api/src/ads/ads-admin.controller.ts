import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { AdsService } from './ads.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import {
  CampaignStatsQueryDto,
  ConfirmPaymentDto,
  CreateCampaignDto,
  ListCampaignsQueryDto,
  ReviewCampaignDto,
  SuspendCampaignDto,
  UpdateCampaignDto,
} from './dto/ads.dto';

/**
 * 广告后台控制器（docs/ADMIN-REDESIGN.md §4 ads 路由表）。
 * 角色门禁：@Roles + RolesGuard；范围校验（SPONSOR=own、UNION=本校）在服务层。
 */
@ApiTags('广告管理')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/ads')
export class AdsAdminController {
  constructor(private adsService: AdsService) {}

  // ─── SPONSOR：创建 / 编辑 / 提交 ─────────────────────────────
  @Post('campaigns')
  @Roles(AdminRole.SPONSOR)
  @ApiOperation({ summary: '创建广告草稿（SPONSOR；自拉商家仅可投放本校）' })
  createCampaign(@CurrentAdmin() admin: AdminActor, @Body() dto: CreateCampaignDto) {
    return this.adsService.createCampaign(admin, dto);
  }

  @Put('campaigns/:id')
  @Roles(AdminRole.SPONSOR)
  @ApiOperation({ summary: '编辑广告（own，仅 DRAFT/REJECTED；整体替换投放学校）' })
  updateCampaign(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.adsService.updateCampaign(admin, id, dto);
  }

  @Post('campaigns/:id/submit')
  @Roles(AdminRole.SPONSOR)
  @ApiOperation({ summary: '提交审核（计价快照+算价；自拉→学生会审，直签→平台审）' })
  submitCampaign(@CurrentAdmin() admin: AdminActor, @Param('id') id: string) {
    return this.adsService.submitCampaign(admin, id);
  }

  // ─── 总览 / 列表 / 详情 / 日数据（四角色，按 scope） ──────────
  @Get('overview')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '角色化投放总览（dashboard 用）' })
  getOverview(@CurrentAdmin() admin: AdminActor) {
    return this.adsService.getOverview(admin);
  }

  @Get('campaigns')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '广告列表（SPONSOR=own；UNION=本校相关；TEAM=全部）' })
  listCampaigns(@CurrentAdmin() admin: AdminActor, @Query() q: ListCampaignsQueryDto) {
    return this.adsService.listCampaigns(admin, q);
  }

  @Get('campaigns/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '广告详情（含 placements + 曝光/点击/消耗汇总）' })
  getCampaign(@CurrentAdmin() admin: AdminActor, @Param('id') id: string) {
    return this.adsService.getCampaign(admin, id);
  }

  @Get('campaigns/:id/stats')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '广告日数据（AdDailyStat 日序列 + 分校汇总，scope 同详情）' })
  getCampaignStats(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Query() q: CampaignStatsQueryDto,
  ) {
    return this.adsService.getCampaignStats(admin, id, q.from, q.to);
  }

  // ─── 审核 / 收款 / 状态流转 ──────────────────────────────────
  @Post('campaigns/:id/review')
  @Roles(AdminRole.STUDENT_UNION, AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '审核（学生会审本校自拉单；团队审平台直签单）：通过→待付款，驳回→REJECTED' })
  reviewCampaign(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: ReviewCampaignDto,
  ) {
    return this.adsService.reviewCampaign(admin, id, dto);
  }

  @Post('campaigns/:id/confirm-payment')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '确认收款（线下转账）：→ SCHEDULED / ACTIVE（已到 startDate）' })
  confirmPayment(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.adsService.confirmPayment(admin, id, dto);
  }

  @Post('campaigns/:id/pause')
  @Roles(AdminRole.SPONSOR, AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '暂停投放（SPONSOR own / 团队）：ACTIVE → PAUSED' })
  pauseCampaign(@CurrentAdmin() admin: AdminActor, @Param('id') id: string) {
    return this.adsService.pauseCampaign(admin, id);
  }

  @Post('campaigns/:id/resume')
  @Roles(AdminRole.SPONSOR, AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '恢复投放：PAUSED → ACTIVE / SCHEDULED；已过投放期则 400' })
  resumeCampaign(@CurrentAdmin() admin: AdminActor, @Param('id') id: string) {
    return this.adsService.resumeCampaign(admin, id);
  }

  @Post('campaigns/:id/suspend')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '平台强制下架：SCHEDULED/ACTIVE/PAUSED → SUSPENDED' })
  suspendCampaign(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: SuspendCampaignDto,
  ) {
    return this.adsService.suspendCampaign(admin, id, dto);
  }

  @Post('campaigns/:id/unsuspend')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '解除下架：SUSPENDED → ACTIVE / SCHEDULED；已过期 → COMPLETED（触发结算）' })
  unsuspendCampaign(@CurrentAdmin() admin: AdminActor, @Param('id') id: string) {
    return this.adsService.unsuspendCampaign(admin, id);
  }
}
