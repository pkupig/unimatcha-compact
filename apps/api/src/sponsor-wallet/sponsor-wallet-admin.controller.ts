import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { SponsorWalletService } from './sponsor-wallet.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import { AdjustWalletDto, ListLedgerQueryDto, TopupDto } from './dto/sponsor-wallet.dto';

/**
 * 广告商能量钱包控制器（能量经济 2026-08，B1）。
 * SPONSOR：查概览/流水、mock 充值；SUPER/TEAM：手工调整（人工通道）。
 */
@ApiTags('广告商能量钱包')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/sponsor-wallet')
export class SponsorWalletAdminController {
  constructor(private sponsorWalletService: SponsorWalletService) {}

  @Get('summary')
  @Roles(AdminRole.SPONSOR)
  @ApiOperation({ summary: '钱包概览：余额 / 在途锁定 / 累计充值（SPONSOR own）' })
  getSummary(@CurrentAdmin() admin: AdminActor) {
    return this.sponsorWalletService.getSummary(admin);
  }

  @Get('ledger')
  @Roles(AdminRole.SPONSOR)
  @ApiOperation({ summary: '钱包流水（SPONSOR own，可按类型筛选）' })
  listLedger(@CurrentAdmin() admin: AdminActor, @Query() q: ListLedgerQueryDto) {
    return this.sponsorWalletService.listLedger(admin, q);
  }

  @Post('topup')
  @Roles(AdminRole.SPONSOR)
  @ApiOperation({ summary: '充值（MVP mock 即时到账；clientToken 幂等防连点）' })
  topup(@CurrentAdmin() admin: AdminActor, @Body() dto: TopupDto) {
    return this.sponsorWalletService.topup(admin, dto);
  }

  @Post('adjustments')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '手工调整广告商钱包（SUPER/TEAM；SUSPENDED 退款等人工通道）' })
  adjust(@CurrentAdmin() admin: AdminActor, @Body() dto: AdjustWalletDto) {
    return this.sponsorWalletService.adjust(admin, dto);
  }
}
