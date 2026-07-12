import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { FinanceService } from './finance.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateAdjustmentDto,
  CreateGrantDto,
  CreateWithdrawalDto,
  ReviewWithdrawalDto,
} from './dto/finance.dto';

// 当前登录后管（来自 admin-jwt 策略写入的 req.user）
type CurrentAdmin = {
  id: string;
  role: AdminRole | null;
  schoolId: string | null;
  isSuperAdmin: boolean;
};

@ApiTags('财务管理')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Get('schools/:id/summary')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '学校财务概要（余额/累计收入/冻结 + 分页 ledger 明细；学生会仅本校）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getSchoolSummary(
    @CurrentUser() admin: CurrentAdmin,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.financeService.getSchoolSummary(admin, id, { page, limit });
  }

  @Post('grants')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '发放赞助额度（SPONSOR_GRANT 正数入账）' })
  createGrant(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateGrantDto) {
    return this.financeService.createGrant(admin, dto);
  }

  @Post('adjustments')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '手工调整（ADJUSTMENT 有符号，备注必填）' })
  createAdjustment(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateAdjustmentDto) {
    return this.financeService.createAdjustment(admin, dto);
  }

  @Post('withdrawals')
  @Roles(AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '学生会发起提现（需已绑卡且金额 ≤ 可用余额；快照银行卡）' })
  createWithdrawal(@CurrentUser() admin: CurrentAdmin, @Body() dto: CreateWithdrawalDto) {
    return this.financeService.createWithdrawal(admin, dto);
  }

  @Get('withdrawals')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '提现申请列表（学生会仅本校；status/schoolId 过滤）' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'schoolId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listWithdrawals(
    @CurrentUser() admin: CurrentAdmin,
    @Query('status') status?: string,
    @Query('schoolId') schoolId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.financeService.listWithdrawals(admin, { status, schoolId, page, limit });
  }

  @Post('withdrawals/:id/review')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '审核提现（PENDING → APPROVED / REJECTED）' })
  reviewWithdrawal(
    @CurrentUser() admin: CurrentAdmin,
    @Param('id') id: string,
    @Body() dto: ReviewWithdrawalDto,
  ) {
    return this.financeService.reviewWithdrawal(admin, id, dto);
  }

  @Post('withdrawals/:id/mark-paid')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '标记已打款（APPROVED → PAID + 负数 WITHDRAWAL ledger）' })
  markWithdrawalPaid(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string) {
    return this.financeService.markWithdrawalPaid(admin, id);
  }

  @Get('revenue-report')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '分校收入报表（广告消耗/学校分成/平台留存/赞助/已提现，可选 from/to）' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD（含）' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD（含）' })
  getRevenueReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.financeService.getRevenueReport({ from, to });
  }
}
